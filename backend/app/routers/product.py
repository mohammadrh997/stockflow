from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.dependencies import (
    DBsession,
    Module,
    get_current_user,
    pagination_params,
    require_access,
)
from app.models.product import Product
from app.models.user import Access, User
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.services import product as product_service
from app.services.product import ProductNotFound, SKUAlreadyExists

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
):
    skip, limit = pagination["skip"], pagination["limit"]
    stmt = select(Product).order_by(Product.id)
    if not include_archived:
        stmt = stmt.where(Product.is_active)
    if name:
        stmt = stmt.where(Product.name.ilike(f"%{name}%"))
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
