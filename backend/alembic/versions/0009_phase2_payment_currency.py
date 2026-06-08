"""Phase 2 - multi-currency payments

Adds native currency + manual FX rate, plus mode_of_payment and the "notified"
flag (from the team's payment spreadsheets). amount_usd remains the canonical
reporting value, now derived from amount * fx_to_usd.

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-08
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
    )
    op.add_column("payments", sa.Column("amount", sa.Numeric(14, 2), nullable=True))
    op.add_column("payments", sa.Column("fx_to_usd", sa.Numeric(18, 6), nullable=True))
    op.add_column(
        "payments", sa.Column("mode_of_payment", sa.String(length=60), nullable=True)
    )
    op.add_column(
        "payments",
        sa.Column("notified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Back-fill native amount from the existing USD amount for any existing rows.
    op.execute("UPDATE payments SET amount = amount_usd WHERE amount IS NULL")


def downgrade() -> None:
    op.drop_column("payments", "notified")
    op.drop_column("payments", "mode_of_payment")
    op.drop_column("payments", "fx_to_usd")
    op.drop_column("payments", "amount")
    op.drop_column("payments", "currency")
