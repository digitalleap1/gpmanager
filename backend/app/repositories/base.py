"""Generic repository implementing the common CRUD query surface.

Concrete repositories subclass this and set ``model``::

    class UserRepository(BaseRepository[User]):
        model = User
"""

from collections.abc import Sequence
from typing import Any, Generic, TypeVar

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, id_: Any) -> ModelT | None:
        return self.db.get(self.model, id_)

    def list(self, *, offset: int = 0, limit: int = 20) -> Sequence[ModelT]:
        stmt = select(self.model).offset(offset).limit(limit)
        return self.db.scalars(stmt).all()

    def count(self) -> int:
        return self.db.scalar(select(func.count()).select_from(self.model)) or 0

    def add(self, obj: ModelT) -> ModelT:
        self.db.add(obj)
        self.db.flush()
        self.db.refresh(obj)
        return obj

    def delete(self, obj: ModelT) -> None:
        self.db.delete(obj)
        self.db.flush()
