"""Per-project workflow checklist: 4 auto-generated items, each with its own
status + a combined comments/activity timeline. Every action (status change,
comment, payment request) notifies EVERYONE assigned to the project.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_admin, is_manager
from app.core.scope import accessible_project_ids
from app.core.security import verify_password
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
STATUSES = {"pending", "in_progress", "review", "completed", "approved", "done"}
STATUS_LABELS = {
    "pending": "Pending",
    "in_progress": "In Progress",
    "review": "In Review",
    "completed": "Completed",
    "approved": "Approved",
    "done": "Done",
}
PAYMENT_TYPES = {"regular", "advance", "reversal"}
# An item counts as complete (for the all-done / lock check) in any of these.
DONE_STATES = {"done", "completed", "approved"}


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

    def _can_manage(self, project: Project) -> bool:
        """Only the project's OWN team lead and admins may change statuses."""
        return is_admin(self.user) or self.user.id == project.team_lead_id

    def _is_locked(self, project: Project) -> bool:
        """A checklist is locked once ALL its items are complete."""
        items = list(
            self.db.scalars(
                select(ProjectChecklistItem).where(
                    ProjectChecklistItem.project_id == project.id
                )
            ).all()
        )
        return len(items) >= len(ITEMS) and all(it.status in DONE_STATES for it in items)

    def _verify_admin_password(self, password: str | None) -> bool:
        """True if `password` matches any active admin's login password."""
        if not password:
            return False
        admins = self.db.scalars(
            select(User).where(User.company_id == self.company_id, User.status == "active")
        ).all()
        return any(
            u.is_admin and u.hashed_password and verify_password(password, u.hashed_password)
            for u in admins
        )

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

    def _sync_guest_post(self, item: ProjectChecklistItem, *, live: bool) -> None:
        """Mirror the found website (and later the live link) into a Guest Post so
        it appears on /guest-posts + flows into reports. The find_website item
        holds the canonical guest_post_id for the project."""
        from app.models.guest_post import GuestPost

        fw = self.db.scalar(
            select(ProjectChecklistItem).where(
                ProjectChecklistItem.project_id == item.project_id,
                ProjectChecklistItem.item_key == "find_website",
            )
        )
        gp_id = (fw.guest_post_id if fw else None) or item.guest_post_id
        gp = self.db.get(GuestPost, gp_id) if gp_id else None
        if gp is None:
            gp = GuestPost(
                company_id=self.company_id, project_id=item.project_id,
                created_by=self.user.id, status="prospect",
            )
            self.db.add(gp)
            self.db.flush()
        if fw is not None:
            fw.guest_post_id = gp.id
        item.guest_post_id = gp.id
        if live:
            gp.live_link = (item.link or "")[:700] or None
            gp.live_link_date = datetime.now(UTC).date()
            gp.status = "published"
        else:
            raw = item.link or ""
            name = raw.replace("https://", "").replace("http://", "").split("/")[0][:180]
            gp.website_name = name or raw[:180]
            gp.da = item.da
            gp.dr = item.dr
            gp.traffic = item.traffic
            if item.amount is not None:
                gp.price = item.amount

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
            "link": item.link,
            "assignee": (
                {"id": item.assignee.id, "full_name": item.assignee.full_name}
                if item.assignee
                else None
            ),
            "payment_type": item.payment_type,
            "amount": float(item.amount) if item.amount is not None else None,
            "currency": item.currency,
            "transaction_id": item.transaction_id,
            "payment_mode": item.payment_mode,
            "da": item.da,
            "pa": item.pa,
            "dr": item.dr,
            "traffic": item.traffic,
            "timeline": [self._entry_dto(e) for e in item.entries],
        }

    # --- API ---
    def get(self, project_id: uuid.UUID) -> dict:
        p = self._project(project_id)
        items = self._ensure_items(p)
        # Re-load with entries.
        item_dtos = [self._item_dto(self.db.get(ProjectChecklistItem, i.id)) for i in items]
        done_count = sum(1 for i in items if i.status in DONE_STATES)
        all_done = done_count == len(items)
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
            "can_manage_status": self._can_manage(p),
            "completed_count": done_count,
            "total": len(items),
            "all_done": all_done,
            "locked": all_done,
        }

    def set_status(
        self,
        project_id: uuid.UUID,
        item_id: uuid.UUID,
        status: str,
        *,
        note: str | None = None,
        link: str | None = None,
        assignee_id: uuid.UUID | None = None,
        payment_type: str | None = None,
        amount: float | None = None,
        currency: str | None = None,
        transaction_id: str | None = None,
        payment_mode: str | None = None,
        da: int | None = None,
        pa: int | None = None,
        dr: int | None = None,
        traffic: int | None = None,
        password: str | None = None,
    ) -> dict:
        if status not in STATUSES:
            raise BadRequest(f"status must be one of {sorted(STATUSES)}")
        p = self._project(project_id)
        item = self._item(p, item_id)
        # Only the project lead / an admin (or the item's current assignee — e.g.
        # the member doing the payment) may change a status.
        if not (self._can_manage(p) or self.user.id == item.assignee_id):
            raise PermissionDenied(
                "Only the project lead or an admin can change this status."
            )
        # Once the whole checklist is complete it's LOCKED — any further edit
        # needs an admin password to unlock.
        if self._is_locked(p) and not self._verify_admin_password(password):
            raise PermissionDenied(
                "This checklist is complete and locked. Enter an admin password to edit it."
            )
        if assignee_id is not None and assignee_id not in self._audience(p):
            raise BadRequest("The selected member is not on this project")

        old = item.status
        item.status = status
        if link is not None:
            item.link = link or None
        if assignee_id is not None:
            # Set the relationship object (not just the FK) so the response
            # reflects it — the session has expire_on_commit=False.
            item.assignee = self.db.get(User, assignee_id)
        # Payment-item details.
        if payment_type is not None:
            if payment_type and payment_type not in PAYMENT_TYPES:
                raise BadRequest(f"payment_type must be one of {sorted(PAYMENT_TYPES)}")
            item.payment_type = payment_type or None
        if amount is not None:
            item.amount = Decimal(str(amount))
        if currency is not None:
            item.currency = (currency.upper()[:3] or None)
        if transaction_id is not None:
            item.transaction_id = transaction_id or None
        if payment_mode is not None:
            item.payment_mode = payment_mode or None
        # Find-a-Website metrics.
        if da is not None:
            item.da = da
        if pa is not None:
            item.pa = pa
        if dr is not None:
            item.dr = dr
        if traffic is not None:
            item.traffic = traffic
        # Sync the found website / live link into a Guest Post (so it shows on
        # the Guest Posts page + carries through to reports).
        if item.item_key == "find_website" and item.link:
            self._sync_guest_post(item, live=False)
        elif item.item_key == "publish_live_link" and item.link:
            self._sync_guest_post(item, live=True)
        label = STATUS_LABELS.get(status, status)

        detail = f"Status changed from {STATUS_LABELS.get(old, old)} to {label}."
        if link:
            detail += f" Link: {link}"
        pay_bits: list[str] = []
        if payment_type and payment_type != "regular":
            pay_bits.append(f"{payment_type.title()} payment")
        if amount:
            pay_bits.append(f"Amount: {amount} {currency or ''}".strip())
        if transaction_id:
            pay_bits.append(f"Txn: {transaction_id}")
        if payment_mode:
            pay_bits.append(f"Mode: {payment_mode}")
        if pay_bits:
            detail += " " + " | ".join(pay_bits)
        self.db.add(
            ProjectChecklistEntry(
                item_id=item.id, author_id=self.user.id, subject_id=assignee_id,
                kind="status", body=detail,
            )
        )
        if note and note.strip():
            self.db.add(
                ProjectChecklistEntry(
                    item_id=item.id, author_id=self.user.id, subject_id=assignee_id,
                    kind="comment", body=note.strip(),
                )
            )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="checklist.status_changed",
            module="project", entity_type="project", entity_id=p.id,
            new={"name": p.name, "item": item.item_key, "status": status},
        )
        # Notify the newly-assigned member specifically, then the whole project.
        if assignee_id and assignee_id != self.user.id:
            self.notifier.notify(
                company_id=self.company_id, user_id=assignee_id, type="checklist_assigned",
                title=f"{item.title} — {p.name}",
                body=f"{self.user.full_name} assigned you '{item.title}' ({label}).",
                entity_type="project", entity_id=p.id,
            )
        self._broadcast(p, item, body=f"{self.user.full_name} set '{item.title}' to {label}.")
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
