from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.dependencies import (
    DBsession,
    Module,
    get_current_user,
    pagination_params,
    require_any_access,
)
from app.models.partner import Partner
from app.models.user import Access, User
from app.schemas.partner import PartnerCreate, PartnerRead, PartnerUpdate
from app.services import partner as partner_service
from app.services.partner import PartnerNotFound

router = APIRouter(
    prefix="/partners",
    tags=["partners"],
    dependencies=[Depends(get_current_user)],
)

PartnerEditor = Annotated[
    User, Depends(require_any_access(Module.sales, Module.purchase, level=Access.user))
]
PaginationDep = Annotated[dict, Depends(pagination_params)]


@router.get("", response_model=list[PartnerRead])
async def list_partners(
    db: DBsession,
    pagination: PaginationDep,
    is_customer: bool | None = None,
    is_supplier: bool | None = None,
    name: str | None = None,
    include_archived: bool = False,
):
    skip, limit = pagination["skip"], pagination["limit"]
    stmt = select(Partner).order_by(Partner.name)
    if is_customer is not None:
        stmt = stmt.where(Partner.is_customer == is_customer)
    if is_supplier is not None:
        stmt = stmt.where(Partner.is_supplier == is_supplier)
    if not include_archived:
        stmt = stmt.where(Partner.is_active)
    if name:
        stmt = stmt.where(Partner.name.ilike(f"%{name}%"))
    stmt = stmt.offset(skip).limit(limit)
    partners = (await db.scalars(stmt)).all()
    return partners


@router.get("/{partner_id}", response_model=PartnerRead)
async def get_partner(db: DBsession, partner_id: int):
    try:
        return await partner_service.fetch_partner(db, partner_id)
    except PartnerNotFound:
        raise HTTPException(status_code=404, detail="Partner Was Not Found") from None


@router.post("", response_model=PartnerRead, status_code=status.HTTP_201_CREATED)
async def create_partner(db: DBsession, payload: PartnerCreate, user: PartnerEditor):
    return await partner_service.create_partner(db, payload, user.id)


@router.patch("/{partner_id}", response_model=PartnerRead)
async def update_partner(
    db: DBsession, partner_id: int, payload: PartnerUpdate, user: PartnerEditor
):
    try:
        return await partner_service.update_partner(db, partner_id, payload)
    except PartnerNotFound:
        raise HTTPException(status_code=404, detail="Partner Was Not Found") from None


@router.post("/{partner_id}/archive", response_model=PartnerRead)
async def archive_partner(db: DBsession, partner_id: int, user: PartnerEditor):
    try:
        return await partner_service.set_active(db, partner_id, active=False)
    except PartnerNotFound:
        raise HTTPException(status_code=404, detail="Partner Was Not Found") from None


@router.post("/{partner_id}/unarchive", response_model=PartnerRead)
async def unarchive_partner(db: DBsession, partner_id: int, user: PartnerEditor):
    try:
        return await partner_service.set_active(db, partner_id, active=True)
    except PartnerNotFound:
        raise HTTPException(status_code=404, detail="Partner Was Not Found") from None
