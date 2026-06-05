/**
 * Shared API types for the GPOMS frontend.
 */

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  is_superuser: boolean;
  company_id: string;
  roles: string[];
  permissions: string[];
  created_at: string;
}

export type TokenType = "bearer";

/** Tokens-only payload (returned by /auth/refresh). */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: TokenType;
}

/** Full login response — tokens plus the authenticated user. */
export interface LoginResponse extends TokenPair {
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface LogoutRequest {
  refresh_token: string;
}

export interface UpdateProfileRequest {
  full_name?: string;
  phone?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  detail: string;
  /** Present only in dev to skip the email round-trip. */
  debug_token?: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

/** Generic `{ detail }` message envelope. */
export interface MessageResponse {
  detail: string;
}

/* ------------------------------------------------------------------ *
 * Module 2 (Dashboard) + Module 3 (Projects) types
 * ------------------------------------------------------------------ */

/** Generic paginated envelope returned by list endpoints. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/* --- Lightweight reference shapes embedded in larger DTOs --- */

export interface UserRef {
  id: string;
  full_name: string;
}

export interface NicheRef {
  id: number;
  name: string;
}

export interface CountryRef {
  id: number;
  iso_code: string;
  name: string;
}

export interface UserSummary {
  id: string;
  full_name: string;
  email: string;
  roles: string[];
}

/* --- Projects --- */

export type ProjectStatus = "active" | "completed" | "hold" | "cancelled";

export interface ProjectListItem {
  id: string;
  name: string;
  status: string;
  is_archived: boolean;
  monthly_budget: number;
  target_links: number;
  due_date: string | null;
  main_niche: NicheRef | null;
  project_niche: NicheRef | null;
  target_country: CountryRef | null;
  assignee: UserRef | null;
  team_lead: UserRef | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyGoal {
  year: number;
  month: number;
  goal_target: number;
  achieved: number;
  remaining: number;
}

export interface MonthlyBudget {
  year: number;
  month: number;
  budget_amount: number;
  spent_amount: number;
}

export interface ProjectMember {
  user_id: string;
  full_name: string;
  role_label: string | null;
}

export interface ProjectDetail extends ProjectListItem {
  goal: string | null;
  notes: string | null;
  created_by: UserRef | null;
  members: ProjectMember[];
  current_year: number;
  goals: MonthlyGoal[];
  budgets: MonthlyBudget[];
}

export interface ProjectCreate {
  name: string;
  main_niche_id?: number | null;
  project_niche_id?: number | null;
  target_country_id?: number | null;
  assignee_id?: string | null;
  team_lead_id?: string | null;
  monthly_budget?: number;
  target_links?: number;
  goal?: string | null;
  due_date?: string | null;
  status?: string;
  notes?: string | null;
}

/** Filter/query params accepted by `GET /projects`. */
export interface ProjectListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  main_niche_id?: number;
  target_country_id?: number;
  team_lead_id?: string;
  assignee_id?: string;
  archived?: boolean;
  sort?: string;
}

/* --- Dashboard --- */

export interface DashboardSummary {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  on_hold_projects: number;
  cancelled_projects: number;
  total_target_links: number;
  total_live_links: number;
  pending_payments_count: number;
  pending_payments_amount: number;
  monthly_budget_total: number;
  monthly_spent_total: number;
  team_members: number;
}

export interface Activity {
  id: string;
  action: string;
  module: string;
  entity_type: string | null;
  entity_id: string | null;
  user: UserRef | null;
  created_at: string;
  summary: string;
}

export interface MonthlyLinksPoint {
  month: number;
  target: number;
  achieved: number;
}

export interface BudgetUsagePoint {
  month: number;
  budget: number;
  spent: number;
}
