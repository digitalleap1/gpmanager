"use client";

import {
  AlertTriangle,
  Clock,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { BarChart } from "@/components/bar-chart";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type { LedgerStats, NamedRevenue } from "@/lib/types";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getLedgerStats } from "@/services/payment-service";

const CHART_PRIMARY = "hsl(var(--primary))";

/** True when the stats payload has no revenue and no movement to show. */
function isEmptyStats(s: LedgerStats): boolean {
  return (
    s.total_revenue === 0 &&
    s.pending_count === 0 &&
    s.overdue_count === 0 &&
    s.monthly_revenue.every((p) => p.revenue === 0) &&
    s.client_revenue.length === 0 &&
    s.team_revenue.length === 0 &&
    s.status_breakdown.every((b) => b.count === 0)
  );
}

export default function LedgerPage() {
  const { user: me } = useAuth();
  const isManager = Boolean(
    me &&
      (me.is_superuser ||
        me.roles.includes("admin") ||
        me.roles.includes("team_lead")),
  );

  const [stats, setStats] = useState<LedgerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isManager) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getLedgerStats();
        if (active) setStats(data);
      } catch (err) {
        if (active)
          setError(
            err instanceof ApiError
              ? err.message
              : "Unable to load the ledger. Please try again.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isManager]);

  // Monthly revenue ordered by (year, month) for the bar chart.
  const monthly = useMemo(() => {
    if (!stats) return { labels: [] as string[], values: [] as number[] };
    const sorted = [...stats.monthly_revenue].sort(
      (a, b) => a.year - b.year || a.month - b.month,
    );
    return {
      labels: sorted.map((p) => monthLabel(p.month)),
      values: sorted.map((p) => p.revenue),
    };
  }, [stats]);

  if (!isManager) {
    return (
      <AppShell title="Payments Ledger">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold text-[#1A1F4D]">
            Managers only
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You need a manager role (admin or team lead) to view the payments
            ledger.
          </p>
        </div>
      </AppShell>
    );
  }

  const empty = stats ? isEmptyStats(stats) : false;

  return (
    <AppShell title="Payments Ledger">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : stats ? (
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#1A1F4D]">
              Revenue overview
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Track total revenue, pending and overdue balances, and where the
              money comes from.
            </p>
          </div>

          {empty ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                No revenue recorded yet — import or add payments to populate the
                ledger.
              </p>
            </div>
          ) : (
            <>
              {/* Top stats */}
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                  icon={TrendingUp}
                  label="Total Revenue"
                  value={formatCurrency(stats.total_revenue)}
                />
                <StatCard
                  icon={Clock}
                  label="Pending"
                  value={stats.pending_count}
                  sublabel={formatCurrency(stats.pending_amount)}
                />
                <StatCard
                  icon={AlertTriangle}
                  label="Overdue"
                  value={stats.overdue_count}
                  sublabel={formatCurrency(stats.overdue_amount)}
                />
              </section>

              {/* Monthly revenue */}
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-[#1A1F4D]">
                  Monthly Revenue
                </h3>
                {monthly.values.some((v) => v > 0) ? (
                  <BarChart
                    labels={monthly.labels}
                    series={[
                      {
                        name: "Revenue",
                        color: CHART_PRIMARY,
                        values: monthly.values,
                      },
                    ]}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No monthly revenue recorded yet.
                  </p>
                )}
              </section>

              {/* Client + team revenue */}
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <RevenueRanking
                  title="Client-wise Revenue"
                  rows={stats.client_revenue}
                  emptyLabel="No client revenue recorded yet."
                />
                <RevenueRanking
                  title="Team-wise Revenue"
                  rows={stats.team_revenue}
                  emptyLabel="No team revenue recorded yet."
                />
              </section>

              {/* Status breakdown */}
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-[#1A1F4D]">
                  Status breakdown
                </h3>
                {stats.status_breakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payments recorded yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {stats.status_breakdown.map((b) => (
                      <li
                        key={b.status}
                        className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center gap-3">
                          <PaymentStatusBadge status={b.status} />
                          <span className="text-sm text-muted-foreground">
                            {b.count} payment{b.count === 1 ? "" : "s"}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {formatCurrency(b.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      ) : null}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

/** A ranked list of named revenue rows with subtle proportional bars. */
function RevenueRanking({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: NamedRevenue[];
  emptyLabel: string;
}) {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const max = Math.max(1, ...sorted.map((r) => r.revenue));

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-[#1A1F4D]">{title}</h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((r) => {
            const pct = Math.max(2, (r.revenue / max) * 100);
            return (
              <li key={r.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-foreground">
                    {r.name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatCurrency(r.revenue)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
