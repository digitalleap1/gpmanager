"""Import engine routes (Phase 2): profiles, preview, commit, logs, rollback.

Managers only (enforced in the engine). Preview is a dry-run; commit writes +
records an auditable batch that can be rolled back.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.import_engine import (
    ImportBatchDetail,
    ImportBatchRead,
    PreviewReport,
    ProfileRead,
)
from app.services.import_engine import ImportEngine
from app.services.import_profiles import list_profiles

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/profiles", response_model=list[ProfileRead])
def get_profiles(user: CurrentUser) -> list[ProfileRead]:
    return [
        ProfileRead(
            key=p.key,
            label=p.label,
            description=p.description,
            entity_type=p.entity_type,
            mapping=[{"source": src, "target": tgt} for tgt, src in p.column_mapping.items()],
        )
        for p in list_profiles()
    ]


@router.post("/preview", response_model=PreviewReport)
async def preview_import(
    user: CurrentUser,
    db: DbSession,
    profile: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
) -> PreviewReport:
    content = await file.read()
    return ImportEngine(db, user).preview(profile, file.filename or "upload", content)


@router.post("/commit", response_model=ImportBatchDetail)
async def commit_import(
    user: CurrentUser,
    db: DbSession,
    profile: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
) -> ImportBatchDetail:
    content = await file.read()
    batch = ImportEngine(db, user).commit(profile, file.filename or "upload", content)
    return ImportBatchDetail.from_batch_detail(batch)


@router.get("", response_model=list[ImportBatchRead])
def list_imports(user: CurrentUser, db: DbSession) -> list[ImportBatchRead]:
    return [ImportBatchRead.from_batch(b) for b in ImportEngine(db, user).list_batches()]


@router.get("/{batch_id}", response_model=ImportBatchDetail)
def get_import(batch_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ImportBatchDetail:
    return ImportBatchDetail.from_batch_detail(ImportEngine(db, user).get_batch(batch_id))


@router.post("/{batch_id}/rollback", response_model=ImportBatchRead)
def rollback_import(batch_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ImportBatchRead:
    return ImportBatchRead.from_batch(ImportEngine(db, user).rollback(batch_id))
