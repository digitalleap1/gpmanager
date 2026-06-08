/**
 * Typed wrapper around the GPOMS audit-log endpoint (`/audit-logs`).
 *
 * Read-only and admin-only on the backend (returns 403 for non-admins).
 */

import { api } from "@/lib/api";
import type { AuditLogListParams, AuditLogRead, Page } from "@/lib/types";

type QueryValue = string | number | boolean | undefined | null;

/** Build a `?key=value` query string from defined params only. */
function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Paginated, filterable audit trail (newest first on the backend). */
export function listAuditLogs(
  params: AuditLogListParams = {},
): Promise<Page<AuditLogRead>> {
  const query: Record<string, QueryValue> = {
    page: params.page,
    page_size: params.page_size,
    module: params.module,
    action: params.action,
    user_id: params.user_id,
  };
  return api.get<Page<AuditLogRead>>(`/audit-logs${buildQuery(query)}`);
}
