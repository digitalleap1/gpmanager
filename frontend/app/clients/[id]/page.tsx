"use client";

import {
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FolderKanban,
  Pencil,
  PiggyBank,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { StatCard } from "@/components/stat-card";
import { ApiError } from "@/lib/api";
import type {
  ClientDetail,
  PaymentListItem,
  ProjectListItem,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { getClient } from "@/services/client-service";
import { listPayments } from "@/services/payment-service";
import { listProjects } from "@/services/project-service";

const PROJECT_STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-green-100 text-green-700" },
  completed: { label: "Completed", cls: "bg-indigo-100 text-indigo-700" },
  hold: { label: "On Hold", cls: "bg-amber-100 text-amber-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-200 text-slate-600" },
};

/** Format an amount with a currency code suffix (no decimals). */
function fmt(amount: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount ?? 0)} ${currency}`;
}

/** Format a payment amount in its native currency, or a dash when null. */
function fmtPayment(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const detail = await getClient(id);
        if (!active) return;
        setClient(detail);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load the client. Please try again.",
        );
        setLoading(false);
        return;
      }
      // The related lists are best-effort — a failure leaves an empty state.
      const [projectsRes, paymentsRes] = await Promise.allSettled([
        listProjects({ client_id: id, page: 1, page_size: 100, sort: "name" }),
        listPayments({ client_id: id, page: 1, page_size: 50, sort: "-created_at" }),
      ]);
      if (!active) return;
      if (projectsRes.status === "fulfilled") {
        setProjects(projectsRes.value.items);
      }
      if (paymentsRes.status === "fulfilled") {
        setPayments(paymentsRes.value.items);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const currency = client?.currency ?? "USD";
  const m = client?.metrics;

  return (
    <AppShell title={client?.name ?? "Client"}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : client && m ? (
        <div className="space-y-6">
          {/* Back link */}
          <Link
            href="/clients"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to clients
          </Link>

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight text-[#1A1F4D]">
                  {client.name}
                </h2>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    client.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {client.status === "active" ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>Currency: {client.currency}</span>
                {client.contact_name && <span>· {client.contact_name}</span>}
                {client.contact_email && (
                  <a
                    href={`mailto:${client.contact_email}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {client.contact_email}
                  </a>
                )}
                {client.contact_phone && <span>· {client.contact_phone}</span>}
                {client.website && (
                  <a
                    href={client.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Website
                  </a>
                )}
              </div>
            </div>
            <Link
              href="/clients"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              title="Manage clients"
            >
              <Pencil className="h-4 w-4" />
              Edit on list
            </Link>
          </div>

          {/* Metrics grid */}
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard
              icon={Wallet}
              label="Total Budget"
              value={fmt(m.total_budget, currency)}
            />
            <StatCard
              icon={CircleDollarSign}
              label="Total Paid"
              value={fmt(m.total_paid, currency)}
            />
            <StatCard
              icon={Receipt}
              label="Consumed"
              value={fmt(m.consumed_budget, currency)}
            />
            <StatCard
              icon={PiggyBank}
              label="Remaining"
              value={fmt(m.remaining_budget, currency)}
            />
            <StatCard
              icon={CircleDollarSign}
              label="Pending"
              value={fmt(m.pending_amount, currency)}
            />
            <StatCard
              icon={TrendingUp}
              label="Revenue"
              value={fmt(m.revenue, currency)}
            />
            <StatCard
              icon={FolderKanban}
              label="Active Projects"
              value={m.active_projects}
              sublabel={`${m.project_count} total`}
            />
            <StatCard
              icon={CheckCircle2}
              label="Completed Projects"
              value={m.completed_projects}
            />
            <StatCard
              icon={Receipt}
              label="Payments"
              value={m.payment_count}
            />
          </section>

          {client.notes && (
            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-[#1A1F4D]">Notes</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {client.notes}
              </p>
            </section>
          )}

          {/* Projects */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-[#1A1F4D]">
              Projects
            </h3>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects linked to this client yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {projects.map((p) => {
                  const meta = PROJECT_STATUS_META[p.status] ?? {
                    label: p.status,
                    cls: "bg-slate-100 text-slate-600",
                  };
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <Link
                        href={`/projects/${p.id}`}
                        className="truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Payments */}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-6 py-4">
              <h3 className="text-base font-semibold text-[#1A1F4D]">
                Payments
              </h3>
            </div>
            {payments.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                No payments recorded for this client yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 text-right font-medium">
                        Amount
                      </th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Mode</th>
                      <th className="px-6 py-3 font-medium">Attributed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-border last:border-0 hover:bg-accent/40"
                      >
                        <td className="px-6 py-3">
                          <Link
                            href={`/payments/${p.id}`}
                            className="text-foreground hover:underline"
                          >
                            {formatDate(p.payment_date ?? p.created_at)}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-right text-foreground">
                          {fmtPayment(p.amount, p.currency)}
                        </td>
                        <td className="px-6 py-3">
                          <PaymentStatusBadge status={p.status} />
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {p.mode_of_payment ?? "—"}
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {p.attributed_to?.full_name ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
