"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ProjectForm } from "@/components/project-form";
import { ApiError } from "@/lib/api";
import type { ProjectCreate, ProjectDetail } from "@/lib/types";
import { getProject, updateProject } from "@/services/project-service";

export default function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<ProjectDetail | null>(null);
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
        const data = await getProject(id);
        if (active) setProject(data);
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Unable to load the project.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSubmit(values: ProjectCreate) {
    setError(null);
    setSubmitting(true);
    try {
      await updateProject(id, values);
      router.push(`/projects/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to save changes. Please try again.",
      );
      setSubmitting(false);
    }
  }

  const initial: Partial<ProjectCreate> | undefined = project
    ? {
        name: project.name,
        main_niche_id: project.main_niche?.id ?? null,
        project_niche_id: project.project_niche?.id ?? null,
        target_country_id: project.target_country?.id ?? null,
        assignee_id: project.assignee?.id ?? null,
        team_lead_id: project.team_lead?.id ?? null,
        member_ids: project.members?.map((m) => m.user_id) ?? [],
        monthly_budget: project.monthly_budget,
        budget_currency: project.budget_currency,
        budget_period: project.budget_period,
        budget_start_date: project.budget_start_date,
        budget_end_date: project.budget_end_date,
        cost_per_link_target: project.cost_per_link_target,
        target_links: project.target_links,
        status: project.status,
        due_date: project.due_date,
        goal: project.goal,
        notes: project.notes,
      }
    : undefined;

  return (
    <AppShell title={project ? `Edit · ${project.name}` : "Edit Project"}>
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href={`/projects/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to project
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
          <ProjectForm
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
