"""Task source link (auto-tasks from guest-post / payment assignment)

Revision ID: 0029
Revises: 0028
Create Date: 2026-06-18
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("source_type", sa.String(length=20), nullable=True))
    op.add_column(
        "tasks",
        sa.Column("source_id", sa.UUID(as_uuid=True), nullable=True),
    )
    # One auto-task per source object — look-ups + idempotency on edit.
    op.create_index(
        "ix_tasks_source", "tasks", ["source_type", "source_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_source", table_name="tasks")
    op.drop_column("tasks", "source_id")
    op.drop_column("tasks", "source_type")
