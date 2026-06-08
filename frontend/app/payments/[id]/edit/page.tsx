"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { PaymentForm } from "@/components/payment-form";
import { ApiError } from "@/lib/api";
import type { PaymentCreate, PaymentDetail } from "@/lib/types";
import { getPayment, updatePayment } from "@/services/payment-service";

export default function EditPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
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
        const data = await getPayment(id);
        if (active) setPayment(data);
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Unable to load the payment.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSubmit(values: PaymentCreate) {
    setError(null);
    setSubmitting(true);
    try {
      await updatePayment(id, values);
      router.push(`/payments/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to save changes. Please try again.",
      );
      setSubmitting(false);
    }
  }

  const initial: Partial<PaymentCreate> | undefined = payment
    ? {
        project_id: payment.project_id,
        client_id: payment.client_id,
        website_id: payment.website_id,
        live_link: payment.live_link,
        currency: payment.currency,
        amount: payment.amount,
        fx_to_usd: payment.fx_to_usd,
        amount_usd: payment.amount_usd,
        amount_inr: payment.amount_inr,
        mode_of_payment: payment.mode_of_payment,
        notified: payment.notified,
        invoice_link: payment.invoice_link,
        payment_date: payment.payment_date,
        transaction_id: payment.transaction_id,
        remarks: payment.remarks,
        status: payment.status,
        attributed_to_id: payment.attributed_to?.id ?? null,
        via: payment.via,
        invoice_number: payment.invoice_number,
      }
    : undefined;

  return (
    <AppShell
      title={
        payment
          ? `Edit · ${payment.project_name ?? payment.website_domain ?? "Payment"}`
          : "Edit Payment"
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href={`/payments/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to payment
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
          <PaymentForm
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
