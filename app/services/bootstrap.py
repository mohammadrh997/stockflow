import logging

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models.user import User
from app.schemas.user import UserCreate
from app.models.warehouse import Warehouse, Location, LocationType
from app.schemas.warehouse import WarehouseCreate
from app.services.users import EmailAlreadyExists, create_user
from app.services.warehouse import CodeAlreadyExists, create_warehouse

logger = logging.getLogger(__name__)

VIRTUAL_LOCATIONS = {
    LocationType.supplier: "Supplier",
    LocationType.customer: "Customer",
    LocationType.loss: "Inventory Loss",
}


async def ensure_admin(db: AsyncSession) -> None:
    if await db.scalar(select(exists().where(User.is_admin))):
        return

    if not settings.admin_email or not settings.admin_password:
        logger.warning("No admin exists and ADMIN_EMAIL / ADMIN_PASSWORD are not set.")
        return

    data = UserCreate(
        email=settings.admin_email,
        name=settings.admin_name,
        password=settings.admin_password.get_secret_value(),
        is_admin=True,
    )
    try:
        await create_user(db, data)
        logger.info("Created initial admin %s", data.email)
    except EmailAlreadyExists:
        logger.warning("ADMIN_EMAIL belongs to an existing non-admin user; no admin created.")


async def ensure_virtual_locations(db: AsyncSession) -> None:
    for location_type, name in VIRTUAL_LOCATIONS.items():
        if await db.scalar(select(exists().where(Location.location_type == location_type))):
            continue
        db.add(Location(name=name, location_type=location_type))
        try:
            await db.commit()
            logger.info("Created virtual location %s", name)
        except IntegrityError:
            await db.rollback()

async def ensure_defaults(db: AsyncSession) -> None:
    await ensure_virtual_locations(db)
    if await db.scalar(select(exists().select_from(Warehouse))):
            return
    try:
        await create_warehouse(db, WarehouseCreate(name="Main Warehouse", code="WH"))
        logger.info("Created default warehouse WH")
    except CodeAlreadyExists:
        pass # another worker created it at the same moment

async def bootstrap(db: AsyncSession) -> None:
    await ensure_admin(db)
    await ensure_defaults(db)