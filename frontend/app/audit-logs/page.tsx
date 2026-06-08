"use client";

import { ShieldCheck } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type { AuditLogRead } from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";
import { listAuditLogs } from "@/services/audit-service";

const PAGE_SIZE = 25;

/** Module filter options (value "" = all). */
const MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All modules" },
  { value: "project", label: "Project" },
  { value: "payment", label: "Payment" },
  { value: "client", label: "Client" },
  { value: "website", label: "Website" },
  { value: "task", label: "Task" },
  { value: "guest_post", label: "Guest Post" },
  { value: "user", label: "User" },
  { value: "team", label: "Team" },
  { value: "role", label: "Role" },
  { value: "import", label: "Import" },
];

const MODULE_CLS: Record<string, string> = {
  project: "bg-primary/10 text-primary",
  payment: "bg-green-100 text-green-700",
  client: "bg-indigo-100 text-indigo-700",
  website: "bg-sky-100 text-sky-700",
  task: "bg-amber-100 text-amber-700",
  guest_post: "bg-violet-100 text-violet-700",
  user: "bg-rose-100 text-rose-700",
  team: "bg-teal-100 text-teal-700",
  role: "bg-slate-200 text-slate-700",
  import: "bg-cyan-100 text-cyan-700",
};

export default function AuditLogsPage() {
  const { user: me } = useAuth();
  const isAdmin = Boolean(
    me && (me.is_superuser || me.roles.includes("admin")),
  );

  const [moduleFilter, setModuleFilter] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<AuditLogRead[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the "action contains" box.
  useEffect(() => {
    const t = setTimeout(() => setAction(actionInput.trim()), 350);
    return () => clearTimeout(t);
  }, [actionInput]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [moduleFilter, action]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listAuditLogs({
        page,
        page_size: PAGE_SIZE,
        module: moduleFilter || undefined,
        action: action || undefined,
      });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load audit logs. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, moduleFilter, action]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAdmin) {
    return (
      <AppShell title="Audit Logs">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold text-[#1A1F4D]">
            Administrators only
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You need an administrator role to view the audit trail. Ask an admin
            if you need access.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Audit Logs">
      <div className="space-y-4">
        {/* Intro + filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted-foreground">
            A record of every meaningful change across the workspace — who did
            what, and when.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              aria-label="Filter by module"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-44"
            >
              {MODULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder="Action contains…"
              aria-label="Filter by action"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-56"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : error ? (
            <p
              role="alert"
              className="px-4 py-10 text-center text-sm text-destructive"
            >
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No audit entries match these filters.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Module</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => {
                  const moduleCls =
                    MODULE_CLS[entry.module] ?? "bg-slate-100 text-slate-600";
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-border align-top last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-4 py-3 text-muted-foreground">
                        <span title={formatDate(entry.created_at)}>
                          {relativeTime(entry.created_at) ||
                            formatDate(entry.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {entry.user?.full_name ?? "System"}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {humanizeAction(entry.action)}
                        <span className="block text-xs text-muted-foreground">
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={moduleCls}>
                          {entry.module.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {detailsOf(entry)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && items.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} entr{total === 1 ? "y" : "ies"} · page {page} of {pages}
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

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Turn `payment.status_changed` into "Payment status changed". */
function humanizeAction(action: string): string {
  const words = action.replace(/[._]/g, " ").trim().split(/\s+/);
  if (words.length === 0) return action;
  const [first, ...rest] = words;
  const head = (first ?? "").charAt(0).toUpperCase() + (first ?? "").slice(1);
  return [head, ...rest].join(" ");
}

/** A `Record` whose every value is rendered to a short readable string. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Read a single scalar field as a display string, if present. */
function field(
  rec: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!rec || !(key in rec)) return null;
  const v = rec[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Build a compact "Details" cell from old/new values. */
function detailsOf(entry: AuditLogRead): ReactNode {
  const oldRec = asRecord(entry.old_value);
  const newRec = asRecord(entry.new_value);

  // Status transitions read best as "from → to".
  const fromStatus = field(oldRec, "status");
  const toStatus = field(newRec, "status");
  if (toStatus !== null && fromStatus !== null && fromStatus !== toStatus) {
    return (
      <span>
        {fromStatus} <span aria-hidden="true">→</span> {toStatus}
      </span>
    );
  }
  if (toStatus !== null && fromStatus === null) {
    return <span>Set to {toStatus}</span>;
  }

  // Otherwise surface the most identifying field we can find.
  const rec = newRec ?? oldRec;
  for (const key of ["name", "full_name", "domain", "email", "amount_usd"]) {
    const val = field(rec, key);
    if (val !== null) {
      const prefix = key === "amount_usd" ? "$" : "";
      return (
        <span className="truncate">
          {prefix}
          {val}
        </span>
      );
    }
  }

  return <span>—</span>;
}

function Badge({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${className}`}
    >
      {children}
    </span>
  );
}
