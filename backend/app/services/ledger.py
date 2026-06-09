"""Payments-ledger dashboard rollups (Phase 2).

Computes Monthly Revenue, Pending, Overdue, Client-wise and Team-wise revenue
from the payments table. Revenue = paid amount_usd. "Overdue" = a still-pending
payment whose payment_date is already in the past. Managers only.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import PermissionDenied
from app.core.permissions import is_manager
from app.core.scope import accessible_user_ids
from app.models.client import Client
from app.models.payment import Payment
from app.models.user import User
from app.schemas.ledger import (
    LedgerStats,
    MonthlyRevenuePoint,
    NamedRevenue,
    StatusBreakdown,
)


class LedgerService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id

    def stats(self, months: int = 12, top: int = 10) -> LedgerStats:
        if not is_manager(self.user):
            raise PermissionDenied()
        company = self.company_id
        today = datetime.now(UTC).date()

        # Common filters: company, not-trashed, and RBAC scope (non-admins only
        # see payments they created or are attributed to).
        base = [Payment.company_id == company, Payment.deleted_at.is_(None)]
        scope = accessible_user_ids(self.db, self.user)
        if scope is not None:
            base.append(
                or_(
                    Payment.created_by.in_(scope),
                    Payment.attributed_to_id.in_(scope),
                )
            )

        # Paid payments -> total + monthly revenue.
        paid = self.db.execute(
            select(Payment.payment_date, Payment.amount_usd).where(
                *base, Payment.status == "paid"
            )
        ).all()
        total_revenue = 0.0
        monthly: dict[tuple[int, int], float] = defaultdict(float)
        for pay_date, amount in paid:
            value = float(amount or 0)
            total_revenue += value
            if pay_date is not None:
                monthly[(pay_date.year, pay_date.month)] += value
        monthly_revenue = [
            MonthlyRevenuePoint(year=y, month=m, revenue=round(v, 2))
            for (y, m), v in sorted(monthly.items())
        ][-months:]

        # Pending + overdue (pending & payment_date in the past).
        pending_count = (
            self.db.scalar(
                select(func.count()).select_from(Payment).where(
                    *base, Payment.status == "pending"
                )
            )
            or 0
        )
        pending_amount = float(
            self.db.scalar(
                select(func.coalesce(func.sum(Payment.amount_usd), 0)).where(
                    *base, Payment.status == "pending"
                )
            )
            or 0
        )
        overdue_count = (
            self.db.scalar(
                select(func.count()).select_from(Payment).where(
                    *base,
                    Payment.status == "pending",
                    Payment.payment_date.is_not(None),
                    Payment.payment_date < today,
                )
            )
            or 0
        )
        overdue_amount = float(
            self.db.scalar(
                select(func.coalesce(func.sum(Payment.amount_usd), 0)).where(
                    *base,
                    Payment.status == "pending",
                    Payment.payment_date.is_not(None),
                    Payment.payment_date < today,
                )
            )
            or 0
        )

        # Client-wise revenue (paid).
        client_rows = self.db.execute(
            select(Client.id, Client.name, func.coalesce(func.sum(Payment.amount_usd), 0))
            .join(Payment, Payment.client_id == Client.id)
            .where(*base, Payment.status == "paid")
            .group_by(Client.id, Client.name)
            .order_by(func.coalesce(func.sum(Payment.amount_usd), 0).desc())
            .limit(top)
        ).all()
        client_revenue = [
            NamedRevenue(id=row[0], name=row[1], revenue=round(float(row[2]), 2))
            for row in client_rows
        ]

        # Team-wise revenue (paid, by attributed member).
        team_rows = self.db.execute(
            select(User.id, User.full_name, func.coalesce(func.sum(Payment.amount_usd), 0))
            .join(Payment, Payment.attributed_to_id == User.id)
            .where(*base, Payment.status == "paid")
            .group_by(User.id, User.full_name)
            .order_by(func.coalesce(func.sum(Payment.amount_usd), 0).desc())
            .limit(top)
        ).all()
        team_revenue = [
            NamedRevenue(id=row[0], name=row[1], revenue=round(float(row[2]), 2))
            for row in team_rows
        ]

        # Status breakdown (count + amount per status).
        status_rows = self.db.execute(
            select(
                Payment.status,
                func.count(),
                func.coalesce(func.sum(Payment.amount_usd), 0),
            )
            .where(*base)
            .group_by(Payment.status)
        ).all()
        status_breakdown = [
            StatusBreakdown(status=row[0], count=int(row[1]), amount=round(float(row[2]), 2))
            for row in status_rows
        ]

        return LedgerStats(
            total_revenue=round(total_revenue, 2),
            pending_count=int(pending_count),
            pending_amount=round(pending_amount, 2),
            overdue_count=int(overdue_count),
            overdue_amount=round(overdue_amount, 2),
            monthly_revenue=monthly_revenue,
            client_revenue=client_revenue,
            team_revenue=team_revenue,
            status_breakdown=status_breakdown,
        )
