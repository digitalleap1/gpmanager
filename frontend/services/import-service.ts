/**
 * Typed wrappers around the GPOMS Import Engine endpoints (`/imports`).
 *
 * Reads + the dry-run preview, commit, and rollback. Preview/commit post a
 * multipart body (the spreadsheet + the chosen `profile`) via
 * `uploadFileWithFields`; everything else is plain JSON through the `api`
 * client. Access is restricted to managers/admins on the backend.
 */

import { api } from "@/lib/api";
import { uploadFileWithFields } from "@/lib/file-transfer";
import type {
  ImportBatch,
  ImportBatchDetail,
  ImportProfile,
  PreviewReport,
} from "@/lib/types";

/** All importable entity presets. */
export function listProfiles(): Promise<ImportProfile[]> {
  return api.get<ImportProfile[]>("/imports/profiles");
}

/** Dry-run validate a spreadsheet against a profile — no records are written. */
export function previewImport(
  profile: string,
  file: File,
): Promise<PreviewReport> {
  return uploadFileWithFields<PreviewReport>("/imports/preview", file, {
    profile,
  });
}

/** Commit an import, writing records and returning the resulting batch. */
export function commitImport(
  profile: string,
  file: File,
): Promise<ImportBatchDetail> {
  return uploadFileWithFields<ImportBatchDetail>("/imports/commit", file, {
    profile,
  });
}

/** History of committed import batches, newest first. */
export function listImports(): Promise<ImportBatch[]> {
  return api.get<ImportBatch[]>("/imports");
}

/** Full detail (including per-row records) for one import batch. */
export function getImport(id: string): Promise<ImportBatchDetail> {
  return api.get<ImportBatchDetail>(`/imports/${id}`);
}

/** Roll back a committed import — created records are deleted. */
export function rollbackImport(id: string): Promise<ImportBatch> {
  return api.post<ImportBatch>(`/imports/${id}/rollback`, {});
}
