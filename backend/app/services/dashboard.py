"""Dashboard aggregation (Module 2).

Fields that depend on not-yet-built modules (live links, payments) report 0 for
now and get wired up when Modules 5 and 7 land.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.activity import ActivityLog
from app.models.project import Project, ProjectMonthlyBudget, ProjectMonthlyGoal
from app.models.user import User
from app.repositories.activity import ActivityRepository
from app.schemas.dashboard import (
    ActivityRead,
    ChartBudgetPoint,
    ChartLinksPoint,
    DashboardSummary,
)
from app.schemas.refs import UserRef


class DashboardService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id

    def _count_projects(self, status: str | None = None) -> int:
        stmt = (
            select(func.count())
            .select_from(Project)
            .where(Project.company_id == self.company_id, Project.is_archived.is_(False))
        )
        if status:
            stmt = stmt.where(Project.status == status)
        return self.db.scalar(stmt) or 0

    def summary(self) -> DashboardSummary:
        now = datetime.now(timezone.utc)
        cid = self.company_id

        total_target = (
            self.db.scalar(
                select(func.coalesce(func.sum(Project.target_links), 0)).where(
                    Project.company_id == cid, Project.is_archived.is_(False)
                )
            )
            or 0
        )
        budget_total = (
            self.db.scalar(
                select(func.coalesce(func.sum(ProjectMonthlyBudget.budget_amount), 0))
                .join(Project, Project.id == ProjectMonthlyBudget.project_id)
                .where(
                    Project.company_id == cid,
                    ProjectMonthlyBudget.year == now.year,
                    ProjectMonthlyBudget.month == now.month,
                )
            )
            or 0
        )
        spent_total = (
            self.db.scalar(
                select(func.coalesce(func.sum(ProjectMonthlyBudget.spent_amount), 0))
                .join(Project, Project.id == ProjectMonthlyBudget.project_id)
                .where(
                    Project.company_id == cid,
                    ProjectMonthlyBudget.year == now.year,
                    ProjectMonthlyBudget.month == now.month,
                )
            )
            or 0
        )
        team_members = (
            self.db.scalar(
                select(func.count())
                .select_from(User)
                .where(User.company_id == cid, User.status == "active")
            )
            or 0
        )

        return DashboardSummary(
            total_projects=self._count_projects(),
            active_projects=self._count_projects("active"),
            completed_projects=self._count_projects("completed"),
            on_hold_projects=self._count_projects("hold"),
            cancelled_projects=self._count_projects("cancelled"),
            total_target_links=int(total_target),
            total_live_links=0,
            pending_payments_count=0,
            pending_payments_amount=0.0,
            monthly_budget_total=float(budget_total),
            monthly_spent_total=float(spent_total),
            team_members=int(team_members),
        )

    def recent_activity(self, limit: int = 10) -> list[ActivityRead]:
        rows = ActivityRepository(self.db).recent(self.company_id, limit)
        return [
            ActivityRead(
                id=r.id,
                action=r.action,
                module=r.module,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                user=UserRef(id=r.user.id, full_name=r.user.full_name) if r.user else None,
                created_at=r.created_at,
                summary=self._summary(r),
            )
            for r in rows
        ]

    @staticmethod
    def _summary(r: ActivityLog) -> str:
        actor = r.user.full_name if r.user else "Someone"
        name = None
        for source in (r.new_value, r.old_value):
            if isinstance(source, dict) and source.get("name"):
                name = source["name"]
                break
        verb = r.action.replace("_", " ").replace(".", " ")
        return f"{actor} {verb}" + (f' "{name}"' if name else "")

    def monthly_links(self, year: int) -> list[ChartLinksPoint]:
        rows = self.db.execute(
            select(
                ProjectMonthlyGoal.month,
                func.coalesce(func.sum(ProjectMonthlyGoal.goal_target), 0),
                func.coalesce(func.sum(ProjectMonthlyGoal.achieved), 0),
            )
            .join(Project, Project.id == ProjectMonthlyGoal.project_id)
            .where(Project.company_id == self.company_id, ProjectMonthlyGoal.year == year)
            .group_by(ProjectMonthlyGoal.month)
        ).all()
        by_month = {int(m): (int(t), int(a)) for m, t, a in rows}
        return [
            ChartLinksPoint(
                month=m,
                target=by_month.get(m, (0, 0))[0],
                achieved=by_month.get(m, (0, 0))[1],
            )
            for m in range(1, 13)
        ]

    def budget_usage(self, year: int) -> list[ChartBudgetPoint]:
        rows = self.db.execute(
            select(
                ProjectMonthlyBudget.month,
                func.coalesce(func.sum(ProjectMonthlyBudget.budget_amount), 0),
                func.coalesce(func.sum(ProjectMonthlyBudget.spent_amount), 0),
            )
            .join(Project, Project.id == ProjectMonthlyBudget.project_id)
            .where(Project.company_id == self.company_id, ProjectMonthlyBudget.year == year)
            .group_by(ProjectMonthlyBudget.month)
        ).all()
        by_month = {int(m): (float(b), float(s)) for m, b, s in rows}
        return [
            ChartBudgetPoint(
                month=m,
                budget=by_month.get(m, (0.0, 0.0))[0],
                spent=by_month.get(m, (0.0, 0.0))[1],
            )
            for m in range(1, 13)
        ]
