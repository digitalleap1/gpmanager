"""Payment routes (Module 7): /api/payments/*."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.common import Page
from app.schemas.common_bulk import ImportResult
from app.schemas.ledger import LedgerStats
from app.schemas.payment import (
    PaymentCreate,
    PaymentDetail,
    PaymentListItem,
    PaymentStatusChange,
    PaymentUpdate,
)
from app.services.ledger import LedgerService
from app.services.payment import PaymentService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[PaymentListItem])
def list_payments(
    user: CurrentUser,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    project_id: uuid.UUID | None = None,
    status_: str | None = Query(None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    sort: str = "-created_at",
) -> Page[PaymentListItem]:
    items, total = PaymentService(db, user).list(
        project_id=project_id,
        status=status_,
        date_from=date_from,
        date_to=date_to,
        search=search,
        sort=sort,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return Page[PaymentListItem](
        items=[PaymentListItem.from_payment(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=PaymentListItem, status_code=status.HTTP_201_CREATED)
def create_payment(body: PaymentCreate, user: CurrentUser, db: DbSession) -> PaymentListItem:
    return PaymentListItem.from_payment(PaymentService(db, user).create(body))


# Static paths must precede the dynamic /{payment_id} route.
@router.get("/ledger-stats", response_model=LedgerStats)
def ledger_stats(user: CurrentUser, db: DbSession) -> LedgerStats:
    return LedgerService(db, user).stats()


@router.get("/template")
def payment_template(user: CurrentUser, format: str = "csv") -> Response:
    content, media, ext = PaymentService.template(format)
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f"attachment; filename=payments-template.{ext}"},
    )


@router.get("/export")
def export_payments(
    user: CurrentUser,
    db: DbSession,
    format: str = "csv",
    project_id: uuid.UUID | None = None,
    status_: str | None = Query(None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
) -> Response:
    content, media, ext = PaymentService(db, user).export(
        format,
        project_id=project_id,
        status=status_,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f"attachment; filename=payments.{ext}"},
    )


@router.post("/import", response_model=ImportResult)
async def import_payments(
    user: CurrentUser, db: DbSession, file: Annotated[UploadFile, File()]
) -> ImportResult:
    content = await file.read()
    return PaymentService(db, user).import_file(file.filename or "upload.csv", content)


@router.get("/{payment_id}", response_model=PaymentDetail)
def get_payment(payment_id: uuid.UUID, user: CurrentUser, db: DbSession) -> PaymentDetail:
    return PaymentDetail.from_payment_detail(PaymentService(db, user).get(payment_id))


@router.patch("/{payment_id}", response_model=PaymentListItem)
def update_payment(
    payment_id: uuid.UUID, body: PaymentUpdate, user: CurrentUser, db: DbSession
) -> PaymentListItem:
    return PaymentListItem.from_payment(PaymentService(db, user).update(payment_id, body))


@router.post("/{payment_id}/status", response_model=PaymentListItem)
def change_status(
    payment_id: uuid.UUID, body: PaymentStatusChange, user: CurrentUser, db: DbSession
) -> PaymentListItem:
    return PaymentListItem.from_payment(
        PaymentService(db, user).set_status(payment_id, body.status, body.note)
    )


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    PaymentService(db, user).delete(payment_id)
