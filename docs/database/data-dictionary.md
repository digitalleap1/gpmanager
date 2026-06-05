# Data Dictionary

Column-level reference for the GPOMS database. Pairs with the DDL in
[schema.sql](schema.sql) and the visual model in [er-diagram.md](er-diagram.md).

**Common columns** (present on most tables, omitted from the per-table lists below
unless they carry special meaning):

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key, `gen_random_uuid()` (lookups use `SERIAL`). |
| `company_id` | UUID | Tenant FK → `companies.id`. On every tenant-scoped table. |
| `created_at` | TIMESTAMPTZ | Defaults to `now()`. |
| `updated_at` | TIMESTAMPTZ | Defaults to `now()`, bumped on update. |

## Enum types

| Enum | Values |
|------|--------|
| `user_status` | active, invited, suspended, deactivated |
| `role_scope` | system, custom |
| `project_status` | active, completed, hold, cancelled |
| `guest_post_status` | prospect, contacted, negotiating, accepted, invoice_sent, paid, published, rejected |
| `payment_status` | pending, approved, paid, failed |
| `task_status` | pending, in_progress, completed, overdue |
| `task_priority` | low, medium, high |
| `notification_type` | project_assigned, task_assigned, task_overdue, payment_due, payment_completed, goal_achieved, guest_post_published, mention, system |
| `notification_channel` | in_app, email, whatsapp |
| `subscription_status` | trialing, active, past_due, canceled, incomplete |
| `plan_tier` | starter, professional, agency |
| `outreach_direction` | outbound, inbound |

---

## 1. Lookups

### `countries`
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| iso_code | CHAR(2) UNIQUE | ISO 3166-1 alpha-2. |
| name | VARCHAR(100) | Display name. |
| phone_code | VARCHAR(8) | Dial code. |

### `languages`
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| iso_code | VARCHAR(8) UNIQUE | ISO 639-1 (`en`, `en-US`). |
| name | VARCHAR(100) | Display name. |

### `niches`
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| name | VARCHAR(120) UNIQUE | Niche name. |
| slug | VARCHAR(140) UNIQUE | URL-safe slug. |
| parent_id | INT FK→niches | Optional hierarchy. |

### `tags`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | Tenant. |
| name | VARCHAR(80) | Unique per company. |
| color | VARCHAR(9) | `#RRGGBB(AA)`. |

---

## 2. Tenancy & Auth

### `companies` — the tenant boundary
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| name | VARCHAR(160) | Company name. |
| slug | VARCHAR(180) UNIQUE | Subdomain / URL slug. |
| logo_file_id | UUID FK→files | Branding logo. |
| plan_tier | plan_tier | Cached plan (source of truth = subscription). |
| is_active | BOOL | Tenant enabled. |
| trial_ends_at | TIMESTAMPTZ | Trial expiry. |

### `roles`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK (nullable) | NULL = global system role. |
| name / slug | VARCHAR | `admin` / `team_lead` / `user` or custom. |
| scope | role_scope | system or custom. |
| description | VARCHAR(255) | |

### `permissions`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| code | VARCHAR(80) UNIQUE | `<module>.<action>`, e.g. `payment.manage`. |
| module | VARCHAR(40) | Owning module. |
| description | VARCHAR(255) | |

### `role_permissions` (M2M)
`role_id` UUID FK · `permission_id` UUID FK · PK = both.

### `users`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | Tenant. Unique with `email`. |
| email | CITEXT | Case-insensitive login. |
| hashed_password | VARCHAR(255) | NULL until invite accepted. bcrypt. |
| full_name | VARCHAR(160) | |
| avatar_file_id | UUID FK→files | |
| phone | VARCHAR(32) | |
| status | user_status | active / invited / suspended / deactivated. |
| is_superuser | BOOL | Platform-level override. |
| last_login_at | TIMESTAMPTZ | |

### `user_roles` (M2M)
`user_id` UUID FK · `role_id` UUID FK · PK = both. Phase 1 = one role/user.

### `refresh_tokens`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| user_id | UUID FK | |
| token_hash | VARCHAR(255) UNIQUE | Hash of the raw token (never store raw). |
| expires_at | TIMESTAMPTZ | |
| revoked_at | TIMESTAMPTZ | Set on logout / rotation. |
| user_agent / ip_address | VARCHAR / INET | Device audit. |

### `password_reset_tokens`
`id`, `user_id` FK, `token_hash` UNIQUE, `expires_at`, `used_at`. Single-use.

### `user_invitations`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | |
| email | CITEXT | Invitee. |
| role_id | UUID FK→roles | Role to grant on accept. |
| invited_by | UUID FK→users | |
| token_hash | VARCHAR(255) UNIQUE | |
| accepted_at / expires_at | TIMESTAMPTZ | |

### `user_login_history`
`id`, `user_id` FK, `ip_address` INET, `user_agent`, `success` BOOL, `created_at`.

---

## 3. Projects, Goals & Budgets

### `projects`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | Tenant. |
| name | VARCHAR(180) | |
| main_niche_id / project_niche_id | INT FK→niches | Two-level niche. |
| target_country_id | INT FK→countries | |
| assignee_id | UUID FK→users | Primary owner. |
| team_lead_id | UUID FK→users | Supervising lead. |
| monthly_budget | NUMERIC(12,2) | Default monthly budget. |
| target_links | INT | Overall link goal. |
| goal | TEXT | Free-text objective. |
| due_date | DATE | |
| status | project_status | active / completed / hold / cancelled. |
| notes | TEXT | |
| is_archived | BOOL | Soft archive. |
| created_by | UUID FK→users | |

### `project_members` (M2M)
`project_id` FK · `user_id` FK · `role_label` VARCHAR(60) · `added_at`. PK = (project, user).

### `project_monthly_goals`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Unique (project, year, month). |
| project_id | UUID FK | |
| year / month | SMALLINT | month 1–12. |
| goal_target | INT | Planned links for the month. |
| achieved | INT | Auto-incremented when a guest post is published. |

> `remaining = goal_target − achieved` (computed in app/view).

### `project_monthly_budgets`
Same shape as goals: `budget_amount` (planned), `spent_amount` (auto-bumped on
payment `paid`). Unique (project, year, month).

---

## 4. Website Database

### `websites`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | Unique with `domain`. |
| domain | CITEXT | Case-insensitive. |
| name | VARCHAR(180) | |
| main_niche_id | INT FK→niches | |
| country_id / language_id | INT FK | |
| traffic | BIGINT | Monthly visits. |
| da / dr / spam_score | SMALLINT | 0–100 metrics. |
| price | NUMERIC(12,2) | Placement price. |
| email / contact_person | CITEXT / VARCHAR | Primary contact. |
| guest_post_available | BOOL | |
| link_insertion_available | BOOL | |
| homepage_url | VARCHAR(500) | |
| notes | TEXT | |

### `website_contacts`
`id`, `website_id` FK, `name`, `email` CITEXT, `role`, `is_primary` BOOL.

### `website_niches` (M2M)
`website_id` FK · `niche_id` FK. PK = both.

### `website_metrics_history`
`id`, `website_id` FK, `captured_on` DATE, `da`, `dr`, `traffic`, `spam_score`.
Unique (website, captured_on) — one snapshot per day.

---

## 5. Guest Post Tracker

### `guest_posts`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | |
| project_id | UUID FK | Parent project. |
| website_id | UUID FK (nullable) | Linked website (if in DB). |
| website_name | VARCHAR(180) | Snapshot if ad-hoc. |
| da / dr / traffic / price | metrics | Snapshot at placement. |
| contact_email | CITEXT | |
| assigned_user_id | UUID FK→users | Owner of the placement. |
| status | guest_post_status | Workflow state. |
| outreach_date | DATE | First contact. |
| live_link_date | DATE | Publish date (drives goal month). |
| live_link | VARCHAR(700) | Published URL. |
| anchor_text | VARCHAR(255) | |
| notes | TEXT | |

### `guest_post_status_history`
`id`, `guest_post_id` FK, `from_status`, `to_status`, `changed_by` FK, `note`,
`created_at`. One row per transition (drives audit + idempotent automations).

### `outreach_messages`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | |
| guest_post_id | UUID FK | |
| website_id | UUID FK (nullable) | |
| direction | outreach_direction | outbound / inbound. |
| subject / body | VARCHAR / TEXT | |
| sent_by | UUID FK→users | |
| sent_at | TIMESTAMPTZ | |

---

## 6. Payments

### `payments`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | |
| project_id / website_id / guest_post_id | UUID FK (nullable) | What's being paid for. |
| live_link | VARCHAR(700) | Convenience copy. |
| amount_usd | NUMERIC(12,2) | |
| amount_inr | NUMERIC(14,2) | Auto-filled from `exchange_rates`. |
| invoice_file_id | UUID FK→files | Uploaded invoice. |
| invoice_link | VARCHAR(700) | External invoice URL. |
| payment_date | DATE | |
| transaction_id | VARCHAR(120) | |
| remarks | TEXT | |
| status | payment_status | pending / approved / paid / failed. |
| created_by / approved_by | UUID FK→users | |

### `payment_status_history`
`id`, `payment_id` FK, `from_status`, `to_status`, `changed_by` FK, `note`, `created_at`.

### `exchange_rates`
`id`, `base_currency` CHAR(3), `quote_currency` CHAR(3), `rate` NUMERIC(14,6),
`rate_date` DATE. Unique (base, quote, date). Source for USD↔INR conversion.

---

## 7. Tasks (+ Phase 2 Kanban)

### `tasks`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | |
| project_id | UUID FK (nullable) | Optional project link. |
| board_id | UUID FK→task_boards | Phase 2 Kanban. |
| name | VARCHAR(200) | |
| description | TEXT | |
| assigned_to | UUID FK→users | |
| priority | task_priority | low / medium / high. |
| status | task_status | pending / in_progress / completed / overdue. |
| due_date | DATE | |
| completed_at | TIMESTAMPTZ | |
| created_by | UUID FK→users | |

### `task_comments`
`id`, `task_id` FK, `author_id` FK, `body` TEXT, `created_at`.

### `task_checklist_items`
`id`, `task_id` FK, `label` VARCHAR(255), `is_done` BOOL, `position` INT.

---

## 8. Notifications

### `notifications`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | |
| user_id | UUID FK | Recipient. |
| type | notification_type | |
| title | VARCHAR(200) | |
| body | TEXT | |
| entity_type / entity_id | VARCHAR / UUID | Polymorphic deep-link target. |
| is_read | BOOL | |
| read_at | TIMESTAMPTZ | |

### `notification_preferences`
`id`, `user_id` FK, `type`, `channel` (in_app/email/whatsapp), `enabled` BOOL.
Unique (user, type, channel).

---

## 9. Reports

### `saved_reports`
`id`, `company_id` FK, `owner_id` FK, `name`, `report_type`
(project/team/financial/guest_post), `filters` JSONB.

### `report_exports`
`id`, `company_id` FK, `requested_by` FK, `report_type`, `format`
(excel/csv/pdf), `filters` JSONB, `file_id` FK→files, `status`
(pending/ready/failed).

---

## 10. Activity, Files, Tagging, System

### `activity_logs` — audit trail
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| company_id | UUID FK | |
| user_id | UUID FK (nullable) | Actor. |
| action | VARCHAR(80) | e.g. `payment.paid`. |
| module | VARCHAR(40) | |
| entity_type / entity_id | VARCHAR / UUID | Affected record. |
| old_value / new_value | JSONB | Before/after diff. |
| ip_address | INET | |

### `files`
`id`, `company_id` FK, `storage_key` (local path / S3 key), `original_name`,
`content_type`, `size_bytes`, `uploaded_by` FK.

### `taggables` (polymorphic)
`tag_id` FK · `entity_type` · `entity_id`. PK = all three.

### `system_settings`
`id`, `company_id` FK (nullable = global), `key`, `value` JSONB. Unique (company, key).

---

## 11. Phase 2 — Kanban & Workflows

| Table | Key columns |
|-------|-------------|
| `task_boards` | `id`, `company_id`, `project_id`, `name`. |
| `task_board_columns` | `id`, `board_id`, `name`, `position`, `wip_limit`. |
| `status_workflows` | `id`, `company_id`, `applies_to` (guest_post/task/payment), `name`, `is_default`. |
| `workflow_statuses` | `id`, `workflow_id`, `code`, `label`, `color`, `position`, `is_terminal`. |

---

## 12. Phase 3 — SaaS Billing

| Table | Key columns |
|-------|-------------|
| `subscription_plans` | `id`, `tier`, `name`, `price_monthly_usd`, `price_yearly_usd`, `max_users`, `max_projects`, `stripe_price_id`. |
| `plan_features` | `id`, `plan_id`, `feature_key`, `value` JSONB. Unique (plan, feature). |
| `company_subscriptions` | `id`, `company_id`, `plan_id`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_start/end`, `cancel_at_period_end`. |
| `company_invoices` | `id`, `company_id`, `stripe_invoice_id`, `amount_usd`, `status`, `issued_at`, `paid_at`, `hosted_invoice_url`. |
| `payment_methods` | `id`, `company_id`, `stripe_payment_method_id`, `brand`, `last4`, `exp_month/year`, `is_default`. |
| `subscription_events` | `id`, `company_id`, `stripe_event_id` UNIQUE, `event_type`, `payload` JSONB, `processed_at`. Idempotent webhook log. |
| `company_settings` | `company_id` PK, `default_currency`, `timezone`, `date_format`, `brand_color`, `settings` JSONB. |
