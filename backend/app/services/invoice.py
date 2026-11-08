from collections.abc import Sequence
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.invoice import Invoice, InvoiceLine, InvoiceState, InvoiceType, Payment
from app.models.purchase import PurchaseOrder, PurchaseOrderLine
from app.models.sale import SalesOrder, SalesOrderLine
from app.models.stock import StockMove
from app.schemas.common import line_subtotal
from app.schemas.invoice import InvoiceCreate, InvoiceLineUpdate, InvoicePost, PaymentCreate
from app.services.common import (
    LineNotFound,
)
from app.services.purchase import lock_purchase_order
from app.services.references import RefSequence, next_number
from app.services.sale import lock_sales_order


class InvoiceNotFound(Exception): ...  # 404 (from the URL)


class InvoiceNotDraft(Exception): ...  # 409 (state conflict)


class NothingToInvoice(Exception): ...  # 409 (state conflict)


class InvoiceNotPosted(Exception): ...  # 409 (state conflict)


class InvoiceHasPayments(Exception): ...  # 409 (state conflict)


class PaymentExceedsAmountDue(Exception): ...  # 409 (state conflict)


class QuantityExceedsInvoiceable(Exception): ...  # 409 (state conflict)


class InvoiceHasNoLines(Exception): ...  # 409 (state conflict)


class InvoiceAlreadyCancelled(Exception): ...  # 409 (state conflict)


class InvalidDueDate(Exception): ...  # 422 (invalid input)


def _get_line(invoice: Invoice, line_id: int) -> InvoiceLine:
    line = next(
        (line for line in invoice.lines if line.id == line_id),
        None,
    )
    if line is None:
        raise LineNotFound(line_id)
    return line


async def _invoiceable_quantities(
    db: AsyncSession, kind: InvoiceType, line_ids: list[int]
) -> dict[int, Decimal]:
    if kind == InvoiceType.customer_invoice:
        move_link, invoice_link = StockMove.sales_line_id, InvoiceLine.sales_line_id
    else:
        move_link, invoice_link = StockMove.purchase_line_id, InvoiceLine.purchase_line_id

    rows = await db.execute(
        select(move_link, func.sum(StockMove.quantity))
        .where(move_link.in_(line_ids))
        .group_by(move_link)
    )
    delivered = {line_id: qty for line_id, qty in rows.tuples()}

    rows = await db.execute(
        select(invoice_link, func.sum(InvoiceLine.quantity))
        .join(Invoice)
        .where(invoice_link.in_(line_ids), Invoice.state != InvoiceState.cancelled)
        .group_by(invoice_link)
    )
    invoiced = {line_id: qty for line_id, qty in rows.tuples()}

    return {
        line_id: delivered.get(line_id, Decimal("0")) - invoiced.get(line_id, Decimal("0"))
        for line_id in line_ids
    }


def _line_from_order_line(
    kind: InvoiceType, order_line: SalesOrderLine | PurchaseOrderLine, quantity: Decimal
) -> InvoiceLine:
    line = InvoiceLine(
        product_id=order_line.product_id,
        quantity=quantity,
        unit_price=order_line.unit_price,
    )
    if kind == InvoiceType.customer_invoice:
        line.sales_line_id = order_line.id
    else:
        line.purchase_line_id = order_line.id
    return line


async def fetch_invoice(db: AsyncSession, invoice_id: int) -> Invoice:
    invoice = await db.scalar(
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(selectinload(Invoice.lines), selectinload(Invoice.payments))
        .execution_options(populate_existing=True)
    )
    if invoice is None:
        raise InvoiceNotFound(invoice_id)
    return invoice


async def _lock_invoice(db: AsyncSession, invoice_id: int) -> Invoice:
    invoice = await db.scalar(
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(selectinload(Invoice.lines), selectinload(Invoice.payments))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if invoice is None:
        raise InvoiceNotFound(invoice_id)
    return invoice


async def list_invoices(
    db: AsyncSession,
    state: InvoiceState | None = None,
    invoice_type: InvoiceType | None = None,
    partner_id: int | None = None,
    skip: int | None = None,
    limit: int | None = None,
) -> Sequence[Invoice]:
    stmt = select(Invoice).order_by(Invoice.id)
    if state:
        stmt = stmt.where(Invoice.state == state)
    if invoice_type:
        stmt = stmt.where(Invoice.invoice_type == invoice_type)
    if partner_id:
        stmt = stmt.where(Invoice.partner_id == partner_id)
    if skip:
        stmt = stmt.offset(skip)
    if limit:
        stmt = stmt.limit(limit)
    stmt = stmt.options(selectinload(Invoice.lines), selectinload(Invoice.payments))
    invoices = (await db.scalars(stmt)).all()
    return invoices


async def create_invoice(db: AsyncSession, data: InvoiceCreate, user_id: int) -> Invoice:
    order: SalesOrder | PurchaseOrder
    if data.sales_order_id is not None:
        kind = InvoiceType.customer_invoice
        order = await lock_sales_order(db, data.sales_order_id)
    else:
        assert data.purchase_order_id is not None  # InvoiceCreate guarantees exactly one
        kind = InvoiceType.vendor_bill
        order = await lock_purchase_order(db, data.purchase_order_id)

    invoiceable = await _invoiceable_quantities(db, kind, [line.id for line in order.lines])
    lines = [
        _line_from_order_line(kind, order_line, qty)
        for order_line in order.lines
        if (qty := invoiceable[order_line.id]) > 0
    ]
    if not lines:
        raise NothingToInvoice(order.reference)

    invoice = Invoice(
        invoice_type=kind,
        partner_id=order.partner_id,
        sales_order_id=order.id if kind == InvoiceType.customer_invoice else None,
        purchase_order_id=order.id if kind == InvoiceType.vendor_bill else None,
        created_by_id=user_id,
        lines=lines,
    )
    db.add(invoice)
    await db.commit()
    return await fetch_invoice(db, invoice.id)


async def update_line(
    db: AsyncSession, invoice_id: int, line_id: int, data: InvoiceLineUpdate
) -> Invoice:
    invoice = await fetch_invoice(db, invoice_id)
    kind = invoice.invoice_type
    if kind == InvoiceType.customer_invoice:
        assert invoice.sales_order_id is not None
        await lock_sales_order(db, invoice.sales_order_id)
    else:
        assert invoice.purchase_order_id is not None
        await lock_purchase_order(db, invoice.purchase_order_id)

    invoice = await _lock_invoice(db, invoice_id)  # order -> invoice
    if invoice.state != InvoiceState.draft:
        raise InvoiceNotDraft(invoice_id)
    line = _get_line(invoice, line_id)

    if data.quantity is not None:
        order_line_id = (
            line.sales_line_id if kind == InvoiceType.customer_invoice else line.purchase_line_id
        )
        assert order_line_id is not None
        invoiceable = (await _invoiceable_quantities(db, kind, [order_line_id]))[order_line_id]
        limit = invoiceable + line.quantity
        if data.quantity > limit:
            raise QuantityExceedsInvoiceable(f"at most {limit} can be invoiced")
        line.quantity = data.quantity
    if data.unit_price is not None:
        line.unit_price = data.unit_price

    await db.commit()
    return await fetch_invoice(db, invoice_id)


async def delete_line(db: AsyncSession, invoice_id: int, line_id: int) -> Invoice:
    invoice = await _lock_invoice(db, invoice_id)
    if invoice.state != InvoiceState.draft:
        raise InvoiceNotDraft(invoice_id)
    line = _get_line(invoice, line_id)
    await db.delete(line)
    await db.commit()
    return await fetch_invoice(db, invoice_id)


async def post_invoice(
    db: AsyncSession, invoice_id: int, data: InvoicePost, user_id: int
) -> Invoice:
    invoice = await _lock_invoice(db, invoice_id)
    if invoice.state != InvoiceState.draft:
        raise InvoiceNotDraft(invoice_id)
    if not invoice.lines:
        raise InvoiceHasNoLines(invoice_id)

    invoice_date = data.invoice_date or date.today()
    due_date = data.due_date or invoice_date
    if due_date < invoice_date:
        raise InvalidDueDate("due_date can't be before invoice_date")

    total = Decimal("0")
    for line in invoice.lines:
        line.subtotal = line_subtotal(line.quantity, line.unit_price)
        total += line.subtotal

    if invoice.invoice_type == InvoiceType.customer_invoice:
        number = await next_number(db, RefSequence.invoice)
        invoice.number = f"INV{number:05d}"
    else:
        number = await next_number(db, RefSequence.vendor_bill)
        invoice.number = f"BILL{number:05d}"

    invoice.amount_total = total
    invoice.invoice_date = invoice_date
    invoice.due_date = due_date
    invoice.posted_at = datetime.now(UTC)
    invoice.posted_by_id = user_id
    invoice.state = InvoiceState.posted
    await db.commit()
    return await fetch_invoice(db, invoice_id)


async def cancel_invoice(db: AsyncSession, invoice_id: int) -> Invoice:
    invoice = await _lock_invoice(db, invoice_id)
    if invoice.state == InvoiceState.cancelled:
        raise InvoiceAlreadyCancelled(invoice_id)
    if invoice.state == InvoiceState.posted and invoice.payments:
        raise InvoiceHasPayments(invoice_id)
    invoice.state = InvoiceState.cancelled
    await db.commit()
    return await fetch_invoice(db, invoice_id)


async def register_payment(
    db: AsyncSession, invoice_id: int, data: PaymentCreate, user_id: int
) -> Invoice:
    invoice = await _lock_invoice(db, invoice_id)
    if invoice.state != InvoiceState.posted:
        raise InvoiceNotPosted(invoice_id)
    paid = (
        await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.invoice_id == invoice.id
            )
        )
    ).scalar_one()
    assert invoice.amount_total is not None
    due = invoice.amount_total - paid
    if data.amount > due:
        raise PaymentExceedsAmountDue(f"only {due} is due")
    payment = Payment(
        invoice_id=invoice_id,
        amount=data.amount,
        paid_on=data.paid_on,
        reference=data.reference,
        created_by_id=user_id,
    )
    db.add(payment)
    await db.commit()
    return await fetch_invoice(db, invoice_id)
