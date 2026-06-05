import { cn } from "@/lib/utils";

interface GuestPostStatusBadgeProps {
  status: string;
  className?: string;
}

/**
 * Group colours:
 *  - prospect / contacted / negotiating → neutral blue
 *  - accepted / invoice_sent / paid     → amber / indigo
 *  - published                          → green
 *  - rejected                           → red
 */
const STATUS_STYLES: Record<string, string> = {
  prospect: "bg-blue-50 text-blue-700",
  contacted: "bg-blue-100 text-blue-700",
  negotiating: "bg-sky-100 text-sky-700",
  accepted: "bg-amber-100 text-amber-700",
  invoice_sent: "bg-indigo-100 text-indigo-700",
  paid: "bg-indigo-100 text-indigo-800",
  published: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

/** Human-friendly label for a status (e.g. `invoice_sent` → "Invoice sent"). */
export function guestPostStatusLabel(status: string): string {
  const text = status.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Coloured pill for a guest-post status. Falls back to a neutral style. */
export function GuestPostStatusBadge({
  status,
  className,
}: GuestPostStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        style,
        className,
      )}
    >
      {guestPostStatusLabel(status)}
    </span>
  );
}

export default GuestPostStatusBadge;
