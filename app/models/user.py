import enum
from sqlalchemy import false, true, func, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column
from app.models.checks import enum_check


from datetime import datetime

from app.core.database import Base

class Access(enum.IntEnum):
    none = 0
    user = 1
    manager = 2




class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        enum_check("sales_access", Access),
        enum_check("purchase_access", Access),
        enum_check("inventory_access", Access),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str]
    hashed_password: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
        )
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_admin: Mapped[bool] = mapped_column(server_default=false())
    is_active: Mapped[bool] = mapped_column(server_default=true())
    sales_access: Mapped[Access] = mapped_column(
        Enum(Access, native_enum=False), server_default="none"
    )
    purchase_access: Mapped[Access] = mapped_column(
        Enum(Access, native_enum=False), server_default="none"
    )
    inventory_access: Mapped[Access] = mapped_column(
        Enum(Access, native_enum=False), server_default="none"
    )