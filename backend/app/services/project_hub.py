"""Project Hub aggregates: the per-project Overview, Activity, and Websites-used
data that powers the rich Project Details page. Every read goes through
ProjectService.get() first, so RBAC visibility (admin/lead/member) is enforced.
"""

from __future__ import annotations

import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.activity import ActivityLog
from app.models.guest_post import GuestPost
from app.models.payment import Payment
from app.models.project import Project, ProjectMonthlyBudget
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
