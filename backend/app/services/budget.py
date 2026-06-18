"""Budget Management (per project): a budget period + amount, an increase/decrease
approval workflow, and a consumption summary with cost-per-link / cost-per-website.

Spent + pending are computed from the project's payments (paid / pending), so the
numbers always reflect reality rather than a manually-maintained counter.
"""

from __future__ import annotations

import calendar
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Date, func, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_admin, is_manager
from app.core.scope import accessible_project_ids
from app.models.guest_post import GuestPost
from app.models.payment import Payment
from app.models.project import BudgetAdjustment, Project, ProjectBudgetPeriod
from app.models.user import User
from app.services.activity import ActivityLogger
from app.services.notification import Notifier

BUDGET_PERIODS = {"monthly", "weekly", "daily"}
# Never materialise more than this many periods in one pass (guards against a
# very old start date generating hundreds of rows).
MAX_PERIODS = 24


def _month_bounds(d: date) -> tuple[date, date, str]:
    start = d.replace(day=1)
    end = d.replace(day=calendar.monthrange(d.year, d.month)[1])
    return start, end, start.strftime("%b %Y")


def _week_bounds(d: date) -> tuple[date, date, str]:
    start = d - timedelta(days=d.weekday())  # Monday
    end = start + timedelta(days=6)
    return start, end, f"Wk {start.isocalendar()[1]} · {start.strftime('%d %b')}"


def _day_bounds(d: date) -> tuple[date, date, str]:
    return d, d, d.strftime("%d %b %Y")


def _bounds(period_type: str, d: date) -> tuple[date, date, str]:
    if period_type == "weekly":
        return _week_bounds(d)
    if period_type == "daily":
        return _day_bounds(d)
    return _month_bounds(d)


def _next_start(period_type: str, start: date) -> date:
    if period_type == "weekly":
        return start + timedelta(days=7)
    if period_type == "daily":
        return start + timedelta(days=1)
    return (start.replace(day=1) + timedelta(days=32)).replace(day=1)  # next month


def roll_forward_budget_period(db: Session, actor: User, period_id: uuid.UUID) -> None:
    """Completing a period's budget task closes that period and activates the
    NEXT one with the SAME budget amount + a fresh task for the assignee. Not
    manager-gated (the assignee triggers it by completing their task). Caller
    commits."""
    from app.models.project import Project
    from app.services.auto_task import SOURCE_BUDGET_PERIOD, sync_assignment_task

    period = db.get(ProjectBudgetPeriod, period_id)
    if period is None:
        return
    period.status = "closed"
    p = db.get(Project, period.project_id)
    if p is None:
        return
    nxt = _next_start(period.period_type, period.start_date)
    if p.budget_end_date and nxt > p.budget_end_date:
        db.flush()
        return  # budget run has ended
    s, e, label = _bounds(period.period_type, nxt)
    exists = db.scalar(
        select(ProjectBudgetPeriod).where(
            ProjectBudgetPeriod.project_id == p.id, ProjectBudgetPeriod.start_date == s
        )
    )
    if exists is None:
        row = ProjectBudgetPeriod(
            project_id=p.id,
            company_id=p.company_id,
            period_type=period.period_type,
            start_date=s,
            end_date=e,
            label=label,
            budget_amount=period.budget_amount,  # same budget rolls forward
            currency=period.currency,
            status="open",
        )
        db.add(row)
        db.flush()
        assignee = p.assignee_id or p.team_lead_id
        if assignee:
            task = sync_assignment_task(
                db, actor, company_id=p.company_id,
                source_type=SOURCE_BUDGET_PERIOD, source_id=row.id, assigned_to=assignee,
                name=f"Budget — {p.name} · {label}"[:200],
                description=(
                    f"Manage the {label} budget "
                    f"({row.currency} {row.budget_amount:g}) for {p.name}."
                ),
                project_id=p.id, due_date=e,
            )
            if task is not None:
                row.task_id = task.id
    db.flush()


def _iter_periods(
    period_type: str, anchor: date, limit: date
) -> list[tuple[date, date, str]]:
    """Calendar periods from `anchor` up to and including `limit`, most-recent
    `MAX_PERIODS` kept."""
    if period_type == "weekly":
        cur = anchor - timedelta(days=anchor.weekday())
        bounds, step = _week_bounds, (lambda x: x + timedelta(days=7))
    elif period_type == "daily":
        cur = anchor
        bounds, step = _day_bounds, (lambda x: x + timedelta(days=1))
    else:  # monthly
        cur = anchor.replace(day=1)
        bounds = _month_bounds
        step = lambda x: x.replace(day=1) + timedelta(days=32)  # noqa: E731
    out: list[tuple[date, date, str]] = []
    guard = 0
    while cur <= limit and guard < 600:
        s, e, label = bounds(cur)
        out.append((s, e, label))
        cur = step(cur)
        if period_type == "monthly":
            cur = cur.replace(day=1)
        guard += 1
    return out[-MAX_PERIODS:]


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
            "auto_renew": p.budget_auto_renew,
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
        auto_renew: bool | None = None,
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
        if auto_renew is not None:
            p.budget_auto_renew = auto_renew
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
        # Re-materialise cycles so the period table reflects the new settings.
        self._materialise_periods(p)
        self.db.commit()
        return self.summary(project_id)

    # ----- budget cycles (per-period budgets + recurring task) -----
    def _period_spend(self, project_id: uuid.UUID, start: date, end: date, status: str) -> float:
        """Paid/pending USD on a project's payments dated within [start, end].
        Falls back to the created date when payment_date is absent."""
        bucket = func.coalesce(Payment.payment_date, func.cast(Payment.created_at, Date))
        return float(
            self.db.scalar(
                select(func.coalesce(func.sum(Payment.amount_usd), 0)).where(
                    Payment.company_id == self.company_id,
                    Payment.project_id == project_id,
                    Payment.deleted_at.is_(None),
                    Payment.status == status,
                    bucket >= start,
                    bucket <= end,
                )
            )
            or 0
        )

    def _ensure_period_task(self, p: Project, row: ProjectBudgetPeriod) -> None:
        """Push a recurring 'budget' task to the assignee for an OPEN period
        (auto-renew only). No assignee => nothing to push."""
        assignee = p.assignee_id or p.team_lead_id
        if not assignee:
            return
        from app.services.auto_task import SOURCE_BUDGET_PERIOD, sync_assignment_task

        task = sync_assignment_task(
            self.db,
            self.user,
            company_id=self.company_id,
            source_type=SOURCE_BUDGET_PERIOD,
            source_id=row.id,
            assigned_to=assignee,
            name=f"Budget — {p.name} · {row.label}"[:200],
            description=(
                f"Manage the {row.label} budget "
                f"({row.currency} {row.budget_amount:g}) for {p.name}."
            ),
            project_id=p.id,
            due_date=row.end_date,
        )
        if task is not None:
            row.task_id = task.id

    def _materialise_periods(self, p: Project) -> list[ProjectBudgetPeriod]:
        """Create any missing budget cycles from the start date up to today and
        refresh open/closed status. Auto-renew keeps open periods + their task in
        sync with the base amount and pushes the recurring task to the assignee."""
        base = Decimal(str(p.monthly_budget or 0))
        if base <= 0 and not p.budget_start_date:
            return []
        today = datetime.now(UTC).date()
        anchor = p.budget_start_date or today
        limit = today
        if p.budget_end_date and p.budget_end_date < limit:
            limit = p.budget_end_date
        if anchor > limit:
            return []
        # Read existing rows straight from the DB (the cached relationship goes
        # stale after a commit within the same request, causing dup inserts).
        existing = {
            row.start_date: row
            for row in self.db.scalars(
                select(ProjectBudgetPeriod).where(ProjectBudgetPeriod.project_id == p.id)
            ).all()
        }
        created: list[ProjectBudgetPeriod] = []
        for s, e, label in _iter_periods(p.budget_period, anchor, limit):
            row = existing.get(s)
            is_open = e >= today
            if row is None:
                row = ProjectBudgetPeriod(
                    project_id=p.id,
                    company_id=self.company_id,
                    period_type=p.budget_period,
                    start_date=s,
                    end_date=e,
                    label=label,
                    budget_amount=base,
                    currency=p.budget_currency,
                    status="open" if is_open else "closed",
                )
                self.db.add(row)
                self.db.flush()
                created.append(row)
                if is_open and p.budget_auto_renew:
                    self._ensure_period_task(p, row)
            else:
                # Keep status fresh; never clobber a manually-edited amount.
                # auto_renew only governs pushing the recurring task.
                row.status = "open" if is_open else "closed"
                if is_open and p.budget_auto_renew and row.task_id is None:
                    self._ensure_period_task(p, row)
        return created

    def list_periods(self, project_id: uuid.UUID) -> list[dict]:
        p = self._project(project_id)
        self._materialise_periods(p)
        self.db.commit()
        today = datetime.now(UTC).date()
        rows = list(
            self.db.scalars(
                select(ProjectBudgetPeriod)
                .where(ProjectBudgetPeriod.project_id == p.id)
                .order_by(ProjectBudgetPeriod.start_date.desc())
            ).all()
        )
        out: list[dict] = []
        for r in rows:
            budget = float(r.budget_amount or 0)
            spent = round(self._period_spend(p.id, r.start_date, r.end_date, "paid"), 2)
            pending = round(self._period_spend(p.id, r.start_date, r.end_date, "pending"), 2)
            task = r.task
            out.append(
                {
                    "id": r.id,
                    "label": r.label,
                    "period_type": r.period_type,
                    "start_date": r.start_date,
                    "end_date": r.end_date,
                    "is_current": r.start_date <= today <= r.end_date,
                    "currency": r.currency,
                    "budget": round(budget, 2),
                    "spent": spent,
                    "pending": pending,
                    "remaining": round(budget - spent, 2),
                    "utilization_pct": round(spent / budget * 100, 1) if budget > 0 else 0.0,
                    "status": r.status,
                    "task_id": task.id if task else None,
                    "task_status": task.status if task else None,
                    "assignee": (
                        {"id": task.assigned_user.id, "full_name": task.assigned_user.full_name}
                        if task and task.assigned_user
                        else None
                    ),
                }
            )
        return out

    def set_period_amount(
        self, project_id: uuid.UUID, period_id: uuid.UUID, amount: float
    ) -> dict:
        p = self._project(project_id)
        row = self.db.get(ProjectBudgetPeriod, period_id)
        if row is None or row.project_id != p.id:
            raise NotFound("Budget period not found")
        row.budget_amount = Decimal(str(amount))
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="budget.period_set",
            module="budget", entity_type="project", entity_id=p.id,
            new={"name": p.name, "period": row.label, "amount": float(row.budget_amount)},
        )
        self.db.commit()
        return next(
            (d for d in self.list_periods(project_id) if d["id"] == row.id),
            {},
        )

    def set_auto_renew(self, project_id: uuid.UUID, on: bool) -> dict:
        p = self._project(project_id)
        p.budget_auto_renew = on
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="budget.auto_renew",
            module="budget", entity_type="project", entity_id=p.id,
            new={"name": p.name, "auto_renew": on},
        )
        self.db.commit()
        self._materialise_periods(p)
        self.db.commit()
        return self.summary(project_id)

    def renew_now(self, project_id: uuid.UUID) -> list[dict]:
        """Force-generate the current (and any missing) period now."""
        return self.list_periods(project_id)

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
