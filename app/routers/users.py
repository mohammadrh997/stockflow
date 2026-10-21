from typing import Annotated
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DBsession
from app.models.user import User
from app.schemas.user import UserRead, UserCreate, UserUpdate, PasswordReset
from app.dependencies import require_admin
from app.services import users as user_service
from app.services.users import EmailAlreadyExists, UserNotFound, CannotModifySelf

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])



@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: DBsession):
    try:
        return await user_service.create_user(db, payload)
    except EmailAlreadyExists:
        raise HTTPException(status_code=409, detail="Email already registered") from None

@router.get("", response_model=list[UserRead])
async def get_users(db: DBsession, name: None | str = None):
    stmt = select(User).order_by(User.id)
    if name:
        stmt = stmt.where(User.name.ilike(name))
    users = (await db.scalars(stmt)).all()
    return users

@router.get("/{user_id}", response_model=UserRead)
async def get_user(db: DBsession, user_id: int):
    try:
        return await user_service.fetch_user(db, user_id)
    except UserNotFound:
        raise HTTPException(status_code=404, detail="User Was Not Found") from None

@router.patch("/{user_id}", response_model=UserRead)
async def update_user(db: DBsession, user_id: int, payload: UserUpdate, admin: CurrentUser):
    try:
        return await user_service.update_user(db, user_id, payload, acting_user_id=admin.id)
    except CannotModifySelf as exc:
        raise HTTPException(
            status_code=400, 
            detail=str(exc)
        ) from None
    
    except UserNotFound:
        raise HTTPException(
            status_code=404,
            detail="User was not found",
        ) from None

    except EmailAlreadyExists:
        raise HTTPException(
            status_code=409,
            detail="Email already exists",
        ) from None

@router.post("/{user_id}/activate", response_model=UserRead)
async def activate_user(db: DBsession, user_id: int, admin: CurrentUser):
    try:
        return await user_service.set_active(db, user_id, True, acting_user_id=admin.id)
    except UserNotFound:
        raise HTTPException(status_code=404, detail="User was not found") from None


@router.post("/{user_id}/deactivate", response_model=UserRead)
async def deactivate_user(db: DBsession, user_id: int, admin: CurrentUser):
    try:
        return await user_service.set_active(db, user_id, False, acting_user_id=admin.id)
    except UserNotFound:
        raise HTTPException(status_code=404, detail="User was not found") from None
    except CannotModifySelf as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None

@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(db: DBsession, user_id: int, payload: PasswordReset):
    try:
        await user_service.reset_password(db, user_id, payload.new_password)
    except UserNotFound:
        raise HTTPException(status_code=404, detail="User was not found") from None