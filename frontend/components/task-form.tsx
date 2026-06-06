"use client";

import { useEffect, useState } from "react";

import { taskPriorityLabel } from "@/components/task-priority-badge";
import { taskStatusLabel } from "@/components/task-status-badge";
import type {
  ProjectListItem,
  TaskCreate,
  TaskPriority,
  TaskStatus,
  UserSummary,
} from "@/lib/types";
import { listProjects } from "@/services/project-service";
import { getUsers } from "@/services/lookup-service";

const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high"];
const STATUS_OPTIONS: TaskStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "overdue",
];

interface TaskFormProps {
  initial?: Partial<TaskCreate>;
  onSubmit: (values: TaskCreate) => void | Promise<void>;
  submitting: boolean;
  submitLabel: string;
  error?: string | null;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelClass = "text-sm font-medium";

/** Shared create/edit form for a task. Loads project + user pickers. */
export function TaskForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
  error,
}: TaskFormProps) {
  const [projectId, setProjectId] = useState(initial?.project_id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [status, setStatus] = useState(initial?.status ?? "pending");

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      // Resolve projects + users independently so one failing pick does not
      // blank the other.
      const [projectsRes, usersRes] = await Promise.allSettled([
        listProjects({ page: 1, page_size: 200, sort: "name" }),
        getUsers(),
      ]);
      if (!active) return;
      if (projectsRes.status === "fulfilled") {
        setProjects(projectsRes.value.items);
      }
      if (usersRes.status === "fulfilled") {
        setUsers(usersRes.value);
      }
      if (projectsRes.status === "rejected" || usersRes.status === "rejected") {
        setLookupError(
          "Some pickers could not load. You can still fill the other fields.",
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values: TaskCreate = {
      project_id: projectId || null,
      name: name.trim(),
      description: description.trim() || null,
      assigned_to: assignedTo || null,
      priority,
      due_date: dueDate || null,
      status,
    };
    void onSubmit(values);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-lg border border-border bg-card p-6 text-card-foreground"
    >
      {lookupError && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {lookupError}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="name" className={labelClass}>
          Task name <span className="text-destructive">*</span>
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Follow up with editor"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="project" className={labelClass}>
            Project
          </label>
          <select
            id="project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="assigned_to" className={labelClass}>
            Assigned to
          </label>
          <select
            id="assigned_to"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className={inputClass}
          >
            <option value="">— Unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={inputClass}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {taskPriorityLabel(p)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="due_date" className={labelClass}>
            Due date
          </label>
          <input
            id="due_date"
            type="date"
            value={dueDate ?? ""}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {taskStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export default TaskForm;
