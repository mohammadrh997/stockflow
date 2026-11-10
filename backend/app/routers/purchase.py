from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.dependencies import (
    CurrentUser,
    DBsession,
    Module,
    OptionalStorageDep,
    pagination_params,
    require_access,
)
from app.models.purchase import PurchaseState
from app.models.user import Access, User
from app.routers.pdf import PDF_RESPONSE, pdf_response
from app.schemas.purchase import (
    PurchaseOrderCreate,
    PurchaseOrderLineCreate,
    PurchaseOrderLineUpdate,
    PurchaseOrderRead,
    PurchaseOrderUpdate,
)
from app.services import documents
from app.services import purchase as purchase_service
from app.services.documents import DocumentNotAvailable
from app.services.purchase import (
    InvalidReference,
    LineNotFound,
    OrderHasNoLines,
    OrderNotCancellable,
    OrderNotEditable,
    PurchaseOrderNotFound,
)

PurchaseManager = Annotated[User, Depends(require_access(Module.purchase, Access.manager))]
PaginationDep = Annotated[dict, Depends(pagination_params)]

router = APIRouter(
    prefix="/purchase-orders",
    tags=["purchase-orders"],
    dependencies=[Depends(require_access(Module.purchase, Access.user))],
)


@router.post("", response_model=PurchaseOrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(db: DBsession, payload: PurchaseOrderCreate, user: CurrentUser):
    try:
        return await purchase_service.create_purchase_order(db, payload, user.id)
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.get("", response_model=list[PurchaseOrderRead])
async def list_orders(
    db: DBsession,
    pagination: PaginationDep,
    state: PurchaseState | None = None,
    partner_id: int | None = None,
):
    skip, limit = pagination["skip"], pagination["limit"]
    return await purchase_service.list_purchase_orders(
        db, state=state, partner_id=partner_id, skip=skip, limit=limit
    )


@router.get("/{order_id}", response_model=PurchaseOrderRead)
async def get_order(db: DBsession, order_id: int):
    try:
        return await purchase_service.fetch_purchase_order(db, order_id)
    except PurchaseOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None


@router.patch("/{order_id}", response_model=PurchaseOrderRead)
async def update_order(db: DBsession, order_id: int, payload: PurchaseOrderUpdate):
    try:
        return await purchase_service.update_purchase_order(db, order_id, payload)
    except PurchaseOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotEditable:
        raise HTTPException(status_code=409, detail="Order is not Draft") from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/{order_id}/lines", response_model=PurchaseOrderRead)
async def add_order_line(db: DBsession, order_id: int, payload: PurchaseOrderLineCreate):
    try:
        return await purchase_service.add_line(db, order_id, payload)
    except PurchaseOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotEditable:
        raise HTTPException(status_code=409, detail="Order is not Draft") from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.patch("/{order_id}/lines/{line_id}", response_model=PurchaseOrderRead)
async def update_order_line(
    db: DBsession, order_id: int, line_id: int, payload: PurchaseOrderLineUpdate
):
    try:
        return await purchase_service.update_line(db, order_id, line_id, payload)
    except PurchaseOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotEditable:
        raise HTTPException(status_code=409, detail="Order is not Draft") from None
    except LineNotFound:
        raise HTTPException(status_code=404, detail="Line was not found") from None


@router.delete("/{order_id}/lines/{line_id}", response_model=PurchaseOrderRead)
async def delete_order_line(db: DBsession, order_id: int, line_id: int):
    try:
        return await purchase_service.delete_line(db, order_id, line_id)
    except PurchaseOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotEditable:
        raise HTTPException(status_code=409, detail="Order is not Draft") from None
    except LineNotFound:
        raise HTTPException(status_code=404, detail="Line was not found") from None


@router.post("/{order_id}/confirm", response_model=PurchaseOrderRead)
async def confirm_order(db: DBsession, order_id: int, user: PurchaseManager):
    try:
        return await purchase_service.confirm_purchase_order(db, order_id)
    except PurchaseOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotEditable:
        raise HTTPException(status_code=409, detail="Order is not Draft") from None
    except OrderHasNoLines:
        raise HTTPException(status_code=409, detail="Order Has no Lines") from None


@router.post("/{order_id}/cancel", response_model=PurchaseOrderRead)
async def cancel_order(db: DBsession, order_id: int, user: PurchaseManager):
    try:
        return await purchase_service.cancel_purchase_order(db, order_id)
    except PurchaseOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotCancellable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.get("/{order_id}/pdf", response_class=Response, responses=PDF_RESPONSE)
async def order_pdf(db: DBsession, order_id: int, storage: OptionalStorageDep):
    try:
        doc = await documents.purchase_order_document(db, order_id, storage)
    except PurchaseOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except DocumentNotAvailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return pdf_response(await documents.render_pdf(doc), doc.filename)
