"""Project Management (Module 3) + monthly goals/budgets (Module 4 basics)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.client import Client  # noqa: F401
from app.models.lookups import Country, Niche  # noqa: F401  (registers lookups)
from app.models.user import User  # noqa: F401


class Project(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    main_niche_id: Mapped[int | None] = mapped_column(ForeignKey("niches.id", ondelete="SET NULL"))
    project_niche_id: Mapped[int | None] = mapped_column(
        ForeignKey("niches.id", ondelete="SET NULL")
    )
    target_country_id: Mapped[int | None] = mapped_column(
        ForeignKey("countries.id", ondelete="SET NULL")
    )
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    team_lead_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    monthly_budget: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    target_links: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    goal: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    # Eager-loaded display relationships (foreign_keys disambiguate the 3 user FKs).
    client: Mapped[Client | None] = relationship(foreign_keys=[client_id], lazy="joined")
    main_niche: Mapped[Niche | None] = relationship(foreign_keys=[main_niche_id], lazy="joined")
    project_niche: Mapped[Niche | None] = relationship(
        foreign_keys=[project_niche_id], lazy="joined"
    )
    target_country: Mapped[Country | None] = relationship(
        foreign_keys=[target_country_id], lazy="joined"
    )
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id], lazy="joined")
    team_lead: Mapped[User | None] = relationship(foreign_keys=[team_lead_id], lazy="joined")
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by], lazy="joined")

    members: Mapped[list[ProjectMember]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="selectin"
    )
    monthly_goals: Mapped[list[ProjectMonthlyGoal]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    monthly_budgets: Mapped[list[ProjectMonthlyBudget]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role_label: Mapped[str | None] = mapped_column(String(60))
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped[Project] = relationship(back_populates="members")
    user: Mapped[User] = relationship(lazy="joined")


class ProjectMonthlyGoal(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "project_monthly_goals"
    __table_args__ = (
        UniqueConstraint("project_id", "year", "month", name="uq_project_monthly_goals_pym"),
        CheckConstraint("month BETWEEN 1 AND 12", name="ck_project_monthly_goals_month"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    month: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    goal_target: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    achieved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    project: Mapped[Project] = relationship(back_populates="monthly_goals")


class ProjectMonthlyBudget(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "project_monthly_budgets"
    __table_args__ = (
        UniqueConstraint("project_id", "year", "month", name="uq_project_monthly_budgets_pym"),
        CheckConstraint("month BETWEEN 1 AND 12", name="ck_project_monthly_budgets_month"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    month: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    budget_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    spent_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)

    project: Mapped[Project] = relationship(back_populates="monthly_budgets")
