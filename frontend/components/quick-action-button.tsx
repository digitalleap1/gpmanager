"use client";

import {
  CheckSquare,
  CreditCard,
  FileBarChart,
  FolderPlus,
  Globe,
  Link2,
  MessageSquarePlus,
  Plus,
  Upload,
  UserCog,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  sublabel: string;
  href: string;
  icon: LucideIcon;
  /** Tailwind gradient/solid classes for the circular icon button. */
  color: string;
  /** Whether the current viewer is allowed to see this action. */
  visible: (ctx: RoleContext) => boolean;
}

interface RoleContext {
  isAdmin: boolean;
  isManager: boolean;
  /** A team_lead or a plain member (used to hide "Request Payment" from admins). */
  isMemberOrLead: boolean;
}

const ACTIONS: QuickAction[] = [
  {
    label: "Create Project",
    sublabel: "Start a new project",
    href: "/projects/new",
    icon: FolderPlus,
    color: "bg-gradient-to-br from-[#E6007E] to-[#b3005f]",
    visible: (c) => c.isManager,
  },
  {
    label: "Assign Project",
    sublabel: "Assign to a team",
    href: "/projects?assign=1",
    icon: UserPlus,
    color: "bg-gradient-to-br from-violet-500 to-violet-700",
    visible: (c) => c.isManager,
  },
  {
    label: "Add Website",
    sublabel: "New guest-post site",
    href: "/websites/new",
    icon: Globe,
    color: "bg-gradient-to-br from-sky-500 to-blue-700",
    visible: () => true,
  },
  {
    label: "Add Guest Post Link",
    sublabel: "Track a placement",
    href: "/guest-posts/new",
    icon: Link2,
    color: "bg-gradient-to-br from-cyan-500 to-teal-600",
    visible: () => true,
  },
  {
    label: "Request Payment",
    sublabel: "Submit for approval",
    href: "/payments/new",
    icon: CreditCard,
    color: "bg-gradient-to-br from-amber-500 to-orange-600",
    // team_lead + user only — hidden for admin-only viewers.
    visible: (c) => c.isMemberOrLead,
  },
  {
    label: "Add Comment",
    sublabel: "Note on a project",
    href: "/projects",
    icon: MessageSquarePlus,
    color: "bg-gradient-to-br from-emerald-500 to-green-700",
    visible: () => true,
  },
  {
    label: "Create Task",
    sublabel: "Assign work",
    href: "/tasks/new",
    icon: CheckSquare,
    color: "bg-gradient-to-br from-teal-500 to-emerald-700",
    visible: (c) => c.isManager,
  },
  {
    label: "Upload Excel/CSV",
    sublabel: "Bulk import data",
    href: "/imports",
    icon: Upload,
    color: "bg-gradient-to-br from-indigo-500 to-indigo-700",
    visible: (c) => c.isManager,
  },
  {
    label: "Add Team Member",
    sublabel: "Invite a user",
    href: "/users?create=1",
    icon: UserCog,
    color: "bg-gradient-to-br from-fuchsia-500 to-purple-700",
    visible: (c) => c.isAdmin,
  },
  {
    label: "Create Team",
    sublabel: "Group your people",
    href: "/teams?create=1",
    icon: Users,
    color: "bg-gradient-to-br from-purple-500 to-violet-800",
    visible: (c) => c.isAdmin,
  },
  {
    label: "Generate Report",
    sublabel: "Project & financials",
    href: "/reports",
    icon: FileBarChart,
    color: "bg-gradient-to-br from-rose-500 to-pink-700",
    visible: (c) => c.isManager,
  },
];

/**
 * Global floating "quick action" menu (premium SaaS style). Fixed at the
 * bottom-right on every authenticated page (via AppShell). The "+" button opens
 * a staggered, glassmorphic card stack of role-filtered actions above it.
 * Toggle with the keyboard ("Q"); Escape closes. Hidden on /login.
 */
export function QuickActionButton() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Outside-click + Escape close while open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Global keyboard shortcut: press "Q" (when not typing) to toggle the menu.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      if (event.key === "q" || event.key === "Q") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  if (!user || pathname === "/login") return null;

  const ctx: RoleContext = {
    isAdmin: user.is_superuser || user.roles.includes("admin"),
    isManager:
      user.is_superuser ||
      user.roles.includes("admin") ||
      user.roles.includes("team_lead"),
    isMemberOrLead:
      user.roles.includes("team_lead") || user.roles.includes("user"),
  };

  const actions = ACTIONS.filter((a) => a.visible(ctx));
  if (actions.length === 0) return null;

  return (
    <>
      {/* Glassmorphic scrim — click to close. */}
      <div
        aria-hidden="true"
        onClick={close}
        className={cn(
          "fixed inset-0 z-40 bg-[#1A1F4D]/30 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <div
        ref={containerRef}
        className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3"
      >
        {/* Action card stack (above the button). Always mounted for smooth
            staggered transitions; only interactive while open. */}
        <ul
          id="quick-action-menu"
          role="menu"
          aria-label="Quick actions"
          className="flex flex-col items-end gap-2.5"
        >
          {actions.map((action, index) => {
            const Icon = action.icon;
            // Stagger from the bottom (nearest the FAB) upward when opening.
            const reverse = actions.length - 1 - index;
            const delay = open ? reverse * 35 : index * 25;
            return (
              <li key={action.label} role="none">
                <a
                  href={action.href}
                  role="menuitem"
                  ref={index === actions.length - 1 ? firstItemRef : undefined}
                  tabIndex={open ? 0 : -1}
                  title={`${action.label} — ${action.sublabel}`}
                  aria-hidden={!open}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelect(action.href);
                  }}
                  style={{ transitionDelay: `${delay}ms` }}
                  className={cn(
                    "group flex items-center justify-end gap-3 outline-none transition-all duration-300 ease-out focus-visible:scale-[1.02]",
                    open
                      ? "pointer-events-auto translate-y-0 opacity-100"
                      : "pointer-events-none translate-y-3 opacity-0",
                  )}
                >
                  {/* Label pill */}
                  <span className="flex flex-col rounded-xl border border-border/60 bg-card/90 px-3.5 py-1.5 text-right shadow-lg backdrop-blur-md transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/40">
                    <span className="text-sm font-semibold leading-tight text-foreground">
                      {action.label}
                    </span>
                    <span className="text-[11px] leading-tight text-muted-foreground">
                      {action.sublabel}
                    </span>
                  </span>
                  {/* Colored circular icon */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-lg ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-110 group-active:scale-95",
                      action.color,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>

        {/* The FAB */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close quick actions" : "Open quick actions (shortcut: Q)"}
          title={open ? "Close" : "Quick actions (Q)"}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="quick-action-menu"
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#E6007E] to-[#c0006a] text-white shadow-xl shadow-[#E6007E]/30 ring-4 ring-white/40 transition-all duration-300 ease-out hover:scale-105 hover:shadow-[#E6007E]/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#E6007E]/40 active:scale-95 dark:ring-white/10",
          )}
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            <Plus
              aria-hidden="true"
              className={cn(
                "absolute h-6 w-6 transition-all duration-300 ease-out",
                open ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
              )}
            />
            <X
              aria-hidden="true"
              className={cn(
                "absolute h-6 w-6 transition-all duration-300 ease-out",
                open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
              )}
            />
          </span>
        </button>
      </div>
    </>
  );
}

export default QuickActionButton;
