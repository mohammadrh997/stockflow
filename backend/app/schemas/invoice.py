import enum
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, computed_field, model_validator

from app.models.invoice import InvoiceState, InvoiceType
from app.schemas.common import Amount, Price, Quantity, line_subtotal
from app.schemas.user import UserSummary


class InvoiceCreate(BaseModel):
    purchase_order_id: int | None = None
    sales_order_id: int | None = None

    @model_validator(mode="after")
    def exactly_one_order(self) -> "InvoiceCreate":
        if (self.purchase_order_id is None) == (self.sales_order_id is None):
            raise ValueError("send exactly one of sales_order_id or purchase_order_id")
        return self


class InvoicePost(BaseModel):
    invoice_date: date | None = None
    due_date: date | None = None

    @model_validator(mode="after")
    def check_dates(self) -> "InvoicePost":
        if self.due_date and self.invoice_date:
            if self.due_date < self.invoice_date:
                raise ValueError("due date must be after invoice date")
        return self


class InvoiceLineUpdate(BaseModel):
    quantity: Quantity | None = None
    unit_price: Price | None = None


class InvoiceLineRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    product_id: int
    quantity: Decimal
    unit_price: Decimal
    sales_line_id: int | None
    purchase_line_id: int | None
    subtotal: Decimal | None

    @model_validator(mode="after")
    def fill_subtotal(self) -> "InvoiceLineRead":
        if self.subtotal is None:
            self.subtotal = line_subtotal(self.quantity, self.unit_price)
        return self


class PaymentCreate(BaseModel):
    amount: Amount
    paid_on: date
    reference: str | None = Field(default=None, max_length=100)


class PaymentRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    amount: Decimal
    paid_on: date
    reference: str | None
    created_at: datetime
    created_by: UserSummary


class PaymentState(enum.StrEnum):
    not_paid = "not_paid"
    partial = "partial"
    paid = "paid"


class InvoiceRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    number: str | None
    invoice_type: InvoiceType
    state: InvoiceState
    partner_id: int
    sales_order_id: int | None
    purchase_order_id: int | None
    invoice_date: date | None
    due_date: date | None
    posted_at: datetime | None
    posted_by: UserSummary | None
    created_at: datetime
    created_by: UserSummary
    amount_total: Decimal | None
    lines: list[InvoiceLineRead]
    payments: list[PaymentRead]

    @model_validator(mode="after")
    def fill_amount_total(self) -> "InvoiceRead":
        if self.amount_total is None:  # draft: compute live
            total = Decimal("0")
            for line in self.lines:
                assert line.subtotal is not None  # filled by InvoiceLineRead
                total += line.subtotal
            self.amount_total = total
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def amount_paid(self) -> Decimal:
        return sum((p.amount for p in self.payments), Decimal("0"))

    @computed_field  # type: ignore[prop-decorator]
    @property
    def amount_due(self) -> Decimal:
        return (self.amount_total or Decimal("0")) - self.amount_paid

    @computed_field  # type: ignore[prop-decorator]
    @property
    def payment_state(self) -> PaymentState:
        if self.amount_paid == 0:
            return PaymentState.not_paid
        if self.amount_due <= 0:
            return PaymentState.paid
        return PaymentState.partial
