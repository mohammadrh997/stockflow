"""Inventory's side of bill import: the items purchase asked products for."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.dependencies import (
    BillStorageDep,
    CurrentUser,
    DBsession,
    Module,
    pagination_params,
    require_access,
)
from app.models.user import Access
from app.routers.pagination import with_total
from app.schemas.bill_import import MissingProductRead
from app.schemas.product import ProductCreate, ProductRead
from app.services import bill_import as import_service
from app.services.bill_import import LineNotWaiting, NoBillFile
from app.services.common import InvalidReference, LineNotFound
from app.services.product import SKUAlreadyExists

PaginationDep = Annotated[dict, Depends(pagination_params)]

router = APIRouter(
    prefix="/missing-products",
    tags=["bill-imports"],
    # The people who create products. They see these items, not the rest of the import.
    dependencies=[Depends(require_access(Module.inventory, Access.manager))],
)

NOT_FOUND = HTTPException(status_code=404, detail="Item not found")


@router.get("", response_model=list[MissingProductRead])
async def list_missing_products(db: DBsession, response: Response, pagination: PaginationDep):
    page = await import_service.list_missing_products(db, pagination["skip"], pagination["limit"])
    return with_total(response, page)


@router.post("/{line_id}/product", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product_for_line(
    db: DBsession, line_id: int, payload: ProductCreate, user: CurrentUser
):
    try:
        return await import_service.create_product_for_line(db, line_id, payload, user.id)
    except LineNotFound:
        raise NOT_FOUND from None
    except LineNotWaiting as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except SKUAlreadyExists:
        raise HTTPException(status_code=409, detail="SKU already Exist") from None
    except InvalidReference as exc:  # an unknown or archived category
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.get("/{line_id}/file", response_class=Response)
async def get_bill_file(db: DBsession, storage: BillStorageDep, line_id: int):
    """The bill the item is on, to see it as printed."""
    try:
        line = await import_service.waiting_line(db, line_id)
        data, mime_type = await import_service.bill_file(db, storage, line.import_id)
    except (LineNotWaiting, NoBillFile):
        raise NOT_FOUND from None
    return Response(
        data,
        media_type=mime_type,
        headers={"Content-Disposition": "inline", "Cache-Control": "private, no-store"},
    )
