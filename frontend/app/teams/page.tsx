"use client";
import {
  ArrowRightLeft,
  Crown,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users as UsersIcon,
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
  OrgHierarchy,
  TeamListItem,
  TeamRead,
  UserAdminRead,
  UserSummary,
} from "@/lib/types";
import { listUsers } from "@/services/user-service";
import {
  addTeamMembers,
  createTeam,
  deleteTeam,
  getOrgHierarchy,
  getTeam,
  listTeams,
  moveTeamMember,
  removeTeamMember,
  updateTeam,
} from "@/services/team-service";

/* ------------------------------------------------------------------ */

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

type Tab = "teams" | "hierarchy";

type ModalState =
  | { kind: "create" }
  | { kind: "edit"; team: TeamListItem }
  | { kind: "manage"; team: TeamListItem }
  | null;

function TeamsPageInner() {
  const { user: me } = useAuth();
  const searchParams = useSearchParams();
  const isAdmin = Boolean(
    me && (me.is_superuser || me.roles.includes("admin")),
  );

  const [tab, setTab] = useState<Tab>("teams");
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [hierarchy, setHierarchy] = useState<OrgHierarchy | null>(null);
  const [allUsers, setAllUsers] = useState<UserAdminRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "teams") {
        const data = await listTeams();
        setTeams(data);
      } else {
        const data = await getOrgHierarchy();
        setHierarchy(data);
      }
    } catch (err) {
      setError(errMsg(err, "Unable to load teams. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  // Open the create modal when arriving via the quick-action (?create=1).
  useEffect(() => {
    if (isAdmin && searchParams.get("create") === "1") {
      setModal({ kind: "create" });
    }
  }, [isAdmin, searchParams]);

  // Users for the lead / member pickers (fetched once).
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    (async () => {
      try {
        const data = await listUsers();
        if (active) setAllUsers(data);
      } catch {
        // Non-fatal: pickers fall back to an empty list.
      }
    })();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  async function handleDelete(target: TeamListItem) {
    if (
      !window.confirm(
        `Delete team "${target.name}"? Members will be unassigned. This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setBusyId(target.id);
    try {
      await deleteTeam(target.id);
      await load();
    } catch (err) {
      setActionError(errMsg(err, "Unable to delete the team."));
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) {
    return (
      <AppShell title="Teams">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold text-[#1A1F4D]">
            Administrators only
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You need an administrator role to manage teams. Ask an admin if you
            need access.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Teams">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            <TabButton active={tab === "teams"} onClick={() => setTab("teams")}>
              Teams
            </TabButton>
            <TabButton
              active={tab === "hierarchy"}
              onClick={() => setTab("hierarchy")}
            >
              Org hierarchy
            </TabButton>
          </div>
          <button
            type="button"
            onClick={() => setModal({ kind: "create" })}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New team
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
        ) : tab === "teams" ? (
          teams.length === 0 ? (
            <EmptyState
              icon={<UsersIcon className="h-8 w-8" />}
              title="No teams yet"
              hint="Create your first team to organise members under a lead."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {teams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  busy={busyId === team.id}
                  onManage={() => setModal({ kind: "manage", team })}
                  onEdit={() => setModal({ kind: "edit", team })}
                  onDelete={() => handleDelete(team)}
                />
              ))}
            </div>
          )
        ) : hierarchy ? (
          <HierarchyView data={hierarchy} />
        ) : null}
      </div>

      {modal?.kind === "create" && (
        <CreateTeamModal
          users={allUsers}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void load();
          }}
        />
      )}
      {modal?.kind === "edit" && (
        <EditTeamModal
          team={modal.team}
          users={allUsers}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void load();
          }}
        />
      )}
      {modal?.kind === "manage" && (
        <ManageTeamModal
          teamRef={modal.team}
          users={allUsers}
          allTeams={teams}
          onClose={() => setModal(null)}
          onChanged={() => void load()}
        />
      )}
    </AppShell>
  );
}

export default function TeamsPage() {
  return (
    <Suspense fallback={null}>
      <TeamsPageInner />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ *
 * Cards & hierarchy
 * ------------------------------------------------------------------ */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-3 text-base font-semibold text-[#1A1F4D]">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function AvatarChip({
  name,
  subtle,
  lead,
}: {
  name: string;
  subtle?: boolean;
  lead?: boolean;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-medium ${
        subtle
          ? "bg-slate-100 text-slate-700"
          : "bg-primary/10 text-primary"
      }`}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
        aria-hidden="true"
      >
        {initialsOf(name)}
      </span>
      <span className="truncate">{name}</span>
      {lead && <Crown className="h-3 w-3 shrink-0 text-amber-500" />}
    </span>
  );
}

function TeamCard({
  team,
  busy,
  onManage,
  onEdit,
  onDelete,
}: {
  team: TeamListItem;
  busy: boolean;
  onManage: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-[#1A1F4D]">
            {team.name}
          </h3>
          {team.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
              {team.description}
            </p>
          ) : (
            <p className="mt-0.5 text-sm italic text-muted-foreground/70">
              No description
            </p>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          <UsersIcon className="h-3 w-3" />
          {team.member_count}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Team lead
        </p>
        <div className="mt-1.5">
          {team.team_lead ? (
            <AvatarChip name={team.team_lead.full_name} lead />
          ) : (
            <span className="text-sm italic text-muted-foreground/70">
              No lead assigned
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onManage}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <Settings2 className="h-4 w-4" />
          Manage
        </button>
        <IconButton title="Edit team" onClick={onEdit} disabled={busy}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton
          title="Delete team"
          onClick={onDelete}
          disabled={busy}
          className="hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
}

function HierarchyView({ data }: { data: OrgHierarchy }) {
  const empty =
    data.admins.length === 0 &&
    data.teams.length === 0 &&
    data.unassigned.length === 0;

  if (empty) {
    return (
      <EmptyState
        icon={<UsersIcon className="h-8 w-8" />}
        title="Nothing to chart yet"
        hint="Add users and teams to see the org hierarchy."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Admins */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1A1F4D]">
            Administrators
          </h2>
        </div>
        {data.admins.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.admins.map((a) => (
              <AvatarChip key={a.id} name={a.full_name} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm italic text-muted-foreground/70">
            No administrators
          </p>
        )}
      </section>

      {/* Teams tree */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1A1F4D]">
          Teams
        </h2>
        {data.teams.length === 0 ? (
          <p className="text-sm italic text-muted-foreground/70">No teams</p>
        ) : (
          data.teams.map((team) => (
            <div
              key={team.id}
              className="rounded-xl border border-border bg-card shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3 rounded-t-xl bg-[#1A1F4D] px-5 py-3">
                <span className="text-sm font-semibold text-white">
                  {team.name}
                </span>
                <span className="text-xs text-white/60">
                  {team.members.length} member
                  {team.members.length === 1 ? "" : "s"}
                </span>
                <div className="ml-auto">
                  {team.team_lead ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 py-0.5 pl-0.5 pr-2.5 text-xs font-medium text-white">
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                        aria-hidden="true"
                      >
                        {initialsOf(team.team_lead.full_name)}
                      </span>
                      Lead: {team.team_lead.full_name}
                      <Crown className="h-3 w-3 text-amber-300" />
                    </span>
                  ) : (
                    <span className="text-xs italic text-white/50">
                      No lead
                    </span>
                  )}
                </div>
              </div>
              <div className="border-l-2 border-primary/30 px-5 py-4">
                {team.members.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {team.members.map((m) => (
                      <AvatarChip key={m.id} name={m.full_name} subtle />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground/70">
                    No members yet
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Unassigned */}
      <section className="rounded-xl border border-dashed border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#1A1F4D]">
          Unassigned
        </h2>
        {data.unassigned.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.unassigned.map((u) => (
              <AvatarChip key={u.id} name={u.full_name} subtle />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm italic text-muted-foreground/70">
            Everyone is on a team.
          </p>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Shared form primitives
 * ------------------------------------------------------------------ */

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

/** A checkbox list of users for the member picker. */
function UserChecklist({
  users,
  selected,
  onToggle,
  emptyHint,
}: {
  users: UserAdminRead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyHint: string;
}) {
  if (users.length === 0) {
    return (
      <p className="rounded-md border border-border px-3 py-4 text-center text-sm italic text-muted-foreground/70">
        {emptyHint}
      </p>
    );
  }
  return (
    <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
      {users.map((u) => (
        <label
          key={u.id}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent"
        >
          <input
            type="checkbox"
            checked={selected.has(u.id)}
            onChange={() => onToggle(u.id)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
          />
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
            aria-hidden="true"
          >
            {initialsOf(u.full_name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {u.full_name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {u.email}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Create / Edit modals
 * ------------------------------------------------------------------ */

function CreateTeamModal({
  users,
  onClose,
  onSaved,
}: {
  users: UserAdminRead[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leadId, setLeadId] = useState("");
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await createTeam({
        name: name.trim(),
        description: description.trim() || null,
        team_lead_id: leadId || null,
        member_ids: Array.from(memberIds),
      });
      onSaved();
    } catch (err) {
      setFormError(errMsg(err, "Unable to create the team. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Create team" onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5"
      >
        <div className="space-y-4">
          <Field label="Team name">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD_CLS}
              placeholder="Outreach Team"
            />
          </Field>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${FIELD_CLS} min-h-[60px] resize-y`}
              placeholder="What this team is responsible for…"
            />
          </Field>

          <Field label="Team lead (optional)">
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className={FIELD_CLS}
            >
              <option value="">No lead</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
            </select>
          </Field>

          <div className="space-y-1">
            <span className="text-sm font-medium text-foreground">
              Members ({memberIds.size} selected)
            </span>
            <UserChecklist
              users={users}
              selected={memberIds}
              onToggle={toggleMember}
              emptyHint="No users available."
            />
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
            {submitting ? "Creating…" : "Create team"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditTeamModal({
  team,
  users,
  onClose,
  onSaved,
}: {
  team: TeamListItem;
  users: UserAdminRead[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const [leadId, setLeadId] = useState(team.team_lead?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await updateTeam(team.id, {
        name: name.trim(),
        description: description.trim() || null,
        team_lead_id: leadId || null,
      });
      onSaved();
    } catch (err) {
      setFormError(errMsg(err, "Unable to update the team. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Edit team" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
        <Field label="Team name">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD_CLS}
          />
        </Field>

        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${FIELD_CLS} min-h-[60px] resize-y`}
          />
        </Field>

        <Field label="Team lead">
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            className={FIELD_CLS}
          >
            <option value="">No lead</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.email})
              </option>
            ))}
          </select>
        </Field>

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
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Manage modal
 * ------------------------------------------------------------------ */

function ManageTeamModal({
  teamRef,
  users,
  allTeams,
  onClose,
  onChanged,
}: {
  teamRef: TeamListItem;
  users: UserAdminRead[];
  allTeams: TeamListItem[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [team, setTeam] = useState<TeamRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [moveFor, setMoveFor] = useState<UserSummary | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTeam(teamRef.id);
      setTeam(data);
    } catch (err) {
      setError(errMsg(err, "Unable to load this team."));
    } finally {
      setLoading(false);
    }
  }, [teamRef.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const memberIds = useMemo(
    () => new Set((team?.members ?? []).map((m) => m.id)),
    [team],
  );
  const addableUsers = useMemo(
    () => users.filter((u) => !memberIds.has(u.id)),
    [users, memberIds],
  );

  async function applyResult(p: Promise<TeamRead>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      const updated = await p;
      setTeam(updated);
      onChanged();
    } catch (err) {
      setError(errMsg(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMembers() {
    if (toAdd.size === 0) return;
    await applyResult(
      addTeamMembers(teamRef.id, Array.from(toAdd)),
      "Unable to add members.",
    );
    setToAdd(new Set());
    setAddOpen(false);
  }

  async function handleRemove(userId: string) {
    await applyResult(
      removeTeamMember(teamRef.id, userId),
      "Unable to remove the member.",
    );
  }

  async function handleChangeLead(leadId: string) {
    await applyResult(
      updateTeam(teamRef.id, { team_lead_id: leadId || null }).then(() =>
        getTeam(teamRef.id),
      ),
      "Unable to change the team lead.",
    );
  }

  async function handleMoveTo(targetTeamId: string) {
    if (!moveFor) return;
    const member = moveFor;
    setError(null);
    setBusy(true);
    try {
      await moveTeamMember(targetTeamId, member.id);
      onChanged();
      setMoveFor(null);
      await refresh();
    } catch (err) {
      setError(errMsg(err, "Unable to move the member."));
    } finally {
      setBusy(false);
    }
  }

  function toggleAdd(id: string) {
    setToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const otherTeams = allTeams.filter((t) => t.id !== teamRef.id);

  return (
    <Modal title={`Manage — ${teamRef.name}`} onClose={onClose} wide>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : error && !team ? (
          <p
            role="alert"
            className="py-10 text-center text-sm text-destructive"
          >
            {error}
          </p>
        ) : team ? (
          <div className="space-y-5">
            {error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            {/* Change lead */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Team lead
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <select
                  value={team.team_lead?.id ?? ""}
                  disabled={busy}
                  onChange={(e) => handleChangeLead(e.target.value)}
                  className={`${FIELD_CLS} sm:w-72 disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <option value="">No lead</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
                {team.team_lead && (
                  <AvatarChip name={team.team_lead.full_name} lead />
                )}
              </div>
            </div>

            {/* Members */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Members ({team.members.length})
                </p>
                <button
                  type="button"
                  onClick={() => setAddOpen((v) => !v)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add members
                </button>
              </div>

              {addOpen && (
                <div className="mt-2 rounded-md border border-border p-3">
                  <UserChecklist
                    users={addableUsers}
                    selected={toAdd}
                    onToggle={toggleAdd}
                    emptyHint="Everyone is already on this team."
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAddOpen(false);
                        setToAdd(new Set());
                      }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddMembers}
                      disabled={busy || toAdd.size === 0}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? "Adding…" : `Add ${toAdd.size || ""}`.trim()}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-2 space-y-1.5">
                {team.members.length === 0 ? (
                  <p className="rounded-md border border-border px-3 py-4 text-center text-sm italic text-muted-foreground/70">
                    No members yet.
                  </p>
                ) : (
                  team.members.map((m) => {
                    const isLead = team.team_lead?.id === m.id;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                          aria-hidden="true"
                        >
                          {initialsOf(m.full_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {m.full_name}
                            {isLead && (
                              <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-amber-600">
                                <Crown className="h-3 w-3" />
                                Lead
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.email}
                          </p>
                        </div>
                        {otherTeams.length > 0 && (
                          <IconButton
                            title="Move to another team"
                            onClick={() => setMoveFor(m)}
                            disabled={busy}
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </IconButton>
                        )}
                        <IconButton
                          title="Remove from team"
                          onClick={() => handleRemove(m.id)}
                          disabled={busy}
                          className="hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </IconButton>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Move-member sub-picker */}
      {moveFor && (
        <Modal
          title={`Move ${moveFor.full_name}`}
          onClose={() => setMoveFor(null)}
        >
          <div className="space-y-3 px-5 py-5">
            <p className="text-sm text-muted-foreground">
              Move this member into another team. They will be removed from
              their current team(s).
            </p>
            <div className="space-y-1.5">
              {otherTeams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleMoveTo(t.id)}
                  className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm transition hover:bg-accent disabled:opacity-50"
                >
                  <span className="font-medium text-foreground">{t.name}</span>
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setMoveFor(null)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
