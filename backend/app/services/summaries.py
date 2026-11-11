"""Totals for a product's and a partner's page, added up in the database."""

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice, InvoiceState, InvoiceType, Payment
from app.models.purchase import PurchaseOrder, PurchaseOrderLine, PurchaseState
from app.models.sale import SalesOrder, SalesOrderLine, SalesState
from app.models.stock import StockMove
from app.schemas.summary import CommittedQuantity, InvoiceTotals, OrderTotals, StockTotals
from app.services.moves import DIRECTION, KIND, with_locations

# Empty sums come back as NULL; these keep the usual decimal places
NO_QUANTITY = Decimal("0.000")
NO_MONEY = Decimal("0.00")


# ---- product ----


async def stock_totals(db: AsyncSession, product_id: int) -> StockTotals:
    # Classified by the same rules as the /moves list
    stmt = with_locations(
        select(KIND, DIRECTION, func.sum(StockMove.quantity)).select_from(StockMove)
    )
    stmt = stmt.where(StockMove.product_id == product_id).group_by(KIND, DIRECTION)
    sums = {(kind, direction): qty for kind, direction, qty in await db.execute(stmt)}
    return StockTotals(
        in_=sums.get(("in", 1), NO_QUANTITY),
        out=sums.get(("out", -1), NO_QUANTITY),
        counted_up=sums.get(("count", 1), NO_QUANTITY),
        counted_down=sums.get(("count", -1), NO_QUANTITY),
    )


async def committed_sales(db: AsyncSession, product_id: int) -> CommittedQuantity:
    quantity = await db.scalar(
        select(func.sum(SalesOrderLine.quantity))
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.order_id)
        .where(
            SalesOrderLine.product_id == product_id,
            SalesOrder.state.in_([SalesState.confirmed, SalesState.delivered]),
        )
    )
    return CommittedQuantity(committed_quantity=quantity or NO_QUANTITY)


async def committed_purchases(db: AsyncSession, product_id: int) -> CommittedQuantity:
    quantity = await db.scalar(
        select(func.sum(PurchaseOrderLine.quantity))
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.order_id)
        .where(
            PurchaseOrderLine.product_id == product_id,
            PurchaseOrder.state.in_([PurchaseState.confirmed, PurchaseState.received]),
        )
    )
    return CommittedQuantity(committed_quantity=quantity or NO_QUANTITY)


# ---- partner ----


async def sales_order_totals(db: AsyncSession, partner_id: int) -> OrderTotals:
    # Each line rounded to cents before adding up, as line_subtotal does for one order
    count, total = (
        await db.execute(
            select(
                func.count(SalesOrder.id.distinct()),
                func.sum(func.round(SalesOrderLine.quantity * SalesOrderLine.unit_price, 2)),
            )
            .select_from(SalesOrder)
            .outerjoin(SalesOrderLine, SalesOrderLine.order_id == SalesOrder.id)
            .where(SalesOrder.partner_id == partner_id, SalesOrder.state != SalesState.cancelled)
        )
    ).one()
    return OrderTotals(count=count, total=total or NO_MONEY)


async def purchase_order_totals(db: AsyncSession, partner_id: int) -> OrderTotals:
    count, total = (
        await db.execute(
            select(
                func.count(PurchaseOrder.id.distinct()),
                func.sum(func.round(PurchaseOrderLine.quantity * PurchaseOrderLine.unit_price, 2)),
            )
            .select_from(PurchaseOrder)
            .outerjoin(PurchaseOrderLine, PurchaseOrderLine.order_id == PurchaseOrder.id)
            .where(
                PurchaseOrder.partner_id == partner_id,
                PurchaseOrder.state != PurchaseState.cancelled,
            )
        )
    ).one()
    return OrderTotals(count=count, total=total or NO_MONEY)


async def invoice_totals(db: AsyncSession, partner_id: int, kind: InvoiceType) -> InvoiceTotals:
    posted = (
        Invoice.partner_id == partner_id,
        Invoice.invoice_type == kind,
        Invoice.state == InvoiceState.posted,
    )
    invoiced = await db.scalar(select(func.sum(Invoice.amount_total)).where(*posted)) or NO_MONEY
    # Separately: joining payments to invoices would repeat an invoice's total once per payment
    paid = (
        await db.scalar(
            select(func.sum(Payment.amount))
            .join(Invoice, Invoice.id == Payment.invoice_id)
            .where(*posted)
        )
        or NO_MONEY
    )
    return InvoiceTotals(invoiced=invoiced, due=invoiced - paid)
