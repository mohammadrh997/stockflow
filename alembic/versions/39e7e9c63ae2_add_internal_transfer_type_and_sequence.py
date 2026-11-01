"""add internal, adjustments transfer type and sequence

Revision ID: 39e7e9c63ae2
Revises: 3544803ef8ed
Create Date: 2026-10-29 13:50:37.045041

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "39e7e9c63ae2"
down_revision: str | Sequence[str] | None = "3544803ef8ed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "transfers",
        "transfer_type",
        type_=sa.String(10),
        existing_type=sa.String(8),
        existing_nullable=False,
    )
    op.drop_constraint(op.f("ck_transfers_transfer_type"), "transfers", type_="check")
    op.create_check_constraint(
        op.f("ck_transfers_transfer_type"),
        "transfers",
        "transfer_type IN ('receipt', 'delivery', 'internal', 'adjustment')",
    )
    op.execute("CREATE SEQUENCE internal_ref_seq")
    op.execute("CREATE SEQUENCE adjustment_ref_seq")


def downgrade() -> None:
    op.execute("DROP SEQUENCE adjustment_ref_seq")
    op.execute("DROP SEQUENCE internal_ref_seq")
    op.drop_constraint(op.f("ck_transfers_transfer_type"), "transfers", type_="check")
    op.create_check_constraint(
        op.f("ck_transfers_transfer_type"),
        "transfers",
        "transfer_type IN ('receipt', 'delivery')",
    )
    op.alter_column(
        "transfers",
        "transfer_type",
        type_=sa.String(8),
        existing_type=sa.String(10),
        existing_nullable=False,
    )
