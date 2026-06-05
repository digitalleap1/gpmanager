"use client";

import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import type {
  WebsiteContact,
  WebsiteContactCreate,
  WebsiteDetail,
  WebsiteMetric,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  addContact,
  getWebsite,
  removeContact,
  removeWebsite,
} from "@/services/website-service";

export default function WebsiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [site, setSite] = useState<WebsiteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWebsite(id);
      setSite(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load the website. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!site) return;
    if (
      !window.confirm(
        `Delete "${site.domain}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setDeleting(true);
    try {
      await removeWebsite(id);
      router.push("/websites");
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 403
          ? "Only managers can delete websites."
          : err instanceof ApiError
            ? err.message
            : "Unable to delete website.",
      );
      setDeleting(false);
    }
  }

  return (
    <AppShell title={site?.domain ?? "Website"}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : site ? (
        <div className="space-y-6">
          {/* Header actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/websites"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to list
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href={`/websites/${id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>

          {actionError && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {actionError}
            </p>
          )}

          {/* Overview */}
          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">{site.domain}</h2>
              {site.guest_post_available && (
                <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                  Guest post
                </span>
              )}
              {site.link_insertion_available && (
                <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  Link insertion
                </span>
              )}
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Name" value={site.name} />
              <Field label="Main niche" value={site.main_niche?.name} />
              <Field label="Country" value={site.country?.name} />
              <Field label="Language" value={site.language?.name} />
              <Field label="DA" value={site.da} />
              <Field label="DR" value={site.dr} />
              <Field label="Spam score" value={site.spam_score} />
              <Field
                label="Traffic"
                value={
                  site.traffic != null ? site.traffic.toLocaleString() : null
                }
              />
              <Field
                label="Price"
                value={site.price != null ? formatCurrency(site.price) : null}
              />
              <Field label="Email" value={site.email} />
              <Field label="Contact person" value={site.contact_person} />
              <Field
                label="Homepage"
                value={
                  site.homepage_url ? (
                    <a
                      href={site.homepage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </a>
                  ) : null
                }
              />
              <Field label="Created" value={formatDate(site.created_at)} />
              <Field label="Updated" value={formatDate(site.updated_at)} />
            </dl>

            {site.notes && (
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{site.notes}</p>
              </div>
            )}
          </section>

          {/* Contacts */}
          <ContactsSection
            websiteId={id}
            contacts={site.contacts}
            onChanged={load}
          />

          {/* Metrics history */}
          <MetricsHistory metrics={site.metrics_history} />
        </div>
      ) : null}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && value === "—");
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{isEmpty ? "—" : value}</dd>
    </div>
  );
}

/** Contacts list with an inline add-contact form and per-row removal. */
function ContactsSection({
  websiteId,
  contacts,
  onChanged,
}: {
  websiteId: string;
  contacts: WebsiteContact[];
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (name.trim() === "" && email.trim() === "") {
      setErr("Provide at least a name or an email.");
      return;
    }
    setErr(null);
    setAdding(true);
    try {
      const body: WebsiteContactCreate = {
        name: name.trim() || null,
        email: email.trim() || null,
        role: role.trim() || null,
        is_primary: isPrimary,
      };
      await addContact(websiteId, body);
      setName("");
      setEmail("");
      setRole("");
      setIsPrimary(false);
      await onChanged();
    } catch (e2) {
      setErr(
        e2 instanceof ApiError ? e2.message : "Unable to add the contact.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(contact: WebsiteContact) {
    const label = contact.name ?? contact.email ?? "this contact";
    if (!window.confirm(`Remove ${label}?`)) return;
    setErr(null);
    setBusyId(contact.id);
    try {
      await removeContact(websiteId, contact.id);
      await onChanged();
    } catch (e2) {
      setErr(
        e2 instanceof ApiError ? e2.message : "Unable to remove the contact.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-sm font-semibold">Contacts</h2>

      {contacts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No contacts recorded yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {c.name ?? "—"}
                  {c.is_primary && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Primary
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[c.email, c.role].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(c)}
                disabled={busyId === c.id}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                title="Remove contact"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add contact */}
      <form
        onSubmit={handleAdd}
        className="mt-5 space-y-3 border-t border-border pt-5"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Add contact
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className={inputClass}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={inputClass}
          />
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role"
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Primary contact
          </label>
          <button
            type="submit"
            disabled={adding}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {adding ? "Adding…" : "Add contact"}
          </button>
        </div>

        {err && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {err}
          </p>
        )}
      </form>
    </section>
  );
}

/** Newest-first table of captured DA/DR/traffic/spam metrics, if any. */
function MetricsHistory({ metrics }: { metrics: WebsiteMetric[] }) {
  const ordered = [...metrics].sort(
    (a, b) =>
      new Date(b.captured_on).getTime() - new Date(a.captured_on).getTime(),
  );

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-sm font-semibold">Metrics history</h2>

      {ordered.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No metrics captured yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Captured</th>
                <th className="px-3 py-2 text-right font-medium">DA</th>
                <th className="px-3 py-2 text-right font-medium">DR</th>
                <th className="px-3 py-2 text-right font-medium">Traffic</th>
                <th className="px-3 py-2 text-right font-medium">Spam</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((m, i) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2">{formatDate(m.captured_on)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {m.da ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {m.dr ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {m.traffic != null ? m.traffic.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {m.spam_score ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
