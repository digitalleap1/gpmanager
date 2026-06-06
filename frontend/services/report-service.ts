/**
 * Typed wrappers around the generic GPOMS report endpoints (Module 10).
 *
 * The reports API is generic: every report is described by `columns` + `rows`,
 * so a single `runReport` / `exportReport` pair covers all four report types.
 * Both share one query-string builder so the JSON view and the CSV download
 * always agree on which filters are applied. Managers only — a 403 surfaces as
 * an `ApiError` for the page to render a friendly message.
 */

import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/file-transfer";
import type { ReportFilters, ReportResult, ReportType } from "@/lib/types";

type QueryValue = string | number | boolean | undefined | null;

/** Build a `?key=value` query string from defined (non-empty) params only. */
function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}

/** Shared filter -> query mapping for both the JSON and CSV calls. */
function filterQuery(filters: ReportFilters): Record<string, QueryValue> {
  return {
    date_from: filters.date_from,
    date_to: filters.date_to,
    project_id: filters.project_id,
    team_lead_id: filters.team_lead_id,
    country_id: filters.country_id,
    status: filters.status,
  };
}

/** Run a report and return its generic `{ columns, rows, totals }` payload. */
export function runReport(
  type: ReportType,
  filters: ReportFilters = {},
): Promise<ReportResult> {
  const qs = buildQuery({ ...filterQuery(filters), format: "json" });
  return api.get<ReportResult>(`/reports/${type}?${qs}`);
}

/** Trigger a CSV download of the same report (uses the bearer-aware helper). */
export function exportReport(
  type: ReportType,
  filters: ReportFilters = {},
): Promise<void> {
  const qs = buildQuery({ ...filterQuery(filters), format: "csv" });
  return downloadCsv(`/reports/${type}?${qs}`, `${type}-report.csv`);
}
