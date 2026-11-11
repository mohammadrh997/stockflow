from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select

from app.dependencies import (
    DBsession,
    Module,
    StorageDep,
    get_current_user,
    pagination_params,
    require_access,
)
from app.models.product import Product
from app.models.user import Access, User
from app.routers.uploads import read_image_upload
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.services import category as category_service
from app.services import product as product_service
from app.services.common import InvalidReference
from app.services.images import InvalidImage
from app.services.product import CategoryArchived, ProductNotFound, SKUAlreadyExists

router = APIRouter(
    prefix="/products",
    tags=["products"],
    dependencies=[Depends(get_current_user)],
)

InventoryManager = Annotated[User, Depends(require_access(Module.inventory, Access.manager))]
PaginationDep = Annotated[dict, Depends(pagination_params)]


@router.get("", response_model=list[ProductRead])
async def get_products(
    db: DBsession,
    pagination: PaginationDep,
    name: None | str = None,
    include_archived: bool = False,
    category_id: int | None = None,
    include_subcategories: bool = False,
):
    skip, limit = pagination["skip"], pagination["limit"]
    stmt = select(Product).order_by(Product.id)
    if not include_archived:
        stmt = stmt.where(Product.is_active)
    if name:
        stmt = stmt.where(Product.name.ilike(f"%{name}%"))
    if category_id is not None:
        categories = (
            await category_service.subtree_ids(db, category_id)
            if include_subcategories
            else [category_id]
        )
        stmt = stmt.where(Product.category_id.in_(categories))
    stmt = stmt.offset(skip).limit(limit)
    products = (await db.scalars(stmt)).all()
    return products


@router.get("/{product_id}", response_model=ProductRead)
async def get_product(db: DBsession, product_id: int):
    try:
        return await product_service.fetch_product(db, product_id)
    except ProductNotFound:
        raise HTTPException(status_code=404, detail="Product Was Not Found") from None


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def add_products(db: DBsession, payload: ProductCreate, user: InventoryManager):
    try:
        return await product_service.create_product(db, payload, user.id)
    except SKUAlreadyExists:
        raise HTTPException(status_code=409, detail="SKU already Exist") from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.patch("/{product_id}", response_model=ProductRead)
async def update_products(
    db: DBsession, product_id: int, payload: ProductUpdate, user: InventoryManager
):
    try:
        return await product_service.update_product(db, product_id, payload)
    except SKUAlreadyExists:
        raise HTTPException(status_code=409, detail="SKU already Exist") from None
    except ProductNotFound:
        raise HTTPException(status_code=404, detail="Product Was Not Found") from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/{product_id}/archive", response_model=ProductRead)
async def archive_products(db: DBsession, product_id: int, user: InventoryManager):
    try:
        return await product_service.set_active(db, product_id, active=False)
    except ProductNotFound:
        raise HTTPException(status_code=404, detail="Product Was Not Found") from None


@router.post("/{product_id}/unarchive", response_model=ProductRead)
async def unarchive_products(db: DBsession, product_id: int, user: InventoryManager):
    try:
        return await product_service.set_active(db, product_id, active=True)
    except ProductNotFound:
        raise HTTPException(status_code=404, detail="Product Was Not Found") from None
    except CategoryArchived:
        raise HTTPException(
            status_code=409, detail="Its category is archived; restore it or pick another first"
        ) from None


@router.put("/{product_id}/image", response_model=ProductRead)
async def upload_product_image(
    db: DBsession, product_id: int, file: UploadFile, storage: StorageDep, user: InventoryManager
):
    data = await read_image_upload(file)
    try:
        return await product_service.set_image(db, storage, product_id, data)
    except ProductNotFound:
        raise HTTPException(status_code=404, detail="Product Was Not Found") from None
    except InvalidImage as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


@router.delete("/{product_id}/image", response_model=ProductRead)
async def delete_product_image(
    db: DBsession, product_id: int, storage: StorageDep, user: InventoryManager
):
    try:
        return await product_service.remove_image(db, storage, product_id)
    except ProductNotFound:
        raise HTTPException(status_code=404, detail="Product Was Not Found") from None
