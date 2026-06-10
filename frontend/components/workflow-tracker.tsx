"use client";

import { Check } from "lucide-react";

import {
  WORKFLOW_BRANCH_STATES,
  WORKFLOW_PIPELINE,
  WORKFLOW_PIPELINE_SHORT,
  workflowLabel,
} from "@/lib/gp-workflow";
import { cn } from "@/lib/utils";

interface WorkflowTrackerProps {
  status: string;
}

/**
 * Map a (possibly branch) workflow status onto the linear pipeline so the
 * stepper can decide which stages are done. Branch states anchor to the stage
 * they logically sit between:
 *  - rejected / advance_requested / approved → around Under Review
 *  - payment_verification                    → around Payment Sent
 */
function anchorIndex(status: string): number {
  const direct = WORKFLOW_PIPELINE.indexOf(status);
  if (direct !== -1) return direct;

  const reviewIdx = WORKFLOW_PIPELINE.indexOf("review_pending");
  const paymentSentIdx = WORKFLOW_PIPELINE.indexOf("payment_sent");
  switch (status) {
    case "rejected":
    case "advance_requested":
    case "approved":
      return reviewIdx;
    case "payment_verification":
      return paymentSentIdx;
    default:
      return 0;
  }
}

/** Distinct accent for each branch state's badge. */
const BRANCH_BADGE_STYLES: Record<string, string> = {
  rejected: "bg-red-100 text-red-700 ring-red-200",
  advance_requested: "bg-amber-100 text-amber-800 ring-amber-200",
  payment_verification: "bg-amber-100 text-amber-800 ring-amber-200",
};

/**
 * A clean navy-themed stage stepper for the guest-post project pipeline.
 * The current stage is brand-pink, completed stages are checked, and future
 * stages are muted. Horizontal from `md+`, a vertical stack on mobile. When the
 * post is in a branch state (rejected / advance requested / payment
 * verification) a distinct badge is shown above the track.
 */
export function WorkflowTracker({ status }: WorkflowTrackerProps) {
  const isBranch = WORKFLOW_BRANCH_STATES.includes(status);
  const currentIndex = WORKFLOW_PIPELINE.indexOf(status);
  const anchor = anchorIndex(status);

  return (
    <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#1A1F4D]">
          Project workflow
        </h2>
        {isBranch && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1",
              BRANCH_BADGE_STYLES[status] ??
                "bg-muted text-muted-foreground ring-border",
            )}
          >
            {workflowLabel(status)}
          </span>
        )}
      </div>

      <ol className="mt-5 flex flex-col gap-4 md:flex-row md:items-start md:gap-0">
        {WORKFLOW_PIPELINE.map((stage, i) => {
          // A stage is "current" only when it exactly matches a pipeline state.
          const isCurrent = !isBranch && i === currentIndex;
          // Past = before the anchor, or (for branch states) up to & including
          // the anchor stage, which has already been reached.
          const isDone = isBranch ? i <= anchor : i < anchor;
          const isLast = i === WORKFLOW_PIPELINE.length - 1;
          const label = WORKFLOW_PIPELINE_SHORT[stage] ?? workflowLabel(stage);

          return (
            <li
              key={stage}
              className="flex items-center gap-3 md:flex-1 md:flex-col md:gap-2 md:text-center"
            >
              <div className="flex items-center md:w-full md:flex-col">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 transition-colors",
                    isCurrent
                      ? "bg-primary text-primary-foreground ring-primary"
                      : isDone
                        ? "bg-[#1A1F4D] text-white ring-[#1A1F4D]"
                        : "bg-muted text-muted-foreground ring-border",
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isDone ? <Check className="h-4 w-4" /> : i + 1}
                </span>

                {/* Connector: horizontal on md+, hidden on the last node. */}
                {!isLast && (
                  <span
                    className={cn(
                      "hidden h-px flex-1 md:block",
                      isDone ? "bg-[#1A1F4D]" : "bg-border",
                    )}
                  />
                )}
              </div>

              <span
                className={cn(
                  "text-xs leading-tight md:px-1",
                  isCurrent
                    ? "font-semibold text-primary"
                    : isDone
                      ? "font-medium text-[#1A1F4D]"
                      : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default WorkflowTracker;
