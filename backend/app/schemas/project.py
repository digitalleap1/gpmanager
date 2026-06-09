"""Project DTOs (Module 3)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.currencies import CURRENCY_CODES, DEFAULT_CURRENCY
from app.models.project import Project, ProjectComment, ProjectMember
from app.schemas.goal import MonthlyBudgetRead, MonthlyGoalRead
from app.schemas.lookup import CountryRead, NicheRead
from app.schemas.refs import UserRef

PROJECT_STATUSES = {"active", "completed", "hold", "cancelled"}


def _validate_currency(value: str | None) -> str | None:
    if value is None:
        return None
    code = value.upper()
    if code not in CURRENCY_CODES:
        raise ValueError(f"currency must be one of {sorted(CURRENCY_CODES)}")
    return code


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    client_id: uuid.UUID | None = None
    main_niche_id: int | None = None
    project_niche_id: int | None = None
    target_country_id: int | None = None
    assignee_id: uuid.UUID | None = None
    team_lead_id: uuid.UUID | None = None
    monthly_budget: float = Field(default=0, ge=0)
    budget_currency: str = DEFAULT_CURRENCY
    target_links: int = Field(default=0, ge=0)
    goal: str | None = None
    due_date: date | None = None
    status: str = "active"
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def _check_status(cls, value: str) -> str:
        if value not in PROJECT_STATUSES:
            raise ValueError(f"status must be one of {sorted(PROJECT_STATUSES)}")
        return value

    @field_validator("budget_currency")
    @classmethod
    def _cur(cls, value: str) -> str:
        return _validate_currency(value) or DEFAULT_CURRENCY


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    client_id: uuid.UUID | None = None
    main_niche_id: int | None = None
    project_niche_id: int | None = None
    target_country_id: int | None = None
    assignee_id: uuid.UUID | None = None
    team_lead_id: uuid.UUID | None = None
    monthly_budget: float | None = Field(default=None, ge=0)
    budget_currency: str | None = None
    target_links: int | None = Field(default=None, ge=0)
    goal: str | None = None
    due_date: date | None = None
    status: str | None = None
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def _check_status(cls, value: str | None) -> str | None:
        if value is not None and value not in PROJECT_STATUSES:
            raise ValueError(f"status must be one of {sorted(PROJECT_STATUSES)}")
        return value

    @field_validator("budget_currency")
    @classmethod
    def _cur(cls, value: str | None) -> str | None:
        return _validate_currency(value)


class ArchiveRequest(BaseModel):
    archived: bool


class BulkAssignRequest(BaseModel):
    project_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    assignee_id: uuid.UUID | None = None
    team_lead_id: uuid.UUID | None = None


class BulkAssignResult(BaseModel):
    updated: int
    skipped: int


class BulkDeleteRequest(BaseModel):
    project_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    password: str = Field(min_length=1)


class BulkDeleteResult(BaseModel):
    deleted: int
    skipped: int


class ProjectOverview(BaseModel):
    budget_assigned: float
    budget_consumed: float
    budget_pending: float
    budget_remaining: float
    budget_currency: str
    cost_per_link: float | None
    cost_per_website: float | None
    target_links: int
    total_links: int
    published_links: int
    pending_links: int
    rejected_links: int
    websites_used: int
    payments_count: int
    payments_paid: float
    payments_pending: float
    team_size: int
    tasks_total: int
    tasks_completed: int


class WebsiteUsedItem(BaseModel):
    website: str
    links: int
    spend: float
    published: int


class MemberCreate(BaseModel):
    user_id: uuid.UUID
    role_label: str | None = Field(default=None, max_length=60)


class MemberRead(BaseModel):
    user_id: uuid.UUID
    full_name: str
    role_label: str | None

    @classmethod
    def from_member(cls, member: ProjectMember) -> MemberRead:
        return cls(
            user_id=member.user_id,
            full_name=member.user.full_name,
            role_label=member.role_label,
        )


class ProjectListItem(BaseModel):
    id: uuid.UUID
    name: str
    client_id: uuid.UUID | None
    client_name: str | None
    status: str
    is_archived: bool
    monthly_budget: float
    budget_currency: str
    target_links: int
    due_date: date | None
    main_niche: NicheRead | None
    project_niche: NicheRead | None
    target_country: CountryRead | None
    assignee: UserRef | None
    team_lead: UserRef | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_project(cls, p: Project) -> ProjectListItem:
        return cls(
            id=p.id,
            name=p.name,
            client_id=p.client_id,
            client_name=p.client.name if p.client else None,
            status=p.status,
            is_archived=p.is_archived,
            monthly_budget=float(p.monthly_budget),
            budget_currency=p.budget_currency or "USD",
            target_links=p.target_links,
            due_date=p.due_date,
            main_niche=NicheRead.model_validate(p.main_niche) if p.main_niche else None,
            project_niche=NicheRead.model_validate(p.project_niche) if p.project_niche else None,
            target_country=(
                CountryRead.model_validate(p.target_country) if p.target_country else None
            ),
            assignee=(
                UserRef(id=p.assignee.id, full_name=p.assignee.full_name) if p.assignee else None
            ),
            team_lead=(
                UserRef(id=p.team_lead.id, full_name=p.team_lead.full_name) if p.team_lead else None
            ),
            created_at=p.created_at,
            updated_at=p.updated_at,
        )


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentRead(BaseModel):
    id: uuid.UUID
    author: UserRef | None
    body: str
    created_at: datetime

    @classmethod
    def from_comment(cls, c: ProjectComment) -> CommentRead:
        return cls(
            id=c.id,
            author=UserRef(id=c.author.id, full_name=c.author.full_name) if c.author else None,
            body=c.body,
            created_at=c.created_at,
        )


class ProjectDetail(ProjectListItem):
    goal: str | None
    notes: str | None
    created_by: UserRef | None
    members: list[MemberRead]
    comments: list[CommentRead]
    current_year: int
    goals: list[MonthlyGoalRead]
    budgets: list[MonthlyBudgetRead]

    @classmethod
    def build(
        cls,
        p: Project,
        *,
        current_year: int,
        goals: list[MonthlyGoalRead],
        budgets: list[MonthlyBudgetRead],
    ) -> ProjectDetail:
        base = ProjectListItem.from_project(p).model_dump()
        creator = p.created_by_user
        return cls(
            **base,
            goal=p.goal,
            notes=p.notes,
            created_by=(
                UserRef(id=creator.id, full_name=creator.full_name) if creator else None
            ),
            members=[MemberRead.from_member(m) for m in p.members],
            comments=[CommentRead.from_comment(c) for c in p.comments],
            current_year=current_year,
            goals=goals,
            budgets=budgets,
        )
