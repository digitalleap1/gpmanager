"use client";

/**
 * Workflow Checklist card for the project hub.
 *
 * Per project, a manager (admin / team lead / superuser) picks ONE person for
 * each of three ordered stages — Website Review, Content Writing, Payment.
 * Each assignment creates a Task for that person on the backend. A stage shows
 * its derived status; when all three are done the workflow is complete.
 * Non-managers see a read-only view (selects disabled, assignee shown as text).
 */

import {
  Check,
  CreditCard,
  Globe,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type { Checklist, ChecklistStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  assignChecklistStage,
  getChecklist,
} from "@/services/project-service";
import { listUsers } from "@/services/user-service";

/** A user the workflow stages can be assigned to. */
interface PersonOption {
  id: string;
  full_name: string;
}

/** Per-stage decoration (icon) keyed by stage_key, with a sensible fallback. */
const STAGE_ICONS: Record<string, LucideIcon> = {
  website_review: Globe,
  content_writing: PenLine,
  payment: CreditCard,
};

/** Map an unknown error to a friendly, ApiError-aware message. */
function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return "Only team leads and admins can assign workflow stages.";
    }
    return err.message;
  }
  return fallback;
}

export function WorkflowChecklist({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const isManager =
    !!user &&
    (user.is_superuser ||
      user.roles.includes("admin") ||
      user.roles.includes("team_lead"));

  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which stage is mid-save (so we can disable just that row), plus any error
  // raised by the most recent assignment attempt.
  const [savingStage, setSavingStage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch the checklist and the assignable people together. Managers need
      // the people list to populate the dropdowns; for non-managers it is
      // harmless and keeps a single code path.
      const [data, users] = await Promise.all([
        getChecklist(projectId),
        listUsers(),
      ]);
      setChecklist(data);
      setPeople(
        users.map((u) => ({ id: u.id, full_name: u.full_name })),
      );
    } catch (err) {
      setError(errMsg(err, "Unable to load the workflow checklist."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAssign(stageKey: string, assigneeId: string | null) {
    setSaveError(null);
    setSavingStage(stageKey);
    try {
      const updated = await assignChecklistStage(
        projectId,
        stageKey,
        assigneeId,
      );
      setChecklist(updated);
    } catch (err) {
      setSaveError(errMsg(err, "Unable to update the workflow stage."));
    } finally {
      setSavingStage(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold text-[#1A1F4D]">
          Workflow Checklist
        </h2>
        {checklist && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {checklist.completed_count} / {checklist.total}
            </span>
            {checklist.all_done && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                <Check className="h-3.5 w-3.5" />
                Workflow Complete
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-6 py-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading checklist…</p>
        ) : error ? (
          <div>
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Try again
            </button>
          </div>
        ) : !checklist ? null : (
          <>
            {saveError && (
              <p
                role="alert"
                className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {saveError}
              </p>
            )}
            <ol className="space-y-3">
              {checklist.stages.map((stage, index) => (
                <StageRow
                  key={stage.stage_key}
                  stage={stage}
                  ordinal={index + 1}
                  people={people}
                  isManager={isManager}
                  saving={savingStage === stage.stage_key}
                  disabled={savingStage !== null}
                  onAssign={handleAssign}
                />
              ))}
            </ol>
            {isManager && people.length === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                No users are available to assign yet.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * One stage row
 * ------------------------------------------------------------------ */

function StageRow({
  stage,
  ordinal,
  people,
  isManager,
  saving,
  disabled,
  onAssign,
}: {
  stage: ChecklistStage;
  ordinal: number;
  people: PersonOption[];
  isManager: boolean;
  saving: boolean;
  disabled: boolean;
  onAssign: (stageKey: string, assigneeId: string | null) => void;
}) {
  const Icon = STAGE_ICONS[stage.stage_key];
  const value = stage.assignee?.id ?? "";

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-background/50 p-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Stage label + ordinal/icon */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {Icon ? (
            <Icon className="h-4 w-4" />
          ) : (
            <span className="text-xs font-semibold">{ordinal}</span>
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <span className="mr-1.5 text-xs font-semibold text-muted-foreground">
              {ordinal}.
            </span>
            {stage.label}
          </p>
          {!isManager && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {stage.assignee?.full_name ?? "Unassigned"}
            </p>
          )}
        </div>
      </div>

      {/* Assignee control + status */}
      <div className="flex items-center gap-3 sm:justify-end">
        {isManager ? (
          <select
            value={value}
            disabled={disabled}
            aria-label={`Assign ${stage.label}`}
            onChange={(e) =>
              onAssign(stage.stage_key, e.target.value || null)
            }
            className="w-full max-w-[14rem] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:w-auto"
          >
            <option value="">— Unassigned —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted-foreground">
            {stage.assignee?.full_name ?? "Unassigned"}
          </span>
        )}
        <StageStatusBadge stage={stage} saving={saving} />
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Status badge — derived from `done` + `task_status`
 * ------------------------------------------------------------------ */

function StageStatusBadge({
  stage,
  saving,
}: {
  stage: ChecklistStage;
  saving: boolean;
}) {
  const base =
    "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";

  if (saving) {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        Saving…
      </span>
    );
  }

  // Done wins regardless of the underlying task status.
  if (stage.done || stage.task_status === "completed") {
    return (
      <span className={cn(base, "bg-green-100 text-green-700")}>
        <Check className="h-3.5 w-3.5" />
        Done
      </span>
    );
  }

  if (!stage.assignee) {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        Unassigned
      </span>
    );
  }

  if (stage.task_status === "in_progress") {
    return (
      <span className={cn(base, "bg-blue-100 text-blue-700")}>
        In&nbsp;Progress
      </span>
    );
  }

  if (stage.task_status === "overdue") {
    return (
      <span className={cn(base, "bg-red-100 text-red-700")}>Overdue</span>
    );
  }

  return (
    <span className={cn(base, "bg-slate-100 text-slate-700")}>Pending</span>
  );
}

export default WorkflowChecklist;
