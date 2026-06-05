"""Unit tests for password hashing and JWT helpers (no database required)."""

import pytest

from app.core.security import (
    ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN_TYPE,
    JWTError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("S3cret-pass!")
    assert hashed != "S3cret-pass!"
    assert verify_password("S3cret-pass!", hashed)
    assert not verify_password("wrong-pass", hashed)


def test_access_token_roundtrip_and_claims() -> None:
    token = create_access_token("user-123", extra_claims={"company_id": "abc"})
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["type"] == ACCESS_TOKEN_TYPE
    assert payload["company_id"] == "abc"
    assert payload["exp"] > payload["iat"]


def test_refresh_token_has_refresh_type() -> None:
    payload = decode_token(create_refresh_token("user-123"))
    assert payload["type"] == REFRESH_TOKEN_TYPE


def test_decode_invalid_token_raises() -> None:
    with pytest.raises(JWTError):
        decode_token("definitely.not.a.valid.jwt")
