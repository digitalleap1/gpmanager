"""Aggregate API router. Each feature module registers its router here under the
``/api`` prefix configured in ``main.py``.
"""

from fastapi import APIRouter

from app.routes.auth import router as auth_router
from app.routes.dashboard import router as dashboard_router
from app.routes.guest_posts import router as guest_posts_router
from app.routes.lookups import router as lookups_router
from app.routes.notifications import router as notifications_router
from app.routes.payments import router as payments_router
from app.routes.projects import router as projects_router
from app.routes.reports import router as reports_router
from app.routes.tasks import router as tasks_router
from app.routes.users import router as users_router
from app.routes.websites import router as websites_router

api_router = APIRouter()


@api_router.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Readiness/health check used by Docker and uptime monitors."""
    return {"status": "ok"}


# --- Feature module routers (mounted as each module is built) ---
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(projects_router, prefix="/projects", tags=["projects"])
api_router.include_router(lookups_router, prefix="/lookups", tags=["lookups"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(guest_posts_router, prefix="/guest-posts", tags=["guest-posts"])
api_router.include_router(websites_router, prefix="/websites", tags=["websites"])
api_router.include_router(payments_router, prefix="/payments", tags=["payments"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["tasks"])
api_router.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
api_router.include_router(reports_router, prefix="/reports", tags=["reports"])
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
