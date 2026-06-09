"""Vercel Python serverless entrypoint (with deploy self-diagnostics).

Vercel's Python runtime auto-detects this file (it lives in the project's `api/`
directory) and serves the module-level ``app`` — the FastAPI ASGI application.
The catch-all rewrite in ``vercel.json`` routes every request here.

If importing the real app fails on Vercel (a different runtime than local), we
fall back to a tiny app that RETURNS the traceback as JSON, so the cause is
visible at any URL instead of an opaque FUNCTION_INVOCATION_FAILED 500.
"""

import sys
import traceback

try:
    from app.main import app  # noqa: F401  (ASGI app served by Vercel)
except Exception as exc:  # pragma: no cover - production import diagnostics
    _tb = traceback.format_exc()
    from fastapi import FastAPI

    app = FastAPI()

    @app.get("/{full_path:path}")
    def _import_error(full_path: str) -> dict:
        return {
            "ok": False,
            "stage": "import",
            "python": sys.version,
            "exception": repr(exc),
            "traceback": _tb.splitlines()[-30:],
        }
