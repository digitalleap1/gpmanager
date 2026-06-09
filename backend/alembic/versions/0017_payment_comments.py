"""Payment comments (request note / clarification thread)

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-09
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payment_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("payment_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], name="fk_payment_comments_payment_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], name="fk_payment_comments_author_id", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_payment_comments"),
    )
    op.create_index("ix_payment_comments_payment_id", "payment_comments", ["payment_id"])


def downgrade() -> None:
    op.drop_index("ix_payment_comments_payment_id", table_name="payment_comments")
    op.drop_table("payment_comments")
