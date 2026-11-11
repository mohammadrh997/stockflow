from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.warehouse import Warehouse


class InvalidReference(Exception): ...  # 400


class LineNotFound(Exception): ...  # 404


class OrderNotEditable(Exception): ...  # 409


class OrderHasNoLines(Exception): ...  # 409


class OrderNotCancellable(Exception): ...  # 409


async def resolve_warehouse(db: AsyncSession, warehouse_id: int | None) -> Warehouse:
    if warehouse_id is not None:
        warehouse = await db.get(Warehouse, warehouse_id)
        if warehouse is None:
            raise InvalidReference(f"warehouse {warehouse_id} not found")
        return warehouse

    warehouses = (await db.scalars(select(Warehouse).limit(2))).all()
    if len(warehouses) != 1:
        raise InvalidReference("warehouse_id is required")
    return warehouses[0]


async def get_active_product(db: AsyncSession, product_id: int) -> Product:
    product = await db.get(Product, product_id)
    if product is None or not product.is_active:
        raise InvalidReference(f"product {product_id} not found or archived")
    return product


@dataclass
class Page[T]:
    items: Sequence[T]
    total: int  # every match, not just this page


async def paginate[T](db: AsyncSession, stmt: Select[T], skip: int, limit: int) -> Page[T]:
    # Counted with the same filters, minus the ordering, which a count doesn't need
    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    items = (await db.scalars(stmt.offset(skip).limit(limit))).all()
    return Page(items, total or 0)
