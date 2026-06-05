"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { WebsiteForm } from "@/components/website-form";
import { ApiError } from "@/lib/api";
import type { WebsiteCreate, WebsiteDetail } from "@/lib/types";
import { getWebsite, updateWebsite } from "@/services/website-service";

export default function EditWebsitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [website, setWebsite] = useState<WebsiteDetail | null>(null);
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
        const data = await getWebsite(id);
        if (active) setWebsite(data);
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Unable to load the website.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSubmit(values: WebsiteCreate) {
    setError(null);
    setSubmitting(true);
    try {
      await updateWebsite(id, values);
      router.push(`/websites/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to save changes. Please try again.",
      );
      setSubmitting(false);
    }
  }

  const initial: Partial<WebsiteCreate> | undefined = website
    ? {
        domain: website.domain,
        name: website.name,
        main_niche_id: website.main_niche?.id ?? null,
        country_id: website.country?.id ?? null,
        language_id: website.language?.id ?? null,
        traffic: website.traffic,
        da: website.da,
        dr: website.dr,
        spam_score: website.spam_score,
        price: website.price,
        email: website.email,
        contact_person: website.contact_person,
        guest_post_available: website.guest_post_available,
        link_insertion_available: website.link_insertion_available,
        homepage_url: website.homepage_url,
        notes: website.notes,
        niche_ids: website.niche_ids,
      }
    : undefined;

  return (
    <AppShell title={website ? `Edit · ${website.domain}` : "Edit Website"}>
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href={`/websites/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to website
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
          <WebsiteForm
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
