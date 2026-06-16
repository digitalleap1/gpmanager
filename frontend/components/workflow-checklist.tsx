"use client";

/**
 * Workflow Checklist card for the project hub.
 *
 * Every project has four fixed workflow items — Find Website, Content Writing,
 * Publish Live Link, Payment. Each item carries a lifecycle status plus an
 * activity timeline of (system) status changes and notes, and may record a
 * link (website / live URL / payment link) and an assigned member.
 *
 *  - The project lead / an admin (`can_manage_status`), or an item's own
 *    assignee, may change that item's status via an "Update Status" modal that
 *    sets status, link, an optional note, and the assignee all at once.
 *    Everyone else sees the status read-only.
 *  - The Payment item additionally captures amount + currency, payment type,
 *    transaction id and payment mode through that same modal.
 *
 * Each item is an expandable card; expanding it reveals the timeline. After any
 * mutation we replace local state with the `Checklist` the backend returns.
 */

import {
  Check,
  ChevronDown,
  CreditCard,
  ExternalLink,
  Globe,
  Link as LinkIcon,
  PenLine,
  User as UserIcon,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type {
  Checklist,
  ChecklistItem,
  ChecklistItemKey,
  ChecklistStatus,
  CurrencyRef,
  UserRef,
} from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { getChecklist, setChecklistStatus } from "@/services/project-service";
import { getCurrencies } from "@/services/lookup-service";

/** Opts carried into a status update, including payment-only fields. */
interface StatusUpdateOpts {
  note?: string;
  link?: string;
  assigneeId?: string | null;
  paymentType?: string;
  amount?: number;
  currency?: string;
  transactionId?: string;
  paymentMode?: string;
}

/** Payment-type options shown only on the payment item. */
const PAYMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "regular", label: "Regular" },
  { value: "advance", label: "Advance" },
  { value: "reversal", label: "Reversal" },
];

/** Badge style for a payment type (regular has no badge). */
const PAYMENT_TYPE_BADGE_CLS: Record<string, string> = {
  advance: "bg-blue-100 text-blue-700",
  reversal: "bg-orange-100 text-orange-700",
};

/** Per-item decoration (icon) keyed by item_key, with a sensible fallback. */
const ITEM_ICONS: Record<ChecklistItemKey, LucideIcon> = {
  find_website: Globe,
  content_writing: PenLine,
  publish_live_link: LinkIcon,
  payment: CreditCard,
};

/** The statuses + their labels, used to populate the status `<select>`. */
const STATUS_OPTIONS: { value: ChecklistStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "In Review" },
  { value: "completed", label: "Completed" },
  { value: "approved", label: "Approved" },
  { value: "done", label: "Done" },
];

/** The label shown above the link input, adapted to the item it belongs to. */
const LINK_LABELS: Record<ChecklistItemKey, string> = {
  find_website: "Website link",
  content_writing: "Link",
  publish_live_link: "Live URL",
  payment: "Client payment link",
};

/** Map an unknown error to a friendly, ApiError-aware message. */
function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return "Only the project lead or an admin can change this status.";
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

  const handleStatusUpdate = useCallback(
    async (itemId: string, status: ChecklistStatus, opts: StatusUpdateOpts) => {
      setActionError(null);
      setBusyItemId(itemId);
      try {
        setChecklist(await setChecklistStatus(projectId, itemId, status, opts));
      } catch (err) {
        setActionError(errMsg(err, "Unable to update the item status."));
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
              {checklist.items.map((item) => {
                const canUpdate =
                  checklist.can_manage_status ||
                  (!!user && item.assignee?.id === user.id);
                return (
                  <ChecklistItemCard
                    key={item.id}
                    item={item}
                    members={checklist.members}
                    canUpdate={canUpdate}
                    busy={busyItemId === item.id}
                    disabled={busyItemId !== null}
                    onStatusUpdate={handleStatusUpdate}
                  />
                );
              })}
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
  canUpdate,
  busy,
  disabled,
  onStatusUpdate,
}: {
  item: ChecklistItem;
  members: UserRef[];
  canUpdate: boolean;
  busy: boolean;
  disabled: boolean;
  onStatusUpdate: (
    itemId: string,
    status: ChecklistStatus,
    opts: StatusUpdateOpts,
  ) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const Icon = ITEM_ICONS[item.item_key] ?? Check;
  const isPayment = item.item_key === "payment";
  const hasPaymentDetails =
    isPayment &&
    (item.amount != null ||
      !!item.payment_type ||
      !!item.transaction_id ||
      !!item.payment_mode);

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
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span>
                {item.timeline.length === 0
                  ? "No activity yet"
                  : `${item.timeline.length} update${
                      item.timeline.length === 1 ? "" : "s"
                    }`}
              </span>
              {item.assignee && (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true">·</span>
                  <UserIcon className="h-3 w-3" />
                  {item.assignee.full_name}
                </span>
              )}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        {/* Status badge (+ Update button when allowed) */}
        <div className="flex items-center gap-2 sm:justify-end">
          <StatusBadge
            status={item.status}
            label={item.status_label}
            busy={busy}
          />
          {canUpdate && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={disabled}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              <PenLine className="h-3.5 w-3.5" />
              Update Status
            </button>
          )}
        </div>
      </div>

      {/* Link row (collapsed header context) */}
      {item.link && (
        <div className="-mt-1 px-4 pb-3">
          <ItemLink link={item.link} />
        </div>
      )}

      {/* Payment summary chips (collapsed header context) */}
      {hasPaymentDetails && (
        <div className="-mt-1 px-4 pb-3">
          <PaymentChips item={item} />
        </div>
      )}

      {/* Expanded body: details + timeline */}
      {expanded && (
        <div className="border-t border-border px-4 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Assigned:{" "}
              <span className="font-medium text-foreground">
                {item.assignee ? item.assignee.full_name : "Unassigned"}
              </span>
            </span>
            {item.link && <ItemLink link={item.link} />}
          </div>

          {hasPaymentDetails && <PaymentDetails item={item} />}

          <Timeline item={item} />
        </div>
      )}

      {modalOpen && (
        <UpdateStatusModal
          item={item}
          members={members}
          busy={busy}
          disabled={disabled}
          onClose={() => setModalOpen(false)}
          onSubmit={async (status, opts) => {
            await onStatusUpdate(item.id, status, opts);
            setModalOpen(false);
          }}
        />
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Item link chip (truncated, opens in a new tab)
 * ------------------------------------------------------------------ */

function ItemLink({ link }: { link: string }) {
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title={link}
      className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      <ExternalLink className="h-3 w-3 shrink-0" />
      <span className="truncate">{link}</span>
    </a>
  );
}

/* ------------------------------------------------------------------ *
 * Update Status modal
 * ------------------------------------------------------------------ */

function UpdateStatusModal({
  item,
  members,
  busy,
  disabled,
  onClose,
  onSubmit,
}: {
  item: ChecklistItem;
  members: UserRef[];
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onSubmit: (
    status: ChecklistStatus,
    opts: StatusUpdateOpts,
  ) => Promise<void>;
}) {
  const isPayment = item.item_key === "payment";

  const [status, setStatus] = useState<ChecklistStatus>(item.status);
  const [link, setLink] = useState(item.link ?? "");
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState(item.assignee?.id ?? "");
  const statusRef = useRef<HTMLSelectElement>(null);

  // Payment-only fields.
  const [paymentType, setPaymentType] = useState(item.payment_type ?? "regular");
  const [amount, setAmount] = useState(
    item.amount != null ? String(item.amount) : "",
  );
  const [currency, setCurrency] = useState(item.currency ?? "USD");
  const [transactionId, setTransactionId] = useState(item.transaction_id ?? "");
  const [paymentMode, setPaymentMode] = useState(item.payment_mode ?? "");

  const [currencies, setCurrencies] = useState<CurrencyRef[]>([]);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  // Load currencies for the payment item only.
  useEffect(() => {
    if (!isPayment) return;
    let active = true;
    void (async () => {
      try {
        const list = await getCurrencies();
        if (active) setCurrencies(list);
      } catch (err) {
        if (active) {
          setCurrencyError(
            err instanceof ApiError ? err.message : "Unable to load currencies.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [isPayment]);

  // Close on Escape, and autofocus the status select on open.
  useEffect(() => {
    statusRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const linkLabel = LINK_LABELS[item.item_key] ?? "Link";
  const fieldCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

  // No assignee picker once an item is done.
  const showAssignee = status !== "done";

  async function handleSubmit() {
    const trimmedAmount = amount.trim();
    const parsedAmount = trimmedAmount === "" ? undefined : Number(trimmedAmount);
    try {
      await onSubmit(status, {
        note: note.trim() || undefined,
        link,
        // When the assignee field is hidden (status done), don't change it.
        assigneeId: showAssignee ? assigneeId || null : undefined,
        ...(isPayment
          ? {
              paymentType,
              amount:
                parsedAmount !== undefined && Number.isFinite(parsedAmount)
                  ? parsedAmount
                  : undefined,
              currency,
              transactionId: transactionId.trim() || undefined,
              paymentMode: paymentMode.trim() || undefined,
            }
          : {}),
      });
    } catch {
      // Error is surfaced by the parent; keep the modal open with the draft.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1A1F4D]/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Update ${item.title}`}
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <h2 className="truncate text-base font-semibold text-[#1A1F4D]">
            Update — {item.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <label
              htmlFor="checklist-status"
              className="block text-xs font-medium text-muted-foreground"
            >
              Status
            </label>
            <select
              id="checklist-status"
              ref={statusRef}
              value={status}
              disabled={disabled}
              onChange={(e) => setStatus(e.target.value as ChecklistStatus)}
              className={fieldCls}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="checklist-link"
              className="block text-xs font-medium text-muted-foreground"
            >
              {linkLabel}
            </label>
            <input
              id="checklist-link"
              type="url"
              value={link}
              disabled={disabled}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              className={fieldCls}
            />
          </div>

          {isPayment && (
            <>
              <div className="space-y-1.5">
                <label
                  htmlFor="checklist-payment-type"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Payment type
                </label>
                <select
                  id="checklist-payment-type"
                  value={paymentType}
                  disabled={disabled}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className={fieldCls}
                >
                  {PAYMENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label
                    htmlFor="checklist-amount"
                    className="block text-xs font-medium text-muted-foreground"
                  >
                    Amount
                  </label>
                  <input
                    id="checklist-amount"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={amount}
                    disabled={disabled}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="checklist-currency"
                    className="block text-xs font-medium text-muted-foreground"
                  >
                    Currency
                  </label>
                  <select
                    id="checklist-currency"
                    value={currency}
                    disabled={disabled}
                    onChange={(e) => setCurrency(e.target.value)}
                    className={fieldCls}
                  >
                    {currencies.length === 0 ? (
                      <option value={currency}>{currency}</option>
                    ) : (
                      currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
              {currencyError && (
                <p className="text-xs text-destructive">{currencyError}</p>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="checklist-transaction-id"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Transaction ID
                </label>
                <input
                  id="checklist-transaction-id"
                  type="text"
                  value={transactionId}
                  disabled={disabled}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g. TXN-12345"
                  className={fieldCls}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="checklist-payment-mode"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Payment mode
                </label>
                <input
                  id="checklist-payment-mode"
                  type="text"
                  value={paymentMode}
                  disabled={disabled}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  placeholder="e.g. Bank Transfer, PayPal, Wise, UPI"
                  className={fieldCls}
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="checklist-note"
              className="block text-xs font-medium text-muted-foreground"
            >
              Note / comment (optional)
            </label>
            <textarea
              id="checklist-note"
              value={note}
              disabled={disabled}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add a note for the timeline…"
              className={fieldCls}
            />
          </div>

          {showAssignee && (
            <div className="space-y-1.5">
              <label
                htmlFor="checklist-assignee"
                className="block text-xs font-medium text-muted-foreground"
              >
                Assign member
              </label>
              <select
                id="checklist-assignee"
                value={assigneeId}
                disabled={disabled}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={fieldCls}
              >
                <option value="">— Unassigned —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-card px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Updating…" : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Status badge
 * ------------------------------------------------------------------ */

const STATUS_BADGE_CLS: Record<ChecklistStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  review: "bg-amber-100 text-amber-700",
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
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
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
 * Payment details (payment item only)
 * ------------------------------------------------------------------ */

/** Title-case a payment type for display (e.g. "advance" -> "Advance"). */
function paymentTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** A small amount + currency string, e.g. "1,200 USD". */
function formatAmount(amount: number, currency: string | null): string {
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(amount);
  return currency ? `${formatted} ${currency}` : formatted;
}

/** Badge for a payment type (regular renders nothing). */
function PaymentTypeBadge({ type }: { type: string }) {
  const cls = PAYMENT_TYPE_BADGE_CLS[type];
  if (!cls) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        cls,
      )}
    >
      {paymentTypeLabel(type)}
    </span>
  );
}

/** Compact collapsed-header chips summarising a payment. */
function PaymentChips({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {item.amount != null && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
          <CreditCard className="h-3 w-3" />
          {formatAmount(item.amount, item.currency)}
        </span>
      )}
      {item.payment_type && <PaymentTypeBadge type={item.payment_type} />}
      {item.transaction_id && (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true">·</span>
          <span className="font-medium text-foreground">
            {item.transaction_id}
          </span>
        </span>
      )}
      {item.payment_mode && (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true">·</span>
          {item.payment_mode}
        </span>
      )}
    </div>
  );
}

/** Expanded-body breakdown of a payment's recorded fields. */
function PaymentDetails({ item }: { item: ChecklistItem }) {
  return (
    <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm sm:grid-cols-4">
      {item.amount != null && (
        <div>
          <dt className="text-xs text-muted-foreground">Amount</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {formatAmount(item.amount, item.currency)}
          </dd>
        </div>
      )}
      {item.payment_type && (
        <div>
          <dt className="text-xs text-muted-foreground">Type</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-foreground">
            {PAYMENT_TYPE_BADGE_CLS[item.payment_type] ? (
              <PaymentTypeBadge type={item.payment_type} />
            ) : (
              paymentTypeLabel(item.payment_type)
            )}
          </dd>
        </div>
      )}
      {item.transaction_id && (
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Transaction ID</dt>
          <dd className="mt-0.5 truncate font-medium text-foreground">
            {item.transaction_id}
          </dd>
        </div>
      )}
      {item.payment_mode && (
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Mode</dt>
          <dd className="mt-0.5 truncate font-medium text-foreground">
            {item.payment_mode}
          </dd>
        </div>
      )}
    </dl>
  );
}

export default WorkflowChecklist;
