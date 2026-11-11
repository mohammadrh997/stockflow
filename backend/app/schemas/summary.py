from decimal import Decimal

from pydantic import BaseModel, Field

# A section is None when the user can't see that module (see the summary routes)


class StockTotals(BaseModel):
    # "in" is a Python keyword, so the field is in_ and the JSON key is "in"
    in_: Decimal = Field(serialization_alias="in")  # received from suppliers
    out: Decimal  # delivered to customers
    counted_up: Decimal  # stock counts that found more
    counted_down: Decimal  # stock counts that found less


class CommittedQuantity(BaseModel):
    committed_quantity: Decimal  # on confirmed and finished orders; not drafts or cancelled


class ProductSummary(BaseModel):
    stock: StockTotals | None
    sales: CommittedQuantity | None
    purchases: CommittedQuantity | None


class OrderTotals(BaseModel):
    count: int  # every order but cancelled ones, drafts included
    total: Decimal


class InvoiceTotals(BaseModel):
    invoiced: Decimal  # posted only
    due: Decimal  # what's still unpaid on them


class PartnerSummary(BaseModel):
    sales_orders: OrderTotals | None
    purchase_orders: OrderTotals | None
    customer_invoices: InvoiceTotals | None
    vendor_bills: InvoiceTotals | None
