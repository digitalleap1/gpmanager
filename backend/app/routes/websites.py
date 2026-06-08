"""Website routes (Module 6): /api/websites/* including CSV import/export."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.common import Page
from app.schemas.website import (
    ContactCreate,
    ContactRead,
    ImportResult,
    WebsiteCreate,
    WebsiteDetail,
    WebsiteListItem,
    WebsiteUpdate,
)
from app.services.website import WebsiteService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[WebsiteListItem])
def list_websites(
    user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    country_id: int | None = None,
    niche_id: int | None = None,
    min_dr: int | None = None,
    max_dr: int | None = None,
    min_traffic: int | None = None,
    max_price: float | None = None,
    guest_post_available: bool | None = None,
    sort: str = "-created_at",
) -> Page[WebsiteListItem]:
    items, total = WebsiteService(db, user).list(
        search=search,
        country_id=country_id,
        niche_id=niche_id,
        min_dr=min_dr,
        max_dr=max_dr,
        min_traffic=min_traffic,
        max_price=max_price,
        guest_post_available=guest_post_available,
        sort=sort,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return Page[WebsiteListItem](
        items=[WebsiteListItem.from_website(w) for w in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=WebsiteListItem, status_code=status.HTTP_201_CREATED)
def create_website(body: WebsiteCreate, user: CurrentUser, db: DbSession) -> WebsiteListItem:
    return WebsiteListItem.from_website(WebsiteService(db, user).create(body))


# Static paths must precede the dynamic /{website_id} route.
@router.get("/template")
def website_template(user: CurrentUser, format: str = "csv") -> Response:
    content, media, ext = WebsiteService.template(format)
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f"attachment; filename=websites-template.{ext}"},
    )


@router.get("/export")
def export_websites(
    user: CurrentUser,
    db: DbSession,
    format: str = "csv",
    search: str | None = None,
    country_id: int | None = None,
    niche_id: int | None = None,
    min_dr: int | None = None,
    max_dr: int | None = None,
    min_traffic: int | None = None,
    max_price: float | None = None,
    guest_post_available: bool | None = None,
) -> Response:
    content, media, ext = WebsiteService(db, user).export(
        format,
        search=search,
        country_id=country_id,
        niche_id=niche_id,
        min_dr=min_dr,
        max_dr=max_dr,
        min_traffic=min_traffic,
        max_price=max_price,
        guest_post_available=guest_post_available,
    )
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f"attachment; filename=websites.{ext}"},
    )


@router.post("/import", response_model=ImportResult)
async def import_websites(
    user: CurrentUser, db: DbSession, file: Annotated[UploadFile, File()]
) -> ImportResult:
    content = await file.read()
    return WebsiteService(db, user).import_file(file.filename or "upload.csv", content)


@router.get("/{website_id}", response_model=WebsiteDetail)
def get_website(website_id: uuid.UUID, user: CurrentUser, db: DbSession) -> WebsiteDetail:
    return WebsiteDetail.from_website_detail(WebsiteService(db, user).get(website_id))


@router.patch("/{website_id}", response_model=WebsiteListItem)
def update_website(
    website_id: uuid.UUID, body: WebsiteUpdate, user: CurrentUser, db: DbSession
) -> WebsiteListItem:
    return WebsiteListItem.from_website(WebsiteService(db, user).update(website_id, body))


@router.delete("/{website_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_website(website_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    WebsiteService(db, user).delete(website_id)


@router.post(
    "/{website_id}/contacts", response_model=ContactRead, status_code=status.HTTP_201_CREATED
)
def add_contact(
    website_id: uuid.UUID, body: ContactCreate, user: CurrentUser, db: DbSession
) -> ContactRead:
    return ContactRead.from_contact(WebsiteService(db, user).add_contact(website_id, body))


@router.delete(
    "/{website_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_contact(
    website_id: uuid.UUID, contact_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> None:
    WebsiteService(db, user).remove_contact(website_id, contact_id)
