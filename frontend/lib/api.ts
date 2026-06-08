/**
 * Minimal typed fetch wrapper around the GPOMS REST API.
 *
 * Behaviour added in Module 1:
 *  - Injects `Authorization: Bearer <access>` when a token is stored.
 *  - On a 401, attempts a single refresh via POST /auth/refresh, stores the
 *    new tokens, and retries the original request once. If refresh fails the
 *    tokens are cleared and the original error is rethrown.
 */

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./auth-tokens";

/**
 * Resolve the API base URL.
 *
 * Defaults to the local backend on :8010. The important bit: if the API is
 * configured for `localhost`/`127.0.0.1` but the app is actually being served
 * from another host (e.g. you opened it on a second device via the machine's
 * LAN IP like http://192.168.1.20:3000), point the API at that same host —
 * otherwise the browser's `fetch` would hit *its own* localhost, which has no
 * backend, and every login would fail. This is the usual cause of
 * "works on my PC, can't log in from another browser/device".
 */
function resolveApiBase(): string {
  const configured =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010/api";
  if (typeof window === "undefined") return configured;
  try {
    const url = new URL(configured);
    const pageHost = window.location.hostname;
    const apiIsLocal =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const pageIsLocal =
      pageHost === "localhost" || pageHost === "127.0.0.1";
    if (apiIsLocal && !pageIsLocal) {
      url.hostname = pageHost;
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    // Malformed env value — fall back to the configured string as-is.
  }
  return configured;
}

const API_URL = resolveApiBase();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * `fetch`, but a network-level failure (server down, wrong host, CORS, offline)
 * becomes an `ApiError(0, …)` with a clear message instead of a bare TypeError,
 * so the UI can tell "can't reach the server" apart from "wrong password".
 */
async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(
      0,
      `Can't reach the server at ${API_URL}. Make sure the backend is running and reachable from this device.`,
    );
  }
}

/** Build headers, merging caller overrides and the bearer token (if any). */
function buildHeaders(options: RequestInit): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getAccessToken();
  if (token && !("Authorization" in headers)) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Exchange the stored refresh token for a fresh token pair.
 * Returns the new access token, or null on failure (tokens are cleared).
 * Deliberately does NOT route through `apiFetch` to avoid recursive refresh.
 */
async function refreshTokens(): Promise<string | null> {
  const refresh_token = getRefreshToken();
  if (!refresh_token) {
    clearTokens();
    return null;
  }

  const response = await safeFetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });

  if (!response.ok) {
    clearTokens();
    return null;
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
  };
  setTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

interface FetchOptions extends RequestInit {
  /** Internal flag: skip refresh/retry (used for the refresh call itself). */
  _skipRefresh?: boolean;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { _skipRefresh, ...rest } = options;

  const response = await safeFetch(`${API_URL}${path}`, {
    ...rest,
    headers: buildHeaders(rest),
  });

  // On 401, try a single refresh + retry — unless this is the refresh path,
  // an explicitly opted-out call, or we have no refresh token to use.
  if (
    response.status === 401 &&
    !_skipRefresh &&
    path !== "/auth/refresh" &&
    getRefreshToken()
  ) {
    const newAccess = await refreshTokens();
    if (newAccess) {
      const retryHeaders = {
        ...buildHeaders(rest),
        Authorization: `Bearer ${newAccess}`,
      };
      const retry = await safeFetch(`${API_URL}${path}`, {
        ...rest,
        headers: retryHeaders,
      });
      return handleResponse<T>(retry);
    }
  }

  return handleResponse<T>(response);
}

/** Turn a FastAPI error body's `detail` (string OR validation-error array) into
 * a readable message. */
function extractErrorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((e) =>
        e && typeof e === "object" && "msg" in e
          ? String((e as { msg: unknown }).msg)
          : null,
      )
      .filter((m): m is string => Boolean(m));
    if (msgs.length) return msgs.join("; ");
  }
  return fallback;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: unknown };
    throw new ApiError(
      response.status,
      extractErrorMessage(body.detail, response.statusText),
    );
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
