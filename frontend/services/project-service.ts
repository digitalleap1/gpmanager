/**
 * Typed wrappers around the GPOMS project endpoints (Module 3), including
 * members, monthly goals, and monthly budgets.
 */

import { api } from "@/lib/api";
import { downloadFile, uploadFile } from "@/lib/file-transfer";
import type {
  AuditLogRead,
  BudgetPeriod,
  BudgetSummary,
  BulkAssignResult,
  BulkImportResult,
  Checklist,
  ChecklistStatus,
  MonthlyBudget,
  MonthlyGoal,
  Page,
  ProjectComment,
  ProjectCreate,
  ProjectDetail,
  ProjectListItem,
  ProjectListParams,
  ProjectMember,
  ProjectOverview,
  WebsiteUsedItem,
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

/* --- Project Hub: overview, websites, activity --- */

/** Aggregate budget / link / task / team metrics for a single project. */
export function getProjectOverview(id: string): Promise<ProjectOverview> {
  return api.get<ProjectOverview>(`/projects/${id}/overview`);
}

/** The websites used on a project, with link counts and spend. */
export function getProjectWebsites(id: string): Promise<WebsiteUsedItem[]> {
  return api.get<WebsiteUsedItem[]>(`/projects/${id}/websites`);
}

/** Recent audit-log activity scoped to a single project (newest first). */
export function getProjectActivity(
  id: string,
  limit = 40,
): Promise<AuditLogRead[]> {
  return api.get<AuditLogRead[]>(`/projects/${id}/activity?limit=${limit}`);
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

/* --- Workflow checklist --- */

/**
 * Fetch the project's four-item workflow checklist. The four items are
 * auto-generated on the backend the first time this is called.
 */
export function getChecklist(projectId: string): Promise<Checklist> {
  return api.get<Checklist>(`/projects/${projectId}/checklist`);
}

/**
 * Update one checklist item in a single submit: its status plus, optionally, a
 * note for the timeline, the item's link, and its assignee. Allowed for the
 * project lead / an admin, or the item's own assignee — a 403 is surfaced as an
 * `ApiError`. Empty/undefined optional fields are omitted from the body.
 * Returns the updated checklist.
 */
export function setChecklistStatus(
  projectId: string,
  itemId: string,
  status: ChecklistStatus,
  opts?: {
    note?: string;
    link?: string;
    assigneeId?: string | null;
    paymentType?: string;
    amount?: number;
    currency?: string;
    transactionId?: string;
    paymentMode?: string;
    da?: number;
    pa?: number;
    dr?: number;
    traffic?: number;
    password?: string;
  },
): Promise<Checklist> {
  const body: {
    status: ChecklistStatus;
    note?: string;
    link?: string;
    assignee_id?: string | null;
    payment_type?: string;
    amount?: number;
    currency?: string;
    transaction_id?: string;
    payment_mode?: string;
    da?: number;
    pa?: number;
    dr?: number;
    traffic?: number;
    password?: string;
  } = { status };

  const note = opts?.note?.trim();
  if (note) body.note = note;

  // Send `link` whenever it's provided (even when blank, to allow clearing it).
  if (opts?.link !== undefined) body.link = opts.link.trim();

  // Send `assignee_id` whenever the caller passed the key — `null` clears it.
  if (opts && "assigneeId" in opts) body.assignee_id = opts.assigneeId ?? null;

  // Payment fields — omit blanks; always send `amount` when it's a number (incl 0).
  if (opts?.paymentType) body.payment_type = opts.paymentType;
  if (typeof opts?.amount === "number" && Number.isFinite(opts.amount)) {
    body.amount = opts.amount;
  }
  if (opts?.currency) body.currency = opts.currency;
  const transactionId = opts?.transactionId?.trim();
  if (transactionId) body.transaction_id = transactionId;
  const paymentMode = opts?.paymentMode?.trim();
  if (paymentMode) body.payment_mode = paymentMode;

  // Find-a-Website metrics — send each only when it's a finite number.
  for (const key of ["da", "pa", "dr", "traffic"] as const) {
    const v = opts?.[key];
    if (typeof v === "number" && Number.isFinite(v)) body[key] = v;
  }

  // Admin password to unlock a completed checklist.
  const password = opts?.password?.trim();
  if (password) body.password = password;

  return api.put<Checklist>(
    `/projects/${projectId}/checklist/${itemId}/status`,
    body,
  );
}

/**
 * Add a comment to one checklist item's activity timeline. Available to anyone
 * on the project. Returns the updated checklist.
 */
export function addChecklistComment(
  projectId: string,
  itemId: string,
  body: string,
  subjectId?: string | null,
): Promise<Checklist> {
  return api.post<Checklist>(
    `/projects/${projectId}/checklist/${itemId}/comments`,
    subjectId ? { body, subject_id: subjectId } : { body },
  );
}

/**
 * Request payment for the payment checklist item (managers only). An optional
 * note is recorded on the timeline. Returns the updated checklist.
 */
export function requestChecklistPayment(
  projectId: string,
  itemId: string,
  note?: string,
): Promise<Checklist> {
  return api.post<Checklist>(
    `/projects/${projectId}/checklist/${itemId}/request-payment`,
    note != null ? { note } : {},
  );
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

/* --- Budget cycles (period-based budgets) --- */

/**
 * Aggregate budget snapshot for a project, including the `auto_renew` flag.
 * Readable by anyone with project access; only the mutating endpoints below
 * are manager-only on the backend.
 */
export function getBudgetSummary(projectId: string): Promise<BudgetSummary> {
  return api.get<BudgetSummary>(`/budget/projects/${projectId}/summary`);
}

/** List a project's budget periods, newest first. */
export function listBudgetPeriods(projectId: string): Promise<BudgetPeriod[]> {
  return api.get<BudgetPeriod[]>(`/budget/projects/${projectId}/periods`);
}

/** Force-generate the current/missing budget periods now. Returns the list. */
export function renewBudgetPeriods(projectId: string): Promise<BudgetPeriod[]> {
  return api.post<BudgetPeriod[]>(
    `/budget/projects/${projectId}/periods/renew`,
    {},
  );
}

/** Edit a single budget period's amount. Returns the updated period. */
export function setBudgetPeriodAmount(
  projectId: string,
  periodId: string,
  amount: number,
): Promise<BudgetPeriod> {
  return api.put<BudgetPeriod>(
    `/budget/projects/${projectId}/periods/${periodId}`,
    { amount },
  );
}

/** Toggle whether new periods auto-renew at the base amount. */
export function setBudgetAutoRenew(
  projectId: string,
  autoRenew: boolean,
): Promise<BudgetSummary> {
  return api.patch<BudgetSummary>(`/budget/projects/${projectId}/auto-renew`, {
    auto_renew: autoRenew,
  });
}
