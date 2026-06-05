"""Module 6 - websites, contacts, niches (M2M), metrics history; guest_posts.website_id FK

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-05
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "websites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=True),
        sa.Column("main_niche_id", sa.Integer(), nullable=True),
        sa.Column("country_id", sa.Integer(), nullable=True),
        sa.Column("language_id", sa.Integer(), nullable=True),
        sa.Column("traffic", sa.BigInteger(), nullable=True),
        sa.Column("da", sa.SmallInteger(), nullable=True),
        sa.Column("dr", sa.SmallInteger(), nullable=True),
        sa.Column("spam_score", sa.SmallInteger(), nullable=True),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("contact_person", sa.String(length=160), nullable=True),
        sa.Column("guest_post_available", sa.Boolean(), nullable=False),
        sa.Column("link_insertion_available", sa.Boolean(), nullable=False),
        sa.Column("homepage_url", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], name="fk_websites_company_id_companies", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["main_niche_id"], ["niches.id"], name="fk_websites_main_niche_id_niches", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["country_id"], ["countries.id"], name="fk_websites_country_id_countries", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["language_id"], ["languages.id"], name="fk_websites_language_id_languages", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_websites_created_by_users", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_websites"),
        sa.UniqueConstraint("company_id", "domain", name="uq_websites_company_domain"),
    )
    op.create_index("ix_websites_company_id", "websites", ["company_id"])

    op.create_table(
        "website_contacts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("website_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=80), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["website_id"], ["websites.id"], name="fk_website_contacts_website_id_websites", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_website_contacts"),
    )
    op.create_index("ix_website_contacts_website_id", "website_contacts", ["website_id"])

    op.create_table(
        "website_niches",
        sa.Column("website_id", sa.Uuid(), nullable=False),
        sa.Column("niche_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["website_id"], ["websites.id"], name="fk_website_niches_website_id_websites", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["niche_id"], ["niches.id"], name="fk_website_niches_niche_id_niches", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("website_id", "niche_id", name="pk_website_niches"),
    )

    op.create_table(
        "website_metrics_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("website_id", sa.Uuid(), nullable=False),
        sa.Column("captured_on", sa.Date(), nullable=False),
        sa.Column("da", sa.SmallInteger(), nullable=True),
        sa.Column("dr", sa.SmallInteger(), nullable=True),
        sa.Column("traffic", sa.BigInteger(), nullable=True),
        sa.Column("spam_score", sa.SmallInteger(), nullable=True),
        sa.ForeignKeyConstraint(["website_id"], ["websites.id"], name="fk_website_metrics_history_website_id_websites", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_website_metrics_history"),
        sa.UniqueConstraint("website_id", "captured_on", name="uq_website_metrics_history_wc"),
    )
    op.create_index("ix_website_metrics_history_website_id", "website_metrics_history", ["website_id"])

    # Now that websites exists, link guest_posts.website_id to it.
    op.create_foreign_key(
        "fk_guest_posts_website_id_websites",
        "guest_posts",
        "websites",
        ["website_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_guest_posts_website_id_websites", "guest_posts", type_="foreignkey")
    op.drop_index("ix_website_metrics_history_website_id", table_name="website_metrics_history")
    op.drop_table("website_metrics_history")
    op.drop_table("website_niches")
    op.drop_index("ix_website_contacts_website_id", table_name="website_contacts")
    op.drop_table("website_contacts")
    op.drop_index("ix_websites_company_id", table_name="websites")
    op.drop_table("websites")
