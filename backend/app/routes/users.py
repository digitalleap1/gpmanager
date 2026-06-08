"""User management routes.

Reads (list / get / roles) are open to managers — the assignee & team-lead pickers
across the app rely on ``GET /users``. All mutations are admin-only and run through
``UserAdminService``, which records an activity-log entry for each change.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.common import Message
from app.schemas.user import (
    AdminPasswordReset,
    RoleRead,
    UserAdminRead,
    UserCreate,
    UserUpdate,
)
from app.services.user import UserAdminService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[UserAdminRead])
def list_users(
    user: CurrentUser, db: DbSession, search: str | None = None
) -> list[UserAdminRead]:
    users = UserAdminService(db, user).list(search)
    return [UserAdminRead.from_user(u) for u in users]


@router.get("/roles", response_model=list[RoleRead])
def list_roles(user: CurrentUser, db: DbSession) -> list[RoleRead]:
    roles = UserAdminService(db, user).system_roles()
    return [RoleRead.from_role(r) for r in roles]


@router.post("", response_model=UserAdminRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, user: CurrentUser, db: DbSession) -> UserAdminRead:
    created = UserAdminService(db, user).create(payload)
    return UserAdminRead.from_user(created)


@router.get("/{user_id}", response_model=UserAdminRead)
def get_user(user_id: uuid.UUID, user: CurrentUser, db: DbSession) -> UserAdminRead:
    found = UserAdminService(db, user).get(user_id)
    return UserAdminRead.from_user(found)


@router.patch("/{user_id}", response_model=UserAdminRead)
def update_user(
    user_id: uuid.UUID, payload: UserUpdate, user: CurrentUser, db: DbSession
) -> UserAdminRead:
    updated = UserAdminService(db, user).update(user_id, payload)
    return UserAdminRead.from_user(updated)


@router.post("/{user_id}/reset-password", response_model=Message)
def reset_user_password(
    user_id: uuid.UUID, payload: AdminPasswordReset, user: CurrentUser, db: DbSession
) -> Message:
    UserAdminService(db, user).reset_password(user_id, payload.new_password)
    return Message(detail="Password has been reset")


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    UserAdminService(db, user).delete(user_id)
