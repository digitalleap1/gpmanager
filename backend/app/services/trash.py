"""Trash service: list soft-deleted records, restore them, or permanently purge.

Delete on the entity services is a soft-delete (sets ``deleted_at``). Here, a
manager can see + restore items (admins see everything; others see only what
they deleted), and an **admin** can permanently purge a record after confirming
their password (the irreversible step is gated).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_admin, is_manager
from app.core.security import verify_password
from app.models.client import Client
from app.models.guest_post import GuestPost
from app.models.payment import Payment
from app.models.project import Project
from app.models.user import User
from app.models.website import Website
from app.schemas.trash import TrashItem
from app.services.activity import ActivityLogger

# entity_type -> (model, label function)
ENTITIES: dict[str, tuple[type, Callable[[object], str]]] = {
    "project": (Project, lambda x: x.name),
    "client": (Client, lambda x: x.name),
    "website": (Website, lambda x: x.domain),
    "payment": (Payment, lambda x: f"{x.currency} {x.amount or ''} ({x.status})".strip()),
    "guest_post": (GuestPost, lambda x: x.website_name or x.live_link or "guest post"),
}


class TrashService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.activity = ActivityLogger(db)

    def _require_manager(self) -> None:
        if not is_manager(self.user):
            raise PermissionDenied()

    def _model(self, entity_type: str) -> type:
        entry = ENTITIES.get(entity_type)
        if entry is None:
            raise BadRequest(f"Unknown trash type '{entity_type}'")
        return entry[0]

    def _names(self) -> dict[uuid.UUID, str]:
        return {
            u.id: u.full_name
            for u in self.db.scalars(
                select(User).where(User.company_id == self.company_id)
            ).all()
        }

    def list(self) -> list[TrashItem]:
        self._require_manager()
        names = self._names()
        items: list[TrashItem] = []
        for etype, (model, label_fn) in ENTITIES.items():
            stmt = select(model).where(
                model.company_id == self.company_id, model.deleted_at.is_not(None)
            )
            if not is_admin(self.user):
                stmt = stmt.where(model.deleted_by == self.user.id)
            for row in self.db.scalars(stmt).all():
                items.append(
                    TrashItem(
                        entity_type=etype,
                        id=row.id,
                        label=label_fn(row) or "(untitled)",
                        deleted_at=row.deleted_at,
                        deleted_by=names.get(row.deleted_by) if row.deleted_by else None,
                    )
                )
        items.sort(key=lambda i: i.deleted_at, reverse=True)
        return items

    def _get_deleted(self, entity_type: str, entity_id: uuid.UUID):
        model = self._model(entity_type)
        row = self.db.get(model, entity_id)
        if row is None or row.company_id != self.company_id or row.deleted_at is None:
            raise NotFound("Trash item not found")
        if not is_admin(self.user) and row.deleted_by != self.user.id:
            raise PermissionDenied("You can only manage items you deleted")
        return row

    def restore(self, entity_type: str, entity_id: uuid.UUID) -> None:
        self._require_manager()
        row = self._get_deleted(entity_type, entity_id)
        # Restore a project's co-trashed children (deleted in the same cascade).
        if entity_type == "project":
            ts = row.deleted_at
            for child in (Payment, GuestPost):
                self.db.execute(
                    update(child)
                    .where(child.project_id == entity_id, child.deleted_at == ts)
                    .values(deleted_at=None, deleted_by=None)
                )
        row.deleted_at = None
        row.deleted_by = None
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action=f"{entity_type}.restored",
            module=entity_type,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        self.db.commit()

    def purge(self, entity_type: str, entity_id: uuid.UUID, password: str) -> None:
        if not is_admin(self.user):
            raise PermissionDenied("Only administrators can permanently delete")
        if not self.user.hashed_password or not verify_password(
            password, self.user.hashed_password
        ):
            raise BadRequest("Password confirmation is incorrect")
        row = self._get_deleted(entity_type, entity_id)
        # Permanently remove a project's trashed children too (payments are
        # FK SET NULL so they would otherwise survive, orphaned).
        if entity_type == "project":
            for child in (Payment, GuestPost):
                self.db.execute(
                    delete(child).where(
                        child.project_id == entity_id, child.deleted_at.is_not(None)
                    )
                )
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action=f"{entity_type}.purged",
            module=entity_type,
            entity_type=entity_type,
            entity_id=entity_id,
            old={"purged_at": datetime.now(timezone.utc).isoformat()},
        )
        self.db.delete(row)
        self.db.commit()
