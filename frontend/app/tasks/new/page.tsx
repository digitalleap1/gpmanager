"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { TaskForm } from "@/components/task-form";
import { ApiError } from "@/lib/api";
import type { TaskCreate } from "@/lib/types";
import { createTask } from "@/services/task-service";

export default function NewTaskPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: TaskCreate) {
    setError(null);
    setSubmitting(true);
    try {
      const created = await createTask(values);
      router.push(`/tasks/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "Only managers can create tasks."
          : err instanceof ApiError
            ? err.message
            : "Unable to create the task. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="New Task">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href="/tasks"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to tasks
        </Link>
        <TaskForm
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Create task"
          error={error}
        />
      </div>
    </AppShell>
  );
}
