"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { GuestPostForm } from "@/components/guest-post-form";
import { ApiError } from "@/lib/api";
import type { GuestPostCreate } from "@/lib/types";
import { createGuestPost } from "@/services/guest-post-service";

export default function NewGuestPostPage() {
  const router = useRouter();
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
    <AppShell title="New Guest Post">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href="/guest-posts"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to guest posts
        </Link>
        <GuestPostForm
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Create guest post"
          error={error}
        />
      </div>
    </AppShell>
  );
}
