"""Task Management logic (Module 8), including the overdue sweep (the time-based
automation: tasks past due and not completed get marked `overdue`).
"""

from __future__ import annotations  # lazy annotations: the `list` method must not shadow list[...]

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import NotFound, PermissionDenied
from app.core.permissions import is_manager
from app.core.scope import accessible_user_ids
from app.models.task import Task, TaskComment
from app.models.user import User
from app.repositories.project import ProjectRepository
from app.repositories.task import TaskRepository
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.activity import ActivityLogger, jsonable
from app.services.assignment import ensure_assignable
from app.services.notification import Notifier


class TaskService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.tasks = TaskRepository(db)
        self.projects = ProjectRepository(db)
        self.activity = ActivityLogger(db)

    def _scope(self) -> set[uuid.UUID] | None:
        return accessible_user_ids(self.db, self.user)

    def _can_edit(self, t: Task) -> bool:
        return (
            is_manager(self.user)
            or t.assigned_to == self.user.id
            or t.created_by == self.user.id
        )

    def list(self, **filters) -> tuple[list[Task], int]:
        items, total = self.tasks.list_tasks(
            self.company_id, restrict_to_users=self._scope(), **filters
        )
        return list(items), total

    def get(self, task_id: uuid.UUID) -> Task:
        t = self.tasks.get_for_company(task_id, self.company_id)
        if t is None:
            raise NotFound("Task not found")
        users = self._scope()
        if users is not None and t.assigned_to not in users and t.created_by not in users:
            raise NotFound("Task not found")
        return t

    def create(self, data: TaskCreate) -> Task:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can create tasks")
        if data.project_id is not None:
            if self.projects.get_for_company(data.project_id, self.company_id) is None:
                raise NotFound("Project not found")
        ensure_assignable(self.db, self.user, data.assigned_to)
        t = Task(company_id=self.company_id, created_by=self.user.id, **data.model_dump())
        self.tasks.add(t)
        action = "task.assigned" if t.assigned_to else "task.created"
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action=action,
            module="task",
            entity_type="task",
            entity_id=t.id,
            new={"name": t.name, "assigned_to": str(t.assigned_to) if t.assigned_to else None},
        )
        notifier = Notifier(self.db)
        if t.assigned_to:
            notifier.notify(
                company_id=self.company_id,
                user_id=t.assigned_to,
                type="task_assigned",
                title="Task assigned",
                body=f"You were assigned the task '{t.name}'.",
                entity_type="task",
                entity_id=t.id,
            )
        notifier.notify_admins(
            company_id=self.company_id,
            type="task_created",
            title="Task created",
            body=f"{self.user.full_name} created the task '{t.name}'.",
            entity_type="task",
            entity_id=t.id,
            exclude=self.user.id,
        )
        self.db.commit()
        self.db.refresh(t)
        return t

    def update(self, task_id: uuid.UUID, data: TaskUpdate) -> Task:
        t = self.get(task_id)
        if not self._can_edit(t):
            raise PermissionDenied()
        changes = data.model_dump(exclude_unset=True)
        if "assigned_to" in changes:
            ensure_assignable(self.db, self.user, changes["assigned_to"])
        old = {key: getattr(t, key) for key in changes}
        for key, value in changes.items():
            setattr(t, key, value)
        # keep completed_at in sync with the status
        if "status" in changes:
            if changes["status"] == "completed" and t.completed_at is None:
                t.completed_at = datetime.now(timezone.utc)
            elif changes["status"] != "completed":
                t.completed_at = None
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="task.updated",
            module="task",
            entity_type="task",
            entity_id=t.id,
            old=jsonable(old),
            new=jsonable(changes),
        )
        self.db.commit()
        self.db.refresh(t)
        return t

    def complete(self, task_id: uuid.UUID) -> Task:
        t = self.get(task_id)
        if not self._can_edit(t):
            raise PermissionDenied()
        if t.status != "completed":
            t.status = "completed"
            t.completed_at = datetime.now(timezone.utc)
            self.activity.record(
                company_id=self.company_id,
                user_id=self.user.id,
                action="task.completed",
                module="task",
                entity_type="task",
                entity_id=t.id,
                new={"name": t.name},
            )
            Notifier(self.db).notify_admins(
                company_id=self.company_id,
                type="task_completed",
                title="Task completed",
                body=f"{self.user.full_name} completed the task '{t.name}'.",
                entity_type="task",
                entity_id=t.id,
                exclude=self.user.id,
            )
            self.db.commit()
            self.db.refresh(t)
        return t

    def add_comment(self, task_id: uuid.UUID, body: str) -> TaskComment:
        self.get(task_id)  # visibility check
        comment = TaskComment(task_id=task_id, author_id=self.user.id, body=body)
        self.db.add(comment)
        self.db.commit()
        self.db.refresh(comment)
        return comment

    def delete(self, task_id: uuid.UUID) -> None:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can delete tasks")
        t = self.get(task_id)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="task.deleted",
            module="task",
            entity_type="task",
            entity_id=t.id,
            old={"name": t.name},
        )
        self.tasks.delete(t)
        self.db.commit()

    def overdue_sweep(self) -> int:
        """Time-based automation: mark past-due, not-completed tasks as overdue.
        Intended to be triggered by a daily scheduled job."""
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can run the overdue sweep")
        today = datetime.now(timezone.utc).date()
        candidates = self.tasks.overdue_candidates(self.company_id, today)
        notifier = Notifier(self.db)
        for t in candidates:
            t.status = "overdue"
            notifier.notify(
                company_id=self.company_id,
                user_id=t.assigned_to,
                type="task_overdue",
                title="Task overdue",
                body=f"The task '{t.name}' is past its due date.",
                entity_type="task",
                entity_id=t.id,
            )
            notifier.notify_admins(
                company_id=self.company_id,
                type="task_overdue",
                title="Task overdue",
                body=f"'{t.name}' is past its due date and not completed.",
                entity_type="task",
                entity_id=t.id,
            )
        if candidates:
            self.activity.record(
                company_id=self.company_id,
                user_id=self.user.id,
                action="task.overdue_sweep",
                module="task",
                entity_type=None,
                entity_id=None,
                new={"count": len(candidates)},
            )
        self.db.commit()
        return len(candidates)
