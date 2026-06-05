"""Project routes (Module 3) including monthly goals & budgets (Module 4)."""

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.common import Page
from app.schemas.goal import BudgetSet, GoalSet, MonthlyBudgetRead, MonthlyGoalRead
from app.schemas.project import (
    ArchiveRequest,
    MemberCreate,
    MemberRead,
    ProjectCreate,
    ProjectDetail,
    ProjectListItem,
    ProjectUpdate,
)
from app.services.goal import GoalService
from app.services.project import ProjectService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


def _this_year() -> int:
    return datetime.now(timezone.utc).year


@router.get("", response_model=Page[ProjectListItem])
def list_projects(
    user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status_: str | None = Query(None, alias="status"),
    main_niche_id: int | None = None,
    target_country_id: int | None = None,
    team_lead_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    archived: bool = False,
    sort: str = "-created_at",
) -> Page[ProjectListItem]:
    items, total = ProjectService(db, user).list(
        search=search,
        status=status_,
        main_niche_id=main_niche_id,
        target_country_id=target_country_id,
        team_lead_id=team_lead_id,
        assignee_id=assignee_id,
        include_archived=archived,
        sort=sort,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return Page[ProjectListItem](
        items=[ProjectListItem.from_project(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ProjectListItem, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, user: CurrentUser, db: DbSession) -> ProjectListItem:
    project = ProjectService(db, user).create(body)
    return ProjectListItem.from_project(project)


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(
    project_id: uuid.UUID, user: CurrentUser, db: DbSession, year: int | None = None
) -> ProjectDetail:
    return ProjectService(db, user).detail(project_id, year or _this_year())


@router.patch("/{project_id}", response_model=ProjectListItem)
def update_project(
    project_id: uuid.UUID, body: ProjectUpdate, user: CurrentUser, db: DbSession
) -> ProjectListItem:
    project = ProjectService(db, user).update(project_id, body)
    return ProjectListItem.from_project(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    ProjectService(db, user).delete(project_id)


@router.post("/{project_id}/archive", response_model=ProjectListItem)
def archive_project(
    project_id: uuid.UUID, body: ArchiveRequest, user: CurrentUser, db: DbSession
) -> ProjectListItem:
    project = ProjectService(db, user).set_archived(project_id, body.archived)
    return ProjectListItem.from_project(project)


# --- members ---
@router.get("/{project_id}/members", response_model=list[MemberRead])
def list_members(project_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[MemberRead]:
    members = ProjectService(db, user).list_members(project_id)
    return [MemberRead.from_member(m) for m in members]


@router.post(
    "/{project_id}/members", response_model=MemberRead, status_code=status.HTTP_201_CREATED
)
def add_member(
    project_id: uuid.UUID, body: MemberCreate, user: CurrentUser, db: DbSession
) -> MemberRead:
    member = ProjectService(db, user).add_member(project_id, body.user_id, body.role_label)
    return MemberRead.from_member(member)


@router.delete(
    "/{project_id}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_member(
    project_id: uuid.UUID, member_user_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> None:
    ProjectService(db, user).remove_member(project_id, member_user_id)


# --- goals ---
@router.get("/{project_id}/goals", response_model=list[MonthlyGoalRead])
def get_goals(
    project_id: uuid.UUID, user: CurrentUser, db: DbSession, year: int | None = None
) -> list[MonthlyGoalRead]:
    return GoalService(db, user).get_goals(project_id, year or _this_year())


@router.put("/{project_id}/goals/{year}/{month}", response_model=MonthlyGoalRead)
def set_goal(
    project_id: uuid.UUID,
    year: int,
    month: Annotated[int, Path(ge=1, le=12)],
    body: GoalSet,
    user: CurrentUser,
    db: DbSession,
) -> MonthlyGoalRead:
    return GoalService(db, user).set_goal(project_id, year, month, body.goal_target)


# --- budgets ---
@router.get("/{project_id}/budgets", response_model=list[MonthlyBudgetRead])
def get_budgets(
    project_id: uuid.UUID, user: CurrentUser, db: DbSession, year: int | None = None
) -> list[MonthlyBudgetRead]:
    return GoalService(db, user).get_budgets(project_id, year or _this_year())


@router.put("/{project_id}/budgets/{year}/{month}", response_model=MonthlyBudgetRead)
def set_budget(
    project_id: uuid.UUID,
    year: int,
    month: Annotated[int, Path(ge=1, le=12)],
    body: BudgetSet,
    user: CurrentUser,
    db: DbSession,
) -> MonthlyBudgetRead:
    return GoalService(db, user).set_budget(project_id, year, month, body.budget_amount)
