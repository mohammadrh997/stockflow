from sqlalchemy.ext.asyncio import AsyncSession

from app.models.partner import Partner
from app.schemas.partner import PartnerCreate, PartnerUpdate

NULLABLE_FIELDS = {"email", "phone", "address"}


class PartnerNotFound(Exception):
    pass


async def create_partner(db: AsyncSession, data: PartnerCreate, created_by_id: int) -> Partner:
    partner = Partner(
        name=data.name,
        email=data.email,
        phone=data.phone,
        address=data.address,
        is_customer=data.is_customer,
        is_supplier= data.is_supplier,
        created_by_id=created_by_id
    )
    db.add(partner)
    await db.commit()
    await db.refresh(partner)
    return partner


async def fetch_partner(db: AsyncSession, partner_id: int) -> Partner:
    partner = await db.get(Partner, partner_id)
    if not partner:
        raise PartnerNotFound(partner_id) from None
    return partner

async def update_partner(db: AsyncSession, partner_id: int, data: PartnerUpdate) -> Partner:
    partner = await fetch_partner(db, partner_id)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None and field not in NULLABLE_FIELDS:
            continue
        setattr(partner, field, value)
    await db.commit()
    await db.refresh(partner)
    return partner

async def set_active(db: AsyncSession, partner_id: int, active: bool) -> Partner:
    partner = await fetch_partner(db, partner_id)
    partner.is_active = active
    await db.commit()
    await db.refresh(partner)
    return partner
