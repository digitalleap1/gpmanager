# Entity-Relationship Diagram

Visual model for the GPOMS database. The authoritative DDL is
[schema.sql](schema.sql); column-level notes are in
[data-dictionary.md](data-dictionary.md).

Because a 50-table diagram is unreadable as one graph, the model is presented as a
**domain map** followed by **per-domain ER diagrams**. Every tenant-scoped table
carries `company_id → companies.id` (omitted from some diagrams for clarity).

---

## Domain map

```mermaid
flowchart TB
    subgraph Tenancy_Auth["Tenancy & Auth (Module 1 + SaaS)"]
        companies
        users
        roles
        permissions
    end
    subgraph Core["Operations Core"]
        projects
        guest_posts
        websites
        payments
        tasks
    end
    subgraph Tracking["Tracking & Goals"]
        project_monthly_goals
        project_monthly_budgets
        activity_logs
        notifications
    end
    subgraph Billing["SaaS Billing (Phase 3)"]
        subscription_plans
        company_subscriptions
    end

    companies --> users
    companies --> projects
    companies --> websites
    users --> roles
    projects --> guest_posts
    websites --> guest_posts
    projects --> payments
    guest_posts --> payments
    projects --> tasks
    projects --> project_monthly_goals
    projects --> project_monthly_budgets
    guest_posts --> activity_logs
    payments --> activity_logs
    companies --> company_subscriptions
    subscription_plans --> company_subscriptions
```

---

## 1. Tenancy & Authentication

```mermaid
erDiagram
    companies ||--o{ users : "employs"
    companies ||--o{ roles : "defines custom"
    companies ||--o{ user_invitations : "issues"
    roles ||--o{ role_permissions : ""
    permissions ||--o{ role_permissions : ""
    users ||--o{ user_roles : ""
    roles ||--o{ user_roles : ""
    users ||--o{ refresh_tokens : "owns"
    users ||--o{ password_reset_tokens : "requests"
    users ||--o{ user_login_history : "logs"

    companies {
        uuid id PK
        string name
        enum plan_tier
        timestamptz trial_ends_at
    }
    users {
        uuid id PK
        uuid company_id FK
        citext email
        string hashed_password
        enum status
        bool is_superuser
    }
    roles {
        uuid id PK
        uuid company_id FK "null = system"
        string slug
        enum scope
    }
    permissions {
        uuid id PK
        string code "module.action"
        string module
    }
    role_permissions {
        uuid role_id FK
        uuid permission_id FK
    }
    user_roles {
        uuid user_id FK
        uuid role_id FK
    }
    refresh_tokens {
        uuid id PK
        uuid user_id FK
        string token_hash
        timestamptz expires_at
        timestamptz revoked_at
    }
```

---

## 2. Projects, Goals & Budgets

```mermaid
erDiagram
    companies ||--o{ projects : "owns"
    projects ||--o{ project_members : ""
    users ||--o{ project_members : ""
    projects ||--o{ project_monthly_goals : "targets"
    projects ||--o{ project_monthly_budgets : "allocates"
    niches ||--o{ projects : "main/project niche"
    countries ||--o{ projects : "targets"
    users ||--o{ projects : "assignee / team_lead"

    projects {
        uuid id PK
        uuid company_id FK
        string name
        int main_niche_id FK
        int target_country_id FK
        uuid assignee_id FK
        uuid team_lead_id FK
        numeric monthly_budget
        int target_links
        date due_date
        enum status
    }
    project_monthly_goals {
        uuid id PK
        uuid project_id FK
        smallint year
        smallint month
        int goal_target
        int achieved
    }
    project_monthly_budgets {
        uuid id PK
        uuid project_id FK
        smallint year
        smallint month
        numeric budget_amount
        numeric spent_amount
    }
    project_members {
        uuid project_id FK
        uuid user_id FK
        string role_label
    }
```

---

## 3. Website Database

```mermaid
erDiagram
    companies ||--o{ websites : "owns"
    websites ||--o{ website_contacts : ""
    websites ||--o{ website_niches : ""
    niches ||--o{ website_niches : ""
    websites ||--o{ website_metrics_history : "tracks"
    niches ||--o{ websites : "main niche"
    countries ||--o{ websites : ""
    languages ||--o{ websites : ""

    websites {
        uuid id PK
        uuid company_id FK
        citext domain
        int main_niche_id FK
        smallint da
        smallint dr
        smallint spam_score
        numeric price
        bool guest_post_available
    }
    website_contacts {
        uuid id PK
        uuid website_id FK
        citext email
        bool is_primary
    }
    website_metrics_history {
        uuid id PK
        uuid website_id FK
        date captured_on
        smallint da
        smallint dr
        bigint traffic
    }
```

---

## 4. Guest Post Tracker

```mermaid
erDiagram
    projects ||--o{ guest_posts : "contains"
    websites ||--o{ guest_posts : "placed on"
    users ||--o{ guest_posts : "assigned"
    guest_posts ||--o{ guest_post_status_history : "transitions"
    guest_posts ||--o{ outreach_messages : "outreach"

    guest_posts {
        uuid id PK
        uuid company_id FK
        uuid project_id FK
        uuid website_id FK
        uuid assigned_user_id FK
        enum status
        numeric price
        date outreach_date
        date live_link_date
        string live_link
    }
    guest_post_status_history {
        uuid id PK
        uuid guest_post_id FK
        enum from_status
        enum to_status
        uuid changed_by FK
    }
    outreach_messages {
        uuid id PK
        uuid guest_post_id FK
        enum direction
        string subject
        timestamptz sent_at
    }
```

---

## 5. Payments

```mermaid
erDiagram
    companies ||--o{ payments : "owns"
    projects ||--o{ payments : ""
    websites ||--o{ payments : ""
    guest_posts ||--o{ payments : "pays for"
    payments ||--o{ payment_status_history : "transitions"

    payments {
        uuid id PK
        uuid company_id FK
        uuid project_id FK
        uuid guest_post_id FK
        numeric amount_usd
        numeric amount_inr
        string transaction_id
        enum status
        date payment_date
    }
    payment_status_history {
        uuid id PK
        uuid payment_id FK
        enum from_status
        enum to_status
        uuid changed_by FK
    }
    exchange_rates {
        uuid id PK
        char base_currency
        char quote_currency
        numeric rate
        date rate_date
    }
```

---

## 6. Tasks (+ Phase 2 Kanban)

```mermaid
erDiagram
    companies ||--o{ tasks : "owns"
    projects ||--o{ tasks : ""
    users ||--o{ tasks : "assigned_to"
    tasks ||--o{ task_comments : ""
    tasks ||--o{ task_checklist_items : ""
    task_boards ||--o{ tasks : "groups"
    task_boards ||--o{ task_board_columns : ""

    tasks {
        uuid id PK
        uuid company_id FK
        uuid project_id FK
        uuid board_id FK
        string name
        uuid assigned_to FK
        enum priority
        enum status
        date due_date
    }
    task_comments {
        uuid id PK
        uuid task_id FK
        uuid author_id FK
        text body
    }
    task_board_columns {
        uuid id PK
        uuid board_id FK
        string name
        int position
    }
```

---

## 7. Notifications, Reports, Activity & System

```mermaid
erDiagram
    users ||--o{ notifications : "receives"
    users ||--o{ notification_preferences : "configures"
    companies ||--o{ saved_reports : ""
    companies ||--o{ report_exports : ""
    companies ||--o{ activity_logs : "audits"
    companies ||--o{ files : "stores"
    tags ||--o{ taggables : ""
    companies ||--o{ system_settings : ""

    notifications {
        uuid id PK
        uuid user_id FK
        enum type
        string title
        string entity_type
        uuid entity_id
        bool is_read
    }
    activity_logs {
        uuid id PK
        uuid company_id FK
        uuid user_id FK
        string action
        string module
        jsonb old_value
        jsonb new_value
    }
    files {
        uuid id PK
        uuid company_id FK
        string storage_key
        string content_type
    }
    report_exports {
        uuid id PK
        uuid company_id FK
        string report_type
        string format
        uuid file_id FK
    }
```

---

## 8. SaaS Billing (Phase 3)

```mermaid
erDiagram
    subscription_plans ||--o{ plan_features : ""
    subscription_plans ||--o{ company_subscriptions : ""
    companies ||--o{ company_subscriptions : "subscribes"
    companies ||--o{ company_invoices : "billed"
    companies ||--o{ payment_methods : ""
    companies ||--o{ subscription_events : ""
    companies ||--|| company_settings : ""

    subscription_plans {
        uuid id PK
        enum tier
        numeric price_monthly_usd
        int max_users
        int max_projects
    }
    company_subscriptions {
        uuid id PK
        uuid company_id FK
        uuid plan_id FK
        enum status
        string stripe_subscription_id
        timestamptz current_period_end
    }
    company_invoices {
        uuid id PK
        uuid company_id FK
        string stripe_invoice_id
        numeric amount_usd
        string status
    }
    company_settings {
        uuid company_id PK
        char default_currency
        string timezone
    }
```
