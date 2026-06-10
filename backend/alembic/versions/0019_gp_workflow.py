"""Guest Post project workflow state machine

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-10
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "guest_posts",
        sa.Column("workflow_status", sa.String(length=30), nullable=False, server_default="research"),
    )
    op.add_column("guest_posts", sa.Column("content_writer_id", sa.Uuid(), nullable=True))
    op.add_column("guest_posts", sa.Column("payment_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_guest_posts_content_writer_users", "guest_posts", "users",
        ["content_writer_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_guest_posts_payment_id_payments", "guest_posts", "payments",
        ["payment_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_guest_posts_payment_id_payments", "guest_posts", type_="foreignkey")
    op.drop_constraint("fk_guest_posts_content_writer_users", "guest_posts", type_="foreignkey")
    op.drop_column("guest_posts", "payment_id")
    op.drop_column("guest_posts", "content_writer_id")
    op.drop_column("guest_posts", "workflow_status")
