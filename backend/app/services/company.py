import asyncio
import uuid

from sqlalchemy import exists, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import CompanySettings
from app.models.invoice import Invoice
from app.schemas.company import CompanyUpdate
from app.services import images
from app.services.storage import Storage, delete_quietly

LOGO_MAX_SIDE = 400


class CurrencyLocked(Exception): ...


async def get_company(db: AsyncSession) -> CompanySettings:
    company = await db.get(CompanySettings, 1)
    assert company is not None  # created at startup, and nothing deletes it
    return company


async def _lock_company(db: AsyncSession) -> CompanySettings:
    company = await db.scalar(
        select(CompanySettings)
        .where(CompanySettings.id == 1)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    assert company is not None
    return company


async def currency_locked(db: AsyncSession) -> bool:
    """True once any invoice has a number: it was issued in the current currency."""
    return bool(await db.scalar(select(exists().where(Invoice.number.is_not(None)))))


async def update_company(db: AsyncSession, data: CompanyUpdate) -> CompanySettings:
    company = await _lock_company(db)
    changes = data.model_dump(exclude_unset=True)
    if "currency" in changes and changes["currency"] != company.currency:
        # Until this transaction ends, no invoice can be posted (posting writes to the
        # table), so the answer below can't go stale before we commit
        await db.execute(text("LOCK TABLE invoices IN SHARE MODE"))
        if await currency_locked(db):
            raise CurrencyLocked(company.currency)
    for field, value in changes.items():
        setattr(company, field, value)
    await db.commit()
    await db.refresh(company)
    return company


async def set_logo(db: AsyncSession, storage: Storage, data: bytes) -> CompanySettings:
    webp = await asyncio.to_thread(images.to_webp, data, LOGO_MAX_SIDE)
    key = f"products/company/{uuid.uuid4().hex}.webp"  # the bucket key only allows products/
    await storage.put(key, webp, "image/webp")
    try:
        company = await _lock_company(db)
        old_key, company.logo_key = company.logo_key, key
        await db.commit()
    except Exception:
        await db.rollback()
        await delete_quietly(storage, key)
        raise
    if old_key:
        await delete_quietly(storage, old_key)
    await db.refresh(company)
    return company


async def remove_logo(db: AsyncSession, storage: Storage) -> CompanySettings:
    company = await _lock_company(db)
    old_key, company.logo_key = company.logo_key, None
    await db.commit()
    if old_key:
        await delete_quietly(storage, old_key)
    await db.refresh(company)
    return company
