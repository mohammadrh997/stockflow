from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.models.purchase import PurchaseOrder, PurchaseState
from app.models.sale import SalesOrder, SalesState
from app.models.stock import StockMove, Transfer, TransferLine, TransferState, TransferType
from app.models.warehouse import Location, LocationType, Warehouse
from app.schemas.stock import AdjustmentCreate, InternalTransferCreate, TransferLineDone
from app.services.common import InvalidReference
from app.services.purchase import lock_purchase_order
from app.services.references import RefSequence, next_number
from app.services.sale import InsufficientStock, lock_sales_order
from app.services.stock import lock_locations, lock_products, on_hand_by_location
from app.services.warehouse import fetch_warehouse, get_virtual_location

_DONE_TYPES = {
    TransferType.internal: ("INT", RefSequence.internal),
    TransferType.adjustment: ("ADJ", RefSequence.adjustment),
}


class NothingToAdjust(Exception): ...  # 409


class TransferNotFound(Exception): ...  # 404


class TransferNotReady(Exception): ...  # 409


class NothingToValidate(Exception): ...  # 409


class QuantityExceedsLine(Exception): ...  # 409


class TransferNotCancellable(Exception): ...  # 409


def _transfer_query(transfer_id: int):
    return (
        select(Transfer)
        .where(Transfer.id == transfer_id)
        .options(selectinload(Transfer.moves), selectinload(Transfer.lines))
        .execution_options(populate_existing=True)
    )


def _allocate(
    needed: Decimal,
    on_hand: dict[int, Decimal],
    location_order: list[int],
) -> list[tuple[int, Decimal]]:
    picks = []
    for location_id in location_order:
        if needed == 0:
            break
        take = min(needed, on_hand.get(location_id, Decimal("0")))
        if take > 0:
            picks.append((location_id, take))
            on_hand[location_id] -= take
            needed -= take
    if needed > 0:
        raise InsufficientStock("not enough stock in the chosen location(s)")
    return picks


async def _create_done_transfer(
    db: AsyncSession, transfer_type: TransferType, warehouse: Warehouse, user_id: int
) -> Transfer:
    prefix, sequence = _DONE_TYPES[transfer_type]
    number = await next_number(db, sequence)
    transfer = Transfer(
        reference=f"{warehouse.code}/{prefix}/{number:05d}",
        transfer_type=transfer_type,
        state=TransferState.done,
        warehouse_id=warehouse.id,
        validated_at=datetime.now(UTC),
        validated_by_id=user_id,
    )
    db.add(transfer)
    return transfer


async def _get_internal_location(db: AsyncSession, location_id: int) -> Location:
    location = await db.get(Location, location_id, with_for_update=True)
    if (
        location is None
        or location.location_type != LocationType.internal
        or not location.is_active
    ):
        raise InvalidReference(f"location {location_id} is not an active internal location")
    return location


async def _ensure_products_exist(db: AsyncSession, product_ids: set[int]) -> None:
    found = set((await db.scalars(select(Product.id).where(Product.id.in_(product_ids)))).all())
    missing = product_ids - found
    if missing:
        raise InvalidReference(f"products not found: {sorted(missing)}")


async def fetch_transfer(db: AsyncSession, transfer_id: int) -> Transfer:
    transfer = await db.scalar(_transfer_query(transfer_id))
    if transfer is None:
        raise TransferNotFound(transfer_id)
    return transfer


async def _lock_transfer(db: AsyncSession, transfer_id: int) -> Transfer:
    transfer = await db.scalar(_transfer_query(transfer_id).with_for_update())
    if transfer is None:
        raise TransferNotFound(transfer_id)
    return transfer


async def _resolve_destination(
    db: AsyncSession, warehouse_id: int, location_id: int | None
) -> Location:
    if location_id is None:
        warehouse = await fetch_warehouse(db, warehouse_id)
        location_id = warehouse.default_location_id
    location = await db.get(Location, location_id, with_for_update=True)
    if (
        location is None
        or location.location_type != LocationType.internal
        or location.warehouse_id != warehouse_id
        or not location.is_active
    ):
        raise InvalidReference(
            f"location {location_id} is not an active internal location of this warehouse"
        )
    return location


def _done_quantities(transfer: Transfer, done: list[TransferLineDone] | None) -> dict[int, Decimal]:
    """How much of each transfer line moves now, by line id."""
    if done is None:  # nothing given: everything moves
        return {line.id: line.quantity for line in transfer.lines}

    lines = {line.id: line for line in transfer.lines}
    quantities = {line_id: Decimal("0") for line_id in lines}  # lines not listed move 0
    for item in done:
        line = lines.get(item.line_id)
        if line is None:
            raise InvalidReference(f"line {item.line_id} is not on {transfer.reference}")
        if item.quantity > line.quantity:
            raise QuantityExceedsLine(f"line {line.id}: at most {line.quantity} can move")
        quantities[line.id] = item.quantity
    if not any(quantities.values()):
        raise NothingToValidate(f"nothing to move on {transfer.reference}")
    return quantities


async def _close_transfer(
    db: AsyncSession, transfer: Transfer, done: dict[int, Decimal], user_id: int
) -> bool:
    """Mark the transfer done with what moved; put the rest on a backorder.

    Returns True when everything moved (no backorder was needed).
    """
    remaining = []
    for line in list(transfer.lines):
        rest = line.quantity - done[line.id]
        if rest > 0:
            remaining.append(
                TransferLine(
                    product_id=line.product_id,
                    quantity=rest,
                    sales_line_id=line.sales_line_id,
                    purchase_line_id=line.purchase_line_id,
                )
            )
        if done[line.id] == 0:
            transfer.lines.remove(line)  # delete-orphan removes the row
        else:
            line.quantity = done[line.id]  # the done document lists what it moved

    transfer.state = TransferState.done
    transfer.validated_at = datetime.now(UTC)
    transfer.validated_by_id = user_id

    if remaining:
        prefix, sequence = (
            ("IN", RefSequence.receipt)
            if transfer.transfer_type == TransferType.receipt
            else ("OUT", RefSequence.delivery)
        )
        warehouse = await fetch_warehouse(db, transfer.warehouse_id)
        number = await next_number(db, sequence)
        db.add(
            Transfer(
                reference=f"{warehouse.code}/{prefix}/{number:05d}",
                transfer_type=transfer.transfer_type,
                warehouse_id=transfer.warehouse_id,
                purchase_order_id=transfer.purchase_order_id,
                sales_order_id=transfer.sales_order_id,
                backorder_of_id=transfer.id,
                lines=remaining,
            )
        )
    return not remaining


async def validate_receipt(
    db: AsyncSession,
    transfer_id: int,
    location_id: int | None,
    done: list[TransferLineDone] | None,
    user_id: int,
) -> Transfer:
    # Lock order -> transfer -> location (the same order everywhere)
    transfer = await fetch_transfer(db, transfer_id)
    if transfer.purchase_order_id is None:
        raise TransferNotReady(f"{transfer.reference} has no purchase order")
    order = await lock_purchase_order(db, transfer.purchase_order_id)
    transfer = await _lock_transfer(db, transfer_id)
    if transfer.state != TransferState.ready or order.state != PurchaseState.confirmed:
        raise TransferNotReady(f"{transfer.reference} is not ready to validate")

    quantities = _done_quantities(transfer, done)
    destination = await _resolve_destination(db, transfer.warehouse_id, location_id)
    supplier = await get_virtual_location(db, LocationType.supplier)
    for line in transfer.lines:
        if quantities[line.id] > 0:
            db.add(
                StockMove(
                    transfer_id=transfer.id,
                    product_id=line.product_id,
                    quantity=quantities[line.id],
                    from_location_id=supplier.id,
                    to_location_id=destination.id,
                    purchase_line_id=line.purchase_line_id,
                    created_by_id=user_id,
                )
            )

    if await _close_transfer(db, transfer, quantities, user_id):
        order.state = PurchaseState.received
    await db.commit()
    return await fetch_transfer(db, transfer_id)


async def validate_delivery(
    db: AsyncSession,
    transfer_id: int,
    location_id: int | None,
    done: list[TransferLineDone] | None,
    user_id: int,
) -> Transfer:
    # Lock order -> transfer -> locations -> products (the same order as confirm and cancel)
    transfer = await fetch_transfer(db, transfer_id)
    if transfer.sales_order_id is None:
        raise TransferNotReady(f"{transfer.reference} has no sales order")
    order = await lock_sales_order(db, transfer.sales_order_id)
    transfer = await _lock_transfer(db, transfer_id)
    if transfer.state != TransferState.ready or order.state != SalesState.confirmed:
        raise TransferNotReady(f"{transfer.reference} is not ready to validate")

    quantities = _done_quantities(transfer, done)
    moving = [line for line in transfer.lines if quantities[line.id] > 0]

    # Which locations to take from, in priority order
    if location_id is not None:
        chosen = await _resolve_destination(db, transfer.warehouse_id, location_id)
        fixed_order: list[int] | None = [chosen.id]
    else:
        warehouse = await fetch_warehouse(db, transfer.warehouse_id)
        fixed_order = None

    product_ids = sorted({line.product_id for line in moving})
    await lock_products(db, product_ids)
    on_hand = {
        product_id: await on_hand_by_location(db, product_id, transfer.warehouse_id)
        for product_id in product_ids
    }
    customer = await get_virtual_location(db, LocationType.customer)

    for line in moving:
        stock = on_hand[line.product_id]
        if fixed_order is not None:
            location_order = fixed_order
        else:
            assert warehouse.default_location_id is not None  # set when the warehouse is created
            others = sorted(loc for loc in stock if loc != warehouse.default_location_id)
            location_order = [warehouse.default_location_id, *others]

        for from_location_id, quantity in _allocate(quantities[line.id], stock, location_order):
            db.add(
                StockMove(
                    transfer_id=transfer.id,
                    product_id=line.product_id,
                    quantity=quantity,
                    from_location_id=from_location_id,
                    to_location_id=customer.id,
                    sales_line_id=line.sales_line_id,
                    created_by_id=user_id,
                )
            )

    if await _close_transfer(db, transfer, quantities, user_id):
        order.state = SalesState.delivered
    await db.commit()
    return await fetch_transfer(db, transfer_id)


async def validate_transfer(
    db: AsyncSession,
    transfer_id: int,
    location_id: int | None,
    done: list[TransferLineDone] | None,
    user_id: int,
) -> Transfer:
    transfer = await fetch_transfer(db, transfer_id)
    if transfer.transfer_type == TransferType.receipt:
        return await validate_receipt(db, transfer_id, location_id, done, user_id)
    if transfer.transfer_type == TransferType.delivery:
        return await validate_delivery(db, transfer_id, location_id, done, user_id)
    raise TransferNotReady(f"{transfer.reference} is created already validated")


async def cancel_backorder(db: AsyncSession, transfer_id: int) -> Transfer:
    """Drop what's left of an order: cancel its backorder and close the order."""
    # Lock order -> transfer (the same order as validation)
    transfer = await fetch_transfer(db, transfer_id)
    sales_order: SalesOrder | None = None
    purchase_order: PurchaseOrder | None = None
    if transfer.sales_order_id is not None:
        sales_order = await lock_sales_order(db, transfer.sales_order_id)
    elif transfer.purchase_order_id is not None:
        purchase_order = await lock_purchase_order(db, transfer.purchase_order_id)
    transfer = await _lock_transfer(db, transfer_id)

    if transfer.state != TransferState.ready:
        raise TransferNotCancellable(f"{transfer.reference} is {transfer.state}, not ready")
    if transfer.backorder_of_id is None:
        raise TransferNotCancellable(
            f"{transfer.reference} is not a backorder; cancel its order instead"
        )

    transfer.state = TransferState.cancelled
    if sales_order is not None:
        sales_order.state = SalesState.delivered  # closed with what actually shipped
    if purchase_order is not None:
        purchase_order.state = PurchaseState.received
    await db.commit()
    return await fetch_transfer(db, transfer_id)


async def create_internal_transfer(
    db: AsyncSession, data: InternalTransferCreate, user_id: int
) -> Transfer:
    # Locations: both internal and active, same warehouse, not the same one
    await lock_locations(db, [data.from_location_id, data.to_location_id])
    source = await _get_internal_location(db, data.from_location_id)
    assert source.warehouse_id is not None
    destination = await _resolve_destination(db, source.warehouse_id, data.to_location_id)
    if source.id == destination.id:
        raise InvalidReference("source and destination must be different locations")

    # Total per product (two lines of the same product add up)
    requested: dict[int, Decimal] = defaultdict(Decimal)
    for line in data.lines:
        requested[line.product_id] += line.quantity
    await _ensure_products_exist(db, set(requested))

    # Lock, then check the source holds enough
    await lock_products(db, requested)
    shortages = []
    for product_id, quantity in requested.items():
        stock = await on_hand_by_location(db, product_id, source.warehouse_id)
        at_source = stock.get(source.id, Decimal("0"))
        if at_source < quantity:
            shortages.append(f"product {product_id}: requested {quantity}, at source {at_source}")
    if shortages:
        raise InsufficientStock("; ".join(shortages))

    # The document and its moves, saved together
    warehouse = await fetch_warehouse(db, source.warehouse_id)
    transfer = await _create_done_transfer(db, TransferType.internal, warehouse, user_id)
    for line in data.lines:
        db.add(
            StockMove(
                transfer=transfer,
                product_id=line.product_id,
                quantity=line.quantity,
                from_location_id=source.id,
                to_location_id=destination.id,
                note=data.note,
                created_by_id=user_id,
            )
        )
    await db.commit()
    return await fetch_transfer(db, transfer.id)


async def create_adjustment(db: AsyncSession, data: AdjustmentCreate, user_id: int) -> Transfer:
    location = await _get_internal_location(db, data.location_id)
    product_ids = {line.product_id for line in data.lines}
    await _ensure_products_exist(db, product_ids)

    # Lock first, so on hand can't change between reading it and correcting it
    await lock_products(db, product_ids)
    loss = await get_virtual_location(db, LocationType.loss)

    moves = []
    for line in data.lines:
        assert location.warehouse_id is not None  # internal locations always belong to a warehouse
        stock = await on_hand_by_location(db, line.product_id, location.warehouse_id)
        current = stock.get(location.id, Decimal("0"))
        difference = line.counted_quantity - current
        if difference == 0:
            continue
        if difference > 0:  # found more than recorded: Loss → location
            from_id, to_id, quantity = loss.id, location.id, difference
        else:  # found less than recorded: location → Loss
            from_id, to_id, quantity = location.id, loss.id, -difference
        moves.append(
            StockMove(
                product_id=line.product_id,
                quantity=quantity,
                from_location_id=from_id,
                to_location_id=to_id,
                note=data.note,
                created_by_id=user_id,
            )
        )

    if not moves:
        raise NothingToAdjust("counted quantities match current stock")
    assert location.warehouse_id is not None  # internal locations always belong to a warehouse
    warehouse = await fetch_warehouse(db, location.warehouse_id)
    transfer = await _create_done_transfer(db, TransferType.adjustment, warehouse, user_id)
    for move in moves:
        move.transfer = transfer
        db.add(move)
    await db.commit()
    return await fetch_transfer(db, transfer.id)