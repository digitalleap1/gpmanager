"""Application settings, loaded from environment / .env via pydantic-settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # --- Application ---
    APP_ENV: str = "development"
    APP_NAME: str = "Digital Leap GPOMS"
    API_V1_PREFIX: str = "/api"

    # --- Database ---
    DATABASE_URL: str = "postgresql+psycopg://gpoms:gpoms_dev_password@localhost:5432/gpoms"

    # --- Security / JWT ---
    SECRET_KEY: str = "dev-insecure-change-me-please-generate-a-real-one"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- CORS (comma-separated origins) ---
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000"

    # --- File storage ---
    STORAGE_BACKEND: str = "local"
    STORAGE_LOCAL_DIR: str = "./storage"

    # --- Bootstrap admin (Module 1 seed) ---
    FIRST_ADMIN_EMAIL: str = "admin@digitalleap.com"
    FIRST_ADMIN_PASSWORD: str = "ChangeMe123!"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (instantiate once per process)."""
    return Settings()


settings = get_settings()
