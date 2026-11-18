from sqlalchemy import exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.partner import Partner
from app.models.purchase import PurchaseOrder, PurchaseOrderLine, PurchaseState
from app.models.stock import Transfer, TransferLine, TransferState, TransferType
from app.schemas.purchase import (
    PurchaseOrderCreate,
    PurchaseOrderLineCreate,
    PurchaseOrderLineUpdate,
    PurchaseOrderUpdate,
)
from app.services.common import (
    DuplicatePartnerReference,
    InvalidReference,
    LineNotFound,
    OrderHasNoLines,
    OrderNotCancellable,
    OrderNotEditable,
    Page,
    get_active_product,
    paginate,
    resolve_warehouse,
)
from app.services.references import RefSequence, next_number
from app.services.warehouse import fetch_warehouse


class PurchaseOrderNotFound(Exception): ...  # 404 (from the URL)


def _ensure_draft(order: PurchaseOrder):
    if order.state != PurchaseState.draft:
        raise OrderNotEditable(order.id)


async def _get_supplier(db: AsyncSession, partner_id: int) -> Partner:
    partner = await db.get(Partner, partner_id)
    if partner is None or not partner.is_active:
        raise InvalidReference(f"partner {partner_id} not found or archived")
    partner.is_supplier = True
    return partner


async def _ensure_reference_free(db: AsyncSession, order: PurchaseOrder) -> None:
    """The nice error for a reused supplier reference. The unique index is what guarantees
    it; this only says which order already has it."""
    if order.partner_reference is None:
        return
    stmt = select(PurchaseOrder.reference).where(
        PurchaseOrder.partner_id == order.partner_id,
        func.lower(PurchaseOrder.partner_reference) == func.lower(order.partner_reference),
        PurchaseOrder.state != PurchaseState.cancelled,
    )
    if order.id is not None:
        stmt = stmt.where(PurchaseOrder.id != order.id)
    with db.no_autoflush:  # not yet: the order's pending change is what's being checked
        taken = await db.scalar(stmt.limit(1))
    if taken is not None:
        raise DuplicatePartnerReference(
            f"this supplier's reference {order.partner_reference} is already on {taken}"
        )


async def save_order(db: AsyncSession, order: PurchaseOrder, commit: bool = True) -> None:
    """Commits, or with commit=False only flushes (to get the order's id inside a larger
    change). Either way, a supplier reference taken in the meantime becomes a clean 409."""
    try:
        await (db.commit() if commit else db.flush())
    except IntegrityError as exc:
        # Two requests passed the check at once; the index let only one through
        await db.rollback()
        if "uq_purchase_orders_partner_reference" in str(exc.orig):
            raise DuplicatePartnerReference(
                f"this supplier's reference {order.partner_reference} is already in use"
            ) from None
        raise


async def _build_line(db: AsyncSession, data: PurchaseOrderLineCreate) -> PurchaseOrderLine:
    product = await get_active_product(db, data.product_id)
    price = data.unit_price if data.unit_price is not None else product.cost_price
    return PurchaseOrderLine(product_id=product.id, quantity=data.quantity, unit_price=price)


async def create_purchase_order(
    db: AsyncSession, data: PurchaseOrderCreate, created_by_id: int
) -> PurchaseOrder:
    order = await add_purchase_order(db, data, created_by_id)
    await save_order(db, order)
    return await fetch_purchase_order(db, order.id)


async def add_purchase_order(
    db: AsyncSession, data: PurchaseOrderCreate, created_by_id: int
) -> PurchaseOrder:
    """Checks and adds a new order, with its id, but doesn't commit: the caller saves it,
    together with anything that has to be saved at the same time (see bill imports)."""
    partner = await _get_supplier(db, data.partner_id)
    warehouse = await resolve_warehouse(db, data.warehouse_id)
    lines = [await _build_line(db, line) for line in data.lines]
    number = await next_number(db, RefSequence.purchase_order)
    order = PurchaseOrder(
        reference=f"PO{number:05d}",
        partner_id=partner.id,
        partner_reference=data.partner_reference,
        warehouse_id=warehouse.id,
        created_by_id=created_by_id,
        lines=lines,
    )
    await _ensure_reference_free(db, order)
    db.add(order)
    await save_order(db, order, commit=False)
    return order


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


async def lock_purchase_order(db: AsyncSession, order_id: int) -> PurchaseOrder:
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
    skip: int,
    limit: int,
    state: PurchaseState | None = None,
    partner_id: int | None = None,
    exclude_cancelled: bool = False,
    product_id: int | None = None,
) -> Page[PurchaseOrder]:
    stmt = select(PurchaseOrder).order_by(PurchaseOrder.id)
    if state:
        stmt = stmt.where(PurchaseOrder.state == state)
    if exclude_cancelled:
        stmt = stmt.where(PurchaseOrder.state != PurchaseState.cancelled)
    if partner_id:
        stmt = stmt.where(PurchaseOrder.partner_id == partner_id)
    if product_id is not None:
        # Orders with at least one line for this product
        stmt = stmt.where(
            exists().where(
                PurchaseOrderLine.order_id == PurchaseOrder.id,
                PurchaseOrderLine.product_id == product_id,
            )
        )
    return await paginate(db, stmt.options(selectinload(PurchaseOrder.lines)), skip, limit)


async def update_purchase_order(
    db: AsyncSession, order_id: int, data: PurchaseOrderUpdate
) -> PurchaseOrder:
    order = await lock_purchase_order(db, order_id)
    _ensure_draft(order)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None and field != "partner_reference":  # null clears the reference
            continue
        if field == "warehouse_id":
            value = (await resolve_warehouse(db, value)).id
        if field == "partner_id":
            value = (await _get_supplier(db, value)).id
        setattr(order, field, value)
    # a new reference, or the same one moved to another supplier
    if {"partner_reference", "partner_id"} & data.model_fields_set:
        await _ensure_reference_free(db, order)
    await save_order(db, order)
    return await fetch_purchase_order(db, order.id)


async def add_line(db: AsyncSession, order_id: int, data: PurchaseOrderLineCreate) -> PurchaseOrder:
    order = await lock_purchase_order(db, order_id)
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


async def update_line(
    db: AsyncSession, order_id: int, line_id: int, data: PurchaseOrderLineUpdate
) -> PurchaseOrder:
    order = await lock_purchase_order(db, order_id)
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
    order = await lock_purchase_order(db, order_id)
    _ensure_draft(order)
    order_line = await _fetch_line(db, order_id, line_id)
    await db.delete(order_line)
    await db.commit()
    return await fetch_purchase_order(db, order_id)


async def confirm_purchase_order(db: AsyncSession, order_id: int) -> PurchaseOrder:
    order = await lock_purchase_order(db, order_id)
    _ensure_draft(order)
    if not order.lines:
        raise OrderHasNoLines()
    order.state = PurchaseState.confirmed
    warehouse = await fetch_warehouse(db, order.warehouse_id)
    number = await next_number(db, RefSequence.receipt)
    db.add(
        Transfer(
            reference=f"{warehouse.code}/IN/{number:05d}",
            transfer_type=TransferType.receipt,
            warehouse_id=order.warehouse_id,
            purchase_order_id=order.id,
            lines=[
                TransferLine(
                    product_id=line.product_id, quantity=line.quantity, purchase_line_id=line.id
                )
                for line in order.lines
            ],
        )
    )
    await db.commit()
    return await fetch_purchase_order(db, order_id)


async def cancel_purchase_order(db: AsyncSession, order_id: int) -> PurchaseOrder:
    order = await lock_purchase_order(db, order_id)
    if order.state not in (PurchaseState.draft, PurchaseState.confirmed):
        raise OrderNotCancellable(
            f"{order.reference} is {order.state}; only draft or confirmed orders can be cancelled"
        )
    if order.state == PurchaseState.confirmed:
        moved = await db.scalar(
            select(Transfer.id)
            .where(Transfer.purchase_order_id == order.id, Transfer.state == TransferState.done)
            .limit(1)
        )
        if moved is not None:
            raise OrderNotCancellable(
                f"{order.reference} has already started moving; cancel its backorder instead"
            )
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
