"""Checklist entry subject (the project member a comment is about)

Revision ID: 0024
Revises: 0023
Create Date: 2026-06-11
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("project_checklist_entries", sa.Column("subject_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_pce_subject", "project_checklist_entries", "users",
        ["subject_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_pce_subject", "project_checklist_entries", type_="foreignkey")
    op.drop_column("project_checklist_entries", "subject_id")
