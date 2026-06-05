"""Step 2 - lookups, projects, goals/budgets, activity logs

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-05
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- lookups ---
    op.create_table(
        "countries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("iso_code", sa.String(length=2), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("phone_code", sa.String(length=8), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_countries"),
        sa.UniqueConstraint("iso_code", name="uq_countries_iso_code"),
    )
    op.create_table(
        "languages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("iso_code", sa.String(length=8), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_languages"),
        sa.UniqueConstraint("iso_code", name="uq_languages_iso_code"),
    )
    op.create_table(
        "niches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=140), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["niches.id"], name="fk_niches_parent_id_niches", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_niches"),
        sa.UniqueConstraint("name", name="uq_niches_name"),
        sa.UniqueConstraint("slug", name="uq_niches_slug"),
    )

    # --- projects ---
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("main_niche_id", sa.Integer(), nullable=True),
        sa.Column("project_niche_id", sa.Integer(), nullable=True),
        sa.Column("target_country_id", sa.Integer(), nullable=True),
        sa.Column("assignee_id", sa.Uuid(), nullable=True),
        sa.Column("team_lead_id", sa.Uuid(), nullable=True),
        sa.Column("monthly_budget", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("target_links", sa.Integer(), nullable=False),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name="fk_projects_company_id_companies", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["main_niche_id"], ["niches.id"], name="fk_projects_main_niche_id_niches", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_niche_id"], ["niches.id"], name="fk_projects_project_niche_id_niches", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_country_id"], ["countries.id"], name="fk_projects_target_country_id_countries", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"], name="fk_projects_assignee_id_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["team_lead_id"], ["users.id"], name="fk_projects_team_lead_id_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_projects_created_by_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_projects"),
    )
    op.create_index("ix_projects_company_id", "projects", ["company_id"])

    op.create_table(
        "project_members",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role_label", sa.String(length=60), nullable=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_project_members_project_id_projects", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_project_members_user_id_users", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id", "user_id", name="pk_project_members"),
    )

    op.create_table(
        "project_monthly_goals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("month", sa.SmallInteger(), nullable=False),
        sa.Column("goal_target", sa.Integer(), nullable=False),
        sa.Column("achieved", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_project_monthly_goals_project_id_projects", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_project_monthly_goals"),
        sa.UniqueConstraint("project_id", "year", "month", name="uq_project_monthly_goals_pym"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="ck_project_monthly_goals_month"),
    )

    op.create_table(
        "project_monthly_budgets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("month", sa.SmallInteger(), nullable=False),
        sa.Column("budget_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("spent_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_project_monthly_budgets_project_id_projects", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_project_monthly_budgets"),
        sa.UniqueConstraint("project_id", "year", "month", name="uq_project_monthly_budgets_pym"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="ck_project_monthly_budgets_month"),
    )

    # --- activity logs ---
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("module", sa.String(length=40), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=True),
        sa.Column("entity_id", sa.Uuid(), nullable=True),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name="fk_activity_logs_company_id_companies", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_activity_logs_user_id_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_activity_logs"),
    )
    op.create_index("ix_activity_logs_company_created", "activity_logs", ["company_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_activity_logs_company_created", table_name="activity_logs")
    op.drop_table("activity_logs")
    op.drop_table("project_monthly_budgets")
    op.drop_table("project_monthly_goals")
    op.drop_table("project_members")
    op.drop_index("ix_projects_company_id", table_name="projects")
    op.drop_table("projects")
    op.drop_table("niches")
    op.drop_table("languages")
    op.drop_table("countries")
