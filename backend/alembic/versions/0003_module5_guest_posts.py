"""Module 5 - guest posts, status history, outreach messages

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-05
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "guest_posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("website_id", sa.Uuid(), nullable=True),
        sa.Column("website_name", sa.String(length=180), nullable=True),
        sa.Column("da", sa.SmallInteger(), nullable=True),
        sa.Column("dr", sa.SmallInteger(), nullable=True),
        sa.Column("traffic", sa.BigInteger(), nullable=True),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("assigned_user_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("outreach_date", sa.Date(), nullable=True),
        sa.Column("live_link_date", sa.Date(), nullable=True),
        sa.Column("live_link", sa.String(length=700), nullable=True),
        sa.Column("anchor_text", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name="fk_guest_posts_company_id_companies", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_guest_posts_project_id_projects", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"], name="fk_guest_posts_assigned_user_id_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_guest_posts_created_by_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_guest_posts"),
    )
    op.create_index("ix_guest_posts_company_id", "guest_posts", ["company_id"])
    op.create_index("ix_guest_posts_project_id", "guest_posts", ["project_id"])

    op.create_table(
        "guest_post_status_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("guest_post_id", sa.Uuid(), nullable=False),
        sa.Column("from_status", sa.String(length=20), nullable=True),
        sa.Column("to_status", sa.String(length=20), nullable=False),
        sa.Column("changed_by", sa.Uuid(), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["guest_post_id"], ["guest_posts.id"], name="fk_guest_post_status_history_guest_post_id_guest_posts", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"], name="fk_guest_post_status_history_changed_by_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_guest_post_status_history"),
    )
    op.create_index("ix_guest_post_status_history_guest_post_id", "guest_post_status_history", ["guest_post_id"])

    op.create_table(
        "outreach_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("guest_post_id", sa.Uuid(), nullable=True),
        sa.Column("website_id", sa.Uuid(), nullable=True),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("sent_by", sa.Uuid(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name="fk_outreach_messages_company_id_companies", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["guest_post_id"], ["guest_posts.id"], name="fk_outreach_messages_guest_post_id_guest_posts", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sent_by"], ["users.id"], name="fk_outreach_messages_sent_by_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_outreach_messages"),
    )


def downgrade() -> None:
    op.drop_table("outreach_messages")
    op.drop_index("ix_guest_post_status_history_guest_post_id", table_name="guest_post_status_history")
    op.drop_table("guest_post_status_history")
    op.drop_index("ix_guest_posts_project_id", table_name="guest_posts")
    op.drop_index("ix_guest_posts_company_id", table_name="guest_posts")
    op.drop_table("guest_posts")
