from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.config import settings


def client_ip(request: Request) -> str:
    if settings.client_ip_header:
        value = request.headers.get(settings.client_ip_header)
        if value:
            return value.strip()
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip)
