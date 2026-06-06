"""Security primitives: password hashing and JWT access/refresh tokens.

These helpers are consumed by the auth service (Module 1). They are placed in the
core layer so any module can verify tokens without importing feature code.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


# bcrypt truncates secrets at 72 bytes; do it explicitly so modern bcrypt does
# not raise on longer inputs.
_BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8")[:_BCRYPT_MAX_BYTES], bcrypt.gensalt()
    ).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:_BCRYPT_MAX_BYTES],
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


def _create_token(
    subject: str | int,
    expires_delta: timedelta,
    token_type: str,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + expires_delta
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "type": token_type,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(subject: str | int, extra_claims: dict[str, Any] | None = None) -> str:
    return _create_token(
        subject,
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        ACCESS_TOKEN_TYPE,
        extra_claims,
    )


def create_refresh_token(subject: str | int, extra_claims: dict[str, Any] | None = None) -> str:
    return _create_token(
        subject,
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        REFRESH_TOKEN_TYPE,
        extra_claims,
    )


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises ``jose.JWTError`` on failure."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


__all__ = [
    "ACCESS_TOKEN_TYPE",
    "REFRESH_TOKEN_TYPE",
    "JWTError",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "hash_password",
    "verify_password",
]
