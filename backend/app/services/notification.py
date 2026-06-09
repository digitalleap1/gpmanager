"""Notification logic (Module 9).

`Notifier` is the emitter other services call inside their own transaction (no
commit) to create in-app notifications. `NotificationService` powers the
user-facing read/mark endpoints.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.exceptions import NotFound
from app.models.notification import Notification
from app.models.user import User


class Notifier:
    """Creates in-app notifications within the caller's transaction (no commit)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def notify(
        self,
        *,
        company_id: uuid.UUID,
        user_id: uuid.UUID | None,
        type: str,
        title: str,
        body: str | None = None,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
    ) -> None:
        if user_id is None:
            return
        self.db.add(
            Notification(
                company_id=company_id,
                user_id=user_id,
                type=type,
                title=title,
                body=body,
                entity_type=entity_type,
                entity_id=entity_id,
            )
        )

    def notify_many(
        self,
        user_ids: set[uuid.UUID] | list[uuid.UUID],
        *,
        company_id: uuid.UUID,
        type: str,
        title: str,
        body: str | None = None,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
    ) -> None:
        for uid in set(user_ids):
            self.notify(
                company_id=company_id, user_id=uid, type=type, title=title,
                body=body, entity_type=entity_type, entity_id=entity_id,
            )

    def notify_admins(
        self,
        *,
        company_id: uuid.UUID,
        type: str,
        title: str,
        body: str | None = None,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        exclude: uuid.UUID | None = None,
    ) -> None:
        """Notify every active admin (oversight of everyone's actions).

        ``exclude`` skips the actor so an admin isn't notified of their own action.
        """
        admins = self.db.scalars(
            select(User).where(User.company_id == company_id, User.status == "active")
        ).all()
        admin_ids = {
            u.id
            for u in admins
            if (u.is_superuser or "admin" in u.role_slugs) and u.id != exclude
        }
        self.notify_many(
            admin_ids, company_id=company_id, type=type, title=title, body=body,
            entity_type=entity_type, entity_id=entity_id,
        )


class NotificationService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user

    def list(
        self, *, unread: bool = False, offset: int = 0, limit: int = 20
    ) -> tuple[Sequence[Notification], int]:
        base = select(Notification).where(Notification.user_id == self.user.id)
        if unread:
            base = base.where(Notification.is_read.is_(False))
        total = self.db.scalar(select(func.count()).select_from(base.subquery())) or 0
        items = self.db.scalars(
            base.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
        ).all()
        return items, total

    def unread_count(self) -> int:
        return (
            self.db.scalar(
                select(func.count())
                .select_from(Notification)
                .where(Notification.user_id == self.user.id, Notification.is_read.is_(False))
            )
            or 0
        )

    def mark_read(self, notification_id: uuid.UUID) -> Notification:
        n = self.db.get(Notification, notification_id)
        if n is None or n.user_id != self.user.id:
            raise NotFound("Notification not found")
        if not n.is_read:
            n.is_read = True
            n.read_at = datetime.now(UTC)
            self.db.commit()
            self.db.refresh(n)
        return n

    def mark_all_read(self) -> int:
        result = self.db.execute(
            update(Notification)
            .where(Notification.user_id == self.user.id, Notification.is_read.is_(False))
            .values(is_read=True, read_at=datetime.now(UTC))
        )
        self.db.commit()
        return int(result.rowcount or 0)
