# Going Live — GPOMS

The app has three parts: a **Next.js frontend**, a **FastAPI backend**, and a
**Postgres database**. Pick one hosting option:

- **Option A — Render** (backend) + Neon (db) + Vercel (frontend). Backend is
  *always-on*, runs migrations automatically, and handles long jobs / big imports.
  Recommended for real use.
- **Option B — All on Vercel** (backend *and* frontend as Vercel projects) + Neon
  (db). No Render, no extra accounts — just **Vercel + Neon + GitHub**. The backend
  runs as Python serverless functions (see caveats at the end).

Both options use the configs already in the repo. After the one-time setup, every
`git push` to `main` auto-redeploys.

---

## Option A — Render + Neon + Vercel (always-on)

The split: **frontend → Vercel**, **backend (FastAPI) → Render**, **db → Neon**.
The repo already contains `render.yaml`, `backend/Dockerfile`, `frontend/vercel.json`.

---

## 1) Database — Neon (free, persistent)

1. Go to <https://neon.tech> → sign in → **New Project** → name it `gpoms`.
2. Open **Connection Details** → copy the **Pooled** connection string. It looks like:
   `postgresql://USER:PASSWORD@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require`
3. Keep it handy for step 2. (No editing needed — the backend auto-rewrites the
   scheme to the `psycopg` driver, and `sslmode=require` is supported.)

---

## 2) Backend — Render (free)

1. Go to <https://render.com> → **New** → **Blueprint** → connect the GitHub repo
   **`digitalleap1/gpmanager`**. Render reads `render.yaml` and proposes the
   `gpoms-api` web service. Click **Apply**.
2. Open the `gpoms-api` service → **Environment** and set the four `sync: false`
   variables:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon string from step 1 |
   | `BACKEND_CORS_ORIGINS` | your Vercel URL, e.g. `https://gpmanager.vercel.app` (set/adjust after step 3) |
   | `FIRST_ADMIN_EMAIL` | your admin email |
   | `FIRST_ADMIN_PASSWORD` | a strong password |
   (`SECRET_KEY` is generated automatically.)
3. Deploy. On startup the container **runs migrations and seeds the admin +
   roles/permissions automatically** — no shell needed. Wait until the service is
   **Live** and the health check at `/api/health` is green.
4. Copy the backend URL, e.g. `https://gpoms-api.onrender.com`.

> Render's free tier sleeps after ~15 min idle; the first request after a cold
> start takes ~30–50 s, then it's fast.

---

## 3) Frontend — Vercel

1. Go to <https://vercel.com> → **Add New** → **Project** → import
   **`digitalleap1/gpmanager`**.
2. **Set Root Directory = `frontend`** ← critical; this is what fixes the earlier
   error (don't deploy the repo root).
3. **Environment Variables** → add:
   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://gpoms-api.onrender.com/api` (your Render URL + `/api`) |
4. **Deploy.** Copy your Vercel URL, e.g. `https://gpmanager.vercel.app`.

---

## 4) Connect CORS, then log in

1. Back in Render → `gpoms-api` → Environment → set `BACKEND_CORS_ORIGINS` to your
   exact Vercel URL (no trailing slash) → save (it redeploys). For multiple URLs,
   comma-separate them.
2. Open `https://YOUR-APP.vercel.app/login` and sign in with the
   `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` you set on Render.

Done — you're live. Future `git push origin main` redeploys both Render and Vercel.

---

## Option B — All on Vercel + Neon (no Render)

Host the **backend on Vercel too** (Python serverless functions), so you only use
**Vercel + Neon + GitHub**. The repo already has `backend/api/index.py` +
`backend/vercel.json` for this.

### B1) Database — Neon
Same as Option A step 1 — create the project, copy the **Pooled** connection string.

### B2) One-time: create the schema + admin in Neon (run locally)
Serverless has no startup command, so run migrations once against Neon from your
machine (PowerShell, from the repo):
```powershell
cd backend
$env:DATABASE_URL = "postgresql://USER:PASS@HOST/neondb?sslmode=require"   # your Neon Pooled URL
$env:FIRST_ADMIN_EMAIL = "you@yourco.com"
$env:FIRST_ADMIN_PASSWORD = "a-strong-password"
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m scripts.seed
```
This creates every table + your admin login in Neon. (Re-run these two commands
after any future `git push` that adds a new migration.)

### B3) Backend → Vercel (project #1)
1. Vercel → **Add New → Project** → import `digitalleap1/gpmanager` →
   **Root Directory = `backend`**. Framework Preset: **Other**.
2. **Environment Variables:**
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Neon string |
   | `SECRET_KEY` | a long random string (e.g. from `openssl rand -hex 32`) |
   | `BACKEND_CORS_ORIGINS` | your frontend URL (set after B4) |
3. Deploy. Test `https://<backend>.vercel.app/api/health` → `{"status":"ok"}`.

### B4) Frontend → Vercel (project #2)
1. **Add New → Project** → same repo → **Root Directory = `frontend`**.
2. Env: `NEXT_PUBLIC_API_URL` = `https://<backend>.vercel.app/api`.
3. Deploy, then set `BACKEND_CORS_ORIGINS` on the backend project to this frontend
   URL and redeploy the backend. Log in at `/login`.

### Caveats of the all-Vercel (serverless) route
- **Function timeout 60s** — a very large Excel import could fail; import in smaller
  batches if so.
- **Cold starts** add ~1–3s after the backend has been idle.
- **No background jobs** — the overdue-task sweep must be triggered manually/externally.
- **Migrations are manual** (re-run B2 when you add migrations).

If you outgrow these, moving just the backend to a free always-on host
(**Railway** or **Fly.io**) is a drop-in upgrade — keep Neon + Vercel as-is.

---

## Notes / troubleshooting

- **Login fails / network error in the browser** → `NEXT_PUBLIC_API_URL` is wrong
  or `BACKEND_CORS_ORIGINS` doesn't match the Vercel origin exactly.
- **Backend won't start** → check the Render logs; almost always a bad
  `DATABASE_URL`. Any `postgresql://` / `postgres://` URL is accepted (auto-converted).
- **First request is slow** → Render free cold start; upgrade the plan to keep it warm.
- **Security** → if you previously pasted a Neon password into a chat, rotate it in
  the Neon dashboard before going live. Never commit `.env` files.
