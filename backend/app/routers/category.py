from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import DBsession, Module, get_current_user, require_access
from app.models.user import Access, User
from app.schemas.category import CategoryCreate, CategoryRead, CategoryUpdate
from app.services import category as category_service
from app.services.category import CategoryConflict, CategoryNotFound
from app.services.common import InvalidReference

router = APIRouter(
    prefix="/categories", tags=["categories"], dependencies=[Depends(get_current_user)]
)

InventoryManager = Annotated[User, Depends(require_access(Module.inventory, Access.manager))]


@router.get("", response_model=list[CategoryRead])
async def list_categories(db: DBsession, include_archived: bool = False):
    # Categories are few, so the whole tree comes in one response, sorted by path
    return await category_service.list_categories(db, include_archived)


@router.get("/{category_id}", response_model=CategoryRead)
async def get_category(db: DBsession, category_id: int):
    try:
        return await category_service.read_category(db, category_id)
    except CategoryNotFound:
        raise HTTPException(status_code=404, detail="Category not found") from None


@router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(db: DBsession, payload: CategoryCreate, user: InventoryManager):
    try:
        return await category_service.create_category(db, payload)
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except CategoryConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.patch("/{category_id}", response_model=CategoryRead)
async def update_category(
    db: DBsession, category_id: int, payload: CategoryUpdate, user: InventoryManager
):
    try:
        return await category_service.update_category(db, category_id, payload)
    except CategoryNotFound:
        raise HTTPException(status_code=404, detail="Category not found") from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except CategoryConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


async def _set_active(db: DBsession, category_id: int, active: bool):
    try:
        return await category_service.set_active(db, category_id, active)
    except CategoryNotFound:
        raise HTTPException(status_code=404, detail="Category not found") from None
    except CategoryConflict as exc:
        action = "archived" if not active else "restored"
        raise HTTPException(status_code=409, detail=f"Can't be {action}: {exc}") from None


@router.post("/{category_id}/archive", response_model=CategoryRead)
async def archive_category(db: DBsession, category_id: int, user: InventoryManager):
    return await _set_active(db, category_id, False)


@router.post("/{category_id}/unarchive", response_model=CategoryRead)
async def unarchive_category(db: DBsession, category_id: int, user: InventoryManager):
    return await _set_active(db, category_id, True)
