"""User summary DTO (for assignee / team-lead pickers and admin lists)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr

from app.models.user import User


class UserSummary(BaseModel):
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
