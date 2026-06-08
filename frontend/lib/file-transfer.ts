/**
 * Helpers for the authenticated *binary* GPOMS endpoints.
 *
 * The JSON `api` client in `lib/api.ts` always sets `Content-Type: application/json`
 * and parses the response as JSON, so it can't be used for the CSV
 * download/upload endpoints. These helpers attach the same bearer token but
 * stream blobs / multipart bodies instead.
 */

import { ApiError } from "./api";
import { getAccessToken } from "./auth-tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

/** Best-effort extraction of a `{ detail }` error message from a response. */
async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    if (body.detail) return body.detail;
  } catch {
    // Non-JSON error body — fall through to the status text.
  }
  return response.statusText || `Request failed (${response.status})`;
}

/**
 * Pull a filename out of a `Content-Disposition` header, if present. Handles
 * both `filename="x.csv"` and RFC 5987 `filename*=UTF-8''x.csv` forms. Returns
 * `null` when no usable filename is found.
 */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  // Prefer the RFC 5987 extended form, which may be percent-encoded.
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // Fall through to the plain form.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

/** Trigger a browser download for an already-fetched blob. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Download an authenticated endpoint as a file. Works for any binary payload
 * (CSV *or* XLSX): fetches the response as a blob, derives the filename from the
 * `Content-Disposition` header when present (else `fallbackName`), then triggers
 * the browser download. Throws an `ApiError` on a non-ok response.
 */
export async function downloadFile(
  path: string,
  fallbackName: string,
): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }

  const filename =
    filenameFromDisposition(response.headers.get("Content-Disposition")) ??
    fallbackName;
  saveBlob(await response.blob(), filename);
}

/**
 * Download an authenticated endpoint as a file using the provided filename as a
 * fallback. Thin wrapper kept for backwards compatibility — `downloadFile` now
 * handles both CSV and XLSX payloads.
 */
export function downloadCsv(path: string, filename: string): Promise<void> {
  return downloadFile(path, filename);
}

/**
 * POST a single file to an authenticated multipart endpoint. The browser sets
 * the `multipart/form-data` boundary automatically, so we deliberately do NOT
 * set `Content-Type`. Parses + returns the JSON body; throws `ApiError` on a
 * non-ok response.
 */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
    body: form,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }

  return (await response.json()) as T;
}
