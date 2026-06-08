"use client";

import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  ShieldCheck,
  Undo2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type {
  ImportBatch,
  ImportBatchDetail,
  ImportProfile,
  PreviewIssue,
  PreviewReport,
  PreviewRowStatus,
} from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";
import {
  commitImport,
  listImports,
  listProfiles,
  previewImport,
  rollbackImport,
} from "@/services/import-service";

/* ------------------------------------------------------------------ */
/* Status / colour metadata                                            */
/* ------------------------------------------------------------------ */

const ROW_STATUS_META: Record<PreviewRowStatus, { label: string; cls: string }> =
  {
    new: { label: "New", cls: "bg-green-100 text-green-700" },
    duplicate: { label: "Duplicate", cls: "bg-amber-100 text-amber-700" },
    invalid: { label: "Invalid", cls: "bg-destructive/10 text-destructive" },
  };

const BATCH_STATUS_META: Record<string, { label: string; cls: string }> = {
  committed: { label: "Committed", cls: "bg-green-100 text-green-700" },
  rolled_back: { label: "Rolled back", cls: "bg-slate-200 text-slate-600" },
};

type WizardStep = "choose" | "review" | "result";

export default function ImportsPage() {
  const { user: me } = useAuth();
  const canImport = Boolean(
    me &&
      (me.is_superuser ||
        me.roles.includes("admin") ||
        me.roles.includes("team_lead")),
  );

  // Wizard state.
  const [step, setStep] = useState<WizardStep>("choose");
  const [profiles, setProfiles] = useState<ImportProfile[]>([]);
  const [profileKey, setProfileKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewReport | null>(null);
  const [result, setResult] = useState<ImportBatchDetail | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  // Load the import profiles once.
  useEffect(() => {
    if (!canImport) return;
    let active = true;
    (async () => {
      try {
        const data = await listProfiles();
        if (!active) return;
        setProfiles(data);
        setProfileKey((prev) => prev || data[0]?.key || "");
      } catch (err) {
        if (active) {
          setWizardError(
            errMsg(err, "Unable to load import profiles. Please try again."),
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [canImport]);

  function resetWizard() {
    setStep("choose");
    setFile(null);
    setPreview(null);
    setResult(null);
    setWizardError(null);
  }

  async function handlePreview() {
    if (!profileKey || !file) return;
    setWizardError(null);
    setPreviewing(true);
    try {
      const report = await previewImport(profileKey, file);
      setPreview(report);
      setStep("review");
    } catch (err) {
      setWizardError(errMsg(err, "Unable to preview the file. Please try again."));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCommit() {
    if (!profileKey || !file) return;
    setWizardError(null);
    setCommitting(true);
    try {
      const batch = await commitImport(profileKey, file);
      setResult(batch);
      setStep("result");
    } catch (err) {
      setWizardError(
        errMsg(err, "Unable to commit the import. Please try again."),
      );
    } finally {
      setCommitting(false);
    }
  }

  if (!canImport) {
    return (
      <AppShell title="Import Wizard">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold text-[#1A1F4D]">
            Administrators only
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You need a manager or administrator role to import data. Ask an admin
            if you need access.
          </p>
        </div>
      </AppShell>
    );
  }

  const selectedProfile = profiles.find((p) => p.key === profileKey) ?? null;

  return (
    <AppShell title="Import Wizard">
      <div className="space-y-6">
        <StepHeader step={step} />

        {step === "choose" && (
          <ChooseStep
            profiles={profiles}
            profileKey={profileKey}
            onProfileChange={setProfileKey}
            selectedProfile={selectedProfile}
            file={file}
            onFileChange={setFile}
            error={wizardError}
            busy={previewing}
            onPreview={handlePreview}
          />
        )}

        {step === "review" && preview && (
          <ReviewStep
            report={preview}
            error={wizardError}
            busy={committing}
            onBack={() => {
              setWizardError(null);
              setPreview(null);
              setStep("choose");
            }}
            onCommit={handleCommit}
          />
        )}

        {step === "result" && result && (
          <ResultStep batch={result} onStartOver={resetWizard} />
        )}
      </div>

      <div className="mt-10">
        <ImportLog
          refreshKey={result?.id ?? null}
          canRollback={canImport}
        />
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Step header (progress)                                              */
/* ------------------------------------------------------------------ */

const STEPS: { key: WizardStep; label: string }[] = [
  { key: "choose", label: "Choose & upload" },
  { key: "review", label: "Review preview" },
  { key: "result", label: "Result" },
];

function StepHeader({ step }: { step: WizardStep }) {
  const activeIndex = STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {STEPS.map((s, i) => {
        const state =
          i < activeIndex ? "done" : i === activeIndex ? "active" : "upcoming";
        return (
          <li key={s.key} className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  state === "active"
                    ? "bg-primary text-primary-foreground"
                    : state === "done"
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span
                className={
                  state === "upcoming"
                    ? "text-muted-foreground"
                    : "font-medium text-[#1A1F4D]"
                }
              >
                {s.label}
              </span>
            </span>
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="text-muted-foreground/50">
                /
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Step 1 — Choose & upload                                            */
/* ------------------------------------------------------------------ */

function ChooseStep({
  profiles,
  profileKey,
  onProfileChange,
  selectedProfile,
  file,
  onFileChange,
  error,
  busy,
  onPreview,
}: {
  profiles: ImportProfile[];
  profileKey: string;
  onProfileChange: (key: string) => void;
  selectedProfile: ImportProfile | null;
  file: File | null;
  onFileChange: (file: File | null) => void;
  error: string | null;
  busy: boolean;
  onPreview: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-[#1A1F4D]">
          What are you importing?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a profile, then choose a <code>.xlsx</code> or <code>.csv</code>{" "}
          file. We&apos;ll validate it before anything is written.
        </p>
      </div>

      <Field label="Import profile">
        <select
          value={profileKey}
          onChange={(e) => onProfileChange(e.target.value)}
          disabled={profiles.length === 0}
          className={`${FIELD_CLS} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {profiles.length === 0 ? (
            <option value="">No profiles available</option>
          ) : (
            profiles.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))
          )}
        </select>
      </Field>

      {selectedProfile && (
        <p className="rounded-md bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          {selectedProfile.description}
        </p>
      )}

      <Field label="File">
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
        />
      </Field>

      {file && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">{file.name}</span>
          <span>({formatBytes(file.size)})</span>
        </p>
      )}

      {error && <ErrorBanner message={error} />}

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onPreview}
          disabled={busy || !profileKey || !file}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UploadCloud className="h-4 w-4" />
          {busy ? "Validating…" : "Preview"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — Review preview                                             */
/* ------------------------------------------------------------------ */

function ReviewStep({
  report,
  error,
  busy,
  onBack,
  onCommit,
}: {
  report: PreviewReport;
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onCommit: () => void;
}) {
  const commitDisabled =
    busy || report.total_rows === 0 || report.invalid_count === report.total_rows;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatChip label="Total" value={report.total_rows} cls="bg-slate-100 text-slate-700" />
        <StatChip label="New" value={report.new_count} cls="bg-green-100 text-green-700" />
        <StatChip
          label="Duplicate"
          value={report.duplicate_count}
          cls="bg-amber-100 text-amber-700"
        />
        <StatChip
          label="Invalid"
          value={report.invalid_count}
          cls="bg-destructive/10 text-destructive"
        />
        <StatChip
          label="Warnings"
          value={report.warning_count}
          cls="bg-amber-100 text-amber-700"
        />
      </div>

      {/* Mapping summary */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-[#1A1F4D]">
          Column mapping — {report.label}
        </h3>
        {report.source_filename && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            From <span className="font-medium">{report.source_filename}</span>
          </p>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Source column</th>
                <th className="px-3 py-2 font-medium">Target field</th>
              </tr>
            </thead>
            <tbody>
              {report.mapping.map((m, i) => (
                <tr
                  key={`${m.source}-${m.target}-${i}`}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {m.source}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    → {m.target}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rows table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-[#1A1F4D]">Rows</h3>
          {report.truncated && (
            <p className="text-xs text-muted-foreground">
              Showing first {report.rows.length} of {report.total_rows} rows
            </p>
          )}
        </div>
        {report.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No rows found in this file.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Row</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => {
                  const meta = ROW_STATUS_META[row.status];
                  return (
                    <tr
                      key={row.row_number}
                      className="border-b border-border align-top last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.row_number}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={meta.cls}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {row.label || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.source ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <IssueList issues={row.issues} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={commitDisabled}
          title={
            report.total_rows === 0
              ? "Nothing to import"
              : report.invalid_count === report.total_rows
                ? "Every row is invalid — fix the file and re-upload"
                : undefined
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Importing…" : "Commit import"}
        </button>
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: PreviewIssue[] }) {
  if (issues.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <ul className="space-y-1">
      {issues.map((issue, i) => (
        <li
          key={i}
          className={`text-xs ${
            issue.level === "error" ? "text-destructive" : "text-amber-600"
          }`}
        >
          {issue.level === "error" ? "Error: " : "Warning: "}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 — Result                                                     */
/* ------------------------------------------------------------------ */

function ResultStep({
  batch,
  onStartOver,
}: {
  batch: ImportBatchDetail;
  onStartOver: () => void;
}) {
  return (
    <div className="rounded-xl border border-green-200 bg-green-50/60 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#1A1F4D]">
            Import complete
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {batch.source_filename ?? "Your file"} was imported into{" "}
            {batch.entity_type.replace(/_/g, " ")}.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip label="Created" value={batch.created_count} cls="bg-green-100 text-green-700" />
        <StatChip label="Updated" value={batch.updated_count} cls="bg-indigo-100 text-indigo-700" />
        <StatChip label="Skipped" value={batch.skipped_count} cls="bg-amber-100 text-amber-700" />
        <StatChip
          label="Errors"
          value={batch.error_count}
          cls="bg-destructive/10 text-destructive"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <a
          href={`#import-${batch.id}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          View import log
        </a>
        <button
          type="button"
          onClick={onStartOver}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
        >
          Import another file
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Import log                                                          */
/* ------------------------------------------------------------------ */

function ImportLog({
  refreshKey,
  canRollback,
}: {
  refreshKey: string | null;
  canRollback: boolean;
}) {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listImports();
      setBatches(data);
    } catch (err) {
      setError(errMsg(err, "Unable to load the import log. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleRollback(batch: ImportBatch) {
    if (
      !window.confirm(
        "Roll back this import? Created records will be deleted.",
      )
    ) {
      return;
    }
    setActionError(null);
    setBusyId(batch.id);
    try {
      await rollbackImport(batch.id);
      await load();
    } catch (err) {
      setActionError(errMsg(err, "Unable to roll back this import."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-[#1A1F4D]">Import log</h2>
        <p className="text-sm text-muted-foreground">
          Every committed import. Roll one back to delete the records it created.
        </p>
      </div>

      {actionError && <ErrorBanner message={actionError} />}

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
        ) : batches.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No imports yet.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Profile</th>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Updated</th>
                <th className="px-4 py-3 text-right font-medium">Skipped</th>
                <th className="px-4 py-3 text-right font-medium">Errors</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const statusMeta = BATCH_STATUS_META[b.status] ?? {
                  label: b.status.replace(/_/g, " "),
                  cls: "bg-slate-100 text-slate-600",
                };
                const rollbackable =
                  canRollback && b.status === "committed";
                return (
                  <tr
                    key={b.id}
                    id={`import-${b.id}`}
                    className="border-b border-border last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      <span title={formatDate(b.created_at)}>
                        {relativeTime(b.created_at) || formatDate(b.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {b.profile}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.source_filename ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusMeta.cls}>{statusMeta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {b.created_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {b.updated_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {b.skipped_count}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        b.error_count > 0 ? "text-destructive" : ""
                      }`}
                    >
                      {b.error_count}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {rollbackable ? (
                          <button
                            type="button"
                            title="Roll back this import"
                            disabled={busyId === b.id}
                            onClick={() => handleRollback(b)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            {busyId === b.id ? "Rolling back…" : "Rollback"}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FIELD_CLS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
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
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function StatChip({
  label,
  value,
  cls,
}: {
  label: string;
  value: number;
  cls: string;
}) {
  return (
    <div className={`rounded-xl px-4 py-3 ${cls}`}>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">
        {label}
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
