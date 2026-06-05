# API Endpoint Reference

REST API for Digital Leap GPOMS. All routes are mounted under the `/api` prefix
(configurable via `API_V1_PREFIX`). The live, always-current contract is the
auto-generated OpenAPI spec at **`/docs`** (Swagger UI) and **`/api/openapi.json`**.

This document is the planned surface, organized by module and annotated with the
minimum role required.

---

## Conventions

| Topic | Rule |
|-------|------|
| **Auth** | `Authorization: Bearer <access_token>` on every route except `/auth/*` public ones and `/health`. |
| **Tenancy** | The tenant (`company_id`) is derived from the JWT — never from the request body. All list/detail routes are implicitly scoped to the caller's company. |
| **Content type** | `application/json` (except file uploads → `multipart/form-data`, CSV import → `text/csv`). |
| **Pagination** | List endpoints accept `?page=1&page_size=20` and return `{ items, total, page, page_size, pages }`. |
| **Filtering** | List endpoints accept `?search=` plus module-specific filters (documented per module). |
| **Sorting** | `?sort=field` / `?sort=-field` (prefix `-` = descending). |
| **Errors** | Standard codes: `400` validation, `401` unauthenticated, `403` forbidden, `404` not found, `409` conflict, `422` body validation. Body: `{ "detail": "..." }`. |
| **Roles** | `admin` > `team_lead` > `user`. "Owner/assignee" means the rule also passes if the caller owns the resource. |
| **IDs** | UUIDs unless noted (lookups use integer IDs). |

Role legend: 🔴 admin · 🟡 team_lead · 🟢 user · ⚪ any authenticated · 🌐 public

---

## `/api/auth` — Authentication (Module 1)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | 🌐 | Exchange email + password for access + refresh tokens. |
| POST | `/auth/refresh` | 🌐* | Rotate a valid refresh token → new access (+ refresh) token. |
| POST | `/auth/logout` | ⚪ | Revoke the current refresh token. |
| POST | `/auth/forgot-password` | 🌐 | Send a password-reset email (always 200 to avoid user enumeration). |
| POST | `/auth/reset-password` | 🌐* | Set a new password using a reset token. |
| POST | `/auth/change-password` | ⚪ | Change own password (requires current password). |
| GET | `/auth/me` | ⚪ | Current user profile + roles + permissions. |
| PATCH | `/auth/me` | ⚪ | Update own profile (name, phone, avatar). |
| POST | `/auth/invitations/accept` | 🌐* | Accept an invitation and set a password. |

\* authenticated by a token in the body, not the `Authorization` header.

---

## `/api/users` — User management (Module 1, admin)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/users` | 🔴🟡 | List users (filters: `role`, `status`, `search`). |
| POST | `/users/invitations` | 🔴 | Invite a user by email + role. |
| GET | `/users/{id}` | 🔴🟡 | User detail. |
| PATCH | `/users/{id}` | 🔴 | Update a user (name, status, role). |
| POST | `/users/{id}/deactivate` | 🔴 | Deactivate (soft) a user. |
| DELETE | `/users/{id}` | 🔴 | Remove a user (guarded; reassigns owned resources). |

## `/api/roles` — Roles & permissions (Module 1, admin)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/roles` | 🔴 | List roles with permission sets. |
| POST | `/roles` | 🔴 | Create a custom role. |
| PATCH | `/roles/{id}` | 🔴 | Update a role's permissions. |
| DELETE | `/roles/{id}` | 🔴 | Delete a custom role (system roles protected). |
| GET | `/permissions` | 🔴 | List the permission catalogue. |

---

## `/api/dashboard` — Dashboard (Module 2)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/dashboard/summary` | ⚪ | Stat cards: total/active/completed projects, total live links, pending payments, monthly budget usage, team productivity. Scoped to the caller's visibility. |
| GET | `/dashboard/charts/monthly-links` | ⚪ | Published links per month (range params). |
| GET | `/dashboard/charts/budget-usage` | ⚪ | Budget vs. spend per month. |
| GET | `/dashboard/charts/team-performance` | 🔴🟡 | Links/tasks per team member. |
| GET | `/dashboard/recent-activity` | ⚪ | Latest activity-log entries. |

---

## `/api/projects` — Project management (Module 3)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/projects` | ⚪ | List (filters: `status`, `niche`, `country`, `team_lead`, `assignee`, `archived`, `search`). Users see only projects they're on. |
| POST | `/projects` | 🔴🟡 | Create a project. |
| GET | `/projects/{id}` | ⚪ | Project detail (with members + current-month goal/budget). |
| PATCH | `/projects/{id}` | 🔴🟡 | Update a project. |
| DELETE | `/projects/{id}` | 🔴 | Delete a project. |
| POST | `/projects/{id}/archive` | 🔴🟡 | Archive / unarchive. |
| GET | `/projects/{id}/members` | ⚪ | List members. |
| POST | `/projects/{id}/members` | 🔴🟡 | Add a member. |
| DELETE | `/projects/{id}/members/{user_id}` | 🔴🟡 | Remove a member. |
| GET | `/projects/export` | 🔴🟡 | Export projects (CSV/Excel; honors filters). |

---

## `/api/goals` — Goal tracking (Module 4)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/projects/{id}/goals` | ⚪ | Monthly goals (Jan–Dec) for a year: `goal_target`, `achieved`, `remaining`. |
| PUT | `/projects/{id}/goals/{year}/{month}` | 🔴🟡 | Set a month's target. |
| POST | `/projects/{id}/goals/bulk` | 🔴🟡 | Set all 12 months for a year at once. |
| GET | `/projects/{id}/budgets` | ⚪ | Monthly budget vs. spend. |
| PUT | `/projects/{id}/budgets/{year}/{month}` | 🔴🟡 | Set a month's budget. |

> `achieved` and `spent_amount` are maintained automatically by the publish/paid
> automations (see [automation-flows.md](../architecture/automation-flows.md)).

---

## `/api/guest-posts` — Guest Post Tracker (Module 5)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/guest-posts` | ⚪ | List (filters: `project`, `status`, `assigned_user`, `website`, `search`). |
| POST | `/guest-posts` | 🟢 | Add a guest post (defaults to `prospect`). |
| GET | `/guest-posts/{id}` | ⚪ | Detail (with status history + outreach). |
| PATCH | `/guest-posts/{id}` | 🟢 | Update fields (price, dates, assigned user, notes). |
| POST | `/guest-posts/{id}/status` | 🟢 | Transition workflow status (writes history; fires automations). |
| POST | `/guest-posts/{id}/live-link` | 🟢 | Upload the live link + set `published`. |
| DELETE | `/guest-posts/{id}` | 🔴🟡 | Delete. |
| GET | `/guest-posts/{id}/outreach` | ⚪ | Outreach message log. |
| POST | `/guest-posts/{id}/outreach` | 🟢 | Log an outreach message. |
| GET | `/guest-posts/export` | 🔴🟡 | Export (CSV/Excel). |

Workflow statuses: `prospect → contacted → negotiating → accepted → invoice_sent → paid → published` (or `rejected`).

---

## `/api/websites` — Website Database (Module 6)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/websites` | ⚪ | List (filters: `country`, `niche`, `min_dr`, `max_dr`, `min_traffic`, `max_price`, `guest_post_available`, `search`). |
| POST | `/websites` | 🟢 | Add a website. |
| GET | `/websites/{id}` | ⚪ | Detail (with contacts + metrics history). |
| PATCH | `/websites/{id}` | 🟢 | Update. |
| DELETE | `/websites/{id}` | 🔴🟡 | Delete. |
| POST | `/websites/import` | 🔴🟡 | Bulk import CSV (returns row-level results). |
| GET | `/websites/export` | ⚪ | Bulk export CSV. |
| POST | `/websites/{id}/contacts` | 🟢 | Add a contact. |

---

## `/api/payments` — Payment management (Module 7)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/payments` | 🔴🟡 | List (filters: `project`, `status`, `date_from`, `date_to`, `search`). |
| POST | `/payments` | 🟢 | Record a payment (defaults to `pending`; auto-fills `amount_inr` from exchange rate). |
| GET | `/payments/{id}` | 🔴🟡 | Detail (with status history). |
| PATCH | `/payments/{id}` | 🔴🟡 | Update. |
| POST | `/payments/{id}/status` | 🔴🟡 | Transition status (`pending→approved→paid`/`failed`; `paid` fires budget automation). |
| POST | `/payments/{id}/invoice` | 🟢 | Attach an invoice file. |
| DELETE | `/payments/{id}` | 🔴 | Delete. |
| GET | `/payments/export` | 🔴🟡 | Export. |

---

## `/api/tasks` — Task management (Module 8)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/tasks` | ⚪ | List (filters: `assigned_to`, `status`, `priority`, `project`, `due_before`, `search`). Users see their own by default. |
| POST | `/tasks` | 🔴🟡 | Create + assign a task. |
| GET | `/tasks/{id}` | ⚪ | Detail (with comments + checklist). |
| PATCH | `/tasks/{id}` | 🟢(assignee)🟡🔴 | Update (status, etc.). |
| POST | `/tasks/{id}/complete` | 🟢(assignee) | Mark completed. |
| DELETE | `/tasks/{id}` | 🔴🟡 | Delete. |
| POST | `/tasks/{id}/comments` | ⚪ | Add a comment. |
| GET | `/tasks/board` | ⚪ | Kanban view grouped by status/column (Phase 2). |

---

## `/api/notifications` — Notifications (Module 9)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/notifications` | ⚪ | Own notifications (filter: `unread`). |
| GET | `/notifications/unread-count` | ⚪ | Badge count. |
| POST | `/notifications/{id}/read` | ⚪ | Mark one read. |
| POST | `/notifications/read-all` | ⚪ | Mark all read. |
| GET | `/notifications/preferences` | ⚪ | Channel preferences. |
| PUT | `/notifications/preferences` | ⚪ | Update channel preferences. |

---

## `/api/reports` — Reports & exports (Module 10)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/reports/project` | 🔴🟡 | Project report (filters: date range, project, team lead, country). |
| GET | `/reports/team` | 🔴🟡 | Team performance report. |
| GET | `/reports/financial` | 🔴🟡 | Financial report. |
| GET | `/reports/guest-post` | 🔴🟡 | Guest-post report. |
| POST | `/reports/export` | 🔴🟡 | Queue an export (`format`: excel/csv/pdf) → `report_exports` row. |
| GET | `/reports/exports/{id}` | 🔴🟡 | Export job status + download URL. |
| GET | `/reports/saved` | 🔴🟡 | List saved report configs. |
| POST | `/reports/saved` | 🔴🟡 | Save a report config. |

---

## `/api/activity-logs` — Activity logs (Module 11)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/activity-logs` | 🔴🟡 | Audit trail (filters: `user`, `module`, `entity_type`, `entity_id`, `date_from`, `date_to`). |
| GET | `/activity-logs/{id}` | 🔴🟡 | Single entry with `old_value`/`new_value` diff. |

---

## `/api/files` — File storage

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/files` | ⚪ | Upload a file (multipart) → returns file id. |
| GET | `/files/{id}` | ⚪ | Download / signed URL. |
| DELETE | `/files/{id}` | 🔴🟡 | Delete. |

---

## `/api/companies` & billing — SaaS (Phase 3)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/signup` | 🌐 | Create a company + first admin + trial subscription. |
| GET | `/companies/current` | ⚪ | Current company profile + settings. |
| PATCH | `/companies/current` | 🔴 | Update company settings/branding. |
| GET | `/plans` | 🌐 | Public plan catalogue (Starter/Professional/Agency). |
| GET | `/billing/subscription` | 🔴 | Current subscription. |
| POST | `/billing/subscribe` | 🔴 | Start/switch a plan (Stripe checkout). |
| POST | `/billing/portal` | 🔴 | Stripe billing portal session. |
| GET | `/billing/invoices` | 🔴 | Company invoices. |
| POST | `/webhooks/stripe` | 🌐* | Stripe webhook (signature-verified; idempotent). |

---

## `/health` & meta

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/` | 🌐 | Liveness landing route. |
| GET | `/api/health` | 🌐 | Readiness check (used by Docker healthcheck). |
| GET | `/docs` · `/redoc` | 🌐 | Interactive API documentation. |
