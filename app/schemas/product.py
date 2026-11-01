from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field

from app.schemas.common import Price

Sku = Annotated[
    str, AfterValidator(lambda s: s.strip().upper()), Field(min_length=1, max_length=64)
]


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sku: Sku
    sale_price: Price
    cost_price: Price = Decimal("0")


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    sku: Sku | None = None
    sale_price: Price | None = None
    cost_price: Price | None = None


class ProductRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    sku: str
    sale_price: Decimal
    cost_price: Decimal
    image_key: str | None
    is_active: bool
    created_at: datetime
    created_by_id: int
