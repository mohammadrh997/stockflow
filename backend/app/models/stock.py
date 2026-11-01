import enum
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.checks import enum_check

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.purchase import PurchaseOrder
    from app.models.sale import SalesOrder
    from app.models.user import User
    from app.models.warehouse import Location, Warehouse


class TransferType(enum.StrEnum):
    receipt = "receipt"
    delivery = "delivery"
    internal = "internal"
    adjustment = "adjustment"


class TransferState(enum.StrEnum):
    ready = "ready"
    done = "done"
    cancelled = "cancelled"


class Transfer(Base):
    __tablename__ = "transfers"
    __table_args__ = (
        enum_check("transfer_type", TransferType),
        enum_check("state", TransferState),
        CheckConstraint(
            "num_nonnulls(purchase_order_id, sales_order_id) <= 1",
            name="single_origin",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(unique=True)
    transfer_type: Mapped[TransferType] = mapped_column(Enum(TransferType, native_enum=False))
    state: Mapped[TransferState] = mapped_column(
        Enum(TransferState, native_enum=False), server_default="ready"
    )

    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"))
    warehouse: Mapped["Warehouse"] = relationship()

    purchase_order_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_orders.id"))
    purchase_order: Mapped["PurchaseOrder | None"] = relationship()
    sales_order_id: Mapped[int | None] = mapped_column(ForeignKey("sales_orders.id"))
    sales_order: Mapped["SalesOrder | None"] = relationship()

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    validated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    validated_by: Mapped["User | None"] = relationship()

    moves: Mapped[list["StockMove"]] = relationship(back_populates="transfer")


class StockMove(Base):
    __tablename__ = "stock_moves"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("from_location_id <> to_location_id", name="different_locations"),
        CheckConstraint("num_nonnulls(purchase_line_id, sales_line_id) <= 1", name="single_origin"),
        Index("ix_stock_moves_product_to", "product_id", "to_location_id"),
        Index("ix_stock_moves_product_from", "product_id", "from_location_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    transfer_id: Mapped[int | None] = mapped_column(ForeignKey("transfers.id"))
    transfer: Mapped["Transfer | None"] = relationship(back_populates="moves")
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    product: Mapped["Product"] = relationship()
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    from_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    from_location: Mapped["Location"] = relationship(foreign_keys=[from_location_id])
    to_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    to_location: Mapped["Location"] = relationship(foreign_keys=[to_location_id])
    purchase_line_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_order_lines.id"))
    sales_line_id: Mapped[int | None] = mapped_column(ForeignKey("sales_order_lines.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by: Mapped["User"] = relationship()
    note: Mapped[str | None]
