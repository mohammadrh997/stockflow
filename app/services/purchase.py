from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.purchase import PurchaseOrder, PurchaseOrderLine, PurchaseState
from app.models.partner import Partner
from app.models.product import Product
from app.models.warehouse import Warehouse
from app.models.stock import Transfer, TransferType, TransferState
from app.services.references import next_number, RefSequence
from app.schemas.purchase import (PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderLineCreate, PurchaseOrderLineUpdate)



class PurchaseOrderNotFound(Exception): ...   # 404 (from the URL)
class LineNotFound(Exception): ...            # 404 (from the URL)
class OrderNotEditable(Exception): ...        # 409 (not a draft)
class InvalidReference(Exception): ...        # 400 (bad partner/product/warehouse id in the body)
class OrderHasNoLines(Exception): ...         # 409 (order has no lines)
class OrderNotCancellable(Exception): ...     # 409


def _ensure_draft(order: PurchaseOrder):
    if order.state != PurchaseState.draft:
        raise OrderNotEditable(order.id)

async def _get_supplier(db: AsyncSession, partner_id: int) -> Partner:
    partner = await db.get(Partner, partner_id)
    if partner is None or not partner.is_active:
        raise InvalidReference(f"partner {partner_id} not found or archived")
    partner.is_supplier = True
    return partner

async def _resolve_warehouse(db: AsyncSession, warehouse_id: int | None) -> Warehouse:
    if warehouse_id is not None:
        warehouse = await db.get(Warehouse, warehouse_id)
        if warehouse is None:
            raise InvalidReference(f"warehouse {warehouse_id} not found")
        return warehouse
    
    warehouses = (await db.scalars(select(Warehouse).limit(2))).all()
    if len(warehouses) != 1:
        raise InvalidReference("warehouse_id is required")
    return warehouses[0]

async def _get_product(db: AsyncSession, product_id: int) -> Product:
    product = await db.get(Product, product_id)
    if product is None or not product.is_active:
        raise InvalidReference(f"product {product_id} not found or archived")
    return product

async def _build_line(db: AsyncSession, data: PurchaseOrderLineCreate) -> PurchaseOrderLine:
    product = await _get_product(db, data.product_id)
    price = data.unit_price if data.unit_price is not None else product.cost_price
    return PurchaseOrderLine(product_id=product.id, quantity=data.quantity, unit_price=price)


async def create_purchase_order(db: AsyncSession, data: PurchaseOrderCreate, created_by_id: int) -> PurchaseOrder:
    partner = await _get_supplier(db, data.partner_id)
    warehouse = await _resolve_warehouse(db, data.warehouse_id)
    lines = [await _build_line(db, line) for line in data.lines]
    number = await next_number(db, RefSequence.purchase_order)
    order = PurchaseOrder(
        reference=f"PO{number:05d}",
        partner_id=partner.id,
        warehouse_id=warehouse.id,
        created_by_id=created_by_id,
        lines=lines,
    )
    db.add(order)
    await db.commit()
    return await fetch_purchase_order(db, order.id)

async def fetch_purchase_order(db: AsyncSession, order_id: int) -> PurchaseOrder:
    order = await db.scalar(
        select(PurchaseOrder)
        .where(PurchaseOrder.id == order_id)
        .options(selectinload(PurchaseOrder.lines))
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise PurchaseOrderNotFound(order_id)
    return order

async def _lock_order(db: AsyncSession, order_id: int) -> PurchaseOrder:
    order = await db.scalar(
        select(PurchaseOrder)
        .where(PurchaseOrder.id == order_id)
        .options(selectinload(PurchaseOrder.lines))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise PurchaseOrderNotFound(order_id)
    return order

async def list_purchase_orders(
        db: AsyncSession, 
        state: PurchaseState | None = None, 
        partner_id: int | None = None, 
        skip: int | None = None, 
        limit: int | None = None
        ) -> list[PurchaseOrder]:
    stmt = select(PurchaseOrder).order_by(PurchaseOrder.id)
    if state:
        stmt = stmt.where(PurchaseOrder.state == state)
    if partner_id:
        stmt = stmt.where(PurchaseOrder.partner_id == partner_id)
    if skip:
        stmt = stmt.offset(skip)
    if limit:
        stmt = stmt.limit(limit)
    stmt = stmt.options(selectinload(PurchaseOrder.lines))
    orders = (await db.scalars(stmt)).all()
    return orders


async def update_purchase_order(db: AsyncSession, order_id: int, data: PurchaseOrderUpdate) -> PurchaseOrder:
    order = await _lock_order(db, order_id)
    _ensure_draft(order)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None:
            continue
        if field == "warehouse_id":
            value = (await _resolve_warehouse(db, value)).id
        if field == "partner_id":
            value = (await _get_supplier(db, value)).id
        setattr(order, field, value)
    await db.commit()
    return await fetch_purchase_order(db, order.id)

async def add_line(db: AsyncSession, order_id: int, data: PurchaseOrderLineCreate) -> PurchaseOrder:
    order = await _lock_order(db, order_id)
    _ensure_draft(order)
    order_line = await _build_line(db, data)
    order_line.order_id = order_id
    db.add(order_line)
    await db.commit()
    return await fetch_purchase_order(db, order_id)


async def _fetch_line(db: AsyncSession, order_id: int, line_id: int) -> PurchaseOrderLine:
    line = await db.scalar(
        select(PurchaseOrderLine).where(
            PurchaseOrderLine.id == line_id,
            PurchaseOrderLine.order_id == order_id,
        )
    )
    if line is None:
        raise LineNotFound(line_id)
    return line

async def update_line(db: AsyncSession, order_id: int, line_id: int, data: PurchaseOrderLineUpdate) -> PurchaseOrder:
    order = await _lock_order(db, order_id)
    _ensure_draft(order)
    order_line = await _fetch_line(db, order_id, line_id)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None:
            continue
        setattr(order_line, field, value)
    await db.commit()
    return await fetch_purchase_order(db, order_id)


async def delete_line(db: AsyncSession, order_id: int, line_id: int) -> PurchaseOrder:
    order = await _lock_order(db, order_id)
    _ensure_draft(order)
    order_line = await _fetch_line(db, order_id, line_id)
    await db.delete(order_line)
    await db.commit()
    return await fetch_purchase_order(db, order_id)

async def confirm_purchase_order(db: AsyncSession, order_id: int) -> PurchaseOrder:
    order = await _lock_order(db, order_id)
    _ensure_draft(order)
    if not order.lines:
        raise OrderHasNoLines()
    order.state = PurchaseState.confirmed
    warehouse = await db.get(Warehouse, order.warehouse_id)
    number = await next_number(db, RefSequence.receipt)
    db.add(
        Transfer(
            reference=f"{warehouse.code}/IN/{number:05d}",
            transfer_type=TransferType.receipt,
            warehouse_id=order.warehouse_id,
            purchase_order_id=order.id,
        )
    )
    await db.commit()
    return await fetch_purchase_order(db, order_id)

async def cancel_purchase_order(db: AsyncSession, order_id: int) -> PurchaseOrder:
    order = await _lock_order(db, order_id)
    if order.state not in (PurchaseState.draft, PurchaseState.confirmed):
        raise OrderNotCancellable(order.id)
    if order.state == PurchaseState.confirmed:
        receipt = await db.scalar(
            select(Transfer)
            .where(Transfer.purchase_order_id == order.id, Transfer.state == TransferState.ready)
            .with_for_update()
        )
        if receipt is not None:
            receipt.state = TransferState.cancelled
    order.state = PurchaseState.cancelled
    await db.commit()
    return await fetch_purchase_order(db, order_id)