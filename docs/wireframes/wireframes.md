# Digital Leap GPOMS — Wireframes

Low-fidelity wireframes for the **Guest Post Operations Management System (GPOMS)** — a FastAPI + Next.js + Tailwind + ShadCN web app that replaces spreadsheets for managing guest-posting and link-building operations. These are intentionally rough box-drawing sketches that communicate layout, key UI elements, and primary actions per screen — not pixel-perfect designs. Authenticated screens share a common **app shell** (persistent left sidebar + top bar), shown once below; each subsequent section renders only that screen's main content area.

> **Responsive behavior:** On desktop (≥1024px) the left sidebar is pinned. On tablet/mobile (<1024px) it collapses into a slide-out drawer toggled by a hamburger (☰) in the top bar; tables become horizontally scrollable or stack into cards, stat-card grids reflow to 1–2 columns, and multi-column forms collapse to a single column.

---

## Table of Contents

- [App Shell (sidebar + top bar)](#app-shell)
- [1. Login](#1-login-login)
- [2. Profile](#2-profile-profile)
- [3. Dashboard](#3-dashboard-dashboard)
- [4. Projects](#4-projects-projects)
- [5. Project Detail](#5-project-detail-projectsid)
- [6. Project Create / Edit](#6-project-create--edit)
- [7. Guest Post Tracker](#7-guest-post-tracker-guest-posts)
- [8. Guest Post Create / Edit](#8-guest-post-create--edit)
- [9. Website Database](#9-website-database-websites)
- [10. Website Create / Edit](#10-website-create--edit)
- [11. Payments](#11-payments-payments)
- [12. Tasks](#12-tasks-tasks)
- [13. Reports](#13-reports-reports)
- [14. Notifications](#14-notifications-notifications)
- [15. Activity Logs](#15-activity-logs-activity)

---

## App Shell

The shell wraps every authenticated screen. The sidebar holds the logo + primary nav; the top bar holds global search, the notifications bell, and the user menu. All later wireframes show only the `MAIN CONTENT` region.

```text
+-------------------+------------------------------------------------------------+
| [LOGO] GPOMS      | [Search projects, websites, posts...     ]  (🔔 3)  (👤 ▾) |
+-------------------+------------------------------------------------------------+
| ▸ Dashboard       |                                                            |
| ▸ Projects        |                                                            |
| ▸ Guest Posts     |                                                            |
| ▸ Websites        |                     MAIN CONTENT AREA                      |
| ▸ Payments        |              (per-screen content renders here)             |
| ▸ Tasks           |                                                            |
| ▸ Reports         |                                                            |
| ▸ Notifications   |                                                            |
| ▸ Activity        |                                                            |
| ▸ Settings        |                                                            |
|                   |                                                            |
| [☰ collapse]      |                                                            |
+-------------------+------------------------------------------------------------+
```

- **Key elements:** logo, 10-item vertical nav with active-state highlight, global search, notifications bell with unread badge, user menu (Profile, Settings, Logout).
- **Primary actions:** navigate modules, search globally, open notifications, open user menu. Mobile: ☰ toggles sidebar drawer.

---

## 1. Login (`/login`)

Standalone, unauthenticated screen — no app shell. Centered card on a branded background.

```text
+--------------------------------------------------------------+
|                                                              |
|                       [ LOGO ] GPOMS                         |
|                                                              |
|            +--------------------------------------+          |
|            |          Sign in to GPOMS            |          |
|            |                                      |          |
|            |  Email                               |          |
|            |  [ you@company.com              ]    |          |
|            |                                      |          |
|            |  Password                            |          |
|            |  [ ••••••••••••              (👁) ]   |          |
|            |                                      |          |
|            |  [ ] Remember me     Forgot password?|          |
|            |                                      |          |
|            |  [        Sign in        ]           |          |
|            +--------------------------------------+          |
|                                                              |
+--------------------------------------------------------------+
```

- **Key elements:** logo, email field, password field with show/hide toggle, "Remember me" checkbox, "Forgot password?" link, inline validation/error banner area.
- **Primary actions:** Sign in (submit), Forgot password (→ reset flow).

---

## 2. Profile (`/profile`)

Rendered inside the app shell. Two stacked cards: profile details and change password.

```text
+--------------------------------------------------------------+
| My Profile                                                   |
+--------------------------------------------------------------+
| +-------------------+  Full name   [ Jane Doe            ]    |
| |   ( avatar )      |  Email       [ jane@company.com    ]    |
| |   [Change photo]  |  Role        [ Team Lead    ▾ ]  (RO)   |
| +-------------------+  Phone       [ +91 ...            ]     |
|                       Timezone    [ Asia/Kolkata   ▾ ]       |
|                                          [ Save changes ]    |
+--------------------------------------------------------------+
| Change Password                                              |
|   Current  [ •••••••• ]                                      |
|   New      [ •••••••• ]   Confirm [ •••••••• ]               |
|                                       [ Update password ]    |
+--------------------------------------------------------------+
```

- **Key elements:** avatar + change-photo, editable profile fields (name, email, phone, timezone), read-only role, change-password sub-form.
- **Primary actions:** Save changes, Change photo, Update password.

---

## 3. Dashboard (`/dashboard`)

KPI stat cards, three charts, and a recent-activity feed.

```text
+--------------------------------------------------------------+
| Dashboard                                  [ Date range ▾ ]  |
+--------------------------------------------------------------+
| [Total Projects ] [ Active     ] [ Completed   ] [Live Links]|
| [      24       ] [    11       ] [    13       ] [   312    ]|
| [Pending Pays $ ] [Monthly Budget Use %] [ Team Productivity ]|
| [   $4,250      ] [      68%          ] [       82%         ] |
+--------------------------------------------------------------+
| +----------------------+ +----------------------+ +---------+ |
| | Monthly Links (bar)  | | Budget Usage (line)  | | Team    | |
| |  ▁▃▅▇▆▅▇  ▁▃▅       | |  /\_/\__/\___        | | Perf.   | |
| |                      | |                      | | (radar) | |
| +----------------------+ +----------------------+ +---------+ |
+--------------------------------------------------------------+
| Recent Activity                                              |
|  • Jane published link on techblog.com        2h ago         |
|  • Payment approved — Project Acme ($250)     5h ago         |
|  • New website added: example.io              1d ago         |
|                                          [ View all → ]      |
+--------------------------------------------------------------+
```

- **Key elements:** 7 stat cards (Total/Active/Completed Projects, Total Live Links, Pending Payments, Monthly Budget Usage, Team Productivity), 3 charts (Monthly Links, Budget Usage, Team Performance), Recent Activity feed.
- **Primary actions:** change date range, click a card/chart to drill into a module, "View all" → Activity Logs.

---

## 4. Projects (`/projects`)

Searchable, filterable list with a "New Project" CTA.

```text
+--------------------------------------------------------------+
| Projects                                   [ + New Project ] |
+--------------------------------------------------------------+
| [ Search... ] [Status ▾][Niche ▾][Country ▾][Team Lead ▾]    |
+--------------------------------------------------------------+
| Name      |Niche |Country|Assignee|Lead |Budget|Links|Due  |St|
|-----------|------|-------|--------|-----|------|-----|-----|--|
| Acme SaaS |Tech  | US    | Ravi   |Jane |$2000 |12/20|07-15|●A|
| GreenCo   |Eco   | UK    | Mira   |Omar |$1500 | 8/15|07-30|●A|
| FinPro    |Fin   | IN    | Sam    |Jane |$3000 |20/25|08-10|○C|
| ...                                                          |
+--------------------------------------------------------------+
|                       ◀  Page 1 of 4  ▶   [ Rows: 25 ▾ ]     |
+--------------------------------------------------------------+
```

- **Key elements:** search box, filters (status, niche, country, team lead), data table (name, niche, country, assignee, team lead, budget, target links as achieved/target, due date, status pill), pagination + page-size.
- **Primary actions:** New Project, search/filter, sort columns, click row → Project Detail.

---

## 5. Project Detail (`/projects/:id`)

Overview header, 12-month goals grid, budget usage, related guest posts, and activity.

```text
+--------------------------------------------------------------+
| ◀ Projects / Acme SaaS              [ Edit ] [ + Guest Post ] |
| Niche: Tech  Country: US  Lead: Jane  Assignee: Ravi  ●Active |
+--------------------------------------------------------------+
| Budget: $2,000  Used: $1,360 (68%) [█████████░░░]  Links 12/20|
+--------------------------------------------------------------+
| Monthly Goals          | Jan Feb Mar Apr ... Nov Dec          |
|   Goal                 |  2   2   3   2  ...  2   2           |
|   Achieved             |  2   1   3   2  ...  1   0           |
|   Remaining            |  0   1   0   0  ...  1   2           |
+--------------------------------------------------------------+
| Related Guest Posts                                          |
|  techblog.com   DR58  $250  ●Published   Ravi               |
|  newsite.io     DR42  $180  ○Negotiating Mira               |
|                                          [ View all → ]      |
+--------------------------------------------------------------+
| Activity:  • Goal updated (Mar)  • Link published  ...        |
+--------------------------------------------------------------+
```

- **Key elements:** breadcrumb + status, overview meta, budget usage bar, Jan–Dec goal/achieved/remaining grid, related guest posts list, project activity feed.
- **Primary actions:** Edit project, add Guest Post, view all related posts, drill into a post.

---

## 6. Project Create / Edit

Modal (or full page on mobile). All project fields, two-column layout.

```text
+----------------------- New / Edit Project -------------------+ (x)
|  Name          [ ............................. ]            |
|  Main niche    [ Technology      ▾ ]  Project niche [ SaaS ]|
|  Target country[ United States   ▾ ]                       |
|  Assignee      [ Ravi            ▾ ]  Team lead [ Jane  ▾ ] |
|  Monthly budget[ $ ........ ]   Target links [ ...... ]    |
|  Goal          [ ............................. ]           |
|  Due date      [ 2026-07-15  📅 ]   Status [ Active   ▾ ]  |
|  Notes         [ ........................................ ]|
|                [ ........................................ ]|
+------------------------------------------------------------+
|                                   [ Cancel ]  [ Save ]     |
+------------------------------------------------------------+
```

- **Key elements:** name, main niche, project niche, target country, assignee, team lead, monthly budget, target links, goal, due date (date picker), status, notes (textarea).
- **Primary actions:** Save (create/update), Cancel/close.

---

## 7. Guest Post Tracker (`/guest-posts`)

Pipeline table, filterable/groupable by status across the outreach lifecycle.

```text
+--------------------------------------------------------------+
| Guest Posts                              [ + New Guest Post ] |
+--------------------------------------------------------------+
| [Search][Status ▾][Project ▾][Assignee ▾]   View:[Table][Board]|
| Pipeline: Prospect▸Contacted▸Negotiating▸Accepted▸Invoice▸    |
|           Paid▸Published  |  Rejected                         |
+--------------------------------------------------------------+
|Website    |DR |DA |Traffic|Price|Email      |Out. |Live |Link|U |St|
|-----------|---|---|-------|-----|-----------|-----|-----|----|--|--|
|techblog.com|58|55| 120k  |$250 |ed@tb.com  |06-01|06-20|🔗  |Rv|●Pub|
|newsite.io |42 |40|  35k  |$180 |hi@ns.io   |06-03|  —  | — |Mi|○Neg|
|adsite.net |31 |30|  10k  |$90  |po@ad.net  |05-28|  —  | — |Sa|✕Rej|
+--------------------------------------------------------------+
|                       ◀  Page 1 of 6  ▶                      |
+--------------------------------------------------------------+
```

- **Key elements:** search + filters (status, project, assignee), table/board toggle, status pipeline legend, columns: website, DR, DA, traffic, price, email, outreach date, live-link date, live link, assigned user, status.
- **Primary actions:** New Guest Post, filter/group by status, switch Table/Board view, open row → edit.

---

## 8. Guest Post Create / Edit

Modal capturing website, metrics, outreach, and status.

```text
+--------------------- New / Edit Guest Post ------------------+ (x)
|  Project   [ Acme SaaS      ▾ ]   Website [ techblog.com ▾ ] |
|  DR  [ 58 ]   DA [ 55 ]   Traffic [ 120000 ]                |
|  Price [ $ 250 ]          Contact email [ ed@tb.com      ]  |
|  Assigned user [ Ravi      ▾ ]                              |
|  Outreach date [ 2026-06-01 📅 ]  Live-link date [ ___ 📅 ] |
|  Live link URL [ https://techblog.com/post           ]     |
|  Status   [ Published ▾ ]   (Prospect → ... → Published)    |
|  Notes    [ ......................................... ]     |
+------------------------------------------------------------+
|                                   [ Cancel ]  [ Save ]     |
+------------------------------------------------------------+
```

- **Key elements:** project + website pickers, DR/DA/traffic, price, contact email, assigned user, outreach & live-link dates, live link URL, status select, notes.
- **Primary actions:** Save (create/update), Cancel.

---

## 9. Website Database (`/websites`)

Filterable inventory with CSV bulk import/export.

```text
+--------------------------------------------------------------+
| Websites                 [ Import CSV ][ Export CSV ][ + Add ]|
+--------------------------------------------------------------+
| [Search] [Country ▾][Niche ▾][DR range][Traffic ▾][Price ▾]  |
+--------------------------------------------------------------+
|Domain      |Name     |Niche|Ctry|DA|DR|Spam|Price|GuestPost? |
|------------|---------|-----|----|--|--|----|-----|-----------|
|techblog.com|Tech Blog|Tech | US |55|58| 2% |$250 |   ✔ Yes   |
|greenfeed.uk|GreenFeed|Eco  | UK |40|42| 4% |$180 |   ✔ Yes   |
|adsite.net  |Ad Site  |News | IN |30|31|14% |$90  |   ✕ No    |
|...                                                           |
+--------------------------------------------------------------+
|                ◀ Page 1 of 12 ▶   Selected: 0  [ Bulk ▾ ]    |
+--------------------------------------------------------------+
```

- **Key elements:** Import/Export CSV + Add buttons, search + filters (country, niche, DR range, traffic, price), columns: domain, name, niche, country, DA, DR, spam score, price, guest-post-available; row checkboxes for bulk ops.
- **Primary actions:** Import CSV, Export CSV, Add website, filter, bulk actions, click row → edit.

---

## 10. Website Create / Edit

Modal for a single website record.

```text
+--------------------- New / Edit Website ---------------------+ (x)
|  Domain   [ techblog.com           ]  Name [ Tech Blog    ] |
|  Niche    [ Technology   ▾ ]   Country [ United States ▾ ]  |
|  DA  [ 55 ]   DR [ 58 ]   Spam score [ 2 % ]               |
|  Estimated traffic [ 120000 ]    Price [ $ 250 ]           |
|  Guest post available  ( ) Yes   ( ) No                    |
|  Contact email [ ed@techblog.com                     ]     |
|  Notes   [ ......................................... ]      |
+------------------------------------------------------------+
|                                   [ Cancel ]  [ Save ]     |
+------------------------------------------------------------+
```

- **Key elements:** domain, name, niche, country, DA, DR, spam score, estimated traffic, price, guest-post-available toggle, contact email, notes.
- **Primary actions:** Save (create/update), Cancel.

---

## 11. Payments (`/payments`)

Financial ledger with status filter and dual currency.

```text
+--------------------------------------------------------------+
| Payments                                  [ Export ][ + Add ] |
+--------------------------------------------------------------+
| [Search] [Status ▾: Pending|Approved|Paid|Failed] [Project ▾]|
+--------------------------------------------------------------+
|Project  |Website     |USD  |INR    |Invoice|Pay Date|Txn ID |St|
|---------|------------|-----|-------|-------|--------|-------|--|
|Acme SaaS|techblog.com|$250 |₹20,800|INV-101|06-20   |TX9921 |●Pd|
|GreenCo  |greenfeed.uk|$180 |₹14,976|INV-102|  —     |  —    |○Pn|
|FinPro   |adsite.net  |$90  |₹7,488 |INV-103|  —     |  —    |✕Fl|
+--------------------------------------------------------------+
|  Totals:  Paid $250 | Pending $180 | Failed $90              |
|                       ◀  Page 1 of 3  ▶                      |
+--------------------------------------------------------------+
```

- **Key elements:** status filter (pending/approved/paid/failed), columns: project, website, amount USD, amount INR, invoice, payment date, transaction id, status; totals row.
- **Primary actions:** Add payment, Export, filter by status/project, update status (approve/mark paid), open invoice.

---

## 12. Tasks (`/tasks`)

List view with a Kanban toggle hint.

```text
+--------------------------------------------------------------+
| Tasks                          View:[ List ][ Board ]  [ + Task ]|
+--------------------------------------------------------------+
| [Search] [Assignee ▾][Priority ▾][Status ▾]                 |
+--------------------------------------------------------------+
|Task               |Assigned to|Priority|Due date |Status     |
|-------------------|-----------|--------|---------|-----------|
|Email outreach: TB |Ravi       | ▲ High |06-08    |● In Prog. |
|Verify live link   |Mira       | ● Med  |06-09    |○ To Do    |
|Send invoice INV-102|Sam       | ▼ Low  |06-10    |○ To Do    |
|Publish post GreenCo|Omar      | ▲ High |06-07    |✔ Done     |
+--------------------------------------------------------------+
| Board hint:  [ To Do ] → [ In Progress ] → [ Review ] → [Done]|
+--------------------------------------------------------------+
```

- **Key elements:** List/Board toggle, filters (assignee, priority, status), columns: task, assigned to, priority, due date, status; Kanban column hint at bottom.
- **Primary actions:** New Task, switch List/Board, filter, change status (drag on board), open task.

---

## 13. Reports (`/reports`)

Report-type selector with date range, filters, and export options.

```text
+--------------------------------------------------------------+
| Reports                                                      |
+--------------------------------------------------------------+
| Report type: (•) Project ( ) Team ( ) Financial ( ) GuestPost|
+--------------------------------------------------------------+
| Date range [ 2026-01-01 📅 ] → [ 2026-06-30 📅 ]            |
| Filters:  [Project ▾] [Team Lead ▾] [Status ▾] [Country ▾]  |
|                                       [ Generate report ]    |
+--------------------------------------------------------------+
| Preview                                                      |
|  +------------------------------------------------------+    |
|  | Summary cards + chart + result table render here     |    |
|  | (rows scoped to selected type, range & filters)      |    |
|  +------------------------------------------------------+    |
+--------------------------------------------------------------+
| Export:  [ Excel ]  [ CSV ]  [ PDF ]                         |
+--------------------------------------------------------------+
```

- **Key elements:** report-type radio (Project / Team / Financial / Guest Post), date-range pickers, contextual filters, preview region (summary + chart + table), export buttons.
- **Primary actions:** select type, set range/filters, Generate report, Export Excel / CSV / PDF.

---

## 14. Notifications (`/notifications`)

In-app notification center with read/unread state.

```text
+--------------------------------------------------------------+
| Notifications        [ All | Unread ]   [ Mark all read ]    |
+--------------------------------------------------------------+
| ● Payment INV-101 approved for Acme SaaS          2h ago  ⋮  |
| ● Live link verified: techblog.com                3h ago  ⋮  |
| ○ Task "Send invoice INV-102" due tomorrow        5h ago  ⋮  |
| ○ Mira commented on GreenCo guest post            1d ago  ⋮  |
| ○ Monthly budget for FinPro reached 90%           2d ago  ⋮  |
+--------------------------------------------------------------+
|  (● = unread, bold)   (○ = read)        [ Load more ]        |
+--------------------------------------------------------------+
```

- **Key elements:** All/Unread tabs, list rows with unread dot, message, timestamp, per-row menu (⋮); "Mark all read".
- **Primary actions:** filter All/Unread, click row → deep-link to source, mark single/all read, load more.

---

## 15. Activity Logs (`/activity`)

Audit trail with old→new value diffs.

```text
+--------------------------------------------------------------+
| Activity Logs                                  [ Export CSV ] |
+--------------------------------------------------------------+
| [Search] [User ▾][Module ▾][Action ▾][ Date range 📅 ]      |
+--------------------------------------------------------------+
|User |Action |Module    |Date / time      |Old → New          |
|-----|-------|----------|-----------------|-------------------|
|Jane |Update |Project   |06-05 14:22      |Status: Active→Done|
|Ravi |Create |GuestPost |06-05 11:08      | — → techblog.com  |
|Sam  |Update |Payment   |06-04 16:40      |Pending → Paid     |
|Mira |Delete |Website   |06-04 09:15      |adsite.net → —     |
+--------------------------------------------------------------+
|                       ◀  Page 1 of 20  ▶                     |
+--------------------------------------------------------------+
```

- **Key elements:** filters (user, module, action, date range) + search, audit table columns: user, action, module, date/time, old→new value; export.
- **Primary actions:** filter/search the audit trail, Export CSV, expand a row for full diff.
