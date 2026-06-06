import { cn } from "@/lib/utils";

interface TaskPriorityBadgeProps {
  priority: string;
  className?: string;
}

/**
 * Priority colours:
 *  - low    → slate
 *  - medium → amber
 *  - high   → red
 */
const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

/** Human-friendly label for a task priority (e.g. `high` → "High"). */
export function taskPriorityLabel(priority: string): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

/** Coloured pill for a task priority. Falls back to a neutral style. */
export function TaskPriorityBadge({
  priority,
  className,
}: TaskPriorityBadgeProps) {
  const style = PRIORITY_STYLES[priority] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        style,
        className,
      )}
    >
      {taskPriorityLabel(priority)}
    </span>
  );
}

export default TaskPriorityBadge;
