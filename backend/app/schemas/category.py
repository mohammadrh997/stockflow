from pydantic import BaseModel, Field, model_validator


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_id: int | None = None  # None: a top-level category


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    parent_id: int | None = None  # sending null moves it to the top level

    @model_validator(mode="after")
    def name_stays_set(self) -> "CategoryUpdate":
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name can't be empty")
        return self


class CategoryRead(BaseModel):
    id: int
    name: str
    parent_id: int | None
    is_active: bool
    path: str
    depth: int  # 1 for a top-level category
