"use client";

import { Download, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ReportTable } from "@/components/report-table";
import { guestPostStatusLabel } from "@/components/guest-post-status-badge";
import { ApiError } from "@/lib/api";
import type {
  CountryRef,
  GuestPostStatus,
  ProjectListItem,
  ReportFilters,
  ReportResult,
  ReportType,
  UserSummary,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { getCountries, getUsers } from "@/services/lookup-service";
import { listProjects } from "@/services/project-service";
import { exportReport, runReport } from "@/services/report-service";

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: "project", label: "Project" },
  { value: "team", label: "Team" },
  { value: "financial", label: "Financial" },
  { value: "guest-post", label: "Guest Post" },
];

const GUEST_POST_STATUSES: GuestPostStatus[] = [
  "prospect",
  "contacted",
  "negotiating",
  "accepted",
  "invoice_sent",
  "paid",
  "published",
  "rejected",
];

const inputClass =
  "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("project");

  // Filters.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [projectId, setProjectId] = useState("");
  const [teamLeadId, setTeamLeadId] = useState("");
  const [countryId, setCountryId] = useState("");
  const [status, setStatus] = useState("");

  // Filter pickers.
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [countries, setCountries] = useState<CountryRef[]>([]);

  // Result state.
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  // Load filter pickers once. Each is non-fatal: a failed picker just stays empty.
  useEffect(() => {
    let active = true;
    (async () => {
      const [projectsRes, usersRes, countriesRes] = await Promise.allSettled([
        listProjects({ page: 1, page_size: 200, sort: "name" }),
        getUsers(),
        getCountries(),
      ]);
      if (!active) return;
      if (projectsRes.status === "fulfilled") setProjects(projectsRes.value.items);
      if (usersRes.status === "fulfilled") setUsers(usersRes.value);
      if (countriesRes.status === "fulfilled") setCountries(countriesRes.value);
    })();
    return () => {
      active = false;
    };
  }, []);

  /** Build the active filter object, omitting blanks. */
  function currentFilters(): ReportFilters {
    return {
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      project_id: projectId || undefined,
      team_lead_id: teamLeadId || undefined,
      country_id: countryId ? Number(countryId) : undefined,
      status: reportType === "guest-post" && status ? status : undefined,
    };
  }

  /** Map an error to a friendly message, flagging the 403 manager-only case. */
  function handleError(err: unknown) {
    if (err instanceof ApiError && err.status === 403) {
      setForbidden(true);
      return;
    }
    setError(
      err instanceof ApiError
        ? err.message
        : "Unable to run the report. Please try again.",
    );
  }

  async function handleRun() {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const res = await runReport(reportType, currentFilters());
      setResult(res);
    } catch (err) {
      setResult(null);
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    setForbidden(false);
    try {
      await exportReport(reportType, currentFilters());
    } catch (err) {
      handleError(err);
    } finally {
      setExporting(false);
    }
  }

  // Switching report type clears stale results, errors, and the status filter
  // (which only applies to the guest-post report).
  function selectType(next: ReportType) {
    if (next === reportType) return;
    setReportType(next);
    setResult(null);
    setError(null);
    setForbidden(false);
    if (next !== "guest-post") setStatus("");
  }

  // Auto-run the report whenever the report type changes (incl. first load), so
  // data shows immediately without needing to click "Run report".
  useEffect(() => {
    void handleRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType]);

  if (forbidden) {
    return (
      <AppShell title="Reports">
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            Reports are available to managers
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            You do not have permission to view reports.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Reports">
      <div className="space-y-5">
        {/* Report-type selector */}
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.value}
              type="button"
              onClick={() => selectType(rt.value)}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                reportType === rt.value
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {rt.label}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              To
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Project
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={inputClass}
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Team lead
              <select
                value={teamLeadId}
                onChange={(e) => setTeamLeadId(e.target.value)}
                className={inputClass}
              >
                <option value="">All team leads</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Country
              <select
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
                className={inputClass}
              >
                <option value="">All countries</option>
                {countries.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {reportType === "guest-post" && (
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputClass}
                >
                  <option value="">All statuses</option>
                  {GUEST_POST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {guestPostStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRun}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {loading ? "Running…" : "Run report"}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {/* Results */}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : !result ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Choose your filters and run a report to see results.
            </p>
          ) : (
            <ReportTable
              columns={result.columns}
              rows={result.rows}
              totals={result.totals}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
