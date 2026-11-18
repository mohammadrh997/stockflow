from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, status

from app.core.limiter import limiter, user_or_ip
from app.dependencies import (
    BillReaderDep,
    BillStorageDep,
    CurrentUser,
    DBsession,
    Module,
    pagination_params,
    require_access,
)
from app.models.bill_import import BillImport, BillImportState
from app.models.user import Access
from app.routers.pagination import with_total
from app.routers.uploads import read_upload
from app.schemas.bill_import import (
    BillImportLineUpdate,
    BillImportRead,
    BillImportSummary,
    BillImportUpdate,
)
from app.services import bill_import as import_service
from app.services.bill_import import (
    BillImportNotFound,
    ImportNotOpen,
    ImportNotReady,
    NoBillFile,
    NothingToRequest,
)
from app.services.bill_reader import BillUnreadable, InvalidBillFile, ReaderUnavailable
from app.services.common import DuplicatePartnerReference, InvalidReference, LineNotFound

PaginationDep = Annotated[dict, Depends(pagination_params)]

router = APIRouter(
    prefix="/bill-imports",
    tags=["bill-imports"],
    dependencies=[Depends(require_access(Module.purchase, Access.user))],
)

NOT_FOUND = HTTPException(status_code=404, detail="Bill import not found")


async def _read(db: DBsession, bill_import: BillImport) -> BillImportRead:
    result = BillImportRead.model_validate(bill_import)
    result.warnings = await import_service.review(db, bill_import)
    return result


@router.post("", response_model=BillImportRead, status_code=status.HTTP_201_CREATED)
# Each import is a call to the model, and the free quota is small and shared: per user,
# so colleagues behind one office IP don't use up each other's
@limiter.limit("10/hour", key_func=user_or_ip)
async def import_bill(
    request: Request,
    db: DBsession,
    file: UploadFile,
    reader: BillReaderDep,
    storage: BillStorageDep,
    user: CurrentUser,
):
    data = await read_upload(file, "bill")
    try:
        bill_import = await import_service.import_bill(db, reader, storage, data, user.id)
    except (InvalidBillFile, BillUnreadable) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except ReaderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    return await _read(db, bill_import)


@router.get("", response_model=list[BillImportSummary])
async def list_imports(
    db: DBsession,
    response: Response,
    pagination: PaginationDep,
    state: BillImportState | None = None,
    purchase_order_id: int | None = None,
):
    page = await import_service.list_imports(
        db,
        pagination["skip"],
        pagination["limit"],
        state=state,
        purchase_order_id=purchase_order_id,
    )
    return with_total(response, page)


@router.get("/{import_id}", response_model=BillImportRead)
async def get_import(db: DBsession, import_id: int):
    try:
        return await _read(db, await import_service.fetch_import(db, import_id))
    except BillImportNotFound:
        raise NOT_FOUND from None


@router.get("/{import_id}/file", response_class=Response)
async def get_bill_file(db: DBsession, storage: BillStorageDep, import_id: int):
    try:
        data, mime_type = await import_service.bill_file(db, storage, import_id)
    except (BillImportNotFound, NoBillFile):
        raise NOT_FOUND from None
    return Response(
        data,
        media_type=mime_type,
        # Shown in the browser, never cached on the way: the bill is private
        headers={"Content-Disposition": "inline", "Cache-Control": "private, no-store"},
    )


@router.patch("/{import_id}", response_model=BillImportRead)
async def update_import(db: DBsession, import_id: int, payload: BillImportUpdate):
    try:
        return await _read(db, await import_service.update_import(db, import_id, payload))
    except BillImportNotFound:
        raise NOT_FOUND from None
    except ImportNotOpen as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.patch("/{import_id}/lines/{line_id}", response_model=BillImportRead)
async def update_line(db: DBsession, import_id: int, line_id: int, payload: BillImportLineUpdate):
    try:
        bill_import = await import_service.update_line(db, import_id, line_id, payload)
        return await _read(db, bill_import)
    except (BillImportNotFound, LineNotFound):
        raise NOT_FOUND from None
    except ImportNotOpen as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except InvalidReference as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.delete("/{import_id}/lines/{line_id}", response_model=BillImportRead)
async def delete_line(db: DBsession, import_id: int, line_id: int):
    try:
        return await _read(db, await import_service.delete_line(db, import_id, line_id))
    except (BillImportNotFound, LineNotFound):
        raise NOT_FOUND from None
    except ImportNotOpen as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/{import_id}/confirm", response_model=BillImportRead)
async def confirm_import(db: DBsession, import_id: int, user: CurrentUser):
    try:
        return await _read(db, await import_service.confirm_import(db, import_id, user.id))
    except BillImportNotFound:
        raise NOT_FOUND from None
    except (ImportNotOpen, ImportNotReady, DuplicatePartnerReference) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except InvalidReference as exc:  # e.g. the supplier was archived since
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/{import_id}/request-products", response_model=BillImportRead)
async def request_products(db: DBsession, import_id: int, user: CurrentUser):
    """Asks inventory managers to create the products the items still need."""
    try:
        return await _read(db, await import_service.request_products(db, import_id, user.id))
    except BillImportNotFound:
        raise NOT_FOUND from None
    except (ImportNotOpen, NothingToRequest) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/{import_id}/discard", response_model=BillImportRead)
async def discard_import(db: DBsession, storage: BillStorageDep, import_id: int):
    try:
        return await _read(db, await import_service.discard_import(db, storage, import_id))
    except BillImportNotFound:
        raise NOT_FOUND from None
    except ImportNotOpen as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
