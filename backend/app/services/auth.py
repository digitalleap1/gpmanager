"""Authentication & account business logic (Module 1).

Holds no FastAPI types — it raises domain exceptions and owns the DB transaction
(``commit``) so routes stay thin and the logic is unit-testable.
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import BadRequest, InvalidCredentials, InvalidToken
from app.core.security import (
    REFRESH_TOKEN_TYPE,
    JWTError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import PasswordResetToken, RefreshToken, User
from app.repositories.token import PasswordResetTokenRepository, RefreshTokenRepository
from app.repositories.user import UserRepository

RESET_TOKEN_TTL = timedelta(hours=1)


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.refresh_tokens = RefreshTokenRepository(db)
        self.reset_tokens = PasswordResetTokenRepository(db)

    # ----- login / tokens -----
    def authenticate(self, email: str, password: str) -> User:
        user = self.users.get_by_email(email)
        if (
            user is None
            or not user.hashed_password
            or not verify_password(password, user.hashed_password)
        ):
            raise InvalidCredentials()
        if user.status != "active":
            raise InvalidCredentials("Account is not active")
        return user

    def _issue_tokens(self, user: User) -> tuple[str, str]:
        access = create_access_token(
            user.id,
            extra_claims={
                "company_id": str(user.company_id),
                "roles": sorted(user.role_slugs),
            },
        )
        # jti keeps otherwise-identical refresh tokens (same second) unique.
        raw_refresh = create_refresh_token(user.id, extra_claims={"jti": secrets.token_hex(8)})
        payload = decode_token(raw_refresh)
        self.refresh_tokens.add(
            RefreshToken(
                user_id=user.id,
                token_hash=_hash(raw_refresh),
                expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
            )
        )
        return access, raw_refresh

    def login(self, email: str, password: str) -> tuple[User, str, str]:
        user = self.authenticate(email, password)
        user.last_login_at = _now()
        access, refresh = self._issue_tokens(user)
        self.db.commit()
        return user, access, refresh

    def refresh(self, raw_refresh: str) -> tuple[str, str]:
        try:
            payload = decode_token(raw_refresh)
        except JWTError as exc:
            raise InvalidToken() from exc
        if payload.get("type") != REFRESH_TOKEN_TYPE:
            raise InvalidToken("Wrong token type")

        stored = self.refresh_tokens.get_by_hash(_hash(raw_refresh))
        if stored is None or not stored.is_active:
            raise InvalidToken("Refresh token revoked or expired")

        user = self.users.get(uuid.UUID(payload["sub"]))
        if user is None or user.status != "active":
            raise InvalidToken("User not found or inactive")

        # Rotate: revoke the presented token, issue a fresh pair.
        self.refresh_tokens.revoke(stored)
        access, new_refresh = self._issue_tokens(user)
        self.db.commit()
        return access, new_refresh

    def logout(self, raw_refresh: str) -> None:
        stored = self.refresh_tokens.get_by_hash(_hash(raw_refresh))
        if stored is not None and stored.revoked_at is None:
            self.refresh_tokens.revoke(stored)
            self.db.commit()

    # ----- account -----
    def change_password(self, user: User, current: str, new: str) -> None:
        if not user.hashed_password or not verify_password(current, user.hashed_password):
            raise BadRequest("Current password is incorrect")
        user.hashed_password = hash_password(new)
        self._revoke_all_refresh_tokens(user)
        self.db.commit()

    def update_profile(self, user: User, full_name: str | None, phone: str | None) -> User:
        if full_name is not None:
            user.full_name = full_name
        if phone is not None:
            user.phone = phone
        self.db.commit()
        self.db.refresh(user)
        return user

    # ----- password reset -----
    def create_password_reset(self, email: str) -> str | None:
        """Return a raw reset token, or None if the email is unknown (caller must
        not reveal which case occurred)."""
        user = self.users.get_by_email(email)
        if user is None:
            return None
        raw = secrets.token_urlsafe(32)
        self.reset_tokens.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=_hash(raw),
                expires_at=_now() + RESET_TOKEN_TTL,
            )
        )
        self.db.commit()
        return raw

    def reset_password(self, raw_token: str, new: str) -> None:
        stored = self.reset_tokens.get_by_hash(_hash(raw_token))
        now = _now()
        if stored is None or stored.used_at is not None or stored.expires_at < now:
            raise BadRequest("Invalid or expired reset token")
        user = self.users.get(stored.user_id)
        if user is None:
            raise BadRequest("Invalid or expired reset token")
        user.hashed_password = hash_password(new)
        stored.used_at = now
        self._revoke_all_refresh_tokens(user)
        self.db.commit()

    def _revoke_all_refresh_tokens(self, user: User) -> None:
        now = _now()
        for token in user.refresh_tokens:
            if token.revoked_at is None:
                token.revoked_at = now
