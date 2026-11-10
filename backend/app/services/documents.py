"""Printable PDFs: invoices, vendor bills, sales orders and purchase orders.

All four share one HTML template (app/templates/document.html). Each builder loads its
record and turns it into a `Document`; `render` fills the template and WeasyPrint turns
the HTML into a PDF.
"""

import asyncio
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import url2pathname

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.invoice import Invoice, InvoiceLine, InvoiceState, InvoiceType
from app.models.partner import Partner
from app.models.purchase import PurchaseOrder, PurchaseOrderLine, PurchaseState
from app.models.sale import SalesOrder, SalesOrderLine, SalesState
from app.schemas.common import line_subtotal
from app.services.invoice import InvoiceNotFound
from app.services.purchase import PurchaseOrderNotFound
from app.services.sale import SalesOrderNotFound

APP_DIR = Path(__file__).resolve().parent.parent
ASSETS = APP_DIR / "assets"  # fonts and logo; the template's relative URLs point here


class DocumentNotAvailable(Exception): ...  # 409: the record's state can't be printed


@dataclass
class DocumentLine:
    sku: str
    name: str
    quantity: Decimal
    unit_price: Decimal
    subtotal: Decimal


@dataclass
class Document:
    title: str  # "Invoice", "Quotation", ...
    number_label: str  # "Invoice number", "Order number", ...
    number: str | None  # None on a draft invoice: numbers are given at posting
    partner_label: str  # "Bill to", "Customer", ...
    partner: Partner
    details: list[tuple[str, date | str]]  # dates and the related order, under the number
    lines: list[DocumentLine]
    total: Decimal
    filename: str
    watermark: str | None = None  # "DRAFT" across every page


# ---- rendering ----


def _money(value: Decimal) -> str:
    return f"{value:,.2f}"


def _quantity(value: Decimal) -> str:
    return f"{value.normalize():f}"  # 4.000 -> "4", 2.500 -> "2.5"


def _direction(text: str) -> str:
    """'rtl' if the text starts with Arabic (its first strong character), else 'ltr'."""
    for char in text:
        kind = unicodedata.bidirectional(char)
        if kind in ("R", "AL"):
            return "rtl"
        if kind == "L":
            return "ltr"
    return "ltr"


_templates = Environment(
    loader=FileSystemLoader(APP_DIR / "templates"),
    autoescape=select_autoescape(["html"]),  # partner and product names are user input
)
_templates.filters.update(money=_money, quantity=_quantity, direction=_direction)


def render(doc: Document) -> bytes:
    # Imported here, not at the top: WeasyPrint needs the Pango system library, which
    # Docker and CI install. Without it only the PDF endpoints fail, not the whole app.
    from weasyprint import HTML

    html = _templates.get_template("document.html").render(
        doc=doc,
        company={"name": settings.company_name, "address": settings.company_address},
    )
    pdf = HTML(string=html, base_url=str(ASSETS), url_fetcher=_assets_only_fetcher()).write_pdf()
    assert pdf is not None  # write_pdf() only returns None when given a target file
    return pdf


def _assets_only_fetcher():
    """A WeasyPrint fetcher that may load our fonts and logo, and nothing else.

    WeasyPrint fetches every URL a document refers to. Ours only refer to app/assets,
    but if a URL ever reached a template (a product image, say), this keeps a PDF from
    reading other files on the server or calling internal addresses.
    """
    from weasyprint.urls import URLFetcher

    class AssetsOnly(URLFetcher):
        def fetch(self, url, headers=None):
            parsed = urlparse(url)
            if parsed.scheme != "file":
                raise ValueError(f"only bundled assets can be loaded, not {url}")
            path = Path(url2pathname(parsed.path)).resolve()
            if not path.is_relative_to(ASSETS):
                raise ValueError(f"only bundled assets can be loaded, not {url}")
            return super().fetch(url, headers)

    return AssetsOnly()


async def render_pdf(doc: Document) -> bytes:
    # Rendering takes ~100 ms of CPU. In a thread, so other requests keep being served.
    return await asyncio.to_thread(render, doc)


# ---- builders ----


def _lines(lines: Sequence[SalesOrderLine | PurchaseOrderLine | InvoiceLine]) -> list[DocumentLine]:
    result = []
    for line in lines:
        # Only posted invoices store a subtotal; drafts and orders can still change
        subtotal = line.subtotal if isinstance(line, InvoiceLine) else None
        if subtotal is None:
            subtotal = line_subtotal(line.quantity, line.unit_price)
        product = line.product
        result.append(
            DocumentLine(product.sku, product.name, line.quantity, line.unit_price, subtotal)
        )
    return result


def _total(lines: list[DocumentLine]) -> Decimal:
    return sum((line.subtotal for line in lines), Decimal("0"))


async def invoice_document(db: AsyncSession, invoice_id: int) -> Document:
    invoice = await db.scalar(
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(
            selectinload(Invoice.lines).selectinload(InvoiceLine.product),
            selectinload(Invoice.partner),
            selectinload(Invoice.sales_order),
            selectinload(Invoice.purchase_order),
        )
    )
    if invoice is None:
        raise InvoiceNotFound(invoice_id)
    if invoice.state == InvoiceState.cancelled:
        raise DocumentNotAvailable("cancelled invoices can't be printed")

    is_bill = invoice.invoice_type == InvoiceType.vendor_bill
    kind = "Vendor bill" if is_bill else "Invoice"
    order = invoice.purchase_order if is_bill else invoice.sales_order
    assert order is not None  # every invoice comes from an order (origin_matches_type)
    lines = _lines(invoice.lines)

    if invoice.state == InvoiceState.draft:
        return Document(
            title=f"Draft {kind.lower()}",
            number_label="",
            number=None,
            partner_label="Vendor" if is_bill else "Bill to",
            partner=invoice.partner,
            details=[("Created", invoice.created_at.date()), ("Order", order.reference)],
            lines=lines,
            total=_total(lines),
            filename=f"draft-{'bill' if is_bill else 'invoice'}-{invoice.id}.pdf",
            watermark="DRAFT",
        )

    # posted: number, dates and total were fixed at posting (posted_has_number_and_total)
    assert invoice.number and invoice.amount_total is not None
    assert invoice.invoice_date and invoice.due_date
    return Document(
        title=kind,
        number_label="Bill number" if is_bill else "Invoice number",
        number=invoice.number,
        partner_label="Vendor" if is_bill else "Bill to",
        partner=invoice.partner,
        details=[
            ("Invoice date", invoice.invoice_date),
            ("Due date", invoice.due_date),
            ("Order", order.reference),
        ],
        lines=lines,
        total=invoice.amount_total,
        filename=f"{invoice.number}.pdf",
    )


async def sales_order_document(db: AsyncSession, order_id: int) -> Document:
    order = await db.scalar(
        select(SalesOrder)
        .where(SalesOrder.id == order_id)
        .options(
            selectinload(SalesOrder.lines).selectinload(SalesOrderLine.product),
            selectinload(SalesOrder.partner),
        )
    )
    if order is None:
        raise SalesOrderNotFound(order_id)
    if order.state == SalesState.cancelled:
        raise DocumentNotAvailable(f"{order.reference} is cancelled")

    lines = _lines(order.lines)
    return Document(
        title="Quotation" if order.state == SalesState.draft else "Sales order",
        number_label="Quotation number" if order.state == SalesState.draft else "Order number",
        number=order.reference,
        partner_label="Customer",
        partner=order.partner,
        details=[("Date", order.created_at.date())],
        lines=lines,
        total=_total(lines),
        filename=f"{order.reference}.pdf",
    )


async def purchase_order_document(db: AsyncSession, order_id: int) -> Document:
    order = await db.scalar(
        select(PurchaseOrder)
        .where(PurchaseOrder.id == order_id)
        .options(
            selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.product),
            selectinload(PurchaseOrder.partner),
        )
    )
    if order is None:
        raise PurchaseOrderNotFound(order_id)
    if order.state == PurchaseState.cancelled:
        raise DocumentNotAvailable(f"{order.reference} is cancelled")

    is_rfq = order.state == PurchaseState.draft
    lines = _lines(order.lines)
    return Document(
        title="Request for quotation" if is_rfq else "Purchase order",
        number_label="RFQ number" if is_rfq else "Order number",
        number=order.reference,
        partner_label="Supplier",
        partner=order.partner,
        details=[("Date", order.created_at.date())],
        lines=lines,
        total=_total(lines),
        filename=f"{order.reference}.pdf",
    )
