"""Checklist item assignee + link

Revision ID: 0025
Revises: 0024
Create Date: 2026-06-11
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("project_checklist_items", sa.Column("assignee_id", sa.Uuid(), nullable=True))
    op.add_column("project_checklist_items", sa.Column("link", sa.String(length=700), nullable=True))
    op.create_foreign_key(
        "fk_pci_assignee", "project_checklist_items", "users",
        ["assignee_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_pci_assignee", "project_checklist_items", type_="foreignkey")
    op.drop_column("project_checklist_items", "link")
    op.drop_column("project_checklist_items", "assignee_id")
