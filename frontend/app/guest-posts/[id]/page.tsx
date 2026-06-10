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
import { WORKFLOW_BRANCH_STATES, workflowLabel } from "@/lib/gp-workflow";
import type {
  GuestPostDetail,
  GuestPostListItem,
  GuestPostStatus,
  StatusHistoryEntry,
  UserAdminRead,
  UserRef,
} from "@/lib/types";
import { cn, formatCurrency, formatDate, relativeTime } from "@/lib/utils";
import {
  approveAdvance,
  assignWriter,
  confirmPayment,
  getGuestPost,
  paymentSent,
  publish,
  reassignTicket,
  reopenPayment,
  requestPayment,
  reviewGuestPost,
  sendToClient,
  setStatus,
  submitContent,
  submitForReview,
  verifyLink,
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

  const isCurrentAssignee =
    !!user && !!gp?.assigned_user && gp.assigned_user.id === user.id;

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

          {/* Workflow action card (state- + role- + assignee-aware) */}
          <WorkflowActions
            guestPostId={id}
            workflowStatus={gp.workflow_status}
            assignedUser={gp.assigned_user}
            liveLink={gp.live_link}
            isAdmin={isAdmin}
            isManager={isManager}
            isCurrentAssignee={isCurrentAssignee}
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
 * Project workflow state machine (per-ticket reassignment model)
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

/**
 * Which inline form (if any) an action opens. `note` forms only collect an
 * optional note; the richer forms collect extra inputs (selects, live URL,
 * payment details).
 */
type FormKind =
  | "assign_reviewer"
  | "approve"
  | "reject"
  | "approve_advance"
  | "submit_content"
  | "send_client"
  | "publish"
  | "verify_approve"
  | "verify_fail"
  | "request_payment"
  | "payment_sent"
  | "confirm_payment"
  | "reopen_payment";

/** A single workflow action descriptor for the action card. */
interface WorkflowAction {
  id: string;
  label: string;
  form: FormKind;
  variant?: "primary" | "danger" | "success";
  icon?: React.ReactNode;
}

/** Inputs the action card may collect across its inline forms. */
interface ActionContext {
  isAdmin: boolean;
  isManager: boolean;
  isCurrentAssignee: boolean;
}

/**
 * The available actions for a given workflow status + role + assignee, per the
 * state-machine table. Returns an empty list when the user has nothing to do
 * here.
 *
 * "current assignee" = the ticket's `assigned_user` is the signed-in user.
 */
function workflowActionsFor(
  status: string,
  ctx: ActionContext,
): WorkflowAction[] {
  const { isAdmin, isManager, isCurrentAssignee } = ctx;
  // The current assignee can always act on their own stage; otherwise the
  // listed role is required.
  const assigneeOrManager = isCurrentAssignee || isManager;

  switch (status) {
    case "research":
      // team lead / creator → assign a reviewer
      if (!assigneeOrManager) return [];
      return [
        {
          id: "assign_reviewer",
          label: "Assign reviewer",
          form: "assign_reviewer",
        },
      ];
    case "review_pending":
      // the current assignee (reviewer) OR a manager
      if (!assigneeOrManager) return [];
      return [
        {
          id: "approve",
          label: "Approve",
          form: "approve",
          variant: "success",
          icon: <Check className="h-4 w-4" />,
        },
        {
          id: "approve_advance",
          label: "Approve + needs advance payment",
          form: "approve",
        },
        {
          id: "reject",
          label: "Reject",
          form: "reject",
          variant: "danger",
          icon: <X className="h-4 w-4" />,
        },
      ];
    case "rejected":
      // team lead → re-assign a reviewer
      if (!isManager) return [];
      return [
        {
          id: "reassign_reviewer",
          label: "Re-assign reviewer",
          form: "assign_reviewer",
        },
      ];
    case "advance_requested":
      // admin → approve advance
      if (!isAdmin) return [];
      return [
        {
          id: "approve_advance_pay",
          label: "Approve advance",
          form: "approve_advance",
          variant: "success",
          icon: <Check className="h-4 w-4" />,
        },
      ];
    case "content_writing":
      // current assignee (writer) / manager → submit content
      if (!assigneeOrManager) return [];
      return [
        {
          id: "submit_content",
          label: "Submit content",
          form: "submit_content",
        },
      ];
    case "content_ready":
      // team lead → send to client
      if (!isManager) return [];
      return [
        {
          id: "send_client",
          label: "Send to client",
          form: "send_client",
        },
      ];
    case "sent_to_client":
      // team lead → mark published + assign verifier
      if (!isManager) return [];
      return [
        {
          id: "publish",
          label: "Mark published + assign verifier",
          form: "publish",
          variant: "success",
        },
      ];
    case "verification_pending":
      // the current assignee (verifier) OR a manager
      if (!assigneeOrManager) return [];
      return [
        {
          id: "verify_approve",
          label: "Verify – Approve",
          form: "verify_approve",
          variant: "success",
          icon: <Check className="h-4 w-4" />,
        },
        {
          id: "verify_fail",
          label: "Verify – Fail",
          form: "verify_fail",
          variant: "danger",
          icon: <X className="h-4 w-4" />,
        },
      ];
    case "verified":
      // team lead → request payment
      if (!isManager) return [];
      return [
        {
          id: "request_payment",
          label: "Request payment",
          form: "request_payment",
        },
      ];
    case "verification_failed":
      // team lead → re-publish / re-assign verifier
      if (!isManager) return [];
      return [
        {
          id: "republish",
          label: "Re-publish / re-assign verifier",
          form: "publish",
          variant: "success",
        },
      ];
    case "payment_requested":
      // admin → mark payment sent
      if (!isAdmin) return [];
      return [
        {
          id: "payment_sent",
          label: "Mark payment sent",
          form: "payment_sent",
        },
      ];
    case "payment_sent":
      // team lead → confirm payment / reopen (recheck)
      if (!isManager) return [];
      return [
        {
          id: "confirm_payment",
          label: "Confirm payment",
          form: "confirm_payment",
          variant: "success",
          icon: <Check className="h-4 w-4" />,
        },
        {
          id: "reopen_payment",
          label: "Reopen (recheck)",
          form: "reopen_payment",
          variant: "danger",
        },
      ];
    case "payment_recheck":
      // admin → mark payment sent
      if (!isAdmin) return [];
      return [
        {
          id: "payment_sent_recheck",
          label: "Mark payment sent",
          form: "payment_sent",
        },
      ];
    case "completed":
    default:
      return [];
  }
}

/**
 * State-, role- and assignee-aware action card. Renders only the button(s)
 * valid for the current `workflow_status` and the user, per the workflow table.
 * Each button opens an inline form (note and/or assignee select / live URL /
 * payment fields). A manager can also reassign the ticket from any non-terminal
 * state. Every call reloads the GP so the stepper + history stay in sync.
 */
function WorkflowActions({
  guestPostId,
  workflowStatus,
  assignedUser,
  liveLink,
  isAdmin,
  isManager,
  isCurrentAssignee,
  reload,
}: {
  guestPostId: string;
  workflowStatus: string;
  assignedUser: UserRef | null;
  liveLink: string | null;
  isAdmin: boolean;
  isManager: boolean;
  isCurrentAssignee: boolean;
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState<{ form: FormKind; advance: boolean } | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [paymentType, setPaymentType] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Users for the assignee pickers (reviewer / writer / verifier / reassign).
  const [users, setUsers] = useState<UserAdminRead[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listUsers()
      .then((list) => {
        if (active) setUsers(list);
      })
      .catch((e) => {
        if (active) setUsersError(actionError(e));
      });
    return () => {
      active = false;
    };
  }, []);

  // Reset transient form state whenever the post moves to a new stage.
  useEffect(() => {
    setOpen(null);
    setNote("");
    setLiveUrl("");
    setAssigneeId("");
    setAmount("");
    setCurrency("USD");
    setPaymentType("");
    setErr(null);
  }, [workflowStatus]);

  function resetInputs() {
    setNote("");
    setLiveUrl("");
    setAssigneeId("");
    setAmount("");
    setPaymentType("");
    setErr(null);
  }

  async function run(fn: () => Promise<GuestPostListItem>) {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      setOpen(null);
      resetInputs();
      await reload();
    } catch (e) {
      setErr(actionError(e));
    } finally {
      setBusy(false);
    }
  }

  const trimmedNote = () => note.trim() || undefined;
  const selectedAssignee = () => assigneeId || undefined;

  function submit() {
    if (!open) return;
    switch (open.form) {
      case "assign_reviewer":
        if (assigneeId === "") {
          setErr("Select a reviewer to assign.");
          return;
        }
        void run(() => submitForReview(guestPostId, assigneeId));
        return;
      case "approve":
        void run(() =>
          reviewGuestPost(guestPostId, {
            approve: true,
            note: trimmedNote(),
            advance: open.advance || undefined,
            content_writer_id: open.advance ? undefined : selectedAssignee(),
          }),
        );
        return;
      case "reject":
        if (note.trim() === "") {
          setErr("A reason is required to reject this submission.");
          return;
        }
        void run(() =>
          reviewGuestPost(guestPostId, {
            approve: false,
            note: note.trim(),
          }),
        );
        return;
      case "approve_advance":
        void run(() =>
          approveAdvance(guestPostId, {
            note: trimmedNote(),
            content_writer_id: selectedAssignee(),
          }),
        );
        return;
      case "submit_content":
        void run(() => submitContent(guestPostId, trimmedNote()));
        return;
      case "send_client":
        void run(() => sendToClient(guestPostId, trimmedNote()));
        return;
      case "publish":
        if (liveUrl.trim() === "") {
          setErr("A live URL is required to mark this published.");
          return;
        }
        void run(() =>
          wfPublish(guestPostId, {
            live_url: liveUrl.trim(),
            note: trimmedNote(),
            verifier_id: selectedAssignee(),
          }),
        );
        return;
      case "verify_approve":
        void run(() => verifyLink(guestPostId, true, trimmedNote()));
        return;
      case "verify_fail":
        if (note.trim() === "") {
          setErr("A reason is required to fail verification.");
          return;
        }
        void run(() => verifyLink(guestPostId, false, note.trim()));
        return;
      case "request_payment": {
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
        return;
      }
      case "payment_sent":
        void run(() => paymentSent(guestPostId, trimmedNote()));
        return;
      case "confirm_payment":
        void run(() => confirmPayment(guestPostId, trimmedNote()));
        return;
      case "reopen_payment":
        void run(() => reopenPayment(guestPostId, trimmedNote()));
        return;
      default:
        return;
    }
  }

  // Build the available primary actions for this state + role.
  const actions = workflowActionsFor(workflowStatus, {
    isAdmin,
    isManager,
    isCurrentAssignee,
  });

  const isTerminal = workflowStatus === "completed";
  const isBranch = WORKFLOW_BRANCH_STATES.includes(workflowStatus);
  const canReassign = isManager && !isTerminal;
  const assigneeName = assignedUser?.full_name ?? "Unassigned";

  // When publishing from the verification_failed branch, pre-fill the live URL.
  useEffect(() => {
    if (
      open?.form === "publish" &&
      workflowStatus === "verification_failed" &&
      liveUrl === "" &&
      liveLink
    ) {
      setLiveUrl(liveLink);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.form, workflowStatus]);

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#1A1F4D]">Workflow</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Current stage:{" "}
            <span className="font-medium">
              {workflowLabel(workflowStatus)}
            </span>
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Current assignee
          </p>
          <p
            className={cn(
              "text-sm font-semibold",
              assignedUser ? "text-[#1A1F4D]" : "text-muted-foreground",
            )}
          >
            {assigneeName}
          </p>
        </div>
      </div>

      {usersError && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {usersError}
        </p>
      )}

      {actions.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No action needed from you at this stage.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((a) => {
            const advance = a.id === "approve_advance";
            const isActive =
              open?.form === a.form && open.advance === advance;
            return (
              <button
                key={a.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  resetInputs();
                  setOpen((prev) =>
                    prev && prev.form === a.form && prev.advance === advance
                      ? null
                      : { form: a.form, advance },
                  );
                }}
                aria-expanded={isActive}
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
            );
          })}
        </div>
      )}

      {/* Inline form for the open action. */}
      {open && (
        <ActionForm
          open={open}
          users={users}
          note={note}
          setNote={setNote}
          liveUrl={liveUrl}
          setLiveUrl={setLiveUrl}
          assigneeId={assigneeId}
          setAssigneeId={setAssigneeId}
          amount={amount}
          setAmount={setAmount}
          currency={currency}
          setCurrency={setCurrency}
          paymentType={paymentType}
          setPaymentType={setPaymentType}
          busy={busy}
          onSubmit={submit}
        />
      )}

      {err && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {err}
        </p>
      )}

      {/* Reassign control — managers, any non-terminal state. */}
      {canReassign && (
        <ReassignTicket
          guestPostId={guestPostId}
          users={users}
          currentAssigneeId={assignedUser?.id ?? null}
          isBranch={isBranch}
          reload={reload}
        />
      )}
    </section>
  );
}

/** Brand-styled assignee `<select>` used across the workflow forms. */
function AssigneeSelect({
  id,
  label,
  value,
  users,
  onChange,
  disabled,
  unassignedLabel = "— Keep current assignee —",
}: {
  id: string;
  label: string;
  value: string;
  users: UserAdminRead[];
  onChange: (value: string) => void;
  disabled?: boolean;
  unassignedLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        <option value="">{unassignedLabel}</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The inline form body for whichever workflow action is currently open. */
function ActionForm({
  open,
  users,
  note,
  setNote,
  liveUrl,
  setLiveUrl,
  assigneeId,
  setAssigneeId,
  amount,
  setAmount,
  currency,
  setCurrency,
  paymentType,
  setPaymentType,
  busy,
  onSubmit,
}: {
  open: { form: FormKind; advance: boolean };
  users: UserAdminRead[];
  note: string;
  setNote: (v: string) => void;
  liveUrl: string;
  setLiveUrl: (v: string) => void;
  assigneeId: string;
  setAssigneeId: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  paymentType: string;
  setPaymentType: (v: string) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  const { form, advance } = open;

  const noteField = (opts?: { required?: boolean; label?: string }) => (
    <div className="space-y-1.5">
      <label htmlFor="wf_note" className="text-sm font-medium">
        {opts?.label ?? "Note"}
        {opts?.required ? (
          <span className="text-destructive"> *</span>
        ) : (
          <span className="text-muted-foreground"> (optional)</span>
        )}
      </label>
      <textarea
        id="wf_note"
        rows={opts?.required ? 3 : 2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a comment for this stage…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );

  let body: React.ReactNode = null;
  let submitLabel = "Confirm";
  let submitVariant: "primary" | "danger" | "success" = "primary";

  switch (form) {
    case "assign_reviewer":
      submitLabel = "Assign reviewer";
      body = (
        <>
          <AssigneeSelect
            id="wf_reviewer"
            label="Reviewer"
            value={assigneeId}
            users={users}
            disabled={busy}
            onChange={setAssigneeId}
            unassignedLabel="— Select a reviewer —"
          />
          {noteField()}
        </>
      );
      break;
    case "approve":
      submitVariant = "success";
      submitLabel = advance ? "Approve + request advance" : "Approve";
      body = (
        <>
          {!advance && (
            <AssigneeSelect
              id="wf_writer"
              label="Assign content writer"
              value={assigneeId}
              users={users}
              disabled={busy}
              onChange={setAssigneeId}
              unassignedLabel="— Keep reviewer (no writer) —"
            />
          )}
          {advance && (
            <p className="text-xs text-muted-foreground">
              This will request an advance payment before content writing.
            </p>
          )}
          {noteField()}
        </>
      );
      break;
    case "reject":
      submitVariant = "danger";
      submitLabel = "Confirm reject";
      body = noteField({ required: true, label: "Rejection reason" });
      break;
    case "approve_advance":
      submitVariant = "success";
      submitLabel = "Approve advance";
      body = (
        <>
          <AssigneeSelect
            id="wf_adv_writer"
            label="Assign content writer"
            value={assigneeId}
            users={users}
            disabled={busy}
            onChange={setAssigneeId}
            unassignedLabel="— Keep current assignee —"
          />
          {noteField()}
        </>
      );
      break;
    case "submit_content":
      submitLabel = "Submit content";
      body = noteField();
      break;
    case "send_client":
      submitLabel = "Send to client";
      body = noteField();
      break;
    case "publish":
      submitVariant = "success";
      submitLabel = "Mark published";
      body = (
        <>
          <div className="space-y-1.5">
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
          </div>
          <AssigneeSelect
            id="wf_verifier"
            label="Assign verifier"
            value={assigneeId}
            users={users}
            disabled={busy}
            onChange={setAssigneeId}
            unassignedLabel="— Keep current assignee —"
          />
          {noteField()}
        </>
      );
      break;
    case "verify_approve":
      submitVariant = "success";
      submitLabel = "Confirm verified";
      body = noteField();
      break;
    case "verify_fail":
      submitVariant = "danger";
      submitLabel = "Confirm fail";
      body = noteField({ required: true, label: "Failure reason" });
      break;
    case "request_payment":
      submitLabel = "Request payment";
      body = (
        <>
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
          {noteField()}
        </>
      );
      break;
    case "payment_sent":
      submitLabel = "Mark payment sent";
      body = noteField();
      break;
    case "confirm_payment":
      submitVariant = "success";
      submitLabel = "Confirm payment";
      body = noteField();
      break;
    case "reopen_payment":
      submitVariant = "danger";
      submitLabel = "Reopen (recheck)";
      body = noteField();
      break;
    default:
      body = null;
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-border bg-background/40 p-4">
      {body}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50",
            submitVariant === "danger"
              ? "bg-red-600 hover:bg-red-700"
              : submitVariant === "success"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * Small "Reassign ticket" control: managers can hand the ticket to anyone (or
 * unassign) from any non-terminal state.
 */
function ReassignTicket({
  guestPostId,
  users,
  currentAssigneeId,
  isBranch,
  reload,
}: {
  guestPostId: string;
  users: UserAdminRead[];
  currentAssigneeId: string | null;
  isBranch: boolean;
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(currentAssigneeId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSelected(currentAssigneeId ?? "");
  }, [currentAssigneeId]);

  async function apply() {
    setErr(null);
    setBusy(true);
    try {
      await reassignTicket(guestPostId, selected || null);
      setOpen(false);
      await reload();
    } catch (e) {
      setErr(actionError(e));
    } finally {
      setBusy(false);
    }
  }

  const unchanged = (selected || null) === (currentAssigneeId ?? null);

  return (
    <div className="mt-4 border-t border-border pt-4">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {isBranch ? "Reassign ticket" : "Reassign ticket to someone else"}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Reassign ticket
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <AssigneeSelect
              id="wf_reassign"
              label="New assignee"
              value={selected}
              users={users}
              disabled={busy}
              onChange={setSelected}
              unassignedLabel="— Unassign —"
            />
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy || unchanged}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Reassign"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSelected(currentAssigneeId ?? "");
                setErr(null);
              }}
              disabled={busy}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {err && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {err}
            </p>
          )}
        </div>
      )}
    </div>
  );
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
