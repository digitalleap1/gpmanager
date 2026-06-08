"""Team DTOs (Phase 1 RBAC)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.team import Team
from app.schemas.user import UserSummary


class TeamListItem(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    team_lead: UserSummary | None
    member_count: int
    created_at: datetime

    @classmethod
    def from_team(cls, team: Team) -> TeamListItem:
        return cls(
            id=team.id,
            name=team.name,
            description=team.description,
            team_lead=UserSummary.from_user(team.team_lead) if team.team_lead else None,
            member_count=len(team.members),
            created_at=team.created_at,
        )


class TeamRead(TeamListItem):
    members: list[UserSummary]

    @classmethod
    def from_team(cls, team: Team) -> TeamRead:
        return cls(
            id=team.id,
            name=team.name,
            description=team.description,
            team_lead=UserSummary.from_user(team.team_lead) if team.team_lead else None,
            member_count=len(team.members),
            created_at=team.created_at,
            members=[UserSummary.from_user(m) for m in team.members],
        )


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    team_lead_id: uuid.UUID | None = None
    member_ids: list[uuid.UUID] = Field(default_factory=list)


class TeamUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    # Present + null clears the lead; absent leaves it unchanged (exclude_unset).
    team_lead_id: uuid.UUID | None = None


class MembersRequest(BaseModel):
    user_ids: list[uuid.UUID] = Field(min_length=1)


class MoveMemberRequest(BaseModel):
    user_id: uuid.UUID


# --- Org hierarchy view ---


class HierarchyMember(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str


class HierarchyTeam(BaseModel):
    id: uuid.UUID
    name: str
    team_lead: UserSummary | None
    members: list[UserSummary]


class OrgHierarchy(BaseModel):
    admins: list[UserSummary]
    teams: list[HierarchyTeam]
    unassigned: list[UserSummary]
