"""Import engine (Phase 2): preview, commit, list, and rollback.

Preview is a pure dry-run (validation + duplicate detection, no writes). Commit
applies each valid row inside its own savepoint and records a full audit trail
(``ImportBatch`` + ``ImportRecord``) including raw values, so a batch can be
rolled back: created rows are deleted and updated rows are restored from their
stored snapshot.
"""

from __future__ import annotations

import contextlib
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_manager
from app.models.import_batch import ImportBatch, ImportRecord
from app.models.payment import Payment
from app.models.project import Project
from app.models.user import User
from app.schemas.import_engine import (
    PreviewIssue,
    PreviewReport,
    PreviewRow,
)
from app.services.activity import ActivityLogger
from app.services.import_profiles import ExtractedRow, get_profile

PREVIEW_ROW_CAP = 200
ENTITY_MODELS = {"project": Project, "payment": Payment}


class ImportEngine:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.activity = ActivityLogger(db)

    def _require_manager(self) -> None:
        if not is_manager(self.user):
            raise PermissionDenied("Only managers can import data")

    # --- preview (no writes) ---
    def preview(self, profile_key: str, filename: str, content: bytes) -> PreviewReport:
        self._require_manager()
        profile = get_profile(profile_key)
        extracted = profile.extract(filename, content)
        ctx = profile.build_context(self.db, self.company_id)

        rows: list[PreviewRow] = []
        new_count = duplicate_count = invalid_count = warning_count = 0
        for ex in extracted:
            issues = profile.validate(ex.canonical, ctx)
            has_error = any(i.level == "error" for i in issues)
            warnings = [i for i in issues if i.level == "warning"]
            warning_count += len(warnings)
            key = profile.dedupe_key(ex.canonical)
            exists = profile.exists(key, ctx)
            if has_error:
                status = "invalid"
                invalid_count += 1
            elif exists:
                status = "duplicate"
                duplicate_count += 1
            else:
                status = "new"
                new_count += 1
            if len(rows) < PREVIEW_ROW_CAP:
                rows.append(
                    PreviewRow(
                        row_number=ex.row_number,
                        status=status,
                        label=str(ex.canonical.get("name") or "(unnamed)"),
                        source=ex.source,
                        issues=[PreviewIssue(level=i.level, message=i.message) for i in issues],
                        values=self._preview_values(ex),
                    )
                )

        return PreviewReport(
            profile=profile.key,
            label=profile.label,
            entity_type=profile.entity_type,
            source_filename=filename,
            mapping=[{"source": src, "target": tgt} for tgt, src in profile.column_mapping.items()],
            total_rows=len(extracted),
            new_count=new_count,
            duplicate_count=duplicate_count,
            invalid_count=invalid_count,
            warning_count=warning_count,
            rows=rows,
            truncated=len(extracted) > PREVIEW_ROW_CAP,
        )

    @staticmethod
    def _preview_values(ex: ExtractedRow) -> dict:
        out = {}
        for key, value in ex.canonical.items():
            out[key] = value.isoformat() if hasattr(value, "isoformat") else value
        return out

    # --- commit (writes + audit) ---
    def commit(self, profile_key: str, filename: str, content: bytes) -> ImportBatch:
        self._require_manager()
        profile = get_profile(profile_key)
        extracted = profile.extract(filename, content)
        ctx = profile.build_context(self.db, self.company_id)

        batch = ImportBatch(
            company_id=self.company_id,
            profile=profile.key,
            entity_type=profile.entity_type,
            source_filename=filename,
            status="committed",
            created_by=self.user.id,
        )
        self.db.add(batch)
        self.db.flush()

        created = updated = skipped = errors = 0
        for ex in extracted:
            issues = profile.validate(ex.canonical, ctx)
            errors_msgs = [i.message for i in issues if i.level == "error"]
            warn_msgs = [i.message for i in issues if i.level == "warning"]
            if errors_msgs:
                errors += 1
                self.db.add(self._record(batch, ex, "error", None, None, "; ".join(errors_msgs)))
                continue
            key = profile.dedupe_key(ex.canonical)
            if getattr(profile, "on_duplicate", "update") == "skip" and profile.exists(key, ctx):
                skipped += 1
                self.db.add(
                    self._record(batch, ex, "skipped", None, key, "duplicate — already imported")
                )
                continue
            try:
                with self.db.begin_nested():
                    outcome = profile.apply(
                        self.db, self.company_id, self.user.id, ex.canonical, ctx
                    )
            except Exception as exc:  # noqa: BLE001 - per-row isolation
                errors += 1
                self.db.add(self._record(batch, ex, "error", None, None, str(exc)))
                continue
            if outcome.action == "created":
                created += 1
            else:
                updated += 1
            record = self._record(
                batch, ex, outcome.action, outcome.entity_id,
                profile.dedupe_key(ex.canonical), "; ".join(warn_msgs) or None,
            )
            record.old_snapshot = outcome.old_snapshot
            self.db.add(record)

        batch.created_count = created
        batch.updated_count = updated
        batch.skipped_count = skipped
        batch.error_count = errors
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="import.committed",
            module="import",
            entity_type="import_batch",
            entity_id=batch.id,
            new={"profile": profile.key, "created": created, "updated": updated, "errors": errors},
        )
        self.db.commit()
        self.db.refresh(batch)
        return batch

    def _record(
        self, batch: ImportBatch, ex: ExtractedRow, action: str,
        entity_id: uuid.UUID | None, dedupe_key: str | None, message: str | None,
    ) -> ImportRecord:
        return ImportRecord(
            batch_id=batch.id,
            row_number=ex.row_number,
            action=action,
            entity_type=batch.entity_type,
            entity_id=entity_id,
            dedupe_key=dedupe_key,
            message=message,
            raw=ex.raw,
        )

    # --- list / detail / rollback ---
    def list_batches(self) -> list[ImportBatch]:
        self._require_manager()
        return list(
            self.db.scalars(
                select(ImportBatch)
                .where(ImportBatch.company_id == self.company_id)
                .order_by(ImportBatch.created_at.desc())
            ).all()
        )

    def get_batch(self, batch_id: uuid.UUID) -> ImportBatch:
        self._require_manager()
        batch = self.db.get(ImportBatch, batch_id)
        if batch is None or batch.company_id != self.company_id:
            raise NotFound("Import batch not found")
        return batch

    def rollback(self, batch_id: uuid.UUID) -> ImportBatch:
        self._require_manager()
        batch = self.get_batch(batch_id)
        if batch.status == "rolled_back":
            raise BadRequest("This import has already been rolled back")
        model = ENTITY_MODELS.get(batch.entity_type)
        if model is None:
            raise BadRequest(f"Rollback not supported for '{batch.entity_type}'")

        reverted = 0
        for record in batch.records:
            if record.entity_id is None:
                continue
            entity = self.db.get(model, record.entity_id)
            if entity is None:
                continue
            if record.action == "created":
                self.db.delete(entity)
                reverted += 1
            elif record.action == "updated" and record.old_snapshot:
                self._restore(entity, record.old_snapshot)
                reverted += 1

        batch.status = "rolled_back"
        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="import.rolled_back",
            module="import",
            entity_type="import_batch",
            entity_id=batch.id,
            new={"reverted": reverted},
        )
        self.db.commit()
        self.db.refresh(batch)
        return batch

    @staticmethod
    def _restore(entity: object, snapshot: dict) -> None:
        for key, value in snapshot.items():
            if key.endswith("_id") and isinstance(value, str):
                with contextlib.suppress(ValueError):
                    value = uuid.UUID(value)
            setattr(entity, key, value)
