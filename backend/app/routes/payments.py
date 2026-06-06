"""Payment routes (Module 7): /api/payments/*."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.common import Page
from app.schemas.payment import (
    PaymentCreate,
    PaymentDetail,
    PaymentListItem,
    PaymentStatusChange,
    PaymentUpdate,
)
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
