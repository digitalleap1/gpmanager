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
 * Download an authenticated endpoint as a file. Fetches the response as a blob,
 * creates a temporary object URL + anchor, clicks it to trigger the browser
 * download, then revokes the URL. Throws an `ApiError` on a non-ok response.
 */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }

  const blob = await response.blob();
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
