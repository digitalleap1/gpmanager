"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { WebsiteForm } from "@/components/website-form";
import { ApiError } from "@/lib/api";
import type { WebsiteCreate } from "@/lib/types";
import { createWebsite } from "@/services/website-service";

export default function NewWebsitePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: WebsiteCreate) {
    setError(null);
    setSubmitting(true);
    try {
      const created = await createWebsite(values);
      router.push(`/websites/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to create the website. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="New Website">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href="/websites"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to websites
        </Link>
        <WebsiteForm
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Create website"
          error={error}
        />
      </div>
    </AppShell>
  );
}
