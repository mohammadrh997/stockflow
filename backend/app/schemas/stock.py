from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.stock import TransferState, TransferType
from app.schemas.common import Quantity
from app.schemas.user import UserSummary


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


class TransferLineDone(BaseModel):
    line_id: int
    quantity: Decimal = Field(ge=0, max_digits=12, decimal_places=3)


class TransferValidate(BaseModel):
    location_id: int | None = None
    lines: list[TransferLineDone] | None = None  # None: move everything

    @model_validator(mode="after")
    def unique_lines(self) -> "TransferValidate":
        if self.lines is not None:
            line_ids = [line.line_id for line in self.lines]
            if len(line_ids) != len(set(line_ids)):
                raise ValueError("each line can only appear once")
        return self


class TransferLineRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    product_id: int
    quantity: Decimal
    purchase_line_id: int | None
    sales_line_id: int | None


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
    validated_by: UserSummary | None
    backorder_of_id: int | None
    lines: list[TransferLineRead]
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


class MoveLocation(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str


class MoveTransfer(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    reference: str


class MoveRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    created_at: datetime
    product_id: int
    quantity: Decimal
    from_location: MoveLocation
    to_location: MoveLocation
    transfer: MoveTransfer | None
    created_by: UserSummary  # whoever validated the transfer
    note: str | None
    # in: from a supplier. out: to a customer. count: a stock count (to or from the loss
    # location). internal: between two of our locations, which changes no total.
    kind: Literal["in", "out", "count", "internal"]
    direction: Literal[1, -1, 0]  # +1 stock added, -1 removed, 0 internal


class MovePage(BaseModel):
    items: list[MoveRead]
    next_cursor: int | None  # pass as ?before= for the next page; None on the last page
