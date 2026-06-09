/**
 * Typed wrappers around the GPOMS project endpoints (Module 3), including
 * members, monthly goals, and monthly budgets.
 */

import { api } from "@/lib/api";
import { downloadFile, uploadFile } from "@/lib/file-transfer";
import type {
  BulkAssignResult,
  BulkImportResult,
  MonthlyBudget,
  MonthlyGoal,
  Page,
  ProjectComment,
  ProjectCreate,
  ProjectDetail,
  ProjectListItem,
  ProjectListParams,
  ProjectMember,
} from "@/lib/types";

type QueryValue = string | number | boolean | undefined | null;

/** Bulk import/export file format accepted by the project endpoints. */
type FileFormat = "csv" | "xlsx";

/** Build a `?key=value` query string from defined params only. */
function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function listProjects(
  params: ProjectListParams = {},
): Promise<Page<ProjectListItem>> {
  const query: Record<string, QueryValue> = {
    page: params.page,
    page_size: params.page_size,
    search: params.search,
    status: params.status,
    main_niche_id: params.main_niche_id,
    target_country_id: params.target_country_id,
    team_lead_id: params.team_lead_id,
    assignee_id: params.assignee_id,
    client_id: params.client_id,
    archived: params.archived,
    sort: params.sort,
  };
  return api.get<Page<ProjectListItem>>(`/projects${buildQuery(query)}`);
}

export function getProject(id: string): Promise<ProjectDetail> {
  return api.get<ProjectDetail>(`/projects/${id}`);
}

export function createProject(data: ProjectCreate): Promise<ProjectListItem> {
  return api.post<ProjectListItem>("/projects", data);
}

export function updateProject(
  id: string,
  data: Partial<ProjectCreate>,
): Promise<ProjectListItem> {
  return api.patch<ProjectListItem>(`/projects/${id}`, data);
}

export function removeProject(id: string): Promise<void> {
  return api.delete<void>(`/projects/${id}`);
}

export function archiveProject(
  id: string,
  archived: boolean,
): Promise<ProjectListItem> {
  return api.post<ProjectListItem>(`/projects/${id}/archive`, { archived });
}

/**
 * Bulk-assign an assignee and/or team lead to many projects at once.
 * Manager-only on the backend; the server enforces RBAC scope and the
 * team-lead assignment rule, so callers only get back how many rows were
 * `updated` vs `skipped`. At least one of `assignee_id` / `team_lead_id`
 * must be provided.
 */
export function bulkAssignProjects(
  projectIds: string[],
  opts: { assignee_id?: string | null; team_lead_id?: string | null },
): Promise<BulkAssignResult> {
  return api.post<BulkAssignResult>("/projects/bulk-assign", {
    project_ids: projectIds,
    ...opts,
  });
}

/**
 * Bulk-delete many projects at once, moving each (plus its linked payments &
 * guest posts) to Trash where they remain recoverable. Manager-only and
 * RBAC-scoped on the backend, so only projects the caller can see are removed.
 * Requires the caller's own login `password`; a wrong password is rejected with
 * a 400 ("Password confirmation is incorrect"). Returns how many rows were
 * `deleted` vs `skipped`.
 */
export function bulkDeleteProjects(
  projectIds: string[],
  password: string,
): Promise<{ deleted: number; skipped: number }> {
  return api.post<{ deleted: number; skipped: number }>(
    "/projects/bulk-delete",
    { project_ids: projectIds, password },
  );
}

/* --- Bulk import / export --- */

/** Bulk-import projects from a `.csv` or `.xlsx` file (multipart upload). */
export function importProjects(file: File): Promise<BulkImportResult> {
  return uploadFile<BulkImportResult>("/projects/import", file);
}

/** Trigger a download (CSV or XLSX) of all projects. Defaults to CSV. */
export function exportProjects(format: FileFormat = "csv"): Promise<void> {
  return downloadFile(
    `/projects/export${buildQuery({ format })}`,
    `projects.${format}`,
  );
}

/** Download a blank projects import template (CSV or XLSX). */
export function downloadProjectsTemplate(
  format: FileFormat = "csv",
): Promise<void> {
  return downloadFile(
    `/projects/template${buildQuery({ format })}`,
    `projects-template.${format}`,
  );
}

/* --- Members --- */

export function getMembers(id: string): Promise<ProjectMember[]> {
  return api.get<ProjectMember[]>(`/projects/${id}/members`);
}

export function addMember(
  id: string,
  userId: string,
  roleLabel?: string | null,
): Promise<void> {
  return api.post<void>(`/projects/${id}/members`, {
    user_id: userId,
    role_label: roleLabel ?? null,
  });
}

export function removeMember(id: string, userId: string): Promise<void> {
  return api.delete<void>(`/projects/${id}/members/${userId}`);
}

/* --- Comments --- */

/** List a project's comments (newest first). */
export function listProjectComments(id: string): Promise<ProjectComment[]> {
  return api.get<ProjectComment[]>(`/projects/${id}/comments`);
}

/** Post a new comment on a project. Notifies the assignee/lead + admins. */
export function addProjectComment(
  id: string,
  body: string,
): Promise<ProjectComment> {
  return api.post<ProjectComment>(`/projects/${id}/comments`, { body });
}

/* --- Monthly goals --- */

export function getGoals(id: string, year: number): Promise<MonthlyGoal[]> {
  return api.get<MonthlyGoal[]>(`/projects/${id}/goals?year=${year}`);
}

export function setGoal(
  id: string,
  year: number,
  month: number,
  goalTarget: number,
): Promise<MonthlyGoal> {
  return api.put<MonthlyGoal>(`/projects/${id}/goals/${year}/${month}`, {
    goal_target: goalTarget,
  });
}

/* --- Monthly budgets --- */

export function getBudgets(id: string, year: number): Promise<MonthlyBudget[]> {
  return api.get<MonthlyBudget[]>(`/projects/${id}/budgets?year=${year}`);
}

export function setBudget(
  id: string,
  year: number,
  month: number,
  budgetAmount: number,
): Promise<MonthlyBudget> {
  return api.put<MonthlyBudget>(`/projects/${id}/budgets/${year}/${month}`, {
    budget_amount: budgetAmount,
  });
}
