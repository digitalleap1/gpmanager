"""Payment Management (Module 7): payments + status history."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.project import Project  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.website import Website  # noqa: F401


class Payment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payments"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL")
    )
    website_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("websites.id", ondelete="SET NULL")
    )
    guest_post_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("guest_posts.id", ondelete="SET NULL")
    )
    live_link: Mapped[str | None] = mapped_column(String(700))
    # Native charge currency + manual FX rate -> USD; amount_usd is the derived
    # canonical (USD) value used by dashboards/reports. amount_inr is retained
    # for back-compat with existing rows/clients.
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    fx_to_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    amount_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    amount_inr: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    mode_of_payment: Mapped[str | None] = mapped_column(String(60))
    notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    invoice_link: Mapped[str | None] = mapped_column(String(700))
    payment_date: Mapped[date | None] = mapped_column(Date)
    transaction_id: Mapped[str | None] = mapped_column(String(120))
    remarks: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    project: Mapped[Project | None] = relationship(lazy="joined")
    website: Mapped[Website | None] = relationship(lazy="joined")
    status_history: Mapped[list[PaymentStatusHistory]] = relationship(
        back_populates="payment",
        cascade="all, delete-orphan",
        order_by="PaymentStatusHistory.created_at.desc()",
    )


class PaymentStatusHistory(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "payment_status_history"

    payment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    payment: Mapped[Payment] = relationship(back_populates="status_history")
    changed_by_user: Mapped[User | None] = relationship(foreign_keys=[changed_by], lazy="joined")
