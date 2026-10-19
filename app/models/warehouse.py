import enum
from sqlalchemy import true, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.checks import enum_check

class LocationType(enum.StrEnum):
    internal = "internal"
    supplier = "supplier"
    customer = "customer"
    loss = "loss"

class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    code: Mapped[str] = mapped_column(unique=True)
    default_location_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "locations.id",
            use_alter=True,
            name="fk_warehouses_default_location_id",
        )
    )

    default_location: Mapped["Location | None"] = relationship(
        foreign_keys=[default_location_id], post_update=True
    )
    locations: Mapped[list["Location"]] = relationship(
        back_populates="warehouse", foreign_keys="Location.warehouse_id"
    )


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (enum_check("location_type", LocationType),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    location_type: Mapped[LocationType] = mapped_column(
        Enum(LocationType, native_enum=False),
        server_default="internal",
    )
    is_active: Mapped[bool] = mapped_column(server_default=true())
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"))

    warehouse: Mapped["Warehouse | None"] = relationship(
        back_populates="locations", foreign_keys=[warehouse_id]
    )