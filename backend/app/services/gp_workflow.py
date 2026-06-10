"""Guest Post Project Workflow — a per-ticket state machine with reassignment.

The guest post is a "ticket" whose CURRENT ASSIGNEE (gp.assigned_user_id) flows
between people as it moves through the pipeline:

  Gitanjali (lead) finds a site -> assigns a REVIEWER -> reviewer approves &
  assigns a CONTENT WRITER -> writer submits (back to lead) -> lead sends to
  client -> records live URL & assigns a VERIFIER -> verifier verifies (back to
  lead) -> lead requests payment (to ADMIN) -> admin pays (back to lead) -> lead
  confirms -> completed.   (Plus the advance-payment branch.)

Each transition: validates the from-state + the actor (the current assignee or a
manager), reassigns the ticket, records a status-history entry (the stage
comment) + an activity log, and notifies the people involved — the NEW assignee,
the PREVIOUS assignee, the team lead, and (for payment steps) the admins. Every
notification carries entity_type/entity_id so the UI opens the ticket on click.
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

# Sentinel: "do not change the assignee" (distinct from assigning to None).
_KEEP = object()

LABELS: dict[str, str] = {
    "research": "Research",
    "review_pending": "Website Review Pending",
    "rejected": "Website Rejected",
    "content_writing": "Content Required",
    "content_ready": "Content Ready",
    "sent_to_client": "Sent to Client",
    "verification_pending": "Verification Pending",
    "verified": "Verified — Ready for Payment",
    "verification_failed": "Verification Failed",
    "advance_requested": "Advance Payment Requested",
    "payment_requested": "Payment Requested",
    "payment_sent": "Payment Sent",
    "payment_recheck": "Payment Recheck Required",
    "completed": "Project Completed",
}

# Allowed transitions: target -> set of valid current states.
_FROM: dict[str, set[str]] = {
    "review_pending": {"research", "rejected"},
    "rejected": {"review_pending"},
    "content_writing": {"review_pending", "advance_requested"},
    "advance_requested": {"review_pending"},
    "content_ready": {"content_writing"},
    "sent_to_client": {"content_ready"},
    "verification_pending": {"sent_to_client", "verification_failed"},
    "verified": {"verification_pending"},
    "verification_failed": {"verification_pending"},
    "payment_requested": {"verified"},
    "payment_sent": {"payment_requested", "payment_recheck"},
    "payment_recheck": {"payment_sent"},
    # verified -> completed handles advance-paid tickets (no second payment).
    "completed": {"payment_sent", "verified"},
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

    def _require_manager(self) -> None:
        if not is_manager(self.user):
            raise PermissionDenied("Only team leads or admins can do this")

    def _require_assignee_or_manager(self, gp: GuestPost) -> None:
        if not (is_manager(self.user) or gp.assigned_user_id == self.user.id):
            raise PermissionDenied("Only the assigned user (or a manager) can do this")

    def _transition(
        self,
        gp: GuestPost,
        *,
        to: str,
        action: str,
        note: str | None,
        assign_to: object = _KEEP,
        notify_admins: bool = False,
    ) -> None:
        if gp.workflow_status not in _FROM.get(to, set()):
            raise BadRequest(
                f"Can't move to '{LABELS.get(to, to)}' from "
                f"'{LABELS.get(gp.workflow_status, gp.workflow_status)}'."
            )
        old_status = gp.workflow_status
        prev_assignee = gp.assigned_user_id
        gp.workflow_status = to
        if assign_to is not _KEEP:
            gp.assigned_user_id = assign_to  # type: ignore[assignment]
        new_assignee = gp.assigned_user_id

        self.db.add(
            GuestPostStatusHistory(
                guest_post_id=gp.id, from_status=old_status, to_status=to,
                changed_by=self.user.id, note=note,
            )
        )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id,
            action=f"guest_post.{action}", module="guest_post",
            entity_type="guest_post", entity_id=gp.id,
            new={"to": to, "assignee": str(new_assignee) if new_assignee else None, "note": note},
        )

        title = LABELS.get(to, to)
        site = gp.website_name or "the website"
        body = f"{self.user.full_name}: {title} — '{site}'" + (f". {note}" if note else "")
        # Notify everyone involved: new + previous assignee + team lead + creator.
        recipients = {new_assignee, prev_assignee, self._lead_id(gp), gp.created_by}
        for uid in recipients - {self.user.id, None}:
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

    def _create_payment_ticket(
        self, gp: GuestPost, amount: float | None, currency: str | None,
        payment_type: str | None, note: str | None, advance: bool,
    ) -> Payment:
        kind = "Advance payment" if advance else "Payment"
        remarks = f"{kind} request via guest-post workflow." + (f" {note}" if note else "")
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

    # --- Step 2: lead assigns the website review to a reviewer ---
    def submit_for_review(
        self, gp_id: uuid.UUID, reviewer_id: uuid.UUID | None = None
    ) -> GuestPost:
        gp = self._gp(gp_id)
        if not (is_manager(self.user) or gp.created_by == self.user.id):
            raise PermissionDenied()
        self._transition(
            gp, to="review_pending", action="review_assigned", note=None, assign_to=reviewer_id
        )
        gp.review_status = "submitted"
        return self._done(gp)

    # --- Step 3: reviewer approves (assigns a writer) or rejects (back to lead) ---
    def review(
        self,
        gp_id: uuid.UUID,
        approve: bool,
        note: str | None,
        advance: bool = False,
        content_writer_id: uuid.UUID | None = None,
    ) -> GuestPost:
        gp = self._gp(gp_id)
        self._require_assignee_or_manager(gp)
        if not approve:
            self._transition(
                gp, to="rejected", action="rejected", note=note, assign_to=self._lead_id(gp)
            )
            gp.review_status = "rejected"
        elif advance:
            self._transition(
                gp, to="advance_requested", action="advance_requested", note=note,
                assign_to=None, notify_admins=True,
            )
            gp.review_status = "approved"
            self._create_payment_ticket(gp, None, "USD", None, note, advance=True)
        else:
            # The reviewer creates content themselves OR assigns a writer.
            gp.content_writer_id = content_writer_id or self.user.id
            self._transition(
                gp, to="content_writing", action="approved", note=note,
                assign_to=gp.content_writer_id,
            )
            gp.review_status = "approved"
            self._create_content_task(gp)
        gp.reviewed_by = self.user.id
        gp.reviewed_at = datetime.now(UTC)
        return self._done(gp)

    # --- Step 4: content writer submits -> back to lead ---
    def submit_content(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        gp = self._gp(gp_id)
        self._require_assignee_or_manager(gp)
        self._transition(
            gp, to="content_ready", action="content_completed",
            note=note or "Content completed and submitted for review.",
            assign_to=self._lead_id(gp),
        )
        return self._done(gp)

    # --- Step 5: lead sends content to the client ---
    def send_to_client(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        self._require_manager()
        gp = self._gp(gp_id)
        self._transition(
            gp, to="sent_to_client", action="sent_to_client",
            note=note or "Content sent to client for publishing.",
            assign_to=self._lead_id(gp),
        )
        return self._done(gp)

    # --- Step 6: lead records the live URL + assigns a verifier ---
    def mark_published(
        self, gp_id: uuid.UUID, live_url: str, note: str | None,
        verifier_id: uuid.UUID | None = None,
    ) -> GuestPost:
        self._require_manager()
        gp = self._gp(gp_id)
        gp.live_link = live_url
        gp.live_link_date = datetime.now(UTC).date()
        gp.status = "published"
        self._transition(
            gp, to="verification_pending", action="live_link_received",
            note=note or "Live link received from client.", assign_to=verifier_id,
        )
        return self._done(gp)

    # --- Step 7: verifier checks the live link -> back to lead ---
    def verify(self, gp_id: uuid.UUID, approve: bool, note: str | None) -> GuestPost:
        gp = self._gp(gp_id)
        self._require_assignee_or_manager(gp)
        if approve:
            self._transition(
                gp, to="verified", action="verified",
                note=note or "Live link verified.", assign_to=self._lead_id(gp),
            )
        else:
            self._transition(
                gp, to="verification_failed", action="verification_failed",
                note=note or "Live link verification failed.", assign_to=self._lead_id(gp),
            )
        return self._done(gp)

    # --- Step 8: lead requests payment -> to admin ---
    def request_payment(
        self, gp_id: uuid.UUID, amount: float | None, currency: str | None,
        payment_type: str | None, note: str | None,
    ) -> GuestPost:
        self._require_manager()
        gp = self._gp(gp_id)
        self._transition(
            gp, to="payment_requested", action="payment_requested", note=note,
            assign_to=None, notify_admins=True,
        )
        self._create_payment_ticket(gp, amount, currency, payment_type, note, advance=False)
        return self._done(gp)

    # --- Step 9: admin pays -> back to lead ---
    def mark_payment_sent(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        if not is_admin(self.user):
            raise PermissionDenied("Only an admin processes payments")
        gp = self._gp(gp_id)
        self._transition(
            gp, to="payment_sent", action="payment_sent",
            note=note or "Payment has been processed.", assign_to=self._lead_id(gp),
        )
        self._set_payment_status(gp, "paid")
        return self._done(gp)

    # --- Step 10: lead confirms (done) or reopens (back to admin) ---
    def confirm_payment(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        self._require_manager()
        gp = self._gp(gp_id)
        self._transition(
            gp, to="completed", action="payment_confirmed",
            note=note or "Payment confirmed successfully.", assign_to=None, notify_admins=True,
        )
        return self._done(gp)

    def reopen_payment(self, gp_id: uuid.UUID, note: str | None) -> GuestPost:
        self._require_manager()
        gp = self._gp(gp_id)
        self._transition(
            gp, to="payment_recheck", action="ticket_reopened", note=note,
            assign_to=None, notify_admins=True,
        )
        self._set_payment_status(gp, "pending")
        return self._done(gp)

    # --- Advance branch: admin approves the advance -> content writing ---
    def approve_advance(
        self, gp_id: uuid.UUID, note: str | None,
        content_writer_id: uuid.UUID | None = None,
    ) -> GuestPost:
        if not is_admin(self.user):
            raise PermissionDenied("Only an admin approves advance payments")
        gp = self._gp(gp_id)
        gp.content_writer_id = content_writer_id or gp.content_writer_id
        self._transition(
            gp, to="content_writing", action="advance_approved",
            note=note or "Advance payment approved.",
            assign_to=gp.content_writer_id or self._lead_id(gp),
        )
        self._set_payment_status(gp, "paid")
        self._create_content_task(gp)
        return self._done(gp)

    # --- (re)assign the content writer ---
    def assign_writer(self, gp_id: uuid.UUID, writer_id: uuid.UUID | None) -> GuestPost:
        self._require_manager()
        gp = self._gp(gp_id)
        gp.content_writer_id = writer_id
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="guest_post.writer_assigned",
            module="guest_post", entity_type="guest_post", entity_id=gp.id,
            new={"writer": str(writer_id) if writer_id else None},
        )
        if writer_id and writer_id != self.user.id:
            self.notifier.notify(
                company_id=self.company_id, user_id=writer_id, type="gp_content_assigned",
                title="Content assigned",
                body=f"You were assigned content writing for '{gp.website_name or 'a guest post'}'.",
                entity_type="guest_post", entity_id=gp.id,
            )
        return self._done(gp)

    # --- generic reassign (manager moves the ticket to someone else) ---
    def reassign(self, gp_id: uuid.UUID, assignee_id: uuid.UUID | None) -> GuestPost:
        self._require_manager()
        gp = self._gp(gp_id)
        prev = gp.assigned_user_id
        gp.assigned_user_id = assignee_id
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="guest_post.reassigned",
            module="guest_post", entity_type="guest_post", entity_id=gp.id,
            new={"assignee": str(assignee_id) if assignee_id else None},
        )
        for uid in {assignee_id, prev} - {self.user.id, None}:
            self.notifier.notify(
                company_id=self.company_id, user_id=uid, type="gp_reassigned",
                title="Ticket reassigned",
                body=f"{self.user.full_name} reassigned '{gp.website_name or 'a guest post'}'.",
                entity_type="guest_post", entity_id=gp.id,
            )
        return self._done(gp)
