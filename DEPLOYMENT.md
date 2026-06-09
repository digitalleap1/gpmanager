# Going Live — GPOMS (Neon + Render + Vercel)

The app is split for hosting: **frontend → Vercel**, **backend (FastAPI) → Render**,
**database (Postgres) → Neon**. FastAPI cannot run on Vercel — that was the cause of
the earlier Vercel error. The repo already contains everything needed
(`render.yaml`, `backend/Dockerfile`, `frontend/vercel.json`). Follow these steps
once; afterwards every `git push` to `main` auto-redeploys both.

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

## Notes / troubleshooting

- **Login fails / network error in the browser** → `NEXT_PUBLIC_API_URL` is wrong
  or `BACKEND_CORS_ORIGINS` doesn't match the Vercel origin exactly.
- **Backend won't start** → check the Render logs; almost always a bad
  `DATABASE_URL`. Any `postgresql://` / `postgres://` URL is accepted (auto-converted).
- **First request is slow** → Render free cold start; upgrade the plan to keep it warm.
- **Security** → if you previously pasted a Neon password into a chat, rotate it in
  the Neon dashboard before going live. Never commit `.env` files.
