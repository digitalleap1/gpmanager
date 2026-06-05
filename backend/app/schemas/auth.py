"""Auth DTOs (request/response contracts) for Module 1."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import User


# --- Requests ---
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    phone: str | None = Field(default=None, max_length=32)


# --- Responses ---
class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: str | None
    status: str
    is_superuser: bool
    roles: list[str]
    permissions: list[str]
    created_at: datetime

    @classmethod
    def from_user(cls, user: User) -> UserRead:
        return cls(
            id=user.id,
            company_id=user.company_id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            status=user.status,
            is_superuser=user.is_superuser,
            roles=sorted(user.role_slugs),
            permissions=sorted(user.permission_codes),
            created_at=user.created_at,
        )


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginResponse(Token):
    user: UserRead


class ForgotPasswordResponse(BaseModel):
    detail: str
    # Present only in non-production so you can complete the reset flow in dev.
    debug_token: str | None = None
