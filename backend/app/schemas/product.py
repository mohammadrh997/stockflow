from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, computed_field

from app.schemas.common import Price
from app.schemas.user import UserSummary
from app.services.storage import public_url

Sku = Annotated[
    str, AfterValidator(lambda s: s.strip().upper()), Field(min_length=1, max_length=64)
]


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sku: Sku
    sale_price: Price
    cost_price: Price = Decimal("0")
    category_id: int | None = None


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    sku: Sku | None = None
    sale_price: Price | None = None
    cost_price: Price | None = None
    category_id: int | None = None # sending null removes the category


class ProductRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    sku: str
    sale_price: Decimal
    cost_price: Decimal
    image_key: str | None = Field(default=None, exclude=True)  # internal; clients get the URL
    category_id: int | None
    is_active: bool
    created_at: datetime
    created_by: UserSummary

    @computed_field  # type: ignore[prop-decorator]
    @property
    def image_url(self) -> str | None:
        return public_url(self.image_key)
