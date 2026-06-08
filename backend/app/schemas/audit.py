"""Audit-log read DTO (Phase 2 — Audit Logs viewer)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.activity import ActivityLog
from app.schemas.refs import UserRef


class AuditLogRead(BaseModel):
    id: uuid.UUID
    user: UserRef | None
    action: str
    module: str
    entity_type: str | None
    entity_id: uuid.UUID | None
    old_value: dict[str, Any] | None
    new_value: dict[str, Any] | None
    created_at: datetime

    @classmethod
    def from_log(cls, log: ActivityLog) -> AuditLogRead:
        return cls(
            id=log.id,
            user=UserRef(id=log.user.id, full_name=log.user.full_name) if log.user else None,
            action=log.action,
            module=log.module,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            old_value=log.old_value,
            new_value=log.new_value,
            created_at=log.created_at,
        )
