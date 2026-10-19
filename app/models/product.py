from decimal import Decimal
from sqlalchemy import Numeric, true, func, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from app.core.database import Base

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.user import User



class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    sku: Mapped[str] = mapped_column(unique=True)
    sale_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), server_default="0")
    image_key: Mapped[str | None]
    is_active: Mapped[bool] = mapped_column(server_default=true())
    created_at: Mapped[datetime] = mapped_column(
            DateTime(timezone=True), server_default=func.now()
            )
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by: Mapped["User"] = relationship()
