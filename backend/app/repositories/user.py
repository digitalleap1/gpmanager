"""User persistence queries."""

from sqlalchemy import select

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    def get_by_email(self, email: str) -> User | None:
        """Look up an active-or-not user by (lower-cased) email.

        Phase 1 is single-tenant so email is effectively unique. When multi-tenant
        login lands, this gains a ``company_id`` argument.
        """
        stmt = select(User).where(User.email == email.lower())
        return self.db.scalars(stmt).first()
