/**
 * Typed wrappers around the GPOMS Website Database endpoints (Module 6).
 *
 * Covers listing/filtering, CRUD, per-website contacts, and the CSV
 * import/export endpoints. JSON calls route through the shared `api` client;
 * the binary CSV endpoints go through the `file-transfer` helpers, which attach
 * the same bearer token but handle blobs / multipart bodies.
 */

import { api } from "@/lib/api";
import { downloadFile, uploadFile } from "@/lib/file-transfer";
import type {
  BulkImportResult,
  Page,
  WebsiteContact,
  WebsiteContactCreate,
  WebsiteCreate,
  WebsiteDetail,
  WebsiteListItem,
  WebsiteListParams,
  WebsiteUpdate,
} from "@/lib/types";

/** Bulk import/export file format accepted by the `/{entity}` endpoints. */
type FileFormat = "csv" | "xlsx";

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

/** Shared filter map used by both `GET /websites` and `/websites/export`. */
function filterQuery(params: WebsiteListParams): Record<string, QueryValue> {
  return {
    search: params.search,
    country_id: params.country_id,
    niche_id: params.niche_id,
    min_dr: params.min_dr,
    max_dr: params.max_dr,
    min_traffic: params.min_traffic,
    max_price: params.max_price,
    guest_post_available: params.guest_post_available,
    sort: params.sort,
  };
}

export function listWebsites(
  params: WebsiteListParams = {},
): Promise<Page<WebsiteListItem>> {
  const query: Record<string, QueryValue> = {
    page: params.page,
    page_size: params.page_size,
    ...filterQuery(params),
  };
  return api.get<Page<WebsiteListItem>>(`/websites${buildQuery(query)}`);
}

export function getWebsite(id: string): Promise<WebsiteDetail> {
  return api.get<WebsiteDetail>(`/websites/${id}`);
}

export function createWebsite(data: WebsiteCreate): Promise<WebsiteListItem> {
  return api.post<WebsiteListItem>("/websites", data);
}

export function updateWebsite(
  id: string,
  data: WebsiteUpdate,
): Promise<WebsiteListItem> {
  return api.patch<WebsiteListItem>(`/websites/${id}`, data);
}

export function removeWebsite(id: string): Promise<void> {
  return api.delete<void>(`/websites/${id}`);
}

export function addContact(
  id: string,
  body: WebsiteContactCreate,
): Promise<WebsiteContact> {
  return api.post<WebsiteContact>(`/websites/${id}/contacts`, body);
}

export function removeContact(id: string, contactId: string): Promise<void> {
  return api.delete<void>(`/websites/${id}/contacts/${contactId}`);
}

/**
 * Trigger a download (CSV or XLSX) of websites matching the active filters.
 * Defaults to CSV to preserve existing call sites.
 */
export function exportWebsites(
  params: WebsiteListParams = {},
  format: FileFormat = "csv",
): Promise<void> {
  const qs = buildQuery({ ...filterQuery(params), format });
  return downloadFile(`/websites/export${qs}`, `websites.${format}`);
}

/** Download a blank websites import template (CSV or XLSX). */
export function downloadWebsitesTemplate(
  format: FileFormat = "csv",
): Promise<void> {
  return downloadFile(
    `/websites/template${buildQuery({ format })}`,
    `websites-template.${format}`,
  );
}

/** Bulk-import websites from a `.csv` or `.xlsx` file (multipart upload). */
export function importWebsites(file: File): Promise<BulkImportResult> {
  return uploadFile<BulkImportResult>("/websites/import", file);
}
