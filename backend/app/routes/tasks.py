"""Task routes (Module 8): /api/tasks/*."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.common import Page
from app.schemas.task import (
    CommentCreate,
    CommentRead,
    TaskCreate,
    TaskDetail,
    TaskListItem,
    TaskUpdate,
)
from app.services.task import TaskService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[TaskListItem])
def list_tasks(
    user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    project_id: uuid.UUID | None = None,
    status_: str | None = Query(None, alias="status"),
    priority: str | None = None,
    assigned_to: uuid.UUID | None = None,
    due_before: date | None = None,
    search: str | None = None,
    sort: str = "-created_at",
) -> Page[TaskListItem]:
    items, total = TaskService(db, user).list(
        project_id=project_id,
        status=status_,
        priority=priority,
        assigned_to=assigned_to,
        due_before=due_before,
        search=search,
        sort=sort,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return Page[TaskListItem](
        items=[TaskListItem.from_task(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=TaskListItem, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, user: CurrentUser, db: DbSession) -> TaskListItem:
    return TaskListItem.from_task(TaskService(db, user).create(body))


@router.post("/overdue-sweep")
def overdue_sweep(user: CurrentUser, db: DbSession) -> dict[str, int]:
    return {"updated": TaskService(db, user).overdue_sweep()}


@router.get("/{task_id}", response_model=TaskDetail)
def get_task(task_id: uuid.UUID, user: CurrentUser, db: DbSession) -> TaskDetail:
    return TaskDetail.from_task_detail(TaskService(db, user).get(task_id))


@router.patch("/{task_id}", response_model=TaskListItem)
def update_task(
    task_id: uuid.UUID, body: TaskUpdate, user: CurrentUser, db: DbSession
) -> TaskListItem:
    return TaskListItem.from_task(TaskService(db, user).update(task_id, body))


@router.post("/{task_id}/complete", response_model=TaskListItem)
def complete_task(task_id: uuid.UUID, user: CurrentUser, db: DbSession) -> TaskListItem:
    return TaskListItem.from_task(TaskService(db, user).complete(task_id))


@router.post(
    "/{task_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED
)
def add_comment(
    task_id: uuid.UUID, body: CommentCreate, user: CurrentUser, db: DbSession
) -> CommentRead:
    return CommentRead.from_comment(TaskService(db, user).add_comment(task_id, body.body))


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    TaskService(db, user).delete(task_id)
