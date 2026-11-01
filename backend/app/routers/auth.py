from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.core.limiter import limiter
from app.core.security import DUMMY_HASH, create_access_token, hash_password, verify_password
from app.dependencies import CurrentUser, DBsession
from app.models.user import User
from app.schemas.user import PasswordChange, ProfileUpdate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/token")
@limiter.limit("5/minute")
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: DBsession, request: Request
):
    user = (await db.scalars(select(User).where(User.email == form_data.username.lower()))).first()
    stored_hash = user.hashed_password if user is not None else DUMMY_HASH
    password_ok = await verify_password(form_data.password, stored_hash)
    if user is None or user.is_active is False or not password_ok:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"access_token": create_access_token(str(user.id)), "token_type": "bearer"}


@router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserRead)
async def update_me(user: CurrentUser, payload: ProfileUpdate, db: DBsession):
    user.name = payload.name
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/me/password")
@limiter.limit("5/minute")
async def change_password(
    user: CurrentUser, payload: PasswordChange, db: DBsession, request: Request
):
    if not await verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.hashed_password = await hash_password(payload.new_password)
    user.password_changed_at = datetime.now(UTC)
    await db.commit()
    return {"access_token": create_access_token(str(user.id)), "token_type": "bearer"}
