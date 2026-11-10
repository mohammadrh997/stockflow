from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class BodySizeLimit:
    """Refuses a request whose declared Content-Length is too big, before reading its body.

    FastAPI reads the whole body before any dependency or endpoint runs, so a size check
    there only happens after the upload has arrived. This runs first. A client can leave
    the header out, so the image endpoint still checks the size it actually reads.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            length = dict(scope["headers"]).get(b"content-length", b"")
            if length.isdigit() and int(length) > self.max_bytes:
                response = JSONResponse({"detail": "The request is too large"}, status_code=413)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
