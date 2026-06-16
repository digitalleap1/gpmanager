"use client";

/**
 * Workflow Checklist card for the project hub.
 *
 * Every project has four fixed workflow items — Find Website, Content Writing,
 * Publish Live Link, Payment. Each item carries a lifecycle status plus an
 * activity timeline of comments and (system) status changes.
 *
 *  - Managers (admin / team lead / superuser) can change an item's status and,
 *    on the Payment item, raise a "Request Payment". Everyone else sees the
 *    status read-only.
 *  - Anyone on the project can add comments to any item's timeline.
 *
 * Each item is an expandable card; expanding it reveals the timeline and a
 * comment box. After any mutation we replace local state with the `Checklist`
 * the backend returns.
 */

import {
  Check,
  ChevronDown,
  CreditCard,
  Globe,
  Link as LinkIcon,
  PenLine,
  Send,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type {
  Checklist,
  ChecklistItem,
  ChecklistItemKey,
  ChecklistStatus,
  UserRef,
} from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import {
  addChecklistComment,
  getChecklist,
  requestChecklistPayment,
  setChecklistStatus,
} from "@/services/project-service";

/** Per-item decoration (icon) keyed by item_key, with a sensible fallback. */
const ITEM_ICONS: Record<ChecklistItemKey, LucideIcon> = {
  find_website: Globe,
  content_writing: PenLine,
  publish_live_link: LinkIcon,
  payment: CreditCard,
};

/** The five statuses + their labels, used to populate the manager `<select>`. */
const STATUS_OPTIONS: { value: ChecklistStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "approved", label: "Approved" },
  { value: "done", label: "Done" },
];

/** Map an unknown error to a friendly, ApiError-aware message. */
function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return "Only team leads and admins can update the checklist status.";
    }
    return err.message;
  }
  return fallback;
}

/** Build up-to-two-letter initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function WorkflowChecklist({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const isManager =
    !!user &&
    (user.is_superuser ||
      user.roles.includes("admin") ||
      user.roles.includes("team_lead"));

  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which item is mid-action (so we can disable just that card), plus any error
  // raised by the most recent mutation.
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setChecklist(await getChecklist(projectId));
    } catch (err) {
      setError(errMsg(err, "Unable to load the workflow checklist."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatusChange = useCallback(
    async (itemId: string, status: ChecklistStatus) => {
      setActionError(null);
      setBusyItemId(itemId);
      try {
        setChecklist(await setChecklistStatus(projectId, itemId, status));
      } catch (err) {
        setActionError(errMsg(err, "Unable to update the item status."));
      } finally {
        setBusyItemId(null);
      }
    },
    [projectId],
  );

  const handleAddComment = useCallback(
    async (itemId: string, body: string, subjectId?: string | null) => {
      setActionError(null);
      setBusyItemId(itemId);
      try {
        setChecklist(
          await addChecklistComment(projectId, itemId, body, subjectId),
        );
      } catch (err) {
        setActionError(errMsg(err, "Unable to add the comment."));
        throw err;
      } finally {
        setBusyItemId(null);
      }
    },
    [projectId],
  );

  const handleRequestPayment = useCallback(
    async (itemId: string, note?: string) => {
      setActionError(null);
      setBusyItemId(itemId);
      try {
        setChecklist(await requestChecklistPayment(projectId, itemId, note));
      } catch (err) {
        setActionError(errMsg(err, "Unable to request payment."));
        throw err;
      } finally {
        setBusyItemId(null);
      }
    },
    [projectId],
  );

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold text-[#1A1F4D]">
          Workflow Checklist
        </h2>
        {checklist && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {checklist.completed_count} / {checklist.total}
            </span>
            {checklist.all_done && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                <Check className="h-3.5 w-3.5" />
                Workflow Complete
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-6 py-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading checklist…</p>
        ) : error ? (
          <div>
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Try again
            </button>
          </div>
        ) : !checklist ? null : (
          <>
            {actionError && (
              <p
                role="alert"
                className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {actionError}
              </p>
            )}
            <ol className="space-y-3">
              {checklist.items.map((item) => (
                <ChecklistItemCard
                  key={item.id}
                  item={item}
                  members={checklist.members}
                  isManager={isManager}
                  busy={busyItemId === item.id}
                  disabled={busyItemId !== null}
                  onStatusChange={handleStatusChange}
                  onAddComment={handleAddComment}
                  onRequestPayment={handleRequestPayment}
                />
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * One checklist item — expandable card
 * ------------------------------------------------------------------ */

function ChecklistItemCard({
  item,
  members,
  isManager,
  busy,
  disabled,
  onStatusChange,
  onAddComment,
  onRequestPayment,
}: {
  item: ChecklistItem;
  members: UserRef[];
  isManager: boolean;
  busy: boolean;
  disabled: boolean;
  onStatusChange: (itemId: string, status: ChecklistStatus) => void;
  onAddComment: (
    itemId: string,
    body: string,
    subjectId?: string | null,
  ) => Promise<void>;
  onRequestPayment: (itemId: string, note?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ITEM_ICONS[item.item_key] ?? Check;
  const isPayment = item.item_key === "payment";

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-background/50">
      {/* Header row */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {item.title}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {item.timeline.length === 0
                ? "No activity yet"
                : `${item.timeline.length} update${
                    item.timeline.length === 1 ? "" : "s"
                  }`}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        {/* Status control */}
        <div className="flex items-center gap-3 sm:justify-end">
          {isManager ? (
            <select
              value={item.status}
              disabled={disabled}
              aria-label={`Status for ${item.title}`}
              onChange={(e) =>
                onStatusChange(item.id, e.target.value as ChecklistStatus)
              }
              className="w-full max-w-[12rem] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:w-auto"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <StatusBadge
              status={item.status}
              label={item.status_label}
              busy={busy}
            />
          )}
          {isManager && busy && (
            <span className="text-xs text-muted-foreground">Saving…</span>
          )}
        </div>
      </div>

      {/* Expanded body: timeline + comment box (+ request payment) */}
      {expanded && (
        <div className="border-t border-border px-4 py-4">
          <Timeline item={item} />

          {isManager && isPayment && (
            <RequestPaymentControl
              busy={busy}
              disabled={disabled}
              onRequest={(note) => onRequestPayment(item.id, note)}
            />
          )}

          <CommentBox
            busy={busy}
            disabled={disabled}
            members={members}
            onSubmit={(body, subjectId) =>
              onAddComment(item.id, body, subjectId)
            }
          />
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Status badge (read-only view for non-managers)
 * ------------------------------------------------------------------ */

const STATUS_BADGE_CLS: Record<ChecklistStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  approved: "bg-green-100 text-green-700",
  done: "bg-green-100 text-green-700",
};

function StatusBadge({
  status,
  label,
  busy,
}: {
  status: ChecklistStatus;
  label: string;
  busy: boolean;
}) {
  const base =
    "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";
  if (busy) {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>Saving…</span>
    );
  }
  return <span className={cn(base, STATUS_BADGE_CLS[status])}>{label}</span>;
}

/* ------------------------------------------------------------------ *
 * Activity timeline
 * ------------------------------------------------------------------ */

function Timeline({ item }: { item: ChecklistItem }) {
  if (item.timeline.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity yet.</p>
    );
  }

  return (
    <ul className="space-y-4">
      {item.timeline.map((entry) => {
        const name = entry.author?.full_name ?? "System";
        if (entry.kind === "status") {
          return (
            <li key={entry.id} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Check className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm italic text-muted-foreground">
                  {entry.body}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {name}
                  {" · "}
                  {relativeTime(entry.created_at)}
                </p>
              </div>
            </li>
          );
        }
        return (
          <li key={entry.id} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-sm font-medium text-foreground">{name}</p>
                <span className="text-xs text-muted-foreground">
                  {relativeTime(entry.created_at)}
                </span>
                {entry.subject && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <UserIcon className="h-3 w-3" />
                    {entry.subject.full_name}
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                {entry.body}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ *
 * Comment box
 * ------------------------------------------------------------------ */

function CommentBox({
  busy,
  disabled,
  members,
  onSubmit,
}: {
  busy: boolean;
  disabled: boolean;
  members: UserRef[];
  onSubmit: (body: string, subjectId?: string | null) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [subjectId, setSubjectId] = useState("");

  async function handleSend() {
    const trimmed = body.trim();
    if (trimmed === "") return;
    try {
      await onSubmit(trimmed, subjectId || null);
      setBody("");
      setSubjectId("");
    } catch {
      // Error is surfaced by the parent; keep the draft so it isn't lost.
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Add a comment…"
        disabled={disabled}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {members.length > 0 && (
          <label className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">Member:</span>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={disabled}
              aria-label="Member this comment is about"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— none —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={disabled || body.trim() === ""}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Request Payment (managers, payment item only)
 * ------------------------------------------------------------------ */

function RequestPaymentControl({
  busy,
  disabled,
  onRequest,
}: {
  busy: boolean;
  disabled: boolean;
  onRequest: (note?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  async function handleConfirm() {
    const trimmed = note.trim();
    try {
      await onRequest(trimmed === "" ? undefined : trimmed);
      setNote("");
      setOpen(false);
    } catch {
      // Error surfaced by the parent; keep the form open with the draft note.
    }
  }

  if (!open) {
    return (
      <div className="mb-4 flex justify-start">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          <CreditCard className="h-4 w-4" />
          Request Payment
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <label className="block text-xs font-medium text-muted-foreground">
        Add a note (optional)
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="e.g. Invoice attached, please process."
        disabled={disabled}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setNote("");
          }}
          disabled={disabled}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <CreditCard className="h-4 w-4" />
          {busy ? "Requesting…" : "Request Payment"}
        </button>
      </div>
    </div>
  );
}

export default WorkflowChecklist;
