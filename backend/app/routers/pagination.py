from collections.abc import Sequence

from fastapi import Response

from app.services.common import Page


def with_total[T](response: Response, page: Page[T]) -> Sequence[T]:
    """The page's items as the body, and how many there are in all as a header."""
    response.headers["X-Total-Count"] = str(page.total)
    return page.items
