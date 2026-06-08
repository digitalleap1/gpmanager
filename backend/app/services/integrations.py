"""Outbound integrations: email (SMTP) + Slack incoming webhook.

Stdlib-only, best-effort, and DISABLED by default — with no SMTP host / Slack URL
configured every method is a no-op, so the offline local run never touches the
network. Configure via environment (see ``core.config``); Thunderbird users can
reuse the same SMTP server their mail client uses.

Nothing here raises into the request path: failures are caught and returned as a
structured result so callers (e.g. an admin "test" button) can show what happened.
"""

from __future__ import annotations

import json
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage

from app.core.config import settings

ChannelResult = dict[str, object]


def _result(ok: bool, *, skipped: bool = False, detail: str = "") -> ChannelResult:
    return {"ok": ok, "skipped": skipped, "detail": detail}


class IntegrationDispatcher:
    """Sends email + Slack messages. Construct anywhere; reads live settings."""

    # --- Email -------------------------------------------------------------
    def send_email(self, subject: str, body: str, to: str | None = None) -> ChannelResult:
        recipient = (to or settings.NOTIFY_EMAIL or settings.email_from).strip()
        if not settings.SMTP_HOST or not recipient:
            return _result(False, skipped=True, detail="email not configured")

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.email_from or recipient
        message["To"] = recipient
        message.set_content(body)

        try:
            if settings.SMTP_USE_SSL:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(
                    settings.SMTP_HOST, settings.SMTP_PORT,
                    timeout=settings.SMTP_TIMEOUT, context=context,
                ) as server:
                    self._smtp_login_send(server, message)
            else:
                with smtplib.SMTP(
                    settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT
                ) as server:
                    if settings.SMTP_USE_TLS:
                        server.starttls(context=ssl.create_default_context())
                    self._smtp_login_send(server, message)
            return _result(True, detail=f"sent to {recipient}")
        except (OSError, smtplib.SMTPException) as exc:  # network / auth / protocol
            return _result(False, detail=f"{type(exc).__name__}: {exc}")

    @staticmethod
    def _smtp_login_send(server: smtplib.SMTP, message: EmailMessage) -> None:
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(message)

    # --- Slack -------------------------------------------------------------
    def post_slack(self, text: str) -> ChannelResult:
        url = settings.SLACK_WEBHOOK_URL.strip()
        if not url:
            return _result(False, skipped=True, detail="slack not configured")
        payload = json.dumps({"text": text}).encode("utf-8")
        request = urllib.request.Request(  # noqa: S310 - url is operator-configured
            url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(request, timeout=settings.SMTP_TIMEOUT) as resp:  # noqa: S310
                if 200 <= resp.status < 300:
                    return _result(True, detail="posted to slack")
                return _result(False, detail=f"slack HTTP {resp.status}")
        except (urllib.error.URLError, OSError) as exc:
            return _result(False, detail=f"{type(exc).__name__}: {exc}")

    # --- Events ------------------------------------------------------------
    def notify_event(self, title: str, body: str) -> dict[str, ChannelResult]:
        """Best-effort fan-out of an operational event to all enabled channels.

        Honors the ``NOTIFICATIONS_ENABLED`` master switch. Never raises.
        """
        if not settings.NOTIFICATIONS_ENABLED:
            return {
                "email": _result(False, skipped=True, detail="notifications disabled"),
                "slack": _result(False, skipped=True, detail="notifications disabled"),
            }
        return {
            "email": self.send_email(title, body),
            "slack": self.post_slack(f"*{title}*\n{body}"),
        }

    # --- Introspection -----------------------------------------------------
    @staticmethod
    def status() -> dict[str, object]:
        return {
            "notifications_enabled": settings.NOTIFICATIONS_ENABLED,
            "email_enabled": settings.email_enabled,
            "slack_enabled": settings.slack_enabled,
            "smtp_host": settings.SMTP_HOST or None,
            "smtp_port": settings.SMTP_PORT,
            "email_from": settings.email_from or None,
            "notify_email": settings.NOTIFY_EMAIL or None,
        }
