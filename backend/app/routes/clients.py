"""Client routes (Phase 2 payments ledger): /api/clients/*.

Managers read + create/update; admins delete. Client metrics (paid / consumed /
remaining / revenue / project counts) are computed in the service.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.client import (
    ClientCreate,
    ClientDetail,
    ClientListItem,
    ClientUpdate,
)
from app.services.client import ClientService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[ClientListItem])
def list_clients(user: CurrentUser, db: DbSession) -> list[ClientListItem]:
    return ClientService(db, user).list()


@router.post("", response_model=ClientDetail, status_code=status.HTTP_201_CREATED)
def create_client(payload: ClientCreate, user: CurrentUser, db: DbSession) -> ClientDetail:
    client = ClientService(db, user).create(payload)
    return ClientService(db, user).detail(client.id)


@router.get("/{client_id}", response_model=ClientDetail)
def get_client(client_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ClientDetail:
    return ClientService(db, user).detail(client_id)


@router.patch("/{client_id}", response_model=ClientDetail)
def update_client(
    client_id: uuid.UUID, payload: ClientUpdate, user: CurrentUser, db: DbSession
) -> ClientDetail:
    ClientService(db, user).update(client_id, payload)
    return ClientService(db, user).detail(client_id)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    ClientService(db, user).delete(client_id)
