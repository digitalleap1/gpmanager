"""Activity-log persistence queries."""

import uuid
from collections.abc import Sequence

from sqlalchemy import select

from app.models.activity import ActivityLog
from app.repositories.base import BaseRepository


class ActivityRepository(BaseRepository[ActivityLog]):
    model = ActivityLog

    def recent(
        self,
        company_id: uuid.UUID,
        limit: int = 10,
        restrict_to_users: set[uuid.UUID] | None = None,
    ) -> Sequence[ActivityLog]:
        stmt = select(ActivityLog).where(ActivityLog.company_id == company_id)
        # Role scope: non-admins see only their own + their team's activity (by actor).
        if restrict_to_users is not None:
            stmt = stmt.where(ActivityLog.user_id.in_(restrict_to_users))
        return self.db.scalars(
            stmt.order_by(ActivityLog.created_at.desc()).limit(limit)
        ).all()
