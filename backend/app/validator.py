"""
validator.py
------------
Schema and business-rule validation for raw LLM JSON responses.
"""

from __future__ import annotations

import logging
from typing import Any

from pydantic import ValidationError as PydanticValidationError

from app.schema import AnalysisReport, HealthMetricClassification, RiskLevel

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class ValidationError(Exception):
    """Raised when an LLM response fails schema or business-rule validation."""

    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.field = field


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Sections that must carry a confidence key
_CONFIDENCE_SECTIONS = {
    "client_profile",
    "sentiment_analysis",
    "coaching_effectiveness",
    "health_topic_coverage",
    "action_items",
    "risk_flags",
    "progress_assessment",
    "conversation_metrics",
}

# Scores that must fall within [0, 10]
_ZERO_TEN_SCORES: list[tuple[str, str]] = [
    ("coaching_effectiveness", "effectiveness_score"),
    ("progress_assessment",    "goal_adherence_score"),
    ("conversation_metrics",   "rapport_score"),
]

# Scores that must fall within [0, 1]
_ZERO_ONE_SCORES: list[tuple[str, str]] = [
    ("conversation_metrics", "coach_talk_ratio"),
]

_HIGH_RISK_LEVELS = {RiskLevel.HIGH.value, RiskLevel.MEDIUM.value}

# Health metric field names — must all be present under health_metrics
_HEALTH_METRIC_FIELDS = {
    "nutrition_adherence",
    "exercise_activity",
    "sleep_quality",
    "water_intake",
    "stress_symptoms",
}


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def validate_analysis_report(raw: dict[str, Any]) -> AnalysisReport:
    """
    Validate a raw LLM JSON payload.

    Runs in two passes:
      1. Pydantic schema validation (types, enums, field presence, field-level rules)
      2. Cross-field business rules (escalation consistency, confidence bounds, etc.)

    Returns a fully validated AnalysisReport on success.
    Raises ValidationError with a precise failure message on any violation.
    """
    _check_top_level_keys(raw)
    _check_confidence_fields(raw)
    _check_health_metrics_structure(raw)
    report = _pydantic_validate(raw)
    _check_business_rules(raw, report)
    logger.debug("Validation passed for analysis report.")
    return report


# ---------------------------------------------------------------------------
# Pass 1 helpers — structural checks before Pydantic
# ---------------------------------------------------------------------------

def _check_top_level_keys(raw: dict[str, Any]) -> None:
    required = {
        "analysis_version",
        "client_profile",
        "sentiment_analysis",
        "coaching_effectiveness",
        "health_topic_coverage",
        "health_metrics",
        "action_items",
        "risk_flags",
        "progress_assessment",
        "conversation_metrics",
        "executive_summary",
        "key_insights",
        "recommendations",
    }
    missing = required - raw.keys()
    if missing:
        raise ValidationError(
            f"Response is missing required top-level keys: {sorted(missing)}",
            field="root",
        )


def _check_confidence_fields(raw: dict[str, Any]) -> None:
    for section in _CONFIDENCE_SECTIONS:
        block = raw.get(section)
        if not isinstance(block, dict):
            continue  # Pydantic will catch the type error
        if "confidence" not in block:
            raise ValidationError(
                f"Section '{section}' is missing the required 'confidence' field.",
                field=f"{section}.confidence",
            )
        conf = block["confidence"]
        if not isinstance(conf, (int, float)):
            raise ValidationError(
                f"'{section}.confidence' must be a number, got {type(conf).__name__}.",
                field=f"{section}.confidence",
            )
        if not (0.0 <= float(conf) <= 1.0):
            raise ValidationError(
                f"'{section}.confidence' must be between 0.0 and 1.0, got {conf}.",
                field=f"{section}.confidence",
            )


def _check_health_metrics_structure(raw: dict[str, Any]) -> None:
    """
    Validate the health_metrics block structure and classification/score consistency
    before Pydantic runs, so feedback to the LLM is precise.
    """
    hm = raw.get("health_metrics")
    if not isinstance(hm, dict):
        raise ValidationError(
            "'health_metrics' must be a JSON object.",
            field="health_metrics",
        )

    missing = _HEALTH_METRIC_FIELDS - hm.keys()
    if missing:
        raise ValidationError(
            f"'health_metrics' is missing fields: {sorted(missing)}",
            field="health_metrics",
        )

    valid_classifications = {e.value for e in HealthMetricClassification}

    for field_name in _HEALTH_METRIC_FIELDS:
        metric = hm.get(field_name)
        if not isinstance(metric, dict):
            raise ValidationError(
                f"'health_metrics.{field_name}' must be a JSON object.",
                field=f"health_metrics.{field_name}",
            )

        classification = metric.get("classification")
        score = metric.get("score")

        if classification not in valid_classifications:
            raise ValidationError(
                f"'health_metrics.{field_name}.classification' must be one of "
                f"{sorted(valid_classifications)}, got {classification!r}.",
                field=f"health_metrics.{field_name}.classification",
            )

        is_unavailable = classification == HealthMetricClassification.UNAVAILABLE.value

        if is_unavailable and score is not None:
            raise ValidationError(
                f"'health_metrics.{field_name}.score' must be null when "
                f"classification is 'unavailable', got {score}.",
                field=f"health_metrics.{field_name}.score",
            )

        if not is_unavailable and score is None:
            raise ValidationError(
                f"'health_metrics.{field_name}.score' must be provided (non-null) "
                f"when classification is '{classification}'.",
                field=f"health_metrics.{field_name}.score",
            )

        if score is not None:
            try:
                v = float(score)
            except (TypeError, ValueError):
                raise ValidationError(
                    f"'health_metrics.{field_name}.score' must be numeric, got {score!r}.",
                    field=f"health_metrics.{field_name}.score",
                )
            if not (0.0 <= v <= 10.0):
                raise ValidationError(
                    f"'health_metrics.{field_name}.score' must be 0.0–10.0, got {v}.",
                    field=f"health_metrics.{field_name}.score",
                )


# ---------------------------------------------------------------------------
# Pass 1 — Pydantic validation
# ---------------------------------------------------------------------------

def _pydantic_validate(raw: dict[str, Any]) -> AnalysisReport:
    try:
        return AnalysisReport.model_validate(raw)
    except PydanticValidationError as exc:
        errors = exc.errors(include_url=False)
        first  = errors[0]
        loc    = " -> ".join(str(p) for p in first["loc"])
        msg    = first["msg"]
        extra  = f" ({len(errors) - 1} more errors)" if len(errors) > 1 else ""
        raise ValidationError(
            f"Schema validation failed at '{loc}': {msg}{extra}",
            field=loc,
        ) from exc


# ---------------------------------------------------------------------------
# Pass 2 — cross-field business rules
# ---------------------------------------------------------------------------

def _check_business_rules(raw: dict[str, Any], report: AnalysisReport) -> None:
    _check_escalation_consistency(report)
    _check_numeric_score_ranges(raw)
    _check_sentiment_score(raw)
    _check_list_cardinalities(report)
    _check_executive_summary(report)
    _check_confidence_vs_transcript_signals(raw, report)


def _check_escalation_consistency(report: AnalysisReport) -> None:
    rf = report.risk_flags

    # escalation_reason must be present when requires_escalation is True
    if rf.requires_escalation and not rf.escalation_reason:
        raise ValidationError(
            "'risk_flags.escalation_reason' must be a non-empty string "
            "when 'requires_escalation' is true.",
            field="risk_flags.escalation_reason",
        )

    # High/medium risk level should trigger escalation
    if rf.overall_risk_level.value in _HIGH_RISK_LEVELS and not rf.requires_escalation:
        raise ValidationError(
            f"'risk_flags.overall_risk_level' is '{rf.overall_risk_level.value}' "
            "but 'requires_escalation' is false. High/medium risk must trigger escalation.",
            field="risk_flags.requires_escalation",
        )

    # If flags list is non-empty but risk level is 'none', that's contradictory
    if rf.flags and rf.overall_risk_level == rf.overall_risk_level.NONE:
        raise ValidationError(
            "'risk_flags.flags' contains items but 'overall_risk_level' is 'none'. "
            "A non-empty flags list requires a risk level of at least 'low'.",
            field="risk_flags.overall_risk_level",
        )


def _check_numeric_score_ranges(raw: dict[str, Any]) -> None:
    for section, field_name in _ZERO_TEN_SCORES:
        block = raw.get(section, {})
        if not isinstance(block, dict):
            continue
        value = block.get(field_name)
        if value is None:
            continue
        try:
            v = float(value)
        except (TypeError, ValueError):
            raise ValidationError(
                f"'{section}.{field_name}' must be numeric, got {value!r}.",
                field=f"{section}.{field_name}",
            )
        if not (0.0 <= v <= 10.0):
            raise ValidationError(
                f"'{section}.{field_name}' must be between 0.0 and 10.0, got {v}.",
                field=f"{section}.{field_name}",
            )

    for section, field_name in _ZERO_ONE_SCORES:
        block = raw.get(section, {})
        if not isinstance(block, dict):
            continue
        value = block.get(field_name)
        if value is None:
            continue
        try:
            v = float(value)
        except (TypeError, ValueError):
            raise ValidationError(
                f"'{section}.{field_name}' must be numeric, got {value!r}.",
                field=f"{section}.{field_name}",
            )
        if not (0.0 <= v <= 1.0):
            raise ValidationError(
                f"'{section}.{field_name}' must be between 0.0 and 1.0, got {v}.",
                field=f"{section}.{field_name}",
            )


def _check_sentiment_score(raw: dict[str, Any]) -> None:
    block = raw.get("sentiment_analysis", {})
    if not isinstance(block, dict):
        return
    value = block.get("sentiment_score")
    if value is None:
        return
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise ValidationError(
            f"'sentiment_analysis.sentiment_score' must be numeric, got {value!r}.",
            field="sentiment_analysis.sentiment_score",
        )
    if not (-1.0 <= v <= 1.0):
        raise ValidationError(
            f"'sentiment_analysis.sentiment_score' must be between -1.0 and 1.0, got {v}.",
            field="sentiment_analysis.sentiment_score",
        )


def _check_list_cardinalities(report: AnalysisReport) -> None:
    checks: list[tuple[str, list, int, int | None]] = [
        ("client_profile.health_goals",                   report.client_profile.health_goals,                   0, None),
        ("coaching_effectiveness.strengths",              report.coaching_effectiveness.strengths,              1, None),
        ("health_topic_coverage.primary_topics",          report.health_topic_coverage.primary_topics,          1, None),
        ("key_insights",                                   report.key_insights,                                  2, 8),
        ("recommendations",                               report.recommendations,                               1, 6),
    ]
    for path, lst, min_len, max_len in checks:
        if len(lst) < min_len:
            raise ValidationError(
                f"'{path}' must have at least {min_len} item(s), got {len(lst)}.",
                field=path,
            )
        if max_len is not None and len(lst) > max_len:
            raise ValidationError(
                f"'{path}' must have at most {max_len} item(s), got {len(lst)}.",
                field=path,
            )


def _check_executive_summary(report: AnalysisReport) -> None:
    summary = report.executive_summary
    if len(summary) < 100:
        raise ValidationError(
            f"'executive_summary' must be at least 100 characters, got {len(summary)}.",
            field="executive_summary",
        )
    if len(summary) > 1_000:
        raise ValidationError(
            f"'executive_summary' must be at most 1000 characters, got {len(summary)}.",
            field="executive_summary",
        )


def _check_confidence_vs_transcript_signals(
    raw: dict[str, Any],
    report: AnalysisReport,
) -> None:
    """
    Detect suspiciously high confidence on sparse evidence.

    If the turn_count is very low (≤ 4 turns) but any section reports
    confidence > 0.7, that is almost certainly overconfidence — flag it.
    """
    turn_count = report.conversation_metrics.turn_count
    if turn_count > 4:
        return

    for section in _CONFIDENCE_SECTIONS:
        block = raw.get(section, {})
        if not isinstance(block, dict):
            continue
        conf = block.get("confidence", 0.0)
        if float(conf) > 0.7:
            raise ValidationError(
                f"'{section}.confidence' is {conf} but turn_count is only {turn_count}. "
                "Confidence > 0.7 is not credible for a conversation with ≤ 4 turns.",
                field=f"{section}.confidence",
            )