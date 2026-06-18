"""Payment assignment workflow: case, request stage, CC watchers

Revision ID: 0030
Revises: 0029
Create Date: 2026-06-18
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The payment "case" (standard / advance / reversal / other) and where the
    # request currently sits (assigned -> submitted -> verified | returned).
    op.add_column(
        "payments",
        sa.Column(
            "payment_case",
            sa.String(length=20),
            nullable=False,
            server_default="standard",
        ),
    )
    op.add_column(
        "payments", sa.Column("request_stage", sa.String(length=20), nullable=True)
    )

    # CC watchers: people looped in on a payment request (notified, can comment)
    # but NOT the responsible payer (that stays payments.attributed_to_id).
    op.create_table(
        "payment_watchers",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "payment_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("payments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("payment_id", "user_id", name="uq_payment_watcher"),
    )
    op.create_index(
        "ix_payment_watchers_payment_id", "payment_watchers", ["payment_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_payment_watchers_payment_id", table_name="payment_watchers")
    op.drop_table("payment_watchers")
    op.drop_column("payments", "request_stage")
    op.drop_column("payments", "payment_case")
