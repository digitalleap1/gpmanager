"use client";

import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  GuestPostStatusBadge,
  guestPostStatusLabel,
} from "@/components/guest-post-status-badge";
import { ApiError } from "@/lib/api";
import type {
  GuestPostListItem,
  GuestPostStatus,
  ProjectListItem,
  UserSummary,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getUsers } from "@/services/lookup-service";
import {
  listGuestPosts,
  removeGuestPost,
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

export default function GuestPostsPage() {
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
          : "Unable to load guest posts. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, projectId, status, assignedUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(gp: GuestPostListItem) {
    const label = gp.website_name ?? "this guest post";
    if (
      !window.confirm(`Delete "${label}"? This action cannot be undone.`)
    ) {
      return;
    }
    setActionError(null);
    setBusyId(gp.id);
    try {
      await removeGuestPost(gp.id);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 403
          ? "Only managers can delete guest posts."
          : err instanceof ApiError
            ? err.message
            : "Unable to delete guest post.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Guest Posts">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search guest posts…"
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
            New Guest Post
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
              No guest posts found.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Website</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 text-right font-medium">DR/DA</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Assigned</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Outreach</th>
                  <th className="px-4 py-3 font-medium">Live link</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
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
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {gp.dr ?? "—"} / {gp.da ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {gp.price != null ? formatCurrency(gp.price) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {gp.assigned_user?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <GuestPostStatusBadge status={gp.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(gp.outreach_date)}
                    </td>
                    <td className="px-4 py-3">
                      {gp.live_link ? (
                        <a
                          href={gp.live_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                          title={gp.live_link}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Link
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
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
              {total} guest post{total === 1 ? "" : "s"} · page {page} of{" "}
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
