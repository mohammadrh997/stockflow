from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field


class PartnerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: Annotated[EmailStr, AfterValidator(str.lower)] | None = None
    phone: str | None = Field(default=None, min_length=1, max_length=30)
    address: str | None = Field(default=None, min_length=1, max_length=500)
    is_customer: bool = False
    is_supplier: bool = False


class PartnerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: Annotated[EmailStr, AfterValidator(str.lower)] | None = None
    phone: str | None = Field(default=None, min_length=1, max_length=30)
    address: str | None = Field(default=None, min_length=1, max_length=500)
    is_customer: bool | None = None
    is_supplier: bool | None = None


class PartnerRead(PartnerCreate):
    model_config = {"from_attributes": True}

    id: int
    is_active: bool
    created_at: datetime
    created_by_id: int
