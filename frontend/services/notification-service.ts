/**
 * Typed wrappers around the GPOMS notification endpoints (Module 9).
 *
 * Covers listing (with an optional unread filter), the unread-count badge
 * source, and the mark-read / mark-all-read mutations. All endpoints require
 * a bearer token, which the shared `api` client injects automatically.
 */

import { api } from "@/lib/api";
import type {
  NotificationItem,
  NotificationListParams,
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

/** List notifications (newest first). */
export function listNotifications(
  params: NotificationListParams = {},
): Promise<Page<NotificationItem>> {
  const query: Record<string, QueryValue> = {
    unread: params.unread,
    page: params.page,
    page_size: params.page_size,
  };
  return api.get<Page<NotificationItem>>(`/notifications${buildQuery(query)}`);
}

/** Current unread notification count for the badge. */
export function getUnreadCount(): Promise<{ count: number }> {
  return api.get<{ count: number }>("/notifications/unread-count");
}

/** Mark a single notification read; returns the updated notification. */
export function markRead(id: string): Promise<NotificationItem> {
  return api.post<NotificationItem>(`/notifications/${id}/read`, {});
}

/** Mark every notification read; returns the number updated. */
export function markAllRead(): Promise<{ updated: number }> {
  return api.post<{ updated: number }>("/notifications/read-all", {});
}

/** Map an entity_type to its list-detail route prefix. */
const ENTITY_ROUTES: Record<string, string> = {
  project: "/projects",
  guest_post: "/guest-posts",
  payment: "/payments",
  task: "/tasks",
  website: "/websites",
};

/**
 * Resolve the in-app route for a notification's linked entity, or `null` when
 * the entity is missing or its type has no known route.
 */
export function notificationHref(
  notification: Pick<NotificationItem, "entity_type" | "entity_id">,
): string | null {
  const { entity_type, entity_id } = notification;
  if (!entity_type || !entity_id) return null;
  const prefix = ENTITY_ROUTES[entity_type];
  return prefix ? `${prefix}/${entity_id}` : null;
}
