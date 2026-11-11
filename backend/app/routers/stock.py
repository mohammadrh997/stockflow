from fastapi import APIRouter, Depends

from app.dependencies import DBsession, get_current_user
from app.schemas.stock import StockRow
from app.services import category as category_service
from app.services import stock as stock_service

router = APIRouter(
    prefix="/stock",
    tags=["stock"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[StockRow])
async def get_stock(
    db: DBsession,
    warehouse_id: int | None = None,
    product_id: int | None = None,
    category_id: int | None = None,
    include_subcategories: bool = False,
):
    category_ids = None
    if category_id is not None:
        category_ids = (
            await category_service.subtree_ids(db, category_id)
            if include_subcategories
            else [category_id]
        )
    return await stock_service.stock_report(
        db, warehouse_id=warehouse_id, product_id=product_id, category_ids=category_ids
    )
