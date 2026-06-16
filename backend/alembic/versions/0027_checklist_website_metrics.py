"""Checklist Find-a-Website metrics + guest-post link

Revision ID: 0027
Revises: 0026
Create Date: 2026-06-11
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    t = "project_checklist_items"
    op.add_column(t, sa.Column("da", sa.SmallInteger(), nullable=True))
    op.add_column(t, sa.Column("pa", sa.SmallInteger(), nullable=True))
    op.add_column(t, sa.Column("dr", sa.SmallInteger(), nullable=True))
    op.add_column(t, sa.Column("traffic", sa.Integer(), nullable=True))
    op.add_column(t, sa.Column("guest_post_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_pci_guest_post", t, "guest_posts", ["guest_post_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    t = "project_checklist_items"
    op.drop_constraint("fk_pci_guest_post", t, type_="foreignkey")
    op.drop_column(t, "guest_post_id")
    op.drop_column(t, "traffic")
    op.drop_column(t, "dr")
    op.drop_column(t, "pa")
    op.drop_column(t, "da")
