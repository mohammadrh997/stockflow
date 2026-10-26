from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.user import User, Access
from app.models.stock import Transfer, TransferType, TransferState
from app.dependencies import DBsession, Module, require_access, CurrentUser, pagination_params
from app.schemas.stock import TransferRead, TransferValidate
from app.services import transfers as transfer_service
from app.services.transfers import TransferNotFound, TransferNotReady, InvalidReference

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
    transfer_type: TransferType| None = None, 
    state: TransferState | None = None, 
    warehouse_id: int | None = None,
):
    skip, limit = pagination["skip"], pagination["limit"]
    stmt = select(Transfer).order_by(Transfer.id)
    if transfer_type:
        stmt = stmt.where(Transfer.transfer_type == transfer_type)
    if state:
        stmt = stmt.where(Transfer.state == state)
    if warehouse_id:
        stmt = stmt.where(Transfer.warehouse_id == warehouse_id)
    if skip:
        stmt = stmt.offset(skip)
    if limit:
        stmt = stmt.limit(limit)
    stmt = stmt.options(selectinload(Transfer.moves))
    transfers = (await db.scalars(stmt)).all()
    return transfers

@router.get("/{transfer_id}", response_model= TransferRead)
async def get_transfer(db: DBsession, transfer_id: int):
    try:
        return await transfer_service.fetch_transfer(db, transfer_id)
    except TransferNotFound:
        raise HTTPException(status_code=404, detail="Transfer Was Not Found") from None


@router.post("/{transfer_id}/validate", response_model= TransferRead)
async def validate_transfer(db: DBsession, transfer_id: int, payload: TransferValidate, user: CurrentUser):
    try:
        return await transfer_service.validate_receipt(db, transfer_id=transfer_id, location_id=payload.location_id, user_id= user.id)
    except TransferNotFound:
        raise HTTPException(status_code=404, detail="Transfer Was Not Found") from None
    except TransferNotReady as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None