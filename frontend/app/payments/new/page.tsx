"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { PaymentForm } from "@/components/payment-form";
import { ApiError } from "@/lib/api";
import type { PaymentCreate } from "@/lib/types";
import { createPayment } from "@/services/payment-service";

function NewPaymentInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project_id");
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
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={projectId ? `/projects/${projectId}?tab=payments` : "/payments"}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back
      </Link>
      <PaymentForm
        initial={projectId ? { project_id: projectId } : undefined}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel="Create payment"
        error={error}
      />
    </div>
  );
}

export default function NewPaymentPage() {
  return (
    <AppShell title="New Payment">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading…</p>
        }
      >
        <NewPaymentInner />
      </Suspense>
    </AppShell>
  );
}
