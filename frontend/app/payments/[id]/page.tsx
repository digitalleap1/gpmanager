"use client";

import {
  Check,
  ExternalLink,
  MessageSquarePlus,
  Pencil,
  Send,
  X,
} from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  PaymentCaseBadge,
  RequestStageBadge,
} from "@/components/payment-stage-badge";
import {
  PaymentStatusBadge,
  paymentStatusLabel,
} from "@/components/payment-status-badge";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type {
  PaymentComment,
  PaymentDetail,
  PaymentStatus,
  PaymentStatusHistoryEntry,
} from "@/lib/types";
import { formatCurrency, formatDate, relativeTime } from "@/lib/utils";
import {
  addPaymentComment,
  getPayment,
  setStatus,
  submitPayment,
  verifyPayment,
} from "@/services/payment-service";

/** Build up-to-two-letter initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_OPTIONS: PaymentStatus[] = [
  "pending",
  "negotiation",
  "paid",
  "free",
  "cancelled",
  "rejected",
];

/** Format an INR amount with a "₹" prefix, or null when absent. */
function formatInr(amount: number | null): string | null {
  if (amount == null) return null;
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

/** Format a native amount with its 3-letter currency code, or null when absent. */
function formatNativeAmount(
  amount: number | null,
  currency: string,
): string | null {
  if (amount == null) return null;
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

export default function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();

  const isManager =
    !!user &&
    (user.is_superuser ||
      user.roles.includes("admin") ||
      user.roles.includes("team_lead"));
  const isAdmin =
    !!user && (user.is_superuser || user.roles.includes("admin"));
  const meId = user?.id ?? null;

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lets "Request clarification" jump focus straight to the comment box.
  const commentBoxRef = useRef<HTMLTextAreaElement | null>(null);

  const focusCommentBox = useCallback(() => {
    const el = commentBoxRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPayment(id);
      setPayment(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load the payment. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const title =
    payment?.project_name ?? payment?.website_domain ?? "Payment";

  return (
    <AppShell title={title}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : payment ? (
        <div className="space-y-6">
          {/* Header actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/payments"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to list
            </Link>
            <Link
              href={`/payments/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </div>

          {/* Manager request-workflow actions */}
          {isManager && (
            <ManagerActions
              paymentId={id}
              currentStatus={payment.status}
              reload={load}
              onRequestClarification={focusCommentBox}
            />
          )}

          {/* Overview */}
          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{title}</h2>
              <PaymentStatusBadge status={payment.status} />
              <PaymentCaseBadge value={payment.payment_case} />
              <RequestStageBadge value={payment.request_stage} />
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Project"
                value={
                  payment.project_id ? (
                    <Link
                      href={`/projects/${payment.project_id}`}
                      className="text-primary hover:underline"
                    >
                      {payment.project_name ?? "View project"}
                    </Link>
                  ) : null
                }
              />
              <Field
                label="Client"
                value={
                  payment.client_id ? (
                    <Link
                      href={`/clients/${payment.client_id}`}
                      className="text-primary hover:underline"
                    >
                      {payment.client_name ?? "View client"}
                    </Link>
                  ) : (
                    payment.client_name
                  )
                }
              />
              <Field
                label="Website"
                value={
                  payment.website_id ? (
                    <Link
                      href={`/websites/${payment.website_id}`}
                      className="text-primary hover:underline"
                    >
                      {payment.website_domain ?? "View website"}
                    </Link>
                  ) : (
                    payment.website_domain
                  )
                }
              />
              <Field label="Currency" value={payment.currency} />
              <Field
                label="Amount"
                value={formatNativeAmount(payment.amount, payment.currency)}
              />
              <Field
                label="Rate to USD"
                value={
                  payment.currency !== "USD" && payment.fx_to_usd != null
                    ? `1 ${payment.currency} = ${payment.fx_to_usd} USD`
                    : payment.currency === "USD"
                      ? "1.0000"
                      : null
                }
              />
              <Field
                label="Amount (USD)"
                value={
                  payment.amount_usd != null
                    ? formatCurrency(payment.amount_usd)
                    : null
                }
              />
              <Field label="Amount (INR)" value={formatInr(payment.amount_inr)} />
              <Field
                label="Mode of payment"
                value={payment.mode_of_payment}
              />
              <Field label="Notified" value={payment.notified ? "Yes" : "No"} />
              <Field
                label="Payment date"
                value={formatDate(payment.payment_date)}
              />
              <Field label="Transaction ID" value={payment.transaction_id} />
              <Field
                label="Payer"
                value={payment.attributed_to?.full_name ?? null}
              />
              <Field
                label="Requested by"
                value={payment.requested_by?.full_name ?? null}
              />
              <Field
                label="CC watchers"
                value={
                  payment.watchers.length > 0
                    ? payment.watchers.map((w) => w.full_name).join(", ")
                    : null
                }
              />
              <Field
                label="Via"
                value={
                  payment.via
                    ? payment.via.charAt(0).toUpperCase() + payment.via.slice(1)
                    : null
                }
              />
              <Field label="Invoice number" value={payment.invoice_number} />
              <Field
                label="Live link"
                value={
                  payment.live_link ? (
                    <a
                      href={payment.live_link}
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
              <Field
                label="Invoice"
                value={
                  payment.invoice_link ? (
                    <a
                      href={payment.invoice_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open invoice
                    </a>
                  ) : null
                }
              />
              <Field label="Created" value={formatDate(payment.created_at)} />
              <Field label="Updated" value={formatDate(payment.updated_at)} />
            </dl>

            {payment.remarks && (
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Remarks
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {payment.remarks}
                </p>
              </div>
            )}
          </section>

          {/* Assignment workflow: payer submits, requester verifies. */}
          {(() => {
            const isPayer =
              meId != null && payment.attributed_to?.id === meId;
            const isRequester =
              meId != null && payment.requested_by?.id === meId;
            const canSubmit =
              (isPayer || isManager) &&
              (payment.request_stage === "assigned" ||
                payment.request_stage === "returned");
            const canVerify =
              (isRequester || isAdmin) &&
              payment.request_stage === "submitted";
            return (
              <>
                {canSubmit && (
                  <SubmitPanel
                    paymentId={id}
                    defaultAmount={payment.amount}
                    defaultCurrency={payment.currency}
                    defaultMode={payment.mode_of_payment}
                    defaultTransactionId={payment.transaction_id}
                    reload={load}
                  />
                )}
                {canVerify && (
                  <VerifyPanel
                    paymentId={id}
                    paymentCase={payment.payment_case}
                    reload={load}
                  />
                )}
              </>
            );
          })()}

          {/* Request & clarification thread */}
          <RequestThread
            paymentId={id}
            comments={payment.comments}
            reload={load}
            textareaRef={commentBoxRef}
          />

          {/* Workflow control */}
          <StatusWorkflow
            paymentId={id}
            currentStatus={payment.status}
            reload={load}
          />

          {/* Status history timeline */}
          <StatusHistory entries={payment.status_history} />
        </div>
      ) : null}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

function Field({ label, value }: { label: string; value: React.ReactNode }) {
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

/* ------------------------------------------------------------------ */

/**
 * Prominent request-workflow controls for managers: one-click Approve (→ paid)
 * and Reject (→ rejected), plus a "Request clarification" affordance that jumps
 * focus to the comment box so the manager can ask the requester for details
 * (which notifies them on the backend).
 */
function ManagerActions({
  paymentId,
  currentStatus,
  reload,
  onRequestClarification,
}: {
  paymentId: string;
  currentStatus: string;
  reload: () => Promise<void>;
  onRequestClarification: () => void;
}) {
  // Which action is in flight, so only the clicked button shows "…".
  const [busy, setBusy] = useState<"paid" | "rejected" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const alreadyPaid = currentStatus === "paid";
  const alreadyRejected = currentStatus === "rejected";

  async function apply(status: "paid" | "rejected") {
    setErr(null);
    setBusy(status);
    try {
      await setStatus(paymentId, status, null);
      await reload();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 403
          ? "Only managers can change a payment's status."
          : e instanceof ApiError
            ? e.message
            : "Unable to update the status.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-sm font-semibold text-[#1A1F4D]">Review request</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Approve to mark this payment <span className="font-medium">Paid</span>{" "}
        (adds the amount to the project budget), reject it, or ask the requester
        for more detail.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => apply("paid")}
          disabled={busy !== null || alreadyPaid}
          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {busy === "paid"
            ? "Approving…"
            : alreadyPaid
              ? "Approved"
              : "Approve"}
        </button>

        <button
          type="button"
          onClick={() => apply("rejected")}
          disabled={busy !== null || alreadyRejected}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          {busy === "rejected"
            ? "Rejecting…"
            : alreadyRejected
              ? "Rejected"
              : "Reject"}
        </button>

        <button
          type="button"
          onClick={onRequestClarification}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Request clarification
        </button>
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
 * Submit panel — shown to the assigned payer (or a manager) while the request
 * is `assigned` or `returned`. Records the transaction details and moves the
 * payment to `submitted`, returning it to the requester to verify.
 */
function SubmitPanel({
  paymentId,
  defaultAmount,
  defaultCurrency,
  defaultMode,
  defaultTransactionId,
  reload,
}: {
  paymentId: string;
  defaultAmount: number | null;
  defaultCurrency: string;
  defaultMode: string | null;
  defaultTransactionId: string | null;
  reload: () => Promise<void>;
}) {
  const [transactionId, setTransactionId] = useState(
    defaultTransactionId ?? "",
  );
  const [mode, setMode] = useState(defaultMode ?? "");
  const [amount, setAmount] = useState(
    defaultAmount != null ? String(defaultAmount) : "",
  );
  const [currency, setCurrency] = useState(defaultCurrency);
  const [paymentDate, setPaymentDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit() {
    setErr(null);
    setBusy(true);
    const amountNum = amount.trim() === "" ? undefined : Number(amount);
    try {
      await submitPayment(paymentId, {
        transaction_id: transactionId.trim() || undefined,
        mode_of_payment: mode.trim() || undefined,
        amount:
          amountNum != null && Number.isFinite(amountNum)
            ? amountNum
            : undefined,
        currency: currency.trim() || undefined,
        payment_date: paymentDate || null,
        note: note.trim() || undefined,
      });
      await reload();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 403
          ? "You can't submit this payment."
          : e instanceof ApiError
            ? e.message
            : "Unable to submit the payment.",
      );
    } finally {
      setBusy(false);
    }
  }

  const fieldCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-sm font-semibold text-[#1A1F4D]">Submit payment</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Record the transaction details. This returns the payment to the
        requester to verify.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="sub_txn" className="text-sm font-medium">
            Transaction ID
          </label>
          <input
            id="sub_txn"
            type="text"
            value={transactionId}
            disabled={busy}
            onChange={(e) => setTransactionId(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sub_mode" className="text-sm font-medium">
            Mode of payment
          </label>
          <input
            id="sub_mode"
            type="text"
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value)}
            placeholder="PayPal / Payoneer / Stripe…"
            className={fieldCls}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sub_amount" className="text-sm font-medium">
            Amount
          </label>
          <input
            id="sub_amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            disabled={busy}
            onChange={(e) => setAmount(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sub_currency" className="text-sm font-medium">
            Currency
          </label>
          <input
            id="sub_currency"
            type="text"
            value={currency}
            disabled={busy}
            onChange={(e) => setCurrency(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sub_date" className="text-sm font-medium">
            Payment date
          </label>
          <input
            id="sub_date"
            type="date"
            value={paymentDate}
            disabled={busy}
            onChange={(e) => setPaymentDate(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="sub_note" className="text-sm font-medium">
            Note (optional)
          </label>
          <textarea
            id="sub_note"
            rows={2}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for the requester…"
            className={fieldCls}
          />
        </div>
      </div>

      {err && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {err}
        </p>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {busy ? "Submitting…" : "Submit payment"}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Verify panel — shown to the requester (or an admin) while the request is
 * `submitted`. Approve finalises the payment (→ paid, or cancelled for a
 * reversal); Send back returns it to the payer (→ returned) with a note.
 */
function VerifyPanel({
  paymentId,
  paymentCase,
  reload,
}: {
  paymentId: string;
  paymentCase: string;
  reload: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function apply(approve: boolean) {
    setErr(null);
    setBusy(approve ? "approve" : "reject");
    try {
      await verifyPayment(paymentId, {
        approve,
        note: note.trim() || undefined,
      });
      setNote("");
      await reload();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 403
          ? "You can't verify this payment."
          : e instanceof ApiError
            ? e.message
            : "Unable to verify the payment.",
      );
    } finally {
      setBusy(null);
    }
  }

  const approveOutcome =
    paymentCase === "reversal" ? "Cancelled" : "Paid";

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-sm font-semibold text-[#1A1F4D]">Verify payment</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Approve to mark this payment{" "}
        <span className="font-medium">{approveOutcome}</span>, or send it back to
        the payer for changes.
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="ver_note" className="text-sm font-medium">
            Note (optional, recommended when sending back)
          </label>
          <textarea
            id="ver_note"
            rows={2}
            value={note}
            disabled={busy !== null}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What needs to change…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void apply(true)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => void apply(false)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            {busy === "reject" ? "Sending back…" : "Send back"}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Request & clarification thread: a quick-add box plus the comment list. Posting
 * a comment notifies the other party server-side (a requester's note reaches
 * the admins; an admin's comment reaches the requester). Newest comment sits at
 * the bottom so the thread reads top-to-bottom like a conversation.
 */
function RequestThread({
  paymentId,
  comments,
  reload,
  textareaRef,
}: {
  paymentId: string;
  comments: PaymentComment[];
  reload: () => Promise<void>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = body.trim();
    if (trimmed === "") return;
    setErr(null);
    setPosting(true);
    try {
      await addPaymentComment(paymentId, trimmed);
      setBody("");
      // Refresh the detail so the thread + any notifications stay in sync.
      await reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Unable to add comment.");
    } finally {
      setPosting(false);
    }
  }

  const ordered = [...comments].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-sm font-semibold text-[#1A1F4D]">
        Request &amp; clarification
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Ask questions or add context. Each comment notifies the other party.
      </p>

      {/* Thread list */}
      {ordered.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {ordered.map((c) => {
            const name = c.author?.full_name ?? "Unknown";
            return (
              <li key={c.id} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials(name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-medium">{name}</p>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(c.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Quick-add */}
      <div className="mt-5 space-y-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a comment or ask for clarification…"
          disabled={posting}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAdd}
            disabled={posting || body.trim() === ""}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {posting ? "Posting…" : "Add comment"}
          </button>
        </div>
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

/**
 * Status workflow control: choose any of the 4 statuses + an optional note and
 * record the change (managers only). Moving to `paid` adds the amount to the
 * project's monthly budget on the backend.
 */
function StatusWorkflow({
  paymentId,
  currentStatus,
  reload,
}: {
  paymentId: string;
  currentStatus: string;
  reload: () => Promise<void>;
}) {
  const [nextStatus, setNextStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep the dropdown in sync when the payment reloads with a new status.
  useEffect(() => {
    setNextStatus(currentStatus);
  }, [currentStatus]);

  async function handleApply() {
    setErr(null);
    setBusy(true);
    try {
      await setStatus(paymentId, nextStatus, note.trim() || null);
      setNote("");
      // Reload to refresh the overview + status-history timeline.
      await reload();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 403
          ? "Only managers can change a payment's status."
          : e instanceof ApiError
            ? e.message
            : "Unable to update the status.",
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
          {paymentStatusLabel(currentStatus)}
        </span>
        . Moving to <span className="font-medium">Paid</span> adds the amount to
        the project&apos;s monthly budget.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:max-w-md">
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
                {paymentStatusLabel(s)}
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
          className="justify-self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Apply status"}
        </button>
      </div>
    </section>
  );
}

/** Newest-first timeline of status changes with actor + relative time. */
function StatusHistory({
  entries,
}: {
  entries: PaymentStatusHistoryEntry[];
}) {
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
                      <PaymentStatusBadge status={entry.from_status} />
                      <span className="text-xs text-muted-foreground">→</span>
                    </>
                  )}
                  <PaymentStatusBadge status={entry.to_status} />
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
