"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ProjectForm } from "@/components/project-form";
import { ApiError } from "@/lib/api";
import type { ProjectCreate } from "@/lib/types";
import { createProject } from "@/services/project-service";

export default function NewProjectPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: ProjectCreate) {
    setError(null);
    setSubmitting(true);
    try {
      const created = await createProject(values);
      router.push(`/projects/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to create the project. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="New Project">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to projects
        </Link>
        <ProjectForm
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Create project"
          error={error}
        />
      </div>
    </AppShell>
  );
}
