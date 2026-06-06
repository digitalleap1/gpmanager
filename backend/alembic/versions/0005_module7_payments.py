"""Module 7 - payments + payment status history

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-06
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("website_id", sa.Uuid(), nullable=True),
        sa.Column("guest_post_id", sa.Uuid(), nullable=True),
        sa.Column("live_link", sa.String(length=700), nullable=True),
        sa.Column("amount_usd", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("amount_inr", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("invoice_link", sa.String(length=700), nullable=True),
        sa.Column("payment_date", sa.Date(), nullable=True),
        sa.Column("transaction_id", sa.String(length=120), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("approved_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name="fk_payments_company_id_companies", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_payments_project_id_projects", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["website_id"], ["websites.id"], name="fk_payments_website_id_websites", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["guest_post_id"], ["guest_posts.id"], name="fk_payments_guest_post_id_guest_posts", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_payments_created_by_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"], name="fk_payments_approved_by_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_payments"),
    )
    op.create_index("ix_payments_company_id", "payments", ["company_id"])

    op.create_table(
        "payment_status_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("payment_id", sa.Uuid(), nullable=False),
        sa.Column("from_status", sa.String(length=20), nullable=True),
        sa.Column("to_status", sa.String(length=20), nullable=False),
        sa.Column("changed_by", sa.Uuid(), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], name="fk_payment_status_history_payment_id_payments", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"], name="fk_payment_status_history_changed_by_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_payment_status_history"),
    )
    op.create_index("ix_payment_status_history_payment_id", "payment_status_history", ["payment_id"])


def downgrade() -> None:
    op.drop_index("ix_payment_status_history_payment_id", table_name="payment_status_history")
    op.drop_table("payment_status_history")
    op.drop_index("ix_payments_company_id", table_name="payments")
    op.drop_table("payments")
