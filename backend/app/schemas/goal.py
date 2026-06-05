"""Monthly goal & budget DTOs (Module 4 basics)."""

from pydantic import BaseModel, Field


class MonthlyGoalRead(BaseModel):
    year: int
    month: int
    goal_target: int
    achieved: int
    remaining: int


class GoalSet(BaseModel):
    goal_target: int = Field(ge=0)


class MonthlyBudgetRead(BaseModel):
    year: int
    month: int
    budget_amount: float
    spent_amount: float


class BudgetSet(BaseModel):
    budget_amount: float = Field(ge=0)
