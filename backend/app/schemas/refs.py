"""Tiny shared reference DTOs used across modules."""

import uuid

from pydantic import BaseModel


class UserRef(BaseModel):
    id: uuid.UUID
    full_name: str
