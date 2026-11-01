from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies import CurrentUser, DBsession, Module, pagination_params, require_access
from app.models.stock import Transfer, TransferState, TransferType
from app.models.user import Access, User
from app.schemas.stock import (
    AdjustmentCreate,
    InternalTransferCreate,
    TransferRead,
    TransferValidate,
)
from app.services import transfers as transfer_service
from app.services.transfers import (
    InsufficientStock,
    InvalidReference,
    NothingToAdjust,
    TransferNotFound,
    TransferNotReady,
)

InventoryManager = Annotated[User, Depends(require_access(Module.inventory, Access.manager))]
PaginationDep = Annotated[dict, Depends(pagination_params)]

router = APIRouter(
    prefix="/transfers",
    tags=["transfers"],
    dependencies=[Depends(require_access(Module.inventory, Access.user))],
)


@router.get("", response_model=list[TransferRead])
async def list_transfer(
    db: DBsession,
    pagination: PaginationDep,
    transfer_type: TransferType | None = None,
    state: TransferState | None = None,
    warehouse_id: int | None = None,
    purchase_order_id: int | None = None,
    sales_order_id: int | None = None,
):
    skip, limit = pagination["skip"], pagination["limit"]
    stmt = select(Transfer).order_by(Transfer.id)
    if transfer_type:
        stmt = stmt.where(Transfer.transfer_type == transfer_type)
    if state:
        stmt = stmt.where(Transfer.state == state)
    if warehouse_id:
        stmt = stmt.where(Transfer.warehouse_id == warehouse_id)
    if purchase_order_id is not None:
        stmt = stmt.where(Transfer.purchase_order_id == purchase_order_id)
    if sales_order_id is not None:
        stmt = stmt.where(Transfer.sales_order_id == sales_order_id)
    if skip:
        stmt = stmt.offset(skip)
    if limit:
        stmt = stmt.limit(limit)
    stmt = stmt.options(selectinload(Transfer.moves))
    transfers = (await db.scalars(stmt)).all()
    return transfers


@router.get("/{transfer_id}", response_model=TransferRead)
async def get_transfer(db: DBsession, transfer_id: int):
    try:
        return await transfer_service.fetch_transfer(db, transfer_id)
    except TransferNotFound:
        raise HTTPException(status_code=404, detail="Transfer Was Not Found") from None


@router.post("/{transfer_id}/validate", response_model=TransferRead)
async def validate_transfer(
    db: DBsession, transfer_id: int, payload: TransferValidate, user: CurrentUser
):
    try:
        return await transfer_service.validate_transfer(
            db, transfer_id=transfer_id, location_id=payload.location_id, user_id=user.id
        )
    except TransferNotFound:
        raise HTTPException(status_code=404, detail="Transfer Was Not Found") from None
    except TransferNotReady as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except InsufficientStock as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/internal", response_model=TransferRead, status_code=201)
async def create_internal_transfer(
    db: DBsession, payload: InternalTransferCreate, user: CurrentUser
):
    try:
        return await transfer_service.create_internal_transfer(db, payload, user.id)
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except InsufficientStock as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/adjustments", response_model=TransferRead, status_code=201)
async def create_adjustment(db: DBsession, payload: AdjustmentCreate, user: InventoryManager):
    try:
        return await transfer_service.create_adjustment(db, payload, user.id)
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except NothingToAdjust as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
