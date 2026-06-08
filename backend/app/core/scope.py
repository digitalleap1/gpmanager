"""Row-level access scope (RBAC data visibility).

Defines, per user, *whose* work and *which* projects they may see:
  - Admin / superuser  -> unrestricted (returns None == "no filter").
  - Team Lead          -> themselves + the members of every team they lead.
  - Regular user       -> only themselves.

Services use ``accessible_user_ids`` / ``accessible_project_ids`` to filter list
queries AND to gate single-record access, so the same scope is enforced whether
data is reached via a list, a search, an export, or a direct id/URL.
"""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectMember
from app.models.user import User
from app.repositories.team import TeamRepository


def is_admin_scope(user: User) -> bool:
    return user.is_superuser or "admin" in user.role_slugs


def accessible_user_ids(db: Session, user: User) -> set[uuid.UUID] | None:
    """User ids whose work ``user`` may see. ``None`` == unrestricted (admin)."""
    if is_admin_scope(user):
        return None
    ids = {user.id}
    if "team_lead" in user.role_slugs:
        ids |= TeamRepository(db).member_ids_led_by(user.id)
    return ids


def accessible_project_ids(db: Session, user: User) -> set[uuid.UUID] | None:
    """Project ids ``user`` may see. ``None`` == unrestricted (admin).

    A project is visible when its assignee, team lead, creator, or any member is
    in the user's accessible-users set.
    """
    users = accessible_user_ids(db, user)
    if users is None:
        return None
    member_sq = select(ProjectMember.project_id).where(ProjectMember.user_id.in_(users))
    stmt = select(Project.id).where(
        Project.company_id == user.company_id,
        Project.deleted_at.is_(None),
        or_(
            Project.assignee_id.in_(users),
            Project.team_lead_id.in_(users),
            Project.created_by.in_(users),
            Project.id.in_(member_sq),
        ),
    )
    return set(db.scalars(stmt).all())
