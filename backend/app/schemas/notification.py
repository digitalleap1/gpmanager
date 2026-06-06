"""Notification DTOs (Module 9)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    title: str
    body: str | None
    entity_type: str | None
    entity_id: uuid.UUID | None
    is_read: bool
    created_at: datetime


class UnreadCount(BaseModel):
    count: int


class MarkAllResult(BaseModel):
    updated: int
