import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  /** Optional lucide icon shown in a brand-tinted rounded square. */
  icon?: LucideIcon;
  /** When set, the whole card becomes a link with a subtle hover lift. */
  href?: string;
  className?: string;
}

/**
 * Presentational metric card: a brand-tinted icon tile, an uppercase label, a
 * prominent value, and an optional sublabel. When `href` is provided the entire
 * card is wrapped in a `next/link` and gains a hover lift.
 */
export function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  href,
  className,
}: StatCardProps) {
  const content = (
    <>
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#1A1F4D]">
        {value}
      </p>
      {sublabel && (
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      )}
    </>
  );

  const base =
    "block rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm transition";

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {content}
      </Link>
    );
  }

  return <div className={cn(base, "hover:shadow-md", className)}>{content}</div>;
}

export default StatCard;
