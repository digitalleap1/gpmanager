import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type StatAccent =
  | "brand"
  | "blue"
  | "green"
  | "amber"
  | "violet"
  | "rose"
  | "cyan"
  | "slate";

/** Per-accent gradient for the icon tile, a hover glow colour, and a decorative
 * corner blob — gives the otherwise-uniform tiles some life + variety. */
const ACCENTS: Record<StatAccent, { icon: string; glow: string; blob: string }> = {
  brand: { icon: "from-[#E6007E] to-[#b30062]", glow: "hover:shadow-[#E6007E]/25", blob: "bg-[#E6007E]" },
  blue: { icon: "from-sky-500 to-blue-600", glow: "hover:shadow-blue-500/25", blob: "bg-blue-500" },
  green: { icon: "from-emerald-500 to-green-600", glow: "hover:shadow-emerald-500/25", blob: "bg-emerald-500" },
  amber: { icon: "from-amber-400 to-orange-500", glow: "hover:shadow-amber-500/25", blob: "bg-amber-500" },
  violet: { icon: "from-violet-500 to-purple-600", glow: "hover:shadow-violet-500/25", blob: "bg-violet-500" },
  rose: { icon: "from-rose-500 to-pink-600", glow: "hover:shadow-rose-500/25", blob: "bg-rose-500" },
  cyan: { icon: "from-cyan-500 to-teal-600", glow: "hover:shadow-cyan-500/25", blob: "bg-cyan-500" },
  slate: { icon: "from-slate-500 to-slate-700", glow: "hover:shadow-slate-500/25", blob: "bg-slate-500" },
};

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: LucideIcon;
  /** Colour theme for the icon tile + hover glow + corner blob. */
  accent?: StatAccent;
  /** When set, the whole card becomes a link. */
  href?: string;
  className?: string;
}

/**
 * Compact, lively metric tile: a gradient icon chip, a small uppercase label, a
 * prominent value, plus a decorative corner glow. Lifts + glows on hover; the
 * icon scales. When `href` is set the whole tile is a link.
 */
export function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  accent = "brand",
  href,
  className,
}: StatCardProps) {
  const a = ACCENTS[accent];

  const content = (
    <>
      {/* decorative corner glow */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-90",
          a.blob,
        )}
      />
      <div className="relative">
        {Icon && (
          <div
            className={cn(
              "mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3",
              a.icon,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-xl font-bold leading-tight tracking-tight text-[#1A1F4D]">
          {value}
        </p>
        {sublabel && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {sublabel}
          </p>
        )}
      </div>
    </>
  );

  const base = cn(
    "group relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card to-muted/40 p-4 text-card-foreground shadow-sm transition-all duration-300",
    "hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg",
    a.glow,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {content}
      </Link>
    );
  }

  return <div className={cn(base, className)}>{content}</div>;
}

export default StatCard;
