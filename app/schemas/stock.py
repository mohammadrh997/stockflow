from pydantic import BaseModel, Field, model_validator
from decimal import Decimal
from datetime import datetime
from app.models.stock import TransferType, TransferState
from app.schemas.common import Quantity

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


class InternalTransferLine(BaseModel):
    product_id: int
    quantity: Quantity


class InternalTransferCreate(BaseModel):
    from_location_id: int
    to_location_id: int
    lines: list[InternalTransferLine] = Field(min_length=1)
    note: str | None = Field(default=None, max_length=500)


class AdjustmentLine(BaseModel):
    product_id: int
    counted_quantity: Decimal = Field(ge=0, max_digits=12, decimal_places=3)


class AdjustmentCreate(BaseModel):
    location_id: int
    lines: list[AdjustmentLine] = Field(min_length=1)
    note: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def unique_products(self) -> "AdjustmentCreate":
        product_ids = [line.product_id for line in self.lines]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("each product can only be counted once per adjustment")
        return self