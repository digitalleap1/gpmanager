"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { TaskForm } from "@/components/task-form";
import { ApiError } from "@/lib/api";
import type { TaskCreate, TaskDetail } from "@/lib/types";
import { getTask, updateTask } from "@/services/task-service";

export default function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [task, setTask] = useState<TaskDetail | null>(null);
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
        const data = await getTask(id);
        if (active) setTask(data);
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof ApiError ? err.message : "Unable to load the task.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSubmit(values: TaskCreate) {
    setError(null);
    setSubmitting(true);
    try {
      await updateTask(id, values);
      router.push(`/tasks/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "You do not have permission to edit this task."
          : err instanceof ApiError
            ? err.message
            : "Unable to save changes. Please try again.",
      );
      setSubmitting(false);
    }
  }

  const initial: Partial<TaskCreate> | undefined = task
    ? {
        project_id: task.project_id,
        name: task.name,
        description: task.description,
        assigned_to: task.assigned_to?.id ?? null,
        priority: task.priority,
        due_date: task.due_date,
        status: task.status,
      }
    : undefined;

  return (
    <AppShell title={task ? `Edit · ${task.name}` : "Edit Task"}>
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href={`/tasks/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to task
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
          <TaskForm
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
