"""Guest Post Tracker (Module 5): guest posts, status history, outreach log."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.project import Project  # noqa: F401
from app.models.user import User  # noqa: F401


class GuestPost(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "guest_posts"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    website_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("websites.id", ondelete="SET NULL")
    )
    website_name: Mapped[str | None] = mapped_column(String(180))
    da: Mapped[int | None] = mapped_column(SmallInteger)
    dr: Mapped[int | None] = mapped_column(SmallInteger)
    traffic: Mapped[int | None] = mapped_column(BigInteger)
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(20), default="prospect", nullable=False)
    outreach_date: Mapped[date | None] = mapped_column(Date)
    live_link_date: Mapped[date | None] = mapped_column(Date)
    live_link: Mapped[str | None] = mapped_column(String(700))
    anchor_text: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # Review workflow (member submits -> lead/admin approves/rejects).
    review_status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project: Mapped[Project] = relationship(lazy="joined")
    assigned_user: Mapped[User | None] = relationship(
        foreign_keys=[assigned_user_id], lazy="joined"
    )
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by], lazy="joined")
    status_history: Mapped[list[GuestPostStatusHistory]] = relationship(
        back_populates="guest_post",
        cascade="all, delete-orphan",
        order_by="GuestPostStatusHistory.created_at.desc()",
    )
    outreach_messages: Mapped[list[OutreachMessage]] = relationship(
        back_populates="guest_post", cascade="all, delete-orphan"
    )


class GuestPostStatusHistory(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "guest_post_status_history"

    guest_post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("guest_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    guest_post: Mapped[GuestPost] = relationship(back_populates="status_history")
    changed_by_user: Mapped[User | None] = relationship(foreign_keys=[changed_by], lazy="joined")


class OutreachMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "outreach_messages"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    guest_post_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("guest_posts.id", ondelete="CASCADE")
    )
    website_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    direction: Mapped[str] = mapped_column(String(20), default="outbound", nullable=False)
    subject: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text)
    sent_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    guest_post: Mapped[GuestPost | None] = relationship(back_populates="outreach_messages")
