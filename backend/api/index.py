"""TEMP Vercel diagnostic — a plain Python handler (no FastAPI/ASGI).

Vercel's Python runtime serves a ``handler`` subclass of BaseHTTPRequestHandler
as a basic serverless function — this bypasses ASGI entirely, so it runs even if
Vercel can't serve the FastAPI app. It reports the Python version and whether
``from app.main import app`` succeeds (with the traceback if not), so we can see
the real cause at /api/health instead of an opaque 500.

Reverted to the real ASGI entry once the cause is fixed.
"""

import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        result: dict = {"stage": "diagnostic", "python": sys.version}
        try:
            from app.main import app  # noqa: F401

            result["import_app"] = "OK"
            result["route_count"] = len(getattr(app, "routes", []))
        except Exception as exc:  # noqa: BLE001
            result["import_app"] = "FAILED"
            result["error"] = repr(exc)
            result["traceback"] = traceback.format_exc().splitlines()[-30:]
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())
