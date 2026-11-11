from sqlalchemy import CheckConstraint, ForeignKey, Index, String, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Category(Base):
    """A product category. Categories nest (parent_id), up to five levels deep."""

    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint("parent_id <> id", name="not_own_parent"),
        # Unique among siblings, ignoring case. NULLS NOT DISTINCT makes top-level
        # categories (parent_id NULL) count as siblings of each other too.
        Index(
            "uq_categories_sibling_name",
            "parent_id",
            text("lower(name)"),
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    # No separate index: uq_categories_sibling_name starts with parent_id and covers it
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    is_active: Mapped[bool] = mapped_column(server_default=true())
