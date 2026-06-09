"""Guest post review workflow (draft -> submitted -> approved/rejected)

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-09
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "guest_posts",
        sa.Column("review_status", sa.String(length=20), nullable=False, server_default="draft"),
    )
    op.add_column("guest_posts", sa.Column("reviewed_by", sa.Uuid(), nullable=True))
    op.add_column("guest_posts", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_guest_posts_reviewed_by_users", "guest_posts", "users", ["reviewed_by"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_guest_posts_reviewed_by_users", "guest_posts", type_="foreignkey")
    op.drop_column("guest_posts", "reviewed_at")
    op.drop_column("guest_posts", "reviewed_by")
    op.drop_column("guest_posts", "review_status")
