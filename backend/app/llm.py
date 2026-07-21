"""
llm.py
------
LLM client for the GenAI Client Intelligence Platform.

Responsibilities:
  - Single, well-typed interface to the Groq API.
  - Retry loop with exponential back-off for transient API errors.
  - Retry loop for structurally invalid or schema-violating LLM responses.
  - Raw JSON extraction with defensive parsing (strips accidental markdown fences).
  - Full observability: every attempt is logged with timing, token usage, and outcome.
  - Zero business logic — this layer knows nothing about health coaching.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any

from groq import Groq
from groq import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    RateLimitError,
)

from app.prompt import build_system_prompt, build_user_prompt
from app.schema import AnalysisReport
from app.validator import ValidationError, validate_analysis_report

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class LLMConfig:
    """
    Immutable configuration for the LLM client.
    All values are read from environment via Settings (see utils.py) and
    passed in at construction time — no os.getenv() calls inside this class.

    Model is read from GROQ_MODEL env var at import time, defaulting to
    llama-3.3-70b-versatile. Override without touching code:
        export GROQ_MODEL=llama-3.1-8b-instant
    """

    model: str                    = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    max_tokens: int               = 4_096
    temperature: float            = 0.1      # Low temp: prioritise accuracy over creativity
    max_validation_retries: int   = 3        # Retries for schema/logic violations
    max_api_retries: int          = 3        # Retries for transient API errors
    api_retry_base_delay: float   = 1.0      # seconds; doubles each attempt
    api_retry_max_delay: float    = 30.0     # seconds ceiling
    request_timeout: float        = 120.0    # seconds total per API call


# ---------------------------------------------------------------------------
# Attempt tracking
# ---------------------------------------------------------------------------

@dataclass
class LLMAttempt:
    """Record of a single LLM call attempt."""

    attempt_number: int
    duration_ms: float
    prompt_tokens: int      = 0
    completion_tokens: int  = 0
    success: bool           = False
    failure_reason: str     = ""


@dataclass
class LLMResult:
    """
    Final result returned to the service layer.
    Separates the validated report from observability metadata.
    """

    report: AnalysisReport
    raw_json: dict[str, Any]
    attempts: list[LLMAttempt]        = field(default_factory=list)
    total_duration_ms: float          = 0.0
    total_prompt_tokens: int          = 0
    total_completion_tokens: int      = 0

    @property
    def total_attempts(self) -> int:
        return len(self.attempts)

    @property
    def total_tokens(self) -> int:
        return self.total_prompt_tokens + self.total_completion_tokens


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class LLMError(Exception):
    """Base error for all LLM client failures."""


class LLMAPIError(LLMError):
    """Raised when all API retry attempts are exhausted."""

    def __init__(self, message: str, last_status_code: int | None = None) -> None:
        super().__init__(message)
        self.last_status_code = last_status_code


class LLMValidationExhausted(LLMError):
    """
    Raised when the LLM repeatedly returns responses that fail schema validation
    or business-rule checks even after max_validation_retries attempts.
    """

    def __init__(self, message: str, attempts: list[LLMAttempt]) -> None:
        super().__init__(message)
        self.attempts = attempts


class LLMResponseParseError(LLMError):
    """Raised when a response cannot be parsed as JSON at all."""


# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------

# Matches optional ```json ... ``` or ``` ... ``` fences the model may emit
_FENCE_RE = re.compile(
    r"```(?:json)?\s*(\{.*?\})\s*```",
    re.DOTALL | re.IGNORECASE,
)

# Matches a bare top-level JSON object even without fences
_BARE_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json(raw: str) -> dict[str, Any]:
    """
    Attempt to extract a JSON object from the raw LLM response string.

    Strategy (in order of preference):
      1. Parse the full stripped string directly — handles well-behaved responses.
      2. Strip markdown fences and parse the inner content.
      3. Regex-extract the outermost {...} block and parse that.

    Raises LLMResponseParseError if none of the strategies succeed.
    """
    text = raw.strip()

    # Strategy 1 — clean JSON response
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass

    # Strategy 2 — fenced code block
    fence_match = _FENCE_RE.search(text)
    if fence_match:
        try:
            obj = json.loads(fence_match.group(1))
            if isinstance(obj, dict):
                logger.warning(
                    "LLM wrapped response in markdown fences — extracted inner JSON."
                )
                return obj
        except json.JSONDecodeError:
            pass

    # Strategy 3 — bare object extraction
    bare_match = _BARE_OBJECT_RE.search(text)
    if bare_match:
        try:
            obj = json.loads(bare_match.group())
            if isinstance(obj, dict):
                logger.warning(
                    "LLM prepended/appended prose — extracted JSON object via regex."
                )
                return obj
        except json.JSONDecodeError:
            pass

    raise LLMResponseParseError(
        f"Could not extract a valid JSON object from LLM response. "
        f"First 300 chars: {text[:300]!r}"
    )


# ---------------------------------------------------------------------------
# Retry helpers
# ---------------------------------------------------------------------------

def _build_retry_feedback(
    attempt_number: int,
    failure_reason: str,
    raw_json: dict[str, Any] | None,
) -> str:
    """
    Construct a targeted correction message appended to the conversation
    on validation-retry attempts. Telling the model exactly what failed
    is dramatically more effective than simply re-sending the original prompt.
    """
    lines = [
        f"VALIDATION FAILURE — Attempt {attempt_number}",
        "",
        "Your previous response did not pass schema validation.",
        f"Reason: {failure_reason}",
        "",
    ]

    if raw_json is not None:
        # Surface the problematic field names to help the model self-correct
        lines.append("Fields present in your last response:")
        for key in raw_json:
            lines.append(f"  - {key}")
        lines.append("")

    lines += [
        "Instructions:",
        "1. Correct ONLY the fields identified in the failure reason.",
        "2. Preserve all correctly populated fields from your previous attempt.",
        "3. Return the complete JSON object — not just the corrected section.",
        "4. Your response must be a single JSON object with no surrounding text.",
    ]

    return "\n".join(lines)


def _api_backoff(attempt: int, base: float, ceiling: float) -> float:
    """Exponential back-off with jitter, capped at `ceiling` seconds."""
    import random
    delay = min(base * (2 ** (attempt - 1)), ceiling)
    jitter = random.uniform(0, delay * 0.1)   # 10 % jitter
    return delay + jitter


# ---------------------------------------------------------------------------
# LLM Client
# ---------------------------------------------------------------------------

class LLMClient:
    """
    Stateless LLM client backed by Groq.

    Instantiate once at application startup (via dependency injection in api.py)
    and reuse across requests. The underlying Groq client handles connection
    pooling internally.

    Usage:
        client = LLMClient(config=LLMConfig(), api_key="gsk_...")
        result = client.analyze(conversation="Coach: ...")
    """

    def __init__(self, config: LLMConfig, api_key: str) -> None:
        self._config = config
        self._client = Groq(
            api_key=api_key,
            timeout=config.request_timeout,
            max_retries=0,        # We manage retries ourselves for full observability
        )
        self._system_prompt = build_system_prompt()
        logger.info(
            "LLMClient initialised",
            extra={
                "model": config.model,
                "max_tokens": config.max_tokens,
                "temperature": config.temperature,
                "max_validation_retries": config.max_validation_retries,
                "system_prompt_chars": len(self._system_prompt),
            },
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def analyze(self, conversation: str) -> LLMResult:
        """
        Run the full LLM analysis pipeline for a single conversation transcript.

        Flow:
          ┌─ Build initial messages
          │
          ├─ Validation retry loop (up to max_validation_retries)
          │   ├─ Call _call_api() with API retry logic
          │   ├─ Extract JSON from response
          │   ├─ Validate against AnalysisReport schema
          │   └─ On failure: append correction feedback and retry
          │
          └─ Return LLMResult with report + full observability metadata

        Raises:
          LLMAPIError             — all API retry attempts exhausted
          LLMValidationExhausted  — all validation retries exhausted
          LLMResponseParseError   — response cannot be parsed (propagated up)
        """
        pipeline_start = time.perf_counter()
        attempts: list[LLMAttempt] = []
        total_prompt_tokens = 0
        total_completion_tokens = 0

        # Build the initial message list
        messages: list[dict[str, str]] = [
            {"role": "user", "content": build_user_prompt(conversation)},
        ]

        last_raw_json: dict[str, Any] | None = None
        last_failure: str = ""

        for attempt_num in range(1, self._config.max_validation_retries + 1):
            logger.info(
                "LLM analysis attempt %d/%d",
                attempt_num,
                self._config.max_validation_retries,
            )

            # ── If this is a retry, append correction feedback ──────────────
            if attempt_num > 1:
                correction = _build_retry_feedback(
                    attempt_num - 1, last_failure, last_raw_json
                )
                # Add the previous (bad) assistant turn + correction user turn
                # so the model sees its own mistake in context
                if last_raw_json is not None:
                    messages.append({
                        "role": "assistant",
                        "content": json.dumps(last_raw_json),
                    })
                messages.append({
                    "role": "user",
                    "content": correction,
                })

            # ── API call with its own retry loop ────────────────────────────
            attempt_start = time.perf_counter()
            attempt = LLMAttempt(attempt_number=attempt_num, duration_ms=0.0)

            try:
                response, prompt_tokens, completion_tokens = self._call_api(messages)
            except LLMAPIError as exc:
                attempt.duration_ms = (time.perf_counter() - attempt_start) * 1000
                attempt.failure_reason = str(exc)
                attempts.append(attempt)
                raise  # API errors are not recoverable via validation retry

            attempt.prompt_tokens     = prompt_tokens
            attempt.completion_tokens = completion_tokens
            total_prompt_tokens      += prompt_tokens
            total_completion_tokens  += completion_tokens

            # ── JSON extraction ──────────────────────────────────────────────
            try:
                raw_json = _extract_json(response)
            except LLMResponseParseError as exc:
                last_failure   = f"Response is not valid JSON: {exc}"
                last_raw_json  = None
                attempt.failure_reason = last_failure
                attempt.duration_ms = (time.perf_counter() - attempt_start) * 1000
                attempts.append(attempt)
                logger.warning("Attempt %d — JSON parse failure: %s", attempt_num, exc)
                continue

            last_raw_json = raw_json

            # ── Schema + business rule validation ───────────────────────────
            try:
                report = validate_analysis_report(raw_json)
            except ValidationError as exc:
                last_failure = str(exc)
                attempt.failure_reason = last_failure
                attempt.duration_ms = (time.perf_counter() - attempt_start) * 1000
                attempts.append(attempt)
                logger.warning(
                    "Attempt %d — validation failure: %s", attempt_num, exc
                )
                continue

            # ── Success ─────────────────────────────────────────────────────
            attempt.success     = True
            attempt.duration_ms = (time.perf_counter() - attempt_start) * 1000
            attempts.append(attempt)

            total_ms = (time.perf_counter() - pipeline_start) * 1000
            logger.info(
                "LLM analysis succeeded on attempt %d — %.0f ms total, %d tokens",
                attempt_num,
                total_ms,
                total_prompt_tokens + total_completion_tokens,
            )

            return LLMResult(
                report=report,
                raw_json=raw_json,
                attempts=attempts,
                total_duration_ms=round(total_ms, 2),
                total_prompt_tokens=total_prompt_tokens,
                total_completion_tokens=total_completion_tokens,
            )

        # ── All validation retries exhausted ────────────────────────────────
        total_ms = (time.perf_counter() - pipeline_start) * 1000
        logger.error(
            "LLM validation exhausted after %d attempts — %.0f ms",
            self._config.max_validation_retries,
            total_ms,
        )
        raise LLMValidationExhausted(
            f"LLM failed to return a valid response after "
            f"{self._config.max_validation_retries} attempts. "
            f"Last failure: {last_failure}",
            attempts=attempts,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _call_api(
        self,
        messages: list[dict[str, str]],
    ) -> tuple[str, int, int]:
        """
        Call the Groq Chat Completions API with exponential back-off retry
        for transient errors (rate limits, timeouts, connection drops).

        The system prompt is prepended here as a system-role message so the
        full conversation history (user + assistant retry turns) flows through
        unchanged from analyze().

        response_format={"type": "json_object"} instructs the model to always
        emit valid JSON — eliminates most parse failures without extra prompting.

        Returns:
            (response_text, prompt_tokens, completion_tokens)

        Raises:
            LLMAPIError — all retries exhausted or non-retryable status code.
        """
        last_exc: Exception | None = None
        last_status: int | None    = None

        # Groq uses the OpenAI messages format: system role goes in the list.
        groq_messages: list[dict[str, str]] = [
            {"role": "system", "content": self._system_prompt},
            *messages,
        ]

        for api_attempt in range(1, self._config.max_api_retries + 1):
            try:
                response = self._client.chat.completions.create(
                    model=self._config.model,
                    messages=groq_messages,          # type: ignore[arg-type]
                    max_tokens=self._config.max_tokens,
                    temperature=self._config.temperature,
                    response_format={"type": "json_object"},
                )

                content = response.choices[0].message.content
                if not content:
                    raise LLMAPIError("Groq returned an empty content block.")

                return (
                    content,
                    response.usage.prompt_tokens,
                    response.usage.completion_tokens,
                )

            except RateLimitError as exc:
                last_exc    = exc
                last_status = 429
                delay       = _api_backoff(
                    api_attempt,
                    self._config.api_retry_base_delay * 4,  # longer back-off for rate limits
                    self._config.api_retry_max_delay,
                )
                logger.warning(
                    "Rate limit hit (attempt %d/%d). Retrying in %.1f s.",
                    api_attempt,
                    self._config.max_api_retries,
                    delay,
                )
                time.sleep(delay)

            except APITimeoutError as exc:
                last_exc = exc
                delay    = _api_backoff(
                    api_attempt,
                    self._config.api_retry_base_delay,
                    self._config.api_retry_max_delay,
                )
                logger.warning(
                    "API timeout (attempt %d/%d). Retrying in %.1f s.",
                    api_attempt,
                    self._config.max_api_retries,
                    delay,
                )
                time.sleep(delay)

            except APIConnectionError as exc:
                last_exc = exc
                delay    = _api_backoff(
                    api_attempt,
                    self._config.api_retry_base_delay,
                    self._config.api_retry_max_delay,
                )
                logger.warning(
                    "API connection error (attempt %d/%d). Retrying in %.1f s.",
                    api_attempt,
                    self._config.max_api_retries,
                    delay,
                )
                time.sleep(delay)

            except APIStatusError as exc:
                last_status = exc.status_code
                # 4xx errors (except 429) are not retryable
                if exc.status_code < 500:
                    raise LLMAPIError(
                        f"Non-retryable API error {exc.status_code}: {exc.message}",
                        last_status_code=exc.status_code,
                    ) from exc
                last_exc = exc
                delay    = _api_backoff(
                    api_attempt,
                    self._config.api_retry_base_delay,
                    self._config.api_retry_max_delay,
                )
                logger.warning(
                    "API server error %d (attempt %d/%d). Retrying in %.1f s.",
                    exc.status_code,
                    api_attempt,
                    self._config.max_api_retries,
                    delay,
                )
                time.sleep(delay)

        raise LLMAPIError(
            f"API call failed after {self._config.max_api_retries} retries. "
            f"Last error: {last_exc}",
            last_status_code=last_status,
        ) from last_exc