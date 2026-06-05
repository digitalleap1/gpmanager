"""Guest Post Tracker logic (Module 5), including the publish automation that
bumps the project's monthly goal `achieved` count (Module 4 link).
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import NotFound, PermissionDenied
from app.core.permissions import is_manager
from app.models.guest_post import GuestPost, GuestPostStatusHistory
from app.models.project import ProjectMonthlyGoal
from app.models.user import User
from app.repositories.guest_post import GuestPostRepository
from app.repositories.project import GoalRepository, ProjectRepository
from app.schemas.guest_post import GuestPostCreate, GuestPostUpdate
from app.services.activity import ActivityLogger, jsonable


class GuestPostService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.gps = GuestPostRepository(db)
        self.projects = ProjectRepository(db)
        self.goals = GoalRepository(db)
        self.activity = ActivityLogger(db)

    def _restrict_user_id(self) -> uuid.UUID | None:
        return None if is_manager(self.user) else self.user.id

    def _can_edit(self, gp: GuestPost) -> bool:
        return (
            is_manager(self.user)
            or gp.assigned_user_id == self.user.id
            or gp.created_by == self.user.id
        )

    def list(self, **filters) -> tuple[list[GuestPost], int]:
        items, total = self.gps.list_guest_posts(
            self.company_id, restrict_user_id=self._restrict_user_id(), **filters
        )
        return list(items), total

    def get(self, gp_id: uuid.UUID) -> GuestPost:
        gp = self.gps.get_for_company(gp_id, self.company_id)
        if gp is None:
            raise NotFound("Guest post not found")
        if self._restrict_user_id() is not None and not self._can_edit(gp):
            raise NotFound("Guest post not found")
        return gp

    def _ensure_project(self, project_id: uuid.UUID) -> None:
        if self.projects.get_for_company(project_id, self.company_id) is None:
            raise NotFound("Project not found")

    def create(self, data: GuestPostCreate) -> GuestPost:
        self._ensure_project(data.project_id)
        gp = GuestPost(company_id=self.company_id, created_by=self.user.id, **data.model_dump())
        self.gps.add(gp)
        self.db.add(
            GuestPostStatusHistory(
                guest_post_id=gp.id,
                from_status=None,
                to_status=gp.status,
                changed_by=self.user.id,
                note="created",
            )
        )
        if gp.status == "published":
            self._on_published(gp)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="guest_post.created",
            module="guest_post",
            entity_type="guest_post",
            entity_id=gp.id,
            new={"website_name": gp.website_name, "project_id": str(gp.project_id)},
        )
        self.db.commit()
        self.db.refresh(gp)
        return gp

    def update(self, gp_id: uuid.UUID, data: GuestPostUpdate) -> GuestPost:
        gp = self.get(gp_id)
        if not self._can_edit(gp):
            raise PermissionDenied()
        changes = data.model_dump(exclude_unset=True)
        new_status = changes.pop("status", None)
        if "project_id" in changes:
            self._ensure_project(changes["project_id"])
        old = {key: getattr(gp, key) for key in changes}
        for key, value in changes.items():
            setattr(gp, key, value)
        if new_status is not None and new_status != gp.status:
            self._apply_status(gp, new_status, None)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="guest_post.updated",
            module="guest_post",
            entity_type="guest_post",
            entity_id=gp.id,
            old=jsonable(old),
            new=jsonable(changes),
        )
        self.db.commit()
        self.db.refresh(gp)
        return gp

    def set_status(self, gp_id: uuid.UUID, status: str, note: str | None) -> GuestPost:
        gp = self.get(gp_id)
        if not self._can_edit(gp):
            raise PermissionDenied()
        if status != gp.status:
            self._apply_status(gp, status, note)
            self.db.commit()
            self.db.refresh(gp)
        return gp

    def publish(
        self,
        gp_id: uuid.UUID,
        live_link: str,
        live_link_date: date | None,
        anchor_text: str | None,
    ) -> GuestPost:
        gp = self.get(gp_id)
        if not self._can_edit(gp):
            raise PermissionDenied()
        gp.live_link = live_link
        if live_link_date is not None:
            gp.live_link_date = live_link_date
        elif gp.live_link_date is None:
            gp.live_link_date = datetime.now(timezone.utc).date()
        if anchor_text is not None:
            gp.anchor_text = anchor_text
        if gp.status != "published":
            self._apply_status(gp, "published", "published with live link")
        self.db.commit()
        self.db.refresh(gp)
        return gp

    def delete(self, gp_id: uuid.UUID) -> None:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can delete guest posts")
        gp = self.get(gp_id)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="guest_post.deleted",
            module="guest_post",
            entity_type="guest_post",
            entity_id=gp.id,
            old={"website_name": gp.website_name},
        )
        self.gps.delete(gp)
        self.db.commit()

    # --- internals ---
    def _apply_status(self, gp: GuestPost, new_status: str, note: str | None) -> None:
        old = gp.status
        gp.status = new_status
        self.db.add(
            GuestPostStatusHistory(
                guest_post_id=gp.id,
                from_status=old,
                to_status=new_status,
                changed_by=self.user.id,
                note=note,
            )
        )
        if new_status == "published" and old != "published":
            self._on_published(gp)
        else:
            self.activity.record(
                company_id=self.company_id,
                user_id=self.user.id,
                action="guest_post.status_changed",
                module="guest_post",
                entity_type="guest_post",
                entity_id=gp.id,
                new={"from": old, "to": new_status},
            )

    def _on_published(self, gp: GuestPost) -> None:
        """Automation: increment the project's monthly goal achieved count."""
        when = gp.live_link_date or datetime.now(timezone.utc).date()
        goal = self.goals.get_month(gp.project_id, when.year, when.month)
        if goal is None:
            goal = ProjectMonthlyGoal(
                project_id=gp.project_id,
                year=when.year,
                month=when.month,
                goal_target=0,
                achieved=1,
            )
            self.db.add(goal)
        else:
            goal.achieved = (goal.achieved or 0) + 1
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="guest_post.published",
            module="guest_post",
            entity_type="guest_post",
            entity_id=gp.id,
            new={"website_name": gp.website_name, "project_id": str(gp.project_id)},
        )
