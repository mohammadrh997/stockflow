from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, computed_field

from app.models.sale import SalesState
from app.schemas.common import Price, Quantity


class SalesOrderLineCreate(BaseModel):
    product_id: int
    quantity: Quantity
    unit_price: Price | None = None


class SalesOrderLineUpdate(BaseModel):
    quantity: Quantity | None = None
    unit_price: Price | None = None


class SalesOrderLineRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    product_id: int
    quantity: Decimal
    unit_price: Decimal

    @computed_field  # type: ignore[prop-decorator]
    @property
    def subtotal(self) -> Decimal:
        return (self.quantity * self.unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class SalesOrderCreate(BaseModel):
    partner_id: int
    warehouse_id: int | None = None
    lines: list[SalesOrderLineCreate] = []


class SalesOrderUpdate(BaseModel):
    partner_id: int | None = None
    warehouse_id: int | None = None


class SalesOrderRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    reference: str
    partner_id: int
    warehouse_id: int
    state: SalesState
    created_by_id: int
    created_at: datetime
    lines: list[SalesOrderLineRead]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total(self) -> Decimal:
        return sum((line.subtotal for line in self.lines), Decimal("0"))
