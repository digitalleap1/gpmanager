"use client";

import { useEffect, useState } from "react";

import { guestPostStatusLabel } from "@/components/guest-post-status-badge";
import type {
  GuestPostCreate,
  GuestPostStatus,
  ProjectListItem,
  UserSummary,
} from "@/lib/types";
import { getUsers } from "@/services/lookup-service";
import { listProjects } from "@/services/project-service";

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

interface GuestPostFormProps {
  initial?: Partial<GuestPostCreate>;
  onSubmit: (values: GuestPostCreate) => void | Promise<void>;
  submitting: boolean;
  submitLabel: string;
  error?: string | null;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelClass = "text-sm font-medium";

/** Parse a numeric input's string value to a number or null when blank. */
function toNumberOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

/** Shared create/edit form for a guest post. Loads project + user pickers. */
export function GuestPostForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
  error,
}: GuestPostFormProps) {
  const [projectId, setProjectId] = useState(initial?.project_id ?? "");
  const [websiteName, setWebsiteName] = useState(initial?.website_name ?? "");
  const [da, setDa] = useState(initial?.da != null ? String(initial.da) : "");
  const [pa, setPa] = useState(initial?.pa != null ? String(initial.pa) : "");
  const [dr, setDr] = useState(initial?.dr != null ? String(initial.dr) : "");
  const [traffic, setTraffic] = useState(
    initial?.traffic != null ? String(initial.traffic) : "",
  );
  const [price, setPrice] = useState(
    initial?.price != null ? String(initial.price) : "",
  );
  const [contactEmail, setContactEmail] = useState(
    initial?.contact_email ?? "",
  );
  const [assignedUserId, setAssignedUserId] = useState(
    initial?.assigned_user_id ?? "",
  );
  const [status, setStatus] = useState(initial?.status ?? "prospect");
  const [outreachDate, setOutreachDate] = useState(
    initial?.outreach_date ?? "",
  );
  const [liveLinkDate, setLiveLinkDate] = useState(
    initial?.live_link_date ?? "",
  );
  const [liveLink, setLiveLink] = useState(initial?.live_link ?? "");
  const [anchorText, setAnchorText] = useState(initial?.anchor_text ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // `getUsers` already tolerates a 403 → []; resolve projects + users
        // independently so one failure does not blank the other picker.
        const [projectsRes, usersRes] = await Promise.allSettled([
          listProjects({ page: 1, page_size: 200, sort: "name" }),
          getUsers(),
        ]);
        if (!active) return;
        if (projectsRes.status === "fulfilled") {
          setProjects(projectsRes.value.items);
        } else {
          setLookupError(
            "Projects could not load. Some pickers may be empty.",
          );
        }
        if (usersRes.status === "fulfilled") {
          setUsers(usersRes.value);
        }
      } catch {
        if (active)
          setLookupError(
            "Some pickers could not load. You can still fill the other fields.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values: GuestPostCreate = {
      project_id: projectId,
      website_name: websiteName.trim() || null,
      da: toNumberOrNull(da),
      pa: toNumberOrNull(pa),
      dr: toNumberOrNull(dr),
      traffic: toNumberOrNull(traffic),
      price: toNumberOrNull(price),
      contact_email: contactEmail.trim() || null,
      assigned_user_id: assignedUserId || null,
      status,
      outreach_date: outreachDate || null,
      live_link_date: liveLinkDate || null,
      live_link: liveLink.trim() || null,
      anchor_text: anchorText.trim() || null,
      notes: notes.trim() || null,
    };
    void onSubmit(values);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-lg border border-border bg-card p-6 text-card-foreground"
    >
      {lookupError && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {lookupError}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="project" className={labelClass}>
          Project <span className="text-destructive">*</span>
        </label>
        <select
          id="project"
          required
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={inputClass}
        >
          <option value="">— Select a project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="website_name" className={labelClass}>
          Website
        </label>
        <input
          id="website_name"
          type="text"
          value={websiteName}
          onChange={(e) => setWebsiteName(e.target.value)}
          placeholder="example.com"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="da" className={labelClass}>
            DA
          </label>
          <input
            id="da"
            type="number"
            min={0}
            value={da}
            onChange={(e) => setDa(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pa" className={labelClass}>
            PA
          </label>
          <input
            id="pa"
            type="number"
            min={0}
            max={100}
            value={pa}
            onChange={(e) => setPa(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="dr" className={labelClass}>
            DR
          </label>
          <input
            id="dr"
            type="number"
            min={0}
            value={dr}
            onChange={(e) => setDr(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="traffic" className={labelClass}>
            Traffic
          </label>
          <input
            id="traffic"
            type="number"
            min={0}
            value={traffic}
            onChange={(e) => setTraffic(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="price" className={labelClass}>
            Price
          </label>
          <input
            id="price"
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact_email" className={labelClass}>
            Contact email
          </label>
          <input
            id="contact_email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="assigned_user" className={labelClass}>
            Assigned user
          </label>
          <select
            id="assigned_user"
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {guestPostStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="outreach_date" className={labelClass}>
            Outreach date
          </label>
          <input
            id="outreach_date"
            type="date"
            value={outreachDate ?? ""}
            onChange={(e) => setOutreachDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="live_link_date" className={labelClass}>
            Live link date
          </label>
          <input
            id="live_link_date"
            type="date"
            value={liveLinkDate ?? ""}
            onChange={(e) => setLiveLinkDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="anchor_text" className={labelClass}>
            Anchor text
          </label>
          <input
            id="anchor_text"
            type="text"
            value={anchorText}
            onChange={(e) => setAnchorText(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="live_link" className={labelClass}>
          Live link
        </label>
        <input
          id="live_link"
          type="url"
          value={liveLink}
          onChange={(e) => setLiveLink(e.target.value)}
          placeholder="https://example.com/article"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || projectId === ""}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export default GuestPostForm;
