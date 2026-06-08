"""Payment persistence queries."""

import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import Select, func, or_, select

from app.models.payment import Payment
from app.repositories.base import BaseRepository

SORT_FIELDS = {
    "created_at": Payment.created_at,
    "updated_at": Payment.updated_at,
    "payment_date": Payment.payment_date,
    "amount_usd": Payment.amount_usd,
    "status": Payment.status,
}


class PaymentRepository(BaseRepository[Payment]):
    model = Payment

    def get_for_company(self, payment_id: uuid.UUID, company_id: uuid.UUID) -> Payment | None:
        return self.db.scalars(
            select(Payment).where(Payment.id == payment_id, Payment.company_id == company_id)
        ).first()

    def _filtered(
        self,
        company_id: uuid.UUID,
        *,
        project_id: uuid.UUID | None,
        status: str | None,
        date_from: date | None,
        date_to: date | None,
        search: str | None,
        restrict_user_id: uuid.UUID | None,
    ) -> Select:
        stmt = select(Payment).where(Payment.company_id == company_id)
        if project_id:
            stmt = stmt.where(Payment.project_id == project_id)
        if status:
            stmt = stmt.where(Payment.status == status)
        if date_from:
            stmt = stmt.where(Payment.payment_date >= date_from)
        if date_to:
            stmt = stmt.where(Payment.payment_date <= date_to)
        if search:
            like = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Payment.transaction_id.ilike(like),
                    Payment.live_link.ilike(like),
                    Payment.remarks.ilike(like),
                )
            )
        if restrict_user_id is not None:
            stmt = stmt.where(Payment.created_by == restrict_user_id)
        return stmt

    def list_payments(
        self,
        company_id: uuid.UUID,
        *,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        search: str | None = None,
        restrict_user_id: uuid.UUID | None = None,
        sort: str = "-created_at",
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[Sequence[Payment], int]:
        filters = dict(
            project_id=project_id,
            status=status,
            date_from=date_from,
            date_to=date_to,
            search=search,
            restrict_user_id=restrict_user_id,
        )
        stmt = self._filtered(company_id, **filters)
        descending = sort.startswith("-")
        key = sort[1:] if descending else sort
        column = SORT_FIELDS.get(key, Payment.created_at)
        stmt = stmt.order_by(column.desc() if descending else column.asc())
        total = (
            self.db.scalar(
                select(func.count()).select_from(self._filtered(company_id, **filters).subquery())
            )
            or 0
        )
        items = self.db.scalars(stmt.offset(offset).limit(limit)).all()
        return items, total

    def all_for_export(
        self,
        company_id: uuid.UUID,
        *,
        restrict_user_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        search: str | None = None,
    ) -> Sequence[Payment]:
        stmt = self._filtered(
            company_id,
            project_id=project_id,
            status=status,
            date_from=date_from,
            date_to=date_to,
            search=search,
            restrict_user_id=restrict_user_id,
        ).order_by(Payment.created_at.asc())
        return self.db.scalars(stmt).all()

    def pending_summary(self, company_id: uuid.UUID) -> tuple[int, float]:
        count = (
            self.db.scalar(
                select(func.count())
                .select_from(Payment)
                .where(Payment.company_id == company_id, Payment.status == "pending")
            )
            or 0
        )
        amount = (
            self.db.scalar(
                select(func.coalesce(func.sum(Payment.amount_usd), 0)).where(
                    Payment.company_id == company_id, Payment.status == "pending"
                )
            )
            or 0
        )
        return int(count), float(amount)
