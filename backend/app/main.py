import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.body_limit import BodySizeLimit
from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.core.limiter import limiter
from app.routers import (
    auth,
    company,
    health,
    invoices,
    partner,
    product,
    purchase,
    sale,
    stock,
    transfers,
    users,
    warehouse,
)
from app.services.bootstrap import bootstrap
from app.services.images import MAX_UPLOAD_BYTES


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


app = FastAPI(title="StockFlow", lifespan=lifespan)
app.state.limiter = limiter


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(company.router)
app.include_router(users.router)
app.include_router(invoices.router)
app.include_router(partner.router)
app.include_router(sale.router)
app.include_router(purchase.router)
app.include_router(stock.router)
app.include_router(transfers.router)
app.include_router(product.router)
app.include_router(warehouse.warehouse_router)
app.include_router(warehouse.location_router)

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# The largest body we accept: one image plus room for the multipart wrapping around it.
# Added before CORS so CORS wraps it, and even a 413 carries the CORS headers the
# frontend needs to read the error.
app.add_middleware(BodySizeLimit, max_bytes=MAX_UPLOAD_BYTES + 64 * 1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    # Cross-origin JavaScript can't read this header unless it's listed, and the
    # frontend needs it for the PDF's filename
    expose_headers=["Content-Disposition"],
)
