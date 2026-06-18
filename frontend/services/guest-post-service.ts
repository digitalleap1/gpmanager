/**
 * Typed wrappers around the GPOMS guest-post endpoints (Module 5).
 *
 * Covers listing/filtering, CRUD, the status workflow (which records history
 * and auto-bumps the project's monthly goal when moving to `published`), and
 * the dedicated publish action that sets the live link.
 */

import { api } from "@/lib/api";
import type {
  BulkLinkRow,
  BulkLinksResult,
  GuestPostCreate,
  GuestPostDetail,
  GuestPostListItem,
  GuestPostListParams,
  GuestPostPublish,
  GuestPostStats,
  GuestPostUpdate,
  Page,
  RequestLinkPaymentBody,
} from "@/lib/types";

type QueryValue = string | number | boolean | undefined | null;

/** Build a `?key=value` query string from defined params only. */
function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function listGuestPosts(
  params: GuestPostListParams = {},
): Promise<Page<GuestPostListItem>> {
  const query: Record<string, QueryValue> = {
    page: params.page,
    page_size: params.page_size,
    project_id: params.project_id,
    status: params.status,
    assigned_user_id: params.assigned_user_id,
    website_id: params.website_id,
    search: params.search,
    sort: params.sort,
  };
  return api.get<Page<GuestPostListItem>>(`/guest-posts${buildQuery(query)}`);
}

export function getGuestPost(id: string): Promise<GuestPostDetail> {
  return api.get<GuestPostDetail>(`/guest-posts/${id}`);
}

export function createGuestPost(
  data: GuestPostCreate,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>("/guest-posts", data);
}

export function updateGuestPost(
  id: string,
  data: GuestPostUpdate,
): Promise<GuestPostListItem> {
  return api.patch<GuestPostListItem>(`/guest-posts/${id}`, data);
}

/**
 * Create several guest-post links in one call. Blank/undefined numeric fields
 * are dropped so they aren't sent as `0`; `payment_mode`/`currency` are only
 * included when non-empty; `request_payment` is always sent as a real boolean.
 * Rows where both `website_name` and `link_url` are blank are skipped
 * server-side. Each row's payment (when requested) defaults to its `price`.
 */
export function bulkCreateLinks(
  projectId: string,
  links: BulkLinkRow[],
  watcherIds: string[] = [],
): Promise<BulkLinksResult> {
  const numericKeys = ["da", "pa", "dr", "traffic", "price"] as const;
  const stringKeys = [
    "website_name",
    "link_url",
    "currency",
    "payment_mode",
    "payment_case",
  ] as const;

  const cleaned = links.map((row) => {
    const out: BulkLinkRow = {};
    for (const key of stringKeys) {
      const value = row[key];
      if (typeof value === "string" && value.trim() !== "") {
        out[key] = value.trim();
      }
    }
    for (const key of numericKeys) {
      const value = row[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        out[key] = value;
      }
    }
    if (row.attributed_to_id) out.attributed_to_id = row.attributed_to_id;
    out.request_payment = row.request_payment === true;
    return out;
  });

  const body: {
    project_id: string;
    links: BulkLinkRow[];
    watcher_ids?: string[];
  } = {
    project_id: projectId,
    links: cleaned,
  };
  if (watcherIds.length > 0) body.watcher_ids = watcherIds;

  return api.post<BulkLinksResult>("/guest-posts/bulk", body);
}

/** Move a guest post to a new status, optionally recording a note. */
export function setStatus(
  id: string,
  status: string,
  note?: string | null,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/status`, {
    status,
    note: note ?? null,
  });
}

/** Mark a guest post published: sets status=published + live link. */
export function publish(
  id: string,
  data: GuestPostPublish,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/publish`, data);
}

export function removeGuestPost(id: string): Promise<void> {
  return api.delete<void>(`/guest-posts/${id}`);
}

/**
 * Raise a pending payment for a guest-post link. Defaults the amount to the
 * link's own price when omitted. Allowed for the link's creator/assignee or a
 * manager — a 403 is surfaced otherwise. Empty keys are omitted from the body.
 */
export function requestGuestPostPayment(
  id: string,
  body: RequestLinkPaymentBody = {},
): Promise<{ payment_id: string; status: string }> {
  const payload: Record<string, string | number | string[]> = {};
  if (body.amount != null) payload.amount = body.amount;
  if (body.currency != null && body.currency !== "")
    payload.currency = body.currency;
  if (body.note != null && body.note !== "") payload.note = body.note;
  if (body.attributed_to_id) payload.attributed_to_id = body.attributed_to_id;
  if (body.payment_case != null && body.payment_case !== "")
    payload.payment_case = body.payment_case;
  if (body.mode_of_payment != null && body.mode_of_payment !== "")
    payload.mode_of_payment = body.mode_of_payment;
  if (body.watcher_ids != null && body.watcher_ids.length > 0)
    payload.watcher_ids = body.watcher_ids;
  return api.post<{ payment_id: string; status: string }>(
    `/guest-posts/${id}/request-payment`,
    payload,
  );
}

/* ------------------------------------------------------------------ *
 * Review workflow + stats
 * ------------------------------------------------------------------ */

/**
 * Submit the ticket for website review, assigning a reviewer who becomes the
 * new current assignee. Used both from `research` (assign reviewer) and
 * `rejected` (re-assign reviewer).
 */
export function submitForReview(
  id: string,
  reviewerId?: string,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/submit-review`, {
    reviewer_id: reviewerId ?? null,
  });
}

/** Body accepted by the website-review action. */
export interface ReviewBody {
  approve: boolean;
  note?: string;
  /**
   * On approval, assign a content writer who becomes the new assignee. If
   * omitted, the reviewer keeps the ticket.
   */
  content_writer_id?: string;
  /** Approve but route to the advance-payment branch first. */
  advance?: boolean;
}

/**
 * Approve or reject a submitted link (current reviewer or a manager).
 *
 * On approval, optionally assign a content writer (`content_writer_id`) who
 * becomes the new assignee, or pass `advance: true` to route the post to the
 * advance-payment branch instead of straight into content writing.
 */
export function reviewGuestPost(
  id: string,
  body: ReviewBody,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/review`, {
    approve: body.approve,
    note: body.note ?? null,
    ...(body.content_writer_id
      ? { content_writer_id: body.content_writer_id }
      : {}),
    ...(body.advance ? { advance: true } : {}),
  });
}

/** Role-scoped aggregate stats for the Guest Post Links widgets. */
export function getGuestPostStats(): Promise<GuestPostStats> {
  return api.get<GuestPostStats>("/guest-posts/stats");
}

/* ------------------------------------------------------------------ *
 * Project workflow state machine (Module 5 — `workflow_status`)
 *
 * Every endpoint is POST and returns the updated `GuestPostListItem`. The
 * detail page reloads the full GP afterwards to refresh the stage history.
 * ------------------------------------------------------------------ */

/** Body accepted by the approve-advance workflow action. */
export interface ApproveAdvanceBody {
  note?: string;
  /** Optionally assign a content writer who becomes the new assignee. */
  content_writer_id?: string;
}

/** Approve a pending advance-payment request (admin only). */
export function approveAdvance(
  id: string,
  body: ApproveAdvanceBody = {},
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(
    `/guest-posts/${id}/workflow/approve-advance`,
    {
      note: body.note ?? null,
      ...(body.content_writer_id
        ? { content_writer_id: body.content_writer_id }
        : {}),
    },
  );
}

/** Assign (or clear, with `null`) the content writer for a guest post. */
export function assignWriter(
  id: string,
  writerId: string | null,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(
    `/guest-posts/${id}/workflow/assign-writer`,
    { writer_id: writerId },
  );
}

/** Submit the produced content for the next stage. */
export function submitContent(
  id: string,
  note?: string,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/workflow/content`, {
    note: note ?? null,
  });
}

/** Send the ready content to the client. */
export function sendToClient(
  id: string,
  note?: string,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/workflow/send-client`, {
    note: note ?? null,
  });
}

/** Body accepted by the publish workflow action. */
export interface PublishBody {
  live_url: string;
  note?: string;
  /** Verifier who becomes the new assignee for the verification stage. */
  verifier_id?: string;
}

/**
 * Mark the post published, recording the live URL and (optionally) assigning a
 * verifier who becomes the new current assignee. Also used to re-publish from
 * the `verification_failed` branch.
 */
export function wfPublish(
  id: string,
  body: PublishBody,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/workflow/publish`, {
    live_url: body.live_url,
    note: body.note ?? null,
    ...(body.verifier_id ? { verifier_id: body.verifier_id } : {}),
  });
}

/** Approve or fail the live-link verification (current verifier or a manager). */
export function verifyLink(
  id: string,
  approve: boolean,
  note?: string,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/workflow/verify`, {
    approve,
    note: note ?? null,
  });
}

/**
 * Reassign the ticket to anyone (managers only). Pass `null` to unassign the
 * current holder.
 */
export function reassignTicket(
  id: string,
  assigneeId: string | null,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/workflow/reassign`, {
    assignee_id: assigneeId,
  });
}

/** Body accepted by the request-payment workflow action. */
export interface RequestPaymentBody {
  amount?: number | null;
  currency?: string | null;
  payment_type?: string | null;
  note?: string | null;
}

/** Request payment for the published link (manager). */
export function requestPayment(
  id: string,
  body: RequestPaymentBody,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(
    `/guest-posts/${id}/workflow/request-payment`,
    {
      amount: body.amount ?? null,
      currency: body.currency ?? null,
      payment_type: body.payment_type ?? null,
      note: body.note ?? null,
    },
  );
}

/** Mark the payment as sent (admin). */
export function paymentSent(
  id: string,
  note?: string,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(`/guest-posts/${id}/workflow/payment-sent`, {
    note: note ?? null,
  });
}

/** Confirm the payment was received (manager). */
export function confirmPayment(
  id: string,
  note?: string,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(
    `/guest-posts/${id}/workflow/confirm-payment`,
    { note: note ?? null },
  );
}

/** Reopen a payment that was marked sent but not received (manager). */
export function reopenPayment(
  id: string,
  note?: string,
): Promise<GuestPostListItem> {
  return api.post<GuestPostListItem>(
    `/guest-posts/${id}/workflow/reopen-payment`,
    { note: note ?? null },
  );
}
