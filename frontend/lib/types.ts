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
 * Phase 1 RBAC (Teams + Roles & Permissions) types
 * ------------------------------------------------------------------ */

/** A team row as returned by `GET /teams`. */
export interface TeamListItem {
  id: string;
  name: string;
  description: string | null;
  team_lead: UserSummary | null;
  member_count: number;
  created_at: string;
}

/** Full team record (`GET /teams/{id}`, plus create/update/member responses). */
export interface TeamRead extends TeamListItem {
  members: UserSummary[];
}

/** A team node within the org hierarchy. */
export interface HierarchyTeam {
  id: string;
  name: string;
  team_lead: UserSummary | null;
  members: UserSummary[];
}

/** Org-chart payload returned by `GET /teams/hierarchy`. */
export interface OrgHierarchy {
  admins: UserSummary[];
  teams: HierarchyTeam[];
  unassigned: UserSummary[];
}

/** Body for `POST /teams`. */
export interface TeamCreate {
  name: string;
  description?: string | null;
  team_lead_id?: string | null;
  member_ids?: string[];
}

/** Body for `PATCH /teams/{id}` — every field optional. */
export interface TeamUpdate {
  name?: string;
  description?: string | null;
  team_lead_id?: string | null;
}

/** A single permission descriptor. */
export interface PermissionItem {
  code: string;
  module: string;
  description: string | null;
}

/** Permissions grouped by module (`GET /roles/permissions`). */
export interface PermissionGroup {
  module: string;
  permissions: PermissionItem[];
}

/** Full role record returned by the `/roles` endpoints. */
export interface RoleDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  scope: string;
  is_system: boolean;
  editable: boolean;
  permission_codes: string[];
  user_count: number;
}

/** Body for `POST /roles`. */
export interface RoleCreate {
  name: string;
  description?: string | null;
  permission_codes: string[];
}

/** Body for `PATCH /roles/{id}` — every field optional. */
export interface RoleUpdate {
  name?: string;
  description?: string | null;
  permission_codes?: string[];
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

export interface LanguageRef {
  id: number;
  iso_code: string;
  name: string;
}

export interface CurrencyRef {
  code: string;
  symbol: string;
  name: string;
}

export interface UserSummary {
  id: string;
  full_name: string;
  email: string;
  roles: string[];
}

/* ------------------------------------------------------------------ *
 * User Management (admin) types
 * ------------------------------------------------------------------ */

export type RoleSlug = "admin" | "team_lead" | "user";
export type UserStatus = "active" | "suspended" | "deactivated";

/** A system role returned by `GET /users/roles`. */
export interface RoleRead {
  id: string;
  slug: string;
  name: string;
}

/** Full user record returned by the admin user-management endpoints. */
export interface UserAdminRead {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  is_superuser: boolean;
  roles: string[];
  created_at: string;
  last_login_at: string | null;
}

/** Body for `POST /users`. */
export interface UserCreate {
  email: string;
  full_name: string;
  password: string;
  role_slug: RoleSlug;
  phone?: string | null;
}

/** Body for `PATCH /users/{id}` — every field optional. */
export interface UserUpdate {
  full_name?: string;
  phone?: string | null;
  status?: UserStatus;
  role_slug?: RoleSlug;
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

/** Result envelope returned by `POST /projects/bulk-assign`. */
export interface BulkAssignResult {
  updated: number;
  skipped: number;
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
  client_id?: string;
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

/* ------------------------------------------------------------------ *
 * Module 5 (Guest Post Tracker) types
 * ------------------------------------------------------------------ */

export type GuestPostStatus =
  | "prospect"
  | "contacted"
  | "negotiating"
  | "accepted"
  | "invoice_sent"
  | "paid"
  | "published"
  | "rejected";

export interface GuestPostListItem {
  id: string;
  project_id: string;
  project_name: string;
  website_id: string | null;
  website_name: string | null;
  da: number | null;
  dr: number | null;
  traffic: number | null;
  price: number | null;
  contact_email: string | null;
  assigned_user: UserRef | null;
  status: string;
  outreach_date: string | null;
  live_link_date: string | null;
  live_link: string | null;
  anchor_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatusHistoryEntry {
  from_status: string | null;
  to_status: string;
  changed_by: UserRef | null;
  note: string | null;
  created_at: string;
}

export interface GuestPostDetail extends GuestPostListItem {
  notes: string | null;
  status_history: StatusHistoryEntry[];
}

/** Body for `POST /guest-posts`. Dates are `YYYY-MM-DD`. */
export interface GuestPostCreate {
  project_id: string;
  website_id?: string | null;
  website_name?: string | null;
  da?: number | null;
  dr?: number | null;
  traffic?: number | null;
  price?: number | null;
  contact_email?: string | null;
  assigned_user_id?: string | null;
  status?: string;
  outreach_date?: string | null;
  live_link_date?: string | null;
  live_link?: string | null;
  anchor_text?: string | null;
  notes?: string | null;
}

/** Partial body for `PATCH /guest-posts/{id}`. */
export type GuestPostUpdate = Partial<GuestPostCreate>;

/** Body for `POST /guest-posts/{id}/publish`. */
export interface GuestPostPublish {
  live_link: string;
  live_link_date?: string | null;
  anchor_text?: string | null;
}

/** Filter/query params accepted by `GET /guest-posts`. */
export interface GuestPostListParams {
  page?: number;
  page_size?: number;
  project_id?: string;
  status?: string;
  assigned_user_id?: string;
  website_id?: string;
  search?: string;
  sort?: string;
}

/* ------------------------------------------------------------------ *
 * Module 6 (Website Database) types
 * ------------------------------------------------------------------ */

export interface WebsiteContact {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  is_primary: boolean;
}

export interface WebsiteMetric {
  captured_on: string;
  da: number | null;
  dr: number | null;
  traffic: number | null;
  spam_score: number | null;
}

export interface WebsiteListItem {
  id: string;
  domain: string;
  name: string | null;
  main_niche: NicheRef | null;
  country: CountryRef | null;
  language: LanguageRef | null;
  traffic: number | null;
  da: number | null;
  dr: number | null;
  spam_score: number | null;
  price: number | null;
  email: string | null;
  contact_person: string | null;
  guest_post_available: boolean;
  link_insertion_available: boolean;
  homepage_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebsiteDetail extends WebsiteListItem {
  notes: string | null;
  niche_ids: number[];
  contacts: WebsiteContact[];
  metrics_history: WebsiteMetric[];
}

/** Body for `POST /websites`. */
export interface WebsiteCreate {
  domain: string;
  name?: string | null;
  main_niche_id?: number | null;
  country_id?: number | null;
  language_id?: number | null;
  traffic?: number | null;
  da?: number | null;
  dr?: number | null;
  spam_score?: number | null;
  price?: number | null;
  email?: string | null;
  contact_person?: string | null;
  guest_post_available?: boolean;
  link_insertion_available?: boolean;
  homepage_url?: string | null;
  notes?: string | null;
  niche_ids?: number[];
}

/** Partial body for `PATCH /websites/{id}`. */
export type WebsiteUpdate = Partial<WebsiteCreate>;

/** Body for `POST /websites/{id}/contacts`. */
export interface WebsiteContactCreate {
  name?: string | null;
  email?: string | null;
  role?: string | null;
  is_primary?: boolean;
}

/**
 * Shared result envelope returned by every bulk `POST /{entity}/import`
 * endpoint (websites, payments, projects).
 */
export interface BulkImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

/** Result envelope returned by `POST /websites/import`. */
export type WebsiteImportResult = BulkImportResult;

/* ------------------------------------------------------------------ *
 * Module 7 (Payment Management) types
 * ------------------------------------------------------------------ */

export type PaymentStatus =
  | "pending"
  | "negotiation"
  | "paid"
  | "free"
  | "cancelled"
  | "rejected";

export interface PaymentListItem {
  id: string;
  project_id: string | null;
  project_name: string | null;
  website_id: string | null;
  website_domain: string | null;
  live_link: string | null;
  currency: string;
  amount: number | null;
  fx_to_usd: number | null;
  amount_usd: number | null;
  amount_inr: number | null;
  mode_of_payment: string | null;
  notified: boolean;
  invoice_link: string | null;
  payment_date: string | null;
  transaction_id: string | null;
  remarks: string | null;
  status: string;
  client_id: string | null;
  client_name: string | null;
  attributed_to: UserRef | null;
  via: string | null;
  invoice_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentStatusHistoryEntry {
  from_status: string | null;
  to_status: string;
  changed_by: UserRef | null;
  note: string | null;
  created_at: string;
}

export interface PaymentDetail extends PaymentListItem {
  status_history: PaymentStatusHistoryEntry[];
}

/** Body for `POST /payments`. Dates are `YYYY-MM-DD`. */
export interface PaymentCreate {
  project_id?: string | null;
  website_id?: string | null;
  live_link?: string | null;
  currency?: string;
  amount?: number | null;
  fx_to_usd?: number | null;
  amount_usd?: number | null;
  amount_inr?: number | null;
  mode_of_payment?: string | null;
  notified?: boolean;
  invoice_link?: string | null;
  payment_date?: string | null;
  transaction_id?: string | null;
  remarks?: string | null;
  status?: string;
  client_id?: string | null;
  attributed_to_id?: string | null;
  via?: string | null;
  invoice_number?: string | null;
}

/** Partial body for `PATCH /payments/{id}`. */
export type PaymentUpdate = Partial<PaymentCreate>;

/** Filter/query params accepted by `GET /payments`. */
export interface PaymentListParams {
  page?: number;
  page_size?: number;
  project_id?: string;
  client_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort?: string;
}

/** Filter/query params accepted by `GET /websites` (and `/websites/export`). */
export interface WebsiteListParams {
  page?: number;
  page_size?: number;
  search?: string;
  country_id?: number;
  niche_id?: number;
  min_dr?: number;
  max_dr?: number;
  min_traffic?: number;
  max_price?: number;
  guest_post_available?: boolean;
  sort?: string;
}

/* ------------------------------------------------------------------ *
 * Module 8 (Task Management) types
 * ------------------------------------------------------------------ */

export type TaskStatus = "pending" | "in_progress" | "completed" | "overdue";
export type TaskPriority = "low" | "medium" | "high";

export interface TaskListItem {
  id: string;
  project_id: string | null;
  project_name: string | null;
  name: string;
  description: string | null;
  assigned_to: UserRef | null;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  author: UserRef | null;
  body: string;
  created_at: string;
}

export interface TaskDetail extends TaskListItem {
  comments: TaskComment[];
}

/** Body for `POST /tasks`. Dates are `YYYY-MM-DD`. */
export interface TaskCreate {
  project_id?: string | null;
  name: string;
  description?: string | null;
  assigned_to?: string | null;
  priority?: string;
  due_date?: string | null;
  status?: string;
}

/** Partial body for `PATCH /tasks/{id}`. */
export type TaskUpdate = Partial<TaskCreate>;

/** Filter/query params accepted by `GET /tasks`. */
export interface TaskListParams {
  page?: number;
  page_size?: number;
  project_id?: string;
  status?: string;
  priority?: string;
  assigned_to?: string;
  due_before?: string;
  search?: string;
  sort?: string;
}

/* ------------------------------------------------------------------ *
 * Module 9 (Notifications) types
 * ------------------------------------------------------------------ */

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

/** Filter/query params accepted by `GET /notifications`. */
export interface NotificationListParams {
  unread?: boolean;
  page?: number;
  page_size?: number;
}

/* ------------------------------------------------------------------ *
 * Module 10 (Reports & Exports) types
 * ------------------------------------------------------------------ */

/** Report path segment / discriminator. */
export type ReportType = "project" | "team" | "financial" | "guest-post";

/** A single column descriptor in a generic report. */
export interface ReportColumn {
  key: string;
  label: string;
}

/**
 * Generic report payload. The UI renders any report purely from `columns` +
 * `rows`, with an optional bold totals row keyed the same way as the columns.
 */
export interface ReportResult {
  report_type: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, string | number | null> | null;
}

/**
 * Filters accepted by the reports endpoints. Not every filter applies to every
 * report — only the set ones are sent and the backend ignores irrelevant ones.
 * `status` is mainly for the guest-post report.
 */
export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  project_id?: string;
  team_lead_id?: string;
  country_id?: number;
  status?: string;
}

/* ------------------------------------------------------------------ */
/* Import Engine (`/imports`)                                          */
/* ------------------------------------------------------------------ */

/** A single source→target column mapping within an import profile. */
export interface ImportMapping {
  source: string;
  target: string;
}

/** An importable entity preset (`GET /imports/profiles`). */
export interface ImportProfile {
  key: string;
  label: string;
  description: string;
  entity_type: string;
  mapping: ImportMapping[];
}

/** A validation note attached to a previewed row. */
export interface PreviewIssue {
  level: "error" | "warning";
  message: string;
}

/** Status of a row during a dry-run preview. */
export type PreviewRowStatus = "new" | "duplicate" | "invalid";

/** One row of a dry-run preview. */
export interface PreviewRow {
  row_number: number;
  status: PreviewRowStatus;
  label: string;
  source: string | null;
  issues: PreviewIssue[];
  values: Record<string, unknown>;
}

/** Dry-run report returned by `POST /imports/preview`. */
export interface PreviewReport {
  profile: string;
  label: string;
  entity_type: string;
  source_filename: string | null;
  mapping: ImportMapping[];
  total_rows: number;
  new_count: number;
  duplicate_count: number;
  invalid_count: number;
  warning_count: number;
  truncated: boolean;
  rows: PreviewRow[];
}

/** Summary of a committed import batch (`GET /imports`). */
export interface ImportBatch {
  id: string;
  profile: string;
  entity_type: string;
  source_filename: string | null;
  status: string;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  created_at: string;
}

/** Per-row outcome of a committed import. */
export interface ImportRecord {
  row_number: number;
  action: string;
  entity_id: string | null;
  message: string | null;
}

/** Full detail for a committed import batch (`GET /imports/{id}`). */
export interface ImportBatchDetail extends ImportBatch {
  records: ImportRecord[];
}

/* ------------------------------------------------------------------ *
 * Clients (`/clients`)                                                *
 * ------------------------------------------------------------------ */

/** A client row as returned by `GET /clients`. */
export interface ClientListItem {
  id: string;
  name: string;
  currency: string;
  status: string;
  total_budget: number;
  total_paid: number;
  remaining_budget: number;
  project_count: number;
  created_at: string;
}

/** Aggregate financial + project metrics for a single client. */
export interface ClientMetrics {
  total_budget: number;
  total_paid: number;
  consumed_budget: number;
  remaining_budget: number;
  pending_amount: number;
  revenue: number;
  project_count: number;
  active_projects: number;
  completed_projects: number;
  payment_count: number;
}

/** Full client record (`GET /clients/{id}`, plus create/update responses). */
export interface ClientDetail {
  id: string;
  name: string;
  currency: string;
  status: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  notes: string | null;
  created_at: string;
  metrics: ClientMetrics;
}

/** Body for `POST /clients`. */
export interface ClientCreate {
  name: string;
  currency?: string;
  total_budget?: number;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website?: string | null;
  notes?: string | null;
  status?: string;
}

/** Partial body for `PATCH /clients/{id}` — every field optional. */
export type ClientUpdate = Partial<ClientCreate>;

/* ------------------------------------------------------------------ *
 * Payments Ledger (`GET /payments/ledger-stats`)                     *
 * ------------------------------------------------------------------ */

/** A single month's revenue point in the ledger trend. */
export interface MonthlyRevenuePoint {
  year: number;
  month: number;
  revenue: number;
}

/** A named entity (client or team member) with an associated revenue total. */
export interface NamedRevenue {
  id: string;
  name: string;
  revenue: number;
}

/** Count + amount aggregated for a single payment status. */
export interface StatusBreakdown {
  status: string;
  count: number;
  amount: number;
}

/** Payload returned by `GET /payments/ledger-stats`. */
export interface LedgerStats {
  total_revenue: number;
  pending_count: number;
  pending_amount: number;
  overdue_count: number;
  overdue_amount: number;
  monthly_revenue: MonthlyRevenuePoint[];
  client_revenue: NamedRevenue[];
  team_revenue: NamedRevenue[];
  status_breakdown: StatusBreakdown[];
}

/* ------------------------------------------------------------------ *
 * Audit Logs (`/audit-logs`) — admin only                            *
 * ------------------------------------------------------------------ */

/** A single audit-log entry returned by `GET /audit-logs`. */
export interface AuditLogRead {
  id: string;
  user: { id: string; full_name: string } | null;
  action: string;
  module: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

/** Filter/query params accepted by `GET /audit-logs`. */
export interface AuditLogListParams {
  page?: number;
  page_size?: number;
  module?: string;
  action?: string;
  user_id?: string;
}

/* ------------------------------------------------------------------ *
 * Trash / soft-deletes (`/trash`) — manager                          *
 * ------------------------------------------------------------------ */

/** A soft-deleted record listed by `GET /trash`. */
export interface TrashItem {
  entity_type: string;
  id: string;
  label: string;
  deleted_at: string;
  deleted_by: string | null;
}
