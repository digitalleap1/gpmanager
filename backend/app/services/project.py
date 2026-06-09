"""Project Management logic (Module 3). All access is scoped to the caller's
company; regular users only see projects they're assignee, team lead, or member of.
"""

from __future__ import annotations  # lazy annotations: the `list` method must not shadow list[...]

import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_manager
from app.core.scope import accessible_user_ids
from app.core.security import verify_password
from app.models.guest_post import GuestPost
from app.models.lookups import Country, Niche
from app.models.payment import Payment
from app.models.project import Project, ProjectComment, ProjectMember
from app.models.user import User
from app.repositories.project import ProjectRepository
from app.repositories.user import UserRepository
from app.schemas.common_bulk import ImportResult
from app.schemas.project import ProjectCreate, ProjectDetail, ProjectUpdate
from app.services.activity import ActivityLogger, jsonable
from app.services.assignment import ensure_assignable
from app.services.bulk import (
    normalize_format,
    parse_date,
    parse_number,
    parse_table,
    run_row_imports,
    write_table,
)
from app.services.bulk import template as build_template
from app.services.goal import GoalService
from app.services.notification import Notifier

PROJECT_STATUSES = {"active", "completed", "hold", "cancelled"}
PROJECT_COLUMNS = [
    "name", "main_niche", "project_niche", "target_country", "assignee",
    "team_lead", "target_links", "monthly_budget", "goal", "due_date", "status",
    "notes",
]
PROJECT_TEMPLATE_EXAMPLE = [
    "Acme SaaS", "Technology", "SaaS", "US", "assignee@company.com",
    "lead@company.com", "8", "1000", "2 guest posts / month", "2026-12-31",
    "active", "Priority client",
]


class ProjectService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.projects = ProjectRepository(db)
        self.activity = ActivityLogger(db)

    def _scope(self) -> set[uuid.UUID] | None:
        """User ids in scope (None = admin, sees all)."""
        return accessible_user_ids(self.db, self.user)

    def _visible(self, p: Project) -> bool:
        users = self._scope()
        if users is None:
            return True
        return (
            p.assignee_id in users
            or p.team_lead_id in users
            or p.created_by in users
            or any(m.user_id in users for m in p.members)
        )

    def list(self, **filters) -> tuple[list[Project], int]:
        items, total = self.projects.list_projects(
            self.company_id, restrict_to_users=self._scope(), **filters
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
        ensure_assignable(self.db, self.user, data.assignee_id)
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
        notifier = Notifier(self.db)
        if p.assignee_id:
            notifier.notify(
                company_id=self.company_id,
                user_id=p.assignee_id,
                type="project_assigned",
                title="Project assigned",
                body=f"You were assigned to the project '{p.name}'.",
                entity_type="project",
                entity_id=p.id,
            )
        notifier.notify_admins(
            company_id=self.company_id,
            type="project_created",
            title="Project created",
            body=f"{self.user.full_name} created the project '{p.name}'.",
            entity_type="project",
            entity_id=p.id,
            exclude=self.user.id,
        )
        self.db.commit()
        self.db.refresh(p)
        return p

    def update(self, project_id: uuid.UUID, data: ProjectUpdate) -> Project:
        if not is_manager(self.user):
            raise PermissionDenied()
        p = self.get(project_id)
        changes = data.model_dump(exclude_unset=True)
        if "assignee_id" in changes:
            ensure_assignable(self.db, self.user, changes["assignee_id"])
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

    def bulk_assign(
        self,
        project_ids: list[uuid.UUID],
        assignee_id: uuid.UUID | None,
        team_lead_id: uuid.UUID | None,
    ) -> tuple[int, int]:
        """Assign many projects at once. Admin = any project; team lead = only
        projects in scope, and only to members they may assign. Returns
        (updated, skipped)."""
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can assign projects")
        if assignee_id is None and team_lead_id is None:
            raise BadRequest("Provide an assignee and/or a team lead")
        ensure_assignable(self.db, self.user, assignee_id)
        ensure_assignable(self.db, self.user, team_lead_id)

        notifier = Notifier(self.db)
        updated = 0
        skipped = 0
        for pid in project_ids:
            p = self.projects.get_for_company(pid, self.company_id)
            if p is None or not self._visible(p):
                skipped += 1
                continue
            if assignee_id is not None:
                p.assignee_id = assignee_id
            if team_lead_id is not None:
                p.team_lead_id = team_lead_id
            updated += 1
        if assignee_id is not None and updated:
            notifier.notify(
                company_id=self.company_id,
                user_id=assignee_id,
                type="project_assigned",
                title="Projects assigned",
                body=f"You were assigned to {updated} project(s).",
                entity_type="project",
                entity_id=None,
            )
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="project.bulk_assigned",
            module="project",
            entity_type="project",
            entity_id=None,
            new={"updated": updated, "assignee": str(assignee_id) if assignee_id else None},
        )
        self.db.commit()
        return updated, skipped

    def _soft_delete_project(self, p: Project, ts: datetime) -> None:
        """Soft-delete a project AND cascade-trash its related payments + guest
        posts using a shared timestamp (so a restore brings the group back)."""
        p.deleted_at = ts
        p.deleted_by = self.user.id
        for child in (Payment, GuestPost):
            self.db.execute(
                update(child)
                .where(child.project_id == p.id, child.deleted_at.is_(None))
                .values(deleted_at=ts, deleted_by=self.user.id)
            )
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="project.deleted",
            module="project",
            entity_type="project",
            entity_id=p.id,
            old={"name": p.name},
        )

    def delete(self, project_id: uuid.UUID) -> None:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can delete projects")
        p = self.get(project_id)
        self._soft_delete_project(p, datetime.now(UTC))
        self.db.commit()

    def bulk_delete(self, project_ids: list[uuid.UUID], password: str) -> tuple[int, int]:
        """Bulk soft-delete projects (+ their payments/guest posts) to Trash.
        Requires the caller's password confirmation. Returns (deleted, skipped)."""
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can delete projects")
        if not self.user.hashed_password or not verify_password(
            password, self.user.hashed_password
        ):
            raise BadRequest("Password confirmation is incorrect")
        ts = datetime.now(UTC)
        deleted = 0
        skipped = 0
        for pid in project_ids:
            p = self.projects.get_for_company(pid, self.company_id)
            if p is None or not self._visible(p):
                skipped += 1
                continue
            self._soft_delete_project(p, ts)
            deleted += 1
        self.db.commit()
        return deleted, skipped

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

    # --- comments ---
    def add_comment(self, project_id: uuid.UUID, body: str) -> ProjectComment:
        p = self.get(project_id)  # visibility/scope check
        comment = ProjectComment(project_id=p.id, author_id=self.user.id, body=body)
        self.db.add(comment)
        notifier = Notifier(self.db)
        # Notify the project's people (assignee/lead) + admins, except the author.
        for uid in {p.assignee_id, p.team_lead_id}:
            if uid and uid != self.user.id:
                notifier.notify(
                    company_id=self.company_id,
                    user_id=uid,
                    type="project_comment",
                    title="New comment",
                    body=f"{self.user.full_name} commented on '{p.name}'.",
                    entity_type="project",
                    entity_id=p.id,
                )
        notifier.notify_admins(
            company_id=self.company_id,
            type="project_comment",
            title="New comment",
            body=f"{self.user.full_name} commented on '{p.name}'.",
            entity_type="project",
            entity_id=p.id,
            exclude=self.user.id,
        )
        self.db.commit()
        self.db.refresh(comment)
        return comment

    def list_comments(self, project_id: uuid.UUID) -> list[ProjectComment]:
        return list(self.get(project_id).comments)

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

    # --- bulk import / export (CSV + XLSX) ---
    def _export_rows(self) -> list[list[object]]:
        projects = self.db.scalars(
            select(Project)
            .where(Project.company_id == self.company_id)
            .order_by(Project.name)
        ).all()
        return [
            [
                p.name,
                p.main_niche.name if p.main_niche else "",
                p.project_niche.name if p.project_niche else "",
                p.target_country.iso_code if p.target_country else "",
                p.assignee.email if p.assignee else "",
                p.team_lead.email if p.team_lead else "",
                p.target_links,
                float(p.monthly_budget) if p.monthly_budget is not None else 0,
                p.goal or "",
                p.due_date.isoformat() if p.due_date else "",
                p.status,
                p.notes or "",
            ]
            for p in projects
        ]

    def export(self, fmt: str) -> tuple[bytes, str, str]:
        if not is_manager(self.user):
            raise PermissionDenied()
        return write_table(PROJECT_COLUMNS, self._export_rows(), normalize_format(fmt))

    @staticmethod
    def template(fmt: str) -> tuple[bytes, str, str]:
        return build_template(PROJECT_COLUMNS, PROJECT_TEMPLATE_EXAMPLE, normalize_format(fmt))

    def import_file(self, filename: str, content: bytes) -> ImportResult:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can import projects")
        rows = parse_table(filename, content)
        if not rows:
            raise BadRequest("The file has no data rows")
        if "name" not in rows[0]:
            raise BadRequest("File must include a 'name' column")
        niches = {n.name.strip().lower(): n for n in self.db.scalars(select(Niche)).all()}
        countries: dict[str, Country] = {}
        for c in self.db.scalars(select(Country)).all():
            countries[c.iso_code.lower()] = c
            countries[c.name.lower()] = c
        users = {
            u.email.lower(): u
            for u in self.db.scalars(
                select(User).where(User.company_id == self.company_id)
            ).all()
        }
        projects = {
            p.name.strip().lower(): p
            for p in self.db.scalars(
                select(Project).where(Project.company_id == self.company_id)
            ).all()
        }
        result = run_row_imports(
            self.db,
            rows,
            lambda row: self._import_row(row, niches, countries, users, projects),
        )
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="project.imported",
            module="project",
            entity_type="project",
            entity_id=None,
            new={
                "created": result.created,
                "updated": result.updated,
                "errors": len(result.errors),
            },
        )
        self.db.commit()
        return result

    def _import_row(self, row, niches, countries, users, projects) -> bool:
        def cell(*names: str) -> str:
            for name in names:
                if name in row and row[name] != "":
                    return row[name]
            return ""

        name = cell("name").strip()
        if not name:
            raise ValueError("name is required")
        existing = projects.get(name.lower())
        project = existing or Project(
            company_id=self.company_id, created_by=self.user.id, name=name
        )
        if existing is None:
            self.db.add(project)
            projects[name.lower()] = project

        if cell("main_niche"):
            niche = niches.get(cell("main_niche").lower())
            if niche is not None:
                project.main_niche_id = niche.id
        if cell("project_niche"):
            niche = niches.get(cell("project_niche").lower())
            if niche is not None:
                project.project_niche_id = niche.id
        if cell("target_country"):
            country = countries.get(cell("target_country").lower())
            if country is not None:
                project.target_country_id = country.id
        if cell("assignee"):
            user = users.get(cell("assignee").lower())
            if user is None:
                raise ValueError(f"Unknown assignee '{cell('assignee')}'")
            project.assignee_id = user.id
        if cell("team_lead"):
            user = users.get(cell("team_lead").lower())
            if user is None:
                raise ValueError(f"Unknown team lead '{cell('team_lead')}'")
            project.team_lead_id = user.id

        target_links = parse_number(cell("target_links"))
        if target_links is not None:
            project.target_links = int(target_links)
        monthly_budget = parse_number(cell("monthly_budget"))
        if monthly_budget is not None:
            project.monthly_budget = monthly_budget
        if cell("goal"):
            project.goal = cell("goal")
        due = parse_date(cell("due_date"))
        if due is not None:
            project.due_date = due
        if cell("status"):
            status = cell("status").lower()
            if status not in PROJECT_STATUSES:
                raise ValueError(f"Invalid status '{status}'")
            project.status = status
        if cell("notes"):
            project.notes = cell("notes")
        self.db.flush()
        return existing is None
