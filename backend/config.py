"""Configuración centralizada del backend (lee .env vía pydantic-settings)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── App ──────────────────────────────────────────────────────────────────
    SECRET_KEY: str = Field(min_length=16)
    ENVIRONMENT: Literal["development", "production"] = "development"
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Datastores ───────────────────────────────────────────────────────────
    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379/0"

    # ── Google OAuth ─────────────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8001/auth/callback"

    # ── AI providers ─────────────────────────────────────────────────────────
    CLAUDE_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"
    CLAUDE_MODEL_BULK: str = "claude-haiku-4-5"
    DEEPGRAM_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = ""
    OPENAI_API_KEY: str = ""

    # ── WhatsApp / Meta Cloud API ────────────────────────────────────────────
    META_API_VERSION: str = "v21.0"
    WHATSAPP_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: str = ""
    WHATSAPP_MY_NUMBER: str = ""

    # ── MCP ──────────────────────────────────────────────────────────────────
    MCP_AUTH_TOKEN: str = ""

    # ── JWT / Auth ───────────────────────────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_DAYS: int = 7
    SESSION_COOKIE_NAME: str = "maestro_session"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def cookie_secure(self) -> bool:
        # En dev (http://localhost) la cookie debe ir sin Secure o el browser
        # la rechaza. En prod (HTTPS) sí.
        return self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
