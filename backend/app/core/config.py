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

    # --- Integrations: Email (SMTP) ---  all blank by default => disabled (safe offline)
    # Thunderbird-compatible: point these at the same SMTP server Thunderbird uses
    # (e.g. mail.digitalleapmarketing.com : 587, STARTTLS) and notifications turn on.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""  # falls back to SMTP_USER when blank
    SMTP_USE_TLS: bool = True  # STARTTLS on 587; set False + SMTP_USE_SSL for 465
    SMTP_USE_SSL: bool = False
    SMTP_TIMEOUT: int = 10

    # Where operational alerts (logins, new users, etc.) are sent.
    NOTIFY_EMAIL: str = ""

    # --- Integrations: Slack (incoming webhook) ---  blank => disabled
    SLACK_WEBHOOK_URL: str = ""

    # Master switch for event notifications (login/user events). Off by default so
    # the offline local run never tries to reach the network.
    NOTIFICATIONS_ENABLED: bool = False

    @property
    def email_enabled(self) -> bool:
        return bool(self.SMTP_HOST and (self.NOTIFY_EMAIL or self.SMTP_FROM or self.SMTP_USER))

    @property
    def slack_enabled(self) -> bool:
        return bool(self.SLACK_WEBHOOK_URL)

    @property
    def email_from(self) -> str:
        return self.SMTP_FROM or self.SMTP_USER

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
