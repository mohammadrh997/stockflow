import os

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://stockflow:stockflow@localhost:5432/stockflow_test",
)
if "test" not in TEST_DATABASE_URL.rsplit("/", 1)[-1]:
    raise RuntimeError("Refusing to run: the test database name must contain 'test' (tests delete all data)")
os.environ["DATABASE_URL"] = TEST_DATABASE_URL  # before any app import, so app and Alembic use it

from collections.abc import AsyncIterator, Awaitable, Callable  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.database import Base  # noqa: E402
from app.dependencies import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.user import UserCreate  # noqa: E402
from app.services.bootstrap import ensure_defaults  # noqa: E402
from app.services.users import create_user  # noqa: E402
from app.models.user import Access
from tests.helpers import auth

engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
TestSession = async_sessionmaker(engine, expire_on_commit=False)

REF_SEQUENCES = [
    "purchase_order_ref_seq",
    "sales_order_ref_seq",
    "receipt_ref_seq",
    "delivery_ref_seq",
    "internal_ref_seq",
    "adjustment_ref_seq",
]


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    config = Config("alembic.ini")
    command.downgrade(config, "base")
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
async def clean_database() -> AsyncIterator[None]:
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        for sequence in REF_SEQUENCES:
            await conn.execute(text(f"ALTER SEQUENCE {sequence} RESTART"))
    async with TestSession() as session:
        await ensure_defaults(session)
    yield


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    async with TestSession() as session:
        yield session


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client
    app.dependency_overrides.clear()


UserFactory = Callable[..., Awaitable[User]]


@pytest.fixture
def make_user(db: AsyncSession) -> UserFactory:
    counter = 0

    async def _make(**fields) -> User:
        nonlocal counter
        counter += 1
        data = UserCreate(
            email=fields.pop("email", f"user{counter}@example.com"),
            name=fields.pop("name", f"User {counter}"),
            password=fields.pop("password", "password123"),
            **fields,
        )
        return await create_user(db, data)

    return _make




@pytest.fixture
async def boss(make_user) -> dict[str, str]:
    user = await make_user(
        sales_access=Access.manager,
        purchase_access=Access.manager,
        inventory_access=Access.manager,
    )
    return auth(user)