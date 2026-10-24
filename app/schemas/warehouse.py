from typing import Annotated
from app.models.warehouse import LocationType

from pydantic import AfterValidator, BaseModel, Field

Code = Annotated[str, AfterValidator(lambda s: s.strip().upper()), Field(min_length=1, max_length=10)]

class WarehouseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: Code

class WarehouseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    default_location_id: int | None = None

class WarehouseRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    code: str
    default_location_id: int | None

class WarehouseDetail(WarehouseRead):
    locations: list["LocationRead"]

class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    warehouse_id: int

class LocationUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)

class LocationRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    location_type: LocationType
    warehouse_id: int | None
    is_active: bool