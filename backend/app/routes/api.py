"""Aggregate API router. Each feature module registers its router here under the
``/api`` prefix configured in ``main.py``.
"""

from fastapi import APIRouter

from app.routes.audit import router as audit_router
from app.routes.auth import router as auth_router
from app.routes.clients import router as clients_router
from app.routes.dashboard import router as dashboard_router
from app.routes.guest_posts import router as guest_posts_router
from app.routes.imports import router as imports_router
from app.routes.integrations import router as integrations_router
from app.routes.lookups import router as lookups_router
from app.routes.notifications import router as notifications_router
from app.routes.payments import router as payments_router
from app.routes.projects import router as projects_router
from app.routes.reports import router as reports_router
from app.routes.roles import router as roles_router
from app.routes.tasks import router as tasks_router
from app.routes.teams import router as teams_router
from app.routes.trash import router as trash_router
from app.routes.users import router as users_router
from app.routes.websites import router as websites_router

api_router = APIRouter()


@api_router.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Readiness/health check used by Docker and uptime monitors."""
    return {"status": "ok"}


@api_router.get("/_diag", tags=["meta"])
def _diag() -> dict:
    """TEMP deploy diagnostic: is DATABASE_URL/SECRET_KEY set, and can we reach
    the DB? (No secrets are returned — only the host and the error text.)"""
    import os

    from sqlalchemy import text

    from app.core.config import settings
    from app.database.session import engine

    uri = settings.database_uri
    host = uri.split("@")[-1].split("?")[0] if "@" in uri else "localhost (DEFAULT — env not set)"
    out: dict = {
        "database_url_env_set": bool(os.environ.get("DATABASE_URL")),
        "secret_key_env_set": bool(os.environ.get("SECRET_KEY")),
        "db_target": host,
    }
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
        out["db_connect"] = "OK"
    except Exception as exc:  # noqa: BLE001
        out["db_connect"] = "FAILED"
        out["error"] = repr(exc)[:600]
    return out


# --- Feature module routers (mounted as each module is built) ---
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(clients_router, prefix="/clients", tags=["clients"])
api_router.include_router(projects_router, prefix="/projects", tags=["projects"])
api_router.include_router(lookups_router, prefix="/lookups", tags=["lookups"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(teams_router, prefix="/teams", tags=["teams"])
api_router.include_router(roles_router, prefix="/roles", tags=["roles"])
api_router.include_router(guest_posts_router, prefix="/guest-posts", tags=["guest-posts"])
api_router.include_router(websites_router, prefix="/websites", tags=["websites"])
api_router.include_router(payments_router, prefix="/payments", tags=["payments"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["tasks"])
api_router.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
api_router.include_router(reports_router, prefix="/reports", tags=["reports"])
api_router.include_router(audit_router, prefix="/audit-logs", tags=["audit"])
api_router.include_router(trash_router, prefix="/trash", tags=["trash"])
api_router.include_router(integrations_router, prefix="/integrations", tags=["integrations"])
api_router.include_router(imports_router, prefix="/imports", tags=["imports"])
# from app.routes.guest_posts import router as guest_posts_router
# from app.routes.websites import router as websites_router
# from app.routes.payments import router as payments_router
# from app.routes.tasks import router as tasks_router
# from app.routes.notifications import router as notifications_router
# from app.routes.reports import router as reports_router
# from app.routes.activity_logs import router as activity_logs_router
#
# api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
# api_router.include_router(projects_router, prefix="/projects", tags=["projects"])
# ... etc.
