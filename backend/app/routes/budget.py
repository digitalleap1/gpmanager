"""Budget Management routes: /api/budget/*."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.budget import (
    AdjustmentCreate,
    AdjustmentDecision,
    AdjustmentRead,
    BudgetSetRequest,
    BudgetSummary,
)
from app.services.budget import BudgetService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/projects/{project_id}/summary", response_model=BudgetSummary)
def budget_summary(project_id: uuid.UUID, user: CurrentUser, db: DbSession) -> BudgetSummary:
    return BudgetSummary(**BudgetService(db, user).summary(project_id))


@router.put("/projects/{project_id}", response_model=BudgetSummary)
def set_budget(
    project_id: uuid.UUID, body: BudgetSetRequest, user: CurrentUser, db: DbSession
) -> BudgetSummary:
    return BudgetSummary(
        **BudgetService(db, user).set_budget(
            project_id,
            amount=body.amount,
            period=body.period,
            currency=body.currency,
            cost_per_link_target=body.cost_per_link_target,
            start_date=body.start_date,
            end_date=body.end_date,
        )
    )


@router.get("/projects/{project_id}/adjustments", response_model=list[AdjustmentRead])
def list_adjustments(
    project_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> list[AdjustmentRead]:
    return [AdjustmentRead.from_row(a) for a in BudgetService(db, user).list_adjustments(project_id)]


@router.post(
    "/projects/{project_id}/adjustments",
    response_model=AdjustmentRead,
    status_code=status.HTTP_201_CREATED,
)
def request_adjustment(
    project_id: uuid.UUID, body: AdjustmentCreate, user: CurrentUser, db: DbSession
) -> AdjustmentRead:
    return AdjustmentRead.from_row(
        BudgetService(db, user).request_adjustment(project_id, body.delta, body.reason)
    )


@router.post("/adjustments/{adjustment_id}/decide", response_model=AdjustmentRead)
def decide_adjustment(
    adjustment_id: uuid.UUID, body: AdjustmentDecision, user: CurrentUser, db: DbSession
) -> AdjustmentRead:
    return AdjustmentRead.from_row(
        BudgetService(db, user).decide_adjustment(adjustment_id, body.approve, body.note)
    )
