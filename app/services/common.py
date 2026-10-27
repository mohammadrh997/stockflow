from app.models.product import Product
from app.models.warehouse import Warehouse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class InvalidReference(Exception): ...   # 400
class LineNotFound(Exception): ...       # 404
class OrderNotEditable(Exception): ...   # 409
class OrderHasNoLines(Exception): ...    # 409
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