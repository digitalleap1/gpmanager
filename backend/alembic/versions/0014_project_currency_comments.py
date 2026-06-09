"""Project budget currency + project comments

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-09
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("budget_currency", sa.String(length=3), nullable=False, server_default="USD"),
    )
    op.create_table(
        "project_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_project_comments_project_id_projects", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], name="fk_project_comments_author_id_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_project_comments"),
    )
    op.create_index("ix_project_comments_project_id", "project_comments", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_project_comments_project_id", table_name="project_comments")
    op.drop_table("project_comments")
    op.drop_column("projects", "budget_currency")
