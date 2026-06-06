"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import type { NotificationItem } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import {
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
  notificationHref,
} from "@/services/notification-service";

/** How often (ms) to refresh the unread badge while signed in. */
const POLL_INTERVAL = 30_000;
/** How many notifications to show in the dropdown preview. */
const PREVIEW_SIZE = 8;

/**
 * Top-bar notification bell: shows an unread-count badge (polled every 30s)
 * and a dropdown preview of the latest notifications. Polling and the preview
 * fetch only run while a user is signed in; poll failures are swallowed so a
 * briefly-unavailable API never surfaces an error in the chrome.
 */
export function NotificationBell() {
  const router = useRouter();
  const { user } = useAuth();

  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Poll the unread count while signed in. Errors are swallowed quietly.
  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    let active = true;

    const refresh = async () => {
      try {
        const { count: next } = await getUnreadCount();
        if (active) setCount(next);
      } catch {
        // Ignore — the API may be briefly unavailable.
      }
    };

    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [user]);

  // Load the preview list whenever the dropdown opens.
  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications({ page_size: PREVIEW_SIZE });
      setItems(res.items);
    } catch {
      setError("Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadPreview();
  }, [open, loadPreview]);

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  async function handleRowClick(notification: NotificationItem) {
    const href = notificationHref(notification);

    if (!notification.is_read) {
      // Optimistically reflect the read state + badge, then persist.
      setItems((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, is_read: true } : n,
        ),
      );
      setCount((c) => Math.max(0, c - 1));
      try {
        await markRead(notification.id);
      } catch {
        // Ignore — navigation (if any) still proceeds.
      }
    }

    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  async function handleMarkAll() {
    try {
      await markAllRead();
      setCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // Ignore — the badge will resync on the next poll.
    }
  }

  const badgeLabel = count > 9 ? "9+" : String(count);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {count > 0 && (
              <span className="text-xs text-muted-foreground">
                {count} unread
              </span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
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
                You&apos;re all caught up.
              </p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void handleRowClick(n)}
                      className={cn(
                        "flex w-full items-start gap-2 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-accent/50",
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {relativeTime(n.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <button
              type="button"
              onClick={() => void handleMarkAll()}
              disabled={count === 0}
              className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
