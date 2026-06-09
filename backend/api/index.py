"""Vercel Python serverless entrypoint.

Vercel's Python runtime detects the module-level ``app`` (an ASGI application)
and serves it. The catch-all rewrite in ``vercel.json`` routes every incoming
request here, so the FastAPI router (mounted under ``/api``) handles paths
exactly as it does locally — e.g. GET /api/health, POST /api/auth/login.

NOTE: serverless functions have no startup command, so database migrations are
NOT run here. Run them once against your Neon database before/after deploying:
    cd backend
    $env:DATABASE_URL="<your neon url>"   # PowerShell
    .\.venv\Scripts\alembic.exe upgrade head
    .\.venv\Scripts\python.exe -m scripts.seed
"""

from app.main import app  # noqa: F401  (ASGI app served by Vercel)
