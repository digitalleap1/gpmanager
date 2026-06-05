-- =============================================================================
-- Digital Leap GPOMS — PostgreSQL Schema (design reference)
-- =============================================================================
-- This file is the canonical *design* reference for the database. The live
-- schema is produced by Alembic migrations generated from the SQLAlchemy models
-- (backend/app/models/*). Keep this file in sync with the models as a
-- human-readable contract and onboarding aid.
--
-- Conventions
--   * UUID primary keys (gen_random_uuid()).
--   * TIMESTAMPTZ for all timestamps; created_at / updated_at on mutable rows.
--   * company_id is present on every tenant-scoped table from day one so the
--     Phase 3 SaaS conversion is a configuration change, not a migration.
--     Phase 1 seeds a single default company.
--   * ON DELETE: lookups RESTRICT, child rows CASCADE, soft references SET NULL.
--   * Status fields use native ENUM types (Phase 2 introduces configurable
--     workflow tables for custom statuses — see status_workflows).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email/domain

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
CREATE TYPE user_status        AS ENUM ('active', 'invited', 'suspended', 'deactivated');
CREATE TYPE role_scope         AS ENUM ('system', 'custom');
CREATE TYPE project_status     AS ENUM ('active', 'completed', 'hold', 'cancelled');
CREATE TYPE guest_post_status  AS ENUM ('prospect', 'contacted', 'negotiating', 'accepted',
                                        'invoice_sent', 'paid', 'published', 'rejected');
CREATE TYPE payment_status     AS ENUM ('pending', 'approved', 'paid', 'failed');
CREATE TYPE task_status        AS ENUM ('pending', 'in_progress', 'completed', 'overdue');
CREATE TYPE task_priority      AS ENUM ('low', 'medium', 'high');
CREATE TYPE notification_type  AS ENUM ('project_assigned', 'task_assigned', 'task_overdue',
                                        'payment_due', 'payment_completed', 'goal_achieved',
                                        'guest_post_published', 'mention', 'system');
CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'whatsapp');
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
CREATE TYPE plan_tier          AS ENUM ('starter', 'professional', 'agency');
CREATE TYPE outreach_direction AS ENUM ('outbound', 'inbound');

-- ============================================================================
-- 1. LOOKUP TABLES
-- ============================================================================

-- 1. countries
CREATE TABLE countries (
    id          SERIAL PRIMARY KEY,
    iso_code    CHAR(2) NOT NULL UNIQUE,          -- ISO 3166-1 alpha-2
    name        VARCHAR(100) NOT NULL,
    phone_code  VARCHAR(8)
);

-- 2. languages
CREATE TABLE languages (
    id          SERIAL PRIMARY KEY,
    iso_code    VARCHAR(8) NOT NULL UNIQUE,       -- ISO 639-1 (e.g. 'en', 'en-US')
    name        VARCHAR(100) NOT NULL
);

-- 3. niches  (shared by projects, websites, guest posts)
CREATE TABLE niches (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL UNIQUE,
    slug        VARCHAR(140) NOT NULL UNIQUE,
    parent_id   INTEGER REFERENCES niches(id) ON DELETE SET NULL
);

-- 4. tags  (free-form labels, company-scoped, attached polymorphically)
CREATE TABLE tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL,                    -- FK added after companies
    name        VARCHAR(80) NOT NULL,
    color       VARCHAR(9),                        -- #RRGGBB / #RRGGBBAA
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);

-- ============================================================================
-- 2. TENANCY & AUTH  (Module 1 + Phase 3)
-- ============================================================================

-- 5. companies  (the tenant boundary)
CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(160) NOT NULL,
    slug            VARCHAR(180) NOT NULL UNIQUE,
    logo_file_id    UUID,                          -- FK to files (added later)
    plan_tier       plan_tier NOT NULL DEFAULT 'starter',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    trial_ends_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tags ADD CONSTRAINT fk_tags_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- 6. roles  (system roles seeded per install; custom roles are company-scoped)
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = global system role
    name        VARCHAR(60) NOT NULL,              -- admin | team_lead | user | ...
    slug        VARCHAR(60) NOT NULL,
    scope       role_scope NOT NULL DEFAULT 'custom',
    description VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, slug)
);

-- 7. permissions  (global catalogue, e.g. 'project.create', 'payment.manage')
CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(80) NOT NULL UNIQUE,       -- '<module>.<action>'
    module      VARCHAR(40) NOT NULL,
    description VARCHAR(255)
);

-- 8. role_permissions  (M2M)
CREATE TABLE role_permissions (
    role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id  UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 9. users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email           CITEXT NOT NULL,
    hashed_password VARCHAR(255),                  -- NULL until invite accepted
    full_name       VARCHAR(160) NOT NULL,
    avatar_file_id  UUID,                          -- FK to files (added later)
    phone           VARCHAR(32),
    status          user_status NOT NULL DEFAULT 'invited',
    is_superuser    BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, email)
);

-- 10. user_roles  (M2M; Phase 1 assigns exactly one role per user)
CREATE TABLE user_roles (
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id  UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- 11. refresh_tokens  (rotation + revocation for JWT refresh flow)
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,      -- store hash, never the raw token
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    user_agent  VARCHAR(255),
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. password_reset_tokens  (forgot password)
CREATE TABLE password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. user_invitations
CREATE TABLE user_invitations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email        CITEXT NOT NULL,
    role_id      UUID REFERENCES roles(id) ON DELETE SET NULL,
    invited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    token_hash   VARCHAR(255) NOT NULL UNIQUE,
    accepted_at  TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. user_login_history  (security audit)
CREATE TABLE user_login_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address   INET,
    user_agent   VARCHAR(255),
    success      BOOLEAN NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. PROJECT MANAGEMENT  (Module 3) + GOALS (Module 4) + BUDGETS
-- ============================================================================

-- 15. projects
CREATE TABLE projects (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name              VARCHAR(180) NOT NULL,
    main_niche_id     INTEGER REFERENCES niches(id) ON DELETE SET NULL,
    project_niche_id  INTEGER REFERENCES niches(id) ON DELETE SET NULL,
    target_country_id INTEGER REFERENCES countries(id) ON DELETE SET NULL,
    assignee_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    team_lead_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    monthly_budget    NUMERIC(12, 2) NOT NULL DEFAULT 0,
    target_links      INTEGER NOT NULL DEFAULT 0,
    goal              TEXT,
    due_date          DATE,
    status            project_status NOT NULL DEFAULT 'active',
    notes             TEXT,
    is_archived       BOOLEAN NOT NULL DEFAULT FALSE,
    created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_company       ON projects(company_id);
CREATE INDEX idx_projects_status        ON projects(company_id, status);
CREATE INDEX idx_projects_team_lead     ON projects(team_lead_id);

-- 16. project_members  (team members beyond assignee/lead)
CREATE TABLE project_members (
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_label  VARCHAR(60),                       -- free-form within-project label
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

-- 17. project_monthly_goals  (Module 4 — Jan..Dec link targets per project)
CREATE TABLE project_monthly_goals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    goal_target     INTEGER NOT NULL DEFAULT 0,    -- planned links
    achieved        INTEGER NOT NULL DEFAULT 0,    -- denormalised; bumped on publish
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, year, month)
);
-- remaining = goal_target - achieved (computed in app / view)

-- 18. project_monthly_budgets  (monthly budget allocation, parallels goals)
CREATE TABLE project_monthly_budgets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    budget_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0,
    spent_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- denormalised; bumped on payment
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, year, month)
);

-- ============================================================================
-- 4. WEBSITE DATABASE  (Module 6)
-- ============================================================================

-- 19. websites
CREATE TABLE websites (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id             UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    domain                 CITEXT NOT NULL,
    name                   VARCHAR(180),
    main_niche_id          INTEGER REFERENCES niches(id) ON DELETE SET NULL,
    country_id             INTEGER REFERENCES countries(id) ON DELETE SET NULL,
    language_id            INTEGER REFERENCES languages(id) ON DELETE SET NULL,
    traffic                BIGINT,
    da                     SMALLINT,               -- Domain Authority 0–100
    dr                     SMALLINT,               -- Domain Rating 0–100
    spam_score             SMALLINT,               -- 0–100
    price                  NUMERIC(12, 2),
    email                  CITEXT,
    contact_person         VARCHAR(160),
    guest_post_available   BOOLEAN NOT NULL DEFAULT TRUE,
    link_insertion_available BOOLEAN NOT NULL DEFAULT FALSE,
    homepage_url           VARCHAR(500),
    notes                  TEXT,
    created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, domain)
);
CREATE INDEX idx_websites_company   ON websites(company_id);
CREATE INDEX idx_websites_niche     ON websites(main_niche_id);
CREATE INDEX idx_websites_metrics   ON websites(company_id, dr, da, traffic);

-- 20. website_contacts  (a site may have several contacts)
CREATE TABLE website_contacts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id  UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    name        VARCHAR(160),
    email       CITEXT,
    role        VARCHAR(80),
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 21. website_niches  (M2M — sites may cover multiple niches)
CREATE TABLE website_niches (
    website_id  UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    niche_id    INTEGER NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
    PRIMARY KEY (website_id, niche_id)
);

-- 22. website_metrics_history  (DR/DA/traffic over time)
CREATE TABLE website_metrics_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id   UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    captured_on  DATE NOT NULL,
    da           SMALLINT,
    dr           SMALLINT,
    traffic      BIGINT,
    spam_score   SMALLINT,
    UNIQUE (website_id, captured_on)
);

-- ============================================================================
-- 5. GUEST POST TRACKER  (Module 5)
-- ============================================================================

-- 23. guest_posts
CREATE TABLE guest_posts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    website_id        UUID REFERENCES websites(id) ON DELETE SET NULL,
    website_name      VARCHAR(180),               -- snapshot if not in website DB
    da                SMALLINT,
    dr                SMALLINT,
    traffic           BIGINT,
    price             NUMERIC(12, 2),
    contact_email     CITEXT,
    assigned_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    status            guest_post_status NOT NULL DEFAULT 'prospect',
    outreach_date     DATE,
    live_link_date    DATE,
    live_link         VARCHAR(700),
    anchor_text       VARCHAR(255),
    notes             TEXT,
    created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_guest_posts_project ON guest_posts(project_id);
CREATE INDEX idx_guest_posts_status  ON guest_posts(company_id, status);
CREATE INDEX idx_guest_posts_website ON guest_posts(website_id);

-- 24. guest_post_status_history  (workflow transitions)
CREATE TABLE guest_post_status_history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_post_id UUID NOT NULL REFERENCES guest_posts(id) ON DELETE CASCADE,
    from_status   guest_post_status,
    to_status     guest_post_status NOT NULL,
    changed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    note          VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 25. outreach_messages  (email outreach log per guest post / website)
CREATE TABLE outreach_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    guest_post_id UUID REFERENCES guest_posts(id) ON DELETE CASCADE,
    website_id    UUID REFERENCES websites(id) ON DELETE SET NULL,
    direction     outreach_direction NOT NULL DEFAULT 'outbound',
    subject       VARCHAR(255),
    body          TEXT,
    sent_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    sent_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. PAYMENT MANAGEMENT  (Module 7)
-- ============================================================================

-- 26. payments  (vendor / guest-post payouts)
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
    website_id      UUID REFERENCES websites(id) ON DELETE SET NULL,
    guest_post_id   UUID REFERENCES guest_posts(id) ON DELETE SET NULL,
    live_link       VARCHAR(700),
    amount_usd      NUMERIC(12, 2),
    amount_inr      NUMERIC(14, 2),
    invoice_file_id UUID,                          -- FK to files (added later)
    invoice_link    VARCHAR(700),
    payment_date    DATE,
    transaction_id  VARCHAR(120),
    remarks         TEXT,
    status          payment_status NOT NULL DEFAULT 'pending',
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_company ON payments(company_id);
CREATE INDEX idx_payments_status  ON payments(company_id, status);
CREATE INDEX idx_payments_project ON payments(project_id);

-- 27. payment_status_history
CREATE TABLE payment_status_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id  UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    from_status payment_status,
    to_status   payment_status NOT NULL,
    changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    note        VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 28. exchange_rates  (USD↔INR auto-conversion source)
CREATE TABLE exchange_rates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency CHAR(3) NOT NULL,                -- 'USD'
    quote_currency CHAR(3) NOT NULL,               -- 'INR'
    rate          NUMERIC(14, 6) NOT NULL,
    rate_date     DATE NOT NULL,
    UNIQUE (base_currency, quote_currency, rate_date)
);

-- ============================================================================
-- 7. TASK MANAGEMENT  (Module 8) + Phase 2 Kanban
-- ============================================================================

-- 29. tasks
CREATE TABLE tasks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
    board_id      UUID,                            -- FK to task_boards (Phase 2)
    name          VARCHAR(200) NOT NULL,
    description   TEXT,
    assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,
    priority      task_priority NOT NULL DEFAULT 'medium',
    status        task_status NOT NULL DEFAULT 'pending',
    due_date      DATE,
    completed_at  TIMESTAMPTZ,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_assignee ON tasks(assigned_to, status);
CREATE INDEX idx_tasks_due      ON tasks(company_id, due_date);

-- 30. task_comments
CREATE TABLE task_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 31. task_checklist_items
CREATE TABLE task_checklist_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label       VARCHAR(255) NOT NULL,
    is_done     BOOLEAN NOT NULL DEFAULT FALSE,
    position    INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- 8. NOTIFICATIONS  (Module 9)
-- ============================================================================

-- 32. notifications
CREATE TABLE notifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          notification_type NOT NULL,
    title         VARCHAR(200) NOT NULL,
    body          TEXT,
    entity_type   VARCHAR(40),                     -- 'project' | 'task' | 'payment' ...
    entity_id     UUID,
    is_read       BOOLEAN NOT NULL DEFAULT FALSE,
    read_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- 33. notification_preferences  (per user / type / channel)
CREATE TABLE notification_preferences (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        notification_type NOT NULL,
    channel     notification_channel NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (user_id, type, channel)
);

-- ============================================================================
-- 9. REPORTS  (Module 10)
-- ============================================================================

-- 34. saved_reports  (saved filter/config for a report type)
CREATE TABLE saved_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    name        VARCHAR(160) NOT NULL,
    report_type VARCHAR(40) NOT NULL,              -- project|team|financial|guest_post
    filters     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 35. report_exports  (generated export jobs / files)
CREATE TABLE report_exports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    requested_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    report_type     VARCHAR(40) NOT NULL,
    format          VARCHAR(10) NOT NULL,          -- excel|csv|pdf
    filters         JSONB NOT NULL DEFAULT '{}',
    file_id         UUID,                          -- FK to files (added later)
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|ready|failed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. ACTIVITY, FILES, TAGGING, SYSTEM
-- ============================================================================

-- 36. activity_logs  (Module 11 — audit trail)
CREATE TABLE activity_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(80) NOT NULL,              -- 'project.updated', 'payment.paid'
    module      VARCHAR(40) NOT NULL,
    entity_type VARCHAR(40),
    entity_id   UUID,
    old_value   JSONB,
    new_value   JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_company_time ON activity_logs(company_id, created_at DESC);
CREATE INDEX idx_activity_entity       ON activity_logs(entity_type, entity_id);

-- 37. files  (uploaded assets: invoices, avatars, report exports, logos)
CREATE TABLE files (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    storage_key   VARCHAR(500) NOT NULL,           -- local path or S3 key
    original_name VARCHAR(255),
    content_type  VARCHAR(120),
    size_bytes    BIGINT,
    uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wire up deferred file FKs
ALTER TABLE companies     ADD CONSTRAINT fk_companies_logo     FOREIGN KEY (logo_file_id)    REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE users         ADD CONSTRAINT fk_users_avatar       FOREIGN KEY (avatar_file_id)  REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE payments      ADD CONSTRAINT fk_payments_invoice   FOREIGN KEY (invoice_file_id) REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE report_exports ADD CONSTRAINT fk_report_exports_file FOREIGN KEY (file_id)       REFERENCES files(id) ON DELETE SET NULL;

-- 38. taggables  (polymorphic tag attachments)
CREATE TABLE taggables (
    tag_id        UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    entity_type   VARCHAR(40) NOT NULL,            -- 'website' | 'project' | 'guest_post'
    entity_id     UUID NOT NULL,
    PRIMARY KEY (tag_id, entity_type, entity_id)
);
CREATE INDEX idx_taggables_entity ON taggables(entity_type, entity_id);

-- 39. system_settings  (global + per-company key/value config)
CREATE TABLE system_settings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = global
    key         VARCHAR(120) NOT NULL,
    value       JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, key)
);

-- ============================================================================
-- 11. PHASE 2 — KANBAN & CONFIGURABLE WORKFLOWS
-- ============================================================================

-- 40. task_boards
CREATE TABLE task_boards (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
    name        VARCHAR(160) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_board FOREIGN KEY (board_id) REFERENCES task_boards(id) ON DELETE SET NULL;

-- 41. task_board_columns
CREATE TABLE task_board_columns (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id    UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
    name        VARCHAR(80) NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    wip_limit   INTEGER
);

-- 42. status_workflows  (configurable status sets, Phase 2 — Custom Status Workflow)
CREATE TABLE status_workflows (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    applies_to  VARCHAR(40) NOT NULL,              -- 'guest_post' | 'task' | 'payment'
    name        VARCHAR(120) NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 43. workflow_statuses
CREATE TABLE workflow_statuses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id   UUID NOT NULL REFERENCES status_workflows(id) ON DELETE CASCADE,
    code          VARCHAR(60) NOT NULL,
    label         VARCHAR(80) NOT NULL,
    color         VARCHAR(9),
    position      INTEGER NOT NULL DEFAULT 0,
    is_terminal   BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (workflow_id, code)
);

-- ============================================================================
-- 12. PHASE 3 — SAAS BILLING & SUBSCRIPTIONS
-- ============================================================================

-- 44. subscription_plans
CREATE TABLE subscription_plans (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier              plan_tier NOT NULL UNIQUE,
    name              VARCHAR(80) NOT NULL,
    price_monthly_usd NUMERIC(10, 2) NOT NULL,
    price_yearly_usd  NUMERIC(10, 2),
    max_users         INTEGER,                     -- NULL = unlimited
    max_projects      INTEGER,
    stripe_price_id   VARCHAR(120),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE
);

-- 45. plan_features  (feature flags per plan)
CREATE TABLE plan_features (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    feature_key VARCHAR(80) NOT NULL,
    value       JSONB NOT NULL DEFAULT 'true',
    UNIQUE (plan_id, feature_key)
);

-- 46. company_subscriptions
CREATE TABLE company_subscriptions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id             UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_id                UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status                 subscription_status NOT NULL DEFAULT 'trialing',
    stripe_customer_id     VARCHAR(120),
    stripe_subscription_id VARCHAR(120),
    current_period_start   TIMESTAMPTZ,
    current_period_end     TIMESTAMPTZ,
    cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 47. company_invoices  (SaaS billing invoices, distinct from vendor payments)
CREATE TABLE company_invoices (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    stripe_invoice_id  VARCHAR(120),
    amount_usd         NUMERIC(10, 2) NOT NULL,
    status             VARCHAR(20) NOT NULL,        -- draft|open|paid|void|uncollectible
    issued_at          TIMESTAMPTZ,
    paid_at            TIMESTAMPTZ,
    hosted_invoice_url VARCHAR(500),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 48. payment_methods  (Stripe payment methods on file)
CREATE TABLE payment_methods (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    stripe_payment_method_id VARCHAR(120) NOT NULL,
    brand                   VARCHAR(40),
    last4                   CHAR(4),
    exp_month               SMALLINT,
    exp_year                SMALLINT,
    is_default              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 49. subscription_events  (Stripe webhook audit)
CREATE TABLE subscription_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
    stripe_event_id VARCHAR(120) UNIQUE,
    event_type      VARCHAR(80) NOT NULL,
    payload         JSONB NOT NULL,
    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 50. company_settings  (per-tenant config: branding, locale, feature toggles)
CREATE TABLE company_settings (
    company_id        UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    default_currency  CHAR(3) NOT NULL DEFAULT 'USD',
    timezone          VARCHAR(60) NOT NULL DEFAULT 'UTC',
    date_format       VARCHAR(20) NOT NULL DEFAULT 'YYYY-MM-DD',
    brand_color       VARCHAR(9),
    settings          JSONB NOT NULL DEFAULT '{}',
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- END OF SCHEMA — 50 tables.
-- See docs/database/data-dictionary.md for column-level descriptions and
-- docs/database/er-diagram.md for the visual model.
-- =============================================================================
