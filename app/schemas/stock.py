from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from app.models.stock import TransferType, TransferState

class StockRow(BaseModel):
    product_id: int
    sku: str
    product_name: str
    warehouse_id: int
    on_hand: Decimal
    reserved: Decimal
    available: Decimal


class StockMoveRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    product_id: int
    quantity: Decimal
    from_location_id: int
    to_location_id: int
    purchase_line_id: int | None
    sales_line_id: int | None
    note: str | None
    created_by_id: int
    created_at: datetime



class TransferValidate(BaseModel):
    location_id: int | None = None

class TransferRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    reference: str
    transfer_type: TransferType
    state: TransferState
    warehouse_id: int
    purchase_order_id: int | None
    sales_order_id: int | None
    created_at: datetime
    validated_at: datetime | None
    validated_by_id: int | None
    moves: list[StockMoveRead]