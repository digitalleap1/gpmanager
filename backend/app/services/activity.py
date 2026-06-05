"""Activity logging helper (Module 11).

Records audit entries inside the caller's transaction (no commit here). Values are
coerced to JSON-serialisable primitives for the JSONB columns.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.activity import ActivityLog


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
