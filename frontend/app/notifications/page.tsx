"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import type { NotificationItem } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import {
  listNotifications,
  markAllRead,
  markRead,
  notificationHref,
} from "@/services/notification-service";

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const router = useRouter();

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications({
        page,
        page_size: PAGE_SIZE,
        unread: unreadOnly || undefined,
      });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load notifications. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleMarkRead(notification: NotificationItem) {
    setActionError(null);
    setBusyId(notification.id);
    try {
      await markRead(notification.id);
      // Drop it from an unread-only view; otherwise flip its read flag in place.
      if (unreadOnly) {
        await load();
      } else {
        setItems((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, is_read: true } : n,
          ),
        );
      }
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Unable to mark the notification read.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkAll() {
    setActionError(null);
    try {
      await markAllRead();
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Unable to mark all notifications read.",
      );
    }
  }

  function handleRowClick(notification: NotificationItem) {
    const href = notificationHref(notification);
    if (!notification.is_read) {
      // Persist the read state but don't block navigation on it.
      void markRead(notification.id).catch(() => {});
      setItems((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, is_read: true } : n,
        ),
      );
    }
    if (href) router.push(href);
  }

  const hasUnread = items.some((n) => !n.is_read);

  return (
    <AppShell title="Notifications">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-input"
            />
            Unread only
          </label>
          <button
            type="button"
            onClick={() => void handleMarkAll()}
            disabled={!hasUnread}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Mark all read
          </button>
        </div>

        {actionError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}

        {/* List */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : error ? (
            <p
              role="alert"
              className="px-4 py-8 text-center text-sm text-destructive"
            >
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {unreadOnly
                ? "No unread notifications."
                : "No notifications yet."}
            </p>
          ) : (
            <ul>
              {items.map((n) => {
                const href = notificationHref(n);
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 border-b border-border px-4 py-3 last:border-0",
                      !n.is_read && "bg-accent/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        n.is_read ? "bg-transparent" : "bg-primary",
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => handleRowClick(n)}
                        className={cn(
                          "block text-left text-sm font-medium text-foreground",
                          href && "hover:underline",
                        )}
                      >
                        {n.title}
                      </button>
                      {n.body && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(n)}
                        disabled={busyId === n.id}
                        className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                      >
                        Mark read
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && items.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} notification{total === 1 ? "" : "s"} · page {page} of{" "}
              {pages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
