"""Guest Post routes (Module 5): /api/guest-posts/*."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.common import Page
from app.schemas.guest_post import (
    GuestPostCreate,
    GuestPostDetail,
    GuestPostListItem,
    GuestPostStatsRead,
    GuestPostUpdate,
    PublishRequest,
    ReviewDecision,
    StatusChange,
)
from app.services.guest_post import GuestPostService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[GuestPostListItem])
def list_guest_posts(
    user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    project_id: uuid.UUID | None = None,
    status_: str | None = Query(None, alias="status"),
    assigned_user_id: uuid.UUID | None = None,
    website_id: uuid.UUID | None = None,
    search: str | None = None,
    sort: str = "-created_at",
) -> Page[GuestPostListItem]:
    items, total = GuestPostService(db, user).list(
        project_id=project_id,
        status=status_,
        assigned_user_id=assigned_user_id,
        website_id=website_id,
        search=search,
        sort=sort,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return Page[GuestPostListItem](
        items=[GuestPostListItem.from_gp(g) for g in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=GuestPostListItem, status_code=status.HTTP_201_CREATED)
def create_guest_post(
    body: GuestPostCreate, user: CurrentUser, db: DbSession
) -> GuestPostListItem:
    return GuestPostListItem.from_gp(GuestPostService(db, user).create(body))


# Static path before /{gp_id}.
@router.get("/stats", response_model=GuestPostStatsRead)
def guest_post_stats(user: CurrentUser, db: DbSession) -> GuestPostStatsRead:
    return GuestPostStatsRead(**GuestPostService(db, user).stats())


@router.get("/{gp_id}", response_model=GuestPostDetail)
def get_guest_post(gp_id: uuid.UUID, user: CurrentUser, db: DbSession) -> GuestPostDetail:
    return GuestPostDetail.from_gp_detail(GuestPostService(db, user).get(gp_id))


@router.post("/{gp_id}/submit-review", response_model=GuestPostListItem)
def submit_for_review(gp_id: uuid.UUID, user: CurrentUser, db: DbSession) -> GuestPostListItem:
    return GuestPostListItem.from_gp(GuestPostService(db, user).submit_for_review(gp_id))


@router.post("/{gp_id}/review", response_model=GuestPostListItem)
def review_guest_post(
    gp_id: uuid.UUID, body: ReviewDecision, user: CurrentUser, db: DbSession
) -> GuestPostListItem:
    return GuestPostListItem.from_gp(
        GuestPostService(db, user).review(gp_id, body.approve, body.note)
    )


@router.patch("/{gp_id}", response_model=GuestPostListItem)
def update_guest_post(
    gp_id: uuid.UUID, body: GuestPostUpdate, user: CurrentUser, db: DbSession
) -> GuestPostListItem:
    return GuestPostListItem.from_gp(GuestPostService(db, user).update(gp_id, body))


@router.post("/{gp_id}/status", response_model=GuestPostListItem)
def change_status(
    gp_id: uuid.UUID, body: StatusChange, user: CurrentUser, db: DbSession
) -> GuestPostListItem:
    return GuestPostListItem.from_gp(
        GuestPostService(db, user).set_status(gp_id, body.status, body.note)
    )


@router.post("/{gp_id}/publish", response_model=GuestPostListItem)
def publish_guest_post(
    gp_id: uuid.UUID, body: PublishRequest, user: CurrentUser, db: DbSession
) -> GuestPostListItem:
    return GuestPostListItem.from_gp(
        GuestPostService(db, user).publish(
            gp_id, body.live_link, body.live_link_date, body.anchor_text
        )
    )


@router.delete("/{gp_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guest_post(gp_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    GuestPostService(db, user).delete(gp_id)
