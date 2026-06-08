"""Payment Management logic (Module 7), including the paid->budget automation that
adds a paid amount to the project's monthly `spent_amount` (Module 4 link).
"""

from __future__ import annotations  # lazy annotations: the `list` method must not shadow list[...]

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.currencies import CURRENCY_CODES, DEFAULT_CURRENCY
from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_admin, is_manager
from app.core.scope import accessible_user_ids
from app.models.payment import Payment, PaymentStatusHistory
from app.models.project import Project, ProjectMonthlyBudget
from app.models.user import User
from app.models.website import Website
from app.repositories.payment import PaymentRepository
from app.repositories.project import BudgetRepository
from app.schemas.common_bulk import ImportResult
from app.schemas.payment import PAYMENT_STATUSES, PaymentCreate, PaymentUpdate
from app.services.activity import ActivityLogger, jsonable
from app.services.bulk import (
    normalize_format,
    parse_bool,
    parse_date,
    parse_number,
    parse_table,
)
from app.services.bulk import run_row_imports
from app.services.bulk import template as build_template
from app.services.bulk import write_table
from app.services.notification import Notifier

# Import/export template columns (also the round-trip export shape).
PAYMENT_COLUMNS = [
    "project", "website", "live_link", "currency", "amount", "fx_to_usd",
    "mode_of_payment", "payment_date", "transaction_id", "status", "remarks",
    "notified",
]
PAYMENT_TEMPLATE_EXAMPLE = [
    "Acme SaaS", "example.com", "https://blog.example.com/guest-post", "USD", "50",
    "", "PayPal", "2026-03-15", "INV-1029", "paid", "Tier 1 link", "true",
]


class PaymentService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.payments = PaymentRepository(db)
        self.budgets = BudgetRepository(db)
        self.activity = ActivityLogger(db)

    def _scope(self) -> set[uuid.UUID] | None:
        return accessible_user_ids(self.db, self.user)

    def _can_edit(self, p: Payment) -> bool:
        return is_manager(self.user) or p.created_by == self.user.id

    def list(self, **filters) -> tuple[list[Payment], int]:
        items, total = self.payments.list_payments(
            self.company_id, restrict_to_users=self._scope(), **filters
        )
        return list(items), total

    def get(self, payment_id: uuid.UUID) -> Payment:
        p = self.payments.get_for_company(payment_id, self.company_id)
        if p is None:
            raise NotFound("Payment not found")
        users = self._scope()
        if users is not None and p.created_by not in users and p.attributed_to_id not in users:
            raise NotFound("Payment not found")
        return p

    def _normalize_money(self, payload: dict, existing: Payment | None = None) -> dict:
        """Derive amount_usd from native amount * fx_to_usd (USD => rate 1).

        Only recomputes when a money field is part of ``payload``; otherwise the
        posted ``amount_usd`` is left untouched (back-compat with older clients).
        """
        if not any(k in payload for k in ("amount", "currency", "fx_to_usd")):
            return payload

        def merged(key: str):
            if key in payload:
                return payload[key]
            if existing is None:
                return None
            val = getattr(existing, key)
            return float(val) if isinstance(val, Decimal) else val

        currency = (merged("currency") or "USD").upper()
        amount = merged("amount")
        fx = merged("fx_to_usd")
        payload["currency"] = currency
        if amount is not None:
            if currency == "USD":
                payload["fx_to_usd"] = 1.0
                payload["amount_usd"] = round(float(amount), 2)
            elif fx is not None:
                payload["fx_to_usd"] = fx
                payload["amount_usd"] = round(float(amount) * float(fx), 2)
        return payload

    def create(self, data: PaymentCreate) -> Payment:
        payload = self._normalize_money(data.model_dump())
        p = Payment(company_id=self.company_id, created_by=self.user.id, **payload)
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
            new={
                "amount_usd": payload.get("amount_usd"),
                "currency": payload.get("currency"),
                "status": p.status,
            },
        )
        Notifier(self.db).notify_admins(
            company_id=self.company_id,
            type="payment_created",
            title="Payment recorded",
            body=f"{self.user.full_name} recorded a payment ({p.status}).",
            entity_type="payment",
            entity_id=p.id,
            exclude=self.user.id,
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
        changes = self._normalize_money(changes, existing=p)
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
        if new_status == "paid" and p.approved_by is None:
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
        # Oversight: every payment status change pings the admins.
        Notifier(self.db).notify_admins(
            company_id=self.company_id,
            type="payment_status",
            title=f"Payment marked {new_status}",
            body=f"{self.user.full_name} changed a payment from '{old}' to '{new_status}'.",
            entity_type="payment",
            entity_id=p.id,
            exclude=self.user.id,
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
        if p.project is not None and p.project.team_lead_id:
            Notifier(self.db).notify(
                company_id=self.company_id,
                user_id=p.project.team_lead_id,
                type="payment_completed",
                title="Payment completed",
                body=f"A payment was marked paid for project '{p.project.name}'.",
                entity_type="payment",
                entity_id=p.id,
            )
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

    # --- bulk import / export (CSV + XLSX) ---
    def _export_rows(self, **filters) -> list[list[object]]:
        rows = self.payments.all_for_export(
            self.company_id, restrict_to_users=self._scope(), **filters
        )
        return [
            [
                p.project.name if p.project else "",
                p.website.domain if p.website else "",
                p.live_link or "",
                p.currency or "USD",
                "" if p.amount is None else float(p.amount),
                "" if p.fx_to_usd is None else float(p.fx_to_usd),
                p.mode_of_payment or "",
                p.payment_date.isoformat() if p.payment_date else "",
                p.transaction_id or "",
                p.status,
                p.remarks or "",
                "true" if p.notified else "false",
            ]
            for p in rows
        ]

    def export(self, fmt: str, **filters) -> tuple[bytes, str, str]:
        return write_table(PAYMENT_COLUMNS, self._export_rows(**filters), normalize_format(fmt))

    @staticmethod
    def template(fmt: str) -> tuple[bytes, str, str]:
        return build_template(PAYMENT_COLUMNS, PAYMENT_TEMPLATE_EXAMPLE, normalize_format(fmt))

    def import_file(self, filename: str, content: bytes) -> ImportResult:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can import payments")
        rows = parse_table(filename, content)
        if not rows:
            raise BadRequest("The file has no data rows")
        projects = {
            p.name.strip().lower(): p
            for p in self.db.scalars(
                select(Project).where(Project.company_id == self.company_id)
            ).all()
        }
        websites = {
            w.domain.strip().lower(): w
            for w in self.db.scalars(
                select(Website).where(Website.company_id == self.company_id)
            ).all()
        }
        result = run_row_imports(
            self.db, rows, lambda row: self._import_row(row, projects, websites)
        )
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="payment.imported",
            module="payment",
            entity_type="payment",
            entity_id=None,
            new={"created": result.created, "errors": len(result.errors)},
        )
        self.db.commit()
        return result

    def _import_row(self, row: dict, projects: dict, websites: dict) -> bool:
        def cell(*names: str) -> str:
            for name in names:
                if name in row and row[name] != "":
                    return row[name]
            return ""

        project_name = cell("project", "project_name").strip()
        project = projects.get(project_name.lower()) if project_name else None
        if project_name and project is None:
            raise ValueError(f"Unknown project '{project_name}'")

        domain = cell("website", "website_domain", "domain").strip().lower()
        website = websites.get(domain) if domain else None
        if domain and website is None:
            raise ValueError(f"Unknown website '{domain}'")

        currency = (cell("currency") or DEFAULT_CURRENCY).upper()
        if currency not in CURRENCY_CODES:
            raise ValueError(f"Unsupported currency '{currency}'")
        status = (cell("status") or "pending").lower()
        if status not in PAYMENT_STATUSES:
            raise ValueError(f"Invalid status '{status}'")

        payload = self._normalize_money(
            {
                "currency": currency,
                "amount": parse_number(cell("amount")),
                "fx_to_usd": parse_number(cell("fx_to_usd", "rate")),
            }
        )
        payment = Payment(
            company_id=self.company_id,
            created_by=self.user.id,
            project_id=project.id if project else None,
            website_id=website.id if website else None,
            live_link=cell("live_link", "live link") or None,
            currency=payload["currency"],
            amount=payload.get("amount"),
            fx_to_usd=payload.get("fx_to_usd"),
            amount_usd=payload.get("amount_usd"),
            mode_of_payment=cell("mode_of_payment", "mode") or None,
            payment_date=parse_date(cell("payment_date", "date")),
            transaction_id=cell("transaction_id", "txn") or None,
            remarks=cell("remarks", "notes") or None,
            status=status,
            notified=parse_bool(cell("notified")),
        )
        self.db.add(payment)
        self.db.flush()
        self.db.add(
            PaymentStatusHistory(
                payment_id=payment.id,
                from_status=None,
                to_status=status,
                changed_by=self.user.id,
                note="imported",
            )
        )
        return True
