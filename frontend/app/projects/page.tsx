"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/app-shell";
import { BulkBar, type FileFormat } from "@/components/bulk-bar";
import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type {
  BulkImportResult,
  ProjectListItem,
  UserAdminRead,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  archiveProject,
  bulkAssignProjects,
  bulkDeleteProjects,
  downloadProjectsTemplate,
  exportProjects,
  importProjects,
  listProjects,
  removeProject,
} from "@/services/project-service";
import { listUsers } from "@/services/user-service";

const PAGE_SIZE = 20;
const STATUS_OPTIONS = ["active", "completed", "hold", "cancelled"] as const;

function ProjectsPageInner() {
  const { user: me } = useAuth();
  const searchParams = useSearchParams();
  // Managers (admins + team leads) get the bulk-select + bulk-assign UI.
  const isManager = Boolean(
    me &&
      (me.is_superuser ||
        me.roles.includes("admin") ||
        me.roles.includes("team_lead")),
  );

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<ProjectListItem[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Bulk import/export state.
  const [bulkBusy, setBulkBusy] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(
    null,
  );

  // Bulk-select + bulk-assign state (managers only).
  const [users, setUsers] = useState<UserAdminRead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssigneeId, setBulkAssigneeId] = useState("");
  const [bulkTeamLeadId, setBulkTeamLeadId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<string | null>(null);

  // Bulk-delete (confirm modal) state.
  const [deleteOpen, setDeleteOpen] = useState(false);

  // "Assign mode" hint, triggered by the quick-action (?assign=1). The bulk
  // bar only appears once rows are selected, so we show a banner prompting
  // the manager to pick projects to assign.
  const [assignHint, setAssignHint] = useState(false);
  useEffect(() => {
    if (isManager && searchParams.get("assign") === "1") {
      setAssignHint(true);
    }
  }, [isManager, searchParams]);

  // Debounce the search box into the active `search` filter.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProjects({
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
        archived: archived ? true : undefined,
        sort: "-created_at",
      });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load projects. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, status, archived]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load the users list once for the bulk-assign pickers (managers only).
  useEffect(() => {
    if (!isManager) return;
    let active = true;
    (async () => {
      try {
        const data = await listUsers();
        if (active) setUsers(data);
      } catch {
        // Non-fatal: the bulk-assign selects simply stay empty.
      }
    })();
    return () => {
      active = false;
    };
  }, [isManager]);

  // Clear the current selection whenever the page or filters change so we
  // never act on rows that are no longer visible.
  useEffect(() => {
    setSelected(new Set());
    setAssignResult(null);
  }, [page, search, status, archived]);

  const allSelectedOnPage =
    items.length > 0 && items.every((p) => selected.has(p.id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const everySelected = items.every((p) => next.has(p.id));
      if (everySelected) {
        for (const p of items) next.delete(p.id);
      } else {
        for (const p of items) next.add(p.id);
      }
      return next;
    });
  }, [items]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const teamLeadOptions = useMemo(
    () =>
      users.filter(
        (u) => u.is_superuser || u.roles.includes("admin") || u.roles.includes("team_lead"),
      ),
    [users],
  );

  function clearSelection() {
    setSelected(new Set());
    setBulkAssigneeId("");
    setBulkTeamLeadId("");
    setAssignResult(null);
  }

  async function handleBulkAssign() {
    if (selected.size === 0 || (!bulkAssigneeId && !bulkTeamLeadId)) return;
    setActionError(null);
    setAssignResult(null);
    setAssigning(true);
    try {
      const result = await bulkAssignProjects([...selected], {
        ...(bulkAssigneeId ? { assignee_id: bulkAssigneeId } : {}),
        ...(bulkTeamLeadId ? { team_lead_id: bulkTeamLeadId } : {}),
      });
      setAssignResult(
        `Assigned ${result.updated} project${result.updated === 1 ? "" : "s"}` +
          (result.skipped > 0 ? ` · ${result.skipped} skipped` : "") +
          ".",
      );
      setSelected(new Set());
      setBulkAssigneeId("");
      setBulkTeamLeadId("");
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Unable to assign the selected projects. Please try again.",
      );
    } finally {
      setAssigning(false);
    }
  }

  // Runs the bulk-delete. Resolves on success; throws on failure so the modal
  // can surface `ApiError.message` inline without losing the entered password.
  async function handleBulkDelete(password: string) {
    const ids = [...selected];
    const result = await bulkDeleteProjects(ids, password);
    setAssignResult(
      `Moved ${result.deleted} project${result.deleted === 1 ? "" : "s"} to Trash` +
        (result.skipped > 0 ? ` · ${result.skipped} skipped` : "") +
        ".",
    );
    setSelected(new Set());
    setBulkAssigneeId("");
    setBulkTeamLeadId("");
    setDeleteOpen(false);
    await load();
  }

  async function handleExport(format: FileFormat) {
    setActionError(null);
    setBulkBusy(true);
    try {
      await exportProjects(format);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Unable to export projects. Please try again.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleTemplate(format: FileFormat) {
    setActionError(null);
    setBulkBusy(true);
    try {
      await downloadProjectsTemplate(format);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Unable to download the template. Please try again.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleImport(file: File) {
    setActionError(null);
    setImportResult(null);
    setBulkBusy(true);
    try {
      const result = await importProjects(file);
      setImportResult(result);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Unable to import the file. Please check it and try again.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleArchiveToggle(p: ProjectListItem) {
    setActionError(null);
    setBusyId(p.id);
    try {
      await archiveProject(p.id, !p.is_archived);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Unable to update project.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(p: ProjectListItem) {
    if (
      !window.confirm(
        `Delete project "${p.name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setBusyId(p.id);
    try {
      await removeProject(p.id);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 403
          ? "Only admins can delete projects."
          : err instanceof ApiError
            ? err.message
            : "Unable to delete project.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Projects">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search projects…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-xs"
            />
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
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 rounded border-input"
              />
              Include archived
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BulkBar
              onImport={handleImport}
              onExport={handleExport}
              onTemplate={handleTemplate}
              busy={bulkBusy}
            />
            <Link
              href="/projects/new"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </div>
        </div>

        {actionError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}

        {/* Bulk-assign result toast */}
        {assignResult && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-green-50 px-3 py-2 text-sm text-green-700">
            <span>{assignResult}</span>
            <button
              type="button"
              onClick={() => setAssignResult(null)}
              className="text-xs text-green-700/70 hover:text-green-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Assign-mode hint (from the quick action). Hidden once rows are
            selected, since the bulk-action bar then provides the assign UI. */}
        {isManager && assignHint && selected.size === 0 && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-[#1A1F4D]">
            <span>
              Select one or more projects below to assign an{" "}
              <span className="font-medium">assignee</span> or{" "}
              <span className="font-medium">team lead</span> in bulk.
            </span>
            <button
              type="button"
              onClick={() => setAssignHint(false)}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Sticky bulk-action bar (managers only, ≥1 row selected) */}
        {isManager && selected.size > 0 && (
          <div className="sticky top-2 z-20 flex flex-col gap-3 rounded-xl border border-primary/30 bg-card p-3 shadow-md sm:flex-row sm:items-center sm:gap-2">
            <span className="text-sm font-semibold text-[#1A1F4D]">
              {selected.size} selected
            </span>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="hidden sm:inline">Assignee</span>
                <select
                  aria-label="Bulk assignee"
                  value={bulkAssigneeId}
                  onChange={(e) => setBulkAssigneeId(e.target.value)}
                  disabled={assigning}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— keep —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="hidden sm:inline">Team Lead</span>
                <select
                  aria-label="Bulk team lead"
                  value={bulkTeamLeadId}
                  onChange={(e) => setBulkTeamLeadId(e.target.value)}
                  disabled={assigning}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— keep —</option>
                  {teamLeadOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBulkAssign}
                disabled={
                  assigning || (!bulkAssigneeId && !bulkTeamLeadId)
                }
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {assigning ? "Assigning…" : "Assign"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setDeleteOpen(true);
                }}
                disabled={assigning}
                className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={assigning}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Import result summary */}
        {importResult && (
          <div className="rounded-md border border-border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">
                {importResult.created} created, {importResult.updated} updated,{" "}
                {importResult.errors.length} error
                {importResult.errors.length === 1 ? "" : "s"}.
              </p>
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-destructive">
                {importResult.errors.map((err, i) => (
                  <li key={i}>
                    Row {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
              No projects found.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {isManager && (
                    <th className="w-10 px-4 py-3 font-medium">
                      <input
                        type="checkbox"
                        aria-label="Select all projects on this page"
                        checked={allSelectedOnPage}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-input align-middle"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Niche</th>
                  <th className="px-4 py-3 font-medium">Country</th>
                  <th className="px-4 py-3 font-medium">Team Lead</th>
                  <th className="px-4 py-3 font-medium">Assignee</th>
                  <th className="px-4 py-3 text-right font-medium">Budget</th>
                  <th className="px-4 py-3 text-right font-medium">Links</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b border-border last:border-0 hover:bg-accent/40 ${
                      isManager && selected.has(p.id) ? "bg-primary/5" : ""
                    }`}
                  >
                    {isManager && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select project ${p.name}`}
                          checked={selected.has(p.id)}
                          onChange={() => toggleOne(p.id)}
                          className="h-4 w-4 rounded border-input align-middle"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.is_archived && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          Archived
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.main_niche?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.target_country?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.team_lead?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.assignee?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {p.budget_currency && p.budget_currency !== "USD" && (
                        <span className="mr-1 text-xs uppercase">
                          {p.budget_currency}
                        </span>
                      )}
                      {formatCurrency(p.monthly_budget)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {p.target_links}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(p.due_date)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/projects/${p.id}/edit`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleArchiveToggle(p)}
                          disabled={busyId === p.id}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                          title={p.is_archived ? "Unarchive" : "Archive"}
                        >
                          {p.is_archived ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          disabled={busyId === p.id}
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
              {total} project{total === 1 ? "" : "s"} · page {page} of {pages}
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

      {deleteOpen && (
        <BulkDeleteModal
          count={selected.size}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleBulkDelete}
        />
      )}
    </AppShell>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsPageInner />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk-delete confirm modal                                          */
/* ------------------------------------------------------------------ */

function BulkDeleteModal({
  count,
  onClose,
  onConfirm,
}: {
  count: number;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const plural = count === 1 ? "" : "s";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length === 0) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await onConfirm(password);
      // On success the parent closes the modal.
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Unable to delete the selected projects. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Delete projects" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
        <p className="text-sm text-muted-foreground">
          You&apos;re about to delete{" "}
          <span className="font-medium text-foreground">
            {count} project{plural}
          </span>
          . They — along with their linked payments &amp; guest posts — will be
          moved to <span className="font-medium text-foreground">Trash</span>,
          where they stay recoverable. This does not permanently delete anything;
          purge from the Trash page when you&apos;re sure.
        </p>

        <p className="flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Confirm with your password to continue.
        </p>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">
            Your password
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            placeholder="Enter your password"
            autoFocus
          />
        </label>

        {formError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || password.length === 0}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? "Deleting…"
              : `Delete ${count} project${plural}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Shared modal shell (matches the inline pattern used elsewhere)     */
/* ------------------------------------------------------------------ */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1A1F4D]/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-[#1A1F4D]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
