"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { GuestPostForm } from "@/components/guest-post-form";
import { ApiError } from "@/lib/api";
import type { GuestPostCreate } from "@/lib/types";
import { createGuestPost } from "@/services/guest-post-service";

function NewGuestPostInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project_id");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: GuestPostCreate) {
    setError(null);
    setSubmitting(true);
    try {
      const created = await createGuestPost(values);
      router.push(`/guest-posts/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to create the guest post. Please try again.",
      );
      setSubmitting(false);
    }
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
