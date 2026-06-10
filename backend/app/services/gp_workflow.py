"""Guest Post Project Workflow — the per-project state machine.

Research -> Review -> Approved -> Content Writing -> Content Ready ->
Sent to Client -> Published -> Payment Requested -> Payment Sent ->
Payment Confirmed -> Completed   (plus the Advance-Payment branch).

Each transition: validates the from-state + the actor's role, records a
GuestPostStatusHistory entry (the stage **comment**), writes an **activity log**,
and fires the right stage **notification(s)** (submitter / team lead / member /
admins). Side effects: review-approve auto-creates the content-writing task;
the payment steps create + drive a linked Payment "ticket".
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, PermissionDenied
from app.core.permissions import is_admin, is_manager
from app.models.guest_post import GuestPost, GuestPostStatusHistory
from app.models.payment import Payment
from app.models.task import Task
from app.models.user import User
from app.schemas.payment import PaymentCreate
from app.services.activity import ActivityLogger
from app.services.guest_post import GuestPostService
from app.services.notification import Notifier
from app.services.payment import PaymentService

# Workflow states (also written to GuestPostStatusHistory.{from,to}_status, String(20)).
LABELS: dict[str, str] = {
    "research": "Research",
    "review_pending": "Under Review",
    "rejected": "Rejected",
    "content_writing": "Content Writing",
    "content_ready": "Content Ready",
    "sent_to_client": "Sent to Client",
    "published": "Published / Live Link Received",
    "payment_requested": "Payment Requested",
    "payment_sent": "Payment Sent",
    "payment_verification": "Payment Verification Pending",
    "completed": "Completed",
    "advance_requested": "Advance Payment Requested",
}

# Allowed transitions (target -> set of valid current states).
_FROM: dict[str, set[str]] = {
    "review_pending": {"research", "rejected"},
    "rejected": {"review_pending"},
    "content_writing": {"review_pending", "advance_requested"},
    "advance_requested": {"review_pending"},
    "content_ready": {"content_writing"},
    "sent_to_client": {"content_ready"},
    "published": {"sent_to_client"},
    "payment_requested": {"published"},
    "payment_sent": {"payment_requested", "payment_verification"},
    "payment_verification": {"payment_sent"},
    "completed": {"payment_sent", "published"},
}


class GuestPostWorkflowService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.gps = GuestPostService(db, user)
        self.activity = ActivityLogger(db)
        self.notifier = Notifier(db)

    # --- helpers ---
    def _gp(self, gp_id: uuid.UUID) -> GuestPost:
        return self.gps.get(gp_id)  # 404 if out of scope

    def _lead_id(self, gp: GuestPost) -> uuid.UUID | None:
        return gp.project.team_lead_id if gp.project else None

    def _can_member(self, gp: GuestPost) -> bool:
        return (
            is_manager(self.user)
            or gp.created_by == self.user.id
            or gp.assigned_user_id == self.user.id
            or gp.content_writer_id == self.user.id
        )

    def _transition(
        self,
        gp: GuestPost,
        *,
        to: str,
        action: str,
        note: str | None,
        notify_users: set[uuid.UUID | None] | None = None,
        notify_admins: bool = False,
    ) -> None:
        allowed = _FROM.get(to, set())
        if gp.workflow_status not in allowed:
            raise BadRequest(
                f"Can't move to '{LABELS.get(to, to)}' from "
                f"'{LABELS.get(gp.workflow_status, gp.workflow_status)}'."
            )
        old = gp.workflow_status
        gp.workflow_status = to
        self.db.add(
            GuestPostStatusHistory(
                guest_post_id=gp.id, from_status=old, to_status=to,
                changed_by=self.user.id, note=note,
            )
        )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id,
            action=f"guest_post.{action}", module="guest_post",
            entity_type="guest_post", entity_id=gp.id, new={"to": to, "note": note},
        )
        title = LABELS.get(to, to)
        site = gp.website_name or "the website"
        body = f"{self.user.full_name}: {title} — '{site}'" + (f". {note}" if note else "")
        for uid in {u for u in (notify_users or set()) if u and u != self.user.id}:
            self.notifier.notify(
                company_id=self.company_id, user_id=uid, type=f"gp_{action}",
                title=title, body=body, entity_type="guest_post", entity_id=gp.id,
            )
        if notify_admins:
            self.notifier.notify_admins(
                company_id=self.company_id, type=f"gp_{action}", title=title,
                body=body, entity_type="guest_post", entity_id=gp.id, exclude=self.user.id,
            )

    def _create_content_task(self, gp: GuestPost) -> None:
        self.db.add(
            Task(
                company_id=self.company_id, project_id=gp.project_id,
                name=f"Write content: {gp.website_name or 'guest post'}",
                description=f"Content writing for the approved guest post on {gp.website_name or 'the site'}.",
                assigned_to=gp.content_writer_id, status="pending", created_by=self.user.id,
            )
        )
        if gp.content_writer_id and gp.content_writer_id != self.user.id:
            self.notifier.notify(
                company_id=self.company_id, user_id=gp.content_writer_id,
                type="gp_content_assigned", title="Content assigned",
                body=f"You were assigned content writing for '{gp.website_name or 'a guest post'}'.",
                entity_type="guest_post", entity_id=gp.id,
            )

    def _create_payment_ticket(
        self, gp: GuestPost, amount: float | None, currency: str | None,
        payment_type: str | None, note: str | None, advance: bool,
    ) -> Payment:
        kind = "Advance payment" if advance else "Payment"
        remarks = f"{kind} request via guest-post workflow." + (f" {note}" if note else "")
        # PaymentService.create handles amount_usd + notifies admins (= "assigned to Admin").
        pay = PaymentService(self.db, self.user).create(
            PaymentCreate(
                project_id=gp.project_id, website_id=gp.website_id,
                currency=(currency or "USD"), amount=amount,
                mode_of_payment=(payment_type or None), live_link=gp.live_link,
                status="pending", remarks=remarks,
            )
        )
        gp.payment_id = pay.id
        return pay

    def _set_payment_status(self, gp: GuestPost, status: str) -> None:
        if gp.payment_id:
            pay = self.db.get(Payment, gp.payment_id)
            if pay:
                pay.status = status

    def _done(self, gp: GuestPost) -> GuestPost:
        self.db.commit()
        self.db.refresh(gp)
        return gp

    # --- transitions ---
    def submit_for_review(self, gp_id: uuid.UUID) -> GuestPost:
        gp = self._gp(gp_id)
        if not self._can_member(gp):
            raise PermissionDenied()
        self._transition(
            gp, to="review_pending", action="submitted", note=None,
            notify_users={self._lead_id(gp)}, notify_admins=True,
        )
        gp.review_status = "submitted"
        return self._done(gp)

    def review(
        self, gp_id: uuid.UUID, approve: bool, note: str | None, advance: bool = False
    ) -> GuestPost:
        if not is_manager(self.user):
            raise PermissionDenied("Only team leads or admins can review")
        gp = self._gp(gp_id)
        if not approve:
            self._transition(
                gp, to="rejected", action="rejected", note=note, notify_users={gp.created_by}
            )
            gp.review_status = "rejected"
        elif advance:
            self._transition(
                gp, to="advance_requested", action="approved", note=note,
                notify_users={gp.created_by},
            )
            gp.review_status = "approved"
            self._create_payment_ticket(gp, None, "USD", None, note, advance=True)
        else:
            self._transition(
                gp, to="content_writing", action="approved", note=note,
                notify_users={gp.created_by},
            )
            gp.review_status = "approved"
            self._create_content_task(gp)
        gp.reviewed_by = self.user.id
        gp.reviewed_at = datetime.now(UTC)
        return self._done(gp)

    def assign_writer(self, gp_id: uuid.UUID, writer_id: uuid.UUID | None) -> GuestPost:
        if not is_manager(self.user):
            raise PermissionDenied()
        gp = self._gp(gp_id)
        gp.content_writer_id = writer_id
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id,
            action="guest_post.writer_assigned", module="guest_post",
            entity_type="guest_post", entity_id=gp.id, new={"writer": str(writer_id) if writer_id else None},
        )
        if writer_id and writer_id != self.user.id:
            self.notifier.notify(
                company_id=self.company_id, user_id=writer_id, type="gp_content_assigned",
                title="Content assigned",
                body=f"You were assigned content writing for '{gp.website_name or 'a guest post'}'.",
                entity_type="guest_post", entity_id=gp.id,
            )
        return self._done(gp)

    def submit_content(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        gp = self._gp(gp_id)
        if not self._can_member(gp):
            raise PermissionDenied()
        self._transition(
            gp, to="content_ready", action="content_completed",
            note=note or "Content completed and submitted for review.",
            notify_users={self._lead_id(gp)},
        )
        return self._done(gp)

    def send_to_client(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        if not is_manager(self.user):
            raise PermissionDenied()
        gp = self._gp(gp_id)
        self._transition(
            gp, to="sent_to_client", action="sent_to_client",
            note=note or "Content sent to client for publishing.",
            notify_users={gp.created_by, gp.assigned_user_id},
        )
        return self._done(gp)

    def mark_published(self, gp_id: uuid.UUID, live_url: str, note: str | None) -> GuestPost:
        if not is_manager(self.user):
            raise PermissionDenied()
        gp = self._gp(gp_id)
        gp.live_link = live_url
        gp.live_link_date = datetime.now(UTC).date()
        gp.status = "published"
        self._transition(
            gp, to="published", action="published",
            note=note or "Live link received from client.",
            notify_users={gp.created_by, gp.assigned_user_id},
        )
        return self._done(gp)

    def request_payment(
        self, gp_id: uuid.UUID, amount: float | None, currency: str | None,
        payment_type: str | None, note: str | None,
    ) -> GuestPost:
        if not is_manager(self.user):
            raise PermissionDenied()
        gp = self._gp(gp_id)
        self._transition(gp, to="payment_requested", action="payment_requested", note=note)
        self._create_payment_ticket(gp, amount, currency, payment_type, note, advance=False)
        return self._done(gp)

    def mark_payment_sent(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        if not is_admin(self.user):
            raise PermissionDenied("Only an admin processes payments")
        gp = self._gp(gp_id)
        self._transition(
            gp, to="payment_sent", action="payment_sent",
            note=note or "Payment has been processed.",
            notify_users={self._lead_id(gp), gp.created_by},
        )
        self._set_payment_status(gp, "paid")
        return self._done(gp)

    def confirm_payment(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        if not is_manager(self.user):
            raise PermissionDenied()
        gp = self._gp(gp_id)
        self._transition(
            gp, to="completed", action="payment_confirmed",
            note=note or "Payment confirmed successfully.", notify_admins=True,
        )
        return self._done(gp)

    def reopen_payment(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        if not is_manager(self.user):
            raise PermissionDenied()
        gp = self._gp(gp_id)
        self._transition(
            gp, to="payment_verification", action="ticket_reopened",
            note=note, notify_admins=True,
        )
        self._set_payment_status(gp, "pending")
        return self._done(gp)

    def approve_advance(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        if not is_admin(self.user):
            raise PermissionDenied("Only an admin approves advance payments")
        gp = self._gp(gp_id)
        self._transition(
            gp, to="content_writing", action="advance_approved",
            note=note or "Advance payment approved.", notify_users={self._lead_id(gp)},
        )
        self._set_payment_status(gp, "paid")
        self._create_content_task(gp)
        return self._done(gp)
