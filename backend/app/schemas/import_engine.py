"""DTOs for the import engine (profiles, preview report, batches)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.import_batch import ImportBatch, ImportRecord


class ProfileRead(BaseModel):
    key: str
    label: str
    description: str
    entity_type: str
    mapping: list[dict[str, str]]  # [{source, target}]


class PreviewIssue(BaseModel):
    level: str
    message: str


class PreviewRow(BaseModel):
    row_number: int
    status: str  # new | duplicate | invalid
    label: str
    source: str | None
    issues: list[PreviewIssue]
    values: dict[str, Any]


class PreviewReport(BaseModel):
    profile: str
    label: str
    entity_type: str
    source_filename: str | None
    mapping: list[dict[str, str]]
    total_rows: int
    new_count: int
    duplicate_count: int
    invalid_count: int
    warning_count: int
    rows: list[PreviewRow]
    truncated: bool


class ImportRecordRead(BaseModel):
    row_number: int
    action: str
    entity_id: uuid.UUID | None
    message: str | None

    @classmethod
    def from_record(cls, r: ImportRecord) -> ImportRecordRead:
        return cls(
            row_number=r.row_number,
            action=r.action,
            entity_id=r.entity_id,
            message=r.message,
        )


class ImportBatchRead(BaseModel):
    id: uuid.UUID
    profile: str
    entity_type: str
    source_filename: str | None
    status: str
    created_count: int
    updated_count: int
    skipped_count: int
    error_count: int
    created_at: datetime

    @classmethod
    def from_batch(cls, b: ImportBatch) -> ImportBatchRead:
        return cls(
            id=b.id,
            profile=b.profile,
            entity_type=b.entity_type,
            source_filename=b.source_filename,
            status=b.status,
            created_count=b.created_count,
            updated_count=b.updated_count,
            skipped_count=b.skipped_count,
            error_count=b.error_count,
            created_at=b.created_at,
        )


class ImportBatchDetail(ImportBatchRead):
    records: list[ImportRecordRead]

    @classmethod
    def from_batch_detail(cls, b: ImportBatch) -> ImportBatchDetail:
        base = ImportBatchRead.from_batch(b).model_dump()
        return cls(
            **base,
            records=[ImportRecordRead.from_record(r) for r in b.records],
        )
