"""Client DTOs (Phase 2 payments ledger)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.currencies import CURRENCY_CODES, DEFAULT_CURRENCY

CLIENT_STATUSES = {"active", "inactive"}


def _currency(value: str | None) -> str | None:
    if value is None:
        return None
    code = value.upper()
    if code not in CURRENCY_CODES:
        raise ValueError(f"currency must be one of {sorted(CURRENCY_CODES)}")
    return code


class ClientMetrics(BaseModel):
    """Derived (never stored) money + project rollups for a client."""

    total_budget: float
    total_paid: float
    consumed_budget: float
    remaining_budget: float
    pending_amount: float
    revenue: float
    project_count: int
    active_projects: int
    completed_projects: int
    payment_count: int


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    currency: str = DEFAULT_CURRENCY
    total_budget: float = Field(default=0, ge=0)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=40)
    website: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    status: str = "active"

    @field_validator("currency")
    @classmethod
    def _cur(cls, v: str) -> str:
        return _currency(v) or DEFAULT_CURRENCY


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    currency: str | None = None
    total_budget: float | None = Field(default=None, ge=0)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=40)
    website: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    status: str | None = None

    @field_validator("currency")
    @classmethod
    def _cur(cls, v: str | None) -> str | None:
        return _currency(v)

    @field_validator("status")
    @classmethod
    def _status(cls, v: str | None) -> str | None:
        if v is not None and v not in CLIENT_STATUSES:
            raise ValueError(f"status must be one of {sorted(CLIENT_STATUSES)}")
        return v


class ClientListItem(BaseModel):
    id: uuid.UUID
    name: str
    currency: str
    status: str
    total_budget: float
    total_paid: float
    remaining_budget: float
    project_count: int
    created_at: datetime


class ClientDetail(BaseModel):
    id: uuid.UUID
    name: str
    currency: str
    status: str
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    website: str | None
    notes: str | None
    created_at: datetime
    metrics: ClientMetrics
