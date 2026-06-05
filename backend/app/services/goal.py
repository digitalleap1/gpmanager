"""Monthly goal & budget logic (Module 4 basics)."""

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import NotFound, PermissionDenied
from app.core.permissions import is_manager
from app.models.project import ProjectMonthlyBudget, ProjectMonthlyGoal
from app.models.user import User
from app.repositories.project import BudgetRepository, GoalRepository, ProjectRepository
from app.schemas.goal import MonthlyBudgetRead, MonthlyGoalRead
from app.services.activity import ActivityLogger


class GoalService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.projects = ProjectRepository(db)
        self.goals = GoalRepository(db)
        self.budgets = BudgetRepository(db)
        self.activity = ActivityLogger(db)

    def _ensure_project(self, project_id: uuid.UUID) -> None:
        if self.projects.get_for_company(project_id, self.company_id) is None:
            raise NotFound("Project not found")

    # --- goals ---
    def get_goals(self, project_id: uuid.UUID, year: int) -> list[MonthlyGoalRead]:
        self._ensure_project(project_id)
        existing = {g.month: g for g in self.goals.list_for_year(project_id, year)}
        result: list[MonthlyGoalRead] = []
        for month in range(1, 13):
            g = existing.get(month)
            target = g.goal_target if g else 0
            achieved = g.achieved if g else 0
            result.append(
                MonthlyGoalRead(
                    year=year,
                    month=month,
                    goal_target=target,
                    achieved=achieved,
                    remaining=max(target - achieved, 0),
                )
            )
        return result

    def set_goal(
        self, project_id: uuid.UUID, year: int, month: int, goal_target: int
    ) -> MonthlyGoalRead:
        if not is_manager(self.user):
            raise PermissionDenied()
        self._ensure_project(project_id)
        g = self.goals.get_month(project_id, year, month)
        if g is None:
            g = ProjectMonthlyGoal(
                project_id=project_id, year=year, month=month, goal_target=goal_target
            )
            self.db.add(g)
        else:
            g.goal_target = goal_target
        self.db.flush()
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="goal.updated",
            module="goal",
            entity_type="project",
            entity_id=project_id,
            new={"year": year, "month": month, "goal_target": goal_target},
        )
        self.db.commit()
        self.db.refresh(g)
        return MonthlyGoalRead(
            year=g.year,
            month=g.month,
            goal_target=g.goal_target,
            achieved=g.achieved,
            remaining=max(g.goal_target - g.achieved, 0),
        )

    # --- budgets ---
    def get_budgets(self, project_id: uuid.UUID, year: int) -> list[MonthlyBudgetRead]:
        self._ensure_project(project_id)
        existing = {b.month: b for b in self.budgets.list_for_year(project_id, year)}
        result: list[MonthlyBudgetRead] = []
        for month in range(1, 13):
            b = existing.get(month)
            result.append(
                MonthlyBudgetRead(
                    year=year,
                    month=month,
                    budget_amount=float(b.budget_amount) if b else 0.0,
                    spent_amount=float(b.spent_amount) if b else 0.0,
                )
            )
        return result

    def set_budget(
        self, project_id: uuid.UUID, year: int, month: int, budget_amount: float
    ) -> MonthlyBudgetRead:
        if not is_manager(self.user):
            raise PermissionDenied()
        self._ensure_project(project_id)
        b = self.budgets.get_month(project_id, year, month)
        if b is None:
            b = ProjectMonthlyBudget(
                project_id=project_id, year=year, month=month, budget_amount=budget_amount
            )
            self.db.add(b)
        else:
            b.budget_amount = budget_amount
        self.db.flush()
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="budget.updated",
            module="goal",
            entity_type="project",
            entity_id=project_id,
            new={"year": year, "month": month, "budget_amount": budget_amount},
        )
        self.db.commit()
        self.db.refresh(b)
        return MonthlyBudgetRead(
            year=b.year,
            month=b.month,
            budget_amount=float(b.budget_amount),
            spent_amount=float(b.spent_amount),
        )
