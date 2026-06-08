"""Assignment authorization (Phase 1 RBAC).

Admins may assign work to anyone in the company. A non-admin manager (a Team
Lead) may only assign to members of a team they lead, or to themselves. Regular
users can't create/assign work at all (gated earlier).
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import PermissionDenied
from app.core.permissions import is_admin
from app.models.user import User
from app.repositories.team import TeamRepository


def assignable_user_ids(db: Session, actor: User) -> set[uuid.UUID] | None:
    """User ids the actor may assign work to. ``None`` == unrestricted (admin)."""
    if is_admin(actor):
        return None
    ids = TeamRepository(db).member_ids_led_by(actor.id)
    ids.add(actor.id)
    return ids


def ensure_assignable(db: Session, actor: User, target_id: uuid.UUID | None) -> None:
    """Raise if ``actor`` may not assign work to ``target_id`` (no-op if None)."""
    if target_id is None:
        return
    allowed = assignable_user_ids(db, actor)
    if allowed is not None and target_id not in allowed:
        raise PermissionDenied(
            "You can only assign work to members of a team you lead"
        )
