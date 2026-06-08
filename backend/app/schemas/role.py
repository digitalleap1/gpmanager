"""Role & permission management DTOs (Phase 1 RBAC)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from app.models.user import Permission, Role

RESERVED_SLUGS = {"admin", "team_lead", "user"}


class PermissionRead(BaseModel):
    code: str
    module: str
    description: str | None

    @classmethod
    def from_permission(cls, p: Permission) -> PermissionRead:
        return cls(code=p.code, module=p.module, description=p.description)


class PermissionGroup(BaseModel):
    module: str
    permissions: list[PermissionRead]


class RoleDetail(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: str | None
    scope: str
    is_system: bool
    editable: bool
    permission_codes: list[str]
    user_count: int

    @classmethod
    def from_role(cls, role: Role, user_count: int) -> RoleDetail:
        is_system = role.company_id is None
        return cls(
            id=role.id,
            slug=role.slug,
            name=role.name,
            description=role.description,
            scope=role.scope,
            is_system=is_system,
            # The all-powerful admin role is locked to avoid lockout.
            editable=role.slug != "admin",
            permission_codes=sorted(p.code for p in role.permissions),
            user_count=user_count,
        )


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=255)
    permission_codes: list[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=255)
    permission_codes: list[str] | None = None
