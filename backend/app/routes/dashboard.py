"""Dashboard routes (Module 2)."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.dashboard import (
    ActivityRead,
    ChartBudgetPoint,
    ChartLinksPoint,
    DashboardSummary,
)
from app.services.dashboard import DashboardService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


def _this_year() -> int:
    return datetime.now(UTC).year


@router.get("/summary", response_model=DashboardSummary)
def summary(user: CurrentUser, db: DbSession) -> DashboardSummary:
    return DashboardService(db, user).summary()


@router.get("/recent-activity", response_model=list[ActivityRead])
def recent_activity(
    user: CurrentUser, db: DbSession, limit: int = Query(10, ge=1, le=50)
) -> list[ActivityRead]:
    return DashboardService(db, user).recent_activity(limit)


@router.get("/charts/monthly-links", response_model=list[ChartLinksPoint])
def monthly_links(
    user: CurrentUser, db: DbSession, year: int | None = None
) -> list[ChartLinksPoint]:
    return DashboardService(db, user).monthly_links(year or _this_year())


@router.get("/charts/budget-usage", response_model=list[ChartBudgetPoint])
def budget_usage(
    user: CurrentUser, db: DbSession, year: int | None = None
) -> list[ChartBudgetPoint]:
    return DashboardService(db, user).budget_usage(year or _this_year())
