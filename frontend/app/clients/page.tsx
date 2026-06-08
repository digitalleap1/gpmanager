"use client";

import { Building2, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import Link from "next/link";
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
import type {
  ClientCreate,
  ClientListItem,
  CurrencyRef,
} from "@/lib/types";
import {
  createClient,
  deleteClient,
  getClient,
  listClients,
  updateClient,
} from "@/services/client-service";
import { getCurrencies } from "@/services/lookup-service";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-green-100 text-green-700" },
  inactive: { label: "Inactive", cls: "bg-slate-200 text-slate-600" },
};

/** Format an amount with a currency code suffix (no decimals). */
function formatAmount(amount: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount ?? 0)} ${currency}`;
}

type ModalState =
  | { kind: "create" }
  | { kind: "edit"; client: ClientListItem }
  | null;

export default function ClientsPage() {
  const { user: me } = useAuth();
  const isManager = Boolean(
    me &&
      (me.is_superuser ||
        me.roles.includes("admin") ||
        me.roles.includes("team_lead")),
  );

  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRef[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listClients();
      setClients(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load clients. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isManager) return;
    void load();
  }, [isManager, load]);

  // Currencies for the create/edit selects (fetched once).
  useEffect(() => {
    if (!isManager) return;
    let active = true;
    (async () => {
      try {
        const data = await getCurrencies();
        if (active) setCurrencies(data);
      } catch {
        // Non-fatal: the select falls back to a plain text default.
      }
    })();
    return () => {
      active = false;
    };
  }, [isManager]);

  const filtered = useMemo(() => {
    if (!search) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(search));
  }, [clients, search]);

  async function handleDelete(target: ClientListItem) {
    if (
      !window.confirm(
        `Delete ${target.name}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setBusyId(target.id);
    try {
      await deleteClient(target.id);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 403
          ? "Only admins can delete clients."
          : err instanceof ApiError
            ? err.message
            : "Unable to delete the client.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!isManager) {
    return (
      <AppShell title="Clients">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold text-[#1A1F4D]">
            Managers only
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You need a manager role (admin or team lead) to manage clients. Ask
            an admin if you need access.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Clients">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Track each client&apos;s budget, payments, and remaining balance.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search clients…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-64"
            />
            <button
              type="button"
              onClick={() => setModal({ kind: "create" })}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New client
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
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Building2 className="mx-auto h-9 w-9 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                {clients.length === 0
                  ? "No clients yet — add your first client to start tracking budgets."
                  : "No clients match your search."}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Currency</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Total Budget
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Total Paid
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Remaining</th>
                  <th className="px-4 py-3 text-right font-medium">Projects</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const statusMeta = STATUS_META[c.status] ?? {
                    label: c.status,
                    cls: "bg-slate-100 text-slate-600",
                  };
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/clients/${c.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.currency}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {formatAmount(c.total_budget, c.currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {formatAmount(c.total_paid, c.currency)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          c.remaining_budget < 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatAmount(c.remaining_budget, c.currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {c.project_count}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={statusMeta.cls}>
                          {statusMeta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            title="Edit client"
                            onClick={() => setModal({ kind: "edit", client: c })}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            title="Delete"
                            disabled={busyId === c.id}
                            onClick={() => handleDelete(c)}
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

        {!loading && !error && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {filtered.length} client{filtered.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {modal?.kind === "create" && (
        <ClientFormModal
          title="New client"
          currencies={currencies}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void load();
          }}
        />
      )}
      {modal?.kind === "edit" && (
        <ClientFormModal
          title="Edit client"
          currencies={currencies}
          existing={modal.client}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void load();
          }}
        />
      )}
    </AppShell>
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
      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-4">
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

function ClientFormModal({
  title,
  currencies,
  existing,
  onClose,
  onSaved,
}: {
  title: string;
  currencies: CurrencyRef[];
  existing?: ClientListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(existing);
  const [name, setName] = useState(existing?.name ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? "USD");
  const [totalBudget, setTotalBudget] = useState(
    existing ? String(existing.total_budget) : "",
  );
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState(existing?.status ?? "active");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // When editing, fetch the full record to prefill the contact/notes fields
  // (the list item doesn't carry them).
  useEffect(() => {
    if (!existing) return;
    let active = true;
    (async () => {
      try {
        const detail = await getClient(existing.id);
        if (!active) return;
        setContactName(detail.contact_name ?? "");
        setContactEmail(detail.contact_email ?? "");
        setContactPhone(detail.contact_phone ?? "");
        setWebsite(detail.website ?? "");
        setNotes(detail.notes ?? "");
      } catch {
        // Non-fatal: leave the contact fields blank if detail can't load.
      }
    })();
    return () => {
      active = false;
    };
  }, [existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    const budget = totalBudget.trim() === "" ? 0 : Number(totalBudget);
    const payload: ClientCreate = {
      name: name.trim(),
      currency,
      total_budget: Number.isFinite(budget) ? budget : 0,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      website: website.trim() || null,
      notes: notes.trim() || null,
      status,
    };
    try {
      if (editing && existing) {
        await updateClient(existing.id, payload);
      } else {
        await createClient(payload);
      }
      onSaved();
    } catch (err) {
      setFormError(errMsg(err, "Unable to save the client. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
        <Field label="Name">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD_CLS}
            placeholder="Acme Corp"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={FIELD_CLS}
            >
              {currencies.length === 0 && (
                <option value={currency}>{currency}</option>
              )}
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Total budget">
            <input
              type="number"
              min={0}
              step="0.01"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              className={FIELD_CLS}
              placeholder="0"
            />
          </Field>
        </div>

        <Field label="Contact name">
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className={FIELD_CLS}
            placeholder="Jane Doe"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contact email">
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={FIELD_CLS}
              placeholder="jane@acme.com"
            />
          </Field>

          <Field label="Contact phone">
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className={FIELD_CLS}
              placeholder="+1-555-0100"
            />
          </Field>
        </div>

        <Field label="Website">
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className={FIELD_CLS}
            placeholder="https://acme.com"
          />
        </Field>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={FIELD_CLS}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>

        <Field label="Notes">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={FIELD_CLS}
          />
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
            {submitting
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Create client"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
