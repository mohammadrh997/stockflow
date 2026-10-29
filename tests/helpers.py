from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings
from app.core.security import create_access_token
from app.models.user import User


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


def auth_issued_ago(user: User, seconds: int) -> dict[str, str]:
    issued = datetime.now(UTC) - timedelta(seconds=seconds)
    token = jwt.encode(
        {"sub": str(user.id), "iat": issued, "exp": issued + timedelta(minutes=30)},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    return {"Authorization": f"Bearer {token}"}