"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { GuestPostForm } from "@/components/guest-post-form";
import { ApiError } from "@/lib/api";
import type { GuestPostCreate, GuestPostDetail } from "@/lib/types";
import {
  getGuestPost,
  updateGuestPost,
} from "@/services/guest-post-service";

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

  async function handleSubmit(values: GuestPostCreate) {
    setError(null);
    setSubmitting(true);
    try {
      await updateGuestPost(id, values);
      router.push(`/guest-posts/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to save changes. Please try again.",
      );
      setSubmitting(false);
    }
  }

  const initial: Partial<GuestPostCreate> | undefined = guestPost
    ? {
        project_id: guestPost.project_id,
        website_id: guestPost.website_id,
        website_name: guestPost.website_name,
        da: guestPost.da,
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
