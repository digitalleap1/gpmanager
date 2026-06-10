"""Website DTOs (Module 6)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.website import Website, WebsiteContact, WebsiteMetricsHistory
from app.schemas.lookup import CountryRead, LanguageRead, NicheRead


class WebsiteCreate(BaseModel):
    domain: str = Field(min_length=1, max_length=255)
    name: str | None = Field(default=None, max_length=180)
    main_niche_id: int | None = None
    country_id: int | None = None
    language_id: int | None = None
    traffic: int | None = Field(default=None, ge=0)
    da: int | None = Field(default=None, ge=0, le=100)
    dr: int | None = Field(default=None, ge=0, le=100)
    spam_score: int | None = Field(default=None, ge=0, le=100)
    price: float | None = Field(default=None, ge=0)
    price_currency: str = Field(default="USD", max_length=3)
    email: str | None = Field(default=None, max_length=255)
    contact_person: str | None = Field(default=None, max_length=160)
    guest_post_available: bool = True
    link_insertion_available: bool = False
    homepage_url: str | None = Field(default=None, max_length=500)
    notes: str | None = None
    niche_ids: list[int] | None = None


class WebsiteUpdate(BaseModel):
    domain: str | None = Field(default=None, min_length=1, max_length=255)
    name: str | None = Field(default=None, max_length=180)
    main_niche_id: int | None = None
    country_id: int | None = None
    language_id: int | None = None
    traffic: int | None = Field(default=None, ge=0)
    da: int | None = Field(default=None, ge=0, le=100)
    dr: int | None = Field(default=None, ge=0, le=100)
    spam_score: int | None = Field(default=None, ge=0, le=100)
    price: float | None = Field(default=None, ge=0)
    price_currency: str | None = Field(default=None, max_length=3)
    email: str | None = Field(default=None, max_length=255)
    contact_person: str | None = Field(default=None, max_length=160)
    guest_post_available: bool | None = None
    link_insertion_available: bool | None = None
    homepage_url: str | None = Field(default=None, max_length=500)
    notes: str | None = None
    niche_ids: list[int] | None = None


class ContactCreate(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    email: str | None = Field(default=None, max_length=255)
    role: str | None = Field(default=None, max_length=80)
    is_primary: bool = False


class ContactRead(BaseModel):
    id: uuid.UUID
    name: str | None
    email: str | None
    role: str | None
    is_primary: bool

    @classmethod
    def from_contact(cls, c: WebsiteContact) -> ContactRead:
        return cls(id=c.id, name=c.name, email=c.email, role=c.role, is_primary=c.is_primary)


class MetricRead(BaseModel):
    captured_on: date
    da: int | None
    dr: int | None
    traffic: int | None
    spam_score: int | None

    @classmethod
    def from_row(cls, m: WebsiteMetricsHistory) -> MetricRead:
        return cls(
            captured_on=m.captured_on, da=m.da, dr=m.dr, traffic=m.traffic, spam_score=m.spam_score
        )


class WebsiteListItem(BaseModel):
    id: uuid.UUID
    domain: str
    name: str | None
    main_niche: NicheRead | None
    country: CountryRead | None
    language: LanguageRead | None
    traffic: int | None
    da: int | None
    dr: int | None
    spam_score: int | None
    price: float | None
    price_currency: str
    email: str | None
    contact_person: str | None
    guest_post_available: bool
    link_insertion_available: bool
    homepage_url: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_website(cls, w: Website) -> WebsiteListItem:
        return cls(
            id=w.id,
            domain=w.domain,
            name=w.name,
            main_niche=NicheRead.model_validate(w.main_niche) if w.main_niche else None,
            country=CountryRead.model_validate(w.country) if w.country else None,
            language=LanguageRead.model_validate(w.language) if w.language else None,
            traffic=w.traffic,
            da=w.da,
            dr=w.dr,
            spam_score=w.spam_score,
            price=float(w.price) if w.price is not None else None,
            price_currency=w.price_currency or "USD",
            email=w.email,
            contact_person=w.contact_person,
            guest_post_available=w.guest_post_available,
            link_insertion_available=w.link_insertion_available,
            homepage_url=w.homepage_url,
            created_at=w.created_at,
            updated_at=w.updated_at,
        )


class WebsiteDetail(WebsiteListItem):
    notes: str | None
    niche_ids: list[int]
    contacts: list[ContactRead]
    metrics_history: list[MetricRead]

    @classmethod
    def from_website_detail(cls, w: Website) -> WebsiteDetail:
        base = WebsiteListItem.from_website(w).model_dump()
        return cls(
            **base,
            notes=w.notes,
            niche_ids=[n.id for n in w.niches],
            contacts=[ContactRead.from_contact(c) for c in w.contacts],
            metrics_history=[MetricRead.from_row(m) for m in w.metrics_history],
        )


# Bulk-import result DTOs now live in the shared module so every importer agrees.
from app.schemas.common_bulk import ImportError as ImportError  # noqa: E402,F401
from app.schemas.common_bulk import ImportResult as ImportResult  # noqa: E402,F401
