"""Phase 1 RBAC - teams + team membership

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-08
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "teams",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("team_lead_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name="fk_teams_company_id_companies", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_lead_id"], ["users.id"], name="fk_teams_team_lead_id_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_teams"),
        sa.UniqueConstraint("company_id", "name", name="uq_teams_company_name"),
    )
    op.create_table(
        "team_members",
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_team_members_team_id_teams", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_team_members_user_id_users", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("team_id", "user_id", name="pk_team_members"),
    )


def downgrade() -> None:
    op.drop_table("team_members")
    op.drop_table("teams")
