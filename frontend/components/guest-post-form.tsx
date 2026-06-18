"use client";

import { useEffect, useState } from "react";

import { guestPostStatusLabel } from "@/components/guest-post-status-badge";
import { paymentStatusLabel } from "@/components/payment-status-badge";
import { WatcherMultiSelect } from "@/components/watcher-multi-select";
import {
  PAYMENT_CASES,
  paymentCaseLabel,
  type CurrencyRef,
  type GuestPostCreate,
  type GuestPostStatus,
  type PaymentStatus,
  type ProjectListItem,
  type UserAdminRead,
  type UserSummary,
} from "@/lib/types";
import { getUsers, getCurrencies } from "@/services/lookup-service";
import { listProjects } from "@/services/project-service";
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

const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = [
  "pending",
  "negotiation",
  "paid",
  "free",
  "cancelled",
  "rejected",
];

/**
 * The optional inline payment collected alongside a guest-post link. Passed as
 * the second argument to `onSubmit` ONLY when the "Also create a payment"
 * checkbox is on — the page then creates a payment linked to the saved link.
 */
export interface GuestPostPaymentInput {
  amount?: number;
  currency: string;
  mode_of_payment?: string;
  transaction_id?: string;
  status: string;
  attributed_to_id?: string | null;
  payment_date?: string | null;
  /** The kind of payment (Standard / Advance / Reversal / Other). */
  payment_case: string;
  /** CC watchers (user ids) — notified only. May be empty. */
  watcher_ids: string[];
}

interface GuestPostFormProps {
  initial?: Partial<GuestPostCreate>;
  onSubmit: (
    values: GuestPostCreate,
    payment?: GuestPostPaymentInput,
  ) => void | Promise<void>;
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

/** Shared create/edit form for a guest post. Loads project + user pickers. */
export function GuestPostForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
  error,
}: GuestPostFormProps) {
  const [projectId, setProjectId] = useState(initial?.project_id ?? "");
  const [websiteName, setWebsiteName] = useState(initial?.website_name ?? "");
  const [da, setDa] = useState(initial?.da != null ? String(initial.da) : "");
  const [pa, setPa] = useState(initial?.pa != null ? String(initial.pa) : "");
  const [dr, setDr] = useState(initial?.dr != null ? String(initial.dr) : "");
  const [traffic, setTraffic] = useState(
    initial?.traffic != null ? String(initial.traffic) : "",
  );
  const [price, setPrice] = useState(
    initial?.price != null ? String(initial.price) : "",
  );
  const [contactEmail, setContactEmail] = useState(
    initial?.contact_email ?? "",
  );
  const [assignedUserId, setAssignedUserId] = useState(
    initial?.assigned_user_id ?? "",
  );
  const [status, setStatus] = useState(initial?.status ?? "prospect");
  const [outreachDate, setOutreachDate] = useState(
    initial?.outreach_date ?? "",
  );
  const [liveLinkDate, setLiveLinkDate] = useState(
    initial?.live_link_date ?? "",
  );
  const [liveLink, setLiveLink] = useState(initial?.live_link ?? "");
  const [anchorText, setAnchorText] = useState(initial?.anchor_text ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // Inline payment section (optional). Off by default; when on it reveals the
  // payment fields and passes a `GuestPostPaymentInput` on submit.
  const [payEnabled, setPayEnabled] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("USD");
  const [payMode, setPayMode] = useState("");
  const [payTransactionId, setPayTransactionId] = useState("");
  const [payStatus, setPayStatus] = useState<string>("pending");
  const [payAttributedToId, setPayAttributedToId] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payCase, setPayCase] = useState<string>("standard");
  const [payWatcherIds, setPayWatcherIds] = useState<string[]>([]);

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRef[]>([]);
  const [payUsers, setPayUsers] = useState<UserAdminRead[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      // `getUsers` already tolerates a 403 → []; resolve every picker
      // independently so one failure does not blank the others. Currencies +
      // payment users power the inline payment section and are non-fatal.
      const [projectsRes, usersRes, currenciesRes, payUsersRes] =
        await Promise.allSettled([
          listProjects({ page: 1, page_size: 200, sort: "name" }),
          getUsers(),
          getCurrencies(),
          listUsers(),
        ]);
      if (!active) return;
      if (projectsRes.status === "fulfilled") {
        setProjects(projectsRes.value.items);
      } else {
        setLookupError("Projects could not load. Some pickers may be empty.");
      }
      if (usersRes.status === "fulfilled") {
        setUsers(usersRes.value);
      }
      if (currenciesRes.status === "fulfilled") {
        setCurrencies(currenciesRes.value);
      }
      if (payUsersRes.status === "fulfilled") {
        setPayUsers(payUsersRes.value);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values: GuestPostCreate = {
      project_id: projectId,
      website_name: websiteName.trim() || null,
      da: toNumberOrNull(da),
      pa: toNumberOrNull(pa),
      dr: toNumberOrNull(dr),
      traffic: toNumberOrNull(traffic),
      price: toNumberOrNull(price),
      contact_email: contactEmail.trim() || null,
      assigned_user_id: assignedUserId || null,
      status,
      outreach_date: outreachDate || null,
      live_link_date: liveLinkDate || null,
      live_link: liveLink.trim() || null,
      anchor_text: anchorText.trim() || null,
      notes: notes.trim() || null,
    };

    if (!payEnabled) {
      // Checkbox off → behave exactly as before (no payment created).
      void onSubmit(values);
      return;
    }

    // Default the amount to the link's price when the field is left blank.
    const amountRaw = payAmount.trim() !== "" ? payAmount : price;
    const amountNum = amountRaw.trim() === "" ? undefined : Number(amountRaw);
    const payment: GuestPostPaymentInput = {
      amount:
        amountNum != null && Number.isFinite(amountNum) ? amountNum : undefined,
      currency: payCurrency,
      mode_of_payment: payMode.trim() || undefined,
      transaction_id: payTransactionId.trim() || undefined,
      status: payStatus,
      attributed_to_id: payAttributedToId || null,
      payment_date: payDate || null,
      payment_case: payCase,
      // Never let the chosen payer also be a CC watcher.
      watcher_ids: payWatcherIds.filter((wid) => wid !== payAttributedToId),
    };
    void onSubmit(values, payment);
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

      <div className="space-y-1.5">
        <label htmlFor="project" className={labelClass}>
          Project <span className="text-destructive">*</span>
        </label>
        <select
          id="project"
          required
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={inputClass}
        >
          <option value="">— Select a project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="website_name" className={labelClass}>
          Website
        </label>
        <input
          id="website_name"
          type="text"
          value={websiteName}
          onChange={(e) => setWebsiteName(e.target.value)}
          placeholder="example.com"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="da" className={labelClass}>
            DA
          </label>
          <input
            id="da"
            type="number"
            min={0}
            value={da}
            onChange={(e) => setDa(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pa" className={labelClass}>
            PA
          </label>
          <input
            id="pa"
            type="number"
            min={0}
            max={100}
            value={pa}
            onChange={(e) => setPa(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="dr" className={labelClass}>
            DR
          </label>
          <input
            id="dr"
            type="number"
            min={0}
            value={dr}
            onChange={(e) => setDr(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="traffic" className={labelClass}>
            Traffic
          </label>
          <input
            id="traffic"
            type="number"
            min={0}
            value={traffic}
            onChange={(e) => setTraffic(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="price" className={labelClass}>
            Price
          </label>
          <input
            id="price"
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact_email" className={labelClass}>
            Contact email
          </label>
          <input
            id="contact_email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="assigned_user" className={labelClass}>
            Assigned user
          </label>
          <select
            id="assigned_user"
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
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
                {guestPostStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="outreach_date" className={labelClass}>
            Outreach date
          </label>
          <input
            id="outreach_date"
            type="date"
            value={outreachDate ?? ""}
            onChange={(e) => setOutreachDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="live_link_date" className={labelClass}>
            Live link date
          </label>
          <input
            id="live_link_date"
            type="date"
            value={liveLinkDate ?? ""}
            onChange={(e) => setLiveLinkDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="anchor_text" className={labelClass}>
            Anchor text
          </label>
          <input
            id="anchor_text"
            type="text"
            value={anchorText}
            onChange={(e) => setAnchorText(e.target.value)}
            className={inputClass}
          />
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
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-background p-5">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={payEnabled}
            onChange={(e) => setPayEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm font-semibold text-[#1A1F4D]">
            Also create a payment for this link
          </span>
        </label>
        <p className="text-xs text-muted-foreground">
          Records a payment against this link + project, attributed to the chosen
          person. It will appear on the Payments page and ledger.
        </p>

        {payEnabled && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="pay_amount" className={labelClass}>
                Amount
              </label>
              <input
                id="pay_amount"
                type="number"
                min={0}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={price || "0.00"}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pay_currency" className={labelClass}>
                Currency
              </label>
              <select
                id="pay_currency"
                value={payCurrency}
                onChange={(e) => setPayCurrency(e.target.value)}
                className={inputClass}
              >
                {currencies.length === 0 && (
                  <option value={payCurrency}>{payCurrency}</option>
                )}
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pay_mode" className={labelClass}>
                Mode of payment
              </label>
              <input
                id="pay_mode"
                type="text"
                value={payMode}
                onChange={(e) => setPayMode(e.target.value)}
                placeholder="PayPal / Payoneer / Stripe / Client-direct / Free"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pay_transaction_id" className={labelClass}>
                Transaction ID
              </label>
              <input
                id="pay_transaction_id"
                type="text"
                value={payTransactionId}
                onChange={(e) => setPayTransactionId(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pay_status" className={labelClass}>
                Status
              </label>
              <select
                id="pay_status"
                value={payStatus}
                onChange={(e) => setPayStatus(e.target.value)}
                className={inputClass}
              >
                {PAYMENT_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {paymentStatusLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pay_case" className={labelClass}>
                Case
              </label>
              <select
                id="pay_case"
                value={payCase}
                onChange={(e) => setPayCase(e.target.value)}
                className={inputClass}
              >
                {PAYMENT_CASES.map((c) => (
                  <option key={c} value={c}>
                    {paymentCaseLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pay_attributed_to" className={labelClass}>
                Assign to
              </label>
              <select
                id="pay_attributed_to"
                value={payAttributedToId}
                onChange={(e) => setPayAttributedToId(e.target.value)}
                className={inputClass}
              >
                <option value="">— None —</option>
                {payUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pay_date" className={labelClass}>
                Payment date
              </label>
              <input
                id="pay_date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="pay_watchers" className={labelClass}>
                CC watchers
              </label>
              <p className="text-xs text-muted-foreground">
                Pick up to 3 people to notify. The chosen payer can&apos;t also
                be a watcher.
              </p>
              <WatcherMultiSelect
                id="pay_watchers"
                users={payUsers}
                value={payWatcherIds}
                onChange={setPayWatcherIds}
                excludeId={payAttributedToId || null}
                max={3}
              />
            </div>
          </div>
        )}
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
        disabled={submitting || projectId === ""}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export default GuestPostForm;
