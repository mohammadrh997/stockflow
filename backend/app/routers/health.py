import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.dependencies import DBsession

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: DBsession):
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("Health check: database unreachable: %r", exc)
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ok"}
