"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { PaymentForm } from "@/components/payment-form";
import { ApiError } from "@/lib/api";
import type { PaymentCreate } from "@/lib/types";
import { createPayment } from "@/services/payment-service";

export default function NewPaymentPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: PaymentCreate) {
    setError(null);
    setSubmitting(true);
    try {
      const created = await createPayment(values);
      router.push(`/payments/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to create the payment. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="New Payment">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href="/payments"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to payments
        </Link>
        <PaymentForm
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Create payment"
          error={error}
        />
      </div>
    </AppShell>
  );
}
