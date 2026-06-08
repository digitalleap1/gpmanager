"""Team management routes (Phase 1 RBAC).

Reads are open to managers (admin / team lead); all mutations are admin-only,
enforced in ``TeamService``. ``/hierarchy`` precedes ``/{team_id}`` so the static
path wins.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.team import (
    MembersRequest,
    MoveMemberRequest,
    OrgHierarchy,
    TeamCreate,
    TeamListItem,
    TeamRead,
    TeamUpdate,
)
from app.services.team import TeamService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[TeamListItem])
def list_teams(user: CurrentUser, db: DbSession) -> list[TeamListItem]:
    return [TeamListItem.from_team(t) for t in TeamService(db, user).list()]


@router.get("/hierarchy", response_model=OrgHierarchy)
def org_hierarchy(user: CurrentUser, db: DbSession) -> OrgHierarchy:
    return TeamService(db, user).hierarchy()


@router.post("", response_model=TeamRead, status_code=status.HTTP_201_CREATED)
def create_team(payload: TeamCreate, user: CurrentUser, db: DbSession) -> TeamRead:
    return TeamRead.from_team(TeamService(db, user).create(payload))


@router.get("/{team_id}", response_model=TeamRead)
def get_team(team_id: uuid.UUID, user: CurrentUser, db: DbSession) -> TeamRead:
    return TeamRead.from_team(TeamService(db, user).get(team_id))


@router.patch("/{team_id}", response_model=TeamRead)
def update_team(
    team_id: uuid.UUID, payload: TeamUpdate, user: CurrentUser, db: DbSession
) -> TeamRead:
    return TeamRead.from_team(TeamService(db, user).update(team_id, payload))


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(team_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    TeamService(db, user).delete(team_id)


@router.post("/{team_id}/members", response_model=TeamRead)
def add_team_members(
    team_id: uuid.UUID, payload: MembersRequest, user: CurrentUser, db: DbSession
) -> TeamRead:
    return TeamRead.from_team(TeamService(db, user).add_members(team_id, payload.user_ids))


@router.delete("/{team_id}/members/{user_id}", response_model=TeamRead)
def remove_team_member(
    team_id: uuid.UUID, user_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> TeamRead:
    return TeamRead.from_team(TeamService(db, user).remove_member(team_id, user_id))


@router.post("/{team_id}/move-member", response_model=TeamRead)
def move_team_member(
    team_id: uuid.UUID, payload: MoveMemberRequest, user: CurrentUser, db: DbSession
) -> TeamRead:
    return TeamRead.from_team(TeamService(db, user).move_member(team_id, payload.user_id))
