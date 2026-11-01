from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.warehouse import Location, LocationType, Warehouse
from app.schemas.warehouse import LocationCreate, LocationUpdate, WarehouseCreate, WarehouseUpdate
from app.services.stock import location_has_stock


class CodeAlreadyExists(Exception):
    pass


class WarehouseNotFound(Exception):
    pass


class LocationNotFound(Exception):
    pass


class InvalidDefaultLocation(Exception):
    pass


class CannotArchiveLocation(Exception):
    pass


class LocationNameExists(Exception):
    pass


async def create_warehouse(db: AsyncSession, data: WarehouseCreate) -> Warehouse:
    warehouse = Warehouse(name=data.name, code=data.code)
    stock = Location(name="Stock", location_type=LocationType.internal, warehouse=warehouse)
    warehouse.default_location = stock
    db.add(warehouse)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_warehouses_code" in str(exc.orig):
            raise CodeAlreadyExists(data.code) from None
        raise
    await db.refresh(warehouse)
    return warehouse


async def fetch_warehouse(db: AsyncSession, warehouse_id: int) -> Warehouse:
    warehouse = await db.get(Warehouse, warehouse_id)
    if not warehouse:
        raise WarehouseNotFound(warehouse_id) from None
    return warehouse


async def update_warehouse(db: AsyncSession, warehouse_id: int, data: WarehouseUpdate) -> Warehouse:
    warehouse = await fetch_warehouse(db, warehouse_id)
    if data.default_location_id is not None:
        location = await fetch_location(db, data.default_location_id)
        if (
            location.location_type != LocationType.internal
            or location.warehouse_id != warehouse.id
            or not location.is_active
        ):
            raise InvalidDefaultLocation(
                "Default location must be an active internal location of this warehouse"
            )
        warehouse.default_location_id = location.id
    if data.name is not None:
        warehouse.name = data.name
    await db.commit()
    await db.refresh(warehouse)
    return warehouse


async def create_location(db: AsyncSession, data: LocationCreate) -> Location:
    await fetch_warehouse(db, data.warehouse_id)
    location = Location(
        name=data.name,
        location_type=LocationType.internal,
        warehouse_id=data.warehouse_id,
    )
    db.add(location)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_locations_warehouse_id_name" in str(exc.orig):
            raise LocationNameExists(data.name) from None
        raise
    await db.refresh(location)
    return location


async def fetch_location(db: AsyncSession, location_id: int) -> Location:
    location = await db.get(Location, location_id)
    if not location:
        raise LocationNotFound(location_id) from None
    return location


async def update_location(db: AsyncSession, location_id: int, data: LocationUpdate) -> Location:
    location = await fetch_location(db, location_id)
    location.name = data.name
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_locations_warehouse_id_name" in str(exc.orig):
            raise LocationNameExists(data.name) from None
        raise
    await db.refresh(location)
    return location


async def set_location_active(db: AsyncSession, location_id: int, active: bool) -> Location:
    location = await db.get(Location, location_id, with_for_update=True)
    if location is None:
        raise LocationNotFound(location_id) from None
    if not active:
        if location.location_type != LocationType.internal:
            raise CannotArchiveLocation("Virtual locations cannot be archived")
        if location.warehouse_id is None:
            raise CannotArchiveLocation("Virtual locations cannot be archived")
        warehouse = await fetch_warehouse(db, location.warehouse_id)
        if warehouse.default_location_id == location.id:
            raise CannotArchiveLocation("Choose another default location first")
        if await location_has_stock(db, location.id):
            raise CannotArchiveLocation("Move the stock out of this location first")
    location.is_active = active
    await db.commit()
    await db.refresh(location)
    return location


async def get_virtual_location(db: AsyncSession, location_type: LocationType) -> Location:
    if location_type == LocationType.internal:
        raise ValueError("internal is not a virtual location type")
    result = await db.scalars(select(Location).where(Location.location_type == location_type))
    return result.one()
