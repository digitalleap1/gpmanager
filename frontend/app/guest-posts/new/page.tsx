"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  GuestPostForm,
  type GuestPostPaymentInput,
} from "@/components/guest-post-form";
import { ApiError } from "@/lib/api";
import type { GuestPostCreate, PaymentCreate } from "@/lib/types";
import { createGuestPost } from "@/services/guest-post-service";
import { createPayment } from "@/services/payment-service";

/**
 * Build a `PaymentCreate` body from the inline payment input, omitting
 * empty/undefined optional fields (never send blank strings; numbers only when
 * finite) so the backend sees a clean payload.
 */
function buildPaymentBody(
  values: GuestPostCreate,
  payment: GuestPostPaymentInput,
  guestPostId: string,
  liveLink: string | null,
): PaymentCreate {
  const body: PaymentCreate = {
    project_id: values.project_id,
    guest_post_id: guestPostId,
    currency: payment.currency,
    status: payment.status,
  };
  if (values.website_id) body.website_id = values.website_id;
  if (payment.attributed_to_id)
    body.attributed_to_id = payment.attributed_to_id;
  if (typeof payment.amount === "number" && Number.isFinite(payment.amount))
    body.amount = payment.amount;
  if (payment.mode_of_payment) body.mode_of_payment = payment.mode_of_payment;
  if (payment.transaction_id) body.transaction_id = payment.transaction_id;
  if (payment.payment_date) body.payment_date = payment.payment_date;
  // Default case is "standard" — only send it when it differs.
  if (payment.payment_case && payment.payment_case !== "standard")
    body.payment_case = payment.payment_case;
  // Empty watcher lists send nothing.
  if (payment.watcher_ids.length > 0) body.watcher_ids = payment.watcher_ids;
  if (liveLink) body.live_link = liveLink;
  return body;
}

function NewGuestPostInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project_id");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(
    values: GuestPostCreate,
    payment?: GuestPostPaymentInput,
  ) {
    setError(null);
    setSubmitting(true);

    // 1) Create the link first. A failure here means nothing was created.
    let createdId: string;
    let createdLiveLink: string | null;
    try {
      const created = await createGuestPost(values);
      createdId = created.id;
      createdLiveLink = created.live_link ?? null;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to create the guest post. Please try again.",
      );
      setSubmitting(false);
      return;
    }

    // 2) Optionally create the payment. If the link saved but the payment
    // fails, do NOT lose the created link — navigate to it but surface the
    // payment error so it can be retried from the Payments page.
    if (payment) {
      try {
        await createPayment(
          buildPaymentBody(values, payment, createdId, createdLiveLink),
        );
      } catch (err) {
        setError(
          err instanceof ApiError
            ? `Link saved, but the payment failed: ${err.message}`
            : "Link saved, but the payment could not be created.",
        );
        setSubmitting(false);
        router.push(`/guest-posts/${createdId}`);
        return;
      }
    }

    router.push(`/guest-posts/${createdId}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={projectId ? `/projects/${projectId}?tab=links` : "/guest-posts"}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back
      </Link>
      <GuestPostForm
        initial={projectId ? { project_id: projectId } : undefined}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel="Create guest post"
        error={error}
      />
    </div>
  );
}

export default function NewGuestPostPage() {
  return (
    <AppShell title="New Guest Post">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading…</p>
        }
      >
        <NewGuestPostInner />
      </Suspense>
    </AppShell>
  );
}
