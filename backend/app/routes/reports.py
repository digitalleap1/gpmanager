"""Report routes (Module 10): /api/reports/{type}. JSON by default, CSV with
?format=csv. Managers only (enforced in ReportService)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.exceptions import NotFound
from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.report import ReportResult
from app.services.report import ReportService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/{report_type}", response_model=None)
def run_report(
    report_type: str,
    user: CurrentUser,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    project_id: uuid.UUID | None = None,
    team_lead_id: uuid.UUID | None = None,
    country_id: int | None = None,
    status_: str | None = Query(None, alias="status"),
    format: str = Query("json"),
) -> ReportResult | Response:
    svc = ReportService(db, user)
    filters = dict(
        date_from=date_from,
        date_to=date_to,
        project_id=project_id,
        team_lead_id=team_lead_id,
        country_id=country_id,
        status=status_,
    )
    builders = {
        "project": svc.project_report,
        "team": svc.team_report,
        "financial": svc.financial_report,
        "guest-post": svc.guest_post_report,
    }
    builder = builders.get(report_type)
    if builder is None:
        raise NotFound("Unknown report type")
    result = builder(**filters)
    if format == "csv":
        return Response(
            content=ReportService.to_csv(result),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={report_type}-report.csv"},
        )
    return result
