"""Vercel Python serverless entrypoint.

Vercel auto-detects this file (it's in the project's `api/` directory) and serves
the module-level ``app`` — the FastAPI ASGI application. The catch-all rewrite in
``vercel.json`` routes every request here, so the FastAPI router (mounted under
``/api``) handles paths exactly as it does locally.

IMPORTANT: Vercel installs a Python function's dependencies from a requirements
file ADJACENT to the entrypoint — see ``api/requirements.txt`` next to this file.
(The repo-root ``requirements.txt`` is only used for framework detection, not for
installing into the function bundle.)
"""

from app.main import app  # noqa: F401  (ASGI app served by Vercel)
