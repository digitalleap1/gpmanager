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
    budget_currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    # Budget Management: the budget figure above is per this period; the
    # cost-per-link target feeds the consumption summary.
    budget_period: Mapped[str] = mapped_column(String(10), default="monthly", nullable=False)
    budget_start_date: Mapped[date | None] = mapped_column(Date)
    budget_end_date: Mapped[date | None] = mapped_column(Date)
    cost_per_link_target: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
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
    comments: Mapped[list[ProjectComment]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectComment.created_at.desc()",
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


class BudgetAdjustment(UUIDPrimaryKeyMixin, Base):
    """A requested increase/decrease to a project's budget, pending admin approval."""

    __tablename__ = "budget_adjustments"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    delta_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)  # signed
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped[Project] = relationship()
    requester: Mapped[User | None] = relationship(foreign_keys=[requested_by], lazy="joined")
    decider: Mapped[User | None] = relationship(foreign_keys=[decided_by], lazy="joined")


class ProjectWorkflowStage(UUIDPrimaryKeyMixin, Base):
    """Simple per-project workflow checklist: the team lead picks one person per
    stage (website review / content writing / payment); each assignment spawns a
    Task for that person. The stage is 'done' when its task is completed."""

    __tablename__ = "project_workflow_stages"
    __table_args__ = (
        UniqueConstraint("project_id", "stage_key", name="uq_project_workflow_stage"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_key: Mapped[str] = mapped_column(String(30), nullable=False)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped[Project] = relationship()
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id], lazy="joined")


class ProjectChecklistItem(UUIDPrimaryKeyMixin, Base):
    """Auto-generated per-project workflow checklist item with its own status +
    comments/activity timeline (Find a Website / Content Writing / Publish & Live
    Link / Payment)."""

    __tablename__ = "project_checklist_items"
    __table_args__ = (
        UniqueConstraint("project_id", "item_key", name="uq_project_checklist_item"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_key: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    # Who is currently responsible for this item, and any relevant link
    # (website URL / live URL / client payment link).
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    link: Mapped[str | None] = mapped_column(String(700))
    # Payment-item details (regular / advance / reversal).
    payment_type: Mapped[str | None] = mapped_column(String(20))
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    transaction_id: Mapped[str | None] = mapped_column(String(120))
    payment_mode: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped[Project] = relationship()
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id], lazy="joined")
    entries: Mapped[list[ProjectChecklistEntry]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="ProjectChecklistEntry.created_at",
    )


class ProjectChecklistEntry(UUIDPrimaryKeyMixin, Base):
    """One row in a checklist item's timeline: a user comment OR a status change."""

    __tablename__ = "project_checklist_entries"

    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project_checklist_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    # The project member this entry is ABOUT (who approved / wrote content / paid).
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(20), default="comment", nullable=False)  # comment|status
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    item: Mapped[ProjectChecklistItem] = relationship(back_populates="entries")
    author: Mapped[User | None] = relationship(foreign_keys=[author_id], lazy="joined")
    subject: Mapped[User | None] = relationship(foreign_keys=[subject_id], lazy="joined")


class ProjectComment(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "project_comments"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped[Project] = relationship(back_populates="comments")
    author: Mapped[User | None] = relationship(foreign_keys=[author_id], lazy="joined")
