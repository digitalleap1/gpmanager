"""Auth routes (Module 1): /api/auth/*."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.routes.deps import CurrentUser
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    ProfileUpdate,
    RefreshRequest,
    ResetPasswordRequest,
    Token,
    UserRead,
)
from app.schemas.common import Message
from app.services.auth import AuthService

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: DbSession) -> LoginResponse:
    user, access, refresh = AuthService(db).login(body.email, body.password)
    return LoginResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserRead.from_user(user),
    )


@router.post("/refresh", response_model=Token)
def refresh(body: RefreshRequest, db: DbSession) -> Token:
    access, new_refresh = AuthService(db).refresh(body.refresh_token)
    return Token(access_token=access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: LogoutRequest, user: CurrentUser, db: DbSession) -> None:
    AuthService(db).logout(body.refresh_token)


@router.get("/me", response_model=UserRead)
def read_me(user: CurrentUser) -> UserRead:
    return UserRead.from_user(user)


@router.patch("/me", response_model=UserRead)
def update_me(body: ProfileUpdate, user: CurrentUser, db: DbSession) -> UserRead:
    updated = AuthService(db).update_profile(user, body.full_name, body.phone)
    return UserRead.from_user(updated)


@router.post("/change-password", response_model=Message)
def change_password(body: ChangePasswordRequest, user: CurrentUser, db: DbSession) -> Message:
    AuthService(db).change_password(user, body.current_password, body.new_password)
    return Message(detail="Password changed successfully.")


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(body: ForgotPasswordRequest, db: DbSession) -> ForgotPasswordResponse:
    raw = AuthService(db).create_password_reset(body.email)
    response = ForgotPasswordResponse(
        detail="If that email exists, a password reset link has been sent."
    )
    # Convenience for local dev: surface the token so you can finish the flow.
    if raw and not settings.is_production:
        response.debug_token = raw
    return response


@router.post("/reset-password", response_model=Message)
def reset_password(body: ResetPasswordRequest, db: DbSession) -> Message:
    AuthService(db).reset_password(body.token, body.new_password)
    return Message(detail="Password has been reset. Please sign in.")
