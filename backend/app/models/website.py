"""Website Database (Module 6): websites, contacts, niches (M2M), metrics history."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.lookups import Country, Language, Niche  # noqa: F401
from app.models.user import User  # noqa: F401

website_niches = Table(
    "website_niches",
    Base.metadata,
    Column("website_id", ForeignKey("websites.id", ondelete="CASCADE"), primary_key=True),
    Column("niche_id", ForeignKey("niches.id", ondelete="CASCADE"), primary_key=True),
)


class Website(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "websites"
    __table_args__ = (UniqueConstraint("company_id", "domain", name="uq_websites_company_domain"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), index=True
    )
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(180))
    main_niche_id: Mapped[int | None] = mapped_column(ForeignKey("niches.id", ondelete="SET NULL"))
    country_id: Mapped[int | None] = mapped_column(ForeignKey("countries.id", ondelete="SET NULL"))
    language_id: Mapped[int | None] = mapped_column(ForeignKey("languages.id", ondelete="SET NULL"))
    traffic: Mapped[int | None] = mapped_column(BigInteger)
    da: Mapped[int | None] = mapped_column(SmallInteger)
    dr: Mapped[int | None] = mapped_column(SmallInteger)
    spam_score: Mapped[int | None] = mapped_column(SmallInteger)
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    contact_person: Mapped[str | None] = mapped_column(String(160))
    guest_post_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    link_insertion_available: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    homepage_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    main_niche: Mapped[Niche | None] = relationship(foreign_keys=[main_niche_id], lazy="joined")
    country: Mapped[Country | None] = relationship(lazy="joined")
    language: Mapped[Language | None] = relationship(lazy="joined")
    niches: Mapped[list[Niche]] = relationship(secondary=website_niches, lazy="selectin")
    contacts: Mapped[list[WebsiteContact]] = relationship(
        back_populates="website", cascade="all, delete-orphan", lazy="selectin"
    )
    metrics_history: Mapped[list[WebsiteMetricsHistory]] = relationship(
        back_populates="website",
        cascade="all, delete-orphan",
        order_by="WebsiteMetricsHistory.captured_on.desc()",
    )


class WebsiteContact(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "website_contacts"

    website_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str | None] = mapped_column(String(160))
    email: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str | None] = mapped_column(String(80))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    website: Mapped[Website] = relationship(back_populates="contacts")


class WebsiteMetricsHistory(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "website_metrics_history"
    __table_args__ = (
        UniqueConstraint("website_id", "captured_on", name="uq_website_metrics_history_wc"),
    )

    website_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    captured_on: Mapped[date] = mapped_column(Date, nullable=False)
    da: Mapped[int | None] = mapped_column(SmallInteger)
    dr: Mapped[int | None] = mapped_column(SmallInteger)
    traffic: Mapped[int | None] = mapped_column(BigInteger)
    spam_score: Mapped[int | None] = mapped_column(SmallInteger)

    website: Mapped[Website] = relationship(back_populates="metrics_history")
