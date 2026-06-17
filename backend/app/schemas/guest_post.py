"""Guest Post DTOs (Module 5)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models.guest_post import GuestPost, GuestPostStatusHistory
from app.schemas.refs import UserRef

GUEST_POST_STATUSES = {
    "prospect",
    "contacted",
    "negotiating",
    "accepted",
    "invoice_sent",
    "paid",
    "published",
    "rejected",
}


def _validate_status(value: str) -> str:
    if value not in GUEST_POST_STATUSES:
        raise ValueError(f"status must be one of {sorted(GUEST_POST_STATUSES)}")
    return value


class GuestPostCreate(BaseModel):
    project_id: uuid.UUID
    website_id: uuid.UUID | None = None
    website_name: str | None = Field(default=None, max_length=180)
    da: int | None = Field(default=None, ge=0, le=100)
    pa: int | None = Field(default=None, ge=0, le=100)
    dr: int | None = Field(default=None, ge=0, le=100)
    traffic: int | None = Field(default=None, ge=0)
    price: float | None = Field(default=None, ge=0)
    contact_email: str | None = Field(default=None, max_length=255)
    assigned_user_id: uuid.UUID | None = None
    status: str = "prospect"
    outreach_date: date | None = None
    live_link_date: date | None = None
    live_link: str | None = Field(default=None, max_length=700)
    anchor_text: str | None = Field(default=None, max_length=255)
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        return _validate_status(value)


class GuestPostUpdate(BaseModel):
    project_id: uuid.UUID | None = None
    website_id: uuid.UUID | None = None
    website_name: str | None = Field(default=None, max_length=180)
    da: int | None = Field(default=None, ge=0, le=100)
    pa: int | None = Field(default=None, ge=0, le=100)
    dr: int | None = Field(default=None, ge=0, le=100)
    traffic: int | None = Field(default=None, ge=0)
    price: float | None = Field(default=None, ge=0)
    contact_email: str | None = Field(default=None, max_length=255)
    assigned_user_id: uuid.UUID | None = None
    status: str | None = None
    outreach_date: date | None = None
    live_link_date: date | None = None
    live_link: str | None = Field(default=None, max_length=700)
    anchor_text: str | None = Field(default=None, max_length=255)
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, value: str | None) -> str | None:
        return _validate_status(value) if value is not None else None


class StatusChange(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=255)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        return _validate_status(value)


class PublishRequest(BaseModel):
    live_link: str = Field(min_length=1, max_length=700)
    live_link_date: date | None = None
    anchor_text: str | None = Field(default=None, max_length=255)


class StatusHistoryRead(BaseModel):
    from_status: str | None
    to_status: str
    changed_by: UserRef | None
    note: str | None
    created_at: datetime

    @classmethod
    def from_row(cls, h: GuestPostStatusHistory) -> StatusHistoryRead:
        actor = h.changed_by_user
        return cls(
            from_status=h.from_status,
            to_status=h.to_status,
            changed_by=UserRef(id=actor.id, full_name=actor.full_name) if actor else None,
            note=h.note,
            created_at=h.created_at,
        )


class GuestPostListItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    website_id: uuid.UUID | None
    website_name: str | None
    da: int | None
    pa: int | None
    dr: int | None
    traffic: int | None
    price: float | None
    contact_email: str | None
    assigned_user: UserRef | None
    content_writer: UserRef | None
    added_by: UserRef | None
    status: str
    review_status: str
    workflow_status: str
    outreach_date: date | None
    live_link_date: date | None
    live_link: str | None
    anchor_text: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_gp(cls, gp: GuestPost) -> GuestPostListItem:
        creator = gp.created_by_user
        return cls(
            id=gp.id,
            project_id=gp.project_id,
            project_name=gp.project.name,
            website_id=gp.website_id,
            website_name=gp.website_name,
            da=gp.da,
            pa=gp.pa,
            dr=gp.dr,
            traffic=gp.traffic,
            price=float(gp.price) if gp.price is not None else None,
            contact_email=gp.contact_email,
            assigned_user=(
                UserRef(id=gp.assigned_user.id, full_name=gp.assigned_user.full_name)
                if gp.assigned_user
                else None
            ),
            content_writer=(
                UserRef(id=gp.content_writer.id, full_name=gp.content_writer.full_name)
                if gp.content_writer
                else None
            ),
            added_by=UserRef(id=creator.id, full_name=creator.full_name) if creator else None,
            status=gp.status,
            review_status=gp.review_status,
            workflow_status=gp.workflow_status,
            outreach_date=gp.outreach_date,
            live_link_date=gp.live_link_date,
            live_link=gp.live_link,
            anchor_text=gp.anchor_text,
            created_at=gp.created_at,
            updated_at=gp.updated_at,
        )


class GuestPostDetail(GuestPostListItem):
    notes: str | None
    status_history: list[StatusHistoryRead]

    @classmethod
    def from_gp_detail(cls, gp: GuestPost) -> GuestPostDetail:
        base = GuestPostListItem.from_gp(gp).model_dump()
        return cls(
            **base,
            notes=gp.notes,
            status_history=[StatusHistoryRead.from_row(h) for h in gp.status_history],
        )


class WorkflowAssignReview(BaseModel):
    """Lead assigns the website review to a reviewer (Step 2)."""

    reviewer_id: uuid.UUID | None = None


class ReviewDecision(BaseModel):
    approve: bool
    note: str | None = Field(default=None, max_length=255)
    # When approving a site that needs paying before publish, route via the
    # advance-payment branch instead of straight to content writing.
    advance: bool = False
    # On approve, the reviewer may assign the content writing to someone (else
    # they keep it themselves).
    content_writer_id: uuid.UUID | None = None


class WorkflowVerify(BaseModel):
    """Reviewer verifies the live link (Step 7)."""

    approve: bool
    note: str | None = Field(default=None, max_length=500)


class WorkflowNote(BaseModel):
    """Generic transition with an optional stage comment."""

    note: str | None = Field(default=None, max_length=500)


class WorkflowApproveAdvance(BaseModel):
    note: str | None = Field(default=None, max_length=500)
    content_writer_id: uuid.UUID | None = None


class WorkflowPublish(BaseModel):
    live_url: str = Field(min_length=1, max_length=700)
    note: str | None = Field(default=None, max_length=500)
    # Lead assigns a verifier to check the live link (Step 6).
    verifier_id: uuid.UUID | None = None


class WorkflowPaymentRequest(BaseModel):
    amount: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=3)
    payment_type: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=500)


class WorkflowAssignWriter(BaseModel):
    writer_id: uuid.UUID | None = None


class WorkflowReassign(BaseModel):
    assignee_id: uuid.UUID | None = None


class LinkPaymentRequest(BaseModel):
    """Raise a pending payment for a guest-post link (defaults to its price)."""

    amount: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=3)
    note: str | None = Field(default=None, max_length=500)


class NamedCount(BaseModel):
    name: str
    count: int


class GuestPostStatsRead(BaseModel):
    total: int
    published: int
    pending: int
    this_month: int
    by_user: list[NamedCount]
    by_project: list[NamedCount]
