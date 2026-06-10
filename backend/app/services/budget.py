"""Budget Management (per project): a budget period + amount, an increase/decrease
approval workflow, and a consumption summary with cost-per-link / cost-per-website.

Spent + pending are computed from the project's payments (paid / pending), so the
numbers always reflect reality rather than a manually-maintained counter.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_admin, is_manager
from app.core.scope import accessible_project_ids
from app.models.guest_post import GuestPost
from app.models.payment import Payment
from app.models.project import BudgetAdjustment, Project
from app.models.user import User
from app.services.activity import ActivityLogger
from app.services.notification import Notifier

BUDGET_PERIODS = {"monthly", "weekly", "daily"}


class BudgetService:
    def __init__(self, db: Session, user: User) -> None:
        if not is_manager(user):
            raise PermissionDenied("Budgets are managed by team leads and admins")
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.activity = ActivityLogger(db)
        self.notifier = Notifier(db)

    def _project(self, project_id: uuid.UUID) -> Project:
        p = self.db.get(Project, project_id)
        if p is None or p.company_id != self.company_id or p.deleted_at is not None:
            raise NotFound("Project not found")
        pids = accessible_project_ids(self.db, self.user)
        if pids is not None and p.id not in pids:
            raise NotFound("Project not found")
        return p

    # ----- summary / consumption -----
    def summary(self, project_id: uuid.UUID) -> dict:
        p = self._project(project_id)
        cid = self.company_id

        def _sum(status: str) -> float:
            return float(
                self.db.scalar(
                    select(func.coalesce(func.sum(Payment.amount_usd), 0)).where(
                        Payment.company_id == cid,
                        Payment.project_id == p.id,
                        Payment.deleted_at.is_(None),
                        Payment.status == status,
                    )
                )
                or 0
            )

        spent = _sum("paid")
        pending = _sum("pending")
        links_published = int(
            self.db.scalar(
                select(func.count()).select_from(GuestPost).where(
                    GuestPost.company_id == cid,
                    GuestPost.project_id == p.id,
                    GuestPost.status == "published",
                    GuestPost.deleted_at.is_(None),
                )
            )
            or 0
        )
        websites_count = int(
            self.db.scalar(
                select(func.count(func.distinct(GuestPost.website_id))).where(
                    GuestPost.company_id == cid,
                    GuestPost.project_id == p.id,
                    GuestPost.status == "published",
                    GuestPost.deleted_at.is_(None),
                    GuestPost.website_id.is_not(None),
                )
            )
            or 0
        )
        budget = float(p.monthly_budget or 0)
        remaining = budget - spent
        return {
            "project_id": p.id,
            "project_name": p.name,
            "currency": p.budget_currency,
            "period": p.budget_period,
            "start_date": p.budget_start_date,
            "end_date": p.budget_end_date,
            "budget": round(budget, 2),
            "spent": round(spent, 2),
            "pending": round(pending, 2),
            "remaining": round(remaining, 2),
            "utilization_pct": round((spent / budget * 100), 1) if budget > 0 else 0.0,
            "links_published": links_published,
            "websites_count": websites_count,
            "cost_per_link": round(spent / links_published, 2) if links_published else None,
            "cost_per_website": round(spent / websites_count, 2) if websites_count else None,
            "cost_per_link_target": (
                float(p.cost_per_link_target) if p.cost_per_link_target is not None else None
            ),
        }

    # ----- set the base budget (period + amount + cpl target) -----
    def set_budget(
        self,
        project_id: uuid.UUID,
        *,
        amount: float | None,
        period: str | None,
        currency: str | None,
        cost_per_link_target: float | None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict:
        p = self._project(project_id)
        if period is not None:
            if period not in BUDGET_PERIODS:
                raise BadRequest(f"period must be one of {sorted(BUDGET_PERIODS)}")
            p.budget_period = period
        if amount is not None:
            p.monthly_budget = Decimal(str(amount))
        if currency is not None:
            p.budget_currency = currency.upper()[:3]
        p.budget_start_date = start_date
        p.budget_end_date = end_date
        # cost_per_link_target is explicitly settable to null to clear it.
        p.cost_per_link_target = (
            Decimal(str(cost_per_link_target)) if cost_per_link_target is not None else None
        )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="budget.set",
            module="budget", entity_type="project", entity_id=p.id,
            new={"name": p.name, "budget": float(p.monthly_budget), "period": p.budget_period},
        )
        self.db.commit()
        return self.summary(project_id)

    # ----- increase / decrease with admin approval -----
    def request_adjustment(
        self, project_id: uuid.UUID, delta: float, reason: str | None
    ) -> BudgetAdjustment:
        p = self._project(project_id)
        if delta == 0:
            raise BadRequest("Adjustment amount can't be zero")
        adj = BudgetAdjustment(
            project_id=p.id, delta_amount=Decimal(str(delta)), reason=reason,
            status="pending", requested_by=self.user.id,
        )
        self.db.add(adj)
        verb = "increase" if delta > 0 else "decrease"
        self.notifier.notify_admins(
            company_id=self.company_id, type="budget_adjustment_requested",
            title="Budget change requested",
            body=f"{self.user.full_name} requested a {verb} of {abs(delta):,.2f} "
            f"on '{p.name}'." + (f" {reason}" if reason else ""),
            entity_type="project", entity_id=p.id, exclude=self.user.id,
        )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="budget.adjustment_requested",
            module="budget", entity_type="project", entity_id=p.id,
            new={"name": p.name, "delta": delta},
        )
        self.db.commit()
        self.db.refresh(adj)
        return adj

    def decide_adjustment(
        self, adjustment_id: uuid.UUID, approve: bool, note: str | None
    ) -> BudgetAdjustment:
        if not is_admin(self.user):
            raise PermissionDenied("Only an admin can approve budget changes")
        adj = self.db.get(BudgetAdjustment, adjustment_id)
        if adj is None:
            raise NotFound("Adjustment not found")
        p = self._project(adj.project_id)
        if adj.status != "pending":
            raise BadRequest(f"Adjustment already {adj.status}")
        adj.status = "approved" if approve else "rejected"
        adj.decided_by = self.user.id
        adj.decided_at = datetime.now(UTC)
        adj.decision_note = note
        if approve:
            new_budget = (p.monthly_budget or Decimal(0)) + adj.delta_amount
            p.monthly_budget = max(Decimal(0), new_budget)
        self.notifier.notify(
            company_id=self.company_id, user_id=adj.requested_by,
            type="budget_adjustment_decided",
            title=f"Budget change {adj.status}",
            body=f"Your budget change on '{p.name}' was {adj.status}."
            + (f" {note}" if note else ""),
            entity_type="project", entity_id=p.id,
        )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id,
            action=f"budget.adjustment_{adj.status}", module="budget",
            entity_type="project", entity_id=p.id, new={"name": p.name, "delta": float(adj.delta_amount)},
        )
        self.db.commit()
        self.db.refresh(adj)
        return adj

    def list_adjustments(self, project_id: uuid.UUID) -> list[BudgetAdjustment]:
        p = self._project(project_id)
        return list(
            self.db.scalars(
                select(BudgetAdjustment)
                .where(BudgetAdjustment.project_id == p.id)
                .order_by(BudgetAdjustment.created_at.desc())
            ).all()
        )
