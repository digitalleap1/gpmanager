"use client";

/**
 * Bulk-add Links modal for a project's Links tab.
 *
 * Presents a small scrollable, editable table — one row per link — letting the
 * user fill several guest-post links at once. Each row optionally requests a
 * payment (with a payment mode) that is raised to the admins. Submitting creates
 * them all in one `POST /guest-posts/bulk` call.
 *
 * Mirrors the branded modal pattern used elsewhere (fixed inset backdrop
 * `bg-[#1A1F4D]/40` + rounded-xl card, `role="dialog"` / `aria-modal`, Escape +
 * backdrop close). All numeric fields are kept as draft strings and parsed on
 * submit, so blanks are sent as omitted (not `0`).
 */

import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { WatcherMultiSelect } from "@/components/watcher-multi-select";
import { ApiError } from "@/lib/api";
import {
  PAYMENT_CASES,
  paymentCaseLabel,
  type BulkLinkRow,
  type BulkLinksResult,
  type CurrencyRef,
  type UserAdminRead,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { bulkCreateLinks } from "@/services/guest-post-service";
import { getCurrencies } from "@/services/lookup-service";
import { listUsers } from "@/services/user-service";

/** Editable draft of a single row — every field is a string for input binding. */
interface DraftRow {
  website_name: string;
  link_url: string;
  da: string;
  pa: string;
  dr: string;
  price: string;
  currency: string;
  payment_mode: string;
  request_payment: boolean;
  /** Payer assigned to this row's payment (only when `request_payment`). */
  attributed_to_id: string;
  /** Case for this row's payment (only when `request_payment`). */
  payment_case: string;
}

/** A fresh, empty draft row (currency defaults to USD, case to standard). */
function emptyRow(): DraftRow {
  return {
    website_name: "",
    link_url: "",
    da: "",
    pa: "",
    dr: "",
    price: "",
    currency: "USD",
    payment_mode: "",
    request_payment: false,
    attributed_to_id: "",
    payment_case: "standard",
  };
}

/** Parse a numeric-string draft field to a finite number, or undefined when blank. */
function numOrUndef(v: string): number | undefined {
  const t = v.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** True when a row carries neither a website name nor a URL (i.e. fully empty). */
function isBlankRow(row: DraftRow): boolean {
  return row.website_name.trim() === "" && row.link_url.trim() === "";
}

/** Map an unknown error to a friendly, ApiError-aware message. */
function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

const fieldCls =
  "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

export function BulkAddLinksModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  /** Called after a successful create so the caller can refresh + show a toast. */
  onCreated: (result: BulkLinksResult) => void;
}) {
  const [rows, setRows] = useState<DraftRow[]>(() => [
    emptyRow(),
    emptyRow(),
    emptyRow(),
  ]);
  const [currencies, setCurrencies] = useState<CurrencyRef[]>([]);
  const [users, setUsers] = useState<UserAdminRead[]>([]);
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load currencies (per-row select) + users (payer + CC pickers). Both non-fatal.
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

  // Any row currently requesting a payment? Controls the shared CC section.
  const anyRequestingPayment = rows.some((r) => r.request_payment);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patchRow(index: number, patch: Partial<DraftRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    // Keep at least one row.
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSubmit() {
    setError(null);

    const filled = rows.filter((row) => !isBlankRow(row));
    if (filled.length === 0) {
      setError("Add at least one row with a website name or a URL.");
      return;
    }

    const payload: BulkLinkRow[] = filled.map((row) => ({
      website_name: row.website_name.trim() || undefined,
      link_url: row.link_url.trim() || undefined,
      da: numOrUndef(row.da),
      pa: numOrUndef(row.pa),
      dr: numOrUndef(row.dr),
      price: numOrUndef(row.price),
      currency: row.currency.trim() || undefined,
      payment_mode: row.payment_mode.trim() || undefined,
      request_payment: row.request_payment,
      // Payer + case only matter when this row raises a payment.
      attributed_to_id: row.request_payment
        ? row.attributed_to_id || null
        : null,
      payment_case: row.request_payment ? row.payment_case : undefined,
    }));

    setSaving(true);
    try {
      const result = await bulkCreateLinks(projectId, payload, watcherIds);
      onCreated(result);
    } catch (err) {
      setError(errMsg(err, "Unable to add the links. Please try again."));
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
        aria-label="Bulk add links"
        className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#1A1F4D]">
              Bulk add links
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Fill one row per link. Tick “Request payment” to raise a pending
              payment to the admins.
            </p>
          </div>
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

        <div className="flex-1 overflow-auto px-5 py-4">
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Website</th>
                  <th className="px-3 py-2 font-medium">Live URL</th>
                  <th className="px-3 py-2 font-medium">DA</th>
                  <th className="px-3 py-2 font-medium">PA</th>
                  <th className="px-3 py-2 font-medium">DR</th>
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Currency</th>
                  <th className="px-3 py-2 font-medium">Pay mode</th>
                  <th className="px-3 py-2 font-medium">Payer</th>
                  <th className="px-3 py-2 font-medium">Case</th>
                  <th className="px-3 py-2 text-center font-medium">
                    Request payment
                  </th>
                  <th className="px-3 py-2" aria-label="Remove row" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const wantsPaymentNoPrice =
                    row.request_payment && numOrUndef(row.price) === undefined;
                  return (
                    <tr
                      key={index}
                      className="border-b border-border last:border-0 align-top"
                    >
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          aria-label={`Website name, row ${index + 1}`}
                          value={row.website_name}
                          disabled={saving}
                          onChange={(e) =>
                            patchRow(index, { website_name: e.target.value })
                          }
                          placeholder="example.com"
                          className={cn(fieldCls, "min-w-[9rem]")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="url"
                          aria-label={`Live URL, row ${index + 1}`}
                          value={row.link_url}
                          disabled={saving}
                          onChange={(e) =>
                            patchRow(index, { link_url: e.target.value })
                          }
                          placeholder="https://…"
                          className={cn(fieldCls, "min-w-[10rem]")}
                        />
                      </td>
                      {(
                        [
                          ["da", "DA"],
                          ["pa", "PA"],
                          ["dr", "DR"],
                        ] as const
                      ).map(([key, label]) => (
                        <td key={key} className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            inputMode="numeric"
                            aria-label={`${label}, row ${index + 1}`}
                            value={row[key]}
                            disabled={saving}
                            onChange={(e) =>
                              patchRow(index, { [key]: e.target.value })
                            }
                            className={cn(fieldCls, "w-16")}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          aria-label={`Price, row ${index + 1}`}
                          value={row.price}
                          disabled={saving}
                          onChange={(e) =>
                            patchRow(index, { price: e.target.value })
                          }
                          placeholder="0.00"
                          className={cn(fieldCls, "w-20")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          aria-label={`Currency, row ${index + 1}`}
                          value={row.currency}
                          disabled={saving}
                          onChange={(e) =>
                            patchRow(index, { currency: e.target.value })
                          }
                          className={cn(fieldCls, "w-20")}
                        >
                          {currencies.length === 0 ? (
                            <option value={row.currency}>{row.currency}</option>
                          ) : (
                            currencies.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code}
                              </option>
                            ))
                          )}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          aria-label={`Payment mode, row ${index + 1}`}
                          value={row.payment_mode}
                          disabled={saving}
                          onChange={(e) =>
                            patchRow(index, { payment_mode: e.target.value })
                          }
                          placeholder="e.g. PayPal"
                          className={cn(fieldCls, "min-w-[7rem]")}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          aria-label={`Payer, row ${index + 1}`}
                          value={row.attributed_to_id}
                          disabled={saving || !row.request_payment}
                          onChange={(e) =>
                            patchRow(index, {
                              attributed_to_id: e.target.value,
                            })
                          }
                          className={cn(fieldCls, "min-w-[8rem]")}
                        >
                          <option value="">— None —</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          aria-label={`Case, row ${index + 1}`}
                          value={row.payment_case}
                          disabled={saving || !row.request_payment}
                          onChange={(e) =>
                            patchRow(index, { payment_case: e.target.value })
                          }
                          className={cn(fieldCls, "min-w-[7rem]")}
                        >
                          {PAYMENT_CASES.map((c) => (
                            <option key={c} value={c}>
                              {paymentCaseLabel(c)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Request payment, row ${index + 1}`}
                          checked={row.request_payment}
                          disabled={saving}
                          onChange={(e) =>
                            patchRow(index, { request_payment: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                        />
                        {wantsPaymentNoPrice && (
                          <span className="mt-1 block text-[10px] leading-tight text-amber-600">
                            No price set
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          disabled={saving || rows.length <= 1}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-30"
                          aria-label={`Remove row ${index + 1}`}
                          title="Remove row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            disabled={saving}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add row
          </button>

          {anyRequestingPayment && (
            <div className="mt-4 max-w-md space-y-1.5">
              <label
                htmlFor="bulk_watchers"
                className="text-sm font-medium text-[#1A1F4D]"
              >
                CC watchers (for all payment requests)
              </label>
              <p className="text-xs text-muted-foreground">
                Pick up to 3 people to notify on every payment raised in this
                batch.
              </p>
              <WatcherMultiSelect
                id="bulk_watchers"
                users={users}
                value={watcherIds}
                onChange={setWatcherIds}
                max={3}
                disabled={saving}
              />
            </div>
          )}
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
            {saving ? "Adding…" : "Add links"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkAddLinksModal;
