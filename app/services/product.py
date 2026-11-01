from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate


class SKUAlreadyExists(Exception):
    pass


class ProductNotFound(Exception):
    pass


async def create_product(db: AsyncSession, data: ProductCreate, created_by_id: int) -> Product:
    product = Product(
        name=data.name,
        sku=data.sku,
        sale_price=data.sale_price,
        cost_price=data.cost_price,
        created_by_id=created_by_id,
    )
    db.add(product)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_products_sku" in str(exc.orig):
            raise SKUAlreadyExists(data.sku) from None
        raise
    await db.refresh(product)
    return product


async def fetch_product(db: AsyncSession, product_id: int) -> Product:
    product = await db.get(Product, product_id)
    if not product:
        raise ProductNotFound(product_id) from None
    return product


async def update_product(db: AsyncSession, product_id: int, data: ProductUpdate) -> Product:
    product = await fetch_product(db, product_id)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None:
            continue
        setattr(product, field, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_products_sku" in str(exc.orig):
            raise SKUAlreadyExists(data.sku) from None
        raise
    await db.refresh(product)
    return product


async def set_active(db: AsyncSession, product_id: int, active: bool) -> Product:
    product = await fetch_product(db, product_id)
    product.is_active = active
    await db.commit()
    await db.refresh(product)
    return product
