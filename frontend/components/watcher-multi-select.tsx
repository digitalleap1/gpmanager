"use client";

/**
 * Simple, dependency-free CC-watcher picker.
 *
 * Renders the candidate users as a checkbox list inside a bordered, scrollable
 * box. Up to `max` may be selected; once the cap is reached the remaining
 * unchecked rows are disabled. The chosen payer can be excluded so a person is
 * never both the responsible payer and a CC watcher.
 */

import type { UserRef } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface WatcherCandidate {
  id: string;
  full_name: string;
}

interface WatcherMultiSelectProps {
  /** Candidate users to choose from. */
  users: WatcherCandidate[] | UserRef[];
  /** Currently selected watcher ids. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** User id to hide (e.g. the chosen payer), so they can't also be a watcher. */
  excludeId?: string | null;
  /** Maximum number of watchers (default 3). */
  max?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function WatcherMultiSelect({
  users,
  value,
  onChange,
  excludeId,
  max = 3,
  disabled,
  id,
  className,
}: WatcherMultiSelectProps) {
  const candidates = users.filter((u) => u.id !== excludeId);
  const atCap = value.length >= max;

  function toggle(userId: string, checked: boolean) {
    if (checked) {
      if (value.includes(userId) || atCap) return;
      onChange([...value, userId]);
    } else {
      onChange(value.filter((v) => v !== userId));
    }
  }

  return (
    <div className={className}>
      <div
        id={id}
        role="group"
        aria-label="CC watchers"
        className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-input bg-background p-2"
      >
        {candidates.length === 0 ? (
          <p className="px-1 py-1 text-xs text-muted-foreground">
            No people available.
          </p>
        ) : (
          candidates.map((u) => {
            const checked = value.includes(u.id);
            const rowDisabled = disabled || (!checked && atCap);
            return (
              <label
                key={u.id}
                className={cn(
                  "flex items-center gap-2 rounded px-1 py-0.5 text-sm",
                  rowDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-accent",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={rowDisabled}
                  onChange={(e) => toggle(u.id, e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                />
                <span className="truncate">{u.full_name}</span>
              </label>
            );
          })
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {value.length}/{max} selected · notified only
      </p>
    </div>
  );
}

export default WatcherMultiSelect;
