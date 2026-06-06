"""Task DTOs (Module 8)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models.task import Task, TaskComment
from app.schemas.refs import UserRef

TASK_STATUSES = {"pending", "in_progress", "completed", "overdue"}
TASK_PRIORITIES = {"low", "medium", "high"}


def _check_status(value: str) -> str:
    if value not in TASK_STATUSES:
        raise ValueError(f"status must be one of {sorted(TASK_STATUSES)}")
    return value


def _check_priority(value: str) -> str:
    if value not in TASK_PRIORITIES:
        raise ValueError(f"priority must be one of {sorted(TASK_PRIORITIES)}")
    return value


class TaskCreate(BaseModel):
    project_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    assigned_to: uuid.UUID | None = None
    priority: str = "medium"
    due_date: date | None = None
    status: str = "pending"

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        return _check_status(v)

    @field_validator("priority")
    @classmethod
    def _priority(cls, v: str) -> str:
        return _check_priority(v)


class TaskUpdate(BaseModel):
    project_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    assigned_to: uuid.UUID | None = None
    priority: str | None = None
    due_date: date | None = None
    status: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        return _check_status(v) if v is not None else None

    @field_validator("priority")
    @classmethod
    def _priority(cls, v: str | None) -> str | None:
        return _check_priority(v) if v is not None else None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1)


class CommentRead(BaseModel):
    id: uuid.UUID
    author: UserRef | None
    body: str
    created_at: datetime

    @classmethod
    def from_comment(cls, c: TaskComment) -> CommentRead:
        return cls(
            id=c.id,
            author=UserRef(id=c.author.id, full_name=c.author.full_name) if c.author else None,
            body=c.body,
            created_at=c.created_at,
        )


class TaskListItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID | None
    project_name: str | None
    name: str
    description: str | None
    assigned_to: UserRef | None
    priority: str
    status: str
    due_date: date | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_task(cls, t: Task) -> TaskListItem:
        return cls(
            id=t.id,
            project_id=t.project_id,
            project_name=t.project.name if t.project else None,
            name=t.name,
            description=t.description,
            assigned_to=(
                UserRef(id=t.assigned_user.id, full_name=t.assigned_user.full_name)
                if t.assigned_user
                else None
            ),
            priority=t.priority,
            status=t.status,
            due_date=t.due_date,
            completed_at=t.completed_at,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )


class TaskDetail(TaskListItem):
    comments: list[CommentRead]

    @classmethod
    def from_task_detail(cls, t: Task) -> TaskDetail:
        base = TaskListItem.from_task(t).model_dump()
        return cls(**base, comments=[CommentRead.from_comment(c) for c in t.comments])
