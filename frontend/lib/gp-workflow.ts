/**
 * Shared constants for the guest-post project workflow state machine.
 *
 * The backend exposes `workflow_status` on every guest post (a richer pipeline
 * than the legacy outreach `status`). These labels + the linear pipeline order
 * are the single source of truth used by both the stage tracker and the
 * stage-history list — never duplicate the labels in a component.
 */

/** Human-friendly label for every known workflow status. */
export const WORKFLOW_LABELS: Record<string, string> = {
  research: "Research",
  review_pending: "Under Review",
  rejected: "Rejected",
  advance_requested: "Advance Payment Requested",
  approved: "Approved",
  content_writing: "Content Writing",
  content_ready: "Content Ready",
  sent_to_client: "Sent to Client",
  published: "Published / Live Link Received",
  payment_requested: "Payment Requested",
  payment_sent: "Payment Sent",
  payment_verification: "Payment Verification Pending",
  completed: "Completed",
};

/**
 * Best-effort label for a workflow status, falling back to a title-cased
 * version of the raw key (e.g. an unknown `foo_bar` → "Foo bar").
 */
export function workflowLabel(status: string): string {
  const known = WORKFLOW_LABELS[status];
  if (known) return known;
  const text = status.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The happy-path pipeline rendered by the stepper, in order. Branch states
 * (`rejected`, `advance_requested`, `payment_verification`, `approved`) are not
 * part of the linear track — they're surfaced as a badge by the tracker.
 */
export const WORKFLOW_PIPELINE: readonly string[] = [
  "research",
  "review_pending",
  "content_writing",
  "content_ready",
  "sent_to_client",
  "published",
  "payment_requested",
  "payment_sent",
  "completed",
];

/** Branch states that sit off the linear pipeline. */
export const WORKFLOW_BRANCH_STATES: readonly string[] = [
  "rejected",
  "advance_requested",
  "payment_verification",
];

/** Short labels used in the compact stepper (full labels can be long). */
export const WORKFLOW_PIPELINE_SHORT: Record<string, string> = {
  research: "Research",
  review_pending: "Under Review",
  content_writing: "Content Writing",
  content_ready: "Content Ready",
  sent_to_client: "Sent to Client",
  published: "Published",
  payment_requested: "Payment Requested",
  payment_sent: "Payment Sent",
  completed: "Completed",
};
