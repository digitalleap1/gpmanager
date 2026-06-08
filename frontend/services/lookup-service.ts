/**
 * Typed wrappers around the GPOMS lookup endpoints.
 *
 * `getUsers` is used to populate assignee/team-lead pickers. The endpoint is
 * restricted to admins/team-leads, so a 403 for a plain user is swallowed and
 * surfaced as an empty list rather than an error.
 */

import { api, ApiError } from "@/lib/api";
import type {
  CountryRef,
  CurrencyRef,
  LanguageRef,
  NicheRef,
  UserSummary,
} from "@/lib/types";

export function getCountries(): Promise<CountryRef[]> {
  return api.get<CountryRef[]>("/lookups/countries");
}

export function getNiches(): Promise<NicheRef[]> {
  return api.get<NicheRef[]>("/lookups/niches");
}

export function getLanguages(): Promise<LanguageRef[]> {
  return api.get<LanguageRef[]>("/lookups/languages");
}

export function getCurrencies(): Promise<CurrencyRef[]> {
  return api.get<CurrencyRef[]>("/lookups/currencies");
}

export async function getUsers(): Promise<UserSummary[]> {
  try {
    return await api.get<UserSummary[]>("/users");
  } catch (err) {
    // Plain users get a 403 — treat that as "no pickable users".
    if (err instanceof ApiError && err.status === 403) {
      return [];
    }
    throw err;
  }
}
