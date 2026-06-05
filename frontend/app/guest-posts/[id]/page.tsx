"use client";

import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  GuestPostStatusBadge,
  guestPostStatusLabel,
} from "@/components/guest-post-status-badge";
import { ApiError } from "@/lib/api";
import type {
  GuestPostDetail,
  GuestPostStatus,
  StatusHistoryEntry,
} from "@/lib/types";
import { formatCurrency, formatDate, relativeTime } from "@/lib/utils";
import {
  getGuestPost,
  publish,
  setStatus,
} from "@/services/guest-post-service";

const STATUS_OPTIONS: GuestPostStatus[] = [
  "prospect",
  "contacted",
  "negotiating",
  "accepted",
  "invoice_sent",
  "paid",
  "published",
  "rejected",
];

export default function GuestPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [gp, setGp] = useState<GuestPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGuestPost(id);
      setGp(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load the guest post. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title={gp?.website_name ?? "Guest Post"}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : gp ? (
        <div className="space-y-6">
          {/* Header actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/guest-posts"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to list
            </Link>
            <Link
              href={`/guest-posts/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </div>

          {/* Overview */}
          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">
                {gp.website_name ?? "Untitled site"}
              </h2>
              <GuestPostStatusBadge status={gp.status} />
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Project"
                value={
                  <Link
                    href={`/projects/${gp.project_id}`}
                    className="text-primary hover:underline"
                  >
                    {gp.project_name}
                  </Link>
                }
              />
              <Field label="DA" value={gp.da} />
              <Field label="DR" value={gp.dr} />
              <Field label="Traffic" value={gp.traffic} />
              <Field
                label="Price"
                value={gp.price != null ? formatCurrency(gp.price) : null}
              />
              <Field label="Contact email" value={gp.contact_email} />
              <Field label="Assigned user" value={gp.assigned_user?.full_name} />
              <Field
                label="Outreach date"
                value={formatDate(gp.outreach_date)}
              />
              <Field
                label="Live link date"
                value={formatDate(gp.live_link_date)}
              />
              <Field label="Anchor text" value={gp.anchor_text} />
              <Field
                label="Live link"
                value={
                  gp.live_link ? (
                    <a
                      href={gp.live_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open link
                    </a>
                  ) : null
                }
              />
            </dl>

            {gp.notes && (
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{gp.notes}</p>
              </div>
            )}
          </section>

          {/* Workflow controls */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <StatusWorkflow
              currentStatus={gp.status}
              onChanged={(updated) =>
                setGp((prev) =>
                  prev ? { ...prev, ...updated } : prev,
                )
              }
              guestPostId={id}
              reload={load}
            />
            <PublishControl
              guestPostId={id}
              initialLiveLink={gp.live_link}
              initialAnchorText={gp.anchor_text}
              isPublished={gp.status === "published"}
              onPublished={() => void load()}
            />
          </div>

          {/* Status history timeline */}
          <StatusHistory entries={gp.status_history} />
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

/**
 * Status workflow control: choose any of the 8 statuses + an optional note and
 * record the change. Moving to `published` auto-bumps the project's monthly
 * goal on the backend.
 */
function StatusWorkflow({
  currentStatus,
  guestPostId,
  onChanged,
  reload,
}: {
  currentStatus: string;
  guestPostId: string;
  onChanged: (updated: Partial<GuestPostDetail>) => void;
  reload: () => Promise<void>;
}) {
  const [nextStatus, setNextStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep the dropdown in sync when the post reloads with a new status.
  useEffect(() => {
    setNextStatus(currentStatus);
  }, [currentStatus]);

  async function handleApply() {
    setErr(null);
    setBusy(true);
    try {
      const updated = await setStatus(
        guestPostId,
        nextStatus,
        note.trim() || null,
      );
      onChanged(updated);
      setNote("");
      // Reload to refresh the status-history timeline.
      await reload();
    } catch (e) {
      setErr(
        e instanceof ApiError ? e.message : "Unable to update the status.",
      );
    } finally {
      setBusy(false);
    }
  }

  const unchanged = nextStatus === currentStatus;

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-sm font-semibold">Update status</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Current status:{" "}
        <span className="font-medium">
          {guestPostStatusLabel(currentStatus)}
        </span>
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="next_status" className="text-sm font-medium">
            New status
          </label>
          <select
            id="next_status"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {guestPostStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="status_note" className="text-sm font-medium">
            Note (optional)
          </label>
          <textarea
            id="status_note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for this change…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {err && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {err}
          </p>
        )}

        <button
          type="button"
          onClick={handleApply}
          disabled={busy || unchanged}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Apply status"}
        </button>
      </div>
    </section>
  );
}

/**
 * Mark-published control: collects the live link (+ optional date/anchor) and
 * calls the dedicated publish endpoint, which sets status=published.
 */
function PublishControl({
  guestPostId,
  initialLiveLink,
  initialAnchorText,
  isPublished,
  onPublished,
}: {
  guestPostId: string;
  initialLiveLink: string | null;
  initialAnchorText: string | null;
  isPublished: boolean;
  onPublished: () => void;
}) {
  const [liveLink, setLiveLink] = useState(initialLiveLink ?? "");
  const [liveLinkDate, setLiveLinkDate] = useState("");
  const [anchorText, setAnchorText] = useState(initialAnchorText ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handlePublish() {
    if (liveLink.trim() === "") {
      setErr("A live link is required to mark this published.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await publish(guestPostId, {
        live_link: liveLink.trim(),
        live_link_date: liveLinkDate || null,
        anchor_text: anchorText.trim() || null,
      });
      onPublished();
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.message
          : "Unable to mark this guest post published.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-sm font-semibold">Mark published</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {isPublished
          ? "Already published — you can update the live link details below."
          : "Record the live link to set this guest post to published."}
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="publish_live_link" className="text-sm font-medium">
            Live link <span className="text-destructive">*</span>
          </label>
          <input
            id="publish_live_link"
            type="url"
            value={liveLink}
            onChange={(e) => setLiveLink(e.target.value)}
            placeholder="https://example.com/article"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="publish_live_date"
              className="text-sm font-medium"
            >
              Live link date
            </label>
            <input
              id="publish_live_date"
              type="date"
              value={liveLinkDate}
              onChange={(e) => setLiveLinkDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="publish_anchor"
              className="text-sm font-medium"
            >
              Anchor text
            </label>
            <input
              id="publish_anchor"
              type="text"
              value={anchorText}
              onChange={(e) => setAnchorText(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {err && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {err}
          </p>
        )}

        <button
          type="button"
          onClick={handlePublish}
          disabled={busy || liveLink.trim() === ""}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : isPublished ? "Update live link" : "Mark published"}
        </button>
      </div>
    </section>
  );
}

/** Newest-first timeline of status changes with actor + relative time. */
function StatusHistory({ entries }: { entries: StatusHistoryEntry[] }) {
  const ordered = [...entries].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-sm font-semibold">Status history</h2>

      {ordered.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No status changes recorded yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {ordered.map((entry, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                {i < ordered.length - 1 && (
                  <span className="mt-1 w-px flex-1 bg-border" />
                )}
              </div>
              <div className="flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  {entry.from_status && (
                    <>
                      <GuestPostStatusBadge status={entry.from_status} />
                      <span className="text-xs text-muted-foreground">→</span>
                    </>
                  )}
                  <GuestPostStatusBadge status={entry.to_status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.changed_by?.full_name ?? "System"} ·{" "}
                  {relativeTime(entry.created_at)} ·{" "}
                  {formatDate(entry.created_at)}
                </p>
                {entry.note && (
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {entry.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
