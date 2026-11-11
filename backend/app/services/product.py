import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate
from app.services import images
from app.services.category import lock_usable_category
from app.services.common import InvalidReference
from app.services.storage import Storage, delete_quietly


class SKUAlreadyExists(Exception):
    pass


class ProductNotFound(Exception):
    pass


class CategoryArchived(Exception): ...  # 409


async def create_product(db: AsyncSession, data: ProductCreate, created_by_id: int) -> Product:
    if data.category_id is not None:
        await lock_usable_category(db, data.category_id)
    product = Product(
        name=data.name,
        sku=data.sku,
        sale_price=data.sale_price,
        category_id=data.category_id,
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
        raise ProductNotFound(product_id)
    return product


async def update_product(db: AsyncSession, product_id: int, data: ProductUpdate) -> Product:
    product = await fetch_product(db, product_id)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if field == "category_id":
            if value is not None:
                await lock_usable_category(db, value)
            product.category_id = value  # null is allowed here: it removes the category
            continue
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
    if active and product.category_id is not None:
        try:
            await lock_usable_category(db, product.category_id)
        except InvalidReference:
            raise CategoryArchived(product.category_id) from None
    product.is_active = active
    await db.commit()
    await db.refresh(product)
    return product


async def _lock_product(db: AsyncSession, product_id: int) -> Product:
    product = await db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if product is None:
        raise ProductNotFound(product_id)
    return product


async def set_image(db: AsyncSession, storage: Storage, product_id: int, data: bytes) -> Product:
    await fetch_product(db, product_id)  # 404 before doing any work
    await db.rollback()  # end that read, so no connection is held during the slow part
    webp = await asyncio.to_thread(images.to_webp, data)  # CPU work, off the event loop
    key = f"products/{uuid.uuid4().hex}.webp"  # new name every time, so caches never go stale
    await storage.put(key, webp, "image/webp")
    try:
        # Locked so two uploads at once can't both read the same old key and leak a file
        product = await _lock_product(db, product_id)
        old_key, product.image_key = product.image_key, key
        await db.commit()
    except Exception:
        await db.rollback()
        await delete_quietly(storage, key)  # nothing points at the new file
        raise
    if old_key:
        await delete_quietly(storage, old_key)
    await db.refresh(product)
    return product


async def remove_image(db: AsyncSession, storage: Storage, product_id: int) -> Product:
    product = await _lock_product(db, product_id)
    old_key, product.image_key = product.image_key, None
    await db.commit()
    if old_key:
        await delete_quietly(storage, old_key)
    await db.refresh(product)
    return product
