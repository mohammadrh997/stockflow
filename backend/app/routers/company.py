from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import DBsession, StorageDep, get_current_user, require_admin
from app.models.company import CompanySettings
from app.models.user import User
from app.routers.uploads import read_image_upload
from app.schemas.company import CompanyRead, CompanyUpdate
from app.services import company as company_service
from app.services.company import CurrencyLocked
from app.services.images import InvalidImage
from app.services.storage import public_url

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(get_current_user)])

Admin = Annotated[User, Depends(require_admin)]


async def _read(db: AsyncSession, company: CompanySettings) -> CompanyRead:
    return CompanyRead(
        name=company.name,
        address=company.address,
        phone=company.phone,
        email=company.email,
        currency=company.currency,
        logo_url=public_url(company.logo_key),
        currency_locked=await company_service.currency_locked(db),
    )


@router.get("/company", response_model=CompanyRead)
async def get_company(db: DBsession):
    return await _read(db, await company_service.get_company(db))


@router.patch("/company", response_model=CompanyRead)
async def update_company(db: DBsession, payload: CompanyUpdate, admin: Admin):
    try:
        company = await company_service.update_company(db, payload)
    except CurrencyLocked as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Invoices have already been issued in {exc}, so the currency can't change",
        ) from None
    return await _read(db, company)


@router.put("/company/logo", response_model=CompanyRead)
async def upload_logo(db: DBsession, file: UploadFile, storage: StorageDep, admin: Admin):
    data = await read_image_upload(file)
    try:
        company = await company_service.set_logo(db, storage, data)
    except InvalidImage as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return await _read(db, company)


@router.delete("/company/logo", response_model=CompanyRead)
async def delete_logo(db: DBsession, storage: StorageDep, admin: Admin):
    return await _read(db, await company_service.remove_logo(db, storage))
