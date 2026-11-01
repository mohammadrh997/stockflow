from datetime import UTC, datetime
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.purchase import PurchaseState
from app.models.sale import SalesState
from app.models.product import Product
from app.models.stock import StockMove, Transfer, TransferState, TransferType
from app.models.warehouse import Location, LocationType, Warehouse
from app.services.stock import on_hand_by_location
from app.services.purchase import lock_purchase_order
from app.services.warehouse import get_virtual_location
from app.services.common import InvalidReference
from app.services.sale import InsufficientStock, lock_sales_order
from app.services.stock import lock_products, lock_locations
from collections import defaultdict
from app.schemas.stock import AdjustmentCreate, InternalTransferCreate

from app.services.references import RefSequence, next_number

_DONE_TYPES = {
    TransferType.internal: ("INT", RefSequence.internal),
    TransferType.adjustment: ("ADJ", RefSequence.adjustment),
}



class NothingToAdjust(Exception): ...  # 409
class TransferNotFound(Exception): ...  # 404
class TransferNotReady(Exception): ...  # 409


def _transfer_query(transfer_id: int):
    return (
        select(Transfer)
        .where(Transfer.id == transfer_id)
        .options(selectinload(Transfer.moves))
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
    if location is None or location.location_type != LocationType.internal or not location.is_active:
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


async def _resolve_destination(db: AsyncSession, warehouse_id: int, location_id: int | None) -> Location:
    if location_id is None:
        warehouse = await db.get(Warehouse, warehouse_id)
        location_id = warehouse.default_location_id
    location = await db.get(Location, location_id, with_for_update=True)
    if (
        location is None
        or location.location_type != LocationType.internal
        or location.warehouse_id != warehouse_id
        or not location.is_active
    ):
        raise InvalidReference(f"location {location_id} is not an active internal location of this warehouse")
    return location


async def validate_receipt(
    db: AsyncSession, transfer_id: int, location_id: int | None, user_id: int
) -> Transfer:
    transfer = await fetch_transfer(db, transfer_id)
    order = await lock_purchase_order(db, transfer.purchase_order_id)
    transfer = await _lock_transfer(db, transfer_id)
    if transfer.state != TransferState.ready or order.state != PurchaseState.confirmed:
        raise TransferNotReady(f"{transfer.reference} is not ready to validate")
    destination = await _resolve_destination(db, transfer.warehouse_id, location_id)
    supplier = await get_virtual_location(db, LocationType.supplier)
    for line in order.lines:
        db.add(
            StockMove(
                transfer_id=transfer.id,
                product_id=line.product_id,
                quantity=line.quantity,
                from_location_id=supplier.id,
                to_location_id=destination.id,
                purchase_line_id=line.id,
                created_by_id=user_id,
            )
        )
    transfer.state = TransferState.done
    transfer.validated_at = datetime.now(UTC)
    transfer.validated_by_id = user_id
    order.state = PurchaseState.received
    await db.commit()
    return await fetch_transfer(db, transfer_id)

async def validate_delivery(
    db: AsyncSession, transfer_id: int, location_id: int | None, user_id: int
) -> Transfer:
    # Lock order → transfer → locations → products (the same order as confirm and cancel)
    transfer = await fetch_transfer(db, transfer_id)
    order = await lock_sales_order(db, transfer.sales_order_id)
    transfer = await _lock_transfer(db, transfer_id)
    if transfer.state != TransferState.ready or order.state != SalesState.confirmed:
        raise TransferNotReady(f"{transfer.reference} is not ready to validate")

    # Which locations to take from, in priority order
    if location_id is not None:
        chosen = await _resolve_destination(db, transfer.warehouse_id, location_id)
        fixed_order = [chosen.id]
    else:
        warehouse = await db.get(Warehouse, transfer.warehouse_id)
        fixed_order = None

    product_ids = sorted({line.product_id for line in order.lines})
    await lock_products(db, product_ids)

    on_hand: dict[int, dict[int, Decimal]] = {}
    for product_id in product_ids:
        on_hand[product_id] = await on_hand_by_location(db, product_id, transfer.warehouse_id)

    customer = await get_virtual_location(db, LocationType.customer)

    for line in order.lines:
        stock = on_hand[line.product_id]
        if fixed_order is not None:
            location_order = fixed_order
        else:
            others = sorted(loc for loc in stock if loc != warehouse.default_location_id)
            location_order = [warehouse.default_location_id, *others]

        for from_location_id, quantity in _allocate(line.quantity, stock, location_order):
            db.add(
                StockMove(
                    transfer_id=transfer.id,
                    product_id=line.product_id,
                    quantity=quantity,
                    from_location_id=from_location_id,
                    to_location_id=customer.id,
                    sales_line_id=line.id,
                    created_by_id=user_id,
                )
            )

    transfer.state = TransferState.done
    transfer.validated_at = datetime.now(UTC)
    transfer.validated_by_id = user_id
    order.state = SalesState.delivered
    await db.commit()
    return await fetch_transfer(db, transfer_id)


async def validate_transfer(db: AsyncSession, transfer_id: int, location_id: int | None, user_id: int) -> Transfer:
    transfer = await fetch_transfer(db, transfer_id)
    if transfer.transfer_type == TransferType.receipt:
        return await validate_receipt(db, transfer_id, location_id, user_id)
    if transfer.transfer_type == TransferType.delivery:
        return await validate_delivery(db, transfer_id, location_id, user_id)
    raise TransferNotReady(f"{transfer.reference} is created already validated")

async def create_internal_transfer(
    db: AsyncSession, data: InternalTransferCreate, user_id: int
) -> Transfer:
    # Locations: both internal and active, same warehouse, not the same one
    await lock_locations(db, [data.from_location_id, data.to_location_id])
    source = await _get_internal_location(db, data.from_location_id)
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
    warehouse = await db.get(Warehouse, source.warehouse_id)
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

    warehouse = await db.get(Warehouse, location.warehouse_id)
    transfer = await _create_done_transfer(db, TransferType.adjustment, warehouse, user_id)
    for move in moves:
        move.transfer = transfer
        db.add(move)
    await db.commit()
    return await fetch_transfer(db, transfer.id)