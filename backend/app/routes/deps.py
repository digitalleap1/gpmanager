"""Reusable FastAPI dependencies: current-user resolution and role guards."""

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import InvalidToken, PermissionDenied
from app.core.security import ACCESS_TOKEN_TYPE, JWTError, decode_token
from app.database.session import get_db
from app.models.user import User
from app.repositories.user import UserRepository

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise InvalidToken("Not authenticated")
    try:
        payload = decode_token(credentials.credentials)
    except JWTError as exc:
        raise InvalidToken() from exc
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise InvalidToken("Wrong token type")

    subject = payload.get("sub")
    user = UserRepository(db).get(uuid.UUID(subject)) if subject else None
    if user is None or user.status != "active":
        raise InvalidToken("User not found or inactive")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: str) -> Callable[[User], User]:
    """Dependency factory: allow only the given role slugs (superusers always pass)."""
    allowed = set(roles)

    def checker(user: CurrentUser) -> User:
        if user.is_superuser or (user.role_slugs & allowed):
            return user
        raise PermissionDenied()

    return checker
