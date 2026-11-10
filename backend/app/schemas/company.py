from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, EmailStr, Field, model_validator

Currency = Annotated[
    str,
    BeforeValidator(lambda v: v.strip().upper() if isinstance(v, str) else v),
    Field(pattern=r"^[A-Z]{3}$", description="ISO 4217 code, e.g. USD or IQD"),
]


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, min_length=1, max_length=500)
    phone: str | None = Field(default=None, min_length=1, max_length=30)
    email: Annotated[EmailStr, AfterValidator(str.lower)] | None = None
    currency: Currency | None = None

    @model_validator(mode="after")
    def required_fields_stay_set(self) -> "CompanyUpdate":
        # Leaving a field out keeps it; sending null clears it, except for these two
        for field in ("name", "currency"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} can't be empty")
        return self


class CompanyRead(BaseModel):
    name: str
    address: str | None
    phone: str | None
    email: str | None
    currency: str
    logo_url: str | None
    currency_locked: bool  # true once an invoice has been issued in this currency
