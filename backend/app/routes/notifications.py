"""Notification routes (Module 9): /api/notifications/*."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.common import Page
from app.schemas.notification import MarkAllResult, NotificationRead, UnreadCount
from app.services.notification import NotificationService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[NotificationRead])
def list_notifications(
    user: CurrentUser,
    db: DbSession,
    unread: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[NotificationRead]:
    items, total = NotificationService(db, user).list(
        unread=unread, offset=(page - 1) * page_size, limit=page_size
    )
    return Page[NotificationRead](
        items=[NotificationRead.model_validate(n) for n in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(user: CurrentUser, db: DbSession) -> UnreadCount:
    return UnreadCount(count=NotificationService(db, user).unread_count())


@router.post("/read-all", response_model=MarkAllResult)
def read_all(user: CurrentUser, db: DbSession) -> MarkAllResult:
    return MarkAllResult(updated=NotificationService(db, user).mark_all_read())


@router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_read(notification_id: uuid.UUID, user: CurrentUser, db: DbSession) -> NotificationRead:
    return NotificationRead.model_validate(
        NotificationService(db, user).mark_read(notification_id)
    )
