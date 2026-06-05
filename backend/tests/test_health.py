"""Smoke tests for the application skeleton. No database required."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_is_running() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "running"


def test_health_ok() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_served_under_prefix() -> None:
    response = client.get("/api/openapi.json")
    assert response.status_code == 200
