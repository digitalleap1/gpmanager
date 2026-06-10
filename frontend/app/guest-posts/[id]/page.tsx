"use client";

import { Check, ExternalLink, Pencil, X } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  GuestPostStatusBadge,
  guestPostStatusLabel,
} from "@/components/guest-post-status-badge";
import { WorkflowTracker } from "@/components/workflow-tracker";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import { workflowLabel } from "@/lib/gp-workflow";
import type {
  GuestPostDetail,
  GuestPostListItem,
  GuestPostStatus,
  StatusHistoryEntry,
  UserAdminRead,
} from "@/lib/types";
import { cn, formatCurrency, formatDate, relativeTime } from "@/lib/utils";
import {
  approveAdvance,
  assignWriter,
  confirmPayment,
  getGuestPost,
  paymentSent,
  publish,
  reopenPayment,
  requestPayment,
  reviewGuestPost,
  sendToClient,
  setStatus,
  submitContent,
  submitForReview,
  wfPublish,
} from "@/services/guest-post-service";
import { listUsers } from "@/services/user-service";

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

export default function GuestPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();

  const isAdmin =
    !!user && (user.is_superuser || user.roles.includes("admin"));
  const isManager = isAdmin || (!!user && user.roles.includes("team_lead"));

  const [gp, setGp] = useState<GuestPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGuestPost(id);
      setGp(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load the guest post. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title={gp?.website_name ?? "Guest Post"}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : gp ? (
        <div className="space-y-6">
          {/* Header actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/guest-posts"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to list
            </Link>
            <Link
              href={`/guest-posts/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </div>

          {/* Project workflow stepper */}
          <WorkflowTracker status={gp.workflow_status} />

          {/* Workflow action card (state- + role-aware) */}
          <WorkflowActions
            guestPostId={id}
            workflowStatus={gp.workflow_status}
            isAdmin={isAdmin}
            isManager={isManager}
            reload={load}
          />

          {/* Assign content writer (managers only) */}
          {isManager && (
            <AssignWriter
              guestPostId={id}
              currentWriter={gp.content_writer}
              reload={load}
            />
          )}

          {/* Overview */}
          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">
                {gp.website_name ?? "Untitled site"}
              </h2>
              <GuestPostStatusBadge status={gp.status} />
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Project"
                value={
                  <Link
                    href={`/projects/${gp.project_id}`}
                    className="text-primary hover:underline"
                  >
                    {gp.project_name}
                  </Link>
                }
              />
              <Field label="DA" value={gp.da} />
              <Field label="DR" value={gp.dr} />
              <Field label="Traffic" value={gp.traffic} />
              <Field
                label="Price"
                value={gp.price != null ? formatCurrency(gp.price) : null}
              />
              <Field label="Contact email" value={gp.contact_email} />
              <Field label="Assigned user" value={gp.assigned_user?.full_name} />
              <Field
                label="Outreach date"
                value={formatDate(gp.outreach_date)}
              />
              <Field
                label="Live link date"
                value={formatDate(gp.live_link_date)}
              />
              <Field label="Anchor text" value={gp.anchor_text} />
              <Field
                label="Live link"
                value={
                  gp.live_link ? (
                    <a
                      href={gp.live_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open link
                    </a>
                  ) : null
                }
              />
            </dl>

            {gp.notes && (
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{gp.notes}</p>
              </div>
            )}
          </section>

          {/* Workflow controls */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <StatusWorkflow
              currentStatus={gp.status}
              onChanged={(updated) =>
                setGp((prev) =>
                  prev ? { ...prev, ...updated } : prev,
                )
              }
              guestPostId={id}
              reload={load}
            />
            <PublishControl
              guestPostId={id}
              initialLiveLink={gp.live_link}
              initialAnchorText={gp.anchor_text}
              isPublished={gp.status === "published"}
              onPublished={() => void load()}
            />
          </div>

          {/* Stage history & comments (workflow transitions + notes) */}
          <StageHistory entries={gp.status_history} />

          {/* Status history timeline */}
          <StatusHistory entries={gp.status_history} />
        </div>
      ) : null}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && value === "—");
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{isEmpty ? "—" : value}</dd>
    </div>
  );
}

/**
 * Status workflow control: choose any of the 8 statuses + an optional note and
 * record the change. Moving to `published` auto-bumps the project's monthly
 * goal on the backend.
 */
function StatusWorkflow({
  currentStatus,
  guestPostId,
  onChanged,
  reload,
}: {
  currentStatus: string;
  guestPostId: string;
  onChanged: (updated: Partial<GuestPostDetail>) => void;
  reload: () => Promise<void>;
}) {
  const [nextStatus, setNextStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep the dropdown in sync when the post reloads with a new status.
  useEffect(() => {
    setNextStatus(currentStatus);
  }, [currentStatus]);

  async function handleApply() {
    setErr(null);
    setBusy(true);
    try {
      const updated = await setStatus(
        guestPostId,
        nextStatus,
        note.trim() || null,
      );
      onChanged(updated);
      setNote("");
      // Reload to refresh the status-history timeline.
      await reload();
    } catch (e) {
      setErr(
        e instanceof ApiError ? e.message : "Unable to update the status.",
      );
    } finally {
      setBusy(false);
    }
  }

  const unchanged = nextStatus === currentStatus;

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-sm font-semibold">Update status</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Current status:{" "}
        <span className="font-medium">
          {guestPostStatusLabel(currentStatus)}
        </span>
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="next_status" className="text-sm font-medium">
            New status
          </label>
          <select
            id="next_status"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {guestPostStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="status_note" className="text-sm font-medium">
            Note (optional)
          </label>
          <textarea
            id="status_note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for this change…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {err && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {err}
          </p>
        )}

        <button
          type="button"
          onClick={handleApply}
          disabled={busy || unchanged}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Apply status"}
        </button>
      </div>
    </section>
  );
}

/**
 * Mark-published control: collects the live link (+ optional date/anchor) and
 * calls the dedicated publish endpoint, which sets status=published.
 */
function PublishControl({
  guestPostId,
  initialLiveLink,
  initialAnchorText,
  isPublished,
  onPublished,
}: {
  guestPostId: string;
  initialLiveLink: string | null;
  initialAnchorText: string | null;
  isPublished: boolean;
  onPublished: () => void;
}) {
  const [liveLink, setLiveLink] = useState(initialLiveLink ?? "");
  const [liveLinkDate, setLiveLinkDate] = useState("");
  const [anchorText, setAnchorText] = useState(initialAnchorText ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handlePublish() {
    if (liveLink.trim() === "") {
      setErr("A live link is required to mark this published.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await publish(guestPostId, {
        live_link: liveLink.trim(),
        live_link_date: liveLinkDate || null,
        anchor_text: anchorText.trim() || null,
      });
      onPublished();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.message
          : "Unable to mark this guest post published.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-sm font-semibold">Mark published</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {isPublished
          ? "Already published — you can update the live link details below."
          : "Record the live link to set this guest post to published."}
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="publish_live_link" className="text-sm font-medium">
            Live link <span className="text-destructive">*</span>
          </label>
          <input
            id="publish_live_link"
            type="url"
            value={liveLink}
            onChange={(e) => setLiveLink(e.target.value)}
            placeholder="https://example.com/article"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="publish_live_date"
              className="text-sm font-medium"
            >
              Live link date
            </label>
            <input
              id="publish_live_date"
              type="date"
              value={liveLinkDate}
              onChange={(e) => setLiveLinkDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="publish_anchor"
              className="text-sm font-medium"
            >
              Anchor text
            </label>
            <input
              id="publish_anchor"
              type="text"
              value={anchorText}
              onChange={(e) => setAnchorText(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {err && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {err}
          </p>
        )}

        <button
          type="button"
          onClick={handlePublish}
          disabled={busy || liveLink.trim() === ""}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : isPublished ? "Update live link" : "Mark published"}
        </button>
      </div>
    </section>
  );
}

/** Newest-first timeline of status changes with actor + relative time. */
function StatusHistory({ entries }: { entries: StatusHistoryEntry[] }) {
  const ordered = [...entries].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-sm font-semibold">Status history</h2>

      {ordered.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No status changes recorded yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {ordered.map((entry, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                {i < ordered.length - 1 && (
                  <span className="mt-1 w-px flex-1 bg-border" />
                )}
              </div>
              <div className="flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  {entry.from_status && (
                    <>
                      <GuestPostStatusBadge status={entry.from_status} />
                      <span className="text-xs text-muted-foreground">→</span>
                    </>
                  )}
                  <GuestPostStatusBadge status={entry.to_status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.changed_by?.full_name ?? "System"} ·{" "}
                  {relativeTime(entry.created_at)} ·{" "}
                  {formatDate(entry.created_at)}
                </p>
                {entry.note && (
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {entry.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ================================================================== *
 * Project workflow state machine
 * ================================================================== */

/** Friendly message for an action failure (special-casing 403s). */
function actionError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) {
      return "You don't have permission to perform this action.";
    }
    return e.message;
  }
  return "Something went wrong. Please try again.";
}

/** Shared shape for an open inline form. */
type OpenForm =
  | { kind: "reject" }
  | { kind: "publish" }
  | { kind: "request_payment" }
  | { kind: "note"; action: NoteAction }
  | null;

/** Workflow actions that take only an optional note. */
type NoteAction =
  | "submit_review"
  | "approve"
  | "approve_advance_review"
  | "approve_advance"
  | "submit_content"
  | "send_client"
  | "request_payment_plain"
  | "payment_sent"
  | "confirm_payment"
  | "reopen_payment";

/**
 * State- and role-aware action card. Renders only the button(s) valid for the
 * current `workflow_status` and the user's role (per the workflow table).
 * Actions needing input open an inline form; the rest open a small optional-note
 * form. Every call reloads the GP so the stepper + history stay in sync.
 */
function WorkflowActions({
  guestPostId,
  workflowStatus,
  isAdmin,
  isManager,
  reload,
}: {
  guestPostId: string;
  workflowStatus: string;
  isAdmin: boolean;
  isManager: boolean;
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState<OpenForm>(null);
  const [note, setNote] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [paymentType, setPaymentType] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset transient form state whenever the post moves to a new stage.
  useEffect(() => {
    setOpen(null);
    setNote("");
    setLiveUrl("");
    setAmount("");
    setCurrency("USD");
    setPaymentType("");
    setErr(null);
  }, [workflowStatus]);

  async function run(fn: () => Promise<GuestPostListItem>) {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      setOpen(null);
      setNote("");
      setLiveUrl("");
      setAmount("");
      setPaymentType("");
      await reload();
    } catch (e) {
      setErr(actionError(e));
    } finally {
      setBusy(false);
    }
  }

  const trimmedNote = () => note.trim() || undefined;

  function runNote(action: NoteAction) {
    const n = trimmedNote();
    switch (action) {
      case "submit_review":
        return run(() => submitForReview(guestPostId));
      case "approve":
        return run(() => reviewGuestPost(guestPostId, true, n));
      case "approve_advance_review":
        return run(() => reviewGuestPost(guestPostId, true, n, true));
      case "approve_advance":
        return run(() => approveAdvance(guestPostId, n));
      case "submit_content":
        return run(() => submitContent(guestPostId, n));
      case "send_client":
        return run(() => sendToClient(guestPostId, n));
      case "payment_sent":
        return run(() => paymentSent(guestPostId, n));
      case "confirm_payment":
        return run(() => confirmPayment(guestPostId, n));
      case "reopen_payment":
        return run(() => reopenPayment(guestPostId, n));
      default:
        return Promise.resolve();
    }
  }

  function handleReject() {
    if (note.trim() === "") {
      setErr("A reason is required to reject this submission.");
      return;
    }
    void run(() => reviewGuestPost(guestPostId, false, note.trim()));
  }

  function handlePublish() {
    if (liveUrl.trim() === "") {
      setErr("A live URL is required to mark this published.");
      return;
    }
    void run(() => wfPublish(guestPostId, liveUrl.trim(), trimmedNote()));
  }

  function handleRequestPayment() {
    const parsedAmount =
      amount.trim() === "" ? undefined : Number(amount);
    if (parsedAmount !== undefined && Number.isNaN(parsedAmount)) {
      setErr("Amount must be a number.");
      return;
    }
    void run(() =>
      requestPayment(guestPostId, {
        amount: parsedAmount,
        currency: currency.trim() || undefined,
        payment_type: paymentType.trim() || undefined,
        note: trimmedNote(),
      }),
    );
  }

  // Build the available primary actions for this state + role.
  const actions = workflowActionsFor(workflowStatus, { isAdmin, isManager });

  if (actions.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="text-sm font-semibold text-[#1A1F4D]">Workflow</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No action needed from you at this stage.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-sm font-semibold text-[#1A1F4D]">Workflow</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Current stage:{" "}
        <span className="font-medium">{workflowLabel(workflowStatus)}</span>
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={busy}
            onClick={() => {
              setErr(null);
              // Reset shared inputs so text doesn't leak between actions.
              setNote("");
              setLiveUrl("");
              setAmount("");
              setPaymentType("");
              if (a.form) {
                // Toggle the form open/closed.
                setOpen((prev) =>
                  prev && formKey(prev) === a.form ? null : openFor(a),
                );
              } else if (a.note) {
                setOpen((prev) =>
                  prev && prev.kind === "note" && prev.action === a.note
                    ? null
                    : { kind: "note", action: a.note! },
                );
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50",
              a.variant === "danger"
                ? "bg-red-600 text-white hover:bg-red-700"
                : a.variant === "success"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>

      {/* Inline forms */}
      {open?.kind === "reject" && (
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-background/40 p-4">
          <label htmlFor="wf_reject_note" className="text-sm font-medium">
            Rejection reason <span className="text-destructive">*</span>
          </label>
          <textarea
            id="wf_reject_note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain what needs fixing…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleReject}
              disabled={busy || note.trim() === ""}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Rejecting…" : "Confirm reject"}
            </button>
          </div>
        </div>
      )}

      {open?.kind === "publish" && (
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-background/40 p-4">
          <label htmlFor="wf_live_url" className="text-sm font-medium">
            Live URL <span className="text-destructive">*</span>
          </label>
          <input
            id="wf_live_url"
            type="url"
            value={liveUrl}
            onChange={(e) => setLiveUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <label htmlFor="wf_publish_note" className="text-sm font-medium">
            Note (optional)
          </label>
          <textarea
            id="wf_publish_note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handlePublish}
              disabled={busy || liveUrl.trim() === ""}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Mark published"}
            </button>
          </div>
        </div>
      )}

      {open?.kind === "request_payment" && (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-background/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="wf_amount" className="text-sm font-medium">
                Amount
              </label>
              <input
                id="wf_amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="wf_currency" className="text-sm font-medium">
                Currency
              </label>
              <input
                id="wf_currency"
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="wf_payment_type" className="text-sm font-medium">
                Payment type
              </label>
              <input
                id="wf_payment_type"
                type="text"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                placeholder="e.g. final"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="wf_rp_note" className="text-sm font-medium">
              Note (optional)
            </label>
            <textarea
              id="wf_rp_note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleRequestPayment}
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Request payment"}
            </button>
          </div>
        </div>
      )}

      {open?.kind === "note" && (
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-background/40 p-4">
          <label htmlFor="wf_note" className="text-sm font-medium">
            Note (optional)
          </label>
          <textarea
            id="wf_note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a comment for this stage…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (open.kind === "note") void runNote(open.action);
              }}
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
      )}

      {err && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {err}
        </p>
      )}
    </section>
  );
}

/** A single workflow action descriptor for the action card. */
interface WorkflowAction {
  id: string;
  label: string;
  variant?: "primary" | "danger" | "success";
  icon?: React.ReactNode;
  /** Opens a dedicated inline form. */
  form?: "reject" | "publish" | "request_payment";
  /** Opens the shared optional-note form, then runs this note action. */
  note?: NoteAction;
}

/** Map an open form back to its key for toggle comparison. */
function formKey(open: NonNullable<OpenForm>): string {
  return open.kind;
}

/** Build the OpenForm matching an action's `form` field. */
function openFor(a: WorkflowAction): OpenForm {
  switch (a.form) {
    case "reject":
      return { kind: "reject" };
    case "publish":
      return { kind: "publish" };
    case "request_payment":
      return { kind: "request_payment" };
    default:
      return null;
  }
}

/**
 * The available actions for a given workflow status + role, per the state
 * machine table. Returns an empty list when the user has nothing to do here.
 */
function workflowActionsFor(
  status: string,
  role: { isAdmin: boolean; isManager: boolean },
): WorkflowAction[] {
  const { isAdmin, isManager } = role;

  switch (status) {
    case "research":
      // member or manager
      return [
        {
          id: "submit_review",
          label: "Submit for review",
          note: "submit_review",
        },
      ];
    case "review_pending":
      if (!isManager) return [];
      return [
        {
          id: "approve",
          label: "Approve",
          variant: "success",
          icon: <Check className="h-4 w-4" />,
          note: "approve",
        },
        {
          id: "approve_advance",
          label: "Approve + needs advance payment",
          note: "approve_advance_review",
        },
        {
          id: "reject",
          label: "Reject",
          variant: "danger",
          icon: <X className="h-4 w-4" />,
          form: "reject",
        },
      ];
    case "rejected":
      // member or manager
      return [
        {
          id: "resubmit",
          label: "Re-submit for review",
          note: "submit_review",
        },
      ];
    case "advance_requested":
      if (!isAdmin) return [];
      return [
        {
          id: "approve_advance",
          label: "Approve advance",
          variant: "success",
          icon: <Check className="h-4 w-4" />,
          note: "approve_advance",
        },
      ];
    case "content_writing":
      // writer / member / manager
      return [
        {
          id: "submit_content",
          label: "Submit content",
          note: "submit_content",
        },
      ];
    case "content_ready":
      if (!isManager) return [];
      return [
        {
          id: "send_client",
          label: "Send to client",
          note: "send_client",
        },
      ];
    case "sent_to_client":
      if (!isManager) return [];
      return [
        {
          id: "publish",
          label: "Mark published (live URL)",
          variant: "success",
          form: "publish",
        },
      ];
    case "published":
      if (!isManager) return [];
      return [
        {
          id: "request_payment",
          label: "Request payment",
          form: "request_payment",
        },
      ];
    case "payment_requested":
      if (!isAdmin) return [];
      return [
        {
          id: "payment_sent",
          label: "Mark payment sent",
          note: "payment_sent",
        },
      ];
    case "payment_sent":
      if (!isManager) return [];
      return [
        {
          id: "confirm_payment",
          label: "Confirm payment",
          variant: "success",
          icon: <Check className="h-4 w-4" />,
          note: "confirm_payment",
        },
        {
          id: "reopen_payment",
          label: "Reopen (not received)",
          variant: "danger",
          note: "reopen_payment",
        },
      ];
    case "payment_verification":
      if (!isAdmin) return [];
      return [
        {
          id: "payment_sent",
          label: "Mark payment sent",
          note: "payment_sent",
        },
      ];
    case "completed":
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ */

/**
 * Assign / clear the content writer (managers only). Lists users for the
 * dropdown and shows the current writer when one is set.
 */
function AssignWriter({
  guestPostId,
  currentWriter,
  reload,
}: {
  guestPostId: string;
  currentWriter: { id: string; full_name: string } | null;
  reload: () => Promise<void>;
}) {
  const [users, setUsers] = useState<UserAdminRead[]>([]);
  const [selected, setSelected] = useState<string>(currentWriter?.id ?? "");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep the selection in sync when the post reloads with a new writer.
  useEffect(() => {
    setSelected(currentWriter?.id ?? "");
  }, [currentWriter?.id]);

  useEffect(() => {
    let active = true;
    setLoadingUsers(true);
    listUsers()
      .then((list) => {
        if (active) setUsers(list);
      })
      .catch((e) => {
        if (active) setErr(actionError(e));
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function apply(writerId: string | null) {
    setErr(null);
    setBusy(true);
    try {
      await assignWriter(guestPostId, writerId);
      await reload();
    } catch (e) {
      setErr(actionError(e));
    } finally {
      setBusy(false);
    }
  }

  const changed = (selected || null) !== (currentWriter?.id ?? null);

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-sm font-semibold text-[#1A1F4D]">Content writer</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {currentWriter
          ? `Currently assigned to ${currentWriter.full_name}.`
          : "No writer assigned yet."}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="writer_select" className="text-sm font-medium">
            Assign writer
          </label>
          <select
            id="writer_select"
            value={selected}
            disabled={loadingUsers || busy}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full min-w-[14rem] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            <option value="">— Unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void apply(selected || null)}
          disabled={busy || loadingUsers || !changed}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>

        {currentWriter && (
          <button
            type="button"
            onClick={() => {
              setSelected("");
              void apply(null);
            }}
            disabled={busy || loadingUsers}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      {err && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {err}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Stage history & comments: the workflow transitions and the notes recorded at
 * each step, newest first. Uses the shared workflow labels for from/to states.
 */
function StageHistory({ entries }: { entries: StatusHistoryEntry[] }) {
  const ordered = [...entries].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-sm font-semibold text-[#1A1F4D]">
        Stage history &amp; comments
      </h2>

      {ordered.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No workflow activity recorded yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {ordered.map((entry, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1A1F4D]" />
                {i < ordered.length - 1 && (
                  <span className="mt-1 w-px flex-1 bg-border" />
                )}
              </div>
              <div className="flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {entry.from_status && (
                    <>
                      <span className="text-muted-foreground">
                        {workflowLabel(entry.from_status)}
                      </span>
                      <span className="text-xs text-muted-foreground">→</span>
                    </>
                  )}
                  <span className="text-[#1A1F4D]">
                    {workflowLabel(entry.to_status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.changed_by?.full_name ?? "System"} ·{" "}
                  {relativeTime(entry.created_at)} ·{" "}
                  {formatDate(entry.created_at)}
                </p>
                {entry.note && (
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {entry.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
