"use client";

import {
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import type {
  CountryRef,
  NicheRef,
  WebsiteImportResult,
  WebsiteListItem,
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { getCountries, getNiches } from "@/services/lookup-service";
import {
  exportWebsites,
  importWebsites,
  listWebsites,
  removeWebsite,
} from "@/services/website-service";

const PAGE_SIZE = 20;

/** Parse a number input into a defined number or undefined when blank/invalid. */
function num(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default function WebsitesPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [countryId, setCountryId] = useState("");
  const [nicheId, setNicheId] = useState("");
  const [minDr, setMinDr] = useState("");
  const [maxDr, setMaxDr] = useState("");
  const [minTraffic, setMinTraffic] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [gpOnly, setGpOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<WebsiteListItem[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filter pickers.
  const [countries, setCountries] = useState<CountryRef[]>([]);
  const [niches, setNiches] = useState<NicheRef[]>([]);

  // CSV import/export state.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<WebsiteImportResult | null>(
    null,
  );

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
      const [countriesRes, nichesRes] = await Promise.allSettled([
        getCountries(),
        getNiches(),
      ]);
      if (!active) return;
      if (countriesRes.status === "fulfilled") setCountries(countriesRes.value);
      if (nichesRes.status === "fulfilled") setNiches(nichesRes.value);
    })();
    return () => {
      active = false;
    };
  }, []);

  // The active filter set, shared by the list query and the CSV export.
  const activeFilters = useCallback(
    () => ({
      search: search || undefined,
      country_id: countryId ? Number(countryId) : undefined,
      niche_id: nicheId ? Number(nicheId) : undefined,
      min_dr: num(minDr),
      max_dr: num(maxDr),
      min_traffic: num(minTraffic),
      max_price: num(maxPrice),
      guest_post_available: gpOnly ? true : undefined,
      sort: "-created_at",
    }),
    [search, countryId, nicheId, minDr, maxDr, minTraffic, maxPrice, gpOnly],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listWebsites({
        page,
        page_size: PAGE_SIZE,
        ...activeFilters(),
      });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load websites. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, activeFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset to the first page whenever a non-search filter changes.
  function resetPage() {
    setPage(1);
  }

  async function handleDelete(site: WebsiteListItem) {
    if (
      !window.confirm(
        `Delete "${site.domain}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setBusyId(site.id);
    try {
      await removeWebsite(site.id);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 403
          ? "Only managers can delete websites."
          : err instanceof ApiError
            ? err.message
            : "Unable to delete website.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleExport() {
    setActionError(null);
    setExporting(true);
    try {
      await exportWebsites(activeFilters());
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Unable to export websites. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file later.
    e.target.value = "";
    if (!file) return;

    setActionError(null);
    setImportResult(null);
    setImporting(true);
    try {
      const result = await importWebsites(file);
      setImportResult(result);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Unable to import the CSV. Please check the file and try again.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppShell title="Website Database">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search domain or name…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-xs"
            />
            <select
              value={countryId}
              onChange={(e) => {
                setCountryId(e.target.value);
                resetPage();
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={nicheId}
              onChange={(e) => {
                setNicheId(e.target.value);
                resetPage();
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All niches</option>
              {niches.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {importing ? "Importing…" : "Import CSV"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImport}
              className="hidden"
            />
            <Link
              href="/websites/new"
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Website
            </Link>
          </div>
        </div>

        {/* Numeric / boolean filters */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <NumberFilter
            label="Min DR"
            value={minDr}
            onChange={(v) => {
              setMinDr(v);
              resetPage();
            }}
          />
          <NumberFilter
            label="Max DR"
            value={maxDr}
            onChange={(v) => {
              setMaxDr(v);
              resetPage();
            }}
          />
          <NumberFilter
            label="Min traffic"
            value={minTraffic}
            onChange={(v) => {
              setMinTraffic(v);
              resetPage();
            }}
          />
          <NumberFilter
            label="Max price"
            value={maxPrice}
            onChange={(v) => {
              setMaxPrice(v);
              resetPage();
            }}
          />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={gpOnly}
              onChange={(e) => {
                setGpOnly(e.target.checked);
                resetPage();
              }}
              className="h-4 w-4 rounded border-input"
            />
            Guest post available
          </label>
        </div>

        {actionError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {actionError}
          </p>
        )}

        {/* Import result summary */}
        {importResult && (
          <div className="rounded-md border border-border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">
                {importResult.created} created, {importResult.updated} updated,{" "}
                {importResult.errors.length} error
                {importResult.errors.length === 1 ? "" : "s"}.
              </p>
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-destructive">
                {importResult.errors.map((err, i) => (
                  <li key={i}>
                    Row {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
              No websites found.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Domain</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Niche</th>
                  <th className="px-4 py-3 font-medium">Country</th>
                  <th className="px-4 py-3 text-right font-medium">DA/DR</th>
                  <th className="px-4 py-3 text-right font-medium">Spam</th>
                  <th className="px-4 py-3 text-right font-medium">Traffic</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 text-center font-medium">GP?</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((site) => (
                  <tr
                    key={site.id}
                    className="border-b border-border last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/websites/${site.id}`}
                        className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                      >
                        {site.domain}
                        {site.homepage_url && (
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {site.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {site.main_niche?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {site.country?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {site.da ?? "—"} / {site.dr ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {site.spam_score ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {site.traffic != null
                        ? site.traffic.toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {site.price != null ? formatCurrency(site.price) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {site.guest_post_available ? (
                        <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                          Yes
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {site.contact_person ?? site.email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/websites/${site.id}/edit`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(site)}
                          disabled={busyId === site.id}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && items.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} website{total === 1 ? "" : "s"} · page {page} of {pages}
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

/* ------------------------------------------------------------------ */

function NumberFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
