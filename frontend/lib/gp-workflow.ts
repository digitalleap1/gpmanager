/**
 * Shared constants for the guest-post project workflow state machine.
 *
 * The backend exposes `workflow_status` on every guest post (a richer pipeline
 * than the legacy outreach `status`). These labels + the linear pipeline order
 * are the single source of truth used by both the stage tracker and the
 * stage-history list — never duplicate the labels in a component.
 *
 * The workflow is a per-ticket reassignment model: the guest post is a "ticket"
 * whose current assignee (`assigned_user`) flows between people as it moves
 * through the stages below.
 */

/** Human-friendly label for every known workflow status. */
export const WORKFLOW_LABELS: Record<string, string> = {
  research: "Research",
  review_pending: "Website Review Pending",
  rejected: "Website Rejected",
  content_writing: "Content Required",
  content_ready: "Content Ready",
  sent_to_client: "Sent to Client",
  verification_pending: "Verification Pending",
  verified: "Verified — Ready for Payment",
  verification_failed: "Verification Failed",
  advance_requested: "Advance Payment Requested",
  payment_requested: "Payment Requested",
  payment_sent: "Payment Sent",
  payment_recheck: "Payment Recheck Required",
  completed: "Project Completed",
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
 * (`rejected`, `verification_failed`, `advance_requested`, `payment_recheck`)
 * are not part of the linear track — they're surfaced as a badge by the
 * tracker.
 */
export const WORKFLOW_PIPELINE: readonly string[] = [
  "research",
  "review_pending",
  "content_writing",
  "content_ready",
  "sent_to_client",
  "verification_pending",
  "verified",
  "payment_requested",
  "payment_sent",
  "completed",
];

/** Branch states that sit off the linear pipeline. */
export const WORKFLOW_BRANCH_STATES: readonly string[] = [
  "rejected",
  "verification_failed",
  "advance_requested",
  "payment_recheck",
];

/** Short labels used in the compact stepper (full labels can be long). */
export const WORKFLOW_PIPELINE_SHORT: Record<string, string> = {
  research: "Research",
  review_pending: "Website Review",
  content_writing: "Content Required",
  content_ready: "Content Ready",
  sent_to_client: "Sent to Client",
  verification_pending: "Verification",
  verified: "Verified",
  payment_requested: "Payment Requested",
  payment_sent: "Payment Sent",
  completed: "Completed",
};
