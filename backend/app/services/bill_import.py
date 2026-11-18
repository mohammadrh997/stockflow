"""Supplier bills read from a file, reviewed, then confirmed into a draft purchase order.

The model only reads the bill (bill_reader.py). Matching the bill to our supplier and
products happens here, in the database: exact codes first, then similar names with
pg_trgm, and only when the match is close. A wrong automatic match is worse than none,
because the user might not notice it.
"""

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bill_import import BillImport, BillImportLine, BillImportState
from app.models.partner import Partner
from app.models.product import Product
from app.models.purchase import PurchaseOrder, PurchaseState
from app.models.warehouse import Warehouse
from app.schemas.bill_import import (
    BillImportLineUpdate,
    BillImportUpdate,
    ImportWarning,
    WarningCode,
)
from app.schemas.common import line_subtotal
from app.schemas.purchase import PurchaseOrderCreate, PurchaseOrderLineCreate
from app.services import purchase as purchase_service
from app.services.bill_reader import BillReader, bill_file_type
from app.services.common import InvalidReference, LineNotFound, Page, paginate
from app.services.company import get_company

# Below this similarity a name match is left for the user to choose. Measured on real
# descriptions: "Office Chair Ergonomic, black" scores 0.79 against "Ergonomic Office Chair",
# while "Wireless Keyboard" scores 0.38 against "Wireless Mouse", a match we must not make.
MIN_SIMILARITY = 0.45


class BillImportNotFound(Exception): ...  # 404


class ImportNotOpen(Exception): ...  # 409: already confirmed or discarded


class ImportNotReady(Exception): ...  # 409: something blocks confirming (see the warnings)


# ---- matching ----


async def _match_product(
    db: AsyncSession, code: str | None, description: str
) -> tuple[int | None, Decimal | None]:
    if code:
        product_id = await db.scalar(
            select(Product.id).where(Product.is_active, func.lower(Product.sku) == code.lower())
        )
        if product_id is not None:
            return product_id, Decimal("1")

    score = func.similarity(Product.name, description)
    row = (
        await db.execute(
            select(Product.id, score)
            # `%` is "similar enough" (pg_trgm's own 0.3 floor); it lets the index do the work
            .where(Product.is_active, Product.name.op("%")(description))
            .order_by(score.desc(), Product.id)
            .limit(1)
        )
    ).first()
    if row is None or row[1] < MIN_SIMILARITY:
        return None, None
    return row[0], Decimal(str(round(row[1], 3)))


async def _match_supplier(db: AsyncSession, name: str | None) -> int | None:
    if not name:
        return None
    exact = await db.scalar(
        select(Partner.id)
        .where(Partner.is_active, func.lower(Partner.name) == name.lower())
        .order_by(Partner.is_supplier.desc(), Partner.id)
        .limit(1)
    )
    if exact is not None:
        return exact

    score = func.similarity(Partner.name, name)
    row = (
        await db.execute(
            select(Partner.id, score)
            .where(Partner.is_active, Partner.name.op("%")(name))
            .order_by(Partner.is_supplier.desc(), score.desc(), Partner.id)
            .limit(1)
        )
    ).first()
    return row[0] if row is not None and row[1] >= MIN_SIMILARITY else None


async def _default_warehouse(db: AsyncSession) -> int | None:
    # The first warehouse, which is the main one; the user can pick another in the review
    return await db.scalar(select(Warehouse.id).order_by(Warehouse.id).limit(1))


# ---- reading ----


async def import_bill(
    db: AsyncSession, reader: BillReader, data: bytes, user_id: int
) -> BillImport:
    # The login check left a transaction open. End it, so no pooled connection sits idle
    # while the bill is checked and read, which can take a minute.
    await db.rollback()
    mime_type = await bill_file_type(data)
    bill = await reader.read(data, mime_type)

    lines = []
    for line in bill.lines:
        product_id, score = await _match_product(db, line.product_code, line.description)
        lines.append(
            BillImportLine(
                description=line.description,
                product_code=line.product_code,
                quantity=line.quantity,
                unit_price=line.unit_price,
                product_id=product_id,
                match_score=score,
            )
        )
    bill_import = BillImport(
        supplier_name=bill.supplier_name,
        partner_id=await _match_supplier(db, bill.supplier_name),
        partner_reference=bill.bill_number,
        bill_date=bill.bill_date,
        currency=bill.currency,
        bill_total=bill.total,
        warehouse_id=await _default_warehouse(db),
        created_by_id=user_id,
        lines=lines,
    )
    db.add(bill_import)
    await db.commit()
    return await fetch_import(db, bill_import.id)


# ---- loading ----


async def fetch_import(db: AsyncSession, import_id: int) -> BillImport:
    bill_import = await db.scalar(
        select(BillImport)
        .where(BillImport.id == import_id)
        .options(selectinload(BillImport.lines))
        .execution_options(populate_existing=True)
    )
    if bill_import is None:
        raise BillImportNotFound(import_id)
    return bill_import


async def _lock_import(db: AsyncSession, import_id: int) -> BillImport:
    bill_import = await db.scalar(
        select(BillImport)
        .where(BillImport.id == import_id)
        .options(selectinload(BillImport.lines))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if bill_import is None:
        raise BillImportNotFound(import_id)
    if bill_import.state != BillImportState.open:
        raise ImportNotOpen(f"this import is already {bill_import.state}")
    return bill_import


async def list_imports(
    db: AsyncSession,
    skip: int,
    limit: int,
    state: BillImportState | None = None,
    purchase_order_id: int | None = None,
) -> Page[BillImport]:
    stmt = select(BillImport).order_by(BillImport.id.desc())  # newest first
    if state is not None:
        stmt = stmt.where(BillImport.state == state)
    if purchase_order_id is not None:  # the import an order came from
        stmt = stmt.where(BillImport.purchase_order_id == purchase_order_id)
    return await paginate(db, stmt.options(selectinload(BillImport.lines)), skip, limit)


# ---- the review ----


def _count(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"  # "1 item has", "3 items have"


async def review(db: AsyncSession, bill_import: BillImport) -> list[ImportWarning]:
    """What's wrong with an open import, worst first. Worked out each time, never stored,
    so it can't disagree with the lines."""
    if bill_import.state != BillImportState.open:
        return []
    warnings: list[ImportWarning] = []

    def warn(code: WarningCode, message: str, blocks: bool) -> None:
        warnings.append(ImportWarning(code=code, message=message, blocks_confirm=blocks))

    if bill_import.partner_id is None:
        warn("no_supplier", "Choose the supplier", True)
    if bill_import.warehouse_id is None:
        warn("no_warehouse", "Choose the warehouse the goods go to", True)
    lines = bill_import.lines
    if not lines:
        warn("no_lines", "The bill has no items left", True)

    missing = sum(1 for line in lines if line.product_id is None)
    if missing:
        warn(
            "missing_products",
            f"{_count(missing, 'item has', 'items have')} no product yet",
            True,
        )
    chosen = {line.product_id for line in lines if line.product_id is not None}
    if chosen:
        archived = await db.scalar(
            select(func.count()).where(Product.id.in_(chosen), Product.is_active.is_(False))
        )
        if archived:
            warn(
                "archived_products",
                f"{_count(archived, 'chosen product is', 'chosen products are')} archived",
                True,
            )

    if bill_import.partner_id is not None and bill_import.partner_reference is not None:
        taken = await db.scalar(
            select(PurchaseOrder.reference).where(
                PurchaseOrder.partner_id == bill_import.partner_id,
                func.lower(PurchaseOrder.partner_reference)
                == func.lower(bill_import.partner_reference),
                PurchaseOrder.state != PurchaseState.cancelled,
            )
        )
        if taken is not None:
            warn(
                "reference_used",
                f"Bill {bill_import.partner_reference} is already on {taken}",
                True,
            )

    company_currency = (await get_company(db)).currency
    if bill_import.currency is not None and bill_import.currency != company_currency:
        warn(
            "currency_differs",
            f"The bill is in {bill_import.currency}; orders are in {company_currency}",
            False,
        )
    total = sum((line_subtotal(line.quantity, line.unit_price) for line in lines), Decimal("0"))
    if bill_import.bill_total is not None and lines and total != bill_import.bill_total:
        warn(
            "total_differs",
            f"The items add up to {total:,.2f}, "
            f"but the bill's total is {bill_import.bill_total:,.2f}",
            False,
        )
    return warnings


# ---- editing ----


async def update_import(db: AsyncSession, import_id: int, data: BillImportUpdate) -> BillImport:
    bill_import = await _lock_import(db, import_id)
    fields = data.model_fields_set
    if "partner_id" in fields and data.partner_id is not None:
        partner = await db.get(Partner, data.partner_id)
        if partner is None or not partner.is_active:
            raise InvalidReference(f"partner {data.partner_id} not found or archived")
        bill_import.partner_id = partner.id
    if "warehouse_id" in fields and data.warehouse_id is not None:
        if await db.get(Warehouse, data.warehouse_id) is None:
            raise InvalidReference(f"warehouse {data.warehouse_id} not found")
        bill_import.warehouse_id = data.warehouse_id
    if "partner_reference" in fields:
        bill_import.partner_reference = data.partner_reference
    await db.commit()
    return await fetch_import(db, import_id)


def _line(bill_import: BillImport, line_id: int) -> BillImportLine:
    line = next((line for line in bill_import.lines if line.id == line_id), None)
    if line is None:
        raise LineNotFound(line_id)
    return line


async def update_line(
    db: AsyncSession, import_id: int, line_id: int, data: BillImportLineUpdate
) -> BillImport:
    bill_import = await _lock_import(db, import_id)
    line = _line(bill_import, line_id)
    fields = data.model_fields_set
    if "product_id" in fields:
        if data.product_id is not None:
            product = await db.get(Product, data.product_id)
            if product is None or not product.is_active:
                raise InvalidReference(f"product {data.product_id} not found or archived")
        line.product_id = data.product_id
        line.match_score = None  # chosen by a person now, not matched
    if data.quantity is not None:
        line.quantity = data.quantity
    if data.unit_price is not None:
        line.unit_price = data.unit_price
    await db.commit()
    return await fetch_import(db, import_id)


async def delete_line(db: AsyncSession, import_id: int, line_id: int) -> BillImport:
    bill_import = await _lock_import(db, import_id)
    await db.delete(_line(bill_import, line_id))
    await db.commit()
    return await fetch_import(db, import_id)


# ---- finishing ----


async def confirm_import(db: AsyncSession, import_id: int, user_id: int) -> BillImport:
    """Turns the import into a draft purchase order, in one transaction: either both the
    order and the import's new state are saved, or neither."""
    bill_import = await _lock_import(db, import_id)  # a second confirm waits, then sees "done"
    blocking = [w.message for w in await review(db, bill_import) if w.blocks_confirm]
    if blocking:
        raise ImportNotReady("; ".join(blocking))
    # review() has blocked anything missing
    assert bill_import.partner_id is not None and bill_import.warehouse_id is not None
    lines = []
    for line in bill_import.lines:
        assert line.product_id is not None
        lines.append(
            PurchaseOrderLineCreate(
                product_id=line.product_id, quantity=line.quantity, unit_price=line.unit_price
            )
        )

    # The order goes through the purchase service, so every check of a normal order
    # applies: an active supplier and products, and an unused supplier reference
    order = await purchase_service.add_purchase_order(
        db,
        PurchaseOrderCreate(
            partner_id=bill_import.partner_id,
            partner_reference=bill_import.partner_reference,
            warehouse_id=bill_import.warehouse_id,
            lines=lines,
        ),
        user_id,
    )
    bill_import.state = BillImportState.done
    bill_import.purchase_order_id = order.id
    await purchase_service.save_order(db, order)
    return await fetch_import(db, import_id)


async def discard_import(db: AsyncSession, import_id: int) -> BillImport:
    bill_import = await _lock_import(db, import_id)
    bill_import.state = BillImportState.discarded
    await db.commit()
    return await fetch_import(db, import_id)
