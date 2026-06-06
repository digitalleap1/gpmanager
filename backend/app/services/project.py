"""Project Management logic (Module 3). All access is scoped to the caller's
company; regular users only see projects they're assignee, team lead, or member of.
"""

from __future__ import annotations  # lazy annotations: the `list` method must not shadow list[...]

import uuid

from sqlalchemy.orm import Session

from app.core.exceptions import NotFound, PermissionDenied
from app.core.permissions import is_admin, is_manager
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.repositories.project import ProjectRepository
from app.repositories.user import UserRepository
from app.schemas.project import ProjectCreate, ProjectDetail, ProjectUpdate
from app.services.activity import ActivityLogger, jsonable
from app.services.goal import GoalService
from app.services.notification import Notifier


class ProjectService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.projects = ProjectRepository(db)
        self.activity = ActivityLogger(db)

    def _restrict_user_id(self) -> uuid.UUID | None:
        return None if is_manager(self.user) else self.user.id

    def _visible(self, p: Project) -> bool:
        if is_manager(self.user):
            return True
        uid = self.user.id
        return (
            p.assignee_id == uid
            or p.team_lead_id == uid
            or any(m.user_id == uid for m in p.members)
        )

    def list(self, **filters) -> tuple[list[Project], int]:
        items, total = self.projects.list_projects(
            self.company_id, restrict_user_id=self._restrict_user_id(), **filters
        )
        return list(items), total

    def get(self, project_id: uuid.UUID) -> Project:
        p = self.projects.get_for_company(project_id, self.company_id)
        if p is None or not self._visible(p):
            raise NotFound("Project not found")
        return p

    def create(self, data: ProjectCreate) -> Project:
        if not is_manager(self.user):
            raise PermissionDenied("You do not have permission to create projects")
        p = Project(company_id=self.company_id, created_by=self.user.id, **data.model_dump())
        self.projects.add(p)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="project.created",
            module="project",
            entity_type="project",
            entity_id=p.id,
            new={"name": p.name},
        )
        if p.assignee_id:
            Notifier(self.db).notify(
                company_id=self.company_id,
                user_id=p.assignee_id,
                type="project_assigned",
                title="Project assigned",
                body=f"You were assigned to the project '{p.name}'.",
                entity_type="project",
                entity_id=p.id,
            )
        self.db.commit()
        self.db.refresh(p)
        return p

    def update(self, project_id: uuid.UUID, data: ProjectUpdate) -> Project:
        if not is_manager(self.user):
            raise PermissionDenied()
        p = self.get(project_id)
        changes = data.model_dump(exclude_unset=True)
        old = {key: getattr(p, key) for key in changes}
        for key, value in changes.items():
            setattr(p, key, value)
        if changes.get("assignee_id"):
            Notifier(self.db).notify(
                company_id=self.company_id,
                user_id=changes["assignee_id"],
                type="project_assigned",
                title="Project assigned",
                body=f"You were assigned to the project '{p.name}'.",
                entity_type="project",
                entity_id=p.id,
            )
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="project.updated",
            module="project",
            entity_type="project",
            entity_id=p.id,
            old=jsonable(old),
            new=jsonable(changes),
        )
        self.db.commit()
        self.db.refresh(p)
        return p

    def delete(self, project_id: uuid.UUID) -> None:
        if not is_admin(self.user):
            raise PermissionDenied("Only admins can delete projects")
        p = self.get(project_id)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="project.deleted",
            module="project",
            entity_type="project",
            entity_id=p.id,
            old={"name": p.name},
        )
        self.projects.delete(p)
        self.db.commit()

    def set_archived(self, project_id: uuid.UUID, archived: bool) -> Project:
        if not is_manager(self.user):
            raise PermissionDenied()
        p = self.get(project_id)
        p.is_archived = archived
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="project.archived" if archived else "project.unarchived",
            module="project",
            entity_type="project",
            entity_id=p.id,
            new={"name": p.name},
        )
        self.db.commit()
        self.db.refresh(p)
        return p

    # --- members ---
    def list_members(self, project_id: uuid.UUID) -> list[ProjectMember]:
        return list(self.get(project_id).members)

    def add_member(
        self, project_id: uuid.UUID, user_id: uuid.UUID, role_label: str | None
    ) -> ProjectMember:
        if not is_manager(self.user):
            raise PermissionDenied()
        self.get(project_id)
        target = UserRepository(self.db).get(user_id)
        if target is None or target.company_id != self.company_id:
            raise NotFound("User not found")
        existing = self.projects.get_member(project_id, user_id)
        if existing is not None:
            return existing
        member = ProjectMember(project_id=project_id, user_id=user_id, role_label=role_label)
        self.db.add(member)
        self.db.flush()
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="project.member_added",
            module="project",
            entity_type="project",
            entity_id=project_id,
            new={"user_id": str(user_id)},
        )
        self.db.commit()
        self.db.refresh(member)
        return member

    def remove_member(self, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        if not is_manager(self.user):
            raise PermissionDenied()
        self.get(project_id)
        member = self.projects.get_member(project_id, user_id)
        if member is None:
            raise NotFound("Member not found")
        self.db.delete(member)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="project.member_removed",
            module="project",
            entity_type="project",
            entity_id=project_id,
            old={"user_id": str(user_id)},
        )
        self.db.commit()

    # --- detail (with goals + budgets) ---
    def detail(self, project_id: uuid.UUID, year: int) -> ProjectDetail:
        p = self.get(project_id)
        goal_service = GoalService(self.db, self.user)
        goals = goal_service.get_goals(project_id, year)
        budgets = goal_service.get_budgets(project_id, year)
        return ProjectDetail.build(p, current_year=year, goals=goals, budgets=budgets)
