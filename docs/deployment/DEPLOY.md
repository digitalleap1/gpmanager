# Deployment Guide

GPOMS is a two-app monorepo. The production topology:

```text
Browser ──► Vercel (Next.js frontend) ──HTTPS──► Render (FastAPI API) ──► Neon (Postgres)
```

| Piece | Service | Cost |
|-------|---------|------|
| Frontend | **Vercel** (root dir = `frontend`) | free hobby |
| Backend API | **Render** (Docker web service, `render.yaml`) | free |
| Database | **Neon** (managed Postgres) | free |
| CI | **GitHub Actions** (`.github/workflows/ci.yml`) | free |

CI runs on every push/PR (backend lint + real-Postgres migrations + tests; frontend lint + build). Render and Vercel each auto-deploy on push to `main` once connected.

---

## 0. Before you deploy — security checklist

- [ ] **Change `SECRET_KEY`** — Render generates one automatically (`generateValue: true`). Never reuse the dev default.
- [ ] **Change `FIRST_ADMIN_PASSWORD`** from `ChangeMe123!` to a strong value (set it in Render env vars before first deploy/seed).
- [ ] Confirm `BACKEND_CORS_ORIGINS` is set to your real frontend URL (no trailing slash).
- [ ] The repo is **public** — never commit real `.env` files or secrets (the `.gitignore` already blocks them).

---

## 1. Database — Neon

1. Create a project at [neon.tech](https://neon.tech) → you get a connection string.
2. Convert it to the SQLAlchemy/psycopg form used by this app:
   ```
   postgresql+psycopg://USER:PASSWORD@HOST/DBNAME?sslmode=require
   ```
   (Neon gives `postgresql://...` — just change the scheme prefix to `postgresql+psycopg://` and keep `?sslmode=require`. Prefer the **pooled** host for serverless.)
3. Keep this string for the backend `DATABASE_URL`.

---

## 2. Backend API — Render

### Option A — Blueprint (recommended)
1. Render Dashboard → **New → Blueprint** → select this GitHub repo. Render reads [`render.yaml`](../../render.yaml) and creates the `gpoms-api` Docker web service.
2. After the first apply, open the service → **Environment** and fill the `sync: false` vars:
   - `DATABASE_URL` → your Neon string (step 1).
   - `BACKEND_CORS_ORIGINS` → your Vercel URL (set after step 3, e.g. `https://gpmanager.vercel.app`).
   - `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_PASSWORD` → your admin login.
   - `SECRET_KEY` is auto-generated; `APP_ENV=production` is preset.
3. Deploy. Migrations run automatically via `preDeployCommand: alembic upgrade head`. (If your plan doesn't support preDeploy, open the service **Shell** and run `alembic upgrade head` once.)
4. **Seed once** (creates roles + admin): service **Shell** → `python -m scripts.seed`.
5. Health check: `https://gpoms-api.onrender.com/api/health` → `{"status":"ok"}`; docs at `/docs`.

### Option B — manual
New → **Web Service** → this repo → Runtime **Docker**, Root/Context `backend`, Dockerfile `backend/Dockerfile`, Health check `/api/health`, then add the same env vars. The container binds to `$PORT` automatically.

> Note: Render free instances sleep when idle; the first request after sleep is slow. Fine for demos.

---

## 3. Frontend — Vercel

1. Vercel → **Add New → Project** → import this repo.
2. **Root Directory = `frontend`** (important — it's a monorepo). Framework auto-detects **Next.js**.
3. Environment Variables → add:
   - `NEXT_PUBLIC_API_URL = https://gpoms-api.onrender.com/api` (your Render URL + `/api`).
4. Deploy. You get a URL like `https://gpmanager.vercel.app`.
5. Go back to Render and set `BACKEND_CORS_ORIGINS` to that exact URL, then redeploy the API (or trigger via a push).

---

## 4. Verify the live deployment

1. Open the Vercel URL → `/login`.
2. Sign in with `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD`.
3. You should land on `/dashboard`; create a project; confirm it persists (data is in Neon).
4. Browser devtools → Network: API calls go to the Render URL and return 200 (no CORS errors).

---

## 5. Continuous deployment

- **Push to `main`** → GitHub Actions CI runs; Render rebuilds the API; Vercel rebuilds the frontend. No extra config.
- Migrations apply on each Render deploy (`preDeployCommand`). New migrations land just by pushing the `alembic/versions/*` file.
- Protect `main` with a branch rule requiring the CI checks if you want green-before-merge.

---

## 6. Custom domain (optional)
- Vercel: Project → Domains → add `app.yourdomain.com`.
- Render: Service → Settings → Custom Domains → add `api.yourdomain.com`; update `NEXT_PUBLIC_API_URL` and `BACKEND_CORS_ORIGINS` accordingly.

---

## Environment variable reference

| Var | Where | Example |
|-----|-------|---------|
| `DATABASE_URL` | Render | `postgresql+psycopg://u:p@host/db?sslmode=require` |
| `SECRET_KEY` | Render | (auto-generated) |
| `APP_ENV` | Render | `production` |
| `BACKEND_CORS_ORIGINS` | Render | `https://gpmanager.vercel.app` |
| `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` | Render | your admin login |
| `NEXT_PUBLIC_API_URL` | Vercel | `https://gpoms-api.onrender.com/api` |
