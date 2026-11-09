import enum
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.checks import enum_check

if TYPE_CHECKING:
    from app.models.partner import Partner
    from app.models.product import Product
    from app.models.purchase import PurchaseOrder
    from app.models.sale import SalesOrder
    from app.models.user import User


class InvoiceType(enum.StrEnum):
    customer_invoice = "customer_invoice"
    vendor_bill = "vendor_bill"


class InvoiceState(enum.StrEnum):
    draft = "draft"
    posted = "posted"
    cancelled = "cancelled"


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        enum_check("invoice_type", InvoiceType),
        enum_check("state", InvoiceState),
        CheckConstraint(
            "state <> 'posted' OR (number IS NOT NULL AND amount_total IS NOT NULL)",
            name="posted_has_number_and_total",
        ),
        CheckConstraint(
            "(invoice_type = 'customer_invoice'"
            " AND sales_order_id IS NOT NULL AND purchase_order_id IS NULL)"
            " OR (invoice_type = 'vendor_bill'"
            " AND purchase_order_id IS NOT NULL AND sales_order_id IS NULL)",
            name="origin_matches_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str | None] = mapped_column(String(20), unique=True)
    invoice_type: Mapped[InvoiceType] = mapped_column(Enum(InvoiceType, native_enum=False))
    state: Mapped[InvoiceState] = mapped_column(
        Enum(InvoiceState, native_enum=False), server_default="draft"
    )
    partner_id: Mapped[int] = mapped_column(ForeignKey("partners.id"))
    partner: Mapped["Partner"] = relationship()
    purchase_order_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_orders.id"))
    purchase_order: Mapped["PurchaseOrder | None"] = relationship()
    sales_order_id: Mapped[int | None] = mapped_column(ForeignKey("sales_orders.id"))
    sales_order: Mapped["SalesOrder | None"] = relationship()
    invoice_date: Mapped[date | None] = mapped_column(Date())
    due_date: Mapped[date | None] = mapped_column(Date())
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    posted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    posted_by: Mapped["User | None"] = relationship(foreign_keys=[posted_by_id], lazy="selectin")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by: Mapped["User"] = relationship(foreign_keys=[created_by_id], lazy="selectin")
    amount_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    lines: Mapped[list["InvoiceLine"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_not_negative"),
        CheckConstraint("num_nonnulls(sales_line_id, purchase_line_id) = 1", name="single_origin"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    invoice: Mapped[Invoice] = relationship(back_populates="lines")
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    product: Mapped["Product"] = relationship()
    sales_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("sales_order_lines.id"), index=True
    )
    purchase_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_order_lines.id"), index=True
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    subtotal: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (CheckConstraint("amount > 0", name="amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str | None] = mapped_column(String(100))
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    invoice: Mapped[Invoice] = relationship(back_populates="payments")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    paid_on: Mapped[date] = mapped_column(Date())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by: Mapped["User"] = relationship(lazy="selectin")
