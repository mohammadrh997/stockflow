from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.config import settings
from app.core.security import decode_token


def client_ip(request: Request) -> str:
    if settings.client_ip_header:
        value = request.headers.get(settings.client_ip_header)
        if value:
            return value.strip()
    return get_remote_address(request)


def user_or_ip(request: Request) -> str:
    """Per user for a logged-in request: an office behind one IP isn't one shared bucket.

    The token is only decoded here, not checked against the database; a forged one fails
    the signature and falls back to the IP. The endpoint still checks the user itself.
    """
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() == "bearer" and (data := decode_token(token)) is not None:
        return f"user:{data.user_id}"
    return client_ip(request)


limiter = Limiter(key_func=client_ip)
