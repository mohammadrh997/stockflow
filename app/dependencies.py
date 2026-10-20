import enum
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.models.user import Access, User
from collections.abc import AsyncGenerator

from app.core.database import AsyncSessionLocal


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


DBsession = Annotated[AsyncSession, Depends(get_db)]

class Module(enum.StrEnum):
    sales = "sales"
    purchase = "purchase"
    inventory = "inventory"

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)], db: DBsession
) -> User:
    credentials_error = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    subject = decode_token(token)
    if subject is None:
        raise credentials_error
    try:
        user_id = int(subject)
    except ValueError:
        raise credentials_error from None

    user = await db.get(User, user_id)
    if user is None or user.is_active is False:
        raise credentials_error
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def _access_level(user: User, module: Module) -> Access:
    return {
        Module.sales: user.sales_access,
        Module.purchase: user.purchase_access,
        Module.inventory: user.inventory_access,
    }[module]

def require_access(module: Module, level: Access) -> Callable[[User], Awaitable[User]]:
    async def checker(user: CurrentUser) -> User:
        if user.is_admin or _access_level(user, module) >= level:
            return user
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")

    return checker

def pagination_params(skip: int = Query(0, ge=0), limit: int = Query(10, ge=1, le=100)):
    return {"skip": skip, "limit": limit}