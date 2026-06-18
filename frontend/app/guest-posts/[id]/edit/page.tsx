"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  GuestPostForm,
  type GuestPostPaymentInput,
} from "@/components/guest-post-form";
import { ApiError } from "@/lib/api";
import type {
  GuestPostCreate,
  GuestPostDetail,
  PaymentCreate,
} from "@/lib/types";
import {
  getGuestPost,
  updateGuestPost,
} from "@/services/guest-post-service";
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

export default function EditGuestPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [guestPost, setGuestPost] = useState<GuestPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await getGuestPost(id);
        if (active) setGuestPost(data);
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Unable to load the guest post.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSubmit(
    values: GuestPostCreate,
    payment?: GuestPostPaymentInput,
  ) {
    setError(null);
    setSubmitting(true);

    // 1) Save the link first. A failure here means nothing changed.
    let updatedLiveLink: string | null;
    try {
      const updated = await updateGuestPost(id, values);
      updatedLiveLink = updated.live_link ?? null;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to save changes. Please try again.",
      );
      setSubmitting(false);
      return;
    }

    // 2) Optionally create the payment. If the link saved but the payment
    // fails, do NOT lose the saved link — navigate to it but surface the
    // payment error so it can be retried from the Payments page.
    if (payment) {
      try {
        await createPayment(
          buildPaymentBody(values, payment, id, updatedLiveLink),
        );
      } catch (err) {
        setError(
          err instanceof ApiError
            ? `Link saved, but the payment failed: ${err.message}`
            : "Link saved, but the payment could not be created.",
        );
        setSubmitting(false);
        router.push(`/guest-posts/${id}`);
        return;
      }
    }

    router.push(`/guest-posts/${id}`);
  }

  const initial: Partial<GuestPostCreate> | undefined = guestPost
    ? {
        project_id: guestPost.project_id,
        website_id: guestPost.website_id,
        website_name: guestPost.website_name,
        da: guestPost.da,
        pa: guestPost.pa,
        dr: guestPost.dr,
        traffic: guestPost.traffic,
        price: guestPost.price,
        contact_email: guestPost.contact_email,
        assigned_user_id: guestPost.assigned_user?.id ?? null,
        status: guestPost.status,
        outreach_date: guestPost.outreach_date,
        live_link_date: guestPost.live_link_date,
        live_link: guestPost.live_link,
        anchor_text: guestPost.anchor_text,
        notes: guestPost.notes,
      }
    : undefined;

  return (
    <AppShell
      title={
        guestPost
          ? `Edit · ${guestPost.website_name ?? "Guest Post"}`
          : "Edit Guest Post"
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href={`/guest-posts/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to guest post
        </Link>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {loadError}
          </p>
        ) : (
          <GuestPostForm
            initial={initial}
            onSubmit={handleSubmit}
            submitting={submitting}
            submitLabel="Save changes"
            error={error}
          />
        )}
      </div>
    </AppShell>
  );
}
