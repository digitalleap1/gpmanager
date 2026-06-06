"use client";

import { useEffect, useState } from "react";

import { paymentStatusLabel } from "@/components/payment-status-badge";
import type {
  PaymentCreate,
  PaymentStatus,
  ProjectListItem,
  WebsiteListItem,
} from "@/lib/types";
import { listProjects } from "@/services/project-service";
import { listWebsites } from "@/services/website-service";

const STATUS_OPTIONS: PaymentStatus[] = [
  "pending",
  "approved",
  "paid",
  "failed",
];

interface PaymentFormProps {
  initial?: Partial<PaymentCreate>;
  onSubmit: (values: PaymentCreate) => void | Promise<void>;
  submitting: boolean;
  submitLabel: string;
  error?: string | null;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelClass = "text-sm font-medium";

/** Parse a numeric input's string value to a number or null when blank. */
function toNumberOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

/** Shared create/edit form for a payment. Loads project + website pickers. */
export function PaymentForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
  error,
}: PaymentFormProps) {
  const [projectId, setProjectId] = useState(initial?.project_id ?? "");
  const [websiteId, setWebsiteId] = useState(initial?.website_id ?? "");
  const [liveLink, setLiveLink] = useState(initial?.live_link ?? "");
  const [amountUsd, setAmountUsd] = useState(
    initial?.amount_usd != null ? String(initial.amount_usd) : "",
  );
  const [amountInr, setAmountInr] = useState(
    initial?.amount_inr != null ? String(initial.amount_inr) : "",
  );
  const [invoiceLink, setInvoiceLink] = useState(initial?.invoice_link ?? "");
  const [paymentDate, setPaymentDate] = useState(initial?.payment_date ?? "");
  const [transactionId, setTransactionId] = useState(
    initial?.transaction_id ?? "",
  );
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const [status, setStatus] = useState(initial?.status ?? "pending");

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [websites, setWebsites] = useState<WebsiteListItem[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      // Resolve projects + websites independently so one failing pick does not
      // blank the other.
      const [projectsRes, websitesRes] = await Promise.allSettled([
        listProjects({ page: 1, page_size: 200, sort: "name" }),
        listWebsites({ page: 1, page_size: 200, sort: "domain" }),
      ]);
      if (!active) return;
      if (projectsRes.status === "fulfilled") {
        setProjects(projectsRes.value.items);
      }
      if (websitesRes.status === "fulfilled") {
        setWebsites(websitesRes.value.items);
      }
      if (
        projectsRes.status === "rejected" ||
        websitesRes.status === "rejected"
      ) {
        setLookupError(
          "Some pickers could not load. You can still fill the other fields.",
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values: PaymentCreate = {
      project_id: projectId || null,
      website_id: websiteId || null,
      live_link: liveLink.trim() || null,
      amount_usd: toNumberOrNull(amountUsd),
      amount_inr: toNumberOrNull(amountInr),
      invoice_link: invoiceLink.trim() || null,
      payment_date: paymentDate || null,
      transaction_id: transactionId.trim() || null,
      remarks: remarks.trim() || null,
      status,
    };
    void onSubmit(values);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-lg border border-border bg-card p-6 text-card-foreground"
    >
      {lookupError && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {lookupError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="project" className={labelClass}>
            Project
          </label>
          <select
            id="project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="website" className={labelClass}>
            Website
          </label>
          <select
            id="website"
            value={websiteId}
            onChange={(e) => setWebsiteId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.domain}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="amount_usd" className={labelClass}>
            Amount (USD)
          </label>
          <input
            id="amount_usd"
            type="number"
            min={0}
            step="0.01"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="amount_inr" className={labelClass}>
            Amount (INR)
          </label>
          <input
            id="amount_inr"
            type="number"
            min={0}
            step="0.01"
            value={amountInr}
            onChange={(e) => setAmountInr(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="payment_date" className={labelClass}>
            Payment date
          </label>
          <input
            id="payment_date"
            type="date"
            value={paymentDate ?? ""}
            onChange={(e) => setPaymentDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="transaction_id" className={labelClass}>
            Transaction ID
          </label>
          <input
            id="transaction_id"
            type="text"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {paymentStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="live_link" className={labelClass}>
          Live link
        </label>
        <input
          id="live_link"
          type="url"
          value={liveLink}
          onChange={(e) => setLiveLink(e.target.value)}
          placeholder="https://example.com/article"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="invoice_link" className={labelClass}>
          Invoice link
        </label>
        <input
          id="invoice_link"
          type="url"
          value={invoiceLink}
          onChange={(e) => setInvoiceLink(e.target.value)}
          placeholder="https://example.com/invoice.pdf"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="remarks" className={labelClass}>
          Remarks
        </label>
        <textarea
          id="remarks"
          rows={3}
          value={remarks ?? ""}
          onChange={(e) => setRemarks(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export default PaymentForm;
