"""Team persistence queries."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select

from app.models.team import Team, team_members
from app.repositories.base import BaseRepository


class TeamRepository(BaseRepository[Team]):
    model = Team

    def list_for_company(self, company_id: uuid.UUID) -> Sequence[Team]:
        stmt = select(Team).where(Team.company_id == company_id).order_by(Team.name)
        return self.db.scalars(stmt).all()

    def get_for_company(self, team_id: uuid.UUID, company_id: uuid.UUID) -> Team | None:
        team = self.get(team_id)
        if team is None or team.company_id != company_id:
            return None
        return team

    def get_by_name(self, name: str, company_id: uuid.UUID) -> Team | None:
        stmt = select(Team).where(
            Team.company_id == company_id, Team.name == name
        )
        return self.db.scalars(stmt).first()

    def teams_for_user(self, user_id: uuid.UUID) -> Sequence[Team]:
        """Teams the user is a MEMBER of."""
        stmt = (
            select(Team)
            .join(team_members, team_members.c.team_id == Team.id)
            .where(team_members.c.user_id == user_id)
        )
        return self.db.scalars(stmt).all()

    def member_ids_led_by(self, lead_user_id: uuid.UUID) -> set[uuid.UUID]:
        """Set of user ids who are members of any team led by the given user."""
        stmt = (
            select(team_members.c.user_id)
            .join(Team, Team.id == team_members.c.team_id)
            .where(Team.team_lead_id == lead_user_id)
        )
        return set(self.db.scalars(stmt).all())
