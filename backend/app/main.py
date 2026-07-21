"""
main.py
-------
Application entry point for the GenAI Client Intelligence Platform.
"""

from __future__ import annotations

from app.utils import configure_logging, get_settings

# Logging must be configured before any other app imports emit log records
_settings = get_settings()
configure_logging(level=_settings.log_level, json_logs=_settings.log_json)

from app.api import create_app  # noqa: E402 — intentional late import

app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=_settings.app_host,
        port=_settings.app_port,
        reload=_settings.app_debug,
        log_config=None,   # Disable uvicorn's default logging; we own it
        access_log=False,  # Handled by our logging middleware
    )
