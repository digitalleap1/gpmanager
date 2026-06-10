"""Budget Management: project budget period + cost-per-link target + adjustments

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-10
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("budget_period", sa.String(length=10), nullable=False, server_default="monthly"),
    )
    op.add_column("projects", sa.Column("budget_start_date", sa.Date(), nullable=True))
    op.add_column("projects", sa.Column("budget_end_date", sa.Date(), nullable=True))
    op.add_column("projects", sa.Column("cost_per_link_target", sa.Numeric(12, 2), nullable=True))

    op.create_table(
        "budget_adjustments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("delta_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("requested_by", sa.Uuid(), nullable=True),
        sa.Column("decided_by", sa.Uuid(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_budget_adjustments_project", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], name="fk_budget_adjustments_requested_by", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["decided_by"], ["users.id"], name="fk_budget_adjustments_decided_by", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_budget_adjustments"),
    )
    op.create_index("ix_budget_adjustments_project_id", "budget_adjustments", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_budget_adjustments_project_id", table_name="budget_adjustments")
    op.drop_table("budget_adjustments")
    op.drop_column("projects", "cost_per_link_target")
    op.drop_column("projects", "budget_end_date")
    op.drop_column("projects", "budget_start_date")
    op.drop_column("projects", "budget_period")
