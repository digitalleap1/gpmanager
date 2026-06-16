"""Checklist item payment fields (type/amount/currency/txn/mode)

Revision ID: 0026
Revises: 0025
Create Date: 2026-06-11
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    t = "project_checklist_items"
    op.add_column(t, sa.Column("payment_type", sa.String(length=20), nullable=True))
    op.add_column(t, sa.Column("amount", sa.Numeric(12, 2), nullable=True))
    op.add_column(t, sa.Column("currency", sa.String(length=3), nullable=True))
    op.add_column(t, sa.Column("transaction_id", sa.String(length=120), nullable=True))
    op.add_column(t, sa.Column("payment_mode", sa.String(length=60), nullable=True))


def downgrade() -> None:
    t = "project_checklist_items"
    op.drop_column(t, "payment_mode")
    op.drop_column(t, "transaction_id")
    op.drop_column(t, "currency")
    op.drop_column(t, "amount")
    op.drop_column(t, "payment_type")
