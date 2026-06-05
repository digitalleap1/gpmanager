"""Domain exceptions. Services raise these; a single handler in ``main.py`` maps
them to JSON HTTP responses, keeping the service layer free of FastAPI types.
"""


class AppError(Exception):
    status_code: int = 400
    detail: str = "Application error"

    def __init__(self, detail: str | None = None) -> None:
        if detail is not None:
            self.detail = detail
        super().__init__(self.detail)


class BadRequest(AppError):
    status_code = 400
    detail = "Bad request"


class InvalidCredentials(AppError):
    status_code = 401
    detail = "Incorrect email or password"


class InvalidToken(AppError):
    status_code = 401
    detail = "Invalid or expired token"


class PermissionDenied(AppError):
    status_code = 403
    detail = "Not enough permissions"


class NotFound(AppError):
    status_code = 404
    detail = "Resource not found"
