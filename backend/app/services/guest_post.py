"""Guest Post Tracker logic (Module 5), including the publish automation that
bumps the project's monthly goal `achieved` count (Module 4 link).
"""

from __future__ import annotations  # lazy annotations: the `list` method must not shadow list[...]

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFound, PermissionDenied
from app.core.permissions import is_manager
from app.core.scope import accessible_user_ids
from app.models.guest_post import GuestPost, GuestPostStatusHistory
from app.models.project import Project, ProjectMonthlyGoal
from app.models.user import User
from app.repositories.guest_post import GuestPostRepository
from app.repositories.project import GoalRepository, ProjectRepository
from app.schemas.guest_post import GuestPostCreate, GuestPostUpdate
from app.services.activity import ActivityLogger, jsonable
from app.services.notification import Notifier


class GuestPostService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.gps = GuestPostRepository(db)
        self.projects = ProjectRepository(db)
        self.goals = GoalRepository(db)
        self.activity = ActivityLogger(db)

    def _scope(self) -> set[uuid.UUID] | None:
        return accessible_user_ids(self.db, self.user)

    def _can_edit(self, gp: GuestPost) -> bool:
        return (
            is_manager(self.user)
            or gp.assigned_user_id == self.user.id
            or gp.created_by == self.user.id
        )

    def request_payment(
        self,
        gp_id: uuid.UUID,
        amount: float | None = None,
        currency: str | None = None,
        note: str | None = None,
    ):
        """Raise a pending Payment for this guest-post link, routed to the admins.
        Shows up on /payments + the ledger. Returns the created Payment."""
        from app.schemas.payment import PaymentCreate
        from app.services.payment import PaymentService

        gp = self.get(gp_id)
        if not self._can_edit(gp):
            raise PermissionDenied()
        remarks = f"Payment requested for '{gp.website_name or 'guest post'}'."
        if note:
            remarks += f" {note}"
        return PaymentService(self.db, self.user).create(
            PaymentCreate(
                project_id=gp.project_id,
                website_id=gp.website_id,
                guest_post_id=gp.id,
                currency=(currency or "USD"),
                amount=(
                    amount
                    if amount is not None
                    else (float(gp.price) if gp.price is not None else None)
                ),
                live_link=gp.live_link,
                status="pending",
                remarks=remarks,
            )
        )

    def bulk_create(self, project_id: uuid.UUID, links) -> dict:
        """Add MANY guest-post links to a project at once. For rows flagged
        `request_payment`, also raise a pending Payment (routed to admins, defaults
        to the row's price). Returns {created, payments_requested}."""
        from decimal import Decimal

        from app.schemas.payment import PaymentCreate
        from app.services.payment import PaymentService

        proj = self.db.get(Project, project_id)
        if proj is None or proj.company_id != self.company_id or proj.deleted_at is not None:
            raise NotFound("Project not found")
        psvc = PaymentService(self.db, self.user)
        created = 0
        payments = 0
        for item in links:
            name = (item.website_name or "").strip()
            url = (item.link_url or "").strip()
            if not name and not url:
                continue  # skip empty rows
            gp = GuestPost(
                company_id=self.company_id,
                project_id=project_id,
                created_by=self.user.id,
                website_name=name or None,
                live_link=url or None,
                status="published" if url else "prospect",
                live_link_date=datetime.now(UTC).date() if url else None,
                da=item.da,
                pa=item.pa,
                dr=item.dr,
                traffic=item.traffic,
                price=Decimal(str(item.price)) if item.price is not None else None,
            )
            self.db.add(gp)
            self.db.flush()
            created += 1
            if item.request_payment:
                psvc.create(
                    PaymentCreate(
                        project_id=project_id,
                        guest_post_id=gp.id,
                        amount=item.price,
                        currency=(item.currency or "USD"),
                        mode_of_payment=(item.payment_mode or None),
                        live_link=url or None,
                        status="pending",
                        remarks=f"Payment for '{name or url}'",
                    )
                )
                payments += 1
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="guest_post.bulk_created",
            module="guest_post",
            entity_type="project",
            entity_id=project_id,
            new={"name": proj.name, "created": created, "payments": payments},
        )
        Notifier(self.db).notify_admins(
            company_id=self.company_id,
            type="guest_post_bulk",
            title="Links added",
            body=f"{self.user.full_name} added {created} link(s) to '{proj.name}'"
            + (f" with {payments} payment request(s)" if payments else "")
            + ".",
            entity_type="project",
            entity_id=project_id,
            exclude=self.user.id,
        )
        self.db.commit()
        return {"created": created, "payments_requested": payments}

    def list(self, **filters) -> tuple[list[GuestPost], int]:
        items, total = self.gps.list_guest_posts(
            self.company_id, restrict_to_users=self._scope(), **filters
        )
        return list(items), total

    def get(self, gp_id: uuid.UUID) -> GuestPost:
        gp = self.gps.get_for_company(gp_id, self.company_id)
        if gp is None:
            raise NotFound("Guest post not found")
        users = self._scope()
        if users is not None and gp.assigned_user_id not in users and gp.created_by not in users:
            raise NotFound("Guest post not found")
        return gp

    def _ensure_project(self, project_id: uuid.UUID) -> None:
        if self.projects.get_for_company(project_id, self.company_id) is None:
            raise NotFound("Project not found")

    def create(self, data: GuestPostCreate) -> GuestPost:
        self._ensure_project(data.project_id)
        gp = GuestPost(company_id=self.company_id, created_by=self.user.id, **data.model_dump())
        self.gps.add(gp)
        self.db.add(
            GuestPostStatusHistory(
                guest_post_id=gp.id,
                from_status=None,
                to_status=gp.status,
                changed_by=self.user.id,
                note="created",
            )
        )
        if gp.status == "published":
            self._on_published(gp)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="guest_post.created",
            module="guest_post",
            entity_type="guest_post",
            entity_id=gp.id,
            new={"website_name": gp.website_name, "project_id": str(gp.project_id)},
        )
        Notifier(self.db).notify_admins(
            company_id=self.company_id,
            type="website_added",
            title="Website added",
            body=f"{self.user.full_name} added '{gp.website_name or 'a website'}' to a project.",
            entity_type="guest_post",
            entity_id=gp.id,
            exclude=self.user.id,
        )
        self._sync_assignment_task(gp)
        self.db.commit()
        self.db.refresh(gp)
        return gp

    def update(self, gp_id: uuid.UUID, data: GuestPostUpdate) -> GuestPost:
        gp = self.get(gp_id)
        if not self._can_edit(gp):
            raise PermissionDenied()
        changes = data.model_dump(exclude_unset=True)
        new_status = changes.pop("status", None)
        if "project_id" in changes:
            self._ensure_project(changes["project_id"])
        old = {key: getattr(gp, key) for key in changes}
        for key, value in changes.items():
            setattr(gp, key, value)
        if new_status is not None and new_status != gp.status:
            self._apply_status(gp, new_status, None)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="guest_post.updated",
            module="guest_post",
            entity_type="guest_post",
            entity_id=gp.id,
            old=jsonable(old),
            new=jsonable(changes),
        )
        self._sync_assignment_task(gp)
        self.db.commit()
        self.db.refresh(gp)
        return gp

    def set_status(self, gp_id: uuid.UUID, status: str, note: str | None) -> GuestPost:
        gp = self.get(gp_id)
        if not self._can_edit(gp):
            raise PermissionDenied()
        if status != gp.status:
            self._apply_status(gp, status, note)
            self.db.commit()
            self.db.refresh(gp)
        return gp

    def publish(
        self,
        gp_id: uuid.UUID,
        live_link: str,
        live_link_date: date | None,
        anchor_text: str | None,
    ) -> GuestPost:
        gp = self.get(gp_id)
        if not self._can_edit(gp):
            raise PermissionDenied()
        gp.live_link = live_link
        if live_link_date is not None:
            gp.live_link_date = live_link_date
        elif gp.live_link_date is None:
            gp.live_link_date = datetime.now(UTC).date()
        if anchor_text is not None:
            gp.anchor_text = anchor_text
        if gp.status != "published":
            self._apply_status(gp, "published", "published with live link")
        self.db.commit()
        self.db.refresh(gp)
        return gp

    # --- review workflow (member submits -> lead/admin approves/rejects) ---
    def submit_for_review(self, gp_id: uuid.UUID) -> GuestPost:
        gp = self.get(gp_id)
        if not self._can_edit(gp):
            raise PermissionDenied()
        gp.review_status = "submitted"
        notifier = Notifier(self.db)
        lead_id = gp.project.team_lead_id if gp.project else None
        body = f"{self.user.full_name} submitted '{gp.website_name or 'a website'}' for review."
        if lead_id and lead_id != self.user.id:
            notifier.notify(
                company_id=self.company_id, user_id=lead_id, type="review_requested",
                title="Review requested", body=body, entity_type="guest_post", entity_id=gp.id,
            )
        notifier.notify_admins(
            company_id=self.company_id, type="review_requested", title="Review requested",
            body=body, entity_type="guest_post", entity_id=gp.id, exclude=self.user.id,
        )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="guest_post.submitted",
            module="guest_post", entity_type="guest_post", entity_id=gp.id,
            new={"website_name": gp.website_name},
        )
        self.db.commit()
        self.db.refresh(gp)
        return gp

    def review(self, gp_id: uuid.UUID, approve: bool, note: str | None) -> GuestPost:
        if not is_manager(self.user):
            raise PermissionDenied("Only team leads or admins can review submissions")
        gp = self.get(gp_id)
        gp.review_status = "approved" if approve else "rejected"
        gp.reviewed_by = self.user.id
        gp.reviewed_at = datetime.now(UTC)
        notifier = Notifier(self.db)
        body = f"{self.user.full_name} {gp.review_status} '{gp.website_name or 'a website'}'."
        if note:
            body += f" Note: {note}"
        if gp.created_by and gp.created_by != self.user.id:
            notifier.notify(
                company_id=self.company_id, user_id=gp.created_by, type="review_decision",
                title=f"Submission {gp.review_status}", body=body,
                entity_type="guest_post", entity_id=gp.id,
            )
        notifier.notify_admins(
            company_id=self.company_id, type="review_decision",
            title=f"Guest post {gp.review_status}", body=body,
            entity_type="guest_post", entity_id=gp.id, exclude=self.user.id,
        )
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id,
            action=f"guest_post.{gp.review_status}", module="guest_post",
            entity_type="guest_post", entity_id=gp.id, new={"note": note} if note else None,
        )
        self.db.commit()
        self.db.refresh(gp)
        return gp

    def stats(self) -> dict:
        """Role-scoped Guest Post Links widgets."""
        scope = self._scope()
        base = [GuestPost.company_id == self.company_id, GuestPost.deleted_at.is_(None)]
        if scope is not None:
            base.append(
                or_(
                    GuestPost.assigned_user_id.in_(scope),
                    GuestPost.created_by.in_(scope),
                )
            )

        def count(*extra) -> int:
            return int(self.db.scalar(select(func.count()).select_from(GuestPost).where(*base, *extra)) or 0)

        now = datetime.now(UTC)
        total = count()
        published = count(GuestPost.status == "published")
        by_user_rows = self.db.execute(
            select(User.full_name, func.count())
            .join(GuestPost, GuestPost.created_by == User.id)
            .where(*base)
            .group_by(User.full_name)
            .order_by(func.count().desc())
            .limit(10)
        ).all()
        by_project_rows = self.db.execute(
            select(Project.name, func.count())
            .join(GuestPost, GuestPost.project_id == Project.id)
            .where(*base)
            .group_by(Project.name)
            .order_by(func.count().desc())
            .limit(10)
        ).all()
        this_month = count(
            func.extract("year", GuestPost.created_at) == now.year,
            func.extract("month", GuestPost.created_at) == now.month,
        )
        return {
            "total": total,
            "published": published,
            "pending": total - published,
            "this_month": this_month,
            "by_user": [{"name": n, "count": int(c)} for n, c in by_user_rows],
            "by_project": [{"name": n, "count": int(c)} for n, c in by_project_rows],
        }

    def delete(self, gp_id: uuid.UUID) -> None:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can delete guest posts")
        gp = self.get(gp_id)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="guest_post.deleted",
            module="guest_post",
            entity_type="guest_post",
            entity_id=gp.id,
            old={"website_name": gp.website_name},
        )
        gp.deleted_at = datetime.now(UTC)  # soft-delete -> Trash
        gp.deleted_by = self.user.id
        self.db.commit()

    # --- internals ---
    def _sync_assignment_task(self, gp: GuestPost) -> None:
        """Mirror the link's assignee as a Task so it shows on /tasks for them."""
        from app.services.auto_task import SOURCE_GUEST_POST, sync_assignment_task

        label = gp.website_name or gp.live_link or "link"
        where = f" for {gp.project.name}" if gp.project else ""
        description = f"Guest-post link{where}."
        if gp.live_link:
            description += f" {gp.live_link}"
        sync_assignment_task(
            self.db,
            self.user,
            company_id=self.company_id,
            source_type=SOURCE_GUEST_POST,
            source_id=gp.id,
            assigned_to=gp.assigned_user_id,
            name=f"Guest post: {label}"[:200],
            description=description,
            project_id=gp.project_id,
            due_date=gp.live_link_date,
        )

    def _apply_status(self, gp: GuestPost, new_status: str, note: str | None) -> None:
        old = gp.status
        gp.status = new_status
        self.db.add(
            GuestPostStatusHistory(
                guest_post_id=gp.id,
                from_status=old,
                to_status=new_status,
                changed_by=self.user.id,
                note=note,
            )
        )
        if new_status == "published" and old != "published":
            self._on_published(gp)
        else:
            self.activity.record(
                company_id=self.company_id,
                user_id=self.user.id,
                action="guest_post.status_changed",
                module="guest_post",
                entity_type="guest_post",
                entity_id=gp.id,
                new={"from": old, "to": new_status},
            )
        if new_status == "invoice_sent":
            Notifier(self.db).notify(
                company_id=self.company_id,
                user_id=gp.assigned_user_id,
                type="payment_due",
                title="Payment due",
                body=f"Invoice sent for '{gp.website_name or 'a guest post'}'.",
                entity_type="guest_post",
                entity_id=gp.id,
            )

    def _on_published(self, gp: GuestPost) -> None:
        """Automation: increment the project's monthly goal achieved count."""
        when = gp.live_link_date or datetime.now(UTC).date()
        goal = self.goals.get_month(gp.project_id, when.year, when.month)
        if goal is None:
            goal = ProjectMonthlyGoal(
                project_id=gp.project_id,
                year=when.year,
                month=when.month,
                goal_target=0,
                achieved=1,
            )
            self.db.add(goal)
        else:
            goal.achieved = (goal.achieved or 0) + 1
        notifier = Notifier(self.db)
        notifier.notify(
            company_id=self.company_id,
            user_id=gp.assigned_user_id,
            type="guest_post_published",
            title="Guest post published",
            body=f"'{gp.website_name or 'A guest post'}' is now live.",
            entity_type="guest_post",
            entity_id=gp.id,
        )
        if goal.goal_target and goal.achieved >= goal.goal_target and gp.project is not None:
            notifier.notify(
                company_id=self.company_id,
                user_id=gp.project.team_lead_id,
                type="goal_achieved",
                title="Monthly goal achieved",
                body=f"Project '{gp.project.name}' reached its link goal for "
                f"{when.year}-{when.month:02d}.",
                entity_type="project",
                entity_id=gp.project_id,
            )
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="guest_post.published",
            module="guest_post",
            entity_type="guest_post",
            entity_id=gp.id,
            new={"website_name": gp.website_name, "project_id": str(gp.project_id)},
        )
