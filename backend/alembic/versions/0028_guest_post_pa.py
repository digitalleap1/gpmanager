"""Guest post PA (page authority)

Revision ID: 0028
Revises: 0027
Create Date: 2026-06-11
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("guest_posts", sa.Column("pa", sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("guest_posts", "pa")
