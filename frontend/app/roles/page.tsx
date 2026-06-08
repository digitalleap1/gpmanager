"use client";
import {
  Lock,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users as UsersIcon,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type { PermissionGroup, RoleDetail } from "@/lib/types";
import {
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  updateRole,
} from "@/services/role-service";

/* ------------------------------------------------------------------ */

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** `guest_post.create` → "Create"; falls back to a humanized whole code. */
function humanizePermission(code: string, description: string | null): string {
  if (description) return description;
  const action = code.includes(".") ? code.split(".").slice(1).join(".") : code;
  return humanizeToken(action);
}

/** `guest_post` → "Guest Post"; `link_insertion` → "Link Insertion". */
function humanizeToken(token: string): string {
  return token
    .replace(/[._]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ------------------------------------------------------------------ */

export default function RolesPage() {
  const { user: me } = useAuth();
  const isAdmin = Boolean(
    me && (me.is_superuser || me.roles.includes("admin")),
  );

  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roleData, permData] = await Promise.all([
        listRoles(),
        listPermissions(),
      ]);
      setRoles(roleData);
      setGroups(permData);
      setSelectedId((prev) =>
        prev && roleData.some((r) => r.id === prev)
          ? prev
          : (roleData[0]?.id ?? null),
      );
    } catch (err) {
      setError(errMsg(err, "Unable to load roles. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );

  async function handleDelete(role: RoleDetail) {
    if (
      !window.confirm(
        `Delete the "${role.name}" role? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setBusyId(role.id);
    try {
      await deleteRole(role.id);
      await load();
    } catch (err) {
      setActionError(errMsg(err, "Unable to delete the role."));
    } finally {
      setBusyId(null);
    }
  }

  // Replace a single role in place after a save (keeps selection + scroll).
  function patchRole(updated: RoleDetail) {
    setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  if (!isAdmin) {
    return (
      <AppShell title="Roles & Permissions">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold text-[#1A1F4D]">
            Administrators only
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You need an administrator role to manage roles & permissions.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Roles & Permissions">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Define what each role can do. System roles are built-in; create
            custom roles for finer-grained access.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New role
          </button>
        </div>

        {actionError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}

        {loading ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-sm">
            Loading…
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-destructive shadow-sm"
          >
            {error}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
            {/* Role list */}
            <div className="space-y-2">
              {roles.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-sm">
                  No roles yet.
                </p>
              ) : (
                roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedId(role.id)}
                    className={`w-full rounded-xl border bg-card p-4 text-left shadow-sm transition hover:shadow-md ${
                      selectedId === role.id
                        ? "border-primary ring-1 ring-primary"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-[#1A1F4D]">
                        {role.name}
                      </span>
                      {role.is_system ? (
                        <Badge className="bg-indigo-100 text-indigo-700">
                          System
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">
                          Custom
                        </Badge>
                      )}
                    </div>
                    {role.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {role.description}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        {role.editable
                          ? `${role.permission_codes.length} permission${
                              role.permission_codes.length === 1 ? "" : "s"
                            }`
                          : "Full access"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UsersIcon className="h-3 w-3" />
                        {role.user_count} user
                        {role.user_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Permission editor */}
            <div>
              {selected ? (
                <RoleEditor
                  key={selected.id}
                  role={selected}
                  groups={groups}
                  busy={busyId === selected.id}
                  onSaved={patchRole}
                  onDelete={() => handleDelete(selected)}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground shadow-sm">
                  Select a role to view its permissions.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {creating && (
        <CreateRoleModal
          groups={groups}
          onClose={() => setCreating(false)}
          onSaved={(role) => {
            setCreating(false);
            setSelectedId(role.id);
            void load();
          }}
        />
      )}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ *
 * Role editor (right pane)
 * ------------------------------------------------------------------ */

function RoleEditor({
  role,
  groups,
  busy,
  onSaved,
  onDelete,
}: {
  role: RoleDetail;
  groups: PermissionGroup[];
  busy: boolean;
  onSaved: (role: RoleDetail) => void;
  onDelete: () => void;
}) {
  const editable = role.editable;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(role.permission_codes),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const allCodes = useMemo(
    () => groups.flatMap((g) => g.permissions.map((p) => p.code)),
    [groups],
  );

  // For the admin role (non-editable) every box is shown checked + disabled.
  const effectiveSelected = editable ? selected : new Set(allCodes);

  const dirty = useMemo(() => {
    if (!editable) return false;
    const original = new Set(role.permission_codes);
    if (original.size !== selected.size) return true;
    for (const c of selected) if (!original.has(c)) return true;
    return false;
  }, [editable, role.permission_codes, selected]);

  function toggle(code: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleGroup(group: PermissionGroup, checked: boolean) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (checked) next.add(p.code);
        else next.delete(p.code);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await updateRole(role.id, {
        permission_codes: Array.from(selected),
      });
      setSelected(new Set(updated.permission_codes));
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      setSaveError(errMsg(err, "Unable to save permissions."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-[#1A1F4D]">
              {role.name}
            </h2>
            {role.is_system ? (
              <Badge className="bg-indigo-100 text-indigo-700">System</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-600">Custom</Badge>
            )}
          </div>
          {role.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {role.description}
            </p>
          )}
        </div>
        {!role.is_system && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete role
          </button>
        )}
      </div>

      {!editable && (
        <p className="flex items-start gap-2 border-b border-border bg-primary/5 px-5 py-3 text-sm text-primary">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          The administrator role always has full access — its permissions can&apos;t
          be changed.
        </p>
      )}

      {/* Checklist */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {groups.length === 0 ? (
          <p className="text-sm italic text-muted-foreground/70">
            No permissions defined.
          </p>
        ) : (
          groups.map((group) => {
            const total = group.permissions.length;
            const checkedCount = group.permissions.filter((p) =>
              effectiveSelected.has(p.code),
            ).length;
            const allChecked = total > 0 && checkedCount === total;
            return (
              <fieldset key={group.module} className="space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-1.5">
                  <legend className="text-sm font-semibold text-[#1A1F4D]">
                    {humanizeToken(group.module)}
                  </legend>
                  <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      disabled={!editable}
                      onChange={(e) => toggleGroup(group, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-ring disabled:cursor-not-allowed"
                    />
                    Select all
                  </label>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {group.permissions.map((p) => (
                    <label
                      key={p.code}
                      className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 ${
                        editable
                          ? "cursor-pointer hover:bg-accent"
                          : "cursor-not-allowed opacity-90"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={effectiveSelected.has(p.code)}
                        disabled={!editable}
                        onChange={() => toggle(p.code)}
                        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring disabled:cursor-not-allowed"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {humanizePermission(p.code, p.description)}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {p.code}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })
        )}
      </div>

      {/* Sticky footer */}
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
        <div className="min-w-0 text-sm">
          {saveError ? (
            <span role="alert" className="text-destructive">
              {saveError}
            </span>
          ) : saved ? (
            <span className="text-green-600">Permissions updated.</span>
          ) : editable ? (
            <span className="text-muted-foreground">
              {effectiveSelected.size} permission
              {effectiveSelected.size === 1 ? "" : "s"} selected
            </span>
          ) : (
            <span className="text-muted-foreground">Read-only role</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!editable || !dirty || saving}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Create-role modal
 * ------------------------------------------------------------------ */

function CreateRoleModal({
  groups,
  onClose,
  onSaved,
}: {
  groups: PermissionGroup[];
  onClose: () => void;
  onSaved: (role: RoleDetail) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleGroup(group: PermissionGroup, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (checked) next.add(p.code);
        else next.delete(p.code);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const role = await createRole({
        name: name.trim(),
        description: description.trim() || null,
        permission_codes: Array.from(selected),
      });
      onSaved(role);
    } catch (err) {
      setFormError(errMsg(err, "Unable to create the role. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Create role" onClose={onClose} wide>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5"
      >
        <div className="space-y-4">
          <Field label="Role name">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD_CLS}
              placeholder="Outreach Specialist"
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${FIELD_CLS} min-h-[60px] resize-y`}
              placeholder="What this role is for…"
            />
          </Field>

          <div className="space-y-1">
            <span className="text-sm font-medium text-foreground">
              Permissions ({selected.size} selected)
            </span>
            <div className="max-h-72 space-y-4 overflow-y-auto rounded-md border border-border p-3">
              {groups.length === 0 ? (
                <p className="text-sm italic text-muted-foreground/70">
                  No permissions defined.
                </p>
              ) : (
                groups.map((group) => {
                  const allChecked =
                    group.permissions.length > 0 &&
                    group.permissions.every((p) => selected.has(p.code));
                  return (
                    <fieldset key={group.module} className="space-y-1.5">
                      <div className="flex items-center justify-between border-b border-border pb-1">
                        <legend className="text-sm font-semibold text-[#1A1F4D]">
                          {humanizeToken(group.module)}
                        </legend>
                        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={(e) =>
                              toggleGroup(group, e.target.checked)
                            }
                            className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-ring"
                          />
                          Select all
                        </label>
                      </div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {group.permissions.map((p) => (
                          <label
                            key={p.code}
                            className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 hover:bg-accent"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(p.code)}
                              onChange={() => toggle(p.code)}
                              className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm text-foreground">
                                {humanizePermission(p.code, p.description)}
                              </span>
                              <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                {p.code}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })
              )}
            </div>
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create role"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Shared primitives
 * ------------------------------------------------------------------ */

function Badge({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1A1F4D]/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative z-10 flex max-h-[90vh] w-full flex-col rounded-xl border border-border bg-card shadow-xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-[#1A1F4D]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const FIELD_CLS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
