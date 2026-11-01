import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


from app.core.config import settings
from app.core.database import engine, AsyncSessionLocal
from app.routers import auth, users, product, warehouse, purchase, transfers, partner, stock, sale, health
from app.services.bootstrap import bootstrap

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.limiter import limiter

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as db:
        await bootstrap(db)
    yield
    await engine.dispose()


logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


app = FastAPI(title="Stock Flow", lifespan=lifespan)
app.state.limiter = limiter


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(partner.router)
app.include_router(sale.router)
app.include_router(purchase.router)
app.include_router(stock.router)
app.include_router(transfers.router)
app.include_router(product.router)
app.include_router(warehouse.warehouse_router)
app.include_router(warehouse.location_router)

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)