import enum
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.models.user import Access, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


DBsession = Annotated[AsyncSession, Depends(get_db)]


class Module(enum.StrEnum):
    sales = "sales"
    purchase = "purchase"
    inventory = "inventory"


async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DBsession) -> User:
    credentials_error = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = decode_token(token)
    if token_data is None:
        raise credentials_error

    user = await db.get(User, token_data.user_id)
    if user is None or not user.is_active:
        raise credentials_error

    if user.password_changed_at and token_data.issued_at < int(
        user.password_changed_at.timestamp()
    ):
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


def require_any_access(*modules: Module, level: Access) -> Callable[[User], Awaitable[User]]:
    async def checker(user: CurrentUser) -> User:
        if user.is_admin or any(_access_level(user, m) >= level for m in modules):
            return user
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")

    return checker


def pagination_params(skip: int = Query(0, ge=0), limit: int = Query(10, ge=1, le=100)):
    return {"skip": skip, "limit": limit}
