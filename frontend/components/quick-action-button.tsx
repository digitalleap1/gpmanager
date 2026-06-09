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
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
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
    href: "/projects/new",
    icon: FolderPlus,
    visible: (c) => c.isManager,
  },
  {
    label: "Assign Project",
    href: "/projects?assign=1",
    icon: UserPlus,
    visible: (c) => c.isManager,
  },
  {
    label: "Add Guest Post Website",
    href: "/websites/new",
    icon: Globe,
    visible: () => true,
  },
  {
    label: "Add Guest Post Link",
    href: "/guest-posts/new",
    icon: Link2,
    visible: () => true,
  },
  {
    label: "Request Payment",
    href: "/payments/new",
    icon: CreditCard,
    // team_lead + user only — hidden for admin-only viewers.
    visible: (c) => c.isMemberOrLead,
  },
  {
    label: "Add Comment",
    href: "/projects",
    icon: MessageSquarePlus,
    visible: () => true,
  },
  {
    label: "Create Task",
    href: "/tasks/new",
    icon: CheckSquare,
    visible: (c) => c.isManager,
  },
  {
    label: "Upload Excel/CSV",
    href: "/imports",
    icon: Upload,
    visible: (c) => c.isManager,
  },
  {
    label: "Add Team Member",
    href: "/users?create=1",
    icon: UserCog,
    visible: (c) => c.isAdmin,
  },
  {
    label: "Create Team",
    href: "/teams?create=1",
    icon: Users,
    visible: (c) => c.isAdmin,
  },
  {
    label: "Generate Report",
    href: "/reports",
    icon: FileBarChart,
    visible: (c) => c.isManager,
  },
];

/**
 * Global floating "quick action" button. Renders fixed at the bottom-right on
 * every authenticated page (via AppShell). Opens a role-filtered popover of
 * common create/actions above the button. Hidden on /login and when there is
 * no authenticated user.
 */
export function QuickActionButton() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  // Close on outside click and on Escape while open.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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

  // Move focus into the menu when it opens for keyboard users.
  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  // Close the menu whenever the route changes.
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

  // Don't render on the login screen or before the session resolves.
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
      {/* Light scrim — click to close. Sits below the FAB/menu. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#1A1F4D]/10 backdrop-blur-[1px]"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        ref={containerRef}
        className="fixed bottom-6 right-6 z-50 flex flex-col items-end"
      >
        {/* Menu (rendered ABOVE the button) */}
        <div
          id="quick-action-menu"
          role="menu"
          aria-label="Quick actions"
          className={cn(
            "mb-3 w-64 origin-bottom-right overflow-hidden rounded-xl border border-border bg-card shadow-xl transition-all duration-200 ease-out",
            open
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-2 scale-95 opacity-0",
          )}
        >
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quick actions
            </p>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto p-1.5">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <li key={action.label}>
                  <button
                    type="button"
                    role="menuitem"
                    ref={index === 0 ? firstItemRef : undefined}
                    tabIndex={open ? 0 : -1}
                    onClick={() => handleSelect(action.href)}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-primary/5 hover:text-primary focus:bg-primary/5 focus:text-primary focus:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    {action.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* The FAB */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close quick actions" : "Open quick actions"}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="quick-action-menu"
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform duration-200 ease-out hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 active:scale-95",
          )}
        >
          <Plus
            aria-hidden="true"
            className={cn(
              "h-6 w-6 transition-transform duration-300 ease-out",
              open && "rotate-[135deg]",
            )}
          />
        </button>
      </div>
    </>
  );
}

export default QuickActionButton;
