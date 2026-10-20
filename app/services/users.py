from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate


class EmailAlreadyExists(Exception):
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
    except IntegrityError:
        await db.rollback()
        raise EmailAlreadyExists(data.email) from None
    await db.refresh(user)
    return user