/**
 * Typed wrappers around the GPOMS trash endpoints (`/trash`).
 *
 * Lists soft-deleted records (admins see all; others see only what they
 * deleted), restores them, or — for admins, with a password confirmation —
 * permanently purges them.
 */

import { api } from "@/lib/api";
import type { MessageResponse, TrashItem } from "@/lib/types";

/** Soft-deleted records the caller is allowed to see. */
export function listTrash(): Promise<TrashItem[]> {
  return api.get<TrashItem[]>("/trash");
}

/** Restore a soft-deleted record back into its module. */
export function restoreTrash(
  entityType: string,
  id: string,
): Promise<MessageResponse> {
  return api.post<MessageResponse>(`/trash/${entityType}/${id}/restore`, {});
}

/**
 * Permanently delete a soft-deleted record. Admin only; requires the admin's
 * password. A wrong password surfaces as a 400 `ApiError` with a `detail`.
 */
export function purgeTrash(
  entityType: string,
  id: string,
  password: string,
): Promise<void> {
  return api.post<void>(`/trash/${entityType}/${id}/purge`, { password });
}
