"""Auto-tasks: turn an assignment (a person put on a guest-post link or a
payment) into a real Task that shows on /tasks for that person.

A single helper, :func:`sync_assignment_task`, upserts one task per source
object keyed by ``(source_type, source_id)`` so editing the source updates the
same task instead of creating duplicates. It does NOT commit — the calling
service owns the transaction.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.user import User
from app.services.activity import ActivityLogger
from app.services.notification import Notifier

# Source kinds an auto-task can originate from.
SOURCE_GUEST_POST = "guest_post"
SOURCE_PAYMENT = "payment"


def sync_assignment_task(
    db: Session,
    actor: User,
    *,
    company_id: uuid.UUID,
    source_type: str,
    source_id: uuid.UUID,
    assigned_to: uuid.UUID | None,
    name: str,
    description: str | None = None,
    project_id: uuid.UUID | None = None,
    due_date: date | None = None,
) -> Task | None:
    """Create/update the task that mirrors an assignment.

    - No existing task + an assignee  -> create a pending task and notify them.
    - Existing task, assignee changed  -> reassign and notify the new person.
    - Existing task                    -> keep name/description/project/due in
      sync (status is left untouched so a completed task stays completed).
    - No assignee and no task          -> nothing to do.

    The caller is responsible for ``db.commit()``.
    """
    existing = db.scalar(
        select(Task).where(
            Task.company_id == company_id,
            Task.source_type == source_type,
            Task.source_id == source_id,
        )
    )

    if existing is None:
        if assigned_to is None:
            return None  # nothing assigned yet — don't manufacture a task
        task = Task(
            company_id=company_id,
            project_id=project_id,
            name=name,
            description=description,
            assigned_to=assigned_to,
            priority="medium",
            status="pending",
            due_date=due_date,
            created_by=actor.id,
            source_type=source_type,
            source_id=source_id,
        )
        db.add(task)
        db.flush()
        _record(db, actor, company_id, task, action="task.assigned")
        _notify_assignee(db, company_id, task, actor)
        return task

    # Keep the mirror in sync with the source.
    reassigned = assigned_to is not None and existing.assigned_to != assigned_to
    existing.name = name
    existing.description = description
    if project_id is not None:
        existing.project_id = project_id
    if due_date is not None:
        existing.due_date = due_date
    if assigned_to is not None:
        existing.assigned_to = assigned_to
    db.flush()
    if reassigned:
        _record(db, actor, company_id, existing, action="task.assigned")
        _notify_assignee(db, company_id, existing, actor)
    return existing


def set_source_task_status(
    db: Session,
    company_id: uuid.UUID,
    *,
    source_type: str,
    source_id: uuid.UUID,
    status: str,
) -> Task | None:
    """Flip the mirrored task's status (e.g. complete it when the payer pays, or
    reopen it to 'pending' when a payment is sent back). No-op if absent.
    Caller commits."""
    from datetime import UTC, datetime

    task = db.scalar(
        select(Task).where(
            Task.company_id == company_id,
            Task.source_type == source_type,
            Task.source_id == source_id,
        )
    )
    if task is None:
        return None
    task.status = status
    task.completed_at = datetime.now(UTC) if status == "completed" else None
    db.flush()
    return task


def _record(
    db: Session, actor: User, company_id: uuid.UUID, task: Task, *, action: str
) -> None:
    ActivityLogger(db).record(
        company_id=company_id,
        user_id=actor.id,
        action=action,
        module="task",
        entity_type="task",
        entity_id=task.id,
        new={
            "name": task.name,
            "assigned_to": str(task.assigned_to) if task.assigned_to else None,
            "source": task.source_type,
        },
    )


def _notify_assignee(
    db: Session, company_id: uuid.UUID, task: Task, actor: User
) -> None:
    if not task.assigned_to or task.assigned_to == actor.id:
        return
    Notifier(db).notify(
        company_id=company_id,
        user_id=task.assigned_to,
        type="task_assigned",
        title="Task assigned",
        body=f"{actor.full_name} assigned you the task '{task.name}'.",
        entity_type="task",
        entity_id=task.id,
    )
