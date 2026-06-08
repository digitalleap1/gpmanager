"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  CircleSlash,
  ClipboardList,
  Coins,
  FolderKanban,
  Link2,
  PauseCircle,
  Plus,
  Route,
  Target,
  Upload,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { BarChart } from "@/components/bar-chart";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type {
  Activity,
  BudgetUsagePoint,
  DashboardSummary,
  LedgerStats,
  MonthlyLinksPoint,
  TaskListItem,
} from "@/lib/types";
import {
  cn,
  formatCurrency,
  formatDate,
  MONTHS,
  relativeTime,
} from "@/lib/utils";
import {
  getBudgetUsage,
  getMonthlyLinks,
  getRecentActivity,
  getSummary,
} from "@/services/dashboard-service";
import { getLedgerStats } from "@/services/payment-service";
import { listTasks } from "@/services/task-service";

const CHART_PRIMARY = "hsl(var(--primary))";
const CHART_MUTED = "hsl(var(--muted-foreground))";

interface QuickAction {
  label: string;
  href: string;
  icon: typeof Plus;
  /** Pink-filled primary action vs. outline secondary. */
  primary?: boolean;
  /** Only render for admins. */
  adminOnly?: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "New Project", href: "/projects/new", icon: Plus, primary: true },
  { label: "New Payment", href: "/payments/new", icon: CircleDollarSign },
  { label: "New Client", href: "/clients", icon: Users },
  { label: "Run Import", href: "/imports", icon: Upload },
  { label: "Add User", href: "/users", icon: UserPlus, adminOnly: true },
];

export default function DashboardPage() {
  const year = new Date().getFullYear();
  const { user } = useAuth();
  const isAdmin = Boolean(
    user && (user.is_superuser || user.roles.includes("admin")),
  );

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [links, setLinks] = useState<MonthlyLinksPoint[]>([]);
  const [budget, setBudget] = useState<BudgetUsagePoint[]>([]);
  const [ledger, setLedger] = useState<LedgerStats | null>(null);
  const [overdue, setOverdue] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);

      // Core summary + charts + activity load together; ledger stats and
      // overdue tasks are best-effort so one failure can't blank the page.
      const [core, ledgerRes, overdueRes] = await Promise.allSettled([
        Promise.all([
          getSummary(),
          getRecentActivity(10),
          getMonthlyLinks(year),
          getBudgetUsage(year),
        ]),
        getLedgerStats(),
        listTasks({ status: "overdue", page_size: 50 }),
      ]);

      if (!active) return;

      if (core.status === "fulfilled") {
        const [s, a, l, b] = core.value;
        setSummary(s);
        setActivity(a);
        setLinks(l);
        setBudget(b);
      } else {
        const err = core.reason;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load the dashboard. Please try again.",
        );
      }

      setLedger(ledgerRes.status === "fulfilled" ? ledgerRes.value : null);
      setOverdue(
        overdueRes.status === "fulfilled" ? overdueRes.value.items : [],
      );

      setLoading(false);
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

  const actions = QUICK_ACTIONS.filter((a) => !a.adminOnly || isAdmin);

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
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#1A1F4D]">
                Operations overview
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A live snapshot of projects, links, payments, and your team.
              </p>
            </div>
            <Link
              href="/workflow"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/10"
            >
              <Route className="h-4 w-4" />
              New here? See the Workflow Guide
            </Link>
          </div>

          {/* Quick actions */}
          <section className="flex flex-wrap gap-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  action.primary
                    ? "bg-primary text-primary-foreground shadow-sm hover:opacity-90"
                    : "border border-border bg-card text-card-foreground hover:border-primary/40 hover:text-primary",
                )}
              >
                <action.icon className="h-4 w-4" />
                {action.label}
              </Link>
            ))}
          </section>

          {/* Stat cards */}
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard
              icon={FolderKanban}
              label="Total Projects"
              value={summary.total_projects}
              href="/projects"
            />
            <StatCard
              icon={BarChart3}
              label="Active"
              value={summary.active_projects}
              href="/projects"
            />
            <StatCard
              icon={CheckCircle2}
              label="Completed"
              value={summary.completed_projects}
              href="/projects"
            />
            <StatCard
              icon={PauseCircle}
              label="On Hold"
              value={summary.on_hold_projects}
              href="/projects"
            />
            <StatCard
              icon={Target}
              label="Target Links"
              value={summary.total_target_links}
              href="/guest-posts"
            />
            <StatCard
              icon={Link2}
              label="Live Links"
              value={summary.total_live_links}
              href="/guest-posts"
            />
            <StatCard
              icon={CircleDollarSign}
              label="Pending Payments"
              value={summary.pending_payments_count}
              sublabel={formatCurrency(summary.pending_payments_amount)}
              href="/payments"
            />
            <StatCard
              icon={Wallet}
              label="Monthly Budget"
              value={formatCurrency(summary.monthly_budget_total)}
              sublabel={`${formatCurrency(summary.monthly_spent_total)} spent`}
              href="/ledger"
            />
            {ledger && (
              <StatCard
                icon={Coins}
                label="Total Revenue"
                value={formatCurrency(ledger.total_revenue)}
                sublabel={`${formatCurrency(
                  ledger.pending_amount,
                )} pending · ${formatCurrency(ledger.overdue_amount)} overdue`}
                href="/ledger"
              />
            )}
            <StatCard
              icon={Users}
              label="Team Members"
              value={summary.team_members}
              href={isAdmin ? "/users" : undefined}
            />
            <StatCard
              icon={CircleSlash}
              label="Cancelled"
              value={summary.cancelled_projects}
              href="/projects"
            />
          </section>

          {/* Overdue tasks */}
          <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#1A1F4D]">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Overdue Tasks
                {overdue.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {overdue.length}
                  </span>
                )}
              </h2>
              <Link
                href="/tasks"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            {overdue.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <p className="text-sm text-muted-foreground">
                  No overdue tasks — nice!
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {overdue.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1A1F4D]">
                        {task.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {task.project_name ?? "No project"}
                        {" · "}
                        <span className="font-medium text-foreground">
                          {task.assigned_to?.full_name ?? "Unassigned"}
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      Due {formatDate(task.due_date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#1A1F4D]">
              <ClipboardList className="h-4 w-4 text-primary" />
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
