"""Refresh-token and password-reset-token persistence queries."""

from datetime import datetime, timezone

from sqlalchemy import select

from app.models.user import PasswordResetToken, RefreshToken
from app.repositories.base import BaseRepository


class RefreshTokenRepository(BaseRepository[RefreshToken]):
    model = RefreshToken

    def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        return self.db.scalars(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        ).first()

    def revoke(self, token: RefreshToken) -> None:
        token.revoked_at = datetime.now(timezone.utc)
        self.db.flush()


class PasswordResetTokenRepository(BaseRepository[PasswordResetToken]):
    model = PasswordResetToken

    def get_by_hash(self, token_hash: str) -> PasswordResetToken | None:
        return self.db.scalars(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        ).first()
