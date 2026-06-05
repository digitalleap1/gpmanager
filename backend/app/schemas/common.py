"""Shared DTOs: generic messages and pagination envelopes."""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field, computed_field

T = TypeVar("T")


class Message(BaseModel):
    """Simple ``{"detail": "..."}`` response."""

    detail: str


class PaginationParams(BaseModel):
    """Query parameters for paginated list endpoints."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


class Page(BaseModel, Generic[T]):
    """Paginated response envelope."""

    items: list[T]
    total: int
    page: int
    page_size: int

    @classmethod
    def create(cls, items: list[T], total: int, params: PaginationParams) -> "Page[T]":
        return cls(items=items, total=total, page=params.page, page_size=params.page_size)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def pages(self) -> int:
        return (self.total + self.page_size - 1) // self.page_size if self.page_size else 0
