"""Role & permission management (Phase 1 RBAC), admin-only.

Admins can edit the permission checklist on the built-in roles, and create
company-scoped custom roles with their own permission sets. The ``admin`` role
is locked (always all-powerful) so an admin can't accidentally lock everyone out.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_admin
from app.models.user import Permission, Role, user_roles
from app.schemas.role import RESERVED_SLUGS, RoleCreate, RoleUpdate
from app.services.activity import ActivityLogger
from app.utils.slug import slugify


class RoleService:
    def __init__(self, db: Session, user) -> None:
        self.db = db
        self.actor = user
        self.company_id = user.company_id
        self.activity = ActivityLogger(db)

    def _require_admin(self) -> None:
        if not is_admin(self.actor):
            raise PermissionDenied("Only administrators can manage roles")

    # --- permissions ---
    def list_permissions(self) -> list[Permission]:
        self._require_admin()
        return list(
            self.db.scalars(
                select(Permission).order_by(Permission.module, Permission.code)
            ).all()
        )

    def _resolve_permissions(self, codes: list[str]) -> list[Permission]:
        unique = list(dict.fromkeys(codes))
        if not unique:
            return []
        perms = self.db.scalars(
            select(Permission).where(Permission.code.in_(unique))
        ).all()
        found = {p.code for p in perms}
        unknown = [c for c in unique if c not in found]
        if unknown:
            raise BadRequest(f"Unknown permission(s): {', '.join(unknown)}")
        return list(perms)

    # --- roles ---
    def _user_counts(self) -> dict[uuid.UUID, int]:
        rows = self.db.execute(
            select(user_roles.c.role_id, func.count()).group_by(user_roles.c.role_id)
        ).all()
        return {row[0]: row[1] for row in rows}

    def list_roles(self) -> list[tuple[Role, int]]:
        self._require_admin()
        # System roles (company_id IS NULL) + this company's custom roles.
        roles = self.db.scalars(
            select(Role)
            .where((Role.company_id.is_(None)) | (Role.company_id == self.company_id))
            .order_by(Role.company_id.isnot(None), Role.name)
        ).all()
        counts = self._user_counts()
        return [(r, counts.get(r.id, 0)) for r in roles]

    def get_role(self, role_id: uuid.UUID) -> tuple[Role, int]:
        self._require_admin()
        role = self.db.get(Role, role_id)
        if role is None or (
            role.company_id is not None and role.company_id != self.company_id
        ):
            raise NotFound("Role not found")
        count = self._user_counts().get(role.id, 0)
        return role, count

    def create_role(self, data: RoleCreate) -> tuple[Role, int]:
        self._require_admin()
        name = data.name.strip()
        slug = slugify(name)
        if slug in RESERVED_SLUGS:
            raise BadRequest(f"'{name}' is a reserved role name")
        existing = self.db.scalars(
            select(Role).where(
                Role.slug == slug,
                (Role.company_id.is_(None)) | (Role.company_id == self.company_id),
            )
        ).first()
        if existing is not None:
            raise BadRequest(f"A role named '{name}' already exists")
        role = Role(
            company_id=self.company_id,
            name=name,
            slug=slug,
            scope="custom",
            description=data.description,
        )
        role.permissions = self._resolve_permissions(data.permission_codes)
        self.db.add(role)
        self.db.flush()
        self.activity.record(
            company_id=self.company_id,
            user_id=self.actor.id,
            action="role.created",
            module="role",
            entity_type="role",
            entity_id=role.id,
            new={"name": name, "permissions": len(role.permissions)},
        )
        self.db.commit()
        self.db.refresh(role)
        return role, 0

    def update_role(self, role_id: uuid.UUID, data: RoleUpdate) -> tuple[Role, int]:
        self._require_admin()
        role, _ = self.get_role(role_id)
        if role.slug == "admin":
            raise BadRequest("The administrator role cannot be modified")
        changes = data.model_dump(exclude_unset=True)
        if "name" in changes and changes["name"] is not None:
            role.name = changes["name"].strip()
        if "description" in changes:
            role.description = changes["description"]
        if "permission_codes" in changes and changes["permission_codes"] is not None:
            role.permissions = self._resolve_permissions(changes["permission_codes"])
        self.activity.record(
            company_id=self.company_id,
            user_id=self.actor.id,
            action="role.updated",
            module="role",
            entity_type="role",
            entity_id=role.id,
            new={"permissions": len(role.permissions)},
        )
        self.db.commit()
        self.db.refresh(role)
        count = self._user_counts().get(role.id, 0)
        return role, count

    def delete_role(self, role_id: uuid.UUID) -> None:
        self._require_admin()
        role, count = self.get_role(role_id)
        if role.company_id is None:
            raise BadRequest("Built-in roles cannot be deleted")
        if count > 0:
            raise BadRequest(
                f"{count} user(s) still have this role. Reassign them first."
            )
        self.activity.record(
            company_id=self.company_id,
            user_id=self.actor.id,
            action="role.deleted",
            module="role",
            entity_type="role",
            entity_id=role.id,
            old={"name": role.name},
        )
        self.db.delete(role)
        self.db.commit()
