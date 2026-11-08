from collections import defaultdict
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.partner import Partner
from app.models.sale import SalesOrder, SalesOrderLine, SalesState
from app.models.stock import Transfer, TransferLine, TransferState, TransferType
from app.schemas.sale import (
    SalesOrderCreate,
    SalesOrderLineCreate,
    SalesOrderLineUpdate,
    SalesOrderUpdate,
)
from app.services.common import (
    InvalidReference,
    LineNotFound,
    OrderHasNoLines,
    OrderNotCancellable,
    OrderNotEditable,
    get_active_product,
    resolve_warehouse,
)
from app.services.references import RefSequence, next_number
from app.services.stock import available_in_warehouse, lock_products
from app.services.warehouse import fetch_warehouse


class SalesOrderNotFound(Exception): ...  # 404 (from the URL)


class InsufficientStock(Exception): ...  # 409


def _ensure_draft(order: SalesOrder):
    if order.state != SalesState.draft:
        raise OrderNotEditable(order.id)


async def _get_customer(db: AsyncSession, partner_id: int) -> Partner:
    partner = await db.get(Partner, partner_id)
    if partner is None or not partner.is_active:
        raise InvalidReference(f"partner {partner_id} not found or archived")
    partner.is_customer = True
    return partner


async def _build_line(db: AsyncSession, data: SalesOrderLineCreate) -> SalesOrderLine:
    product = await get_active_product(db, data.product_id)
    price = data.unit_price if data.unit_price is not None else product.sale_price
    return SalesOrderLine(product_id=product.id, quantity=data.quantity, unit_price=price)


async def create_sales_order(
    db: AsyncSession, data: SalesOrderCreate, created_by_id: int
) -> SalesOrder:
    partner = await _get_customer(db, data.partner_id)
    warehouse = await resolve_warehouse(db, data.warehouse_id)
    lines = [await _build_line(db, line) for line in data.lines]
    number = await next_number(db, RefSequence.sales_order)
    order = SalesOrder(
        reference=f"SO{number:05d}",
        partner_id=partner.id,
        warehouse_id=warehouse.id,
        created_by_id=created_by_id,
        lines=lines,
    )
    db.add(order)
    await db.commit()
    return await fetch_sales_order(db, order.id)


async def fetch_sales_order(db: AsyncSession, order_id: int) -> SalesOrder:
    order = await db.scalar(
        select(SalesOrder)
        .where(SalesOrder.id == order_id)
        .options(selectinload(SalesOrder.lines))
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise SalesOrderNotFound(order_id)
    return order


async def lock_sales_order(db: AsyncSession, order_id: int) -> SalesOrder:
    order = await db.scalar(
        select(SalesOrder)
        .where(SalesOrder.id == order_id)
        .options(selectinload(SalesOrder.lines))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise SalesOrderNotFound(order_id)
    return order


async def list_sales_orders(
    db: AsyncSession,
    state: SalesState | None = None,
    partner_id: int | None = None,
    skip: int | None = None,
    limit: int | None = None,
) -> Sequence[SalesOrder]:
    stmt = select(SalesOrder).order_by(SalesOrder.id)
    if state:
        stmt = stmt.where(SalesOrder.state == state)
    if partner_id:
        stmt = stmt.where(SalesOrder.partner_id == partner_id)
    if skip:
        stmt = stmt.offset(skip)
    if limit:
        stmt = stmt.limit(limit)
    stmt = stmt.options(selectinload(SalesOrder.lines))
    orders = (await db.scalars(stmt)).all()
    return orders


async def update_sales_order(db: AsyncSession, order_id: int, data: SalesOrderUpdate) -> SalesOrder:
    order = await lock_sales_order(db, order_id)
    _ensure_draft(order)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None:
            continue
        if field == "warehouse_id":
            value = (await resolve_warehouse(db, value)).id
        if field == "partner_id":
            value = (await _get_customer(db, value)).id
        setattr(order, field, value)
    await db.commit()
    return await fetch_sales_order(db, order.id)


async def add_line(db: AsyncSession, order_id: int, data: SalesOrderLineCreate) -> SalesOrder:
    order = await lock_sales_order(db, order_id)
    _ensure_draft(order)
    order_line = await _build_line(db, data)
    order_line.order_id = order_id
    db.add(order_line)
    await db.commit()
    return await fetch_sales_order(db, order_id)


async def _fetch_line(db: AsyncSession, order_id: int, line_id: int) -> SalesOrderLine:
    line = await db.scalar(
        select(SalesOrderLine).where(
            SalesOrderLine.id == line_id,
            SalesOrderLine.order_id == order_id,
        )
    )
    if line is None:
        raise LineNotFound(line_id)
    return line


async def update_line(
    db: AsyncSession, order_id: int, line_id: int, data: SalesOrderLineUpdate
) -> SalesOrder:
    order = await lock_sales_order(db, order_id)
    _ensure_draft(order)
    order_line = await _fetch_line(db, order_id, line_id)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None:
            continue
        setattr(order_line, field, value)
    await db.commit()
    return await fetch_sales_order(db, order_id)


async def delete_line(db: AsyncSession, order_id: int, line_id: int) -> SalesOrder:
    order = await lock_sales_order(db, order_id)
    _ensure_draft(order)
    order_line = await _fetch_line(db, order_id, line_id)
    await db.delete(order_line)
    await db.commit()
    return await fetch_sales_order(db, order_id)


async def confirm_sales_order(db: AsyncSession, order_id: int) -> SalesOrder:
    order = await lock_sales_order(db, order_id)
    _ensure_draft(order)
    if not order.lines:
        raise OrderHasNoLines()

    requested: dict[int, Decimal] = defaultdict(Decimal)
    for line in order.lines:
        requested[line.product_id] += line.quantity

    await lock_products(db, requested)

    shortages = []
    for product_id, quantity in requested.items():
        available = await available_in_warehouse(db, product_id, order.warehouse_id)
        if available < quantity:
            shortages.append(f"product {product_id}: requested {quantity}, available {available}")
    if shortages:
        raise InsufficientStock("; ".join(shortages))

    order.state = SalesState.confirmed
    warehouse = await fetch_warehouse(db, order.warehouse_id)
    number = await next_number(db, RefSequence.delivery)
    db.add(
        Transfer(
            reference=f"{warehouse.code}/OUT/{number:05d}",
            transfer_type=TransferType.delivery,
            warehouse_id=order.warehouse_id,
            sales_order_id=order.id,
            lines=[
                TransferLine(
                    product_id=line.product_id, quantity=line.quantity, sales_line_id=line.id
                )
                for line in order.lines
            ],
        )
    )
    await db.commit()
    return await fetch_sales_order(db, order_id)


async def cancel_sales_order(db: AsyncSession, order_id: int) -> SalesOrder:
    order = await lock_sales_order(db, order_id)
    if order.state not in (SalesState.draft, SalesState.confirmed):
        raise OrderNotCancellable(order.id)
    if order.state == SalesState.confirmed:
        delivery = await db.scalar(
            select(Transfer)
            .where(Transfer.sales_order_id == order.id, Transfer.state == TransferState.ready)
            .with_for_update()
        )
        if delivery is not None:
            delivery.state = TransferState.cancelled
    order.state = SalesState.cancelled
    await db.commit()
    return await fetch_sales_order(db, order_id)
