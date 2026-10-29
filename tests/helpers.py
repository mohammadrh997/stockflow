from app.core.security import create_access_token
from app.models.user import User


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}