"""Soft-delete for guest posts (so they cascade into Trash with their project)

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-09
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("guest_posts", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("guest_posts", sa.Column("deleted_by", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_guest_posts_deleted_by_users", "guest_posts", "users", ["deleted_by"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_guest_posts_deleted_at", "guest_posts", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_guest_posts_deleted_at", table_name="guest_posts")
    op.drop_constraint("fk_guest_posts_deleted_by_users", "guest_posts", type_="foreignkey")
    op.drop_column("guest_posts", "deleted_by")
    op.drop_column("guest_posts", "deleted_at")
