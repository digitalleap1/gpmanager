"use client";

import {
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  CircleSlash,
  FolderKanban,
  Link2,
  PauseCircle,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { BarChart } from "@/components/bar-chart";
import { StatCard } from "@/components/stat-card";
import { ApiError } from "@/lib/api";
import type {
  Activity,
  BudgetUsagePoint,
  DashboardSummary,
  MonthlyLinksPoint,
} from "@/lib/types";
import { formatCurrency, MONTHS, relativeTime } from "@/lib/utils";
import {
  getBudgetUsage,
  getMonthlyLinks,
  getRecentActivity,
  getSummary,
} from "@/services/dashboard-service";

const CHART_PRIMARY = "hsl(var(--primary))";
const CHART_MUTED = "hsl(var(--muted-foreground))";

export default function DashboardPage() {
  const year = new Date().getFullYear();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [links, setLinks] = useState<MonthlyLinksPoint[]>([]);
  const [budget, setBudget] = useState<BudgetUsagePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, a, l, b] = await Promise.all([
          getSummary(),
          getRecentActivity(10),
          getMonthlyLinks(year),
          getBudgetUsage(year),
        ]);
        if (!active) return;
        setSummary(s);
        setActivity(a);
        setLinks(l);
        setBudget(b);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load the dashboard. Please try again.",
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [year]);

  // Normalise chart data to 12 months ordered Jan–Dec.
  const linksByMonth = (key: "target" | "achieved") =>
    MONTHS.map((_, i) => links.find((p) => p.month === i + 1)?.[key] ?? 0);
  const budgetByMonth = (key: "budget" | "spent") =>
    MONTHS.map((_, i) => budget.find((p) => p.month === i + 1)?.[key] ?? 0);

  return (
    <AppShell title="Dashboard">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : summary ? (
        <div className="space-y-8">
          {/* Page intro */}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#1A1F4D]">
              Operations overview
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A live snapshot of projects, links, payments, and your team.
            </p>
          </div>

          {/* Stat cards */}
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard
              icon={FolderKanban}
              label="Total Projects"
              value={summary.total_projects}
            />
            <StatCard
              icon={BarChart3}
              label="Active"
              value={summary.active_projects}
            />
            <StatCard
              icon={CheckCircle2}
              label="Completed"
              value={summary.completed_projects}
            />
            <StatCard
              icon={PauseCircle}
              label="On Hold"
              value={summary.on_hold_projects}
            />
            <StatCard
              icon={Target}
              label="Target Links"
              value={summary.total_target_links}
            />
            <StatCard
              icon={Link2}
              label="Live Links"
              value={summary.total_live_links}
            />
            <StatCard
              icon={CircleDollarSign}
              label="Pending Payments"
              value={summary.pending_payments_count}
              sublabel={formatCurrency(summary.pending_payments_amount)}
            />
            <StatCard
              icon={Wallet}
              label="Monthly Budget"
              value={formatCurrency(summary.monthly_budget_total)}
              sublabel={`${formatCurrency(summary.monthly_spent_total)} spent`}
            />
            <StatCard
              icon={Users}
              label="Team Members"
              value={summary.team_members}
            />
            <StatCard
              icon={CircleSlash}
              label="Cancelled"
              value={summary.cancelled_projects}
            />
          </section>

          {/* Charts */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-[#1A1F4D]">
                Monthly Links{" "}
                <span className="font-normal text-muted-foreground">
                  · {year}
                </span>
              </h2>
              <BarChart
                labels={MONTHS}
                series={[
                  {
                    name: "Target",
                    color: CHART_MUTED,
                    values: linksByMonth("target"),
                  },
                  {
                    name: "Achieved",
                    color: CHART_PRIMARY,
                    values: linksByMonth("achieved"),
                  },
                ]}
              />
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-[#1A1F4D]">
                Budget Usage{" "}
                <span className="font-normal text-muted-foreground">
                  · {year}
                </span>
              </h2>
              <BarChart
                labels={MONTHS}
                series={[
                  {
                    name: "Budget",
                    color: CHART_MUTED,
                    values: budgetByMonth("budget"),
                  },
                  {
                    name: "Spent",
                    color: CHART_PRIMARY,
                    values: budgetByMonth("spent"),
                  },
                ]}
              />
            </div>
          </section>

          {/* Recent activity */}
          <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-[#1A1F4D]">
              Recent Activity
            </h2>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recent activity yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        <span className="font-medium">
                          {item.user?.full_name ?? "System"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {item.summary}
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(item.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
