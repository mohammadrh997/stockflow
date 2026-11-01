from datetime import datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    EmailStr,
    Field,
    PlainSerializer,
    WithJsonSchema,
    model_validator,
)

from app.models.user import Access


def _access_from_name(value: object) -> object:
    if isinstance(value, str):
        try:
            return Access[value]
        except KeyError:
            raise ValueError(f"must be one of: {', '.join(Access.__members__)}") from None
    return value


AccessName = Annotated[
    Access,
    BeforeValidator(_access_from_name),
    PlainSerializer(lambda level: level.name, return_type=str),
    WithJsonSchema({"type": "string", "enum": list(Access.__members__)}),
]


class UserBase(BaseModel):
    email: Annotated[EmailStr, AfterValidator(str.lower)]
    name: str = Field(min_length=1, max_length=30)
    is_admin: bool = False
    sales_access: AccessName = Access.none
    purchase_access: AccessName = Access.none
    inventory_access: AccessName = Access.none


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    email: Annotated[EmailStr, AfterValidator(str.lower)] | None = None
    name: str | None = Field(default=None, min_length=1, max_length=30)
    is_admin: bool | None = None
    sales_access: AccessName | None = None
    purchase_access: AccessName | None = None
    inventory_access: AccessName | None = None


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=30)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def passwords_differ(self) -> "PasswordChange":
        if self.new_password == self.current_password:
            raise ValueError("New password must be different from the current password")
        return self


class UserRead(UserBase):
    model_config = {"from_attributes": True}

    id: int
    created_at: datetime
    is_active: bool
