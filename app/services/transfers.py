from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.purchase import PurchaseState
from app.models.stock import StockMove, Transfer, TransferState, TransferType
from app.models.warehouse import Location, LocationType, Warehouse
from app.services.purchase import InvalidReference, lock_purchase_order
from app.services.warehouse import get_virtual_location


class TransferNotFound(Exception): ...  # 404
class TransferNotReady(Exception): ...  # 409


def _transfer_query(transfer_id: int):
    return (
        select(Transfer)
        .where(Transfer.id == transfer_id)
        .options(selectinload(Transfer.moves))
        .execution_options(populate_existing=True)
    )


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
    if transfer.transfer_type != TransferType.receipt:
        raise TransferNotReady("only receipts can be validated for now")
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