"""Project Hub aggregates: the per-project Overview, Activity, and Websites-used
data that powers the rich Project Details page. Every read goes through
ProjectService.get() first, so RBAC visibility (admin/lead/member) is enforced.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, and_, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models.activity import ActivityLog
from app.models.guest_post import GuestPost
from app.models.payment import Payment
from app.models.project import Project, ProjectBudgetPeriod, ProjectMonthlyBudget
from app.models.task import Task
from app.models.user import User
from app.services.project import ProjectService


class ProjectHubService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.projects = ProjectService(db, user)

    def _project(self, project_id: uuid.UUID) -> Project:
        return self.projects.get(project_id)  # 404 if out of scope

    # ---- Overview metrics ----
    def overview(self, project_id: uuid.UUID) -> dict:
        p = self._project(project_id)
        pid = p.id

        def _sum(col, *where) -> float:
            return float(self.db.scalar(select(func.coalesce(func.sum(col), 0)).where(*where)) or 0)

        def _count(model, *where) -> int:
            return int(self.db.scalar(select(func.count()).select_from(model).where(*where)) or 0)

        # Budget (per-month allocations + spent; fall back to the headline monthly_budget)
        budget_assigned = _sum(
            ProjectMonthlyBudget.budget_amount, ProjectMonthlyBudget.project_id == pid
        )
        if budget_assigned == 0:
            budget_assigned = float(p.monthly_budget or 0)
        budget_consumed = _sum(
            ProjectMonthlyBudget.spent_amount, ProjectMonthlyBudget.project_id == pid
        )

        pay_base = (Payment.project_id == pid, Payment.deleted_at.is_(None))
        payments_paid = _sum(Payment.amount_usd, *pay_base, Payment.status == "paid")
        payments_pending = _sum(Payment.amount_usd, *pay_base, Payment.status == "pending")
        payments_count = _count(Payment, *pay_base)
        if budget_consumed == 0:
            budget_consumed = payments_paid  # if the budget automation wasn't used

        gp_base = (GuestPost.project_id == pid, GuestPost.deleted_at.is_(None))
        total_links = _count(GuestPost, *gp_base)
        published_links = _count(GuestPost, *gp_base, GuestPost.status == "published")
        rejected_links = _count(
            GuestPost,
            *gp_base,
            or_(GuestPost.status == "rejected", GuestPost.review_status == "rejected"),
        )
        pending_links = max(total_links - published_links - rejected_links, 0)
        websites_used = int(
            self.db.scalar(
                select(func.count(func.distinct(func.coalesce(GuestPost.website_id, GuestPost.id))))
                .where(*gp_base)
            )
            or 0
        )

        task_base = (Task.project_id == pid,)
        tasks_total = _count(Task, *task_base)
        tasks_completed = _count(Task, *task_base, Task.status == "completed")

        member_ids = {m.user_id for m in p.members}
        if p.assignee_id:
            member_ids.add(p.assignee_id)
        if p.team_lead_id:
            member_ids.add(p.team_lead_id)

        return {
            "budget_assigned": round(budget_assigned, 2),
            "budget_consumed": round(budget_consumed, 2),
            "budget_pending": round(payments_pending, 2),
            "budget_remaining": round(budget_assigned - budget_consumed, 2),
            "cost_per_link": round(budget_consumed / published_links, 2) if published_links else None,
            "cost_per_website": round(budget_consumed / websites_used, 2) if websites_used else None,
            "target_links": int(p.target_links or 0),
            "total_links": total_links,
            "published_links": published_links,
            "pending_links": pending_links,
            "rejected_links": rejected_links,
            "websites_used": websites_used,
            "payments_count": payments_count,
            "payments_paid": round(payments_paid, 2),
            "payments_pending": round(payments_pending, 2),
            "team_size": len(member_ids),
            "tasks_total": tasks_total,
            "tasks_completed": tasks_completed,
            "budget_currency": p.budget_currency or "USD",
        }

    # ---- Period-scoped report (this month / week / custom / all-time) ----
    def report(
        self, project_id: uuid.UUID, start: date | None, end: date | None
    ) -> dict:
        """Accurate metrics scoped to a date range, sourced from the SAME data as
        the rest of the app (budget cycles, payments by date, links, tasks) so
        the Overview, Budget tab, and Payments always agree."""
        p = self._project(project_id)
        pid = p.id
        cid = self.company_id

        def _ranged(col, *extra) -> list:
            conds = list(extra)
            if start is not None:
                conds.append(col >= start)
            if end is not None:
                conds.append(col <= end)
            return conds

        # Payments — bucket by payment_date, falling back to created date.
        pay_bucket = func.coalesce(Payment.payment_date, cast(Payment.created_at, Date))
        pay_base = (Payment.company_id == cid, Payment.project_id == pid, Payment.deleted_at.is_(None))

        def _pay(status: str) -> float:
            return float(
                self.db.scalar(
                    select(func.coalesce(func.sum(Payment.amount_usd), 0)).where(
                        *pay_base, Payment.status == status, *_ranged(pay_bucket)
                    )
                ) or 0
            )

        paid = _pay("paid")
        pending = _pay("pending")
        pay_count = int(
            self.db.scalar(
                select(func.count()).select_from(Payment).where(*pay_base, *_ranged(pay_bucket))
            ) or 0
        )

        # Links — added by created date; published by live-link date (fallback).
        gp_created = cast(GuestPost.created_at, Date)
        gp_pub = func.coalesce(GuestPost.live_link_date, cast(GuestPost.created_at, Date))
        gp_base = (GuestPost.company_id == cid, GuestPost.project_id == pid, GuestPost.deleted_at.is_(None))
        links_added = int(
            self.db.scalar(select(func.count()).select_from(GuestPost).where(*gp_base, *_ranged(gp_created))) or 0
        )
        links_published = int(
            self.db.scalar(
                select(func.count()).select_from(GuestPost).where(
                    *gp_base, GuestPost.status == "published", *_ranged(gp_pub)
                )
            ) or 0
        )
        links_rejected = int(
            self.db.scalar(
                select(func.count()).select_from(GuestPost).where(
                    *gp_base,
                    or_(GuestPost.status == "rejected", GuestPost.review_status == "rejected"),
                    *_ranged(gp_created),
                )
            ) or 0
        )
        links_pending = max(links_added - links_published - links_rejected, 0)
        websites_used = int(
            self.db.scalar(
                select(func.count(func.distinct(GuestPost.website_id))).where(
                    *gp_base, GuestPost.website_id.is_not(None), *_ranged(gp_created)
                )
            ) or 0
        )

        # Budget — sum the cycles overlapping the range; fall back to the headline.
        bp_overlap = []
        if start is not None:
            bp_overlap.append(ProjectBudgetPeriod.end_date >= start)
        if end is not None:
            bp_overlap.append(ProjectBudgetPeriod.start_date <= end)
        period_count = int(
            self.db.scalar(
                select(func.count()).select_from(ProjectBudgetPeriod).where(
                    ProjectBudgetPeriod.project_id == pid, *bp_overlap
                )
            ) or 0
        )
        if period_count:
            budget_assigned = float(
                self.db.scalar(
                    select(func.coalesce(func.sum(ProjectBudgetPeriod.budget_amount), 0)).where(
                        ProjectBudgetPeriod.project_id == pid, *bp_overlap
                    )
                ) or 0
            )
        else:
            # No cycle overlaps this range. Fall back to the headline budget only
            # for legacy projects that never used cycles at all; a project WITH
            # cycles genuinely had no budget in a range with no period.
            any_period = int(
                self.db.scalar(
                    select(func.count()).select_from(ProjectBudgetPeriod).where(
                        ProjectBudgetPeriod.project_id == pid
                    )
                ) or 0
            )
            budget_assigned = float(p.monthly_budget or 0) if any_period == 0 else 0.0

        # Tasks — created in range; completed by completion date (fallback created).
        task_created = cast(Task.created_at, Date)
        task_done = func.coalesce(cast(Task.completed_at, Date), cast(Task.created_at, Date))
        task_base = (Task.company_id == cid, Task.project_id == pid)
        tasks_total = int(
            self.db.scalar(select(func.count()).select_from(Task).where(*task_base, *_ranged(task_created))) or 0
        )
        tasks_completed = int(
            self.db.scalar(
                select(func.count()).select_from(Task).where(
                    *task_base, Task.status == "completed", *_ranged(task_done)
                )
            ) or 0
        )

        if start is None and end is None:
            label = "All time"
        elif start and end:
            label = f"{start.isoformat()} → {end.isoformat()}"
        elif start:
            label = f"From {start.isoformat()}"
        else:
            label = f"Until {end.isoformat()}"

        return {
            "start": start,
            "end": end,
            "period_label": label,
            "currency": p.budget_currency or "USD",
            "budget_assigned": round(budget_assigned, 2),
            "budget_spent": round(paid, 2),
            "budget_pending": round(pending, 2),
            "budget_remaining": round(budget_assigned - paid, 2),
            "utilization_pct": round(paid / budget_assigned * 100, 1) if budget_assigned > 0 else 0.0,
            "links_added": links_added,
            "links_published": links_published,
            "links_pending": links_pending,
            "links_rejected": links_rejected,
            "websites_used": websites_used,
            "payments_paid": round(paid, 2),
            "payments_pending": round(pending, 2),
            "payments_count": pay_count,
            "tasks_total": tasks_total,
            "tasks_completed": tasks_completed,
            "cost_per_link": round(paid / links_published, 2) if links_published else None,
        }

    # ---- Websites used in this project (derived from its guest posts) ----
    def websites_used(self, project_id: uuid.UUID) -> list[dict]:
        self._project(project_id)
        rows = self.db.execute(
            select(
                func.coalesce(GuestPost.website_name, "(unnamed)"),
                func.count(),
                func.coalesce(func.sum(GuestPost.price), 0),
                func.count().filter(GuestPost.status == "published"),
            )
            .where(GuestPost.project_id == project_id, GuestPost.deleted_at.is_(None))
            .group_by(GuestPost.website_name)
            .order_by(func.count().desc())
        ).all()
        return [
            {
                "website": name,
                "links": int(cnt),
                "spend": round(float(spend), 2),
                "published": int(pub),
            }
            for name, cnt, spend, pub in rows
        ]

    # ---- Activity for this project (its own events + its children's) ----
    def activity(self, project_id: uuid.UUID, limit: int = 40) -> list[ActivityLog]:
        self._project(project_id)
        child_ids = set(
            self.db.scalars(
                select(Payment.id).where(Payment.project_id == project_id)
            ).all()
        )
        child_ids |= set(
            self.db.scalars(
                select(GuestPost.id).where(GuestPost.project_id == project_id)
            ).all()
        )
        child_ids |= set(
            self.db.scalars(select(Task.id).where(Task.project_id == project_id)).all()
        )
        conditions = [ActivityLog.entity_id == project_id]
        if child_ids:
            conditions.append(ActivityLog.entity_id.in_(child_ids))
        return list(
            self.db.scalars(
                select(ActivityLog)
                .where(
                    ActivityLog.company_id == self.company_id,
                    and_(or_(*conditions)),
                )
                .order_by(ActivityLog.created_at.desc())
                .limit(limit)
            ).all()
        )
