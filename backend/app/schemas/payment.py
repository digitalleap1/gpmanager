"""Payment DTOs (Module 7)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models.payment import Payment, PaymentStatusHistory
from app.schemas.refs import UserRef

PAYMENT_STATUSES = {"pending", "approved", "paid", "failed"}


def _validate_status(value: str) -> str:
    if value not in PAYMENT_STATUSES:
        raise ValueError(f"status must be one of {sorted(PAYMENT_STATUSES)}")
    return value


class PaymentCreate(BaseModel):
    project_id: uuid.UUID | None = None
    website_id: uuid.UUID | None = None
    guest_post_id: uuid.UUID | None = None
    live_link: str | None = Field(default=None, max_length=700)
    amount_usd: float | None = Field(default=None, ge=0)
    amount_inr: float | None = Field(default=None, ge=0)
    invoice_link: str | None = Field(default=None, max_length=700)
    payment_date: date | None = None
    transaction_id: str | None = Field(default=None, max_length=120)
    remarks: str | None = None
    status: str = "pending"

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        return _validate_status(value)


class PaymentUpdate(BaseModel):
    project_id: uuid.UUID | None = None
    website_id: uuid.UUID | None = None
    guest_post_id: uuid.UUID | None = None
    live_link: str | None = Field(default=None, max_length=700)
    amount_usd: float | None = Field(default=None, ge=0)
    amount_inr: float | None = Field(default=None, ge=0)
    invoice_link: str | None = Field(default=None, max_length=700)
    payment_date: date | None = None
    transaction_id: str | None = Field(default=None, max_length=120)
    remarks: str | None = None
    status: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, value: str | None) -> str | None:
        return _validate_status(value) if value is not None else None


class PaymentStatusChange(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=255)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        return _validate_status(value)


class PaymentStatusHistoryRead(BaseModel):
    from_status: str | None
    to_status: str
    changed_by: UserRef | None
    note: str | None
    created_at: datetime

    @classmethod
    def from_row(cls, h: PaymentStatusHistory) -> PaymentStatusHistoryRead:
        actor = h.changed_by_user
        return cls(
            from_status=h.from_status,
            to_status=h.to_status,
            changed_by=UserRef(id=actor.id, full_name=actor.full_name) if actor else None,
            note=h.note,
            created_at=h.created_at,
        )


class PaymentListItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID | None
    project_name: str | None
    website_id: uuid.UUID | None
    website_domain: str | None
    live_link: str | None
    amount_usd: float | None
    amount_inr: float | None
    invoice_link: str | None
    payment_date: date | None
    transaction_id: str | None
    remarks: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_payment(cls, p: Payment) -> PaymentListItem:
        return cls(
            id=p.id,
            project_id=p.project_id,
            project_name=p.project.name if p.project else None,
            website_id=p.website_id,
            website_domain=p.website.domain if p.website else None,
            live_link=p.live_link,
            amount_usd=float(p.amount_usd) if p.amount_usd is not None else None,
            amount_inr=float(p.amount_inr) if p.amount_inr is not None else None,
            invoice_link=p.invoice_link,
            payment_date=p.payment_date,
            transaction_id=p.transaction_id,
            remarks=p.remarks,
            status=p.status,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )


class PaymentDetail(PaymentListItem):
    status_history: list[PaymentStatusHistoryRead]

    @classmethod
    def from_payment_detail(cls, p: Payment) -> PaymentDetail:
        base = PaymentListItem.from_payment(p).model_dump()
        return cls(
            **base,
            status_history=[PaymentStatusHistoryRead.from_row(h) for h in p.status_history],
        )
