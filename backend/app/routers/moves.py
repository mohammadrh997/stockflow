from fastapi import APIRouter, Depends, Query

from app.dependencies import DBsession, Module, require_access
from app.models.user import Access
from app.schemas.stock import MovePage
from app.services import moves as move_service

router = APIRouter(
    prefix="/moves",
    tags=["moves"],
    dependencies=[Depends(require_access(Module.inventory, Access.user))],
)


@router.get("", response_model=MovePage)
async def list_moves(
    db: DBsession,
    product_id: int | None = None,
    before: int | None = Query(None, ge=1, description="next_cursor from the previous page"),
    limit: int = Query(50, ge=1, le=100),
):
    return await move_service.list_moves(db, limit, before=before, product_id=product_id)
