from fastapi import APIRouter, Depends

from app.dependencies import DBsession, get_current_user
from app.schemas.stock import StockRow
from app.services import stock as stock_service

router = APIRouter(
    prefix="/stock",
    tags=["stock"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[StockRow])
async def get_stock(db: DBsession, warehouse_id: int | None = None, product_id: int | None = None):
    return await stock_service.stock_report(db, warehouse_id=warehouse_id, product_id=product_id)
