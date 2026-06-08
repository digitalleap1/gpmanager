"""Team model (Phase 1 RBAC).

A team groups members under a Team Lead. Company-scoped. Membership is a plain
M2M (a user can sit on more than one team; "move" = remove from A, add to B).
The team lead is a single user referenced directly so the org hierarchy is cheap
to render.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Column, ForeignKey, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User

team_members = Table(
    "team_members",
    Base.metadata,
    Column("team_id", ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class Team(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_teams_company_name"),)

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text())
    # The lead can be cleared without deleting the team.
    team_lead_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    team_lead: Mapped[User | None] = relationship(foreign_keys=[team_lead_id])
    members: Mapped[list[User]] = relationship(
        secondary=team_members, lazy="selectin", order_by="User.full_name"
    )
