from collections.abc import Iterable
from decimal import Decimal

from sqlalchemy import func, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.stock import StockMove, Transfer, TransferLine, TransferState, TransferType
from app.models.warehouse import Location, LocationType


def _movements(product_id: int | None = None, location_id: int | None = None):
    inflow = select(
        StockMove.product_id,
        StockMove.to_location_id.label("location_id"),
        StockMove.quantity.label("qty"),
    )
    outflow = select(
        StockMove.product_id,
        StockMove.from_location_id.label("location_id"),
        (-StockMove.quantity).label("qty"),
    )
    if product_id is not None:
        inflow = inflow.where(StockMove.product_id == product_id)
        outflow = outflow.where(StockMove.product_id == product_id)
    if location_id is not None:
        inflow = inflow.where(StockMove.to_location_id == location_id)
        outflow = outflow.where(StockMove.from_location_id == location_id)
    return union_all(inflow, outflow).subquery()


async def location_has_stock(db: AsyncSession, location_id: int) -> bool:
    movements = _movements(location_id=location_id)
    stmt = (
        select(movements.c.product_id)
        .group_by(movements.c.product_id)
        .having(func.sum(movements.c.qty) != 0)
        .limit(1)
    )
    return await db.scalar(stmt) is not None


async def lock_products(db: AsyncSession, product_ids: Iterable[int]) -> None:
    (
        await db.scalars(
            select(Product.id)
            .where(Product.id.in_(set(product_ids)))
            .order_by(Product.id)
            .with_for_update()
        )
    ).all()


async def lock_locations(db: AsyncSession, location_ids: Iterable[int]) -> None:
    (
        await db.scalars(
            select(Location.id)
            .where(Location.id.in_(set(location_ids)))
            .order_by(Location.id)
            .with_for_update()
        )
    ).all()


async def on_hand_by_location(
    db: AsyncSession, product_id: int, warehouse_id: int
) -> dict[int, Decimal]:
    movements = _movements(product_id)
    stmt = (
        select(movements.c.location_id, func.sum(movements.c.qty))
        .join(Location, Location.id == movements.c.location_id)
        .where(
            Location.warehouse_id == warehouse_id, Location.location_type == LocationType.internal
        )
        .group_by(movements.c.location_id)
    )
    rows = (await db.execute(stmt)).all()
    return {location_id: qty for location_id, qty in rows if qty != 0}


async def available_in_warehouse(db: AsyncSession, product_id: int, warehouse_id: int) -> Decimal:
    on_hand = sum((await on_hand_by_location(db, product_id, warehouse_id)).values(), Decimal("0"))
    reserved = (
        await db.execute(
            select(func.coalesce(func.sum(TransferLine.quantity), 0))
            .join(Transfer)
            .where(
                TransferLine.product_id == product_id,
                Transfer.warehouse_id == warehouse_id,
                Transfer.transfer_type == TransferType.delivery,
                Transfer.state == TransferState.ready,
            )
        )
    ).scalar_one()
    return on_hand - reserved


async def stock_report(
    db: AsyncSession, warehouse_id: int | None = None, product_id: int | None = None
) -> list[dict]:
    movements = _movements(product_id)
    on_hand_stmt = (
        select(movements.c.product_id, Location.warehouse_id, func.sum(movements.c.qty))
        .join(Location, Location.id == movements.c.location_id)
        .where(Location.location_type == LocationType.internal)
        .group_by(movements.c.product_id, Location.warehouse_id)
    )
    reserved_stmt = (
        select(TransferLine.product_id, Transfer.warehouse_id, func.sum(TransferLine.quantity))
        .join(Transfer)
        .where(
            Transfer.transfer_type == TransferType.delivery,
            Transfer.state == TransferState.ready,
        )
        .group_by(TransferLine.product_id, Transfer.warehouse_id)
    )
    if warehouse_id is not None:
        on_hand_stmt = on_hand_stmt.where(Location.warehouse_id == warehouse_id)
        reserved_stmt = reserved_stmt.where(Transfer.warehouse_id == warehouse_id)
    if product_id is not None:
        reserved_stmt = reserved_stmt.where(TransferLine.product_id == product_id)

    totals: dict[tuple[int, int], dict[str, Decimal]] = {}
    for pid, wid, qty in (await db.execute(on_hand_stmt)).all():
        totals.setdefault((pid, wid), {"on_hand": Decimal("0"), "reserved": Decimal("0")})[
            "on_hand"
        ] = qty
    for pid, wid, qty in (await db.execute(reserved_stmt)).all():
        totals.setdefault((pid, wid), {"on_hand": Decimal("0"), "reserved": Decimal("0")})[
            "reserved"
        ] = qty
    if not totals:
        return []

    product_ids = {pid for pid, _ in totals}
    products = {
        p.id: p for p in await db.scalars(select(Product).where(Product.id.in_(product_ids)))
    }

    rows = []
    for (pid, wid), t in totals.items():
        if t["on_hand"] == 0 and t["reserved"] == 0:
            continue
        rows.append(
            {
                "product_id": pid,
                "sku": products[pid].sku,
                "product_name": products[pid].name,
                "warehouse_id": wid,
                "on_hand": t["on_hand"],
                "reserved": t["reserved"],
                "available": t["on_hand"] - t["reserved"],
            }
        )
    return sorted(rows, key=lambda r: (r["sku"], r["warehouse_id"]))
