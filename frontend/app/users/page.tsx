"use client";

import {
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type {
  RoleRead,
  RoleSlug,
  UserAdminRead,
  UserStatus,
} from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";
import {
  createUser,
  deleteUser,
  listRoles,
  listUsers,
  resetUserPassword,
  updateUser,
} from "@/services/user-service";

const ROLE_META: Record<string, { label: string; cls: string }> = {
  admin: { label: "Administrator", cls: "bg-primary/10 text-primary" },
  team_lead: { label: "Team Lead", cls: "bg-indigo-100 text-indigo-700" },
  user: { label: "Member", cls: "bg-slate-100 text-slate-600" },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-green-100 text-green-700" },
  suspended: { label: "Suspended", cls: "bg-amber-100 text-amber-700" },
  deactivated: { label: "Deactivated", cls: "bg-slate-200 text-slate-600" },
};

const ROLE_PRECEDENCE: RoleSlug[] = ["admin", "team_lead", "user"];

/** Pick the most privileged role slug present on a user. */
function primaryRole(user: UserAdminRead): string {
  if (user.is_superuser && user.roles.includes("admin")) return "admin";
  for (const slug of ROLE_PRECEDENCE) {
    if (user.roles.includes(slug)) return slug;
  }
  return user.roles[0] ?? "user";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

type ModalState =
  | { kind: "create" }
  | { kind: "edit"; user: UserAdminRead }
  | { kind: "password"; user: UserAdminRead }
  | null;

function UsersPageInner() {
  const { user: me } = useAuth();
  const searchParams = useSearchParams();
  const isAdmin = Boolean(
    me && (me.is_superuser || me.roles.includes("admin")),
  );

  const [users, setUsers] = useState<UserAdminRead[]>([]);
  const [roles, setRoles] = useState<RoleRead[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers(search || undefined);
      setUsers(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load users. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  // Open the create modal when arriving via the quick-action (?create=1).
  useEffect(() => {
    if (isAdmin && searchParams.get("create") === "1") {
      setModal({ kind: "create" });
    }
  }, [isAdmin, searchParams]);

  // Roles for the create/edit selects (fetched once).
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    (async () => {
      try {
        const data = await listRoles();
        if (active) setRoles(data);
      } catch {
        // Non-fatal: selects fall back to the built-in role list.
      }
    })();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const roleOptions = useMemo(
    () =>
      roles.length > 0
        ? roles.map((r) => ({ slug: r.slug as RoleSlug, label: r.name }))
        : ROLE_PRECEDENCE.map((slug) => ({
            slug,
            label: ROLE_META[slug]?.label ?? slug,
          })),
    [roles],
  );

  async function handleToggleStatus(target: UserAdminRead) {
    const next: UserStatus =
      target.status === "active" ? "deactivated" : "active";
    setActionError(null);
    setBusyId(target.id);
    try {
      await updateUser(target.id, { status: next });
      await load();
    } catch (err) {
      setActionError(errMsg(err, "Unable to update the user's status."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(target: UserAdminRead) {
    if (
      !window.confirm(
        `Delete ${target.full_name} (${target.email})? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setBusyId(target.id);
    try {
      await deleteUser(target.id);
      await load();
    } catch (err) {
      setActionError(errMsg(err, "Unable to delete the user."));
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) {
    return (
      <AppShell title="User Management">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold text-[#1A1F4D]">
            Administrators only
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You need an administrator role to manage users. Ask an admin if you
            need access.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="User Management">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Create team members, assign roles &amp; permissions, reset
              passwords, and activate or deactivate accounts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or email…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-64"
            />
            <button
              type="button"
              onClick={() => setModal({ kind: "create" })}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New user
            </button>
          </div>
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
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : error ? (
            <p
              role="alert"
              className="px-4 py-10 text-center text-sm text-destructive"
            >
              {error}
            </p>
          ) : users.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No users found.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === me?.id;
                  const role = primaryRole(u);
                  const roleMeta = ROLE_META[role] ?? {
                    label: role,
                    cls: "bg-slate-100 text-slate-600",
                  };
                  const statusMeta = STATUS_META[u.status] ?? {
                    label: u.status,
                    cls: "bg-slate-100 text-slate-600",
                  };
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-border last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                            aria-hidden="true"
                          >
                            {initialsOf(u.full_name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {u.full_name}
                              {isSelf && (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  (you)
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={roleMeta.cls}>{roleMeta.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={statusMeta.cls}>
                          {statusMeta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.last_login_at ? relativeTime(u.last_login_at) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            title="Edit user"
                            onClick={() => setModal({ kind: "edit", user: u })}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            title="Reset password"
                            onClick={() =>
                              setModal({ kind: "password", user: u })
                            }
                          >
                            <KeyRound className="h-4 w-4" />
                          </IconButton>
                          {u.status === "active" ? (
                            <IconButton
                              title={
                                isSelf
                                  ? "You can't deactivate yourself"
                                  : "Deactivate"
                              }
                              disabled={isSelf || busyId === u.id}
                              onClick={() => handleToggleStatus(u)}
                              className="hover:bg-amber-50 hover:text-amber-700"
                            >
                              <UserX className="h-4 w-4" />
                            </IconButton>
                          ) : (
                            <IconButton
                              title="Activate"
                              disabled={busyId === u.id}
                              onClick={() => handleToggleStatus(u)}
                              className="hover:bg-green-50 hover:text-green-700"
                            >
                              <UserCheck className="h-4 w-4" />
                            </IconButton>
                          )}
                          <IconButton
                            title={
                              isSelf ? "You can't delete yourself" : "Delete"
                            }
                            disabled={isSelf || busyId === u.id}
                            onClick={() => handleDelete(u)}
                            className="hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !error && (
          <p className="text-xs text-muted-foreground">
            {users.length} user{users.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {modal?.kind === "create" && (
        <UserFormModal
          title="Create user"
          roleOptions={roleOptions}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void load();
          }}
        />
      )}
      {modal?.kind === "edit" && (
        <UserFormModal
          title="Edit user"
          roleOptions={roleOptions}
          existing={modal.user}
          isSelf={modal.user.id === me?.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void load();
          }}
        />
      )}
      {modal?.kind === "password" && (
        <ResetPasswordModal
          target={modal.user}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </AppShell>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersPageInner />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

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

function IconButton({
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#1A1F4D]/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
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

interface RoleOption {
  slug: RoleSlug;
  label: string;
}

function UserFormModal({
  title,
  roleOptions,
  existing,
  isSelf,
  onClose,
  onSaved,
}: {
  title: string;
  roleOptions: RoleOption[];
  existing?: UserAdminRead;
  isSelf?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(existing);
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [password, setPassword] = useState("");
  const [roleSlug, setRoleSlug] = useState<RoleSlug>(
    (existing
      ? (ROLE_PRECEDENCE.find((s) => existing.roles.includes(s)) ?? "user")
      : "user") as RoleSlug,
  );
  const [status, setStatus] = useState<UserStatus>(
    (existing?.status as UserStatus) ?? "active",
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      if (editing && existing) {
        await updateUser(existing.id, {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          role_slug: roleSlug,
          status,
        });
      } else {
        await createUser({
          email: email.trim(),
          full_name: fullName.trim(),
          password,
          role_slug: roleSlug,
          phone: phone.trim() || null,
        });
      }
      onSaved();
    } catch (err) {
      setFormError(errMsg(err, "Unable to save the user. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
        <Field label="Full name">
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={FIELD_CLS}
            placeholder="Jane Doe"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            required
            disabled={editing}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${FIELD_CLS} disabled:cursor-not-allowed disabled:opacity-60`}
            placeholder="jane@digitalleapmarketing.com"
          />
        </Field>

        {!editing && (
          <Field label="Temporary password">
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD_CLS}
              placeholder="At least 8 characters"
            />
          </Field>
        )}

        <Field label="Phone (optional)">
          <input
            type="tel"
            value={phone ?? ""}
            onChange={(e) => setPhone(e.target.value)}
            className={FIELD_CLS}
            placeholder="+91-99999-00000"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <select
              value={roleSlug}
              disabled={editing && isSelf}
              onChange={(e) => setRoleSlug(e.target.value as RoleSlug)}
              className={`${FIELD_CLS} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {roleOptions.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          {editing && (
            <Field label="Status">
              <select
                value={status}
                disabled={isSelf}
                onChange={(e) => setStatus(e.target.value as UserStatus)}
                className={`${FIELD_CLS} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="deactivated">Deactivated</option>
              </select>
            </Field>
          )}
        </div>

        {roleSlug === "admin" && (
          <p className="flex items-start gap-2 rounded-md bg-primary/5 px-3 py-2 text-xs text-primary">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Administrators have full access — they can manage all users,
            permissions, and settings.
          </p>
        )}

        {formError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
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
            {submitting
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Create user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  target,
  onClose,
  onSaved,
}: {
  target: UserAdminRead;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await resetUserPassword(target.id, password);
      setDone(true);
    } catch (err) {
      setFormError(errMsg(err, "Unable to reset the password."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Reset password" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
        <p className="text-sm text-muted-foreground">
          Set a new password for{" "}
          <span className="font-medium text-foreground">
            {target.full_name}
          </span>{" "}
          ({target.email}). They&apos;ll be signed out of existing sessions.
        </p>

        {done ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Password updated. Share the new password with the user securely.
          </p>
        ) : (
          <Field label="New password">
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD_CLS}
              placeholder="At least 8 characters"
              autoFocus
            />
          </Field>
        )}

        {formError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {done ? (
            <button
              type="button"
              onClick={onSaved}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Done
            </button>
          ) : (
            <>
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
                {submitting ? "Resetting…" : "Reset password"}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
