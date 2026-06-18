"""Budget cycles: per-period budgets + auto-renew + recurring task

Revision ID: 0031
Revises: 0030
Create Date: 2026-06-18
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # When on, each new period auto-takes the base budget amount and pushes a
    # recurring "budget" task to the project's assignee.
    op.add_column(
        "projects",
        sa.Column(
            "budget_auto_renew",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    op.create_table(
        "project_budget_periods",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("company_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("period_type", sa.String(length=10), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("label", sa.String(length=40), nullable=False),
        sa.Column("budget_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column(
            "task_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("project_id", "start_date", name="uq_budget_period_start"),
    )
    op.create_index(
        "ix_project_budget_periods_project_id", "project_budget_periods", ["project_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_budget_periods_project_id", table_name="project_budget_periods"
    )
    op.drop_table("project_budget_periods")
    op.drop_column("projects", "budget_auto_renew")
