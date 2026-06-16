"""Report aggregation logic (Module 10). Managers only.

Each report returns a generic columns + rows + totals structure that the API can
also render to CSV.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import date

from sqlalchemy import Date, cast, func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import PermissionDenied
from app.core.permissions import is_manager
from app.core.scope import accessible_project_ids, accessible_user_ids
from app.models.guest_post import GuestPost
from app.models.payment import Payment
from app.models.project import Project, ProjectChecklistItem
from app.models.task import Task
from app.models.user import User
from app.schemas.report import ReportColumn, ReportResult


def _cols(*pairs: tuple[str, str]) -> list[ReportColumn]:
    return [ReportColumn(key=k, label=label) for k, label in pairs]


class ReportService:
    def __init__(self, db: Session, user: User) -> None:
        if not is_manager(user):
            raise PermissionDenied("Reports are available to managers")
        self.db = db
        self.user = user
        self.company_id = user.company_id
        # RBAC scope (None == admin/unrestricted).
        self._pids = accessible_project_ids(db, user)
        self._uids = accessible_user_ids(db, user)

    # ----- Project report -----
    def project_report(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        project_id: uuid.UUID | None = None,
        team_lead_id: uuid.UUID | None = None,
        country_id: int | None = None,
        **_,
    ) -> ReportResult:
        cid = self.company_id
        stmt = select(Project).where(
            Project.company_id == cid, Project.deleted_at.is_(None)
        )
        if self._pids is not None:
            stmt = stmt.where(Project.id.in_(self._pids))
        if project_id:
            stmt = stmt.where(Project.id == project_id)
        if team_lead_id:
            stmt = stmt.where(Project.team_lead_id == team_lead_id)
        if country_id:
            stmt = stmt.where(Project.target_country_id == country_id)
        if date_from:
            stmt = stmt.where(cast(Project.created_at, Date) >= date_from)
        if date_to:
            stmt = stmt.where(cast(Project.created_at, Date) <= date_to)
        projects = self.db.scalars(stmt.order_by(Project.name)).all()

        published = dict(
            self.db.execute(
                select(GuestPost.project_id, func.count())
                .where(
                    GuestPost.company_id == cid,
                    GuestPost.status == "published",
                    GuestPost.deleted_at.is_(None),
                )
                .group_by(GuestPost.project_id)
            ).all()
        )
        spent = dict(
            self.db.execute(
                select(Payment.project_id, func.coalesce(func.sum(Payment.amount_usd), 0))
                .where(
                    Payment.company_id == cid,
                    Payment.deleted_at.is_(None),
                    Payment.status == "paid",
                )
                .group_by(Payment.project_id)
            ).all()
        )

        rows: list[dict] = []
        t_target = t_pub = 0
        t_budget = t_spent = 0.0
        for p in projects:
            pub = int(published.get(p.id, 0) or 0)
            sp = float(spent.get(p.id, 0) or 0)
            budget = float(p.monthly_budget or 0)
            rows.append(
                {
                    "project": p.name,
                    "niche": p.main_niche.name if p.main_niche else None,
                    "country": p.target_country.name if p.target_country else None,
                    "team_lead": p.team_lead.full_name if p.team_lead else None,
                    "status": p.status,
                    "target_links": p.target_links,
                    "published_links": pub,
                    "monthly_budget": budget,
                    "spent": sp,
                    "due_date": p.due_date.isoformat() if p.due_date else None,
                }
            )
            t_target += p.target_links
            t_pub += pub
            t_budget += budget
            t_spent += sp

        return ReportResult(
            report_type="project",
            columns=_cols(
                ("project", "Project"), ("niche", "Niche"), ("country", "Country"),
                ("team_lead", "Team Lead"), ("status", "Status"),
                ("target_links", "Target Links"), ("published_links", "Published Links"),
                ("monthly_budget", "Monthly Budget"), ("spent", "Spent (Paid)"),
                ("due_date", "Due Date"),
            ),
            rows=rows,
            totals={
                "project": "TOTAL",
                "target_links": t_target,
                "published_links": t_pub,
                "monthly_budget": round(t_budget, 2),
                "spent": round(t_spent, 2),
            },
        )

    # ----- Team report -----
    def team_report(self, **_) -> ReportResult:
        cid = self.company_id
        users_stmt = select(User).where(
            User.company_id == cid,
            User.status == "active",
            User.is_platform_owner.is_(False),  # hidden owner never shows in team reports
        )
        if self._uids is not None:
            users_stmt = users_stmt.where(User.id.in_(self._uids))
        users = self.db.scalars(users_stmt.order_by(User.full_name)).all()
        rows: list[dict] = []
        for u in users:
            projects = (
                self.db.scalar(
                    select(func.count())
                    .select_from(Project)
                    .where(
                        Project.company_id == cid,
                        or_(Project.assignee_id == u.id, Project.team_lead_id == u.id),
                    )
                )
                or 0
            )
            gp = (
                self.db.scalar(
                    select(func.count())
                    .select_from(GuestPost)
                    .where(
                        GuestPost.company_id == cid,
                        GuestPost.assigned_user_id == u.id,
                        GuestPost.status == "published",
                    )
                )
                or 0
            )
            done = (
                self.db.scalar(
                    select(func.count())
                    .select_from(Task)
                    .where(Task.company_id == cid, Task.assigned_to == u.id, Task.status == "completed")
                )
                or 0
            )
            paid = (
                self.db.scalar(
                    select(func.coalesce(func.sum(Payment.amount_usd), 0)).where(
                        Payment.company_id == cid,
                        Payment.created_by == u.id,
                        Payment.status == "paid",
                    )
                )
                or 0
            )
            rows.append(
                {
                    "member": u.full_name,
                    "role": ", ".join(sorted(u.role_slugs)),
                    "projects": int(projects),
                    "guest_posts_published": int(gp),
                    "tasks_completed": int(done),
                    "paid_amount": float(paid),
                }
            )
        return ReportResult(
            report_type="team",
            columns=_cols(
                ("member", "Member"), ("role", "Role"), ("projects", "Projects"),
                ("guest_posts_published", "Posts Published"),
                ("tasks_completed", "Tasks Completed"), ("paid_amount", "Paid (USD)"),
            ),
            rows=rows,
            totals={
                "member": "TOTAL",
                "projects": sum(r["projects"] for r in rows),
                "guest_posts_published": sum(r["guest_posts_published"] for r in rows),
                "tasks_completed": sum(r["tasks_completed"] for r in rows),
                "paid_amount": round(sum(r["paid_amount"] for r in rows), 2),
            },
        )

    # ----- Financial report -----
    def financial_report(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        **_,
    ) -> ReportResult:
        cid = self.company_id
        stmt = select(Payment).where(
            Payment.company_id == cid, Payment.deleted_at.is_(None)
        )
        if self._uids is not None:
            stmt = stmt.where(
                or_(
                    Payment.created_by.in_(self._uids),
                    Payment.attributed_to_id.in_(self._uids),
                )
            )
        if project_id:
            stmt = stmt.where(Payment.project_id == project_id)
        if status:
            stmt = stmt.where(Payment.status == status)
        if date_from:
            stmt = stmt.where(Payment.payment_date >= date_from)
        if date_to:
            stmt = stmt.where(Payment.payment_date <= date_to)
        payments = self.db.scalars(stmt.order_by(Payment.created_at.desc())).all()

        rows: list[dict] = []
        t_usd = t_inr = 0.0
        for p in payments:
            usd = float(p.amount_usd or 0)
            inr = float(p.amount_inr or 0)
            rows.append(
                {
                    "payment_date": p.payment_date.isoformat() if p.payment_date else None,
                    "project": p.project.name if p.project else None,
                    "website": p.website.domain if p.website else None,
                    "amount_usd": usd,
                    "amount_inr": inr,
                    "status": p.status,
                    "transaction_id": p.transaction_id,
                }
            )
            t_usd += usd
            t_inr += inr
        return ReportResult(
            report_type="financial",
            columns=_cols(
                ("payment_date", "Date"), ("project", "Project"), ("website", "Website"),
                ("amount_usd", "Amount USD"), ("amount_inr", "Amount INR"),
                ("status", "Status"), ("transaction_id", "Transaction ID"),
            ),
            rows=rows,
            totals={"payment_date": "TOTAL", "amount_usd": round(t_usd, 2), "amount_inr": round(t_inr, 2)},
        )

    # ----- Guest post report -----
    def guest_post_report(
        self,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        **_,
    ) -> ReportResult:
        cid = self.company_id
        stmt = select(GuestPost).where(
            GuestPost.company_id == cid, GuestPost.deleted_at.is_(None)
        )
        if self._uids is not None:
            stmt = stmt.where(
                or_(
                    GuestPost.assigned_user_id.in_(self._uids),
                    GuestPost.created_by.in_(self._uids),
                )
            )
        if project_id:
            stmt = stmt.where(GuestPost.project_id == project_id)
        if status:
            stmt = stmt.where(GuestPost.status == status)
        if date_from:
            stmt = stmt.where(cast(GuestPost.created_at, Date) >= date_from)
        if date_to:
            stmt = stmt.where(cast(GuestPost.created_at, Date) <= date_to)
        gps = self.db.scalars(stmt.order_by(GuestPost.created_at.desc())).all()

        rows: list[dict] = []
        t_price = 0.0
        for g in gps:
            price = float(g.price or 0)
            rows.append(
                {
                    "website": g.website_name,
                    "project": g.project.name if g.project else None,
                    "status": g.status,
                    "da": g.da,
                    "dr": g.dr,
                    "price": price,
                    "outreach_date": g.outreach_date.isoformat() if g.outreach_date else None,
                    "live_link_date": g.live_link_date.isoformat() if g.live_link_date else None,
                    "live_link": g.live_link,
                    "assigned_user": g.assigned_user.full_name if g.assigned_user else None,
                }
            )
            t_price += price
        return ReportResult(
            report_type="guest_post",
            columns=_cols(
                ("website", "Website"), ("project", "Project"), ("status", "Status"),
                ("da", "DA"), ("dr", "DR"), ("price", "Price"),
                ("outreach_date", "Outreach Date"), ("live_link_date", "Live Date"),
                ("live_link", "Live Link"), ("assigned_user", "Assigned"),
            ),
            rows=rows,
            totals={"website": "TOTAL", "price": round(t_price, 2)},
        )

    # ----- Workflow (checklist) report -----
    def workflow_report(
        self, *, project_id: uuid.UUID | None = None, team_lead_id: uuid.UUID | None = None, **_
    ) -> ReportResult:
        """Per-project view of the workflow checklist: each stage's status, the
        payment details, and overall completion."""
        from app.services.project_checklist import ITEMS, STATUS_LABELS

        cid = self.company_id
        stmt = select(Project).where(Project.company_id == cid, Project.deleted_at.is_(None))
        if self._pids is not None:
            stmt = stmt.where(Project.id.in_(self._pids))
        if project_id:
            stmt = stmt.where(Project.id == project_id)
        if team_lead_id:
            stmt = stmt.where(Project.team_lead_id == team_lead_id)
        projects = list(self.db.scalars(stmt.order_by(Project.name)).all())

        by_project: dict = {}
        pids = [p.id for p in projects]
        if pids:
            for it in self.db.scalars(
                select(ProjectChecklistItem).where(ProjectChecklistItem.project_id.in_(pids))
            ).all():
                by_project.setdefault(it.project_id, {})[it.item_key] = it

        done_states = {"done", "completed", "approved"}
        rows: list[dict] = []
        t_amount = 0.0
        t_completed = 0
        for p in projects:
            items = by_project.get(p.id, {})

            def st(key: str, items=items) -> str:
                it = items.get(key)
                return STATUS_LABELS.get(it.status, it.status) if it else "—"

            pay = items.get("payment")
            amount = float(pay.amount) if pay and pay.amount is not None else 0.0
            completed = sum(
                1 for k, _ in ITEMS if items.get(k) and items[k].status in done_states
            )
            t_amount += amount
            t_completed += completed
            rows.append(
                {
                    "project": p.name,
                    "team_lead": p.team_lead.full_name if p.team_lead else None,
                    "find_website": st("find_website"),
                    "content_writing": st("content_writing"),
                    "publish": st("publish_live_link"),
                    "payment": st("payment"),
                    "payment_type": pay.payment_type if pay else None,
                    "payment_amount": amount or None,
                    "currency": (pay.currency if pay else None),
                    "transaction_id": pay.transaction_id if pay else None,
                    "completed": f"{completed}/{len(ITEMS)}",
                }
            )
        return ReportResult(
            report_type="workflow",
            columns=_cols(
                ("project", "Project"), ("team_lead", "Team Lead"),
                ("find_website", "Website"), ("content_writing", "Content"),
                ("publish", "Publish/Live"), ("payment", "Payment"),
                ("payment_type", "Pay Type"), ("payment_amount", "Amount"),
                ("currency", "Cur"), ("transaction_id", "Txn ID"),
                ("completed", "Completed"),
            ),
            rows=rows,
            totals={
                "project": "TOTAL",
                "payment_amount": round(t_amount, 2),
                "completed": f"{t_completed}/{len(projects) * len(ITEMS)}" if projects else "0/0",
            },
        )

    @staticmethod
    def to_csv(result: ReportResult) -> str:
        buf = io.StringIO()
        writer = csv.writer(buf)
        keys = [c.key for c in result.columns]
        writer.writerow([c.label for c in result.columns])
        for row in result.rows:
            writer.writerow(["" if row.get(k) is None else row.get(k) for k in keys])
        if result.totals:
            writer.writerow(["" if result.totals.get(k) is None else result.totals.get(k) for k in keys])
        return buf.getvalue()
