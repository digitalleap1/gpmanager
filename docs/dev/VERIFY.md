# Per-Step Verification Checklist

A "check after every step" guide. Each step lists the **menu option** (from
`.\dev.ps1`), the **command** it runs, and **what you should see** if it worked.

> Quick start: from `c:\Users\Admin\projects\guestpost-saas` run `.\dev.ps1`
> and pick numbers. (bash/make users: `make help`.)

Legend: ✅ = expected success signal · 🔁 = run this after every code change.

---

## A. One-time environment setup

| # | Menu | Command | ✅ Verify |
|---|------|---------|-----------|
| A1 | **1** | copy `.env.example` → `.env` (×3) | Prints `created .env`, `created backend\.env`, `created frontend\.env`. |
| A2 | **2** | `docker compose up -d db pgadmin` | `docker ps` shows `gpoms_db` (healthy) + `gpoms_pgadmin`. |
| A3 | **4** | create venv + `pip install` | Ends with `deps installed`, no red errors. |
| A4 | **11** | `npm install` (frontend) | `node_modules/` appears, no peer-dep errors that abort. |

---

## B. Backend — Module 1 (Auth & Roles)

Run these in order the first time, then use 🔁 ones after each change.

| # | Menu | Command | ✅ Verify |
|---|------|---------|-----------|
| B1 | **5** | `alembic upgrade head` | Logs `Running upgrade -> 0001 ...`. In pgAdmin you now see tables: `companies, roles, permissions, role_permissions, users, user_roles, refresh_tokens, password_reset_tokens, alembic_version`. |
| B2 | **6** | `python -m scripts.seed` | Prints created company, 3 roles (`admin/team_lead/user`), permissions, and the admin email. Safe to re-run (idempotent). |
| B3 | **8** 🔁 | `pytest -q` | All tests pass (security/JWT + health). |
| B4 | **9** 🔁 | `ruff check app` | `All checks passed!` |
| B5 | **7** | `uvicorn --reload` | Starts on `:8000`; console shows `Application startup complete`. |
| B6 | **16** | health check | `/` → `{"status":"running"...}`, `/api/health` → `{"status":"ok"}`. |
| B7 | — | open `http://localhost:8000/docs` | The **auth** endpoints are listed (login, refresh, logout, me, change/forgot/reset password). |

### B8. Smoke-test the auth API (paste into a terminal while the API runs)

```powershell
# Log in as the seeded admin (see backend\.env FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD)
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/auth/login `
  -ContentType application/json `
  -Body (@{ email = "admin@digitalleap.local"; password = "ChangeMe123!" } | ConvertTo-Json)
$login.user            # ✅ shows your user + roles: ["admin"]
$access = $login.access_token

# Call a protected route with the bearer token
Invoke-RestMethod -Uri http://localhost:8000/api/auth/me `
  -Headers @{ Authorization = "Bearer $access" }   # ✅ returns the same user
```

✅ A request to `/api/auth/me` **without** a token returns `401`.

---

## C. Frontend — Module 1

| # | Menu | Command | ✅ Verify |
|---|------|---------|-----------|
| C1 | **12** | `npm run dev` | Starts on `:3000`, compiles with no type errors. |
| C2 | **13** 🔁 | `npm run lint` | No lint errors. |
| C3 | — | open `http://localhost:3000/login` | Login form renders. |
| C4 | — | log in with the seeded admin | Redirects to `/dashboard`, greets you by name, shows role badge. |
| C5 | — | open `/profile` | Shows your details; profile + change-password forms work. |
| C6 | — | click **Logout** | Tokens cleared; visiting `/dashboard` redirects to `/login`. |

---

## D. After every change (the 🔁 loop)

1. **18** Git status — see exactly which files changed.
2. **19** Git diff — review the actual changes.
3. Backend changed? → **8** tests + **9** lint.
4. Frontend changed? → **13** lint (and watch the `npm run dev` console).
5. Models changed? → **10** new migration (autogenerate) → **5** apply it → check pgAdmin.
6. **16** Health check to confirm both servers still respond.

---

## E. Full-stack via Docker (alternative to running natively)

| # | Menu | Command | ✅ Verify |
|---|------|---------|-----------|
| E1 | **14** | `docker compose up --build` | `gpoms_db / pgadmin / backend / frontend` all start. |
| E2 | — | run migrations in the container | `docker compose exec backend alembic upgrade head` |
| E3 | — | seed in the container | `docker compose exec backend python -m scripts.seed` |
| E4 | **16** | health check | API `:8000` + web `:3000` respond. |

---

## F. Step 2 — Projects & Dashboard (Modules 2, 3, 4, 11)

After pulling Step 2, re-run the migration + seed, then check the new UI.

| # | Menu | Command | ✅ Verify |
|---|------|---------|-----------|
| F1 | **5** | `alembic upgrade head` | Applies `0002`; pgAdmin shows new tables: `countries, languages, niches, projects, project_members, project_monthly_goals, project_monthly_budgets, activity_logs`. |
| F2 | **6** | `python -m scripts.seed` | Now also adds ~20 countries + ~20 niches (idempotent). |
| F3 | **8** 🔁 | `pytest -q` | Still green (the mapper test now covers the new models too). |
| F4 | **7** + **12** | run API + web | — |
| F5 | — | open `/dashboard` | Stat cards render (counts may be 0 at first); two bar charts; recent-activity list. |
| F6 | — | `/projects` → **New Project** | Create a project (niche/country/assignee selects are populated from the seed + your users). It appears in the table. |
| F7 | — | open the project | Overview + editable monthly **goals** grid + **budgets** grid + members. Edit a goal target / budget — it persists (refresh to confirm). |
| F8 | — | back to `/dashboard` | "Monthly Budget Usage" reflects the budget you set for the current month; Recent Activity shows your create/edit actions (activity logging is live). |
| F9 | — | filters | Search by name, filter by status, toggle "include archived", archive a project and confirm it leaves the default list. |

### F10. Quick API check (with the API running + a bearer token)

```powershell
$h = @{ Authorization = "Bearer $access" }   # $access from the B8 login snippet
Invoke-RestMethod -Uri "http://localhost:8000/api/lookups/niches" -Headers $h | Select-Object -First 3
Invoke-RestMethod -Uri "http://localhost:8000/api/dashboard/summary" -Headers $h
Invoke-RestMethod -Uri "http://localhost:8000/api/projects?page=1&page_size=5" -Headers $h
```

---

## Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Web app | http://localhost:3000 | seeded admin (see `backend\.env`) |
| API + docs | http://localhost:8000/docs | bearer token from `/auth/login` |
| pgAdmin | http://localhost:5050 | `.env` `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` |
| Postgres | localhost:5432 | `.env` `POSTGRES_USER` / `POSTGRES_PASSWORD` |
