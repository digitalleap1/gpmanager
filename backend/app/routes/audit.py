"""Audit Logs viewer route (admin-only): /api/audit-logs."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.audit import AuditLogRead
from app.schemas.common import Page
from app.services.activity import ActivityLogService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[AuditLogRead])
def list_audit_logs(
    user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    module: str | None = None,
    action: str | None = None,
    user_id: uuid.UUID | None = None,
) -> Page[AuditLogRead]:
    items, total = ActivityLogService(db, user).list(
        module=module,
        action=action,
        user_id=user_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return Page[AuditLogRead](
        items=[AuditLogRead.from_log(log) for log in items],
        total=total,
        page=page,
        page_size=page_size,
    )
