"""Per-project workflow checklist: 4 auto-generated items, each with its own
status + a combined comments/activity timeline. Every action (status change,
comment, payment request) notifies EVERYONE assigned to the project.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_manager
from app.core.scope import accessible_project_ids
from app.models.project import (
    Project,
    ProjectChecklistEntry,
    ProjectChecklistItem,
    ProjectMember,
)
from app.models.user import User
from app.services.activity import ActivityLogger
from app.services.notification import Notifier

# The auto-generated checklist (key, title) in order.
ITEMS: list[tuple[str, str]] = [
    ("find_website", "Find a Website"),
    ("content_writing", "Content Writing for Guest Post"),
    ("publish_live_link", "Publish the Blog & Collect Live Link"),
    ("payment", "Payment Process"),
]
STATUSES = {"pending", "in_progress", "completed", "approved", "done"}
STATUS_LABELS = {
    "pending": "Pending",
    "in_progress": "In Progress",
    "completed": "Completed",
    "approved": "Approved",
    "done": "Done",
}


class ProjectChecklistService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.activity = ActivityLogger(db)
        self.notifier = Notifier(db)

    # --- helpers ---
    def _project(self, project_id: uuid.UUID) -> Project:
        p = self.db.get(Project, project_id)
        if p is None or p.company_id != self.company_id or p.deleted_at is not None:
            raise NotFound("Project not found")
        pids = accessible_project_ids(self.db, self.user)
        if pids is not None and p.id not in pids:
            raise NotFound("Project not found")
        return p

    def _audience(self, project: Project) -> set[uuid.UUID]:
        ids = set(
            self.db.scalars(
                select(ProjectMember.user_id).where(ProjectMember.project_id == project.id)
            ).all()
        )
        ids |= {project.team_lead_id, project.assignee_id, project.created_by}
        return {u for u in ids if u}

    def _broadcast(
        self, project: Project, item: ProjectChecklistItem, *, body: str, notify_admins: bool = True
    ) -> None:
        for uid in self._audience(project) - {self.user.id}:
            self.notifier.notify(
                company_id=self.company_id, user_id=uid, type="checklist_update",
                title=f"{item.title} — {project.name}", body=body,
                entity_type="project", entity_id=project.id,
            )
        if notify_admins:
            self.notifier.notify_admins(
                company_id=self.company_id, type="checklist_update",
                title=f"{item.title} — {project.name}", body=body,
                entity_type="project", entity_id=project.id, exclude=self.user.id,
            )

    def _ensure_items(self, project: Project) -> list[ProjectChecklistItem]:
        existing = {
            i.item_key: i
            for i in self.db.scalars(
                select(ProjectChecklistItem).where(
                    ProjectChecklistItem.project_id == project.id
                )
            ).all()
        }
        created = False
        for pos, (key, title) in enumerate(ITEMS):
            if key not in existing:
                item = ProjectChecklistItem(
                    project_id=project.id, item_key=key, title=title,
                    status="pending", position=pos,
                )
                self.db.add(item)
                existing[key] = item
                created = True
        if created:
            self.db.commit()
        # Return in canonical order.
        return [existing[key] for key, _ in ITEMS]

    def _item(self, project: Project, item_id: uuid.UUID) -> ProjectChecklistItem:
        item = self.db.get(ProjectChecklistItem, item_id)
        if item is None or item.project_id != project.id:
            raise NotFound("Checklist item not found")
        return item

    @staticmethod
    def _entry_dto(e: ProjectChecklistEntry) -> dict:
        return {
            "id": e.id,
            "kind": e.kind,
            "body": e.body,
            "author": (
                {"id": e.author.id, "full_name": e.author.full_name} if e.author else None
            ),
            "subject": (
                {"id": e.subject.id, "full_name": e.subject.full_name} if e.subject else None
            ),
            "created_at": e.created_at,
        }

    def _item_dto(self, item: ProjectChecklistItem) -> dict:
        return {
            "id": item.id,
            "item_key": item.item_key,
            "title": item.title,
            "status": item.status,
            "status_label": STATUS_LABELS.get(item.status, item.status),
            "position": item.position,
            "timeline": [self._entry_dto(e) for e in item.entries],
        }

    # --- API ---
    def get(self, project_id: uuid.UUID) -> dict:
        p = self._project(project_id)
        items = self._ensure_items(p)
        # Re-load with entries.
        item_dtos = [self._item_dto(self.db.get(ProjectChecklistItem, i.id)) for i in items]
        done_count = sum(1 for i in items if i.status in ("done", "completed", "approved"))
        # The project's members (for the "who did this" picker on comments).
        member_ids = self._audience(p)
        members = (
            self.db.scalars(select(User).where(User.id.in_(member_ids))).all()
            if member_ids
            else []
        )
        return {
            "project_id": p.id,
            "project_name": p.name,
            "items": item_dtos,
            "members": [{"id": u.id, "full_name": u.full_name} for u in members],
            "completed_count": done_count,
            "total": len(items),
            "all_done": done_count == len(items),
        }

    def set_status(self, project_id: uuid.UUID, item_id: uuid.UUID, status: str) -> dict:
        if not is_manager(self.user):
            raise PermissionDenied("Only team leads and admins update the checklist")
        if status not in STATUSES:
            raise BadRequest(f"status must be one of {sorted(STATUSES)}")
        p = self._project(project_id)
        item = self._item(p, item_id)
        old = item.status
        item.status = status
        label = STATUS_LABELS.get(status, status)
        body = f"{self.user.full_name} set '{item.title}' to {label}."
        self.db.add(
            ProjectChecklistEntry(
                item_id=item.id, author_id=self.user.id, kind="status",
                body=f"Status changed from {STATUS_LABELS.get(old, old)} to {label}.",
            )
        )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="checklist.status_changed",
            module="project", entity_type="project", entity_id=p.id,
            new={"name": p.name, "item": item.item_key, "status": status},
        )
        self._broadcast(p, item, body=body)
        self.db.commit()
        return self.get(project_id)

    def add_comment(
        self, project_id: uuid.UUID, item_id: uuid.UUID, body: str,
        subject_id: uuid.UUID | None = None,
    ) -> dict:
        p = self._project(project_id)
        item = self._item(p, item_id)
        # subject_id must be someone actually on the project.
        if subject_id is not None and subject_id not in self._audience(p):
            raise BadRequest("The selected member is not on this project")
        self.db.add(
            ProjectChecklistEntry(
                item_id=item.id, author_id=self.user.id, subject_id=subject_id,
                kind="comment", body=body,
            )
        )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="checklist.commented",
            module="project", entity_type="project", entity_id=p.id,
            new={"name": p.name, "item": item.item_key},
        )
        subject_note = ""
        if subject_id is not None:
            subject = self.db.get(User, subject_id)
            if subject:
                subject_note = f" (re: {subject.full_name})"
        self._broadcast(
            p, item,
            body=f'{self.user.full_name} commented on "{item.title}"{subject_note}: {body[:100]}',
        )
        self.db.commit()
        return self.get(project_id)

    def request_payment(self, project_id: uuid.UUID, item_id: uuid.UUID, note: str | None) -> dict:
        if not is_manager(self.user):
            raise PermissionDenied("Only team leads and admins can request payment")
        p = self._project(project_id)
        item = self._item(p, item_id)
        item.status = "in_progress"
        msg = "Payment requested from Admin." + (f" {note}" if note else "")
        self.db.add(
            ProjectChecklistEntry(
                item_id=item.id, author_id=self.user.id, kind="comment", body=msg
            )
        )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="checklist.payment_requested",
            module="project", entity_type="project", entity_id=p.id, new={"name": p.name},
        )
        # Admins specifically + everyone on the project.
        self._broadcast(p, item, body=f"{self.user.full_name}: {msg}")
        self.db.commit()
        return self.get(project_id)
