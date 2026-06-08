"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  PaymentStatusBadge,
  paymentStatusLabel,
} from "@/components/payment-status-badge";
import { ApiError } from "@/lib/api";
import type {
  CurrencyRef,
  PaymentListItem,
  PaymentStatus,
  ProjectListItem,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getCurrencies } from "@/services/lookup-service";
import { listPayments, removePayment } from "@/services/payment-service";
import { listProjects } from "@/services/project-service";

const PAGE_SIZE = 20;
const STATUS_OPTIONS: PaymentStatus[] = [
  "pending",
  "approved",
  "paid",
  "failed",
];

/** Format an INR amount with a "₹" prefix, or a dash when null. */
function formatInr(amount: number | null): string {
  if (amount == null) return "—";
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export default function PaymentsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<PaymentListItem[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filter pickers.
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRef[]>([]);

  // Debounce the search box into the active `search` filter.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load filter pickers + currency symbols once.
  useEffect(() => {
    let active = true;
    (async () => {
      const [projectsRes, currenciesRes] = await Promise.allSettled([
        listProjects({ page: 1, page_size: 200, sort: "name" }),
        getCurrencies(),
      ]);
      if (!active) return;
      // Non-fatal: a failed pick just leaves that helper empty.
      if (projectsRes.status === "fulfilled") {
        setProjects(projectsRes.value.items);
      }
      if (currenciesRes.status === "fulfilled") {
        setCurrencies(currenciesRes.value);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /** Resolve a currency code to its symbol, falling back to the code itself. */
  const currencySymbol = useCallback(
    (code: string): string =>
      currencies.find((c) => c.code === code)?.symbol ?? code,
    [currencies],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPayments({
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        project_id: projectId || undefined,
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort: "-created_at",
      });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load payments. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, projectId, status, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(payment: PaymentListItem) {
    const label =
      payment.project_name ?? payment.website_domain ?? "this payment";
    if (!window.confirm(`Delete payment for "${label}"? This cannot be undone.`)) {
      return;
    }
    setActionError(null);
    setBusyId(payment.id);
    try {
      await removePayment(payment.id);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 403
          ? "Only admins can delete payments."
          : err instanceof ApiError
            ? err.message
            : "Unable to delete payment.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Payments">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search payments…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-xs"
            />
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {paymentStatusLabel(s)}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              aria-label="Payment date from"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              aria-label="Payment date to"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Link
            href="/payments/new"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New Payment
          </Link>
        </div>

        {actionError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : error ? (
            <p
              role="alert"
              className="px-4 py-8 text-center text-sm text-destructive"
            >
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No payments found.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Website</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Amount INR
                  </th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Payment date</th>
                  <th className="px-4 py-3 font-medium">Transaction ID</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/payments/${p.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {p.project_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.website_domain ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.amount != null ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-foreground">
                            {currencySymbol(p.currency)}
                            {new Intl.NumberFormat("en-US", {
                              maximumFractionDigits: 2,
                            }).format(p.amount)}
                          </span>
                          {p.currency !== "USD" && p.amount_usd != null && (
                            <span className="text-xs text-muted-foreground">
                              ≈ {formatCurrency(p.amount_usd)}
                            </span>
                          )}
                        </div>
                      ) : p.amount_usd != null ? (
                        <span className="text-muted-foreground">
                          {formatCurrency(p.amount_usd)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatInr(p.amount_inr)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span>{p.mode_of_payment ?? "—"}</span>
                        {p.notified && (
                          <span
                            title="Client notified"
                            className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
                          >
                            Notified
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.transaction_id ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/payments/${p.id}/edit`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          disabled={busyId === p.id}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && items.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} payment{total === 1 ? "" : "s"} · page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
