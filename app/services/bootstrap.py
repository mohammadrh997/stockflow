import logging

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.schemas.user import UserCreate
from app.services.users import EmailAlreadyExists, create_user

logger = logging.getLogger(__name__)


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


async def bootstrap(db: AsyncSession) -> None:
    await ensure_admin(db)
    # ensure_defaults(db) goes here later: main warehouse + virtual locations