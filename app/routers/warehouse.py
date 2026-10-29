from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.models.user import User, Access
from app.models.warehouse import Location, LocationType, Warehouse
from app.dependencies import DBsession, Module, require_access, get_current_user
from app.schemas.warehouse import WarehouseUpdate,WarehouseCreate,WarehouseRead,WarehouseDetail, LocationRead,LocationUpdate,LocationCreate
from app.services import warehouse as warehouse_service
from app.services.warehouse import (CodeAlreadyExists, WarehouseNotFound, LocationNotFound, InvalidDefaultLocation, CannotArchiveLocation, LocationNameExists)

InventoryManager = Annotated[User, Depends(require_access(Module.inventory, Access.manager))]

warehouse_router = APIRouter(
    prefix="/warehouses",
    tags=["warehouses"],
    dependencies=[Depends(get_current_user)],
)

@warehouse_router.get("", response_model=list[WarehouseRead])
async def get_warehouses(db: DBsession):
    stmt = select(Warehouse).order_by(Warehouse.id)
    warehouses = (await db.scalars(stmt)).all()
    return warehouses

@warehouse_router.get("/{warehouse_id}", response_model=WarehouseDetail)
async def get_warehouse(db: DBsession, warehouse_id: int):
    try:
        warehouse = await warehouse_service.fetch_warehouse(db, warehouse_id)
        await db.refresh(warehouse, attribute_names=["locations"])
        return warehouse
    except WarehouseNotFound:
            raise HTTPException(status_code=404, detail="Warehouse was not Found") from None

@warehouse_router.post("", response_model=WarehouseRead, status_code= status.HTTP_201_CREATED)
async def create_warehouses(db: DBsession, payload: WarehouseCreate, user: InventoryManager):
    try:
        return await warehouse_service.create_warehouse(db, payload)
    except CodeAlreadyExists:
        raise HTTPException(status_code=409, detail="Code already registered") from None

@warehouse_router.patch("/{warehouse_id}", response_model=WarehouseRead)
async def update_warehouse(db: DBsession, warehouse_id: int, payload: WarehouseUpdate, user: InventoryManager):
    try:
        return await warehouse_service.update_warehouse(db, warehouse_id, payload)
    except WarehouseNotFound:
            raise HTTPException(status_code=404, detail="Warehouse was not Found") from None
    except InvalidDefaultLocation as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except LocationNotFound:
            raise HTTPException(status_code=404, detail="default_location_id: location not found") from None

location_router = APIRouter(
    prefix="/locations",
    tags=["locations"],
    dependencies=[Depends(get_current_user)],
)

@location_router.get("", response_model=list[LocationRead])
async def list_locations(
    db: DBsession,
    warehouse_id: int | None = None,
    location_type: LocationType | None = None,
    include_archived: bool = False,
):
    stmt = select(Location).order_by(Location.id)
    if warehouse_id is not None:
        stmt = stmt.where(Location.warehouse_id == warehouse_id)
    if location_type is not None:
        stmt = stmt.where(Location.location_type == location_type)
    if not include_archived:
        stmt = stmt.where(Location.is_active)
    locations = (await db.scalars(stmt)).all()
    return locations


@location_router.post("", response_model=LocationRead, status_code= status.HTTP_201_CREATED)
async def create_location(db: DBsession, payload: LocationCreate, user: InventoryManager):
    try:
        return await warehouse_service.create_location(db, payload)
    except WarehouseNotFound:
            raise HTTPException(status_code=400, detail="warehouse_id: warehouse not found") from None
    except LocationNameExists:
        raise HTTPException(status_code=409, detail="Location Name already Exists") from None
    
@location_router.patch("/{location_id}", response_model=LocationRead)
async def update_location(db: DBsession, location_id: int, payload: LocationUpdate, user: InventoryManager):
    try:
        return await warehouse_service.update_location(db, location_id, payload)
    except LocationNotFound:
            raise HTTPException(status_code=404, detail="Location Was Not Found") from None
    except LocationNameExists:
        raise HTTPException(status_code=409, detail="Location Name already Exists") from None

@location_router.post("/{location_id}/archive", response_model=LocationRead)
async def archive_location(db: DBsession, location_id: int, user: InventoryManager):
    try:
        return await warehouse_service.set_location_active(db, location_id, active=False)
    except LocationNotFound:
        raise HTTPException(status_code=404, detail="Location Was Not Found") from None
    except CannotArchiveLocation as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None 

@location_router.post("/{location_id}/unarchive", response_model=LocationRead)
async def unarchive_location(db: DBsession, location_id: int, user: InventoryManager):
    try:
        return await warehouse_service.set_location_active(db, location_id, active=True)
    except LocationNotFound:
        raise HTTPException(status_code=404, detail="Location Was Not Found") from None