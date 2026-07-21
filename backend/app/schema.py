"""
schema.py
---------
All Pydantic models for the GenAI Client Intelligence Platform.

Design principles:
- Strict typing throughout; no bare `dict` or `Any` in public models.
- Every field carries a description used by the prompt engineer and OpenAPI docs.
- Enums constrain categorical fields so the LLM cannot invent values.
- The top-level AnalysisReport is the single source of truth for the JSON contract.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enums — categorical constraints passed verbatim into the system prompt
# ---------------------------------------------------------------------------


class SentimentLabel(str, Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"
    MIXED = "mixed"


class EngagementLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RiskLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


class CoachingStyle(str, Enum):
    MOTIVATIONAL = "motivational"
    DIRECTIVE = "directive"
    COLLABORATIVE = "collaborative"
    EDUCATIONAL = "educational"
    SUPPORTIVE = "supportive"
    MIXED = "mixed"


class ProgressStatus(str, Enum):
    ON_TRACK = "on_track"
    AT_RISK = "at_risk"
    STALLED = "stalled"
    REGRESSED = "regressed"
    BREAKTHROUGH = "breakthrough"
    INSUFFICIENT_DATA = "insufficient_data"


class HealthMetricClassification(str, Enum):
    CONFIRMED_FACT = "confirmed_fact"
    CLIENT_REPORT = "client_report"
    AI_INFERENCE = "ai_inference"
    UNAVAILABLE = "unavailable"


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    """Payload accepted by POST /analyze."""

    conversation: Annotated[
        str,
        Field(
            min_length=50,
            max_length=32_000,
            description=(
                "Raw transcript of the health coaching conversation. "
                "Expected format: multi-turn dialogue. Minimum 50 characters."
            ),
        ),
    ]

    model_config = {"str_strip_whitespace": True}


# ---------------------------------------------------------------------------
# Nested report sections
# ---------------------------------------------------------------------------


class ClientProfile(BaseModel):
    """Inferred attributes of the client from the conversation."""

    inferred_age_range: str | None = Field(
        None,
        description="Estimated age bracket (e.g. '30-40') or null if not determinable.",
    )
    health_goals: list[str] = Field(
        ...,
        min_length=1,
        description="Primary health objectives mentioned or implied by the client.",
    )
    current_challenges: list[str] = Field(
        ...,
        description="Barriers, struggles, or pain-points the client expressed.",
    )
    motivational_drivers: list[str] = Field(
        ...,
        description="Intrinsic or extrinsic motivators identified for this client.",
    )
    health_literacy_level: EngagementLevel = Field(
        ...,
        description="Assessed level of health knowledge demonstrated by the client.",
    )


class SentimentAnalysis(BaseModel):
    """Emotional tone breakdown across the conversation."""

    overall_sentiment: SentimentLabel = Field(
        ..., description="Dominant sentiment across the full conversation."
    )
    sentiment_score: float = Field(
        ...,
        ge=-1.0,
        le=1.0,
        description="Continuous score: -1.0 (very negative) → +1.0 (very positive).",
    )
    client_sentiment: SentimentLabel = Field(
        ..., description="Sentiment attributed specifically to the client."
    )
    coach_sentiment: SentimentLabel = Field(
        ..., description="Sentiment attributed specifically to the coach."
    )
    emotional_peaks: list[str] = Field(
        default_factory=list,
        description="Moments of notably high or low emotional intensity (brief quotes or descriptions).",
    )
    sentiment_trajectory: str = Field(
        ...,
        description=(
            "How sentiment evolved during the conversation "
            "(e.g. 'started neutral, became increasingly positive by the end')."
        ),
    )

    @field_validator("sentiment_score")
    @classmethod
    def round_score(cls, v: float) -> float:
        return round(v, 4)


class CoachingEffectiveness(BaseModel):
    """Evaluation of the coach's performance and approach."""

    coaching_style: CoachingStyle = Field(
        ..., description="Primary coaching methodology observed."
    )
    engagement_level: EngagementLevel = Field(
        ..., description="Overall client engagement during the session."
    )
    effectiveness_score: float = Field(
        ...,
        ge=0.0,
        le=10.0,
        description="Holistic coaching effectiveness score from 0 (ineffective) to 10 (excellent).",
    )
    strengths: list[str] = Field(
        ...,
        min_length=1,
        description="Specific things the coach did well.",
    )
    improvement_areas: list[str] = Field(
        default_factory=list,
        description="Areas where the coaching approach could be strengthened.",
    )
    techniques_used: list[str] = Field(
        default_factory=list,
        description="Named coaching techniques or frameworks identified (e.g. 'motivational interviewing', 'SMART goals').",
    )

    @field_validator("effectiveness_score")
    @classmethod
    def round_score(cls, v: float) -> float:
        return round(v, 2)


class HealthTopicCoverage(BaseModel):
    """Topics discussed and their relative depth."""

    primary_topics: list[str] = Field(
        ...,
        min_length=1,
        description="Main health topics that received substantial discussion time.",
    )
    secondary_topics: list[str] = Field(
        default_factory=list,
        description="Topics mentioned briefly or tangentially.",
    )
    missing_topics: list[str] = Field(
        default_factory=list,
        description="Topics that would have been beneficial to cover but were absent.",
    )
    topic_depth_assessment: str = Field(
        ...,
        description="Qualitative assessment of how thoroughly topics were explored.",
    )


class ActionItems(BaseModel):
    """Concrete next steps and commitments extracted from the conversation."""

    client_commitments: list[str] = Field(
        default_factory=list,
        description="Actions the client committed to taking.",
    )
    coach_follow_ups: list[str] = Field(
        default_factory=list,
        description="Actions the coach committed to or should follow up on.",
    )
    suggested_resources: list[str] = Field(
        default_factory=list,
        description="Resources, tools, or materials recommended during the session.",
    )
    next_session_focus: str | None = Field(
        None,
        description="Recommended focus area for the next coaching session, or null if not determinable.",
    )


class RiskFlags(BaseModel):
    """Potential concerns requiring human review or escalation."""

    overall_risk_level: RiskLevel = Field(
        ..., description="Aggregate risk level for this conversation."
    )
    flags: list[str] = Field(
        default_factory=list,
        description=(
            "Specific risk indicators identified "
            "(e.g. 'client mentioned food restriction patterns', "
            "'expressed hopelessness about progress')."
        ),
    )
    requires_escalation: bool = Field(
        ...,
        description="True if any flag warrants immediate human review or clinical referral.",
    )
    escalation_reason: str | None = Field(
        None,
        description="Explanation of why escalation is recommended, or null if not required.",
    )

    @model_validator(mode="after")
    def escalation_reason_required_when_flagged(self) -> RiskFlags:
        if self.requires_escalation and not self.escalation_reason:
            raise ValueError(
                "`escalation_reason` must be provided when `requires_escalation` is True."
            )
        return self


class ProgressAssessment(BaseModel):
    """Client's progress towards their stated health goals."""

    status: ProgressStatus = Field(
        ..., description="Overall progress classification."
    )
    progress_indicators: list[str] = Field(
        default_factory=list,
        description="Evidence from the conversation supporting the progress assessment.",
    )
    goal_adherence_score: float = Field(
        ...,
        ge=0.0,
        le=10.0,
        description="Estimated adherence to previously set goals (0 = no adherence, 10 = full adherence).",
    )
    barriers_to_progress: list[str] = Field(
        default_factory=list,
        description="Identified obstacles preventing the client from achieving their goals.",
    )

    @field_validator("goal_adherence_score")
    @classmethod
    def round_score(cls, v: float) -> float:
        return round(v, 2)


class ConversationMetrics(BaseModel):
    """Quantitative metadata about the conversation itself."""

    estimated_duration_minutes: float | None = Field(
        None,
        ge=0,
        description="Estimated conversation length in minutes, or null if not calculable.",
    )
    turn_count: int = Field(
        ...,
        ge=1,
        description="Total number of speaker turns detected.",
    )
    coach_talk_ratio: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Fraction of total turns attributable to the coach (0.0–1.0).",
    )
    question_count: int = Field(
        ...,
        ge=0,
        description="Number of questions posed by the coach.",
    )
    rapport_score: float = Field(
        ...,
        ge=0.0,
        le=10.0,
        description="Assessed quality of the coach–client rapport (0 = poor, 10 = excellent).",
    )

    @field_validator("coach_talk_ratio")
    @classmethod
    def round_ratio(cls, v: float) -> float:
        return round(v, 4)

    @field_validator("rapport_score")
    @classmethod
    def round_rapport(cls, v: float) -> float:
        return round(v, 2)


# ---------------------------------------------------------------------------
# Health metrics — domain-specific adherence tracking
# ---------------------------------------------------------------------------


class HealthMetricDetail(BaseModel):
    """
    A single health metric extracted directly from the conversation.

    classification distinguishes the epistemic status of the data:
      confirmed_fact  — verified by objective evidence (e.g. wearable data the client read aloud)
      client_report   — self-reported by the client without external verification
      ai_inference    — inferred by the AI from behavioral cues or context
      unavailable     — the topic was not discussed; score will be null
    """

    score: float | None = Field(
        None,
        ge=0.0,
        le=10.0,
        description=(
            "Estimated adherence/quality on a 0–10 scale. "
            "Must be null when classification is 'unavailable'."
        ),
    )
    raw_value: str | None = Field(
        None,
        description=(
            "Literal value mentioned in the conversation "
            "(e.g. '6.5 hours', '2 litres', '8,000 steps/day'). "
            "Null if no specific value was stated."
        ),
    )
    classification: HealthMetricClassification = Field(
        ...,
        description="Epistemic status of this metric.",
    )
    evidence: str | None = Field(
        None,
        description=(
            "Verbatim quote or behavioral observation from the transcript "
            "that justifies the score and classification. "
            "Null only when classification is 'unavailable'."
        ),
    )

    @model_validator(mode="after")
    def score_null_when_unavailable(self) -> HealthMetricDetail:
        if self.classification == HealthMetricClassification.UNAVAILABLE and self.score is not None:
            raise ValueError(
                "score must be null when classification is 'unavailable'."
            )
        if self.classification != HealthMetricClassification.UNAVAILABLE and self.score is None:
            raise ValueError(
                "score must be provided when classification is not 'unavailable'."
            )
        return self


class HealthMetrics(BaseModel):
    """
    Domain-specific health metric extraction.

    Each field covers one of the five core FUME tracking dimensions.
    Use classification='unavailable' and score=null if the topic was not discussed.
    """

    nutrition_adherence: HealthMetricDetail = Field(
        ...,
        description=(
            "How well the client is following their nutrition plan. "
            "Score 0 = eating plan completely ignored; 10 = fully on plan."
        ),
    )
    exercise_activity: HealthMetricDetail = Field(
        ...,
        description=(
            "Physical activity level relative to agreed targets. "
            "Include steps, sessions, or activity type if mentioned. "
            "Score 0 = completely sedentary; 10 = exceeding targets."
        ),
    )
    sleep_quality: HealthMetricDetail = Field(
        ...,
        description=(
            "Sleep quantity and quality. "
            "Include hours/night if stated. "
            "Score 0 = severely disrupted; 10 = optimal."
        ),
    )
    water_intake: HealthMetricDetail = Field(
        ...,
        description=(
            "Hydration level relative to recommended intake. "
            "Include litres/day if mentioned. "
            "Score 0 = severely dehydrated/no tracking; 10 = optimal hydration."
        ),
    )
    stress_symptoms: HealthMetricDetail = Field(
        ...,
        description=(
            "Stress and symptom burden. NOTE: high score = high stress/symptoms. "
            "Score 0 = no stress or symptoms; 10 = severe, debilitating stress/symptoms."
        ),
    )


# ---------------------------------------------------------------------------
# Top-level response model
# ---------------------------------------------------------------------------


class AnalysisReport(BaseModel):
    """
    Complete structured analysis of a health coaching conversation.
    This is the single source of truth for the POST /analyze response contract.
    """

    analysis_version: str = Field(
        "1.0.0",
        description="Schema version for forward-compatibility tracking.",
    )
    client_profile: ClientProfile
    sentiment_analysis: SentimentAnalysis
    coaching_effectiveness: CoachingEffectiveness
    health_topic_coverage: HealthTopicCoverage
    health_metrics: HealthMetrics
    action_items: ActionItems
    risk_flags: RiskFlags
    progress_assessment: ProgressAssessment
    conversation_metrics: ConversationMetrics
    executive_summary: str = Field(
        ...,
        min_length=100,
        max_length=1_000,
        description=(
            "2–4 sentence human-readable summary of the session suitable "
            "for a clinical supervisor or programme manager."
        ),
    )
    key_insights: list[str] = Field(
        ...,
        min_length=2,
        max_length=8,
        description="Most important analytical observations, ordered by significance.",
    )
    recommendations: list[str] = Field(
        ...,
        min_length=1,
        max_length=6,
        description="Prioritised, actionable recommendations for the coaching team.",
    )

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# API envelope models
# ---------------------------------------------------------------------------


class AnalyzeResponse(BaseModel):
    """Successful response envelope returned by POST /analyze."""

    success: bool = True
    data: AnalysisReport


class ErrorDetail(BaseModel):
    """Structured error payload."""

    code: str = Field(..., description="Machine-readable error code.")
    message: str = Field(..., description="Human-readable description.")
    details: dict | None = Field(None, description="Optional extra context.")


class ErrorResponse(BaseModel):
    """Error response envelope."""

    success: bool = False
    error: ErrorDetail