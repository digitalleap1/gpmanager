import { cn } from "@/lib/utils";

interface PaymentStatusBadgeProps {
  status: string;
  className?: string;
}

/**
 * Status colours:
 *  - pending  → amber
 *  - approved → blue / indigo
 *  - paid     → green
 *  - failed   → red
 */
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-indigo-100 text-indigo-700",
  paid: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

/** Human-friendly label for a payment status (e.g. `paid` → "Paid"). */
export function paymentStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Coloured pill for a payment status. Falls back to a neutral style. */
export function PaymentStatusBadge({
  status,
  className,
}: PaymentStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        style,
        className,
      )}
    >
      {paymentStatusLabel(status)}
    </span>
  );
}

export default PaymentStatusBadge;
