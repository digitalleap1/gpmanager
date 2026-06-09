"""Team management (Phase 1 RBAC).

Admins create and manage teams + membership; managers (admin / team lead) may
view. A "move" relocates a user so they sit on exactly the target team.
"""

from __future__ import annotations  # the `list` method must not shadow list[...]

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_admin, is_manager
from app.models.team import Team
from app.models.user import User
from app.repositories.team import TeamRepository
from app.schemas.team import (
    HierarchyTeam,
    OrgHierarchy,
    TeamCreate,
    TeamUpdate,
)
from app.schemas.user import UserSummary
from app.services.activity import ActivityLogger, jsonable


class TeamService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.actor = user
        self.company_id = user.company_id
        self.teams = TeamRepository(db)
        self.activity = ActivityLogger(db)

    # --- guards ---
    def _require_admin(self) -> None:
        if not is_admin(self.actor):
            raise PermissionDenied("Only administrators can manage teams")

    def _require_manager(self) -> None:
        if not is_manager(self.actor):
            raise PermissionDenied()

    # --- helpers ---
    def _resolve_users(self, ids: list[uuid.UUID]) -> list[User]:
        if not ids:
            return []
        unique = list(dict.fromkeys(ids))
        users = self.db.scalars(
            select(User).where(User.id.in_(unique), User.company_id == self.company_id)
        ).all()
        found = {u.id for u in users}
        missing = [str(i) for i in unique if i not in found]
        if missing:
            raise BadRequest(f"Unknown user(s): {', '.join(missing)}")
        return list(users)

    def _resolve_lead(self, lead_id: uuid.UUID | None) -> User | None:
        if lead_id is None:
            return None
        return self._resolve_users([lead_id])[0]

    def _log(self, action: str, team: Team, **payload: object) -> None:
        self.activity.record(
            company_id=self.company_id,
            user_id=self.actor.id,
            action=action,
            module="team",
            entity_type="team",
            entity_id=team.id,
            new=jsonable(payload) if payload else None,
        )

    # --- reads ---
    def list(self) -> list[Team]:
        self._require_manager()
        return list(self.teams.list_for_company(self.company_id))

    def get(self, team_id: uuid.UUID) -> Team:
        self._require_manager()
        team = self.teams.get_for_company(team_id, self.company_id)
        if team is None:
            raise NotFound("Team not found")
        return team

    # --- mutations ---
    def create(self, data: TeamCreate) -> Team:
        self._require_admin()
        name = data.name.strip()
        if self.teams.get_by_name(name, self.company_id) is not None:
            raise BadRequest(f"A team named '{name}' already exists")
        lead = self._resolve_lead(data.team_lead_id)
        members = self._resolve_users(data.member_ids)
        team = Team(
            company_id=self.company_id,
            name=name,
            description=data.description,
            team_lead_id=lead.id if lead else None,
        )
        team.members = members
        self.db.add(team)
        self.db.flush()
        self._log("team.created", team, name=name, members=len(members))
        self.db.commit()
        self.db.refresh(team)
        return team

    def update(self, team_id: uuid.UUID, data: TeamUpdate) -> Team:
        self._require_admin()
        team = self.get(team_id)
        changes = data.model_dump(exclude_unset=True)
        if "name" in changes and changes["name"] is not None:
            new_name = changes["name"].strip()
            other = self.teams.get_by_name(new_name, self.company_id)
            if other is not None and other.id != team.id:
                raise BadRequest(f"A team named '{new_name}' already exists")
            team.name = new_name
        if "description" in changes:
            team.description = changes["description"]
        if "team_lead_id" in changes:
            lead = self._resolve_lead(changes["team_lead_id"])
            team.team_lead_id = lead.id if lead else None
        self._log("team.updated", team, **{k: str(v) for k, v in changes.items()})
        self.db.commit()
        self.db.refresh(team)
        return team

    def delete(self, team_id: uuid.UUID) -> None:
        self._require_admin()
        team = self.get(team_id)
        self._log("team.deleted", team, name=team.name)
        self.db.delete(team)
        self.db.commit()

    def add_members(self, team_id: uuid.UUID, user_ids: list[uuid.UUID]) -> Team:
        self._require_admin()
        team = self.get(team_id)
        existing = {m.id for m in team.members}
        added = 0
        for user in self._resolve_users(user_ids):
            if user.id not in existing:
                team.members.append(user)
                added += 1
        self._log("team.members_added", team, added=added)
        self.db.commit()
        self.db.refresh(team)
        return team

    def remove_member(self, team_id: uuid.UUID, user_id: uuid.UUID) -> Team:
        self._require_admin()
        team = self.get(team_id)
        team.members = [m for m in team.members if m.id != user_id]
        self._log("team.member_removed", team, user_id=str(user_id))
        self.db.commit()
        self.db.refresh(team)
        return team

    def move_member(self, team_id: uuid.UUID, user_id: uuid.UUID) -> Team:
        """Relocate a user so they belong to exactly the target team."""
        self._require_admin()
        target = self.get(team_id)
        user = self._resolve_users([user_id])[0]
        # Remove from every other team in the company.
        for team in self.teams.list_for_company(self.company_id):
            if team.id != target.id and any(m.id == user.id for m in team.members):
                team.members = [m for m in team.members if m.id != user.id]
        if not any(m.id == user.id for m in target.members):
            target.members.append(user)
        self._log("team.member_moved", target, user_id=str(user_id))
        self.db.commit()
        self.db.refresh(target)
        return target

    # --- org hierarchy ---
    def hierarchy(self) -> OrgHierarchy:
        self._require_manager()
        teams = list(self.teams.list_for_company(self.company_id))
        all_users = self.db.scalars(
            select(User).where(User.company_id == self.company_id).order_by(User.full_name)
        ).all()

        member_ids: set[uuid.UUID] = set()
        lead_ids: set[uuid.UUID] = set()
        for team in teams:
            member_ids.update(m.id for m in team.members)
            if team.team_lead_id:
                lead_ids.add(team.team_lead_id)

        admins = [UserSummary.from_user(u) for u in all_users if is_admin(u)]
        admin_ids = {u.id for u in all_users if is_admin(u)}
        hierarchy_teams = [
            HierarchyTeam(
                id=t.id,
                name=t.name,
                team_lead=UserSummary.from_user(t.team_lead) if t.team_lead else None,
                members=[UserSummary.from_user(m) for m in t.members],
            )
            for t in teams
        ]
        unassigned = [
            UserSummary.from_user(u)
            for u in all_users
            if u.id not in admin_ids and u.id not in member_ids and u.id not in lead_ids
        ]
        return OrgHierarchy(admins=admins, teams=hierarchy_teams, unassigned=unassigned)
