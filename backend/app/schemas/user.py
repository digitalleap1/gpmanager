"""User DTOs — pickers (UserSummary) and admin user management."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import Role, User

ROLE_SLUGS = {"admin", "team_lead", "user"}
USER_STATUSES = {"active", "suspended", "deactivated"}


class UserSummary(BaseModel):
    """Lightweight shape for assignee / team-lead pickers."""

    id: uuid.UUID
    full_name: str
    email: EmailStr
    roles: list[str]

    @classmethod
    def from_user(cls, user: User) -> UserSummary:
        return cls(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            roles=sorted(user.role_slugs),
        )


class RoleRead(BaseModel):
    id: uuid.UUID
    slug: str
    name: str

    @classmethod
    def from_role(cls, role: Role) -> RoleRead:
        return cls(id=role.id, slug=role.slug, name=role.name)


class UserAdminRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: str | None
    status: str
    is_superuser: bool
    roles: list[str]
    created_at: datetime
    last_login_at: datetime | None

    @classmethod
    def from_user(cls, user: User) -> UserAdminRead:
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            status=user.status,
            is_superuser=user.is_superuser,
            roles=sorted(user.role_slugs),
            created_at=user.created_at,
            last_login_at=user.last_login_at,
        )


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=8, max_length=128)
    role_slug: str = "user"
    phone: str | None = Field(default=None, max_length=32)

    @field_validator("role_slug")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ROLE_SLUGS:
            raise ValueError(f"role_slug must be one of {sorted(ROLE_SLUGS)}")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    phone: str | None = Field(default=None, max_length=32)
    status: str | None = None
    role_slug: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in USER_STATUSES:
            raise ValueError(f"status must be one of {sorted(USER_STATUSES)}")
        return v

    @field_validator("role_slug")
    @classmethod
    def _role(cls, v: str | None) -> str | None:
        if v is not None and v not in ROLE_SLUGS:
            raise ValueError(f"role_slug must be one of {sorted(ROLE_SLUGS)}")
        return v


class AdminPasswordReset(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)
