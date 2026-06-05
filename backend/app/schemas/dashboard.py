"""Dashboard DTOs (Module 2)."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.refs import UserRef


class DashboardSummary(BaseModel):
    total_projects: int
    active_projects: int
    completed_projects: int
    on_hold_projects: int
    cancelled_projects: int
    total_target_links: int
    total_live_links: int          # populated once Module 5 (guest posts) lands
    pending_payments_count: int    # populated once Module 7 (payments) lands
    pending_payments_amount: float
    monthly_budget_total: float
    monthly_spent_total: float
    team_members: int


class ActivityRead(BaseModel):
    id: uuid.UUID
    action: str
    module: str
    entity_type: str | None
    entity_id: uuid.UUID | None
    user: UserRef | None
    created_at: datetime
    summary: str


class ChartLinksPoint(BaseModel):
    month: int
    target: int
    achieved: int


class ChartBudgetPoint(BaseModel):
    month: int
    budget: float
    spent: float
