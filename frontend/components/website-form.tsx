"use client";

import { useEffect, useState } from "react";

import type {
  CountryRef,
  CurrencyRef,
  LanguageRef,
  NicheRef,
  WebsiteCreate,
} from "@/lib/types";
import {
  getCountries,
  getCurrencies,
  getLanguages,
  getNiches,
} from "@/services/lookup-service";

interface WebsiteFormProps {
  initial?: Partial<WebsiteCreate>;
  onSubmit: (values: WebsiteCreate) => void | Promise<void>;
  submitting: boolean;
  submitLabel: string;
  error?: string | null;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
// Same look but WITHOUT w-full, for fixed-width controls in a flex row (e.g. the
// currency select beside the price) — w-full would override w-24 and eat the row.
const compactInputClass =
  "rounded-md border border-input bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelClass = "text-sm font-medium";

/** Parse a numeric input's string value to a number or null when blank. */
function toNumberOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

/** Convert a numeric id to its string form for a `<select value>` (or ""). */
function idToString(id: number | null | undefined): string {
  return id != null ? String(id) : "";
}

/**
 * Shared create/edit form for a website. Loads the country / language / niche
 * pickers from the lookup service. Additional niches are picked via a compact
 * checkbox list bound to `niche_ids`.
 */
export function WebsiteForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
  error,
}: WebsiteFormProps) {
  const [domain, setDomain] = useState(initial?.domain ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [mainNicheId, setMainNicheId] = useState(
    idToString(initial?.main_niche_id),
  );
  const [countryId, setCountryId] = useState(idToString(initial?.country_id));
  const [languageId, setLanguageId] = useState(idToString(initial?.language_id));
  const [nicheIds, setNicheIds] = useState<number[]>(initial?.niche_ids ?? []);
  const [traffic, setTraffic] = useState(
    initial?.traffic != null ? String(initial.traffic) : "",
  );
  const [da, setDa] = useState(initial?.da != null ? String(initial.da) : "");
  const [dr, setDr] = useState(initial?.dr != null ? String(initial.dr) : "");
  const [spamScore, setSpamScore] = useState(
    initial?.spam_score != null ? String(initial.spam_score) : "",
  );
  const [price, setPrice] = useState(
    initial?.price != null ? String(initial.price) : "",
  );
  const [priceCurrency, setPriceCurrency] = useState(
    initial?.price_currency ?? "USD",
  );
  const [email, setEmail] = useState(initial?.email ?? "");
  const [contactPerson, setContactPerson] = useState(
    initial?.contact_person ?? "",
  );
  const [guestPostAvailable, setGuestPostAvailable] = useState(
    initial?.guest_post_available ?? false,
  );
  const [linkInsertionAvailable, setLinkInsertionAvailable] = useState(
    initial?.link_insertion_available ?? false,
  );
  const [homepageUrl, setHomepageUrl] = useState(initial?.homepage_url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [countries, setCountries] = useState<CountryRef[]>([]);
  const [languages, setLanguages] = useState<LanguageRef[]>([]);
  const [niches, setNiches] = useState<NicheRef[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRef[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [countriesRes, languagesRes, nichesRes, currenciesRes] =
        await Promise.allSettled([
          getCountries(),
          getLanguages(),
          getNiches(),
          getCurrencies(),
        ]);
      if (!active) return;
      if (countriesRes.status === "fulfilled") setCountries(countriesRes.value);
      if (languagesRes.status === "fulfilled") setLanguages(languagesRes.value);
      if (nichesRes.status === "fulfilled") setNiches(nichesRes.value);
      if (currenciesRes.status === "fulfilled")
        setCurrencies(currenciesRes.value);
      if (
        countriesRes.status === "rejected" ||
        languagesRes.status === "rejected" ||
        nichesRes.status === "rejected" ||
        currenciesRes.status === "rejected"
      ) {
        setLookupError("Some pickers could not load. You can still save.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function toggleNiche(id: number) {
    setNicheIds((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id],
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values: WebsiteCreate = {
      domain: domain.trim(),
      name: name.trim() || null,
      main_niche_id: mainNicheId ? Number(mainNicheId) : null,
      country_id: countryId ? Number(countryId) : null,
      language_id: languageId ? Number(languageId) : null,
      traffic: toNumberOrNull(traffic),
      da: toNumberOrNull(da),
      dr: toNumberOrNull(dr),
      spam_score: toNumberOrNull(spamScore),
      price: toNumberOrNull(price),
      price_currency: priceCurrency,
      email: email.trim() || null,
      contact_person: contactPerson.trim() || null,
      guest_post_available: guestPostAvailable,
      link_insertion_available: linkInsertionAvailable,
      homepage_url: homepageUrl.trim() || null,
      notes: notes.trim() || null,
      niche_ids: nicheIds,
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
        <label htmlFor="domain" className={labelClass}>
          Domain <span className="text-destructive">*</span>
        </label>
        <input
          id="domain"
          type="text"
          required
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name ?? ""}
          onChange={(e) => setName(e.target.value)}
          placeholder="Example Magazine"
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
          <label htmlFor="country" className={labelClass}>
            Country
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
          <label htmlFor="language" className={labelClass}>
            Language
          </label>
          <select
            id="language"
            value={languageId}
            onChange={(e) => setLanguageId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="homepage_url" className={labelClass}>
            Homepage URL
          </label>
          <input
            id="homepage_url"
            type="url"
            value={homepageUrl ?? ""}
            onChange={(e) => setHomepageUrl(e.target.value)}
            placeholder="https://example.com"
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <span className={labelClass}>Additional niches</span>
        {niches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No niches available.</p>
        ) : (
          <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-input p-3 sm:grid-cols-3">
            {niches.map((n) => (
              <label
                key={n.id}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <input
                  type="checkbox"
                  checked={nicheIds.includes(n.id)}
                  onChange={() => toggleNiche(n.id)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="truncate">{n.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="traffic" className={labelClass}>
            Traffic
          </label>
          <input
            id="traffic"
            type="number"
            min={0}
            value={traffic}
            onChange={(e) => setTraffic(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="da" className={labelClass}>
            DA
          </label>
          <input
            id="da"
            type="number"
            min={0}
            value={da}
            onChange={(e) => setDa(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="dr" className={labelClass}>
            DR
          </label>
          <input
            id="dr"
            type="number"
            min={0}
            value={dr}
            onChange={(e) => setDr(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="spam_score" className={labelClass}>
            Spam score
          </label>
          <input
            id="spam_score"
            type="number"
            min={0}
            value={spamScore}
            onChange={(e) => setSpamScore(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="price" className={labelClass}>
            Price
          </label>
          <div className="flex gap-2">
            <input
              id="price"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={`${inputClass} min-w-0 flex-1`}
            />
            <select
              id="price_currency"
              aria-label="Price currency"
              value={priceCurrency}
              onChange={(e) => setPriceCurrency(e.target.value)}
              className={`${compactInputClass} w-24 shrink-0`}
            >
              {currencies.length === 0 && (
                <option value={priceCurrency}>{priceCurrency}</option>
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
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email ?? ""}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact_person" className={labelClass}>
            Contact person
          </label>
          <input
            id="contact_person"
            type="text"
            value={contactPerson ?? ""}
            onChange={(e) => setContactPerson(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={guestPostAvailable}
            onChange={(e) => setGuestPostAvailable(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Guest post available
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={linkInsertionAvailable}
            onChange={(e) => setLinkInsertionAvailable(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Link insertion available
        </label>
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
        disabled={submitting || domain.trim() === ""}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export default WebsiteForm;
