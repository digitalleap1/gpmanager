"""Website Database logic (Module 6): CRUD, contacts, niche links, CSV import/export."""

from __future__ import annotations  # lazy annotations: the `list` method must not shadow list[...]

import csv
import io
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_manager
from app.models.lookups import Country, Language, Niche
from app.models.user import User
from app.models.website import Website, WebsiteContact
from app.repositories.website import WebsiteRepository
from app.schemas.website import (
    ContactCreate,
    ImportError as ImportErrorRow,
    ImportResult,
    WebsiteCreate,
    WebsiteUpdate,
)
from app.services.activity import ActivityLogger, jsonable

CSV_COLUMNS = [
    "domain", "name", "main_niche", "country", "language", "traffic", "da", "dr",
    "spam_score", "price", "email", "contact_person", "guest_post_available",
    "link_insertion_available", "homepage_url", "notes",
]

_TRUE = {"1", "true", "yes", "y", "t"}


def _to_bool(value: str) -> bool:
    return value.strip().lower() in _TRUE


class WebsiteService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.websites = WebsiteRepository(db)
        self.activity = ActivityLogger(db)

    def list(self, **filters) -> tuple[list[Website], int]:
        items, total = self.websites.list_websites(self.company_id, **filters)
        return list(items), total

    def get(self, website_id: uuid.UUID) -> Website:
        w = self.websites.get_for_company(website_id, self.company_id)
        if w is None:
            raise NotFound("Website not found")
        return w

    def _set_niches(self, w: Website, niche_ids: list[int] | None) -> None:
        if niche_ids is None:
            return
        niches = (
            self.db.scalars(select(Niche).where(Niche.id.in_(niche_ids))).all()
            if niche_ids
            else []
        )
        w.niches = list(niches)

    def create(self, data: WebsiteCreate) -> Website:
        domain = data.domain.strip().lower()
        if self.websites.get_by_domain(domain, self.company_id) is not None:
            raise BadRequest(f"A website with domain '{domain}' already exists")
        payload = data.model_dump(exclude={"niche_ids"})
        payload["domain"] = domain
        w = Website(company_id=self.company_id, created_by=self.user.id, **payload)
        self.db.add(w)
        self.db.flush()
        self._set_niches(w, data.niche_ids)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="website.created",
            module="website",
            entity_type="website",
            entity_id=w.id,
            new={"domain": w.domain},
        )
        self.db.commit()
        self.db.refresh(w)
        return w

    def update(self, website_id: uuid.UUID, data: WebsiteUpdate) -> Website:
        w = self.get(website_id)
        changes = data.model_dump(exclude_unset=True)
        set_niches = "niche_ids" in changes
        niche_ids = changes.pop("niche_ids", None)
        if "domain" in changes:
            new_domain = changes["domain"].strip().lower()
            other = self.websites.get_by_domain(new_domain, self.company_id)
            if other is not None and other.id != w.id:
                raise BadRequest(f"A website with domain '{new_domain}' already exists")
            changes["domain"] = new_domain
        old = {key: getattr(w, key) for key in changes}
        for key, value in changes.items():
            setattr(w, key, value)
        if set_niches:
            self._set_niches(w, niche_ids or [])
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="website.updated",
            module="website",
            entity_type="website",
            entity_id=w.id,
            old=jsonable(old),
            new=jsonable(changes),
        )
        self.db.commit()
        self.db.refresh(w)
        return w

    def delete(self, website_id: uuid.UUID) -> None:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can delete websites")
        w = self.get(website_id)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="website.deleted",
            module="website",
            entity_type="website",
            entity_id=w.id,
            old={"domain": w.domain},
        )
        self.websites.delete(w)
        self.db.commit()

    # --- contacts ---
    def add_contact(self, website_id: uuid.UUID, data: ContactCreate) -> WebsiteContact:
        w = self.get(website_id)
        contact = WebsiteContact(
            website_id=w.id,
            name=data.name,
            email=data.email,
            role=data.role,
            is_primary=data.is_primary,
        )
        self.db.add(contact)
        self.db.commit()
        self.db.refresh(contact)
        return contact

    def remove_contact(self, website_id: uuid.UUID, contact_id: uuid.UUID) -> None:
        w = self.get(website_id)
        contact = self.db.get(WebsiteContact, contact_id)
        if contact is None or contact.website_id != w.id:
            raise NotFound("Contact not found")
        self.db.delete(contact)
        self.db.commit()

    # --- CSV ---
    def export_csv(self, **filters) -> str:
        rows = self.websites.all_for_export(self.company_id, **filters)
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(CSV_COLUMNS)
        for w in rows:
            writer.writerow(
                [
                    w.domain,
                    w.name or "",
                    w.main_niche.name if w.main_niche else "",
                    w.country.iso_code if w.country else "",
                    w.language.iso_code if w.language else "",
                    "" if w.traffic is None else w.traffic,
                    "" if w.da is None else w.da,
                    "" if w.dr is None else w.dr,
                    "" if w.spam_score is None else w.spam_score,
                    "" if w.price is None else float(w.price),
                    w.email or "",
                    w.contact_person or "",
                    "true" if w.guest_post_available else "false",
                    "true" if w.link_insertion_available else "false",
                    w.homepage_url or "",
                    w.notes or "",
                ]
            )
        return buf.getvalue()

    def import_csv(self, content: bytes) -> ImportResult:
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise BadRequest("File must be UTF-8 encoded CSV") from exc
        reader = csv.DictReader(io.StringIO(text))
        headers = [(h or "").strip().lower() for h in (reader.fieldnames or [])]
        if "domain" not in headers:
            raise BadRequest("CSV must include a 'domain' column")

        niches = {n.name.lower(): n for n in self.db.scalars(select(Niche)).all()}
        countries = self.db.scalars(select(Country)).all()
        c_iso = {c.iso_code.lower(): c for c in countries}
        c_name = {c.name.lower(): c for c in countries}
        langs = self.db.scalars(select(Language)).all()
        l_iso = {x.iso_code.lower(): x for x in langs}
        l_name = {x.name.lower(): x for x in langs}

        created = 0
        updated = 0
        errors: list[ImportErrorRow] = []
        for i, raw in enumerate(reader, start=2):  # header is row 1
            row = {(k or "").strip().lower(): (v or "") for k, v in raw.items()}
            try:
                was_created = self._upsert_row(row, niches, c_iso, c_name, l_iso, l_name)
                if was_created:
                    created += 1
                else:
                    updated += 1
            except Exception as exc:  # noqa: BLE001 - per-row isolation
                errors.append(ImportErrorRow(row=i, message=str(exc)))

        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="website.imported",
            module="website",
            entity_type="website",
            entity_id=None,
            new={"created": created, "updated": updated, "errors": len(errors)},
        )
        self.db.commit()
        return ImportResult(created=created, updated=updated, errors=errors)

    def _upsert_row(self, row, niches, c_iso, c_name, l_iso, l_name) -> bool:
        domain = row.get("domain", "").strip().lower()
        if not domain:
            raise ValueError("domain is required")

        def s(key: str) -> str:
            return row.get(key, "").strip()

        with self.db.begin_nested():
            existing = self.websites.get_by_domain(domain, self.company_id)
            w = existing or Website(
                company_id=self.company_id, created_by=self.user.id, domain=domain
            )
            if existing is None:
                self.db.add(w)
            if s("name"):
                w.name = s("name")
            niche = niches.get(s("main_niche").lower())
            if niche:
                w.main_niche_id = niche.id
            country = c_iso.get(s("country").lower()) or c_name.get(s("country").lower())
            if country:
                w.country_id = country.id
            language = l_iso.get(s("language").lower()) or l_name.get(s("language").lower())
            if language:
                w.language_id = language.id
            if s("traffic"):
                w.traffic = int(s("traffic"))
            if s("da"):
                w.da = int(s("da"))
            if s("dr"):
                w.dr = int(s("dr"))
            if s("spam_score"):
                w.spam_score = int(s("spam_score"))
            if s("price"):
                w.price = float(s("price"))
            if s("email"):
                w.email = s("email")
            if s("contact_person"):
                w.contact_person = s("contact_person")
            if s("guest_post_available"):
                w.guest_post_available = _to_bool(s("guest_post_available"))
            if s("link_insertion_available"):
                w.link_insertion_available = _to_bool(s("link_insertion_available"))
            if s("homepage_url"):
                w.homepage_url = s("homepage_url")
            if s("notes"):
                w.notes = s("notes")
            self.db.flush()
        return existing is None
