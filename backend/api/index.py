"""Vercel Python serverless entrypoint.

Vercel's Python runtime auto-detects this file (because it lives in the project's
`api/` directory) and serves the module-level ``app`` — the FastAPI ASGI
application. The catch-all rewrite in ``vercel.json`` routes every request here,
so the FastAPI router (mounted under ``/api``) handles paths exactly as it does
locally, e.g. GET /api/health and POST /api/auth/login.

Database migrations are NOT run here (serverless functions have no startup step) —
they are applied once against Neon before/after deploy.
"""

from app.main import app  # noqa: F401  (ASGI app served by Vercel)
