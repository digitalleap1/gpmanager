"""Payment DTOs (Module 7)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.currencies import CURRENCY_CODES, DEFAULT_CURRENCY
from app.models.payment import Payment, PaymentComment, PaymentStatusHistory
from app.schemas.refs import UserRef

PAYMENT_STATUSES = {"pending", "negotiation", "paid", "free", "cancelled", "rejected"}


def _validate_status(value: str) -> str:
    if value not in PAYMENT_STATUSES:
        raise ValueError(f"status must be one of {sorted(PAYMENT_STATUSES)}")
    return value


def _validate_currency(value: str | None) -> str | None:
    if value is None:
        return None
    code = value.upper()
    if code not in CURRENCY_CODES:
        raise ValueError(f"currency must be one of {sorted(CURRENCY_CODES)}")
    return code


class PaymentCreate(BaseModel):
    client_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    website_id: uuid.UUID | None = None
    guest_post_id: uuid.UUID | None = None
    attributed_to_id: uuid.UUID | None = None
    via: str | None = Field(default=None, max_length=20)
    invoice_number: str | None = Field(default=None, max_length=120)
    live_link: str | None = Field(default=None, max_length=700)
    # Native charge currency + amount, plus a manual rate to USD. amount_usd is
    # derived from amount * fx_to_usd when amount is given (else taken as posted).
    currency: str = DEFAULT_CURRENCY
    amount: float | None = Field(default=None, ge=0)
    fx_to_usd: float | None = Field(default=None, gt=0)
    amount_usd: float | None = Field(default=None, ge=0)
    amount_inr: float | None = Field(default=None, ge=0)
    mode_of_payment: str | None = Field(default=None, max_length=255)
    notified: bool = False
    invoice_link: str | None = Field(default=None, max_length=700)
    payment_date: date | None = None
    transaction_id: str | None = Field(default=None, max_length=120)
    remarks: str | None = None
    status: str = "pending"

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        return _validate_status(value)

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str) -> str:
        return _validate_currency(value) or DEFAULT_CURRENCY


class PaymentUpdate(BaseModel):
    client_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    website_id: uuid.UUID | None = None
    guest_post_id: uuid.UUID | None = None
    attributed_to_id: uuid.UUID | None = None
    via: str | None = Field(default=None, max_length=20)
    invoice_number: str | None = Field(default=None, max_length=120)
    live_link: str | None = Field(default=None, max_length=700)
    currency: str | None = None
    amount: float | None = Field(default=None, ge=0)
    fx_to_usd: float | None = Field(default=None, gt=0)
    amount_usd: float | None = Field(default=None, ge=0)
    amount_inr: float | None = Field(default=None, ge=0)
    mode_of_payment: str | None = Field(default=None, max_length=255)
    notified: bool | None = None
    invoice_link: str | None = Field(default=None, max_length=700)
    payment_date: date | None = None
    transaction_id: str | None = Field(default=None, max_length=120)
    remarks: str | None = None
    status: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, value: str | None) -> str | None:
        return _validate_status(value) if value is not None else None

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return _validate_currency(value)


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
    client_id: uuid.UUID | None
    client_name: str | None
    project_id: uuid.UUID | None
    project_name: str | None
    website_id: uuid.UUID | None
    website_domain: str | None
    attributed_to: UserRef | None
    via: str | None
    live_link: str | None
    currency: str
    amount: float | None
    fx_to_usd: float | None
    amount_usd: float | None
    amount_inr: float | None
    mode_of_payment: str | None
    invoice_number: str | None
    notified: bool
    invoice_link: str | None
    payment_date: date | None
    transaction_id: str | None
    remarks: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_payment(cls, p: Payment) -> PaymentListItem:
        attributed = p.attributed_to
        return cls(
            id=p.id,
            client_id=p.client_id,
            client_name=p.client.name if p.client else None,
            project_id=p.project_id,
            project_name=p.project.name if p.project else None,
            website_id=p.website_id,
            website_domain=p.website.domain if p.website else None,
            attributed_to=UserRef(id=attributed.id, full_name=attributed.full_name) if attributed else None,
            via=p.via,
            live_link=p.live_link,
            currency=p.currency or "USD",
            amount=float(p.amount) if p.amount is not None else None,
            fx_to_usd=float(p.fx_to_usd) if p.fx_to_usd is not None else None,
            amount_usd=float(p.amount_usd) if p.amount_usd is not None else None,
            amount_inr=float(p.amount_inr) if p.amount_inr is not None else None,
            mode_of_payment=p.mode_of_payment,
            invoice_number=p.invoice_number,
            notified=p.notified,
            invoice_link=p.invoice_link,
            payment_date=p.payment_date,
            transaction_id=p.transaction_id,
            remarks=p.remarks,
            status=p.status,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )


class PaymentCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class PaymentCommentRead(BaseModel):
    id: uuid.UUID
    author: UserRef | None
    body: str
    created_at: datetime

    @classmethod
    def from_comment(cls, c: PaymentComment) -> PaymentCommentRead:
        return cls(
            id=c.id,
            author=UserRef(id=c.author.id, full_name=c.author.full_name) if c.author else None,
            body=c.body,
            created_at=c.created_at,
        )


class PaymentDetail(PaymentListItem):
    status_history: list[PaymentStatusHistoryRead]
    comments: list[PaymentCommentRead]

    @classmethod
    def from_payment_detail(cls, p: Payment) -> PaymentDetail:
        base = PaymentListItem.from_payment(p).model_dump()
        return cls(
            **base,
            status_history=[PaymentStatusHistoryRead.from_row(h) for h in p.status_history],
            comments=[PaymentCommentRead.from_comment(c) for c in p.comments],
        )
