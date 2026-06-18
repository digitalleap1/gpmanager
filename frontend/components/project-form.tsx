"use client";

import { useEffect, useState } from "react";

import type {
  BudgetPeriodType,
  CountryRef,
  CurrencyRef,
  NicheRef,
  ProjectCreate,
  UserSummary,
} from "@/lib/types";
import {
  getCountries,
  getCurrencies,
  getNiches,
  getUsers,
} from "@/services/lookup-service";

const STATUS_OPTIONS = ["active", "completed", "hold", "cancelled"] as const;

const BUDGET_PERIODS: { value: BudgetPeriodType; label: string; per: string }[] = [
  { value: "monthly", label: "Monthly", per: "per month" },
  { value: "weekly", label: "Weekly", per: "per week" },
  { value: "daily", label: "Daily", per: "per day" },
];

interface ProjectFormProps {
  initial?: Partial<ProjectCreate>;
  onSubmit: (values: ProjectCreate) => void | Promise<void>;
  submitting: boolean;
  submitLabel: string;
  error?: string | null;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
// Same look but WITHOUT w-full, for fixed-width controls in a flex row (e.g. the
// currency select beside an amount). w-full would otherwise override w-28 and
// eat the whole row, squeezing the amount input to nothing.
const compactInputClass =
  "rounded-md border border-input bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelClass = "text-sm font-medium";

/** Convert a select's "" value to null, otherwise parse as an int (for ids). */
function toNumberOrNull(value: string): number | null {
  return value === "" ? null : Number(value);
}

/** Shared create/edit form for a project. Loads lookups for the pickers. */
export function ProjectForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
  error,
}: ProjectFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [mainNicheId, setMainNicheId] = useState(
    initial?.main_niche_id != null ? String(initial.main_niche_id) : "",
  );
  const [projectNicheId, setProjectNicheId] = useState(
    initial?.project_niche_id != null ? String(initial.project_niche_id) : "",
  );
  const [countryId, setCountryId] = useState(
    initial?.target_country_id != null
      ? String(initial.target_country_id)
      : "",
  );
  const [assigneeId, setAssigneeId] = useState(initial?.assignee_id ?? "");
  const [teamLeadId, setTeamLeadId] = useState(initial?.team_lead_id ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(initial?.member_ids ?? []);
  const toggleMember = (id: string) =>
    setMemberIds((cur) =>
      cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id],
    );
  const [monthlyBudget, setMonthlyBudget] = useState(
    initial?.monthly_budget != null ? String(initial.monthly_budget) : "",
  );
  const [budgetCurrency, setBudgetCurrency] = useState(
    initial?.budget_currency ?? "USD",
  );
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriodType>(
    initial?.budget_period ?? "monthly",
  );
  const [budgetStartDate, setBudgetStartDate] = useState(
    initial?.budget_start_date ?? "",
  );
  const [budgetEndDate, setBudgetEndDate] = useState(
    initial?.budget_end_date ?? "",
  );
  const [costPerLinkTarget, setCostPerLinkTarget] = useState(
    initial?.cost_per_link_target != null
      ? String(initial.cost_per_link_target)
      : "",
  );
  const [targetLinks, setTargetLinks] = useState(
    initial?.target_links != null ? String(initial.target_links) : "",
  );
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [niches, setNiches] = useState<NicheRef[]>([]);
  const [countries, setCountries] = useState<CountryRef[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRef[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [n, c, u, cur] = await Promise.all([
          getNiches(),
          getCountries(),
          getUsers(),
          getCurrencies(),
        ]);
        if (!active) return;
        setNiches(n);
        setCountries(c);
        setUsers(u);
        setCurrencies(cur);
      } catch {
        if (active)
          setLookupError(
            "Some pickers could not load. You can still fill the other fields.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Inline, non-blocking validation: end date must not precede the start date.
  const dateRangeInvalid =
    budgetStartDate !== "" &&
    budgetEndDate !== "" &&
    budgetEndDate < budgetStartDate;

  // Currency symbol/code shown as the cost-per-link prefix.
  const currencyAffix =
    currencies.find((c) => c.code === budgetCurrency)?.symbol ?? budgetCurrency;

  // "per month" / "per week" / "per day" suffix for the amount label.
  const periodSuffix =
    BUDGET_PERIODS.find((p) => p.value === budgetPeriod)?.per ?? "per month";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (dateRangeInvalid) return;
    const values: ProjectCreate = {
      name: name.trim(),
      main_niche_id: toNumberOrNull(mainNicheId),
      project_niche_id: toNumberOrNull(projectNicheId),
      target_country_id: toNumberOrNull(countryId),
      assignee_id: assigneeId || null,
      team_lead_id: teamLeadId || null,
      member_ids: memberIds,
      monthly_budget: monthlyBudget === "" ? 0 : Number(monthlyBudget),
      budget_currency: budgetCurrency,
      budget_period: budgetPeriod,
      budget_start_date: budgetStartDate || null,
      budget_end_date: budgetEndDate || null,
      cost_per_link_target:
        costPerLinkTarget.trim() === "" ? null : Number(costPerLinkTarget),
      target_links: targetLinks === "" ? 0 : Number(targetLinks),
      status,
      due_date: dueDate || null,
      goal: goal.trim() || null,
      notes: notes.trim() || null,
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
          Name <span className="text-destructive">*</span>
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="main_niche" className={labelClass}>
            Main niche
          </label>
          <select
            id="main_niche"
            value={mainNicheId}
            onChange={(e) => setMainNicheId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="project_niche" className={labelClass}>
            Project niche
          </label>
          <select
            id="project_niche"
            value={projectNicheId}
            onChange={(e) => setProjectNicheId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="country" className={labelClass}>
            Target country
          </label>
          <select
            id="country"
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`${inputClass} capitalize`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="assignee" className={labelClass}>
            Assignee
          </label>
          <select
            id="assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="team_lead" className={labelClass}>
            Team lead
          </label>
          <select
            id="team_lead"
            value={teamLeadId}
            onChange={(e) => setTeamLeadId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <span className={labelClass}>
            Project members
            {memberIds.length > 0 ? ` (${memberIds.length} selected)` : ""}
          </span>
          <div className="max-h-44 overflow-y-auto rounded-md border border-input bg-background p-1">
            {users.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                No users available.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                {users.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={memberIds.includes(u.id)}
                      onChange={() => toggleMember(u.id)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                    />
                    <span>{u.full_name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Assign one or more members. They&apos;re notified and see the project
            and its checklist/task updates.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="budget_period" className={labelClass}>
            Budget period
          </label>
          <select
            id="budget_period"
            value={budgetPeriod}
            onChange={(e) => setBudgetPeriod(e.target.value as BudgetPeriodType)}
            className={inputClass}
          >
            {BUDGET_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="monthly_budget" className={labelClass}>
            Budget ({periodSuffix})
          </label>
          <div className="flex gap-2">
            <input
              id="monthly_budget"
              type="number"
              min={0}
              step="0.01"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(e.target.value)}
              className={`${inputClass} min-w-0 flex-1`}
            />
            <select
              id="budget_currency"
              aria-label="Budget currency"
              value={budgetCurrency}
              onChange={(e) => setBudgetCurrency(e.target.value)}
              className={`${compactInputClass} w-28 shrink-0`}
            >
              {currencies.length === 0 && (
                <option value={budgetCurrency}>{budgetCurrency}</option>
              )}
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className={labelClass}>Budget date range</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="budget_start_date"
                className="text-xs text-muted-foreground"
              >
                Start date
              </label>
              <input
                id="budget_start_date"
                type="date"
                value={budgetStartDate ?? ""}
                onChange={(e) => setBudgetStartDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="budget_end_date"
                className="text-xs text-muted-foreground"
              >
                End date
              </label>
              <input
                id="budget_end_date"
                type="date"
                value={budgetEndDate ?? ""}
                min={budgetStartDate || undefined}
                onChange={(e) => setBudgetEndDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          {dateRangeInvalid && (
            <p className="text-xs text-destructive">
              End date must be on or after the start date.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cost_per_link_target" className={labelClass}>
            Cost-per-link target
          </label>
          <div className="flex items-stretch">
            <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              {currencyAffix}
            </span>
            <input
              id="cost_per_link_target"
              type="number"
              min={0}
              step="0.01"
              value={costPerLinkTarget}
              onChange={(e) => setCostPerLinkTarget(e.target.value)}
              placeholder="Optional"
              className={`${inputClass} min-w-0 flex-1 rounded-l-none`}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="target_links" className={labelClass}>
            Target links
          </label>
          <input
            id="target_links"
            type="number"
            min={0}
            step="1"
            value={targetLinks}
            onChange={(e) => setTargetLinks(e.target.value)}
            className={inputClass}
          />
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
      </div>

      <div className="space-y-1.5">
        <label htmlFor="goal" className={labelClass}>
          Goal
        </label>
        <textarea
          id="goal"
          rows={3}
          value={goal ?? ""}
          onChange={(e) => setGoal(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
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
        disabled={submitting || name.trim() === "" || dateRangeInvalid}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export default ProjectForm;
