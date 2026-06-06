"""Module 8 - tasks + task comments

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-06
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("assigned_to", sa.Uuid(), nullable=True),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name="fk_tasks_company_id_companies", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_tasks_project_id_projects", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_to"], ["users.id"], name="fk_tasks_assigned_to_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_tasks_created_by_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_tasks"),
    )
    op.create_index("ix_tasks_company_id", "tasks", ["company_id"])

    op.create_table(
        "task_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], name="fk_task_comments_task_id_tasks", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], name="fk_task_comments_author_id_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_task_comments"),
    )
    op.create_index("ix_task_comments_task_id", "task_comments", ["task_id"])


def downgrade() -> None:
    op.drop_index("ix_task_comments_task_id", table_name="task_comments")
    op.drop_table("task_comments")
    op.drop_index("ix_tasks_company_id", table_name="tasks")
    op.drop_table("tasks")
