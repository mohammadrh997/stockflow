from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.services.auth import end_all_sessions


class EmailAlreadyExists(Exception):
    pass


class UserNotFound(Exception):
    pass


class CannotModifySelf(Exception):
    pass


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    user = User(
        email=data.email,
        name=data.name,
        hashed_password=await hash_password(data.password),
        is_admin=data.is_admin,
        sales_access=data.sales_access,
        purchase_access=data.purchase_access,
        inventory_access=data.inventory_access,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_users_email" in str(exc.orig):
            raise EmailAlreadyExists(data.email) from None
        raise
    await db.refresh(user)
    return user


async def fetch_user(db: AsyncSession, user_id: int) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise UserNotFound(user_id) from None
    return user


async def update_user(
    db: AsyncSession, user_id: int, data: UserUpdate, acting_user_id: int
) -> User:
    user = await fetch_user(db, user_id)
    if user.id == acting_user_id and data.is_admin is False:
        raise CannotModifySelf("You cannot remove your own admin access")
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None:
            continue
        setattr(user, field, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_users_email" in str(exc.orig):
            raise EmailAlreadyExists(data.email) from None
        raise
    await db.refresh(user)
    return user


async def set_active(db: AsyncSession, user_id: int, active: bool, acting_user_id: int) -> User:
    user = await fetch_user(db, user_id)
    if user.id == acting_user_id and not active:
        raise CannotModifySelf("You cannot deactivate yourself")
    user.is_active = active
    if not active:
        await end_all_sessions(db, user.id)
    await db.commit()
    await db.refresh(user)
    return user


async def reset_password(db: AsyncSession, user_id: int, new_password: str) -> User:
    user = await fetch_user(db, user_id)
    user.hashed_password = await hash_password(new_password)
    user.password_changed_at = datetime.now(UTC)
    await end_all_sessions(db, user.id)
    await db.commit()
    return user
