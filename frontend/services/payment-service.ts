/**
 * Typed wrappers around the GPOMS payment endpoints (Module 7).
 *
 * Covers listing/filtering, CRUD, and the status workflow (which records
 * history; moving a payment to `paid` adds its amount to the project's
 * monthly budget on the backend).
 */

import { api } from "@/lib/api";
import type {
  Page,
  PaymentCreate,
  PaymentDetail,
  PaymentListItem,
  PaymentListParams,
  PaymentUpdate,
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

export function listPayments(
  params: PaymentListParams = {},
): Promise<Page<PaymentListItem>> {
  const query: Record<string, QueryValue> = {
    page: params.page,
    page_size: params.page_size,
    project_id: params.project_id,
    status: params.status,
    date_from: params.date_from,
    date_to: params.date_to,
    search: params.search,
    sort: params.sort,
  };
  return api.get<Page<PaymentListItem>>(`/payments${buildQuery(query)}`);
}

export function getPayment(id: string): Promise<PaymentDetail> {
  return api.get<PaymentDetail>(`/payments/${id}`);
}

export function createPayment(data: PaymentCreate): Promise<PaymentListItem> {
  return api.post<PaymentListItem>("/payments", data);
}

export function updatePayment(
  id: string,
  data: PaymentUpdate,
): Promise<PaymentListItem> {
  return api.patch<PaymentListItem>(`/payments/${id}`, data);
}

/**
 * Move a payment to a new status, optionally recording a note. Managers only;
 * moving to `paid` adds the amount to the project's monthly budget.
 */
export function setStatus(
  id: string,
  status: string,
  note?: string | null,
): Promise<PaymentListItem> {
  return api.post<PaymentListItem>(`/payments/${id}/status`, {
    status,
    note: note ?? null,
  });
}

export function removePayment(id: string): Promise<void> {
  return api.delete<void>(`/payments/${id}`);
}
