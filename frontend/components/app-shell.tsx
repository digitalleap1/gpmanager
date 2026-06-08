"use client";

import {
  Building2,
  CheckSquare,
  CreditCard,
  FileBarChart,
  FileText,
  FolderKanban,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Route,
  ScrollText,
  ShieldCheck,
  Trash2,
  Upload,
  User as UserIcon,
  Users,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  managerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workflow", label: "Workflow Guide", icon: Route },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/guest-posts", label: "Guest Posts", icon: FileText },
  { href: "/websites", label: "Websites", icon: Globe },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/clients", label: "Clients", icon: Building2, managerOnly: true },
  { href: "/ledger", label: "Ledger", icon: Wallet, managerOnly: true },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/teams", label: "Teams", icon: UsersRound, adminOnly: true },
  {
    href: "/roles",
    label: "Roles & Permissions",
    icon: ShieldCheck,
    adminOnly: true,
  },
  { href: "/imports", label: "Imports", icon: Upload, adminOnly: true },
  { href: "/trash", label: "Trash", icon: Trash2, managerOnly: true },
  {
    href: "/audit-logs",
    label: "Audit Logs",
    icon: ScrollText,
    adminOnly: true,
  },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

interface AppShellProps {
  title?: string;
  children: ReactNode;
}

/** Derive up-to-two uppercase initials from a person's name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Authenticated chrome: fixed navy left sidebar + clean white top bar. Guards
 * auth — shows a loading state while the session resolves and redirects to
 * /login when there is no user. The sidebar collapses behind a hamburger
 * toggle below `lg`.
 */
export function AppShell({ title, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Redirect unauthenticated visitors once the session has resolved.
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const isAdmin = user.is_superuser || user.roles.includes("admin");
  const isManager =
    user.is_superuser ||
    user.roles.includes("admin") ||
    user.roles.includes("team_lead");
  const navItems = NAV_ITEMS.filter(
    (item) =>
      (!item.adminOnly || isAdmin) && (!item.managerOnly || isManager),
  );

  const sidebarNav = (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-white/60 hover:bg-white/10 hover:text-white",
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r-full bg-white/90"
                style={{ width: 3 }}
              />
            )}
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const userInitials = initialsOf(user.full_name);

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#1A1F4D] lg:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Link href="/dashboard" aria-label="Digital Leap — Dashboard">
            <Logo light />
          </Link>
        </div>
        {sidebarNav}
        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Digital Leap
          </p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-[#1A1F4D]">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
              <Link href="/dashboard" aria-label="Digital Leap — Dashboard">
                <Logo light />
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarNav}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            {title && (
              <h1 className="text-lg font-semibold tracking-tight text-[#1A1F4D]">
                {title}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell />

            <div className="hidden items-center gap-2.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 sm:flex">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                aria-hidden="true"
              >
                {userInitials}
              </span>
              <span className="max-w-[10rem] truncate text-sm font-medium text-foreground">
                {user.full_name}
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
