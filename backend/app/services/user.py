"""User administration (admin-only): create users, change roles, reset passwords,
activate / suspend / deactivate, delete. Managers may read; only admins may mutate.
"""

from __future__ import annotations  # lazy annotations: the `list` method must not shadow list[...]

import uuid
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_admin, is_manager
from app.core.security import hash_password
from app.models.user import Role, User
from app.repositories.role import RoleRepository
from app.repositories.user import UserRepository
from app.schemas.user import UserCreate, UserUpdate
from app.services.activity import ActivityLogger, jsonable

SYSTEM_ROLE_ORDER = ("admin", "team_lead", "user")


def _is_admin_slug(slug: str) -> bool:
    return slug == "admin"


class UserAdminService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.actor = user
        self.company_id = user.company_id
        self.users = UserRepository(db)
        self.roles = RoleRepository(db)
        self.activity = ActivityLogger(db)

    # --- guards ---
    def _require_admin(self) -> None:
        if not is_admin(self.actor):
            raise PermissionDenied("Only administrators can manage users")

    def _require_manager(self) -> None:
        if not is_manager(self.actor):
            raise PermissionDenied()

    # --- reads ---
    def list(self, search: str | None = None) -> list[User]:
        self._require_manager()
        stmt = select(User).where(User.company_id == self.company_id)
        if search:
            like = f"%{search.strip()}%"
            stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like)))
        return list(self.db.scalars(stmt.order_by(User.full_name)).all())

    def get(self, user_id: uuid.UUID) -> User:
        self._require_manager()
        user = self.users.get(user_id)
        if user is None or user.company_id != self.company_id:
            raise NotFound("User not found")
        return user

    def assignable_roles(self) -> list[Role]:
        """System roles (admin/team_lead/user) plus this company's custom roles."""
        self._require_manager()
        roles = self.db.scalars(
            select(Role).where(
                (Role.company_id.is_(None)) | (Role.company_id == self.company_id)
            )
        ).all()
        order = {slug: i for i, slug in enumerate(SYSTEM_ROLE_ORDER)}

        def sort_key(role: Role) -> tuple[int, int, str]:
            # System roles first (in canonical order), then custom roles by name.
            if role.company_id is None:
                return (0, order.get(role.slug, 99), role.name)
            return (1, 0, role.name)

        return sorted(roles, key=sort_key)

    # --- helpers ---
    def _assignable_role(self, slug: str) -> Role:
        """Resolve a role by slug among system + this company's custom roles."""
        role = self.db.scalars(
            select(Role)
            .where(
                Role.slug == slug,
                (Role.company_id.is_(None)) | (Role.company_id == self.company_id),
            )
            # Prefer a company role over a same-slug system role.
            .order_by(Role.company_id.isnot(None).desc())
        ).first()
        if role is None:
            raise BadRequest(f"Unknown role '{slug}'")
        return role

    def _revoke_sessions(self, user: User) -> None:
        now = datetime.now(timezone.utc)
        for token in user.refresh_tokens:
            if token.revoked_at is None:
                token.revoked_at = now

    # --- mutations (admin only) ---
    def create(self, data: UserCreate) -> User:
        self._require_admin()
        email = data.email.lower()
        if self.users.get_by_email(email) is not None:
            raise BadRequest(f"A user with email '{email}' already exists")
        role = self._assignable_role(data.role_slug)
        user = User(
            company_id=self.company_id,
            email=email,
            full_name=data.full_name.strip(),
            phone=data.phone,
            hashed_password=hash_password(data.password),
            status="active",
            is_superuser=_is_admin_slug(data.role_slug),
        )
        user.roles = [role]
        self.db.add(user)
        self.db.flush()
        self.activity.record(
            company_id=self.company_id,
            user_id=self.actor.id,
            action="user.created",
            module="user",
            entity_type="user",
            entity_id=user.id,
            new={"email": email, "role": data.role_slug},
        )
        self.db.commit()
        self.db.refresh(user)
        return user

    def update(self, user_id: uuid.UUID, data: UserUpdate) -> User:
        self._require_admin()
        user = self.get(user_id)
        changes = data.model_dump(exclude_unset=True)
        role_slug = changes.pop("role_slug", None)

        if user.id == self.actor.id:
            if changes.get("status") and changes["status"] != "active":
                raise BadRequest("You cannot change the status of your own account")
            if role_slug is not None and role_slug != "admin":
                raise BadRequest("You cannot remove your own administrator role")

        old = {key: getattr(user, key) for key in changes}
        if "full_name" in changes and changes["full_name"] is not None:
            user.full_name = changes["full_name"].strip()
        if "phone" in changes:
            user.phone = changes["phone"]
        if "status" in changes and changes["status"] is not None:
            user.status = changes["status"]
            if user.status != "active":
                self._revoke_sessions(user)

        if role_slug is not None:
            role = self._assignable_role(role_slug)
            old["role"] = sorted(user.role_slugs)
            user.roles = [role]
            user.is_superuser = _is_admin_slug(role_slug)
            changes["role"] = role_slug

        self.activity.record(
            company_id=self.company_id,
            user_id=self.actor.id,
            action="user.updated",
            module="user",
            entity_type="user",
            entity_id=user.id,
            old=jsonable(old),
            new=jsonable(changes),
        )
        self.db.commit()
        self.db.refresh(user)
        return user

    def reset_password(self, user_id: uuid.UUID, new_password: str) -> None:
        self._require_admin()
        user = self.get(user_id)
        user.hashed_password = hash_password(new_password)
        self._revoke_sessions(user)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.actor.id,
            action="user.password_reset",
            module="user",
            entity_type="user",
            entity_id=user.id,
            new={"email": user.email},
        )
        self.db.commit()

    def delete(self, user_id: uuid.UUID) -> None:
        self._require_admin()
        user = self.get(user_id)
        if user.id == self.actor.id:
            raise BadRequest("You cannot delete your own account")
        self.activity.record(
            company_id=self.company_id,
            user_id=self.actor.id,
            action="user.deleted",
            module="user",
            entity_type="user",
            entity_id=user.id,
            old={"email": user.email},
        )
        self.users.delete(user)
        self.db.commit()
