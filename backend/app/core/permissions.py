"""Lightweight role checks used by services (coarse-grained gate).

Fine-grained permission codes live on roles; these helpers cover the common
admin / team-lead / member distinctions used across modules.
"""

from app.models.user import User

MANAGER_ROLES = {"admin", "team_lead"}


def is_manager(user: User) -> bool:
    return user.is_superuser or bool(user.role_slugs & MANAGER_ROLES)


def is_admin(user: User) -> bool:
    return user.is_superuser or "admin" in user.role_slugs
