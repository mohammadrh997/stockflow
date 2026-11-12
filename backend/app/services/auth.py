"""Login sessions: short-lived access tokens, renewed with single-use refresh tokens."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import ColumnElement, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, hash_refresh_token, new_refresh_token
from app.models.auth import RefreshToken
from app.models.user import User


class InvalidRefreshToken(Exception): ...  # 401: unknown, expired, revoked or reused


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str


def _issue(db: AsyncSession, user_id: int, family_id: uuid.UUID) -> TokenPair:
    token = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user_id,
            family_id=family_id,
            token_hash=hash_refresh_token(token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_exp_days),
        )
    )
    return TokenPair(create_access_token(str(user_id)), token)


async def _revoke(db: AsyncSession, which: ColumnElement[bool]) -> None:
    await db.execute(
        update(RefreshToken)
        .where(which, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=func.now())
    )


async def start_session(db: AsyncSession, user: User) -> TokenPair:
    # The user's expired tokens can't be used any more: drop them, so the table doesn't grow
    await db.execute(
        delete(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.expires_at < func.now()
        )
    )
    tokens = _issue(db, user.id, uuid.uuid4())
    await db.commit()
    return tokens


async def renew_session(db: AsyncSession, refresh_token: str) -> TokenPair:
    # Locked, so two requests with the same token can't both renew it
    token = await db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(refresh_token))
        .with_for_update()
    )
    now = datetime.now(UTC)
    if token is None or token.revoked_at is not None or token.expires_at <= now:
        raise InvalidRefreshToken()

    if token.used_at is not None:
        # Each token works once. Seeing one again means someone else has a copy: end the
        # session, for them and for the real user, who simply logs in again.
        await _revoke(db, RefreshToken.family_id == token.family_id)
        await db.commit()
        raise InvalidRefreshToken()

    user = await db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise InvalidRefreshToken()

    token.used_at = now
    tokens = _issue(db, user.id, token.family_id)
    await db.commit()
    return tokens


async def end_session(db: AsyncSession, refresh_token: str) -> None:
    token = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(refresh_token))
    )
    if token is not None:
        await _revoke(db, RefreshToken.family_id == token.family_id)
        await db.commit()


async def end_all_sessions(db: AsyncSession, user_id: int) -> None:
    """Log the user out everywhere. Doesn't commit: it belongs to the caller's change
    (a new password, a deactivation), and happens only if that does."""
    await _revoke(db, RefreshToken.user_id == user_id)
