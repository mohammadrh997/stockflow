from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import CurrentUser, DBsession, Module, pagination_params, require_access
from app.models.sale import SalesState
from app.models.user import Access, User
from app.schemas.sale import (
    SalesOrderCreate,
    SalesOrderLineCreate,
    SalesOrderLineUpdate,
    SalesOrderRead,
    SalesOrderUpdate,
)
from app.services import sale as sale_service
from app.services.common import (
    InvalidReference,
    LineNotFound,
    OrderHasNoLines,
    OrderNotCancellable,
    OrderNotEditable,
)
from app.services.sale import InsufficientStock, SalesOrderNotFound

SalesManager = Annotated[User, Depends(require_access(Module.sales, Access.manager))]
PaginationDep = Annotated[dict, Depends(pagination_params)]

router = APIRouter(
    prefix="/sales-orders",
    tags=["sales-orders"],
    dependencies=[Depends(require_access(Module.sales, Access.user))],
)


@router.post("", response_model=SalesOrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(db: DBsession, payload: SalesOrderCreate, user: CurrentUser):
    try:
        return await sale_service.create_sales_order(db, payload, user.id)
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.get("", response_model=list[SalesOrderRead])
async def list_orders(
    db: DBsession,
    pagination: PaginationDep,
    state: SalesState | None = None,
    partner_id: int | None = None,
):
    skip, limit = pagination["skip"], pagination["limit"]
    return await sale_service.list_sales_orders(
        db, state=state, partner_id=partner_id, skip=skip, limit=limit
    )


@router.get("/{order_id}", response_model=SalesOrderRead)
async def get_order(db: DBsession, order_id: int):
    try:
        return await sale_service.fetch_sales_order(db, order_id)
    except SalesOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None


@router.patch("/{order_id}", response_model=SalesOrderRead)
async def update_order(db: DBsession, order_id: int, payload: SalesOrderUpdate):
    try:
        return await sale_service.update_sales_order(db, order_id, payload)
    except SalesOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotEditable:
        raise HTTPException(status_code=409, detail="Order is not Draft") from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/{order_id}/lines", response_model=SalesOrderRead)
async def add_order_line(db: DBsession, order_id: int, payload: SalesOrderLineCreate):
    try:
        return await sale_service.add_line(db, order_id, payload)
    except SalesOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotEditable:
        raise HTTPException(status_code=409, detail="Order is not Draft") from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.patch("/{order_id}/lines/{line_id}", response_model=SalesOrderRead)
async def update_order_line(
    db: DBsession, order_id: int, line_id: int, payload: SalesOrderLineUpdate
):
    try:
        return await sale_service.update_line(db, order_id, line_id, payload)
    except SalesOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotEditable:
        raise HTTPException(status_code=409, detail="Order is not Draft") from None
    except LineNotFound:
        raise HTTPException(status_code=404, detail="Line was not found") from None


@router.delete("/{order_id}/lines/{line_id}", response_model=SalesOrderRead)
async def delete_order_line(db: DBsession, order_id: int, line_id: int):
    try:
        return await sale_service.delete_line(db, order_id, line_id)
    except SalesOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotEditable:
        raise HTTPException(status_code=409, detail="Order is not Draft") from None
    except LineNotFound:
        raise HTTPException(status_code=404, detail="Line was not found") from None


@router.post("/{order_id}/confirm", response_model=SalesOrderRead)
async def confirm_order(db: DBsession, order_id: int, user: SalesManager):
    try:
        return await sale_service.confirm_sales_order(db, order_id)
    except SalesOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotEditable:
        raise HTTPException(status_code=409, detail="Order is not Draft") from None
    except OrderHasNoLines:
        raise HTTPException(status_code=409, detail="Order has no Lines") from None
    except InsufficientStock as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/{order_id}/cancel", response_model=SalesOrderRead)
async def cancel_order(db: DBsession, order_id: int, user: SalesManager):
    try:
        return await sale_service.cancel_sales_order(db, order_id)
    except SalesOrderNotFound:
        raise HTTPException(status_code=404, detail="Order Was Not Found") from None
    except OrderNotCancellable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
