from dataclasses import dataclass

from sqlalchemy import Select, and_, case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, contains_eager, selectinload, with_expression

from app.models.stock import StockMove
from app.models.warehouse import Location, LocationType

# The two ends of a move. Every query that classifies moves joins both.
FromLocation = aliased(Location, name="from_loc")
ToLocation = aliased(Location, name="to_loc")

_INTERNAL = LocationType.internal
_from_internal = FromLocation.location_type == _INTERNAL
_to_internal = ToLocation.location_type == _INTERNAL

# The one place that decides what a move is
KIND = case(
    (
        or_(
            FromLocation.location_type == LocationType.loss,
            ToLocation.location_type == LocationType.loss,
        ),
        "count",
    ),
    (and_(_from_internal, _to_internal), "internal"),
    (_to_internal, "in"),
    else_="out",
)
DIRECTION = case(
    (and_(_from_internal, _to_internal), 0),
    (_to_internal, 1),
    else_=-1,
)


def with_locations[T](stmt: Select[T]) -> Select[T]:
    return stmt.join(FromLocation, FromLocation.id == StockMove.from_location_id).join(
        ToLocation, ToLocation.id == StockMove.to_location_id
    )


@dataclass
class MovePage:
    items: list[StockMove]
    next_cursor: int | None


async def list_moves(
    db: AsyncSession, limit: int, before: int | None = None, product_id: int | None = None
) -> MovePage:
    stmt = (
        with_locations(select(StockMove))
        .options(
            contains_eager(StockMove.from_location.of_type(FromLocation)),
            contains_eager(StockMove.to_location.of_type(ToLocation)),
            selectinload(StockMove.transfer),
            selectinload(StockMove.created_by),
            with_expression(StockMove.kind, KIND),
            with_expression(StockMove.direction, DIRECTION),
        )
        .order_by(StockMove.id.desc())
        .limit(limit + 1)  # one extra, to know whether another page follows
    )
    if before is not None:
        stmt = stmt.where(StockMove.id < before)
    if product_id is not None:
        stmt = stmt.where(StockMove.product_id == product_id)

    moves = list((await db.scalars(stmt)).all())
    if len(moves) > limit:
        moves = moves[:limit]
        return MovePage(moves, next_cursor=moves[-1].id)
    return MovePage(moves, next_cursor=None)
