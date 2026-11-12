import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from fastapi.concurrency import run_in_threadpool
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import settings

password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash("dummy-password-for-timing")


@dataclass(frozen=True)
class TokenData:
    user_id: int
    issued_at: int


async def hash_password(password: str) -> str:
    return await run_in_threadpool(password_hash.hash, password)


async def verify_password(password: str, hashed: str) -> bool:
    return await run_in_threadpool(password_hash.verify, password, hashed)


def create_access_token(subject: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_exp_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> TokenData | None:
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            options={"require": ["exp", "iat", "sub"]},
        )
        return TokenData(user_id=int(payload["sub"]), issued_at=int(payload["iat"]))
    except (InvalidTokenError, ValueError):
        return None


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)  # 256 random bits


def hash_refresh_token(token: str) -> str:
    # A plain hash is enough: unlike a password, the token is random and too long to guess,
    # and an unsalted hash can be looked up directly
    return hashlib.sha256(token.encode()).hexdigest()
