import enum
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.checks import enum_check

if TYPE_CHECKING:
    from app.models.user import User


class BillImportState(enum.StrEnum):
    open = "open"  # being reviewed, or waiting for products
    done = "done"  # turned into a purchase order
    discarded = "discarded"


class BillImport(Base):
    """A supplier's bill as read from its file, until it's confirmed into a purchase order.

    What the bill said (supplier name, product descriptions) is kept next to what the
    user chose (partner, products), so the review shows both.
    """

    __tablename__ = "bill_imports"
    __table_args__ = (
        enum_check("state", BillImportState),
        CheckConstraint("state <> 'done' OR purchase_order_id IS NOT NULL", name="done_has_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    state: Mapped[BillImportState] = mapped_column(
        Enum(BillImportState, native_enum=False), server_default="open"
    )
    supplier_name: Mapped[str | None] = mapped_column(String(200))  # as printed on the bill
    partner_id: Mapped[int | None] = mapped_column(ForeignKey("partners.id"))
    partner_reference: Mapped[str | None] = mapped_column(String(100))  # the bill's number
    bill_date: Mapped[date | None] = mapped_column(Date())
    currency: Mapped[str | None] = mapped_column(String(3))
    bill_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))  # as printed
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"))
    purchase_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_orders.id"), unique=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by: Mapped["User"] = relationship(lazy="selectin")
    lines: Mapped[list["BillImportLine"]] = relationship(
        back_populates="bill_import",
        cascade="all, delete-orphan",
        order_by="BillImportLine.id",
    )


class BillImportLine(Base):
    __tablename__ = "bill_import_lines"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_not_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("bill_imports.id"), index=True)
    bill_import: Mapped[BillImport] = relationship(back_populates="lines")
    description: Mapped[str] = mapped_column(String(255))  # as printed on the bill
    product_code: Mapped[str | None] = mapped_column(String(100))  # as printed, if any
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    # Empty until matched or chosen. A line without one keeps the import from being confirmed.
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    # How sure the automatic match was: 1 for the bill's code equal to a SKU, else the name
    # similarity. Empty when the user chose the product, or nothing matched.
    match_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
