"""Payment Management logic (Module 7), including the paid->budget automation that
adds a paid amount to the project's monthly `spent_amount` (Module 4 link).
"""

from __future__ import annotations  # lazy annotations: the `list` method must not shadow list[...]

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import NotFound, PermissionDenied
from app.core.permissions import is_admin, is_manager
from app.models.payment import Payment, PaymentStatusHistory
from app.models.project import ProjectMonthlyBudget
from app.models.user import User
from app.repositories.payment import PaymentRepository
from app.repositories.project import BudgetRepository
from app.schemas.payment import PaymentCreate, PaymentUpdate
from app.services.activity import ActivityLogger, jsonable


class PaymentService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.payments = PaymentRepository(db)
        self.budgets = BudgetRepository(db)
        self.activity = ActivityLogger(db)

    def _restrict_user_id(self) -> uuid.UUID | None:
        return None if is_manager(self.user) else self.user.id

    def _can_edit(self, p: Payment) -> bool:
        return is_manager(self.user) or p.created_by == self.user.id

    def list(self, **filters) -> tuple[list[Payment], int]:
        items, total = self.payments.list_payments(
            self.company_id, restrict_user_id=self._restrict_user_id(), **filters
        )
        return list(items), total

    def get(self, payment_id: uuid.UUID) -> Payment:
        p = self.payments.get_for_company(payment_id, self.company_id)
        if p is None:
            raise NotFound("Payment not found")
        if self._restrict_user_id() is not None and p.created_by != self.user.id:
            raise NotFound("Payment not found")
        return p

    def create(self, data: PaymentCreate) -> Payment:
        p = Payment(company_id=self.company_id, created_by=self.user.id, **data.model_dump())
        self.payments.add(p)
        self.db.add(
            PaymentStatusHistory(
                payment_id=p.id,
                from_status=None,
                to_status=p.status,
                changed_by=self.user.id,
                note="created",
            )
        )
        if p.status == "paid":
            self._on_paid(p)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="payment.created",
            module="payment",
            entity_type="payment",
            entity_id=p.id,
            new={"amount_usd": data.amount_usd, "status": p.status},
        )
        self.db.commit()
        self.db.refresh(p)
        return p

    def update(self, payment_id: uuid.UUID, data: PaymentUpdate) -> Payment:
        p = self.get(payment_id)
        if not self._can_edit(p):
            raise PermissionDenied()
        changes = data.model_dump(exclude_unset=True)
        new_status = changes.pop("status", None)
        old = {key: getattr(p, key) for key in changes}
        for key, value in changes.items():
            setattr(p, key, value)
        if new_status is not None and new_status != p.status:
            if not is_manager(self.user):
                raise PermissionDenied("Only managers can change payment status")
            self._apply_status(p, new_status, None)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="payment.updated",
            module="payment",
            entity_type="payment",
            entity_id=p.id,
            old=jsonable(old),
            new=jsonable(changes),
        )
        self.db.commit()
        self.db.refresh(p)
        return p

    def set_status(self, payment_id: uuid.UUID, status: str, note: str | None) -> Payment:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can change payment status")
        p = self.get(payment_id)
        if status != p.status:
            self._apply_status(p, status, note)
            self.db.commit()
            self.db.refresh(p)
        return p

    def delete(self, payment_id: uuid.UUID) -> None:
        if not is_admin(self.user):
            raise PermissionDenied("Only admins can delete payments")
        p = self.get(payment_id)
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="payment.deleted",
            module="payment",
            entity_type="payment",
            entity_id=p.id,
            old={"amount_usd": float(p.amount_usd) if p.amount_usd is not None else None},
        )
        self.payments.delete(p)
        self.db.commit()

    # --- internals ---
    def _apply_status(self, p: Payment, new_status: str, note: str | None) -> None:
        old = p.status
        p.status = new_status
        if new_status in ("approved", "paid") and p.approved_by is None:
            p.approved_by = self.user.id
        self.db.add(
            PaymentStatusHistory(
                payment_id=p.id,
                from_status=old,
                to_status=new_status,
                changed_by=self.user.id,
                note=note,
            )
        )
        if new_status == "paid" and old != "paid":
            self._on_paid(p)
        else:
            self.activity.record(
                company_id=self.company_id,
                user_id=self.user.id,
                action="payment.status_changed",
                module="payment",
                entity_type="payment",
                entity_id=p.id,
                new={"from": old, "to": new_status},
            )

    def _on_paid(self, p: Payment) -> None:
        """Automation: add the paid amount to the project's monthly spent budget."""
        amount = p.amount_usd
        if p.project_id is not None and amount is not None:
            when = p.payment_date or datetime.now(timezone.utc).date()
            budget = self.budgets.get_month(p.project_id, when.year, when.month)
            if budget is None:
                budget = ProjectMonthlyBudget(
                    project_id=p.project_id,
                    year=when.year,
                    month=when.month,
                    budget_amount=0,
                    spent_amount=amount,
                )
                self.db.add(budget)
            else:
                budget.spent_amount = (budget.spent_amount or 0) + amount
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="payment.paid",
            module="payment",
            entity_type="payment",
            entity_id=p.id,
            new={
                "amount_usd": float(amount) if amount is not None else None,
                "project_id": str(p.project_id) if p.project_id else None,
            },
        )
