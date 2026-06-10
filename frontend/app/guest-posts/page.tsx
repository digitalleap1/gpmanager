"use client";
import {
  BarChart3,
  CalendarPlus,
  Check,
  CircleCheckBig,
  Clock,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import {
  GuestPostStatusBadge,
  ReviewStatusBadge,
  guestPostStatusLabel,
} from "@/components/guest-post-status-badge";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type {
  GuestPostListItem,
  GuestPostStats,
  GuestPostStatus,
  ProjectListItem,
  UserSummary,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getUsers } from "@/services/lookup-service";
import {
  getGuestPostStats,
  listGuestPosts,
  removeGuestPost,
  reviewGuestPost,
  submitForReview,
} from "@/services/guest-post-service";
import { listProjects } from "@/services/project-service";

const PAGE_SIZE = 20;
const STATUS_OPTIONS: GuestPostStatus[] = [
  "prospect",
  "contacted",
  "negotiating",
  "accepted",
  "invoice_sent",
  "paid",
  "published",
  "rejected",
];

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 403) {
    return "You don't have permission to do that.";
  }
  return err instanceof ApiError ? err.message : fallback;
}

export default function GuestPostLinksPage() {
  const { user } = useAuth();
  const isManager = Boolean(
    user &&
      (user.is_superuser ||
        user.roles.includes("admin") ||
        user.roles.includes("team_lead")),
  );

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<GuestPostListItem[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Stats widgets (best-effort; the row hides on failure).
  const [stats, setStats] = useState<GuestPostStats | null>(null);

  // Reject-with-note modal target.
  const [rejecting, setRejecting] = useState<GuestPostListItem | null>(null);

  // Filter pickers.
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);

  // Debounce the search box into the active `search` filter.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load filter pickers once.
  useEffect(() => {
    let active = true;
    (async () => {
      const [projectsRes, usersRes] = await Promise.allSettled([
        listProjects({ page: 1, page_size: 200, sort: "name" }),
        getUsers(),
      ]);
      if (!active) return;
      if (projectsRes.status === "fulfilled") {
        setProjects(projectsRes.value.items);
      }
      if (usersRes.status === "fulfilled") {
        setUsers(usersRes.value);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Best-effort stats — non-fatal so a failure just hides the widgets.
  const loadStats = useCallback(async () => {
    try {
      setStats(await getGuestPostStats());
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listGuestPosts({
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        project_id: projectId || undefined,
        status: status || undefined,
        assigned_user_id: assignedUserId || undefined,
        sort: "-created_at",
      });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load guest post links. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, projectId, status, assignedUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Refresh both the list and the stats after a mutating action. */
  const refresh = useCallback(async () => {
    await Promise.all([load(), loadStats()]);
  }, [load, loadStats]);

  async function handleSubmitReview(gp: GuestPostListItem) {
    setActionError(null);
    setBusyId(gp.id);
    try {
      await submitForReview(gp.id);
      await refresh();
    } catch (err) {
      setActionError(errMsg(err, "Unable to submit this link for review."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprove(gp: GuestPostListItem) {
    setActionError(null);
    setBusyId(gp.id);
    try {
      await reviewGuestPost(gp.id, { approve: true });
      await refresh();
    } catch (err) {
      setActionError(errMsg(err, "Unable to approve this link."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(gp: GuestPostListItem, note: string) {
    setActionError(null);
    setBusyId(gp.id);
    try {
      await reviewGuestPost(gp.id, {
        approve: false,
        note: note.trim() || undefined,
      });
      setRejecting(null);
      await refresh();
    } catch (err) {
      setActionError(errMsg(err, "Unable to reject this link."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(gp: GuestPostListItem) {
    const label = gp.website_name ?? "this link";
    if (!window.confirm(`Delete "${label}"? This action cannot be undone.`)) {
      return;
    }
    setActionError(null);
    setBusyId(gp.id);
    try {
      await removeGuestPost(gp.id);
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 403
          ? "Only managers can delete guest post links."
          : errMsg(err, "Unable to delete guest post link."),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Guest Post Links">
      <div className="space-y-6">
        {/* Stats widgets — hidden entirely when stats fail to load. */}
        {stats && (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                icon={Link2}
                label="Total Links"
                value={stats.total}
              />
              <StatCard
                icon={CircleCheckBig}
                label="Published"
                value={stats.published}
              />
              <StatCard icon={Clock} label="Pending" value={stats.pending} />
              <StatCard
                icon={CalendarPlus}
                label="Added This Month"
                value={stats.this_month}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BreakdownCard
                icon={<BarChart3 className="h-4 w-4 text-primary" />}
                title="Top projects"
                rows={stats.by_project}
              />
              <BreakdownCard
                icon={<BarChart3 className="h-4 w-4 text-primary" />}
                title="By user"
                rows={stats.by_user}
              />
            </div>
          </section>
        )}

        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search guest post links…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-xs"
              />
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {guestPostStatusLabel(s)}
                  </option>
                ))}
              </select>
              <select
                value={assignedUserId}
                onChange={(e) => {
                  setAssignedUserId(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All assignees</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
            <Link
              href="/guest-posts/new"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Link
            </Link>
          </div>

          {actionError && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {actionError}
            </p>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
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
                No guest post links found.
              </p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Website</th>
                    <th className="px-4 py-3 font-medium">Project</th>
                    <th className="px-4 py-3 font-medium">Link URL</th>
                    <th className="px-4 py-3 font-medium">Published</th>
                    <th className="px-4 py-3 font-medium">Added By</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Cost</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((gp) => (
                    <tr
                      key={gp.id}
                      className="border-b border-border last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/guest-posts/${gp.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {gp.website_name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {gp.project_name}
                      </td>
                      <td className="px-4 py-3">
                        {gp.live_link ? (
                          <a
                            href={gp.live_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-[16rem] items-center gap-1 text-primary hover:underline"
                            title={gp.live_link}
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{gp.live_link}</span>
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(gp.live_link_date)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {gp.added_by?.full_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <GuestPostStatusBadge status={gp.status} />
                          <ReviewStatusBadge status={gp.review_status} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {gp.price != null ? formatCurrency(gp.price) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Review-workflow actions */}
                          {gp.review_status === "draft" && (
                            <button
                              type="button"
                              onClick={() => handleSubmitReview(gp)}
                              disabled={busyId === gp.id}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
                              title="Submit for review"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Submit
                            </button>
                          )}
                          {gp.review_status === "submitted" && isManager && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApprove(gp)}
                                disabled={busyId === gp.id}
                                className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 transition hover:bg-green-100 disabled:opacity-50"
                                title="Approve"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejecting(gp)}
                                disabled={busyId === gp.id}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                                title="Reject"
                              >
                                <X className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </>
                          )}

                          {/* Edit + delete */}
                          <Link
                            href={`/guest-posts/${gp.id}/edit`}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(gp)}
                            disabled={busyId === gp.id}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {!loading && !error && items.length > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {total} link{total === 1 ? "" : "s"} · page {page} of {pages}
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
      </div>

      {rejecting && (
        <RejectModal
          target={rejecting}
          submitting={busyId === rejecting.id}
          onClose={() => setRejecting(null)}
          onConfirm={(note) => handleReject(rejecting, note)}
        />
      )}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

/** A small "name + count" list with proportional bars. */
function BreakdownCard({
  icon,
  title,
  rows,
}: {
  icon: ReactNode;
  title: string;
  rows: { name: string; count: number }[];
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1;
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#1A1F4D]">
        {icon}
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.name}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-foreground">{row.name}</span>
                <span className="shrink-0 font-medium text-muted-foreground">
                  {row.count}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Optional-note modal for rejecting a submitted link. */
function RejectModal({
  target,
  submitting,
  onClose,
  onConfirm,
}: {
  target: GuestPostListItem;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1A1F4D]/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-[#1A1F4D]">
            Reject link
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(note);
          }}
          className="space-y-4 px-5 py-5"
        >
          <p className="text-sm text-muted-foreground">
            Rejecting{" "}
            <span className="font-medium text-foreground">
              {target.website_name ?? "this link"}
            </span>
            . Add an optional note for the submitter.
          </p>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">
              Note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="What needs fixing before this can be approved?"
              autoFocus
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              {submitting ? "Rejecting…" : "Reject link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
