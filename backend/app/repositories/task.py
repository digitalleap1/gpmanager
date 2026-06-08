"""Task persistence queries."""

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import Select, func, or_, select

from app.models.task import Task
from app.repositories.base import BaseRepository

SORT_FIELDS = {
    "created_at": Task.created_at,
    "updated_at": Task.updated_at,
    "due_date": Task.due_date,
    "priority": Task.priority,
    "status": Task.status,
    "name": Task.name,
}


class TaskRepository(BaseRepository[Task]):
    model = Task

    def get_for_company(self, task_id: uuid.UUID, company_id: uuid.UUID) -> Task | None:
        return self.db.scalars(
            select(Task).where(Task.id == task_id, Task.company_id == company_id)
        ).first()

    def _filtered(
        self,
        company_id: uuid.UUID,
        *,
        project_id: uuid.UUID | None,
        status: str | None,
        priority: str | None,
        assigned_to: uuid.UUID | None,
        due_before: date | None,
        search: str | None,
        restrict_to_users: set[uuid.UUID] | None,
    ) -> Select:
        stmt = select(Task).where(Task.company_id == company_id)
        if project_id:
            stmt = stmt.where(Task.project_id == project_id)
        if status:
            stmt = stmt.where(Task.status == status)
        if priority:
            stmt = stmt.where(Task.priority == priority)
        if assigned_to:
            stmt = stmt.where(Task.assigned_to == assigned_to)
        if due_before:
            stmt = stmt.where(Task.due_date <= due_before)
        if search:
            like = f"%{search}%"
            stmt = stmt.where(or_(Task.name.ilike(like), Task.description.ilike(like)))
        if restrict_to_users is not None:
            stmt = stmt.where(
                or_(
                    Task.assigned_to.in_(restrict_to_users),
                    Task.created_by.in_(restrict_to_users),
                )
            )
        return stmt

    def list_tasks(
        self,
        company_id: uuid.UUID,
        *,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        priority: str | None = None,
        assigned_to: uuid.UUID | None = None,
        due_before: date | None = None,
        search: str | None = None,
        restrict_to_users: set[uuid.UUID] | None = None,
        sort: str = "-created_at",
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[Sequence[Task], int]:
        filters = dict(
            project_id=project_id,
            status=status,
            priority=priority,
            assigned_to=assigned_to,
            due_before=due_before,
            search=search,
            restrict_to_users=restrict_to_users,
        )
        stmt = self._filtered(company_id, **filters)
        descending = sort.startswith("-")
        key = sort[1:] if descending else sort
        column = SORT_FIELDS.get(key, Task.created_at)
        stmt = stmt.order_by(column.desc() if descending else column.asc())
        total = (
            self.db.scalar(
                select(func.count()).select_from(self._filtered(company_id, **filters).subquery())
            )
            or 0
        )
        items = self.db.scalars(stmt.offset(offset).limit(limit)).all()
        return items, total

    def overdue_candidates(self, company_id: uuid.UUID, today: date) -> Sequence[Task]:
        return self.db.scalars(
            select(Task).where(
                Task.company_id == company_id,
                Task.status.in_(["pending", "in_progress"]),
                Task.due_date.is_not(None),
                Task.due_date < today,
            )
        ).all()
