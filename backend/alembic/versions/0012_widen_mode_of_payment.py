"""Widen payments.mode_of_payment to hold pasted payment-link URLs

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-08
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "payments", "mode_of_payment",
        existing_type=sa.String(length=60), type_=sa.String(length=255),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "payments", "mode_of_payment",
        existing_type=sa.String(length=255), type_=sa.String(length=60),
        existing_nullable=True,
    )
