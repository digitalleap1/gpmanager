"""Simple per-project workflow checklist stages

Revision ID: 0022
Revises: 0021
Create Date: 2026-06-10
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "project_workflow_stages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("stage_key", sa.String(length=30), nullable=False),
        sa.Column("assignee_id", sa.Uuid(), nullable=True),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_pws_project", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"], name="fk_pws_assignee", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], name="fk_pws_task", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_project_workflow_stages"),
        sa.UniqueConstraint("project_id", "stage_key", name="uq_project_workflow_stage"),
    )
    op.create_index("ix_project_workflow_stages_project_id", "project_workflow_stages", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_project_workflow_stages_project_id", table_name="project_workflow_stages")
    op.drop_table("project_workflow_stages")
