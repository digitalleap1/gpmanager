"""Project workflow checklist items + entries (status/comments/activity)

Revision ID: 0023
Revises: 0022
Create Date: 2026-06-11
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "project_checklist_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("item_key", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=140), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("position", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_pci_project", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_project_checklist_items"),
        sa.UniqueConstraint("project_id", "item_key", name="uq_project_checklist_item"),
    )
    op.create_index("ix_project_checklist_items_project_id", "project_checklist_items", ["project_id"])

    op.create_table(
        "project_checklist_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="comment"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["project_checklist_items.id"], name="fk_pce_item", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], name="fk_pce_author", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_project_checklist_entries"),
    )
    op.create_index("ix_project_checklist_entries_item_id", "project_checklist_entries", ["item_id"])


def downgrade() -> None:
    op.drop_index("ix_project_checklist_entries_item_id", table_name="project_checklist_entries")
    op.drop_table("project_checklist_entries")
    op.drop_index("ix_project_checklist_items_project_id", table_name="project_checklist_items")
    op.drop_table("project_checklist_items")
