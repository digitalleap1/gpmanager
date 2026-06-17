"use client";

import {
  Activity as ActivityIcon,
  Archive,
  ArchiveRestore,
  CheckSquare,
  CreditCard,
  ExternalLink,
  FileBarChart,
  FileText,
  Globe,
  LayoutGrid,
  ListPlus,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/app-shell";
import { BulkAddLinksModal } from "@/components/bulk-add-links-modal";
import {
  GuestPostStatusBadge,
  ReviewStatusBadge,
} from "@/components/guest-post-status-badge";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { TaskStatusBadge } from "@/components/task-status-badge";
import { ApiError } from "@/lib/api";
import type {
  AuditLogRead,
  BulkLinksResult,
  GuestPostListItem,
  MonthlyBudget,
  MonthlyGoal,
  PaymentListItem,
  ProjectComment,
  ProjectDetail,
  ProjectMember,
  ProjectOverview,
  TaskListItem,
  UserSummary,
  WebsiteUsedItem,
} from "@/lib/types";
import { formatDate, monthLabel, relativeTime } from "@/lib/utils";
import {
  listGuestPosts,
  requestGuestPostPayment,
} from "@/services/guest-post-service";
import { getUsers } from "@/services/lookup-service";
import { listPayments } from "@/services/payment-service";
import {
  addMember,
  addProjectComment,
  archiveProject,
  getProject,
  getProjectActivity,
  getProjectOverview,
  getProjectWebsites,
  removeMember,
  setBudget,
  setGoal,
} from "@/services/project-service";
import { listTasks } from "@/services/task-service";

const LIST_PAGE_SIZE = 15;

/**
 * Format a budget amount in its own currency. Falls back to a `CODE amount`
 * string if the currency code is not a valid ISO code for `Intl`.
 */
function formatBudget(amount: number, currency: string): string {
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount ?? 0);
  } catch {
    return `${code} ${(amount ?? 0).toLocaleString("en-US")}`;
  }
}

/** Build up-to-two-letter initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Clamp a 0–100 percentage from a part / whole, guarding divide-by-zero. */
function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/** Map an unknown error to a friendly, ApiError-aware message. */
function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/* ------------------------------------------------------------------ *
 * Tab definitions
 * ------------------------------------------------------------------ */

type TabKey =
  | "overview"
  | "budget"
  | "links"
  | "websites"
  | "payments"
  | "team"
  | "tasks"
  | "activity"
  | "comments"
  | "reports";

const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "budget", label: "Budget", icon: Wallet },
  { key: "links", label: "Links", icon: FileText },
  { key: "websites", label: "Websites", icon: Globe },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "team", label: "Team", icon: Users },
  { key: "tasks", label: "Tasks", icon: CheckSquare },
  { key: "activity", label: "Activity", icon: ActivityIcon },
  { key: "comments", label: "Comments", icon: MessageSquare },
  { key: "reports", label: "Reports", icon: FileBarChart },
];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

/* ================================================================== *
 * Page shell (Suspense boundary for useSearchParams)
 * ================================================================== */

export default function ProjectHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <AppShell title="Project">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </AppShell>
      }
    >
      <ProjectHub id={id} />
    </Suspense>
  );
}

/* ================================================================== *
 * Project Hub
 * ================================================================== */

function ProjectHub({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = isTabKey(tabParam) ? tabParam : "overview";

  // Core project record (always loaded; powers the header + several tabs).
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [goals, setGoals] = useState<MonthlyGoal[]>([]);
  const [budgets, setBudgets] = useState<MonthlyBudget[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Overview is shared by the Overview, Budget header, and Reports tabs, so it
  // lives at the hub level and is fetched once on first need.
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewLoaded, setOverviewLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await getProject(id);
      setProject(data);
      setGoals(data.goals);
      setBudgets(data.budgets);
      setMembers(data.members);
      setComments(data.comments);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(errMsg(err, "Unable to load the project. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      setOverview(await getProjectOverview(id));
      setOverviewLoaded(true);
    } catch (err) {
      setOverviewError(errMsg(err, "Unable to load project metrics."));
    } finally {
      setOverviewLoading(false);
    }
  }, [id]);

  // Lazily fetch the overview the first time a tab that needs it is shown.
  useEffect(() => {
    const needsOverview =
      activeTab === "overview" ||
      activeTab === "budget" ||
      activeTab === "reports";
    if (needsOverview && !overviewLoaded && !overviewLoading && !overviewError) {
      void loadOverview();
    }
  }, [
    activeTab,
    overviewLoaded,
    overviewLoading,
    overviewError,
    loadOverview,
  ]);

  function selectTab(tab: TabKey) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", tab);
    router.replace(`/projects/${id}?${sp.toString()}`, { scroll: false });
  }

  async function handleArchive() {
    if (!project) return;
    setActionError(null);
    setArchiving(true);
    try {
      const updated = await archiveProject(id, !project.is_archived);
      setProject((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err) {
      setActionError(errMsg(err, "Unable to update project."));
    } finally {
      setArchiving(false);
    }
  }

  async function handleSaveGoal(month: number, value: number) {
    if (!project) return;
    const updated = await setGoal(id, project.current_year, month, value);
    setGoals((prev) =>
      prev.map((g) => (g.month === updated.month ? updated : g)),
    );
  }

  async function handleSaveBudget(month: number, value: number) {
    if (!project) return;
    const updated = await setBudget(id, project.current_year, month, value);
    setBudgets((prev) =>
      prev.map((b) => (b.month === updated.month ? updated : b)),
    );
  }

  if (loading) {
    return (
      <AppShell title="Project">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell title="Project">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-[#1A1F4D]">
            Project not found
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This project doesn&apos;t exist, or you don&apos;t have access to
            it.
          </p>
          <Link
            href="/projects"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            ← Back to projects
          </Link>
        </div>
      </AppShell>
    );
  }

  if (error || !project) {
    return (
      <AppShell title="Project">
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error ?? "Unable to load the project."}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={project.name}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/projects"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to projects
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

        {/* Premium header band */}
        <HeaderBand
          project={project}
          overview={overview}
          id={id}
          archiving={archiving}
          onArchive={handleArchive}
        />

        {/* Sticky tab bar */}
        <div className="sticky top-16 z-10 -mx-4 border-b border-border bg-muted/30 px-4 backdrop-blur sm:-mx-6 sm:px-6">
          <nav
            className="flex gap-1 overflow-x-auto py-2"
            aria-label="Project sections"
          >
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = key === activeTab;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectTab(key)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Active tab panel */}
        <div>
          {activeTab === "overview" && (
            <OverviewTab
              overview={overview}
              loading={overviewLoading}
              error={overviewError}
              onRetry={loadOverview}
            />
          )}
          {activeTab === "budget" && (
            <BudgetTab
              project={project}
              goals={goals}
              budgets={budgets}
              overview={overview}
              overviewLoading={overviewLoading}
              onSaveGoal={handleSaveGoal}
              onSaveBudget={handleSaveBudget}
            />
          )}
          {activeTab === "links" && <LinksTab projectId={id} />}
          {activeTab === "websites" && <WebsitesTab projectId={id} />}
          {activeTab === "payments" && <PaymentsTab projectId={id} />}
          {activeTab === "team" && (
            <TeamTab
              project={project}
              projectId={id}
              members={members}
              onMembersChange={setMembers}
            />
          )}
          {activeTab === "tasks" && <TasksTab projectId={id} />}
          {activeTab === "activity" && <ActivityTab projectId={id} />}
          {activeTab === "comments" && (
            <CommentsSection
              projectId={id}
              comments={comments}
              onChange={setComments}
            />
          )}
          {activeTab === "reports" && (
            <ReportsTab
              projectId={id}
              overview={overview}
              overviewLoading={overviewLoading}
              overviewError={overviewError}
              onRetryOverview={loadOverview}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

/* ================================================================== *
 * Header band
 * ================================================================== */

function HeaderBand({
  project,
  overview,
  id,
  archiving,
  onArchive,
}: {
  project: ProjectDetail;
  overview: ProjectOverview | null;
  id: string;
  archiving: boolean;
  onArchive: () => void;
}) {
  const currency = overview?.budget_currency ?? project.budget_currency;
  const assigned = overview?.budget_assigned ?? project.monthly_budget;
  const consumed = overview?.budget_consumed ?? 0;
  const budgetPct = pct(consumed, assigned);

  const chips: { label: string; value: string | null | undefined }[] = [
    { label: "Client niche", value: project.main_niche?.name },
    { label: "Project niche", value: project.project_niche?.name },
    { label: "Country", value: project.target_country?.name },
    { label: "Team lead", value: project.team_lead?.full_name },
    { label: "Assignee", value: project.assignee?.full_name },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="bg-[#1A1F4D] px-6 py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold tracking-tight">
                {project.name}
              </h2>
              <StatusBadge status={project.status} />
              {project.is_archived && (
                <span className="rounded bg-white/15 px-2 py-0.5 text-xs uppercase tracking-wide text-white/80">
                  Archived
                </span>
              )}
            </div>
            {project.due_date && (
              <p className="mt-1 text-sm text-white/70">
                Due {formatDate(project.due_date)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
            <button
              type="button"
              onClick={onArchive}
              disabled={archiving}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              {project.is_archived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              {project.is_archived ? "Unarchive" : "Archive"}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
        {/* Chips */}
        <div className="flex flex-wrap gap-2">
          {chips
            .filter((c) => c.value)
            .map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs"
              >
                <span className="font-medium uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </span>
                <span className="font-medium text-foreground">{c.value}</span>
              </span>
            ))}
        </div>

        {/* Budget progress */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-[#1A1F4D]">Budget consumed</span>
            <span className="text-muted-foreground">
              {formatBudget(consumed, currency)} /{" "}
              {formatBudget(assigned, currency)}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== *
 * Overview tab
 * ================================================================== */

function OverviewTab({
  overview,
  loading,
  error,
  onRetry,
}: {
  overview: ProjectOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-6">
      <OverviewMetrics
        overview={overview}
        loading={loading}
        error={error}
        onRetry={onRetry}
      />
    </div>
  );
}

function OverviewMetrics({
  overview,
  loading,
  error,
  onRetry,
}: {
  overview: ProjectOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading && !overview) {
    return <p className="text-sm text-muted-foreground">Loading metrics…</p>;
  }
  if (error && !overview) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }
  if (!overview) return null;

  const o = overview;
  const cur = o.budget_currency;
  const linksPct = pct(o.published_links, o.target_links);

  return (
    <div className="space-y-6">
      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Budget Assigned"
          value={formatBudget(o.budget_assigned, cur)}
        />
        <StatCard
          icon={CreditCard}
          label="Budget Consumed"
          value={formatBudget(o.budget_consumed, cur)}
          sublabel={`${formatBudget(o.budget_pending, cur)} pending`}
        />
        <StatCard
          icon={Wallet}
          label="Budget Remaining"
          value={formatBudget(o.budget_remaining, cur)}
        />
        <StatCard
          icon={Users}
          label="Team Size"
          value={o.team_size}
        />
        <StatCard
          icon={FileText}
          label="Links Published"
          value={`${o.published_links} / ${o.target_links}`}
          sublabel={`${o.total_links} total`}
        />
        <StatCard
          icon={FileText}
          label="Pending Links"
          value={o.pending_links}
          sublabel={`${o.rejected_links} rejected`}
        />
        <StatCard icon={Globe} label="Websites Used" value={o.websites_used} />
        <StatCard
          icon={CheckSquare}
          label="Tasks Completed"
          value={`${o.tasks_completed} / ${o.tasks_total}`}
        />
        <StatCard
          icon={FileBarChart}
          label="Cost per Link"
          value={o.cost_per_link != null ? formatBudget(o.cost_per_link, cur) : "—"}
        />
        <StatCard
          icon={FileBarChart}
          label="Cost per Website"
          value={
            o.cost_per_website != null
              ? formatBudget(o.cost_per_website, cur)
              : "—"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Budget health */}
        <Panel title="Budget health">
          <ProgressBar
            label="Consumed"
            value={o.budget_consumed}
            total={o.budget_assigned}
            display={`${formatBudget(o.budget_consumed, cur)} / ${formatBudget(
              o.budget_assigned,
              cur,
            )}`}
          />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <MiniStat
              label="Consumed"
              value={formatBudget(o.budget_consumed, cur)}
            />
            <MiniStat
              label="Pending"
              value={formatBudget(o.budget_pending, cur)}
            />
            <MiniStat
              label="Remaining"
              value={formatBudget(o.budget_remaining, cur)}
            />
          </div>
        </Panel>

        {/* Links funnel */}
        <Panel title="Links funnel">
          <div className="space-y-2.5">
            <FunnelBar
              label="Target"
              value={o.target_links}
              max={o.target_links}
              tone="bg-slate-300"
            />
            <FunnelBar
              label="Total"
              value={o.total_links}
              max={o.target_links}
              tone="bg-primary/50"
            />
            <FunnelBar
              label="Published"
              value={o.published_links}
              max={o.target_links}
              tone="bg-primary"
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {linksPct.toFixed(0)}% of the link target is published.
          </p>
        </Panel>
      </div>
    </div>
  );
}

/* ================================================================== *
 * Budget tab — preserves the existing goals + budgets editors
 * ================================================================== */

function BudgetTab({
  project,
  goals,
  budgets,
  overview,
  overviewLoading,
  onSaveGoal,
  onSaveBudget,
}: {
  project: ProjectDetail;
  goals: MonthlyGoal[];
  budgets: MonthlyBudget[];
  overview: ProjectOverview | null;
  overviewLoading: boolean;
  onSaveGoal: (month: number, value: number) => Promise<void>;
  onSaveBudget: (month: number, value: number) => Promise<void>;
}) {
  const cur = overview?.budget_currency ?? project.budget_currency;
  return (
    <div className="space-y-6">
      {/* Summary row */}
      {overview ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Assigned"
            value={formatBudget(overview.budget_assigned, cur)}
          />
          <StatCard
            label="Consumed"
            value={formatBudget(overview.budget_consumed, cur)}
          />
          <StatCard
            label="Pending"
            value={formatBudget(overview.budget_pending, cur)}
          />
          <StatCard
            label="Remaining"
            value={formatBudget(overview.budget_remaining, cur)}
          />
        </div>
      ) : overviewLoading ? (
        <p className="text-sm text-muted-foreground">Loading summary…</p>
      ) : null}

      <GoalsGrid
        year={project.current_year}
        goals={goals}
        onSave={onSaveGoal}
      />
      <BudgetsGrid
        year={project.current_year}
        budgets={budgets}
        currency={cur}
        onSave={onSaveBudget}
      />
    </div>
  );
}

/* ================================================================== *
 * Links tab
 * ================================================================== */

function LinksTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<GuestPostListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listGuestPosts({
        project_id: projectId,
        page,
        page_size: LIST_PAGE_SIZE,
        sort: "-created_at",
      });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      setError(errMsg(err, "Unable to load links."));
    } finally {
      setLoading(false);
    }
  }, [projectId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleBulkCreated(result: BulkLinksResult) {
    setBulkOpen(false);
    setBulkSuccess(
      `Added ${result.created} link${result.created === 1 ? "" : "s"}, ` +
        `${result.payments_requested} payment request${
          result.payments_requested === 1 ? "" : "s"
        }.`,
    );
    setPage(1);
    void load();
  }

  return (
    <TabSection
      title="Guest post links"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setBulkSuccess(null);
              setBulkOpen(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            <ListPlus className="h-4 w-4" />
            Bulk add
          </button>
          <AddButton
            href={`/guest-posts/new?project_id=${projectId}`}
            label="Add link"
          />
        </div>
      }
    >
      {bulkSuccess && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          <span>{bulkSuccess}</span>
          <button
            type="button"
            onClick={() => setBulkSuccess(null)}
            className="shrink-0 rounded-md p-0.5 text-green-700 hover:bg-green-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <LoadingRow />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState message="No links on this project yet." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Website</th>
                  <th className="px-4 py-3 font-medium">Link URL</th>
                  <th className="px-4 py-3 font-medium">DA / PA / DR</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Published</th>
                  <th className="px-4 py-3 font-medium">Added By</th>
                  <th className="px-4 py-3 text-right font-medium">Cost</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((gp) => (
                  <tr
                    key={gp.id}
                    className="border-b border-border last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/guest-posts/${gp.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {gp.website_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {gp.live_link ? (
                        <a
                          href={gp.live_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-[16rem] items-center gap-1 text-primary hover:underline"
                          title={gp.live_link}
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{gp.live_link}</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {gp.da ?? "—"} / {gp.pa ?? "—"} / {gp.dr ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <GuestPostStatusBadge status={gp.status} />
                        {gp.review_status && gp.review_status !== "draft" && (
                          <ReviewStatusBadge status={gp.review_status} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(gp.live_link_date)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {gp.added_by?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {gp.price != null ? formatBudget(gp.price, "USD") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <RequestPaymentButton guestPostId={gp.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pages={pages}
            total={total}
            noun="link"
            onPage={setPage}
          />
        </>
      )}

      {bulkOpen && (
        <BulkAddLinksModal
          projectId={projectId}
          onClose={() => setBulkOpen(false)}
          onCreated={handleBulkCreated}
        />
      )}
    </TabSection>
  );
}

/**
 * Per-row "Request payment" action: raises a pending payment for the link
 * (defaulting the amount to the link's own price) and shows a brief success
 * state. Surfaces a friendly message on a 403.
 */
function RequestPaymentButton({ guestPostId }: { guestPostId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleRequest() {
    setErr(null);
    setBusy(true);
    try {
      await requestGuestPostPayment(guestPostId);
      setDone(true);
    } catch (e) {
      setErr(
        e instanceof ApiError && e.status === 403
          ? "You can't request payment for this link."
          : errMsg(e, "Unable to request payment for this link."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        Payment requested ✓
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRequest}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
        title="Request payment for this link"
      >
        <CreditCard className="h-3.5 w-3.5" />
        {busy ? "Requesting…" : "Request payment"}
      </button>
      {err && (
        <span role="alert" className="text-right text-xs text-destructive">
          {err}
        </span>
      )}
    </div>
  );
}

/* ================================================================== *
 * Websites tab
 * ================================================================== */

function WebsitesTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<WebsiteUsedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getProjectWebsites(projectId));
    } catch (err) {
      setError(errMsg(err, "Unable to load websites."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TabSection title="Websites used">
      {loading ? (
        <LoadingRow />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState message="No websites have been used on this project yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Website</th>
                <th className="px-4 py-3 text-right font-medium">Links</th>
                <th className="px-4 py-3 text-right font-medium">Published</th>
                <th className="px-4 py-3 text-right font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr
                  key={w.website}
                  className="border-b border-border last:border-0 hover:bg-accent/40"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {w.website}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {w.links}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {w.published}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatBudget(w.spend, "USD")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TabSection>
  );
}

/* ================================================================== *
 * Payments tab
 * ================================================================== */

function PaymentsTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<PaymentListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPayments({
        project_id: projectId,
        page,
        page_size: LIST_PAGE_SIZE,
        sort: "-created_at",
      });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      setError(errMsg(err, "Unable to load payments."));
    } finally {
      setLoading(false);
    }
  }, [projectId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TabSection
      title="Payments"
      action={
        <AddButton
          href={`/payments/new?project_id=${projectId}`}
          label="Add / Request payment"
        />
      }
    >
      {loading ? (
        <LoadingRow />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState message="No payments on this project yet." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Website</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Attributed to</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(p.payment_date ?? p.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/payments/${p.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {p.website_domain ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.attributed_to?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {p.amount != null
                        ? formatBudget(p.amount, p.currency)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pages={pages}
            total={total}
            noun="payment"
            onPage={setPage}
          />
        </>
      )}
    </TabSection>
  );
}

/* ================================================================== *
 * Tasks tab
 * ================================================================== */

function TasksTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<TaskListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTasks({
        project_id: projectId,
        page,
        page_size: LIST_PAGE_SIZE,
        sort: "-created_at",
      });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      setError(errMsg(err, "Unable to load tasks."));
    } finally {
      setLoading(false);
    }
  }, [projectId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TabSection
      title="Tasks"
      action={
        <AddButton
          href={`/tasks/new?project_id=${projectId}`}
          label="Add task"
        />
      }
    >
      {loading ? (
        <LoadingRow />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState message="No tasks on this project yet." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Assignee</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Due date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/tasks/${t.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.assigned_to?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <TaskStatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(t.due_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pages={pages}
            total={total}
            noun="task"
            onPage={setPage}
          />
        </>
      )}
    </TabSection>
  );
}

/* ================================================================== *
 * Activity tab
 * ================================================================== */

/** Turn `payment.paid` into "Payment paid". */
function humanizeAction(action: string): string {
  const words = action.replace(/[._]/g, " ").trim().split(/\s+/);
  if (words.length === 0) return action;
  const [first, ...rest] = words;
  const head = (first ?? "").charAt(0).toUpperCase() + (first ?? "").slice(1);
  return [head, ...rest].join(" ");
}

const ACTIVITY_MODULE_CLS: Record<string, string> = {
  project: "bg-primary/10 text-primary",
  payment: "bg-green-100 text-green-700",
  client: "bg-indigo-100 text-indigo-700",
  website: "bg-sky-100 text-sky-700",
  task: "bg-amber-100 text-amber-700",
  guest_post: "bg-violet-100 text-violet-700",
  user: "bg-rose-100 text-rose-700",
};

function ActivityTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<AuditLogRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getProjectActivity(projectId, 40));
    } catch (err) {
      setError(errMsg(err, "Unable to load activity."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TabSection title="Activity">
      {loading ? (
        <LoadingRow />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState message="No recorded activity for this project yet." />
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <ul className="space-y-5">
            {items.map((entry) => {
              const name = entry.user?.full_name ?? "System";
              const moduleCls =
                ACTIVITY_MODULE_CLS[entry.module] ??
                "bg-slate-100 text-slate-600";
              return (
                <li key={entry.id} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {initials(name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {humanizeAction(entry.action)}
                      </p>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${moduleCls}`}
                      >
                        {entry.module.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {name}
                      {" · "}
                      <span title={formatDate(entry.created_at)}>
                        {relativeTime(entry.created_at) ||
                          formatDate(entry.created_at)}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </TabSection>
  );
}

/* ================================================================== *
 * Reports tab
 * ================================================================== */

function ReportsTab({
  projectId,
  overview,
  overviewLoading,
  overviewError,
  onRetryOverview,
}: {
  projectId: string;
  overview: ProjectOverview | null;
  overviewLoading: boolean;
  overviewError: string | null;
  onRetryOverview: () => void;
}) {
  const [websites, setWebsites] = useState<WebsiteUsedItem[]>([]);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [websitesError, setWebsitesError] = useState<string | null>(null);

  const loadWebsites = useCallback(async () => {
    setWebsitesLoading(true);
    setWebsitesError(null);
    try {
      setWebsites(await getProjectWebsites(projectId));
    } catch (err) {
      setWebsitesError(errMsg(err, "Unable to load website breakdown."));
    } finally {
      setWebsitesLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadWebsites();
  }, [loadWebsites]);

  if (overviewLoading && !overview) {
    return <p className="text-sm text-muted-foreground">Loading report…</p>;
  }
  if (overviewError && !overview) {
    return <ErrorState message={overviewError} onRetry={onRetryOverview} />;
  }
  if (!overview) return null;

  const o = overview;
  const cur = o.budget_currency;
  const linksPct = pct(o.published_links, o.target_links);
  const topWebsites = [...websites]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Link performance for this project.
        </p>
        <Link
          href={`/reports?project_id=${projectId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          <FileBarChart className="h-4 w-4" />
          Full reports
        </Link>
      </div>

      {/* Cost highlights */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Published"
          value={`${o.published_links} / ${o.target_links}`}
          sublabel={`${linksPct.toFixed(0)}% of target`}
        />
        <StatCard label="Total links" value={o.total_links} />
        <StatCard
          label="Cost per Link"
          value={
            o.cost_per_link != null ? formatBudget(o.cost_per_link, cur) : "—"
          }
        />
        <StatCard
          label="Cost per Website"
          value={
            o.cost_per_website != null
              ? formatBudget(o.cost_per_website, cur)
              : "—"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Target vs published */}
        <Panel title="Target vs published">
          <ProgressBar
            label="Published"
            value={o.published_links}
            total={o.target_links}
            display={`${o.published_links} / ${o.target_links}`}
          />
        </Panel>

        {/* Status breakdown */}
        <Panel title="Status breakdown">
          <div className="space-y-2.5">
            <FunnelBar
              label="Published"
              value={o.published_links}
              max={o.total_links}
              tone="bg-green-500"
            />
            <FunnelBar
              label="Pending"
              value={o.pending_links}
              max={o.total_links}
              tone="bg-amber-400"
            />
            <FunnelBar
              label="Rejected"
              value={o.rejected_links}
              max={o.total_links}
              tone="bg-red-400"
            />
          </div>
        </Panel>
      </div>

      {/* Top websites by spend */}
      <Panel title="Top websites by spend">
        {websitesLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : websitesError ? (
          <ErrorState message={websitesError} onRetry={loadWebsites} />
        ) : topWebsites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No website spend yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Website</th>
                  <th className="py-2 pr-4 text-right font-medium">Links</th>
                  <th className="py-2 text-right font-medium">Spend</th>
                </tr>
              </thead>
              <tbody>
                {topWebsites.map((w) => (
                  <tr key={w.website} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-medium text-foreground">
                      {w.website}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">
                      {w.links}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {formatBudget(w.spend, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ================================================================== *
 * Shared presentational helpers
 * ================================================================== */

function TabSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#1A1F4D]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function AddButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
    >
      <Plus className="h-4 w-4" />
      {label}
    </Link>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-[#1A1F4D]">{title}</h3>
      {children}
    </div>
  );
}

function ProgressBar({
  label,
  value,
  total,
  display,
}: {
  label: string;
  value: number;
  total: number;
  display: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{display}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct(value, total)}%` }}
        />
      </div>
    </div>
  );
}

function FunnelBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="font-medium text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${pct(value, max)}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-[#1A1F4D]">{value}</p>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-10 text-center">
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function Pagination({
  page,
  pages,
  total,
  noun,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  noun: string;
  onPage: (next: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {total} {noun}
        {total === 1 ? "" : "s"} · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page >= pages}
          className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Preserved editors: inline numeric cell, goals grid, budgets grid
 * ------------------------------------------------------------------ */

/**
 * Inline-editable numeric cell: click to edit, Enter/blur to save, Esc to
 * cancel. Surfaces a per-cell error if the save fails.
 */
function EditableNumberCell({
  value,
  onSave,
  prefix,
}: {
  value: number;
  onSave: (next: number) => Promise<void>;
  prefix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  async function commit() {
    const parsed = Number(draft);
    if (Number.isNaN(parsed) || parsed === value) {
      setEditing(false);
      setDraft(String(value));
      return;
    }
    setSaving(true);
    setErr(false);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch {
      setErr(true);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className="w-20 rounded border border-input bg-background px-2 py-1 text-right text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={`w-full rounded px-2 py-1 text-right text-sm hover:bg-accent ${
        err ? "text-destructive" : ""
      }`}
      title="Click to edit"
    >
      {prefix}
      {value}
    </button>
  );
}

function GoalsGrid({
  year,
  goals,
  onSave,
}: {
  year: number;
  goals: MonthlyGoal[];
  onSave: (month: number, value: number) => Promise<void>;
}) {
  const byMonth = (m: number) => goals.find((g) => g.month === m);
  return (
    <section className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold text-[#1A1F4D]">
          Monthly Goals · {year}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Click a target value to edit it.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-6 py-3 font-medium">Month</th>
              <th className="px-6 py-3 text-right font-medium">Target</th>
              <th className="px-6 py-3 text-right font-medium">Achieved</th>
              <th className="px-6 py-3 text-right font-medium">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const g = byMonth(m);
              return (
                <tr key={m} className="border-b border-border last:border-0">
                  <td className="px-6 py-2 font-medium">{monthLabel(m)}</td>
                  <td className="px-6 py-1.5 text-right">
                    <EditableNumberCell
                      value={g?.goal_target ?? 0}
                      onSave={(v) => onSave(m, v)}
                    />
                  </td>
                  <td className="px-6 py-2 text-right text-muted-foreground">
                    {g?.achieved ?? 0}
                  </td>
                  <td className="px-6 py-2 text-right text-muted-foreground">
                    {g?.remaining ?? 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BudgetsGrid({
  year,
  budgets,
  currency,
  onSave,
}: {
  year: number;
  budgets: MonthlyBudget[];
  currency: string;
  onSave: (month: number, value: number) => Promise<void>;
}) {
  const byMonth = (m: number) => budgets.find((b) => b.month === m);
  return (
    <section className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold text-[#1A1F4D]">
          Monthly Budget · {year}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Click a budget value to edit it.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-6 py-3 font-medium">Month</th>
              <th className="px-6 py-3 text-right font-medium">Budget</th>
              <th className="px-6 py-3 text-right font-medium">Spent</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const b = byMonth(m);
              return (
                <tr key={m} className="border-b border-border last:border-0">
                  <td className="px-6 py-2 font-medium">{monthLabel(m)}</td>
                  <td className="px-6 py-1.5 text-right">
                    <EditableNumberCell
                      value={b?.budget_amount ?? 0}
                      onSave={(v) => onSave(m, v)}
                      prefix="$"
                    />
                  </td>
                  <td className="px-6 py-2 text-right text-muted-foreground">
                    {formatBudget(b?.spent_amount ?? 0, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Team tab — assignee + lead cards plus the preserved member manager
 * ------------------------------------------------------------------ */

function TeamTab({
  project,
  projectId,
  members,
  onMembersChange,
}: {
  project: ProjectDetail;
  projectId: string;
  members: ProjectMember[];
  onMembersChange: (next: ProjectMember[]) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PersonCard
          label="Team lead"
          name={project.team_lead?.full_name ?? null}
        />
        <PersonCard
          label="Assignee"
          name={project.assignee?.full_name ?? null}
        />
      </div>
      <MembersSection
        projectId={projectId}
        members={members}
        onChange={onMembersChange}
      />
    </div>
  );
}

function PersonCard({
  label,
  name,
}: {
  label: string;
  name: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {name ? (
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {initials(name)}
          </span>
          <p className="text-sm font-medium text-foreground">{name}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Unassigned</p>
      )}
    </div>
  );
}

function MembersSection({
  projectId,
  members,
  onChange,
}: {
  projectId: string;
  members: ProjectMember[];
  onChange: (next: ProjectMember[]) => void;
}) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const u = await getUsers();
        if (active) setUsers(u);
      } catch {
        // Picker is optional; ignore failures.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const memberIds = new Set(members.map((m) => m.user_id));
  const addableUsers = users.filter((u) => !memberIds.has(u.id));

  async function handleAdd() {
    if (!selectedUser) return;
    setErr(null);
    setBusy(true);
    try {
      await addMember(projectId, selectedUser, roleLabel || null);
      const added = users.find((u) => u.id === selectedUser);
      onChange([
        ...members,
        {
          user_id: selectedUser,
          full_name: added?.full_name ?? "Unknown",
          role_label: roleLabel || null,
        },
      ]);
      setSelectedUser("");
      setRoleLabel("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Unable to add member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId: string) {
    setErr(null);
    setBusy(true);
    try {
      await removeMember(projectId, userId);
      onChange(members.filter((m) => m.user_id !== userId));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Unable to remove member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-sm font-semibold text-[#1A1F4D]">Members</h2>

      {members.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between py-2.5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials(m.full_name)}
                </span>
                <div>
                  <p className="text-sm font-medium">{m.full_name}</p>
                  {m.role_label && (
                    <p className="text-xs text-muted-foreground">
                      {m.role_label}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(m.user_id)}
                disabled={busy}
                className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add member */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select a user…</option>
          {addableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={roleLabel}
          onChange={(e) => setRoleLabel(e.target.value)}
          placeholder="Role (optional)"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || !selectedUser}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Add member
        </button>
      </div>

      {addableUsers.length === 0 && users.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          No users available to add.
        </p>
      )}

      {err && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {err}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Comments tab — preserved list + quick-add
 * ------------------------------------------------------------------ */

function CommentsSection({
  projectId,
  comments,
  onChange,
}: {
  projectId: string;
  comments: ProjectComment[];
  onChange: (next: ProjectComment[]) => void;
}) {
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = body.trim();
    if (trimmed === "") return;
    setErr(null);
    setPosting(true);
    try {
      const created = await addProjectComment(projectId, trimmed);
      onChange([created, ...comments]);
      setBody("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Unable to add comment.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-sm font-semibold text-[#1A1F4D]">Comments</h2>

      {/* Quick-add */}
      <div className="mt-4 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a comment…"
          disabled={posting}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAdd}
            disabled={posting || body.trim() === ""}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {posting ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>

      {err && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {err}
        </p>
      )}

      {/* List */}
      {comments.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {comments.map((c) => {
            const name = c.author?.full_name ?? "Unknown";
            return (
              <li key={c.id} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials(name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-medium">{name}</p>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(c.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
