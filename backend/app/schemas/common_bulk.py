"""Shared DTOs for bulk import results (used by every module's importer)."""

from pydantic import BaseModel


class ImportError(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    created: int
    updated: int
    errors: list[ImportError]
