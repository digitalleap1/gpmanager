"use client";

import { useEffect, useState } from "react";

import { paymentStatusLabel } from "@/components/payment-status-badge";
import type {
  ClientListItem,
  CurrencyRef,
  PaymentCreate,
  PaymentStatus,
  ProjectListItem,
  UserAdminRead,
  WebsiteListItem,
} from "@/lib/types";
import { listClients } from "@/services/client-service";
import { getCurrencies } from "@/services/lookup-service";
import { listProjects } from "@/services/project-service";
import { listUsers } from "@/services/user-service";
import { listWebsites } from "@/services/website-service";

const STATUS_OPTIONS: PaymentStatus[] = [
  "pending",
  "negotiation",
  "paid",
  "free",
  "cancelled",
  "rejected",
];

const VIA_OPTIONS = ["tool", "manual"] as const;

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
  const [clientId, setClientId] = useState(initial?.client_id ?? "");
  const [websiteId, setWebsiteId] = useState(initial?.website_id ?? "");
  const [liveLink, setLiveLink] = useState(initial?.live_link ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [amount, setAmount] = useState(
    initial?.amount != null ? String(initial.amount) : "",
  );
  const [fxToUsd, setFxToUsd] = useState(
    initial?.fx_to_usd != null ? String(initial.fx_to_usd) : "",
  );
  const [amountInr, setAmountInr] = useState(
    initial?.amount_inr != null ? String(initial.amount_inr) : "",
  );
  const [modeOfPayment, setModeOfPayment] = useState(
    initial?.mode_of_payment ?? "",
  );
  const [notified, setNotified] = useState(initial?.notified ?? false);
  const [invoiceLink, setInvoiceLink] = useState(initial?.invoice_link ?? "");
  const [paymentDate, setPaymentDate] = useState(initial?.payment_date ?? "");
  const [transactionId, setTransactionId] = useState(
    initial?.transaction_id ?? "",
  );
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const [status, setStatus] = useState(initial?.status ?? "pending");
  const [attributedToId, setAttributedToId] = useState(
    initial?.attributed_to_id ?? "",
  );
  const [via, setVia] = useState(initial?.via ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(
    initial?.invoice_number ?? "",
  );

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [members, setMembers] = useState<UserAdminRead[]>([]);
  const [websites, setWebsites] = useState<WebsiteListItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRef[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      // Resolve every picker independently so one failing pick does not blank
      // the others.
      const [projectsRes, websitesRes, currenciesRes, clientsRes, membersRes] =
        await Promise.allSettled([
          listProjects({ page: 1, page_size: 200, sort: "name" }),
          listWebsites({ page: 1, page_size: 200, sort: "domain" }),
          getCurrencies(),
          listClients(),
          listUsers(),
        ]);
      if (!active) return;
      if (projectsRes.status === "fulfilled") {
        setProjects(projectsRes.value.items);
      }
      if (websitesRes.status === "fulfilled") {
        setWebsites(websitesRes.value.items);
      }
      if (currenciesRes.status === "fulfilled") {
        setCurrencies(currenciesRes.value);
      }
      if (clientsRes.status === "fulfilled") {
        setClients(clientsRes.value);
      }
      if (membersRes.status === "fulfilled") {
        setMembers(membersRes.value);
      }
      if (
        projectsRes.status === "rejected" ||
        websitesRes.status === "rejected" ||
        currenciesRes.status === "rejected" ||
        clientsRes.status === "rejected" ||
        membersRes.status === "rejected"
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

  const isUsd = currency === "USD";
  const amountNum = Number(amount);
  const fxNum = Number(fxToUsd);
  const previewUsd =
    !isUsd && amount.trim() !== "" && fxToUsd.trim() !== "" &&
    Number.isFinite(amountNum) && Number.isFinite(fxNum)
      ? amountNum * fxNum
      : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values: PaymentCreate = {
      project_id: projectId || null,
      client_id: clientId || null,
      website_id: websiteId || null,
      live_link: liveLink.trim() || null,
      currency,
      amount: toNumberOrNull(amount),
      // The server derives amount_usd from amount * fx_to_usd (USD ⇒ rate 1),
      // so only send a rate when the currency is not USD.
      fx_to_usd: isUsd ? null : toNumberOrNull(fxToUsd),
      amount_inr: toNumberOrNull(amountInr),
      mode_of_payment: modeOfPayment.trim() || null,
      notified,
      invoice_link: invoiceLink.trim() || null,
      payment_date: paymentDate || null,
      transaction_id: transactionId.trim() || null,
      remarks: remarks.trim() || null,
      status,
      attributed_to_id: attributedToId || null,
      via: via || null,
      invoice_number: invoiceNumber.trim() || null,
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
          <label htmlFor="client" className={labelClass}>
            Client
          </label>
          <select
            id="client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
          <label htmlFor="currency" className={labelClass}>
            Currency
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClass}
          >
            {currencies.length === 0 && (
              <option value={currency}>{currency}</option>
            )}
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name} ({c.symbol})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="amount" className={labelClass}>
            Amount ({currency})
          </label>
          <input
            id="amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        </div>

        {!isUsd && (
          <div className="space-y-1.5">
            <label htmlFor="fx_to_usd" className={labelClass}>
              Rate to USD (1 {currency} = ? USD)
            </label>
            <input
              id="fx_to_usd"
              type="number"
              min={0}
              step="0.0001"
              value={fxToUsd}
              onChange={(e) => setFxToUsd(e.target.value)}
              className={inputClass}
            />
            {previewUsd != null && (
              <p className="text-xs text-muted-foreground">
                ≈ ${previewUsd.toFixed(2)} USD
              </p>
            )}
          </div>
        )}

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
          <label htmlFor="mode_of_payment" className={labelClass}>
            Mode of payment
          </label>
          <input
            id="mode_of_payment"
            type="text"
            value={modeOfPayment}
            onChange={(e) => setModeOfPayment(e.target.value)}
            placeholder="PayPal / Payoneer / Stripe / Client-direct / Free"
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

        <div className="space-y-1.5">
          <label htmlFor="attributed_to" className={labelClass}>
            Attributed to
          </label>
          <select
            id="attributed_to"
            value={attributedToId}
            onChange={(e) => setAttributedToId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="via" className={labelClass}>
            Via
          </label>
          <select
            id="via"
            value={via}
            onChange={(e) => setVia(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {VIA_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="invoice_number" className={labelClass}>
            Invoice number
          </label>
          <input
            id="invoice_number"
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="INV-0001"
            className={inputClass}
          />
        </div>

        <div className="flex items-center gap-2 sm:pt-7">
          <input
            id="notified"
            type="checkbox"
            checked={notified}
            onChange={(e) => setNotified(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
          />
          <label htmlFor="notified" className={labelClass}>
            Notified
          </label>
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
