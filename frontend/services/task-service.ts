/**
 * Typed wrappers around the GPOMS task endpoints (Module 8).
 *
 * Covers listing/filtering, CRUD, the "complete" quick action, and per-task
 * comments. Creating/deleting tasks is restricted to managers on the backend
 * (a 403 should be surfaced as a friendly message by callers).
 */

import { api } from "@/lib/api";
import type {
  Page,
  TaskComment,
  TaskCreate,
  TaskDetail,
  TaskListItem,
  TaskListParams,
  TaskUpdate,
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

export function listTasks(
  params: TaskListParams = {},
): Promise<Page<TaskListItem>> {
  const query: Record<string, QueryValue> = {
    page: params.page,
    page_size: params.page_size,
    project_id: params.project_id,
    status: params.status,
    priority: params.priority,
    assigned_to: params.assigned_to,
    due_before: params.due_before,
    search: params.search,
    sort: params.sort,
  };
  return api.get<Page<TaskListItem>>(`/tasks${buildQuery(query)}`);
}

export function getTask(id: string): Promise<TaskDetail> {
  return api.get<TaskDetail>(`/tasks/${id}`);
}

export function createTask(data: TaskCreate): Promise<TaskListItem> {
  return api.post<TaskListItem>("/tasks", data);
}

export function updateTask(
  id: string,
  data: TaskUpdate,
): Promise<TaskListItem> {
  return api.patch<TaskListItem>(`/tasks/${id}`, data);
}

/** Mark a task complete (assignee or manager); sets status=completed. */
export function completeTask(id: string): Promise<TaskListItem> {
  return api.post<TaskListItem>(`/tasks/${id}/complete`, {});
}

export function addComment(id: string, body: string): Promise<TaskComment> {
  return api.post<TaskComment>(`/tasks/${id}/comments`, { body });
}

export function removeTask(id: string): Promise<void> {
  return api.delete<void>(`/tasks/${id}`);
}
