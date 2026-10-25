from pydantic import BaseModel
from decimal import Decimal


class StockRow(BaseModel):
    product_id: int
    sku: str
    product_name: str
    warehouse_id: int
    on_hand: Decimal
    reserved: Decimal
    available: Decimal