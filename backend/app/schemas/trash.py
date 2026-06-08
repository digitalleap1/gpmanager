"""Trash (soft-delete) DTOs."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TrashItem(BaseModel):
    entity_type: str
    id: uuid.UUID
    label: str
    deleted_at: datetime
    deleted_by: str | None


class PurgeRequest(BaseModel):
    # Re-auth confirmation for the irreversible permanent delete.
    password: str = Field(min_length=1)
