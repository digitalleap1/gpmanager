"use client";

import {
  Building2,
  CreditCard,
  FileBarChart,
  FileText,
  FolderKanban,
  Globe,
  Route,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatCurrency } from "@/lib/utils";
import { listClients } from "@/services/client-service";
import { listGuestPosts } from "@/services/guest-post-service";
import { getLedgerStats, listPayments } from "@/services/payment-service";
import { listProjects } from "@/services/project-service";
import { listWebsites } from "@/services/website-service";

/** A single bucket of live counts, populated on mount via Promise.allSettled. */
interface WorkflowCounts {
  clients: number | null;
  projects: number | null;
  websites: number | null;
  guestPosts: number | null;
  payments: number | null;
  revenue: string | null;
}

const EMPTY_COUNTS: WorkflowCounts = {
  clients: null,
  projects: null,
  websites: null,
  guestPosts: null,
  payments: null,
  revenue: null,
};

/** Which count (if any) a stage card surfaces, plus how to label it. */
type CountKey = keyof WorkflowCounts;

interface Stage {
  /** Stable key for React lists. */
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
  todo: string[];
  href: string;
  /** Count to read from the fetched bucket; omit for stages without one. */
  countKey?: CountKey;
  /** Word that follows the count, e.g. "clients", "revenue". */
  countNoun?: string;
  /** Only render for admins (e.g. team setup). */
  adminOnly?: boolean;
  /** Optional subtle tip shown under the description. */
  tip?: string;
}

const STAGES: Stage[] = [
  {
    key: "team",
    icon: Users,
    title: "Set up your team",
    description: "Create team members, teams, and permissions.",
    todo: ["Add users", "Group them into teams", "Assign roles"],
    href: "/users",
    adminOnly: true,
  },
  {
    key: "client",
    icon: Building2,
    title: "Add a Client",
    description: "Onboard the client and set their budget & currency.",
    todo: ["Create a new client", "Set the total budget", "Choose a currency"],
    href: "/clients",
    countKey: "clients",
    countNoun: "clients",
  },
  {
    key: "project",
    icon: FolderKanban,
    title: "Create a Project",
    description:
      "Set niche, target country, monthly/weekly targets, and assign a team lead/member.",
    todo: [
      "Pick niche & target country",
      "Set monthly/weekly targets",
      "Assign a team lead & member",
    ],
    href: "/projects",
    countKey: "projects",
    countNoun: "projects",
  },
  {
    key: "websites",
    icon: Globe,
    title: "Build your Website list",
    description:
      "Add or import prospect/vendor websites with DA/DR/price/niche.",
    todo: ["Add or import websites", "Record DA/DR & price", "Tag by niche"],
    href: "/websites",
    countKey: "websites",
    countNoun: "websites",
  },
  {
    key: "guest-posts",
    icon: FileText,
    title: "Track Guest Posts",
    description: "Move each placement from prospect → contacted → published.",
    todo: [
      "Create a placement",
      "Advance its status",
      "Publish with the live link",
    ],
    href: "/guest-posts",
    countKey: "guestPosts",
    countNoun: "guest posts",
    tip: "Tip: paid live-links are tracked under Payments.",
  },
  {
    key: "payments",
    icon: CreditCard,
    title: "Record Payments",
    description: "Log each paid link: currency, amount, mode, status, invoice.",
    todo: ["Log amount & currency", "Set mode & status", "Attach the invoice"],
    href: "/payments",
    countKey: "payments",
    countNoun: "payments",
  },
  {
    key: "ledger",
    icon: Wallet,
    title: "Watch the Ledger",
    description:
      "Monitor revenue, pending/overdue, and budget consumed per client.",
    todo: [
      "Review revenue & pending",
      "Chase overdue invoices",
      "Track budget per client",
    ],
    href: "/ledger",
    countKey: "revenue",
    countNoun: "revenue",
  },
  {
    key: "reports",
    icon: FileBarChart,
    title: "Run Reports",
    description:
      "Pull project, financial, team, and guest-post reports; export to CSV/Excel.",
    todo: [
      "Pick a report type",
      "Filter the data",
      "Export to CSV/Excel",
    ],
    href: "/reports",
  },
];

/** Resolve a stage's display count from the fetched bucket, or null. */
function countFor(stage: Stage, counts: WorkflowCounts): string | null {
  if (!stage.countKey) return null;
  const value = counts[stage.countKey];
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value.toLocaleString() : value;
}

export default function WorkflowPage() {
  const { user } = useAuth();
  const isAdmin = Boolean(
    user && (user.is_superuser || user.roles.includes("admin")),
  );

  const [counts, setCounts] = useState<WorkflowCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);

      // Every count is best-effort: a single failure (e.g. a 403 for a
      // non-manager hitting /clients) must only hide that one badge, never
      // blank the page. We fetch them all in parallel and read the
      // fulfilled ones individually.
      const [
        clientsRes,
        projectsRes,
        websitesRes,
        guestPostsRes,
        paymentsRes,
        ledgerRes,
      ] = await Promise.allSettled([
        listClients(),
        listProjects({ page_size: 1 }),
        listWebsites({ page_size: 1 }),
        listGuestPosts({ page_size: 1 }),
        listPayments({ page_size: 1 }),
        getLedgerStats(),
      ]);

      if (!active) return;

      setCounts({
        clients:
          clientsRes.status === "fulfilled" ? clientsRes.value.length : null,
        projects:
          projectsRes.status === "fulfilled" ? projectsRes.value.total : null,
        websites:
          websitesRes.status === "fulfilled" ? websitesRes.value.total : null,
        guestPosts:
          guestPostsRes.status === "fulfilled"
            ? guestPostsRes.value.total
            : null,
        payments:
          paymentsRes.status === "fulfilled" ? paymentsRes.value.total : null,
        revenue:
          ledgerRes.status === "fulfilled"
            ? formatCurrency(ledgerRes.value.total_revenue)
            : null,
      });

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const stages = STAGES.filter((s) => !s.adminOnly || isAdmin);

  return (
    <AppShell title="Workflow Guide">
      <div className="space-y-8">
        {/* Intro card */}
        <section className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
          <div className="flex items-start gap-4 bg-[#1A1F4D] px-6 py-5 text-white">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary-foreground">
              <Route className="h-6 w-6 text-[#E6007E]" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                Guest Post Workflow
              </h2>
              <p className="mt-1 text-sm text-white/70">
                This is your end-to-end guest-post process. Follow the stages —
                each links to where you work.
              </p>
            </div>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground">
              Work top-to-bottom. The live count on each stage reflects what
              you have so far, so you can see exactly where to pick up.
            </p>
          </div>
        </section>

        {/* Process flow */}
        <ol className="relative space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 xl:grid-cols-3">
          {/* Mobile vertical connector line */}
          <span
            aria-hidden="true"
            className="absolute left-5 top-4 bottom-4 w-px bg-border lg:hidden"
          />
          {stages.map((stage, index) => {
            const count = countFor(stage, counts);
            const Icon = stage.icon;
            return (
              <li key={stage.key} className="relative pl-14 lg:pl-0">
                {/* Step badge — pink, numbered */}
                <span
                  className={cn(
                    "absolute left-0 top-1 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-sm ring-4 ring-muted/30",
                    "lg:-top-3 lg:left-4",
                  )}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>

                {/* Desktop chevron connector to the next card */}
                {index < stages.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-[-1.35rem] top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center text-border lg:flex"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                )}

                <div className="group h-full rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md lg:pt-7">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    {count !== null ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {count}
                        {stage.countNoun ? (
                          <span className="font-medium text-primary/80">
                            {stage.countNoun}
                          </span>
                        ) : null}
                      </span>
                    ) : stage.countKey && loading ? (
                      <span
                        className="h-6 w-16 animate-pulse rounded-full bg-muted"
                        aria-hidden="true"
                      />
                    ) : stage.countKey ? (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        —
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-4 text-base font-semibold text-[#1A1F4D]">
                    {stage.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stage.description}
                  </p>
                  {stage.tip && (
                    <p className="mt-2 text-xs font-medium text-primary/80">
                      {stage.tip}
                    </p>
                  )}

                  <ul className="mt-3 space-y-1.5">
                    {stage.todo.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm text-foreground"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E6007E]"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={stage.href}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary transition hover:gap-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Open
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </AppShell>
  );
}
