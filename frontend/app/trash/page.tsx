"use client";

import {
  Building2,
  CreditCard,
  FileText,
  FolderKanban,
  Globe,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";
import type { TrashItem } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { listTrash, purgeTrash, restoreTrash } from "@/services/trash-service";

interface EntityMeta {
  label: string;
  icon: ComponentType<{ className?: string }>;
  cls: string;
}

const ENTITY_META: Record<string, EntityMeta> = {
  project: {
    label: "Project",
    icon: FolderKanban,
    cls: "bg-primary/10 text-primary",
  },
  client: {
    label: "Client",
    icon: Building2,
    cls: "bg-indigo-100 text-indigo-700",
  },
  website: { label: "Website", icon: Globe, cls: "bg-sky-100 text-sky-700" },
  payment: {
    label: "Payment",
    icon: CreditCard,
    cls: "bg-green-100 text-green-700",
  },
  guest_post: {
    label: "Guest post",
    icon: FileText,
    cls: "bg-amber-100 text-amber-700",
  },
};

function metaFor(entityType: string): EntityMeta {
  return (
    ENTITY_META[entityType] ?? {
      label: entityType.replace(/_/g, " "),
      icon: FileText,
      cls: "bg-slate-100 text-slate-600",
    }
  );
}

export default function TrashPage() {
  const { user: me } = useAuth();
  const isManager = Boolean(
    me &&
      (me.is_superuser ||
        me.roles.includes("admin") ||
        me.roles.includes("team_lead")),
  );
  const isAdmin = Boolean(
    me && (me.is_superuser || me.roles.includes("admin")),
  );

  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);

  const keyOf = (item: TrashItem) => `${item.entity_type}:${item.id}`;

  const load = useCallback(async () => {
    if (!isManager) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listTrash();
      setItems(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load the trash. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRestore(item: TrashItem) {
    if (
      !window.confirm(
        `Restore "${item.label}"? It will be returned to ${metaFor(item.entity_type).label}.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setBusyKey(keyOf(item));
    try {
      await restoreTrash(item.entity_type, item.id);
      await load();
    } catch (err) {
      setActionError(errMsg(err, "Unable to restore this record."));
    } finally {
      setBusyKey(null);
    }
  }

  if (!isManager) {
    return (
      <AppShell title="Trash">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold text-[#1A1F4D]">
            Managers only
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You need a manager or administrator role to view deleted records.
            Ask an admin if you need access.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Trash">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Deleted records are kept here. Restore them, or permanently delete
          (admin + password).
        </p>

        {actionError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}

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
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Trash is empty.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Record</th>
                  <th className="px-4 py-3 font-medium">Deleted by</th>
                  <th className="px-4 py-3 font-medium">Deleted</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const meta = metaFor(item.entity_type);
                  const Icon = meta.icon;
                  const k = keyOf(item);
                  const busy = busyKey === k;
                  return (
                    <tr
                      key={k}
                      className="border-b border-border last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-4 py-3">
                        <Badge className={meta.cls}>
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {item.label || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.deleted_by ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span title={item.deleted_at}>
                          {relativeTime(item.deleted_at) || item.deleted_at}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            title="Restore"
                            disabled={busy}
                            onClick={() => handleRestore(item)}
                            className="hover:bg-green-50 hover:text-green-700"
                          >
                            <Undo2 className="h-4 w-4" />
                          </IconButton>
                          {isAdmin && (
                            <IconButton
                              title="Delete permanently"
                              disabled={busy}
                              onClick={() => {
                                setActionError(null);
                                setPurgeTarget(item);
                              }}
                              className="hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
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

        {!loading && !error && (
          <p className="text-xs text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} in trash
          </p>
        )}
      </div>

      {purgeTarget && (
        <PurgeModal
          target={purgeTarget}
          onClose={() => setPurgeTarget(null)}
          onPurged={() => {
            setPurgeTarget(null);
            void load();
          }}
        />
      )}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Permanent-delete modal                                             */
/* ------------------------------------------------------------------ */

function PurgeModal({
  target,
  onClose,
  onPurged,
}: {
  target: TrashItem;
  onClose: () => void;
  onPurged: () => void;
}) {
  const meta = metaFor(target.entity_type);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await purgeTrash(target.entity_type, target.id, password);
      onPurged();
    } catch (err) {
      setFormError(
        errMsg(err, "Unable to permanently delete this record."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Delete permanently" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
        <p className="text-sm text-muted-foreground">
          You&apos;re about to permanently delete the {meta.label.toLowerCase()}{" "}
          <span className="font-medium text-foreground">{target.label}</span>.
          This is irreversible — the record cannot be restored afterwards.
        </p>

        <p className="flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Confirm with your password to continue.
        </p>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">
            Your password
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Enter your password"
            autoFocus
          />
        </label>

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
            disabled={submitting || password.length === 0}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                     */
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
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
