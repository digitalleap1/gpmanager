"""Role & permission management routes (Phase 1 RBAC). Admin-only.

Note: the lightweight role picker used by the Users page lives at
``GET /users/roles``; these endpoints are the full management surface.
"""

import uuid
from itertools import groupby
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.role import (
    PermissionGroup,
    PermissionRead,
    RoleCreate,
    RoleDetail,
    RoleUpdate,
)
from app.services.role import RoleService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/permissions", response_model=list[PermissionGroup])
def list_permissions(user: CurrentUser, db: DbSession) -> list[PermissionGroup]:
    perms = RoleService(db, user).list_permissions()
    groups: list[PermissionGroup] = []
    for module, items in groupby(perms, key=lambda p: p.module):
        groups.append(
            PermissionGroup(
                module=module,
                permissions=[PermissionRead.from_permission(p) for p in items],
            )
        )
    return groups


@router.get("", response_model=list[RoleDetail])
def list_roles(user: CurrentUser, db: DbSession) -> list[RoleDetail]:
    return [RoleDetail.from_role(r, c) for r, c in RoleService(db, user).list_roles()]


@router.post("", response_model=RoleDetail, status_code=status.HTTP_201_CREATED)
def create_role(payload: RoleCreate, user: CurrentUser, db: DbSession) -> RoleDetail:
    role, count = RoleService(db, user).create_role(payload)
    return RoleDetail.from_role(role, count)


@router.get("/{role_id}", response_model=RoleDetail)
def get_role(role_id: uuid.UUID, user: CurrentUser, db: DbSession) -> RoleDetail:
    role, count = RoleService(db, user).get_role(role_id)
    return RoleDetail.from_role(role, count)


@router.patch("/{role_id}", response_model=RoleDetail)
def update_role(
    role_id: uuid.UUID, payload: RoleUpdate, user: CurrentUser, db: DbSession
) -> RoleDetail:
    role, count = RoleService(db, user).update_role(role_id, payload)
    return RoleDetail.from_role(role, count)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    RoleService(db, user).delete_role(role_id)
