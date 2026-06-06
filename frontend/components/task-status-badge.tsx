import { cn } from "@/lib/utils";

interface TaskStatusBadgeProps {
  status: string;
  className?: string;
}

/**
 * Status colours:
 *  - pending     → slate
 *  - in_progress → blue
 *  - completed   → green
 *  - overdue     → red
 */
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

/** Human-friendly label for a task status (e.g. `in_progress` → "In progress"). */
export function taskStatusLabel(status: string): string {
  const text = status.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Coloured pill for a task status. Falls back to a neutral style. */
export function TaskStatusBadge({ status, className }: TaskStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        style,
        className,
      )}
    >
      {taskStatusLabel(status)}
    </span>
  );
}

export default TaskStatusBadge;
