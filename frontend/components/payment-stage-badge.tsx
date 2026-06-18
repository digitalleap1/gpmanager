import { paymentCaseLabel, requestStageLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Small coloured pills for a payment's assignment workflow: the case (kind of
 * payment) and the request stage. Same shape/sizing as PaymentStatusBadge.
 */

const CASE_STYLES: Record<string, string> = {
  standard: "bg-slate-100 text-slate-700",
  advance: "bg-violet-100 text-violet-700",
  reversal: "bg-orange-100 text-orange-700",
  other: "bg-zinc-100 text-zinc-700",
};

const STAGE_STYLES: Record<string, string> = {
  assigned: "bg-blue-100 text-blue-700",
  submitted: "bg-amber-100 text-amber-700",
  verified: "bg-green-100 text-green-700",
  returned: "bg-red-100 text-red-700",
};

const pillClass =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

/** Coloured pill for a payment case (Standard / Advance / Reversal / Other). */
export function PaymentCaseBadge({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const style = CASE_STYLES[value] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn(pillClass, style, className)}>
      {paymentCaseLabel(value)}
    </span>
  );
}

/** Coloured pill for a request stage. Renders nothing when the stage is null. */
export function RequestStageBadge({
  value,
  className,
}: {
  value: string | null;
  className?: string;
}) {
  if (!value) return null;
  const style = STAGE_STYLES[value] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn(pillClass, style, className)}>
      {requestStageLabel(value)}
    </span>
  );
}
