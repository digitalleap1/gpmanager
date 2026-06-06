"use client";

import { Check, Pencil } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  TaskPriorityBadge,
} from "@/components/task-priority-badge";
import {
  TaskStatusBadge,
  taskStatusLabel,
} from "@/components/task-status-badge";
import { ApiError } from "@/lib/api";
import type { TaskComment, TaskDetail, TaskStatus } from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";
import {
  addComment,
  completeTask,
  getTask,
  updateTask,
} from "@/services/task-service";

const STATUS_OPTIONS: TaskStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "overdue",
];

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTask(id);
      setTask(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load the task. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title={task?.name ?? "Task"}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : task ? (
        <div className="space-y-6">
          {/* Header actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/tasks"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to list
            </Link>
            <Link
              href={`/tasks/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </div>

          {/* Overview */}
          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">{task.name}</h2>
              <TaskStatusBadge status={task.status} />
              <TaskPriorityBadge priority={task.priority} />
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Project"
                value={
                  task.project_id ? (
                    <Link
                      href={`/projects/${task.project_id}`}
                      className="text-primary hover:underline"
                    >
                      {task.project_name ?? "View project"}
                    </Link>
                  ) : null
                }
              />
              <Field
                label="Assigned to"
                value={task.assigned_to?.full_name ?? null}
              />
              <Field label="Due date" value={formatDate(task.due_date)} />
              <Field
                label="Completed"
                value={
                  task.completed_at ? formatDate(task.completed_at) : null
                }
              />
              <Field label="Created" value={formatDate(task.created_at)} />
              <Field label="Updated" value={formatDate(task.updated_at)} />
            </dl>

            {task.description && (
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {task.description}
                </p>
              </div>
            )}
          </section>

          {/* Status control */}
          <StatusControl
            taskId={id}
            currentStatus={task.status}
            reload={load}
          />

          {/* Comments */}
          <Comments
            taskId={id}
            comments={task.comments}
            reload={load}
          />
        </div>
      ) : null}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */

function Field({ label, value }: { label: string; value: React.ReactNode }) {
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
 * Status control: choose any of the 4 statuses and save (assignee or manager),
 * plus a prominent "Mark complete" shortcut that hits the dedicated endpoint.
 */
function StatusControl({
  taskId,
  currentStatus,
  reload,
}: {
  taskId: string;
  currentStatus: string;
  reload: () => Promise<void>;
}) {
  const [nextStatus, setNextStatus] = useState(currentStatus);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep the dropdown in sync when the task reloads with a new status.
  useEffect(() => {
    setNextStatus(currentStatus);
  }, [currentStatus]);

  function friendly(e: unknown): string {
    if (e instanceof ApiError && e.status === 403) {
      return "Only the assignee or a manager can change this task.";
    }
    if (e instanceof ApiError) return e.message;
    return "Unable to update the task.";
  }

  async function handleApply() {
    setErr(null);
    setBusy(true);
    try {
      await updateTask(taskId, { status: nextStatus });
      await reload();
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    setErr(null);
    setCompleting(true);
    try {
      await completeTask(taskId);
      await reload();
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setCompleting(false);
    }
  }

  const unchanged = nextStatus === currentStatus;
  const alreadyDone = currentStatus === "completed";

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Status</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Current status:{" "}
            <span className="font-medium">
              {taskStatusLabel(currentStatus)}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleComplete}
          disabled={completing || alreadyDone}
          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {alreadyDone
            ? "Completed"
            : completing
              ? "Completing…"
              : "Mark complete"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:max-w-md">
        <div className="space-y-1.5">
          <label htmlFor="next_status" className="text-sm font-medium">
            Set status
          </label>
          <select
            id="next_status"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {taskStatusLabel(s)}
              </option>
            ))}
          </select>
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
          className="justify-self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Apply status"}
        </button>
      </div>
    </section>
  );
}

/** Comments list (newest-first) plus an add-comment box. */
function Comments({
  taskId,
  comments,
  reload,
}: {
  taskId: string;
  comments: TaskComment[];
  reload: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ordered = [...comments].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setErr(null);
    setBusy(true);
    try {
      await addComment(taskId, text);
      setBody("");
      await reload();
    } catch (e2) {
      setErr(
        e2 instanceof ApiError ? e2.message : "Unable to add the comment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-sm font-semibold">Comments</h2>

      <form onSubmit={handleAdd} className="mt-4 space-y-2">
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {err && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {err}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || body.trim() === ""}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Posting…" : "Add comment"}
        </button>
      </form>

      {ordered.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          No comments yet.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {ordered.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border bg-background p-4"
            >
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {c.author?.full_name ?? "Unknown"}
                </span>{" "}
                · {relativeTime(c.created_at)} · {formatDate(c.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
