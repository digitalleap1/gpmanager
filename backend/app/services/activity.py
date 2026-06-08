"""Activity logging helper (Module 11) + the audit-log read service.

``ActivityLogger`` records audit entries inside the caller's transaction (no
commit). ``ActivityLogService`` powers the admin Audit Logs viewer.
"""

import uuid
from collections.abc import Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import PermissionDenied
from app.core.permissions import is_admin
from app.models.activity import ActivityLog
from app.models.user import User


def jsonable(data: dict[str, Any] | None) -> dict[str, Any] | None:
    """Coerce a flat dict's values into JSON-safe primitives."""
    if data is None:
        return None
    out: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, uuid.UUID | datetime | date | Decimal):
            out[key] = str(value)
        else:
            out[key] = value
    return out


class ActivityLogger:
    def __init__(self, db: Session) -> None:
        self.db = db

    def record(
        self,
        *,
        company_id: uuid.UUID,
        user_id: uuid.UUID | None,
        action: str,
        module: str,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        old: dict[str, Any] | None = None,
        new: dict[str, Any] | None = None,
    ) -> None:
        self.db.add(
            ActivityLog(
                company_id=company_id,
                user_id=user_id,
                action=action,
                module=module,
                entity_type=entity_type,
                entity_id=entity_id,
                old_value=jsonable(old),
                new_value=jsonable(new),
            )
        )


class ActivityLogService:
    """Read-side service for the admin Audit Logs viewer."""

    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id

    def list(
        self,
        *,
        module: str | None = None,
        action: str | None = None,
        user_id: uuid.UUID | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[ActivityLog], int]:
        if not is_admin(self.user):
            raise PermissionDenied("Audit logs are available to administrators")
        stmt = select(ActivityLog).where(ActivityLog.company_id == self.company_id)
        if module:
            stmt = stmt.where(ActivityLog.module == module)
        if action:
            stmt = stmt.where(ActivityLog.action.ilike(f"%{action}%"))
        if user_id:
            stmt = stmt.where(ActivityLog.user_id == user_id)
        total = self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self.db.scalars(
            stmt.order_by(ActivityLog.created_at.desc()).offset(offset).limit(limit)
        ).all()
        return items, total
