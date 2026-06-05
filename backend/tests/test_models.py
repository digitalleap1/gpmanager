"""Validate the ORM mapping/relationships without a database connection."""


def test_all_mappers_configure() -> None:
    # Importing the aggregator pulls in every registered model.
    import app.database.base  # noqa: F401
    from sqlalchemy.orm import configure_mappers

    # Raises if any relationship / back_populates / FK target is misconfigured.
    configure_mappers()


def test_auth_tables_registered() -> None:
    from app.models.base import Base

    tables = set(Base.metadata.tables)
    assert {
        "companies",
        "roles",
        "permissions",
        "role_permissions",
        "users",
        "user_roles",
        "refresh_tokens",
        "password_reset_tokens",
    } <= tables
