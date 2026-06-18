"use client";

/**
 * "Request payment" modal for a guest-post link.
 *
 * Collects the assignment details — case, amount (defaults to the link price),
 * currency, mode, payer, CC watchers, and an optional note — and raises a
 * pending payment via `POST /guest-posts/{id}/request-payment`. Mirrors the
 * branded modal pattern (fixed inset backdrop `bg-[#1A1F4D]/40` + rounded-xl
 * card, `role="dialog"` / `aria-modal`, Escape + backdrop close).
 */

import { CreditCard, X } from "lucide-react";
import { useEffect, useState } from "react";

import { WatcherMultiSelect } from "@/components/watcher-multi-select";
import { ApiError } from "@/lib/api";
import {
  PAYMENT_CASES,
  paymentCaseLabel,
  type CurrencyRef,
  type UserAdminRead,
} from "@/lib/types";
import { requestGuestPostPayment } from "@/services/guest-post-service";
import { getCurrencies } from "@/services/lookup-service";
import { listUsers } from "@/services/user-service";

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";
const labelClass = "text-sm font-medium";

export function RequestPaymentModal({
  guestPostId,
  defaultPrice,
  defaultCurrency = "USD",
  onClose,
  onRequested,
}: {
  guestPostId: string;
  /** The link's own price, used to prefill + placeholder the amount. */
  defaultPrice?: number | null;
  defaultCurrency?: string;
  onClose: () => void;
  /** Called after the payment is requested so the caller can refresh. */
  onRequested: () => void;
}) {
  const [paymentCase, setPaymentCase] = useState<string>("standard");
  const [amount, setAmount] = useState(
    defaultPrice != null ? String(defaultPrice) : "",
  );
  const [currency, setCurrency] = useState(defaultCurrency);
  const [mode, setMode] = useState("");
  const [payerId, setPayerId] = useState("");
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const [currencies, setCurrencies] = useState<CurrencyRef[]>([]);
  const [users, setUsers] = useState<UserAdminRead[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the currency + payer pickers (both non-fatal).
  useEffect(() => {
    let active = true;
    void (async () => {
      const [currenciesRes, usersRes] = await Promise.allSettled([
        getCurrencies(),
        listUsers(),
      ]);
      if (!active) return;
      if (currenciesRes.status === "fulfilled")
        setCurrencies(currenciesRes.value);
      if (usersRes.status === "fulfilled") setUsers(usersRes.value);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    const amountNum = amount.trim() === "" ? undefined : Number(amount);
    try {
      await requestGuestPostPayment(guestPostId, {
        payment_case: paymentCase,
        amount:
          amountNum != null && Number.isFinite(amountNum)
            ? amountNum
            : undefined,
        currency: currency || undefined,
        mode_of_payment: mode.trim() || undefined,
        attributed_to_id: payerId || null,
        // Never let the chosen payer also be a CC watcher.
        watcher_ids: watcherIds.filter((w) => w !== payerId),
        note: note.trim() || undefined,
      });
      onRequested();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? "You can't request payment for this link."
          : e instanceof ApiError
            ? e.message
            : "Unable to request payment for this link.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1A1F4D]/40 backdrop-blur-sm"
        onClick={saving ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Request payment"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-[#1A1F4D]">
            Request payment
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="rp_case" className={labelClass}>
                Case
              </label>
              <select
                id="rp_case"
                value={paymentCase}
                disabled={saving}
                onChange={(e) => setPaymentCase(e.target.value)}
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
              <label htmlFor="rp_amount" className={labelClass}>
                Amount
              </label>
              <input
                id="rp_amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                disabled={saving}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={
                  defaultPrice != null ? String(defaultPrice) : "0.00"
                }
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rp_currency" className={labelClass}>
                Currency
              </label>
              <select
                id="rp_currency"
                value={currency}
                disabled={saving}
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
              <label htmlFor="rp_mode" className={labelClass}>
                Mode of payment
              </label>
              <input
                id="rp_mode"
                type="text"
                value={mode}
                disabled={saving}
                onChange={(e) => setMode(e.target.value)}
                placeholder="PayPal / Payoneer / Stripe…"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="rp_payer" className={labelClass}>
                Payer
              </label>
              <select
                id="rp_payer"
                value={payerId}
                disabled={saving}
                onChange={(e) => setPayerId(e.target.value)}
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

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="rp_watchers" className={labelClass}>
                CC watchers
              </label>
              <WatcherMultiSelect
                id="rp_watchers"
                users={users}
                value={watcherIds}
                onChange={setWatcherIds}
                excludeId={payerId || null}
                max={3}
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="rp_note" className={labelClass}>
                Note (optional)
              </label>
              <textarea
                id="rp_note"
                rows={2}
                value={note}
                disabled={saving}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add context for this request…"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <CreditCard className="h-4 w-4" />
            {saving ? "Requesting…" : "Request payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RequestPaymentModal;
