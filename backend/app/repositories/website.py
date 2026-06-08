"""Website persistence queries."""

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, func, or_, select

from app.models.website import Website, website_niches
from app.repositories.base import BaseRepository

SORT_FIELDS = {
    "created_at": Website.created_at,
    "updated_at": Website.updated_at,
    "domain": Website.domain,
    "dr": Website.dr,
    "da": Website.da,
    "traffic": Website.traffic,
    "price": Website.price,
}


class WebsiteRepository(BaseRepository[Website]):
    model = Website

    def get_for_company(self, website_id: uuid.UUID, company_id: uuid.UUID) -> Website | None:
        return self.db.scalars(
            select(Website).where(Website.id == website_id, Website.company_id == company_id)
        ).first()

    def get_by_domain(self, domain: str, company_id: uuid.UUID) -> Website | None:
        return self.db.scalars(
            select(Website).where(
                Website.domain == domain.lower(), Website.company_id == company_id
            )
        ).first()

    def _filtered(
        self,
        company_id: uuid.UUID,
        *,
        search: str | None,
        country_id: int | None,
        niche_id: int | None,
        min_dr: int | None,
        max_dr: int | None,
        min_traffic: int | None,
        max_price: float | None,
        guest_post_available: bool | None,
        restrict_to_users: set[uuid.UUID] | None = None,
    ) -> Select:
        stmt = select(Website).where(Website.company_id == company_id)
        if restrict_to_users is not None:
            stmt = stmt.where(Website.created_by.in_(restrict_to_users))
        if search:
            like = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Website.domain.ilike(like),
                    Website.name.ilike(like),
                    Website.email.ilike(like),
                )
            )
        if country_id:
            stmt = stmt.where(Website.country_id == country_id)
        if niche_id:
            niche_sq = select(website_niches.c.website_id).where(
                website_niches.c.niche_id == niche_id
            )
            stmt = stmt.where(
                or_(Website.main_niche_id == niche_id, Website.id.in_(niche_sq))
            )
        if min_dr is not None:
            stmt = stmt.where(Website.dr >= min_dr)
        if max_dr is not None:
            stmt = stmt.where(Website.dr <= max_dr)
        if min_traffic is not None:
            stmt = stmt.where(Website.traffic >= min_traffic)
        if max_price is not None:
            stmt = stmt.where(Website.price <= max_price)
        if guest_post_available is not None:
            stmt = stmt.where(Website.guest_post_available.is_(guest_post_available))
        return stmt

    def list_websites(
        self,
        company_id: uuid.UUID,
        *,
        search: str | None = None,
        country_id: int | None = None,
        niche_id: int | None = None,
        min_dr: int | None = None,
        max_dr: int | None = None,
        min_traffic: int | None = None,
        max_price: float | None = None,
        guest_post_available: bool | None = None,
        restrict_to_users: set[uuid.UUID] | None = None,
        sort: str = "-created_at",
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[Sequence[Website], int]:
        filters = dict(
            search=search,
            country_id=country_id,
            niche_id=niche_id,
            min_dr=min_dr,
            max_dr=max_dr,
            min_traffic=min_traffic,
            max_price=max_price,
            guest_post_available=guest_post_available,
            restrict_to_users=restrict_to_users,
        )
        stmt = self._filtered(company_id, **filters)
        descending = sort.startswith("-")
        key = sort[1:] if descending else sort
        column = SORT_FIELDS.get(key, Website.created_at)
        stmt = stmt.order_by(column.desc() if descending else column.asc())
        total = (
            self.db.scalar(
                select(func.count()).select_from(self._filtered(company_id, **filters).subquery())
            )
            or 0
        )
        items = self.db.scalars(stmt.offset(offset).limit(limit)).all()
        return items, total

    def all_for_export(self, company_id: uuid.UUID, **filters) -> Sequence[Website]:
        stmt = self._filtered(company_id, **filters).order_by(Website.domain)
        return self.db.scalars(stmt).all()
