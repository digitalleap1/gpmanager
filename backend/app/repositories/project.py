"""Project, member, goal, and budget persistence queries."""

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.models.project import (
    Project,
    ProjectMember,
    ProjectMonthlyBudget,
    ProjectMonthlyGoal,
)
from app.repositories.base import BaseRepository

SORT_FIELDS = {
    "name": Project.name,
    "created_at": Project.created_at,
    "updated_at": Project.updated_at,
    "due_date": Project.due_date,
    "status": Project.status,
}


class ProjectRepository(BaseRepository[Project]):
    model = Project

    def get_for_company(self, project_id: uuid.UUID, company_id: uuid.UUID) -> Project | None:
        return self.db.scalars(
            select(Project).where(
                Project.id == project_id,
                Project.company_id == company_id,
                Project.deleted_at.is_(None),
            )
        ).first()

    def _filtered(
        self,
        company_id: uuid.UUID,
        *,
        search: str | None,
        status: str | None,
        client_id: uuid.UUID | None = None,
        main_niche_id: int | None,
        target_country_id: int | None,
        team_lead_id: uuid.UUID | None,
        assignee_id: uuid.UUID | None,
        include_archived: bool,
        restrict_to_users: set[uuid.UUID] | None,
    ) -> Select:
        stmt = select(Project).where(
            Project.company_id == company_id, Project.deleted_at.is_(None)
        )
        if not include_archived:
            stmt = stmt.where(Project.is_archived.is_(False))
        if client_id:
            stmt = stmt.where(Project.client_id == client_id)
        if status:
            stmt = stmt.where(Project.status == status)
        if main_niche_id:
            stmt = stmt.where(Project.main_niche_id == main_niche_id)
        if target_country_id:
            stmt = stmt.where(Project.target_country_id == target_country_id)
        if team_lead_id:
            stmt = stmt.where(Project.team_lead_id == team_lead_id)
        if assignee_id:
            stmt = stmt.where(Project.assignee_id == assignee_id)
        if search:
            stmt = stmt.where(Project.name.ilike(f"%{search}%"))
        # Row-level scope: visible to assignee / team lead / creator / member.
        if restrict_to_users is not None:
            member_sq = select(ProjectMember.project_id).where(
                ProjectMember.user_id.in_(restrict_to_users)
            )
            stmt = stmt.where(
                or_(
                    Project.assignee_id.in_(restrict_to_users),
                    Project.team_lead_id.in_(restrict_to_users),
                    Project.created_by.in_(restrict_to_users),
                    Project.id.in_(member_sq),
                )
            )
        return stmt

    def list_projects(
        self,
        company_id: uuid.UUID,
        *,
        search: str | None = None,
        status: str | None = None,
        client_id: uuid.UUID | None = None,
        main_niche_id: int | None = None,
        target_country_id: int | None = None,
        team_lead_id: uuid.UUID | None = None,
        assignee_id: uuid.UUID | None = None,
        include_archived: bool = False,
        restrict_to_users: set[uuid.UUID] | None = None,
        sort: str = "-created_at",
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[Sequence[Project], int]:
        filters = dict(
            search=search,
            status=status,
            client_id=client_id,
            main_niche_id=main_niche_id,
            target_country_id=target_country_id,
            team_lead_id=team_lead_id,
            assignee_id=assignee_id,
            include_archived=include_archived,
            restrict_to_users=restrict_to_users,
        )
        stmt = self._filtered(company_id, **filters)

        descending = sort.startswith("-")
        key = sort[1:] if descending else sort
        column = SORT_FIELDS.get(key, Project.created_at)
        stmt = stmt.order_by(column.desc() if descending else column.asc())

        total = (
            self.db.scalar(
                select(func.count()).select_from(self._filtered(company_id, **filters).subquery())
            )
            or 0
        )
        items = self.db.scalars(stmt.offset(offset).limit(limit)).all()
        return items, total

    # --- members ---
    def get_member(self, project_id: uuid.UUID, user_id: uuid.UUID) -> ProjectMember | None:
        return self.db.get(ProjectMember, {"project_id": project_id, "user_id": user_id})


class GoalRepository(BaseRepository[ProjectMonthlyGoal]):
    model = ProjectMonthlyGoal

    def list_for_year(
        self, project_id: uuid.UUID, year: int
    ) -> Sequence[ProjectMonthlyGoal]:
        return self.db.scalars(
            select(ProjectMonthlyGoal).where(
                ProjectMonthlyGoal.project_id == project_id,
                ProjectMonthlyGoal.year == year,
            )
        ).all()

    def get_month(
        self, project_id: uuid.UUID, year: int, month: int
    ) -> ProjectMonthlyGoal | None:
        return self.db.scalars(
            select(ProjectMonthlyGoal).where(
                ProjectMonthlyGoal.project_id == project_id,
                ProjectMonthlyGoal.year == year,
                ProjectMonthlyGoal.month == month,
            )
        ).first()


class BudgetRepository(BaseRepository[ProjectMonthlyBudget]):
    model = ProjectMonthlyBudget

    def list_for_year(
        self, project_id: uuid.UUID, year: int
    ) -> Sequence[ProjectMonthlyBudget]:
        return self.db.scalars(
            select(ProjectMonthlyBudget).where(
                ProjectMonthlyBudget.project_id == project_id,
                ProjectMonthlyBudget.year == year,
            )
        ).all()

    def get_month(
        self, project_id: uuid.UUID, year: int, month: int
    ) -> ProjectMonthlyBudget | None:
        return self.db.scalars(
            select(ProjectMonthlyBudget).where(
                ProjectMonthlyBudget.project_id == project_id,
                ProjectMonthlyBudget.year == year,
                ProjectMonthlyBudget.month == month,
            )
        ).first()
