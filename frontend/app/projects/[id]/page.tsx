"use client";

import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ApiError } from "@/lib/api";
import type {
  MonthlyBudget,
  MonthlyGoal,
  ProjectDetail,
  ProjectMember,
  UserSummary,
} from "@/lib/types";
import { formatCurrency, formatDate, monthLabel } from "@/lib/utils";
import { getUsers } from "@/services/lookup-service";
import {
  addMember,
  archiveProject,
  getProject,
  removeMember,
  setBudget,
  setGoal,
} from "@/services/project-service";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [goals, setGoals] = useState<MonthlyGoal[]>([]);
  const [budgets, setBudgets] = useState<MonthlyBudget[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProject(id);
      setProject(data);
      setGoals(data.goals);
      setBudgets(data.budgets);
      setMembers(data.members);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load the project. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleArchive() {
    if (!project) return;
    setActionError(null);
    setArchiving(true);
    try {
      const updated = await archiveProject(id, !project.is_archived);
      setProject((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Unable to update project.",
      );
    } finally {
      setArchiving(false);
    }
  }

  async function handleSaveGoal(month: number, value: number) {
    if (!project) return;
    const updated = await setGoal(id, project.current_year, month, value);
    setGoals((prev) =>
      prev.map((g) => (g.month === updated.month ? updated : g)),
    );
  }

  async function handleSaveBudget(month: number, value: number) {
    if (!project) return;
    const updated = await setBudget(id, project.current_year, month, value);
    setBudgets((prev) =>
      prev.map((b) => (b.month === updated.month ? updated : b)),
    );
  }

  return (
    <AppShell title={project?.name ?? "Project"}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : project ? (
        <div className="space-y-6">
          {/* Header actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/projects"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to list
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
              <button
                type="button"
                onClick={handleArchive}
                disabled={archiving}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                {project.is_archived ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                {project.is_archived ? "Unarchive" : "Archive"}
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
              <h2 className="text-xl font-semibold">{project.name}</h2>
              <StatusBadge status={project.status} />
              {project.is_archived && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase text-muted-foreground">
                  Archived
                </span>
              )}
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Main niche" value={project.main_niche?.name} />
              <Field
                label="Project niche"
                value={project.project_niche?.name}
              />
              <Field label="Country" value={project.target_country?.name} />
              <Field label="Assignee" value={project.assignee?.full_name} />
              <Field label="Team lead" value={project.team_lead?.full_name} />
              <Field
                label="Monthly budget"
                value={formatCurrency(project.monthly_budget)}
              />
              <Field label="Target links" value={project.target_links} />
              <Field label="Due date" value={formatDate(project.due_date)} />
              <Field
                label="Created by"
                value={project.created_by?.full_name}
              />
            </dl>

            {(project.goal || project.notes) && (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {project.goal && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Goal
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {project.goal}
                    </p>
                  </div>
                )}
                {project.notes && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Notes
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {project.notes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Monthly goals grid */}
          <GoalsGrid
            year={project.current_year}
            goals={goals}
            onSave={handleSaveGoal}
          />

          {/* Monthly budgets grid */}
          <BudgetsGrid
            year={project.current_year}
            budgets={budgets}
            onSave={handleSaveBudget}
          />

          {/* Members */}
          <MembersSection
            projectId={id}
            members={members}
            onChange={setMembers}
          />
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
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm">
        {value === null || value === undefined || value === "" ? "—" : value}
      </dd>
    </div>
  );
}

/**
 * Inline-editable numeric cell: click to edit, Enter/blur to save, Esc to
 * cancel. Surfaces a per-cell error if the save fails.
 */
function EditableNumberCell({
  value,
  onSave,
  prefix,
}: {
  value: number;
  onSave: (next: number) => Promise<void>;
  prefix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  async function commit() {
    const parsed = Number(draft);
    if (Number.isNaN(parsed) || parsed === value) {
      setEditing(false);
      setDraft(String(value));
      return;
    }
    setSaving(true);
    setErr(false);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch {
      setErr(true);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className="w-20 rounded border border-input bg-background px-2 py-1 text-right text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={`w-full rounded px-2 py-1 text-right text-sm hover:bg-accent ${
        err ? "text-destructive" : ""
      }`}
      title="Click to edit"
    >
      {prefix}
      {value}
    </button>
  );
}

function GoalsGrid({
  year,
  goals,
  onSave,
}: {
  year: number;
  goals: MonthlyGoal[];
  onSave: (month: number, value: number) => Promise<void>;
}) {
  const byMonth = (m: number) => goals.find((g) => g.month === m);
  return (
    <section className="rounded-lg border border-border bg-card text-card-foreground">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold">Monthly Goals · {year}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Click a target value to edit it.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-6 py-3 font-medium">Month</th>
              <th className="px-6 py-3 text-right font-medium">Target</th>
              <th className="px-6 py-3 text-right font-medium">Achieved</th>
              <th className="px-6 py-3 text-right font-medium">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const g = byMonth(m);
              return (
                <tr key={m} className="border-b border-border last:border-0">
                  <td className="px-6 py-2 font-medium">{monthLabel(m)}</td>
                  <td className="px-6 py-1.5 text-right">
                    <EditableNumberCell
                      value={g?.goal_target ?? 0}
                      onSave={(v) => onSave(m, v)}
                    />
                  </td>
                  <td className="px-6 py-2 text-right text-muted-foreground">
                    {g?.achieved ?? 0}
                  </td>
                  <td className="px-6 py-2 text-right text-muted-foreground">
                    {g?.remaining ?? 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BudgetsGrid({
  year,
  budgets,
  onSave,
}: {
  year: number;
  budgets: MonthlyBudget[];
  onSave: (month: number, value: number) => Promise<void>;
}) {
  const byMonth = (m: number) => budgets.find((b) => b.month === m);
  return (
    <section className="rounded-lg border border-border bg-card text-card-foreground">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold">Monthly Budget · {year}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Click a budget value to edit it.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-6 py-3 font-medium">Month</th>
              <th className="px-6 py-3 text-right font-medium">Budget</th>
              <th className="px-6 py-3 text-right font-medium">Spent</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const b = byMonth(m);
              return (
                <tr key={m} className="border-b border-border last:border-0">
                  <td className="px-6 py-2 font-medium">{monthLabel(m)}</td>
                  <td className="px-6 py-1.5 text-right">
                    <EditableNumberCell
                      value={b?.budget_amount ?? 0}
                      onSave={(v) => onSave(m, v)}
                      prefix="$"
                    />
                  </td>
                  <td className="px-6 py-2 text-right text-muted-foreground">
                    {formatCurrency(b?.spent_amount ?? 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MembersSection({
  projectId,
  members,
  onChange,
}: {
  projectId: string;
  members: ProjectMember[];
  onChange: (next: ProjectMember[]) => void;
}) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const u = await getUsers();
        if (active) setUsers(u);
      } catch {
        // Picker is optional; ignore failures.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const memberIds = new Set(members.map((m) => m.user_id));
  const addableUsers = users.filter((u) => !memberIds.has(u.id));

  async function handleAdd() {
    if (!selectedUser) return;
    setErr(null);
    setBusy(true);
    try {
      await addMember(projectId, selectedUser, roleLabel || null);
      const added = users.find((u) => u.id === selectedUser);
      onChange([
        ...members,
        {
          user_id: selectedUser,
          full_name: added?.full_name ?? "Unknown",
          role_label: roleLabel || null,
        },
      ]);
      setSelectedUser("");
      setRoleLabel("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Unable to add member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId: string) {
    setErr(null);
    setBusy(true);
    try {
      await removeMember(projectId, userId);
      onChange(members.filter((m) => m.user_id !== userId));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Unable to remove member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-sm font-semibold">Members</h2>

      {members.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between py-2.5"
            >
              <div>
                <p className="text-sm font-medium">{m.full_name}</p>
                {m.role_label && (
                  <p className="text-xs text-muted-foreground">
                    {m.role_label}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(m.user_id)}
                disabled={busy}
                className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add member */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select a user…</option>
          {addableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={roleLabel}
          onChange={(e) => setRoleLabel(e.target.value)}
          placeholder="Role (optional)"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || !selectedUser}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Add member
        </button>
      </div>

      {addableUsers.length === 0 && users.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          No users available to add.
        </p>
      )}

      {err && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {err}
        </p>
      )}
    </section>
  );
}
