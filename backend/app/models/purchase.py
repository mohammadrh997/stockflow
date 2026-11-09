import enum
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.checks import enum_check

if TYPE_CHECKING:
    from app.models.partner import Partner
    from app.models.product import Product
    from app.models.user import User
    from app.models.warehouse import Warehouse


class PurchaseState(enum.StrEnum):
    draft = "draft"
    confirmed = "confirmed"
    received = "received"
    cancelled = "cancelled"


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    __table_args__ = (enum_check("state", PurchaseState),)

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(unique=True)
    partner_id: Mapped[int] = mapped_column(ForeignKey("partners.id"))
    partner: Mapped["Partner"] = relationship()
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"))
    warehouse: Mapped["Warehouse"] = relationship()
    state: Mapped[PurchaseState] = mapped_column(
        Enum(PurchaseState, native_enum=False), server_default="draft"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by: Mapped["User"] = relationship(lazy="selectin")
    lines: Mapped[list["PurchaseOrderLine"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"
    __table_args__ = (CheckConstraint("quantity > 0", name="quantity_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"))
    order: Mapped["PurchaseOrder"] = relationship(back_populates="lines")
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    product: Mapped["Product"] = relationship()
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
