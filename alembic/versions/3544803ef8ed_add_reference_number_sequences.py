"""add reference number sequences

Revision ID: 3544803ef8ed
Revises: 0d882d87d175
Create Date: 2026-10-25 14:14:29.604137

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3544803ef8ed"
down_revision: str | Sequence[str] | None = "0d882d87d175"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SEQUENCES = [
    "purchase_order_ref_seq",
    "sales_order_ref_seq",
    "receipt_ref_seq",
    "delivery_ref_seq",
]


def upgrade() -> None:
    for name in SEQUENCES:
        op.execute(f"CREATE SEQUENCE {name}")


def downgrade() -> None:
    for name in SEQUENCES:
        op.execute(f"DROP SEQUENCE {name}")
