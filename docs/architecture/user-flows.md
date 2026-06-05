# Digital Leap GPOMS — User Flows

This document describes the key user flows for **Digital Leap GPOMS** (Guest Post Operations Management System), a role-based application built on a **FastAPI** backend and a **Next.js** frontend. It is intended as a planning deliverable: each flow captures the happy path plus the most important alternate/error branches, and is illustrated with a [Mermaid](https://mermaid.js.org/) diagram so engineers, QA, and stakeholders share one canonical mental model.

GPOMS coordinates the end-to-end guest-posting pipeline — from prospect discovery and outreach through negotiation, payment, and live-link verification — across three roles. The flows below show how each role interacts with the system, how authentication and authorization gate every request, and how state transitions (outreach statuses, task statuses, payment statuses) propagate side effects such as notifications, budget updates, and project-goal increments.

## Roles & Permissions Summary

| Permission / Capability        | Admin | Team Lead | User |
| ------------------------------ | :---: | :-------: | :--: |
| Manage users (invite/disable)  |   ✅  |     ❌    |  ❌  |
| Assign team leads              |   ✅  |     ❌    |  ❌  |
| Configure system settings      |   ✅  |     ❌    |  ❌  |
| Create projects                |   ✅  |     ✅    |  ❌  |
| Assign projects / tasks        |   ✅  |     ✅    |  ❌  |
| Review team progress           |   ✅  |     ✅    |  ❌  |
| View assigned projects         |   ✅  |     ✅    |  ✅  |
| Add guest posts (prospects)    |   ✅  |     ✅    |  ✅  |
| Update outreach status         |   ✅  |     ✅    |  ✅  |
| Upload live links / publish    |   ✅  |     ✅    |  ✅  |
| Create payment requests        |   ✅  |     ✅    |  ✅  |
| Approve payments               |   ✅  |     ✅    |  ❌  |
| Manage budgets / payments      |   ✅  |  Review   |  ❌  |
| View reports                   |   ✅  |  Scoped   |  ❌  |
| Export data (Excel/CSV/PDF)    |   ✅  |  Scoped   |  ❌  |

Legend: ✅ full access · ❌ no access · **Review** = read + approve within assigned scope · **Scoped** = limited to own teams/projects.

## Table of Contents

1. [Authentication Flow](#1-authentication-flow)
2. [Role-Based Authorization](#2-role-based-authorization)
3. [Admin — Onboard a New Team Member](#3-admin--onboard-a-new-team-member)
4. [Admin / Team Lead — Create & Assign a Project](#4-admin--team-lead--create--assign-a-project)
5. [User — Full Guest-Post Lifecycle](#5-user--full-guest-post-lifecycle)
6. [Team Lead — Payment Approval](#6-team-lead--payment-approval)
7. [Daily Task Lifecycle](#7-daily-task-lifecycle)
8. [Reporting & Export](#8-reporting--export)

---

## 1. Authentication Flow

Users authenticate with email and password. On success the API issues a short-lived **JWT access token** and a longer-lived **refresh token**. The access token authorizes protected requests; when it expires, the frontend performs a **silent refresh** using the refresh token. Logout revokes the refresh token server-side. A separate **forgot-password** branch lets users reset credentials via a time-limited email link.

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Next.js Frontend
    participant API as FastAPI Backend
    participant DB as Database

    U->>FE: Enter email + password
    FE->>API: POST /auth/login
    API->>DB: Verify credentials
    alt Invalid credentials
        API-->>FE: 401 Unauthorized
        FE-->>U: Show login error
    else Valid credentials
        API->>DB: Persist refresh token (session)
        API-->>FE: 200 + access (JWT) + refresh token
        FE-->>U: Redirect to role dashboard

        Note over FE,API: Access protected routes
        FE->>API: GET /resource (Authorization: Bearer access)
        API-->>FE: 200 OK

        Note over FE,API: Access token expires
        FE->>API: GET /resource (expired token)
        API-->>FE: 401 token_expired
        FE->>API: POST /auth/refresh (refresh token)
        alt Refresh valid
            API-->>FE: 200 + new access token
            FE->>API: Retry original request
            API-->>FE: 200 OK
        else Refresh revoked/expired
            API-->>FE: 401 Unauthorized
            FE-->>U: Force re-login
        end

        Note over FE,API: Logout
        U->>FE: Click logout
        FE->>API: POST /auth/logout
        API->>DB: Revoke refresh token
        API-->>FE: 204 No Content
        FE-->>U: Clear session, redirect to login
    end
```

### Forgot Password → Reset

```mermaid
flowchart TD
    A([User clicks 'Forgot password']) --> B[Enter account email]
    B --> C[POST /auth/forgot-password]
    C --> D{Email registered?}
    D -- No --> E[Return generic success<br/>no account enumeration]
    D -- Yes --> F[Generate time-limited reset token]
    F --> G[Send reset email with link]
    G --> H([User opens reset link])
    H --> I{Token valid & unexpired?}
    I -- No --> J[Show 'link expired'<br/>offer to resend]
    I -- Yes --> K[Enter new password + confirm]
    K --> L[POST /auth/reset-password]
    L --> M[Hash & store password<br/>invalidate reset token]
    M --> N[Revoke existing sessions]
    N --> O([Redirect to login])
```

---

## 2. Role-Based Authorization

Every protected request passes through an authorization dependency. The backend verifies the JWT signature and expiry, loads the user's roles and permissions, and either allows the request or returns **403 Forbidden**. After login, each role lands on a different default dashboard with a scoped permission set.

```mermaid
flowchart TD
    A([Incoming request]) --> B{Valid JWT?}
    B -- No --> C[401 Unauthorized]
    B -- Yes --> D[Load user roles & permissions]
    D --> E{Has required permission<br/>for this route?}
    E -- No --> F[403 Forbidden]
    E -- Yes --> G[Process request]

    G --> H{Role?}
    H -- Admin --> I[Admin Dashboard<br/>users · projects · payments<br/>settings · reports · exports]
    H -- Team Lead --> J[Team Lead Dashboard<br/>team projects · task assignment<br/>progress · payment review]
    H -- User --> K[User Dashboard<br/>assigned projects · guest posts<br/>tasks · live links]
```

---

## 3. Admin — Onboard a New Team Member

An Admin invites a new member by entering their email and selecting a role. The system creates a pending user record and emails an invitation containing a time-limited acceptance link. The invitee sets a password, after which the account becomes **active** and appears in the user list.

```mermaid
flowchart TD
    A([Admin opens 'Invite User']) --> B[Enter email + select role]
    B --> C[POST /users/invite]
    C --> D{Email already exists?}
    D -- Yes --> E[Show 'user already exists' error]
    D -- No --> F[Create user<br/>status = invited]
    F --> G[Generate invitation token]
    G --> H[Send invitation email]
    H --> I([Invitee clicks accept link])
    I --> J{Token valid & unexpired?}
    J -- No --> K[Show 'invitation expired'<br/>Admin can resend]
    J -- Yes --> L[Invitee sets password]
    L --> M[POST /users/accept-invite]
    M --> N[Hash password<br/>status = active]
    N --> O[User appears as Active<br/>in Admin user list]
    O --> P([Invitee can now log in])
```

---

## 4. Admin / Team Lead — Create & Assign a Project

Admins and Team Leads create projects, then assign an **assignee** (the executing User) and a responsible **Team Lead**. On assignment the system notifies the assignee so work can begin immediately.

```mermaid
flowchart TD
    A([Admin / Team Lead opens 'New Project']) --> B[Fill project form<br/>name · client · goal · budget · deadline]
    B --> C{Form valid?}
    C -- No --> D[Show validation errors]
    C -- Yes --> E[POST /projects]
    E --> F[Create project<br/>status = active]
    F --> G[Assign assignee + team lead]
    G --> H[PATCH /projects/:id/assign]
    H --> I[Persist assignments]
    I --> J[Create notification for assignee]
    J --> K[Send in-app + email notification]
    K --> L([Assignee sees project<br/>in 'My Projects'])
```

---

## 5. User — Full Guest-Post Lifecycle

A User opens an assigned project and adds guest-post prospects. Each prospect advances through outreach statuses — **contacted → negotiating → accepted** — then to **invoice_sent**. After payment is recorded, the User uploads the **live link** and marks the post **published**, which auto-increments the project's goal-completion counter.

```mermaid
flowchart TD
    A([User opens assigned project]) --> B[Add guest post / prospect]
    B --> C[status = prospect]
    C --> D[Contact site owner]
    D --> E[status = contacted]
    E --> F{Owner responds?}
    F -- No / Declined --> G[status = rejected<br/>close prospect]
    F -- Yes --> H[status = negotiating]
    H --> I{Terms agreed?}
    I -- No --> G
    I -- Yes --> J[status = accepted]
    J --> K[Send invoice]
    K --> L[status = invoice_sent]
    L --> M{Payment recorded?<br/>see Flow 6}
    M -- Pending --> L
    M -- Paid --> N[Upload live link]
    N --> O{Link reachable & valid?}
    O -- No --> P[Flag for re-check<br/>notify User]
    O -- Yes --> Q[status = published]
    Q --> R[Auto-increment<br/>project goal counter]
    R --> S{Goal reached?}
    S -- No --> A
    S -- Yes --> T[Mark project complete<br/>notify Team Lead]
```

---

## 6. Team Lead — Payment Approval

A User creates a payment request, which starts as **pending**. A Team Lead or Admin reviews it; on approval it moves to **approved**, and once disbursed it is marked **paid**. Marking paid updates the project budget and triggers notifications to the requester and finance stakeholders.

```mermaid
flowchart TD
    A([User creates payment request]) --> B[POST /payments<br/>status = pending]
    B --> C[Notify Team Lead / Admin]
    C --> D([Team Lead reviews request])
    D --> E{Approve?}
    E -- Reject --> F[status = rejected<br/>notify User with reason]
    E -- Approve --> G[status = approved]
    G --> H[Disburse payment]
    H --> I[status = paid]
    I --> J[Deduct amount from project budget]
    J --> K{Budget threshold breached?}
    K -- Yes --> L[Alert Admin<br/>over/near-budget]
    K -- No --> M[Update budget remaining]
    L --> N[Notify requester: paid]
    M --> N
    N --> O([Linked guest post can proceed<br/>to live-link upload])
```

---

## 7. Daily Task Lifecycle

Tasks are assigned to Users (typically by a Team Lead). A task moves from **assigned → in_progress → completed**. If the due date passes before completion, the task enters an **overdue** state that surfaces on dashboards and triggers reminders until it is resolved.

```mermaid
flowchart TD
    A([Task created & assigned]) --> B[status = assigned]
    B --> C{User starts task?}
    C -- Yes --> D[status = in_progress]
    C -- Not yet --> E{Due date passed?}
    D --> F{Work finished?}
    F -- Yes --> G[status = completed]
    F -- No --> H{Due date passed?}
    H -- No --> D
    H -- Yes --> I[status = overdue]
    E -- No --> B
    E -- Yes --> I
    I --> J[Flag on dashboards<br/>send reminder to User + Team Lead]
    J --> K{Resolved?}
    K -- Yes --> G
    K -- No --> J
    G --> L([Update progress metrics])
```

---

## 8. Reporting & Export

Admins (and Team Leads within their scope) generate reports by selecting a report type, applying filters, and choosing a date range. The system compiles the data set and exports it in the requested format — **Excel, CSV, or PDF**.

```mermaid
flowchart TD
    A([Open Reports]) --> B[Select report type<br/>projects · outreach · payments · team performance]
    B --> C[Apply filters<br/>project · assignee · status]
    C --> D[Choose date range]
    D --> E[POST /reports/generate]
    E --> F{Authorized for<br/>requested scope?}
    F -- No --> G[403 Forbidden]
    F -- Yes --> H[Query & aggregate data]
    H --> I{Records found?}
    I -- No --> J[Show 'no data for filters']
    I -- Yes --> K[Render report preview]
    K --> L{Export format?}
    L -- Excel --> M[Generate .xlsx]
    L -- CSV --> N[Generate .csv]
    L -- PDF --> O[Generate .pdf]
    M --> P([Download file])
    N --> P
    O --> P
```
