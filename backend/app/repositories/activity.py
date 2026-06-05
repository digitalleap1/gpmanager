"""Activity-log persistence queries."""

import uuid
from collections.abc import Sequence

from sqlalchemy import select

from app.models.activity import ActivityLog
from app.repositories.base import BaseRepository


class ActivityRepository(BaseRepository[ActivityLog]):
    model = ActivityLog

    def recent(self, company_id: uuid.UUID, limit: int = 10) -> Sequence[ActivityLog]:
        return self.db.scalars(
            select(ActivityLog)
            .where(ActivityLog.company_id == company_id)
            .order_by(ActivityLog.created_at.desc())
            .limit(limit)
        ).all()
