/**
 * Typed wrappers around the GPOMS guest-post endpoints (Module 5).
 *
 * Covers listing/filtering, CRUD, the status workflow (which records history
 * and auto-bumps the project's monthly goal when moving to `published`), and
 * the dedicated publish action that sets the live link.
 */

import { api } from "@/lib/api";
import type {
  GuestPostCreate,
  GuestPostDetail,
  GuestPostListItem,
  GuestPostListParams,
  GuestPostPublish,
  GuestPostStats,
  GuestPostUpdate,
  Page,
} from "@/lib/types";

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

export function listGuestPosts(
  params: GuestPostListParams = {},
): Promise<Page<GuestPostListItem>> {
  const query: Record<string, QueryValue> = {
    page: params.page,
    page_size: params.page_size,
    project_id: params.project_id,
    status: params.status,
    assigned_user_id: params.assigned_user_id,
    website_id: params.website_id,
    search: params.search,
    sort: params.sort,
  };
  return api.get<Page<GuestPostListItem>>(`/guest-posts${buildQuery(query)}`);
}

export function getGuestPost(id: string): Promise<GuestPostDetail> {
  return api.get<GuestPostDetail>(`/guest-posts/${id}`);
}

export function createGuestPost(
  data: GuestPostCreate,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>("/guest-posts", data);
}

export function updateGuestPost(
  id: string,
  data: GuestPostUpdate,
): Promise<GuestPostListItem> {
  return api.patch<GuestPostListItem>(`/guest-posts/${id}`, data);
}

/** Move a guest post to a new status, optionally recording a note. */
export function setStatus(
  id: string,
  status: string,
  note?: string | null,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/status`, {
    status,
    note: note ?? null,
  });
}

/** Mark a guest post published: sets status=published + live link. */
export function publish(
  id: string,
  data: GuestPostPublish,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/publish`, data);
}

export function removeGuestPost(id: string): Promise<void> {
  return api.delete<void>(`/guest-posts/${id}`);
}

/* ------------------------------------------------------------------ *
 * Review workflow + stats
 * ------------------------------------------------------------------ */

/** Submit a draft link for manager review (creator/assignee/managers). */
export function submitForReview(id: string): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/submit-review`, {});
}

/** Approve or reject a submitted link (managers only). */
export function reviewGuestPost(
  id: string,
  approve: boolean,
  note?: string,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/review`, {
    approve,
    note: note ?? null,
  });
}

/** Role-scoped aggregate stats for the Guest Post Links widgets. */
export function getGuestPostStats(): Promise<GuestPostStats> {
  return api.get<GuestPostStats>("/guest-posts/stats");
}
