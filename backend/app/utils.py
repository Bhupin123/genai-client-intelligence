"""
utils.py
--------
Settings, logging configuration, and shared helpers.
"""

from __future__ import annotations

import logging
import logging.config
import sys
import time
import uuid
from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class Settings(BaseSettings):
    """
    Application settings loaded from environment variables / .env file.
    All secrets are read here and nowhere else in the codebase.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Groq ─────────────────────────────────────────────────────────────────
    groq_api_key: str = Field(..., description="Groq API key (required).")

    # ── LLM behaviour ────────────────────────────────────────────────────────
    llm_model: str              = Field("llama-3.3-70b-versatile", description="Groq model identifier.")
    llm_max_tokens: int         = Field(4_096,  ge=256, le=8_192)
    llm_temperature: float      = Field(0.1,    ge=0.0, le=1.0)
    llm_max_validation_retries: int = Field(3,  ge=1,   le=5)
    llm_max_api_retries: int        = Field(3,  ge=1,   le=5)
    llm_request_timeout: float      = Field(120.0, ge=10.0)

    # ── API server ───────────────────────────────────────────────────────────
    app_host: str   = Field("0.0.0.0")
    app_port: int   = Field(8000, ge=1, le=65_535)
    app_debug: bool = Field(False)
    app_env: str    = Field("production", description="production | staging | development")

    # ── Logging ──────────────────────────────────────────────────────────────
    log_level: str  = Field("INFO")
    log_json: bool  = Field(True, description="Emit structured JSON logs in production.")

    # ── Rate limiting (per-process, not distributed) ─────────────────────────
    rate_limit_requests_per_minute: int = Field(60, ge=1)

    @field_validator("log_level")
    @classmethod
    def normalise_log_level(cls, v: str) -> str:
        level = v.upper()
        if level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError(f"Invalid log_level: {v!r}")
        return level

    @field_validator("app_env")
    @classmethod
    def normalise_app_env(cls, v: str) -> str:
        v = v.lower()
        if v not in {"production", "staging", "development"}:
            raise ValueError(f"Invalid app_env: {v!r}")
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton Settings instance (cached after first call)."""
    return Settings()  # type: ignore[call-arg]


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

class _RequestIdFilter(logging.Filter):
    """Inject a request_id into every log record if not already present."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


class _JSONFormatter(logging.Formatter):
    """
    Minimal structured JSON log formatter.
    Produces one JSON object per line — compatible with most log aggregators.
    """

    def format(self, record: logging.LogRecord) -> str:
        import json as _json

        self.formatException  # ensure exc_info is processed
        payload: dict[str, Any] = {
            "timestamp":  self.formatTime(record, datefmt="%Y-%m-%dT%H:%M:%S"),
            "level":      record.levelname,
            "logger":     record.name,
            "message":    record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "module":     record.module,
            "lineno":     record.lineno,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return _json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO", json_logs: bool = True) -> None:
    """
    Configure root logger.
    Call once at application startup before any other imports log.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(_RequestIdFilter())
    handler.setFormatter(
        _JSONFormatter() if json_logs else logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(request_id)s | %(message)s"
        )
    )

    logging.root.handlers = []
    logging.root.addHandler(handler)
    logging.root.setLevel(level)

    # Silence noisy third-party loggers
    for noisy in ("httpx", "httpcore", "groq"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


# ---------------------------------------------------------------------------
# Request ID context
# ---------------------------------------------------------------------------

def generate_request_id() -> str:
    """Generate a short, URL-safe unique request identifier."""
    return uuid.uuid4().hex[:16]


class RequestIdContext:
    """
    Thread-local storage for the current request ID.
    Used by middleware to stamp all log records for a request.
    """

    import contextvars as _cv
    _var: _cv.ContextVar[str] = _cv.ContextVar("request_id", default="-")

    @classmethod
    def set(cls, request_id: str) -> None:
        cls._var.set(request_id)

    @classmethod
    def get(cls) -> str:
        return cls._var.get()


# ---------------------------------------------------------------------------
# Timing helper
# ---------------------------------------------------------------------------

class Timer:
    """Context manager that records elapsed wall-clock time in milliseconds."""

    def __init__(self) -> None:
        self.elapsed_ms: float = 0.0
        self._start: float     = 0.0

    def __enter__(self) -> Timer:
        self._start = time.perf_counter()
        return self

    def __exit__(self, *_: Any) -> None:
        self.elapsed_ms = round((time.perf_counter() - self._start) * 1000, 2)


# ---------------------------------------------------------------------------
# Sanitisation helpers
# ---------------------------------------------------------------------------

_MAX_LOG_CONVERSATION_CHARS = 200


def sanitise_for_log(conversation: str) -> str:
    """
    Return a safe, truncated representation of a conversation for logging.
    Never log the full transcript — it may contain PHI.
    """
    snippet = conversation[:_MAX_LOG_CONVERSATION_CHARS].replace("\n", " ")
    suffix  = "..." if len(conversation) > _MAX_LOG_CONVERSATION_CHARS else ""
    return f"[{len(conversation)} chars] {snippet}{suffix}"