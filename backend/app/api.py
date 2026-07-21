"""
api.py
------
FastAPI router, middleware, dependency injection, and the POST /analyze endpoint.
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.llm import LLMClient, LLMConfig, LLMAPIError, LLMValidationExhausted
from app.schema import (
    AnalyzeRequest,
    AnalyzeResponse,
    ErrorDetail,
    ErrorResponse,
)
from app.utils import (
    RequestIdContext,
    Settings,
    Timer,
    generate_request_id,
    get_settings,
    sanitise_for_log,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Dependency providers
# ---------------------------------------------------------------------------

def get_llm_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> LLMClient:
    return _get_app_llm_client(settings)


_llm_client_singleton: LLMClient | None = None


def _get_app_llm_client(settings: Settings) -> LLMClient:
    global _llm_client_singleton
    if _llm_client_singleton is None:
        config = LLMConfig(
            model=settings.llm_model,
            max_tokens=settings.llm_max_tokens,
            temperature=settings.llm_temperature,
            max_validation_retries=settings.llm_max_validation_retries,
            max_api_retries=settings.llm_max_api_retries,
            request_timeout=settings.llm_request_timeout,
        )
        _llm_client_singleton = LLMClient(config=config, api_key=settings.groq_api_key)
    return _llm_client_singleton


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    _get_app_llm_client(settings)
    logger.info("Application startup complete — LLM client ready.")
    yield
    logger.info("Application shutdown.")


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="GenAI Client Intelligence Platform",
        description=(
            "AI pipeline that analyzes health coaching conversations "
            "and returns a structured JSON intelligence report."
        ),
        version="1.0.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    _register_middleware(app)
    _register_exception_handlers(app)
    _register_routes(app)

    return app


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

def _register_middleware(app: FastAPI) -> None:

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # tighten to your Lovable URL in production
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next: object) -> Response:
        request_id = request.headers.get("X-Request-ID") or generate_request_id()
        RequestIdContext.set(request_id)
        request.state.request_id = request_id

        response: Response = await call_next(request)  # type: ignore[operator]
        response.headers["X-Request-ID"] = request_id
        return response

    @app.middleware("http")
    async def logging_middleware(request: Request, call_next: object) -> Response:
        start = time.perf_counter()
        response: Response = await call_next(request)  # type: ignore[operator]
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

        logger.info(
            "HTTP %s %s → %d  (%.0f ms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            extra={
                "request_id": getattr(request.state, "request_id", "-"),
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": elapsed_ms,
            },
        )
        return response


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

def _register_exception_handlers(app: FastAPI) -> None:

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = exc.errors()
        first  = errors[0] if errors else {}
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=ErrorResponse(
                error=ErrorDetail(
                    code="REQUEST_VALIDATION_ERROR",
                    message=f"Invalid request: {first.get('msg', 'validation error')}",
                    details={"errors": errors},
                )
            ).model_dump(),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception(
            "Unhandled exception on %s %s",
            request.method,
            request.url.path,
            extra={"request_id": getattr(request.state, "request_id", "-")},
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ErrorResponse(
                error=ErrorDetail(
                    code="INTERNAL_SERVER_ERROR",
                    message="An unexpected error occurred. Please try again.",
                )
            ).model_dump(),
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

def _register_routes(app: FastAPI) -> None:

    @app.get("/health", include_in_schema=False)
    async def health_check() -> dict:
        return {"status": "ok"}

    @app.post(
        "/analyze",
        response_model=AnalyzeResponse,
        responses={
            422: {"model": ErrorResponse, "description": "Invalid request payload"},
            429: {"model": ErrorResponse, "description": "LLM rate limit exceeded"},
            502: {"model": ErrorResponse, "description": "LLM API unreachable"},
            503: {"model": ErrorResponse, "description": "LLM failed to produce valid output"},
        },
        summary="Analyze a health coaching conversation",
        description=(
            "Accepts a raw conversation transcript and returns a fully structured "
            "intelligence report including sentiment, coaching effectiveness, "
            "risk flags, action items, and more."
        ),
    )
    async def analyze(
        request:    Request,
        payload:    AnalyzeRequest,
        llm_client: Annotated[LLMClient, Depends(get_llm_client)],
    ) -> AnalyzeResponse:
        request_id = getattr(request.state, "request_id", "-")

        logger.info(
            "Analysis request received",
            extra={
                "request_id": request_id,
                "conversation_preview": sanitise_for_log(payload.conversation),
            },
        )

        with Timer() as timer:
            try:
                result = llm_client.analyze(payload.conversation)

            except LLMAPIError as exc:
                status_code = (
                    status.HTTP_429_TOO_MANY_REQUESTS
                    if exc.last_status_code == 429
                    else status.HTTP_502_BAD_GATEWAY
                )
                logger.error(
                    "LLM API error: %s",
                    exc,
                    extra={"request_id": request_id},
                )
                raise HTTPException(
                    status_code=status_code,
                    detail=ErrorDetail(
                        code="LLM_API_ERROR",
                        message=str(exc),
                    ).model_dump(),
                ) from exc

            except LLMValidationExhausted as exc:
                logger.error(
                    "LLM validation exhausted after %d attempts",
                    len(exc.attempts),
                    extra={"request_id": request_id},
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=ErrorDetail(
                        code="LLM_VALIDATION_EXHAUSTED",
                        message=(
                            "The AI pipeline could not produce a valid structured "
                            "response after multiple attempts. Please retry."
                        ),
                        details={"attempts": len(exc.attempts)},
                    ).model_dump(),
                ) from exc

        logger.info(
            "Analysis complete",
            extra={
                "request_id":        request_id,
                "duration_ms":       timer.elapsed_ms,
                "total_attempts":    result.total_attempts,
                "total_tokens":      result.total_tokens,
                "requires_escalation": result.report.risk_flags.requires_escalation,
                "risk_level":        result.report.risk_flags.overall_risk_level,
            },
        )

        return AnalyzeResponse(data=result.report)