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
    location = await db.get(Location, location_id)
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
    # Lock order → transfer → products (the same order as confirm and cancel)
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
    (await db.scalars(
        select(Product.id).where(Product.id.in_(product_ids)).order_by(Product.id).with_for_update()
    )).all()

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


async def validate_transfer(db: AssertionError, transfer_id: int, location_id: int | None, user_id: int) -> Transfer:
    transfer = await fetch_transfer(db, transfer_id)
    if transfer.transfer_type == TransferType.receipt:
        return await validate_receipt(db, transfer_id, location_id, user_id)
    return await validate_delivery(db, transfer_id, location_id, user_id)