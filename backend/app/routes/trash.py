"""Trash routes: list soft-deleted records, restore, or permanently purge."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.common import Message
from app.schemas.trash import PurgeRequest, TrashItem
from app.services.trash import TrashService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[TrashItem])
def list_trash(user: CurrentUser, db: DbSession) -> list[TrashItem]:
    return TrashService(db, user).list()


@router.post("/{entity_type}/{entity_id}/restore", response_model=Message)
def restore_item(
    entity_type: str, entity_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> Message:
    TrashService(db, user).restore(entity_type, entity_id)
    return Message(detail="Restored")


@router.post("/{entity_type}/{entity_id}/purge", status_code=status.HTTP_204_NO_CONTENT)
def purge_item(
    entity_type: str,
    entity_id: uuid.UUID,
    body: PurgeRequest,
    user: CurrentUser,
    db: DbSession,
) -> None:
    TrashService(db, user).purge(entity_type, entity_id, body.password)
