/**
 * Typed wrappers around the GPOMS dashboard endpoints (Module 2).
 */

import { api } from "@/lib/api";
import type {
  Activity,
  BudgetUsagePoint,
  DashboardSummary,
  MonthlyLinksPoint,
} from "@/lib/types";

export function getSummary(): Promise<DashboardSummary> {
  return api.get<DashboardSummary>("/dashboard/summary");
}

export function getRecentActivity(limit = 10): Promise<Activity[]> {
  return api.get<Activity[]>(`/dashboard/recent-activity?limit=${limit}`);
}

export function getMonthlyLinks(year: number): Promise<MonthlyLinksPoint[]> {
  return api.get<MonthlyLinksPoint[]>(
    `/dashboard/charts/monthly-links?year=${year}`,
  );
}

export function getBudgetUsage(year: number): Promise<BudgetUsagePoint[]> {
  return api.get<BudgetUsagePoint[]>(
    `/dashboard/charts/budget-usage?year=${year}`,
  );
}
