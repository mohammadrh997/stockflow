from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, computed_field

from app.models.purchase import PurchaseState
from app.schemas.common import Price, Quantity


class PurchaseOrderLineCreate(BaseModel):
    product_id: int
    quantity: Quantity
    unit_price: Price | None = None


class PurchaseOrderLineUpdate(BaseModel):
    quantity: Quantity | None = None
    unit_price: Price | None = None


class PurchaseOrderLineRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    product_id: int
    quantity: Decimal
    unit_price: Decimal

    @computed_field # type: ignore[prop-decorator]
    @property
    def subtotal(self) -> Decimal:
        return (self.quantity * self.unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class PurchaseOrderCreate(BaseModel):
    partner_id: int
    warehouse_id: int | None = None
    lines: list[PurchaseOrderLineCreate] = []


class PurchaseOrderUpdate(BaseModel):
    partner_id: int | None = None
    warehouse_id: int | None = None


class PurchaseOrderRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    reference: str
    partner_id: int
    warehouse_id: int
    state: PurchaseState
    created_by_id: int
    created_at: datetime
    lines: list[PurchaseOrderLineRead]

    @computed_field # type: ignore[prop-decorator]
    @property
    def total(self) -> Decimal:
        return sum((line.subtotal for line in self.lines), Decimal("0"))
