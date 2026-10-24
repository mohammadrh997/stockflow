from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.warehouse import Warehouse, Location, LocationType
from app.schemas.warehouse import WarehouseCreate

class CodeAlreadyExists(Exception):
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


