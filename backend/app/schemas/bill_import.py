from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, computed_field

from app.models.bill_import import BillImportState
from app.schemas.common import PartnerReference, Price, Quantity, line_subtotal
from app.schemas.user import UserSummary


class BillImportUpdate(BaseModel):
    partner_id: int | None = None
    partner_reference: PartnerReference = None  # sending null removes it
    warehouse_id: int | None = None


class BillImportLineUpdate(BaseModel):
    product_id: int | None = None  # sending null removes the match
    quantity: Quantity | None = None
    unit_price: Price | None = None


class BillImportLineRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    description: str
    product_code: str | None
    quantity: Decimal
    unit_price: Decimal
    product_id: int | None
    match_score: Decimal | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def subtotal(self) -> Decimal:
        return line_subtotal(self.quantity, self.unit_price)


WarningCode = Literal[
    "no_supplier",
    "no_warehouse",
    "no_lines",
    "missing_products",
    "archived_products",
    "reference_used",
    "currency_differs",
    "total_differs",
]


class ImportWarning(BaseModel):
    code: WarningCode
    message: str
    blocks_confirm: bool  # the import can't become an order until this is fixed


class BillImportRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    state: BillImportState
    supplier_name: str | None
    partner_id: int | None
    partner_reference: str | None
    bill_date: date | None
    currency: str | None
    bill_total: Decimal | None
    warehouse_id: int | None
    purchase_order_id: int | None
    file_type: str | None  # the kept bill's MIME type; null when there's no file to show
    products_requested_at: datetime | None  # when inventory was asked for the missing products
    products_requested_by: UserSummary | None
    created_at: datetime
    created_by: UserSummary
    lines: list[BillImportLineRead]
    warnings: list[ImportWarning] = []  # only while open; see services/bill_import.py

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total(self) -> Decimal:
        return sum((line.subtotal for line in self.lines), Decimal("0"))


class BillImportSummary(BaseModel):
    """A row in the list: enough to find an import, without its review."""

    model_config = {"from_attributes": True}

    id: int
    state: BillImportState
    supplier_name: str | None
    partner_id: int | None
    partner_reference: str | None
    purchase_order_id: int | None
    products_requested_at: datetime | None
    created_at: datetime
    created_by: UserSummary
    lines: list[BillImportLineRead] = Field(exclude=True)  # only counted, not sent

    @computed_field  # type: ignore[prop-decorator]
    @property
    def line_count(self) -> int:
        return len(self.lines)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def missing_products(self) -> int:
        """Lines still without a product."""
        return sum(1 for line in self.lines if line.product_id is None)


class RequestedImport(BaseModel):
    """The bill an item waiting for a product came from."""

    model_config = {"from_attributes": True}

    id: int
    supplier_name: str | None  # as printed
    partner_id: int | None
    partner_reference: str | None
    file_type: str | None
    products_requested_at: datetime
    products_requested_by: UserSummary


class MissingProductRead(BaseModel):
    """An item inventory is asked to create a product for."""

    model_config = {"from_attributes": True}

    id: int  # the item's (line's) id
    description: str
    product_code: str | None
    quantity: Decimal
    unit_price: Decimal  # what the supplier charges: a starting point for the cost price
    bill_import: RequestedImport
