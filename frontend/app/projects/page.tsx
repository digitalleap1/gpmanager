"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { BulkBar, type FileFormat } from "@/components/bulk-bar";
import { StatusBadge } from "@/components/status-badge";
import { ApiError } from "@/lib/api";
import type { BulkImportResult, ProjectListItem } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  archiveProject,
  downloadProjectsTemplate,
  exportProjects,
  importProjects,
  listProjects,
  removeProject,
} from "@/services/project-service";

const PAGE_SIZE = 20;
const STATUS_OPTIONS = ["active", "completed", "hold", "cancelled"] as const;

export default function ProjectsPage() {
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
                    className="border-b border-border last:border-0 hover:bg-accent/40"
                  >
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
    </AppShell>
  );
}
