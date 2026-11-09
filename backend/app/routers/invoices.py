from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import (
    CurrentUser,
    DBsession,
    Module,
    has_access,
    pagination_params,
    require_any_access,
)
from app.models.invoice import Invoice, InvoiceState, InvoiceType
from app.models.user import Access, User
from app.routers.pdf import PDF_RESPONSE, pdf_response
from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceLineUpdate,
    InvoicePost,
    InvoiceRead,
    PaymentCreate,
)
from app.services import documents
from app.services import invoice as invoice_service
from app.services.common import LineNotFound
from app.services.documents import DocumentNotAvailable
from app.services.invoice import (
    InvalidDueDate,
    InvoiceAlreadyCancelled,
    InvoiceHasNoLines,
    InvoiceHasPayments,
    InvoiceNotDraft,
    InvoiceNotFound,
    InvoiceNotPosted,
    NothingToInvoice,
    PaymentExceedsAmountDue,
    QuantityExceedsInvoiceable,
)
from app.services.purchase import PurchaseOrderNotFound
from app.services.sale import SalesOrderNotFound

_MODULE = {InvoiceType.customer_invoice: Module.sales, InvoiceType.vendor_bill: Module.purchase}

PaginationDep = Annotated[dict, Depends(pagination_params)]


def _check(user: User, kind: InvoiceType, level: Access) -> None:
    if not has_access(user, _MODULE[kind], level):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")


async def _get_invoice_for(db: AsyncSession, invoice_id: int, user: User, level: Access) -> Invoice:
    try:
        invoice = await invoice_service.fetch_invoice(db, invoice_id)
    except InvoiceNotFound:
        raise HTTPException(status_code=404, detail="Invoice not found") from None
    _check(user, invoice.invoice_type, level)
    return invoice


router = APIRouter(
    prefix="/invoices",
    tags=["invoices"],
    dependencies=[Depends(require_any_access(Module.sales, Module.purchase, level=Access.user))],
)


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
async def create_invoice(db: DBsession, payload: InvoiceCreate, user: CurrentUser):
    try:
        kind = (
            InvoiceType.customer_invoice
            if payload.sales_order_id is not None
            else InvoiceType.vendor_bill
        )
        _check(user, kind, Access.user)
        return await invoice_service.create_invoice(db, payload, user.id)
    except NothingToInvoice as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except (SalesOrderNotFound, PurchaseOrderNotFound) as exc:
        raise HTTPException(status_code=400, detail=f"order {exc} not found") from None


@router.get("", response_model=list[InvoiceRead])
async def list_invoices(
    db: DBsession,
    pagination: PaginationDep,
    state: InvoiceState | None = None,
    invoice_type: InvoiceType | None = None,
    partner_id: int | None = None,
    purchase_order_id: int | None = None,
    sales_order_id: int | None = None,
):
    skip, limit = pagination["skip"], pagination["limit"]
    return await invoice_service.list_invoices(
        db,
        state=state,
        invoice_type=invoice_type,
        partner_id=partner_id,
        purchase_order_id=purchase_order_id,
        sales_order_id=sales_order_id,
        skip=skip,
        limit=limit,
    )


@router.get("/{invoice_id}", response_model=InvoiceRead)
async def get_invoice(db: DBsession, invoice_id: int):
    try:
        return await invoice_service.fetch_invoice(db, invoice_id)
    except InvoiceNotFound:
        raise HTTPException(status_code=404, detail="Invoice not found") from None


@router.patch("/{invoice_id}/lines/{line_id}", response_model=InvoiceRead)
async def update_invoice_line(
    db: DBsession, invoice_id: int, line_id: int, payload: InvoiceLineUpdate, user: CurrentUser
):
    try:
        await _get_invoice_for(db, invoice_id, user, Access.user)
        return await invoice_service.update_line(db, invoice_id, line_id, payload)
    except InvoiceNotDraft:
        raise HTTPException(status_code=409, detail="Invoice is not Draft") from None
    except LineNotFound:
        raise HTTPException(status_code=404, detail="Line was not found") from None
    except QuantityExceedsInvoiceable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.delete("/{invoice_id}/lines/{line_id}", response_model=InvoiceRead)
async def delete_invoice_line(db: DBsession, invoice_id: int, line_id: int, user: CurrentUser):
    try:
        await _get_invoice_for(db, invoice_id, user, Access.user)
        return await invoice_service.delete_line(db, invoice_id, line_id)
    except InvoiceNotDraft:
        raise HTTPException(status_code=409, detail="Invoice is not Draft") from None
    except LineNotFound:
        raise HTTPException(status_code=404, detail="Line was not found") from None


@router.post("/{invoice_id}/post", response_model=InvoiceRead)
async def post_invoice(db: DBsession, invoice_id: int, payload: InvoicePost, user: CurrentUser):
    try:
        await _get_invoice_for(db, invoice_id, user, Access.manager)
        return await invoice_service.post_invoice(db, invoice_id, payload, user.id)
    except InvoiceNotDraft:
        raise HTTPException(status_code=409, detail="Invoice is not Draft") from None
    except InvoiceHasNoLines:
        raise HTTPException(status_code=409, detail="Invoice has no lines") from None
    except InvalidDueDate as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


@router.post("/{invoice_id}/cancel", response_model=InvoiceRead)
async def cancel_invoice(db: DBsession, invoice_id: int, user: CurrentUser):
    try:
        await _get_invoice_for(db, invoice_id, user, Access.manager)
        return await invoice_service.cancel_invoice(db, invoice_id)
    except InvoiceAlreadyCancelled:
        raise HTTPException(status_code=409, detail="Invoice is already cancelled") from None
    except InvoiceHasPayments:
        raise HTTPException(status_code=409, detail="Invoice has payments") from None


@router.post(
    "/{invoice_id}/payments", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED
)
async def register_payment(
    db: DBsession, invoice_id: int, payload: PaymentCreate, user: CurrentUser
):
    try:
        invoice = await _get_invoice_for(db, invoice_id, user, Access.manager)
        return await invoice_service.register_payment(
            db, invoice_id=invoice.id, data=payload, user_id=user.id
        )
    except InvoiceNotPosted:
        raise HTTPException(status_code=409, detail="Invoice is not Posted") from None
    except PaymentExceedsAmountDue as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.get("/{invoice_id}/pdf", response_class=Response, responses=PDF_RESPONSE)
async def invoice_pdf(db: DBsession, invoice_id: int, user: CurrentUser):
    await _get_invoice_for(db, invoice_id, user, Access.user)
    try:
        doc = await documents.invoice_document(db, invoice_id)
    except DocumentNotAvailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return pdf_response(await documents.render_pdf(doc), doc.filename)
