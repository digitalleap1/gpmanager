"""Client persistence queries."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select

from app.models.client import Client
from app.repositories.base import BaseRepository


class ClientRepository(BaseRepository[Client]):
    model = Client

    def list_for_company(self, company_id: uuid.UUID) -> Sequence[Client]:
        return self.db.scalars(
            select(Client).where(Client.company_id == company_id).order_by(Client.name)
        ).all()

    def get_for_company(self, client_id: uuid.UUID, company_id: uuid.UUID) -> Client | None:
        client = self.get(client_id)
        if client is None or client.company_id != company_id:
            return None
        return client

    def get_by_name(self, name: str, company_id: uuid.UUID) -> Client | None:
        return self.db.scalars(
            select(Client).where(Client.company_id == company_id, Client.name == name)
        ).first()
