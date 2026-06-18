"use client";

import { Check, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  TaskPriorityBadge,
  taskPriorityLabel,
} from "@/components/task-priority-badge";
import {
  TaskStatusBadge,
  taskStatusLabel,
} from "@/components/task-status-badge";
import { ApiError } from "@/lib/api";
import type {
  ProjectListItem,
  TaskListItem,
  TaskPriority,
  TaskStatus,
  UserSummary,
} from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { completeTask, listTasks, removeTask } from "@/services/task-service";
import { getUsers } from "@/services/lookup-service";
import { listProjects } from "@/services/project-service";

const PAGE_SIZE = 20;
const STATUS_OPTIONS: TaskStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "overdue",
];
const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high"];

/** Whether a task is overdue: explicitly flagged, or past due and not done. */
function isOverdue(task: TaskListItem): boolean {
  if (task.status === "completed") return false;
  if (task.status === "overdue") return true;
  if (!task.due_date) return false;
  const due = new Date(task.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export default function TasksPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueBefore, setDueBefore] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<TaskListItem[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filter pickers.
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);

  // Debounce the search box into the active `search` filter.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load filter pickers once.
  useEffect(() => {
    let active = true;
    (async () => {
      const [projectsRes, usersRes] = await Promise.allSettled([
        listProjects({ page: 1, page_size: 200, sort: "name" }),
        getUsers(),
      ]);
      if (!active) return;
      if (projectsRes.status === "fulfilled") setProjects(projectsRes.value.items);
      if (usersRes.status === "fulfilled") setUsers(usersRes.value);
    })();
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTasks({
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        project_id: projectId || undefined,
        status: status || undefined,
        priority: priority || undefined,
        assigned_to: assignedTo || undefined,
        due_before: dueBefore || undefined,
        sort: "-created_at",
      });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load tasks. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, projectId, status, priority, assignedTo, dueBefore]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleComplete(task: TaskListItem) {
    setActionError(null);
    setBusyId(task.id);
    try {
      await completeTask(task.id);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 403
          ? "Only the assignee or a manager can complete this task."
          : err instanceof ApiError
            ? err.message
            : "Unable to complete the task.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(task: TaskListItem) {
    if (
      !window.confirm(`Delete task "${task.name}"? This cannot be undone.`)
    ) {
      return;
    }
    setActionError(null);
    setBusyId(task.id);
    try {
      await removeTask(task.id);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 403
          ? "Only managers can delete tasks."
          : err instanceof ApiError
            ? err.message
            : "Unable to delete the task.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Tasks">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search tasks…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-xs"
            />
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {taskStatusLabel(s)}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All priorities</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {taskPriorityLabel(p)}
                </option>
              ))}
            </select>
            <select
              value={assignedTo}
              onChange={(e) => {
                setAssignedTo(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All assignees</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueBefore}
              onChange={(e) => {
                setDueBefore(e.target.value);
                setPage(1);
              }}
              aria-label="Due before"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Link
            href="/tasks/new"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New Task
          </Link>
        </div>

        {actionError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : error ? (
            <p
              role="alert"
              className="px-4 py-8 text-center text-sm text-destructive"
            >
              {error}
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No tasks found.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Assigned</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Due date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const overdue = isOverdue(t);
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-border last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/tasks/${t.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {t.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {t.project_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {t.assigned_to?.full_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <TaskPriorityBadge priority={t.priority} />
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3",
                          overdue
                            ? "font-medium text-red-600"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatDate(t.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <TaskStatusBadge status={t.status} />
                          {t.locked && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                              title="Locked — its payment was approved"
                            >
                              <Lock className="h-3 w-3" />
                              Locked
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {t.locked ? (
                            <span
                              className="rounded-md p-1.5 text-muted-foreground/60"
                              title="Locked — its payment was approved"
                            >
                              <Lock className="h-4 w-4" />
                            </span>
                          ) : (
                            <>
                              {t.status !== "completed" && (
                                <button
                                  type="button"
                                  onClick={() => handleComplete(t)}
                                  disabled={busyId === t.id}
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-green-100 hover:text-green-700 disabled:opacity-50"
                                  title="Mark complete"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                              )}
                              <Link
                                href={`/tasks/${t.id}/edit`}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleDelete(t)}
                                disabled={busyId === t.id}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && items.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} task{total === 1 ? "" : "s"} · page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-accent disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
