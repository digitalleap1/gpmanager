"""Integration admin routes: inspect configuration and send a test message.

Admin-only. The ``/test`` endpoint sends directly through each channel (bypassing
the ``NOTIFICATIONS_ENABLED`` master switch) so an admin can verify SMTP / Slack
credentials before turning event notifications on.
"""

from fastapi import APIRouter

from app.core.exceptions import PermissionDenied
from app.core.permissions import is_admin
from app.routes.deps import CurrentUser
from app.services.integrations import IntegrationDispatcher

router = APIRouter()


def _require_admin(user: CurrentUser) -> None:
    if not is_admin(user):
        raise PermissionDenied("Only administrators can manage integrations")


@router.get("/status")
def integrations_status(user: CurrentUser) -> dict[str, object]:
    _require_admin(user)
    return IntegrationDispatcher.status()


@router.post("/test")
def integrations_test(user: CurrentUser) -> dict[str, object]:
    _require_admin(user)
    dispatcher = IntegrationDispatcher()
    subject = "Digital Leap GPOMS — test notification"
    body = (
        f"This is a test notification triggered by {user.full_name} ({user.email}).\n"
        "If you received this, your integration is configured correctly."
    )
    return {
        "email": dispatcher.send_email(subject, body),
        "slack": dispatcher.post_slack(f"*{subject}*\n{body}"),
    }
