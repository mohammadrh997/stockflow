from sqlalchemy import false, true, func, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column,relationship
from typing import TYPE_CHECKING

from datetime import datetime
from app.core.database import Base
if TYPE_CHECKING:
    from app.models.user import User

class Partner(Base):
    __tablename__ = "partners"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    email: Mapped[str | None]
    phone: Mapped[str | None]
    address: Mapped[str | None]
    is_customer: Mapped[bool] = mapped_column(server_default=false())
    is_supplier: Mapped[bool] = mapped_column(server_default=false())
    is_active: Mapped[bool] = mapped_column(server_default=true())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by: Mapped["User"] = relationship()