"""Client management + client-level rollups (Phase 2 payments ledger).

Budget is stored on the client; paid / consumed / remaining / revenue and the
project counts are derived from linked payments + projects so they're always
correct. Managers read; managers create/update; admins delete.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_manager
from app.core.scope import accessible_user_ids
from app.models.client import Client
from app.models.payment import Payment
from app.models.project import Project
from app.models.user import User
from app.schemas.client import (
    ClientCreate,
    ClientDetail,
    ClientListItem,
    ClientMetrics,
    ClientUpdate,
)
from app.services.activity import ActivityLogger, jsonable


class ClientService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.activity = ActivityLogger(db)

    def _require_manager(self) -> None:
        if not is_manager(self.user):
            raise PermissionDenied()

    # --- aggregate maps (one query each, keyed by client_id) ---
    def _paid_map(self) -> dict[uuid.UUID, float]:
        rows = self.db.execute(
            select(Payment.client_id, func.coalesce(func.sum(Payment.amount_usd), 0))
            .where(
                Payment.company_id == self.company_id,
                Payment.client_id.is_not(None),
                Payment.status == "paid",
            )
            .group_by(Payment.client_id)
        ).all()
        return {row[0]: float(row[1]) for row in rows}

    def _pending_map(self) -> dict[uuid.UUID, float]:
        rows = self.db.execute(
            select(Payment.client_id, func.coalesce(func.sum(Payment.amount_usd), 0))
            .where(
                Payment.company_id == self.company_id,
                Payment.client_id.is_not(None),
                Payment.status == "pending",
            )
            .group_by(Payment.client_id)
        ).all()
        return {row[0]: float(row[1]) for row in rows}

    def _payment_counts(self) -> dict[uuid.UUID, int]:
        rows = self.db.execute(
            select(Payment.client_id, func.count())
            .where(Payment.company_id == self.company_id, Payment.client_id.is_not(None))
            .group_by(Payment.client_id)
        ).all()
        return {row[0]: int(row[1]) for row in rows}

    def _project_counts(self) -> dict[uuid.UUID, tuple[int, int, int]]:
        """client_id -> (total, active, completed)."""
        rows = self.db.execute(
            select(Project.client_id, Project.status, func.count())
            .where(Project.company_id == self.company_id, Project.client_id.is_not(None))
            .group_by(Project.client_id, Project.status)
        ).all()
        out: dict[uuid.UUID, list[int]] = {}
        for client_id, status, count in rows:
            entry = out.setdefault(client_id, [0, 0, 0])
            entry[0] += count
            if status == "active":
                entry[1] += count
            elif status == "completed":
                entry[2] += count
        return {k: (v[0], v[1], v[2]) for k, v in out.items()}

    def _metrics(self, client: Client, paid, pending, pay_counts, proj_counts) -> ClientMetrics:
        total_paid = paid.get(client.id, 0.0)
        budget = float(client.total_budget or 0)
        total, active, completed = proj_counts.get(client.id, (0, 0, 0))
        return ClientMetrics(
            total_budget=budget,
            total_paid=total_paid,
            consumed_budget=total_paid,
            remaining_budget=budget - total_paid,
            pending_amount=pending.get(client.id, 0.0),
            revenue=total_paid,
            project_count=total,
            active_projects=active,
            completed_projects=completed,
            payment_count=pay_counts.get(client.id, 0),
        )

    # --- reads ---
    def list(self) -> list[ClientListItem]:
        self._require_manager()
        stmt = select(Client).where(
            Client.company_id == self.company_id, Client.deleted_at.is_(None)
        )
        scope = accessible_user_ids(self.db, self.user)
        if scope is not None:
            # Non-admins see only clients they created or that hold a payment they
            # created / are attributed to.
            from app.models.payment import Payment

            owned_clients = select(Payment.client_id).where(
                Payment.company_id == self.company_id,
                Payment.client_id.is_not(None),
                or_(
                    Payment.created_by.in_(scope),
                    Payment.attributed_to_id.in_(scope),
                ),
            )
            stmt = stmt.where(
                or_(Client.created_by.in_(scope), Client.id.in_(owned_clients))
            )
        clients = self.db.scalars(stmt.order_by(Client.name)).all()
        paid = self._paid_map()
        counts = self._project_counts()
        items = []
        for c in clients:
            total_paid = paid.get(c.id, 0.0)
            budget = float(c.total_budget or 0)
            total = counts.get(c.id, (0, 0, 0))[0]
            items.append(
                ClientListItem(
                    id=c.id,
                    name=c.name,
                    currency=c.currency or "USD",
                    status=c.status,
                    total_budget=budget,
                    total_paid=total_paid,
                    remaining_budget=budget - total_paid,
                    project_count=total,
                    created_at=c.created_at,
                )
            )
        return items

    def _get(self, client_id: uuid.UUID) -> Client:
        client = self.db.get(Client, client_id)
        if (
            client is None
            or client.company_id != self.company_id
            or client.deleted_at is not None
        ):
            raise NotFound("Client not found")
        return client

    def detail(self, client_id: uuid.UUID) -> ClientDetail:
        self._require_manager()
        client = self._get(client_id)
        metrics = self._metrics(
            client, self._paid_map(), self._pending_map(),
            self._payment_counts(), self._project_counts(),
        )
        return ClientDetail(
            id=client.id,
            name=client.name,
            currency=client.currency or "USD",
            status=client.status,
            contact_name=client.contact_name,
            contact_email=client.contact_email,
            contact_phone=client.contact_phone,
            website=client.website,
            notes=client.notes,
            created_at=client.created_at,
            metrics=metrics,
        )

    # --- mutations ---
    def create(self, data: ClientCreate) -> Client:
        self._require_manager()
        name = data.name.strip()
        if self.db.scalars(
            select(Client).where(Client.company_id == self.company_id, Client.name == name)
        ).first() is not None:
            raise BadRequest(f"A client named '{name}' already exists")
        payload = data.model_dump()
        payload["name"] = name
        client = Client(company_id=self.company_id, created_by=self.user.id, **payload)
        self.db.add(client)
        self.db.flush()
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="client.created",
            module="client", entity_type="client", entity_id=client.id, new={"name": name},
        )
        self.db.commit()
        self.db.refresh(client)
        return client

    def update(self, client_id: uuid.UUID, data: ClientUpdate) -> Client:
        self._require_manager()
        client = self._get(client_id)
        changes = data.model_dump(exclude_unset=True)
        if "name" in changes and changes["name"]:
            new_name = changes["name"].strip()
            other = self.db.scalars(
                select(Client).where(
                    Client.company_id == self.company_id, Client.name == new_name
                )
            ).first()
            if other is not None and other.id != client.id:
                raise BadRequest(f"A client named '{new_name}' already exists")
            changes["name"] = new_name
        old = {k: getattr(client, k) for k in changes}
        for key, value in changes.items():
            setattr(client, key, value)
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="client.updated",
            module="client", entity_type="client", entity_id=client.id,
            old=jsonable(old), new=jsonable(changes),
        )
        self.db.commit()
        self.db.refresh(client)
        return client

    def delete(self, client_id: uuid.UUID) -> None:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can delete clients")
        client = self._get(client_id)
        client.deleted_at = datetime.now(timezone.utc)  # soft-delete -> Trash
        client.deleted_by = self.user.id
        self.activity.record(
            company_id=self.company_id, user_id=self.user.id, action="client.deleted",
            module="client", entity_type="client", entity_id=client.id, old={"name": client.name},
        )
        self.db.commit()
