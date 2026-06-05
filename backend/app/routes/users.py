"""User listing route (for assignee / team-lead pickers; managers only)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import PermissionDenied
from app.core.permissions import is_manager
from app.database.session import get_db
from app.models.user import User
from app.routes.deps import CurrentUser
from app.schemas.user import UserSummary

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[UserSummary])
def list_users(
    user: CurrentUser, db: DbSession, search: str | None = None
) -> list[UserSummary]:
    if not is_manager(user):
        raise PermissionDenied()
    stmt = select(User).where(User.company_id == user.company_id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like)))
    users = db.scalars(stmt.order_by(User.full_name)).all()
    return [UserSummary.from_user(u) for u in users]
