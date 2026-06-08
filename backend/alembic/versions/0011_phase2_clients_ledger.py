"""Phase 2 - clients + payments ledger fields

Adds the Client entity and links Projects / Payments / Websites to it. Extends
payments with invoice number, team attribution (attributed_to + via), in support
of the payments-ledger module.

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-08
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column("total_budget", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("contact_name", sa.String(length=160), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("contact_phone", sa.String(length=40), nullable=True),
        sa.Column("website", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name="fk_clients_company_id_companies", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_clients_created_by_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_clients"),
        sa.UniqueConstraint("company_id", "name", name="uq_clients_company_name"),
    )
    op.create_index("ix_clients_company_id", "clients", ["company_id"])

    op.add_column("projects", sa.Column("client_id", sa.Uuid(), nullable=True))
    op.create_index("ix_projects_client_id", "projects", ["client_id"])
    op.create_foreign_key(
        "fk_projects_client_id_clients", "projects", "clients", ["client_id"], ["id"], ondelete="SET NULL"
    )

    op.add_column("websites", sa.Column("client_id", sa.Uuid(), nullable=True))
    op.create_index("ix_websites_client_id", "websites", ["client_id"])
    op.create_foreign_key(
        "fk_websites_client_id_clients", "websites", "clients", ["client_id"], ["id"], ondelete="SET NULL"
    )

    op.add_column("payments", sa.Column("client_id", sa.Uuid(), nullable=True))
    op.add_column("payments", sa.Column("invoice_number", sa.String(length=120), nullable=True))
    op.add_column("payments", sa.Column("attributed_to_id", sa.Uuid(), nullable=True))
    op.add_column("payments", sa.Column("via", sa.String(length=20), nullable=True))
    op.create_index("ix_payments_client_id", "payments", ["client_id"])
    op.create_foreign_key(
        "fk_payments_client_id_clients", "payments", "clients", ["client_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_payments_attributed_to_id_users", "payments", "users", ["attributed_to_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_payments_attributed_to_id_users", "payments", type_="foreignkey")
    op.drop_constraint("fk_payments_client_id_clients", "payments", type_="foreignkey")
    op.drop_index("ix_payments_client_id", table_name="payments")
    op.drop_column("payments", "via")
    op.drop_column("payments", "attributed_to_id")
    op.drop_column("payments", "invoice_number")
    op.drop_column("payments", "client_id")

    op.drop_constraint("fk_websites_client_id_clients", "websites", type_="foreignkey")
    op.drop_index("ix_websites_client_id", table_name="websites")
    op.drop_column("websites", "client_id")

    op.drop_constraint("fk_projects_client_id_clients", "projects", type_="foreignkey")
    op.drop_index("ix_projects_client_id", table_name="projects")
    op.drop_column("projects", "client_id")

    op.drop_index("ix_clients_company_id", table_name="clients")
    op.drop_table("clients")
