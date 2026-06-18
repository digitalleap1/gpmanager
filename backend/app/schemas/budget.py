"""Budget Management DTOs."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.project import BudgetAdjustment
from app.schemas.refs import UserRef


class BudgetSummary(BaseModel):
    project_id: uuid.UUID
    project_name: str
    currency: str
    period: str
    auto_renew: bool
    start_date: date | None
    end_date: date | None
    budget: float
    spent: float
    pending: float
    remaining: float
    utilization_pct: float
    links_published: int
    websites_count: int
    cost_per_link: float | None
    cost_per_website: float | None
    cost_per_link_target: float | None


class BudgetSetRequest(BaseModel):
    amount: float | None = Field(default=None, ge=0)
    period: str | None = None  # monthly | weekly | daily
    currency: str | None = Field(default=None, max_length=3)
    cost_per_link_target: float | None = Field(default=None, ge=0)
    start_date: date | None = None
    end_date: date | None = None
    auto_renew: bool | None = None


class BudgetPeriodRead(BaseModel):
    id: uuid.UUID
    label: str
    period_type: str
    start_date: date
    end_date: date
    is_current: bool
    currency: str
    budget: float
    spent: float
    pending: float
    remaining: float
    utilization_pct: float
    status: str
    task_id: uuid.UUID | None
    task_status: str | None
    assignee: UserRef | None


class BudgetPeriodSet(BaseModel):
    amount: float = Field(ge=0)


class AutoRenewRequest(BaseModel):
    auto_renew: bool


class AdjustmentCreate(BaseModel):
    # Signed: positive to increase, negative to decrease.
    delta: float
    reason: str | None = Field(default=None, max_length=500)


class AdjustmentDecision(BaseModel):
    approve: bool
    note: str | None = Field(default=None, max_length=500)


class AdjustmentRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    delta_amount: float
    reason: str | None
    status: str
    requester: UserRef | None
    decider: UserRef | None
    decided_at: datetime | None
    decision_note: str | None
    created_at: datetime

    @classmethod
    def from_row(cls, a: BudgetAdjustment) -> AdjustmentRead:
        return cls(
            id=a.id,
            project_id=a.project_id,
            delta_amount=float(a.delta_amount),
            reason=a.reason,
            status=a.status,
            requester=(
                UserRef(id=a.requester.id, full_name=a.requester.full_name)
                if a.requester
                else None
            ),
            decider=(
                UserRef(id=a.decider.id, full_name=a.decider.full_name) if a.decider else None
            ),
            decided_at=a.decided_at,
            decision_note=a.decision_note,
            created_at=a.created_at,
        )
