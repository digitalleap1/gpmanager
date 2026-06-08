"""Soft-delete (Trash) for projects, clients, payments, websites

Adds deleted_at + deleted_by so deletes are reversible (move to Trash, then
restore or permanently purge).

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-08
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("projects", "clients", "payments", "websites")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("deleted_by", sa.Uuid(), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_deleted_by_users", table, "users", ["deleted_by"], ["id"],
            ondelete="SET NULL",
        )
        op.create_index(f"ix_{table}_deleted_at", table, ["deleted_at"])


def downgrade() -> None:
    for table in _TABLES:
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_constraint(f"fk_{table}_deleted_by_users", table, type_="foreignkey")
        op.drop_column(table, "deleted_by")
        op.drop_column(table, "deleted_at")
