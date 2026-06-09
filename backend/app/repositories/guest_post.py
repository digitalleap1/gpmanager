"""Guest post persistence queries."""

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, func, or_, select

from app.models.guest_post import GuestPost
from app.repositories.base import BaseRepository

SORT_FIELDS = {
    "created_at": GuestPost.created_at,
    "updated_at": GuestPost.updated_at,
    "status": GuestPost.status,
    "outreach_date": GuestPost.outreach_date,
    "live_link_date": GuestPost.live_link_date,
    "price": GuestPost.price,
}


class GuestPostRepository(BaseRepository[GuestPost]):
    model = GuestPost

    def get_for_company(self, gp_id: uuid.UUID, company_id: uuid.UUID) -> GuestPost | None:
        return self.db.scalars(
            select(GuestPost).where(
                GuestPost.id == gp_id,
                GuestPost.company_id == company_id,
                GuestPost.deleted_at.is_(None),
            )
        ).first()

    def _filtered(
        self,
        company_id: uuid.UUID,
        *,
        project_id: uuid.UUID | None,
        status: str | None,
        assigned_user_id: uuid.UUID | None,
        website_id: uuid.UUID | None,
        search: str | None,
        restrict_to_users: set[uuid.UUID] | None,
    ) -> Select:
        stmt = select(GuestPost).where(
            GuestPost.company_id == company_id, GuestPost.deleted_at.is_(None)
        )
        if project_id:
            stmt = stmt.where(GuestPost.project_id == project_id)
        if status:
            stmt = stmt.where(GuestPost.status == status)
        if assigned_user_id:
            stmt = stmt.where(GuestPost.assigned_user_id == assigned_user_id)
        if website_id:
            stmt = stmt.where(GuestPost.website_id == website_id)
        if search:
            like = f"%{search}%"
            stmt = stmt.where(
                or_(
                    GuestPost.website_name.ilike(like),
                    GuestPost.live_link.ilike(like),
                    GuestPost.contact_email.ilike(like),
                )
            )
        if restrict_to_users is not None:
            stmt = stmt.where(
                or_(
                    GuestPost.assigned_user_id.in_(restrict_to_users),
                    GuestPost.created_by.in_(restrict_to_users),
                )
            )
        return stmt

    def list_guest_posts(
        self,
        company_id: uuid.UUID,
        *,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        assigned_user_id: uuid.UUID | None = None,
        website_id: uuid.UUID | None = None,
        search: str | None = None,
        restrict_to_users: set[uuid.UUID] | None = None,
        sort: str = "-created_at",
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[Sequence[GuestPost], int]:
        filters = dict(
            project_id=project_id,
            status=status,
            assigned_user_id=assigned_user_id,
            website_id=website_id,
            search=search,
            restrict_to_users=restrict_to_users,
        )
        stmt = self._filtered(company_id, **filters)
        descending = sort.startswith("-")
        key = sort[1:] if descending else sort
        column = SORT_FIELDS.get(key, GuestPost.created_at)
        stmt = stmt.order_by(column.desc() if descending else column.asc())
        total = (
            self.db.scalar(
                select(func.count()).select_from(self._filtered(company_id, **filters).subquery())
            )
            or 0
        )
        items = self.db.scalars(stmt.offset(offset).limit(limit)).all()
        return items, total
