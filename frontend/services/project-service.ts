/**
 * Typed wrappers around the GPOMS project endpoints (Module 3), including
 * members, monthly goals, and monthly budgets.
 */

import { api } from "@/lib/api";
import type {
  MonthlyBudget,
  MonthlyGoal,
  Page,
  ProjectCreate,
  ProjectDetail,
  ProjectListItem,
  ProjectListParams,
  ProjectMember,
} from "@/lib/types";

type QueryValue = string | number | boolean | undefined | null;

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
