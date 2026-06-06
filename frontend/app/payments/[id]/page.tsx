"use client";

import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  PaymentStatusBadge,
  paymentStatusLabel,
} from "@/components/payment-status-badge";
import { ApiError } from "@/lib/api";
import type {
  PaymentDetail,
  PaymentStatus,
  PaymentStatusHistoryEntry,
} from "@/lib/types";
import { formatCurrency, formatDate, relativeTime } from "@/lib/utils";
import { getPayment, setStatus } from "@/services/payment-service";

const STATUS_OPTIONS: PaymentStatus[] = [
  "pending",
  "approved",
  "paid",
  "failed",
];

/** Format an INR amount with a "₹" prefix, or null when absent. */
function formatInr(amount: number | null): string | null {
  if (amount == null) return null;
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export default function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

          {/* Overview */}
          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">{title}</h2>
              <PaymentStatusBadge status={payment.status} />
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
                label="Payment date"
                value={formatDate(payment.payment_date)}
              />
              <Field label="Transaction ID" value={payment.transaction_id} />
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
