# GenAI Client Intelligence Platform

An AI pipeline that analyzes health coaching conversations and returns a structured JSON intelligence report. Built with FastAPI, Pydantic v2, and Groq Claude.

---

## Architecture

```
POST /analyze
      │
      ▼
 AnalyzeRequest          (schema.py)      — Pydantic input validation
      │
      ▼
 LLMClient.analyze()     (llm.py)         — Orchestrates the full pipeline
  ├── build_system_prompt()  (prompt.py)  — Engineered system prompt
  ├── build_user_prompt()    (prompt.py)  — Transcript wrapper + CoT instructions
  ├── _call_api()            (llm.py)     — Groq API + API retry loop
  ├── _extract_json()        (llm.py)     — Defensive JSON extraction
  ├── validate_analysis_report() (validator.py) — Schema + business rules
  └── Retry loop (up to max_validation_retries)
      │
      ▼
 AnalyzeResponse          (schema.py)     — Structured JSON report
```

### Module responsibilities

| File | Responsibility |
|---|---|
| `main.py` | Entry point; logging init; Uvicorn config |
| `api.py` | FastAPI app factory; middleware; endpoint; error handling |
| `llm.py` | LLM client; dual retry loops; JSON extraction; observability |
| `prompt.py` | System prompt; user prompt; enum injection |
| `validator.py` | Two-pass validation: Pydantic + cross-field business rules |
| `schema.py` | All Pydantic models; enums; request/response contracts |
| `utils.py` | Settings; structured logging; Timer; request ID context |

---

## Quick Start

### 1. Prerequisites

- Python 3.12+
- An [Groq API key](https://console.groq.com/)

### 2. Install

```bash
git clone <repo-url>
cd genai-client-intelligence

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

### 3. Configure

```bash
cp example.env .env
# Edit .env and set Groq_API_KEY=sk-ant-...
```

### 4. Run

```bash
# Development (human-readable logs, auto-reload)
APP_ENV=development LOG_JSON=false APP_DEBUG=true python -m app.main

# Production
python -m app.main
```

The API will be available at `http://localhost:8000`.

---

## API Reference

### `POST /analyze`

Analyze a health coaching conversation transcript.

**Request**

```json
{
  "conversation": "Coach: How have you been feeling this week? ..."
}
```

| Field | Type | Constraints |
|---|---|---|
| `conversation` | `string` | 50–32,000 characters |

**Response — 200 OK**

```json
{
  "success": true,
  "data": {
    "analysis_version": "1.0.0",
    "client_profile": {
      "confidence": 0.85,
      "inferred_age_range": "35-45",
      "health_goals": ["lose 10kg", "improve sleep quality"],
      "current_challenges": ["late-night snacking", "inconsistent exercise schedule"],
      "motivational_drivers": ["wanting more energy for children", "upcoming holiday"],
      "health_literacy_level": "medium"
    },
    "sentiment_analysis": {
      "confidence": 0.91,
      "overall_sentiment": "positive",
      "sentiment_score": 0.6200,
      "client_sentiment": "positive",
      "coach_sentiment": "positive",
      "emotional_peaks": ["Client expressed frustration about weekend slip"],
      "sentiment_trajectory": "Started cautiously, became increasingly positive as session progressed"
    },
    "coaching_effectiveness": {
      "confidence": 0.88,
      "coaching_style": "motivational",
      "engagement_level": "high",
      "effectiveness_score": 8.25,
      "strengths": ["Consistent use of open questions", "Reflected emotions before advice"],
      "improvement_areas": ["Could explore client barriers more deeply"],
      "techniques_used": ["motivational interviewing", "SMART goal setting"]
    },
    "health_topic_coverage": { "..." : "..." },
    "action_items": { "..." : "..." },
    "risk_flags": {
      "confidence": 0.95,
      "overall_risk_level": "none",
      "flags": [],
      "requires_escalation": false,
      "escalation_reason": null
    },
    "progress_assessment": { "..." : "..." },
    "conversation_metrics": {
      "confidence": 0.82,
      "estimated_duration_minutes": 45.0,
      "turn_count": 38,
      "coach_talk_ratio": 0.4200,
      "question_count": 14,
      "rapport_score": 8.50
    },
    "executive_summary": "A productive session in which the client demonstrated strong commitment to their weight loss goal...",
    "key_insights": [
      "Client shows high intrinsic motivation linked to family",
      "Weekend routine is the primary barrier to progress"
    ],
    "recommendations": [
      "Develop a specific weekend meal-prep strategy with client",
      "Introduce sleep hygiene protocol at next session"
    ]
  }
}
```

**Error Responses**

| Status | Code | Cause |
|---|---|---|
| 422 | `REQUEST_VALIDATION_ERROR` | Conversation too short/long or missing |
| 429 | `LLM_API_ERROR` | Groq rate limit hit |
| 502 | `LLM_API_ERROR` | Groq API unreachable |
| 503 | `LLM_VALIDATION_EXHAUSTED` | LLM failed to return valid output after retries |

```json
{
  "success": false,
  "error": {
    "code": "LLM_VALIDATION_EXHAUSTED",
    "message": "The AI pipeline could not produce a valid structured response after multiple attempts. Please retry.",
    "details": { "attempts": 3 }
  }
}
```

### `GET /health`

Liveness probe. Returns `{"status": "ok"}` with HTTP 200.

---

## Report Schema Reference

### Enums

| Field | Allowed values |
|---|---|
| `sentiment` | `positive` `neutral` `negative` `mixed` |
| `engagement_level` | `high` `medium` `low` |
| `risk_level` | `high` `medium` `low` `none` |
| `coaching_style` | `motivational` `directive` `collaborative` `educational` `supportive` `mixed` |
| `progress_status` | `on_track` `at_risk` `stalled` `regressed` `breakthrough` `insufficient_data` |

### Confidence scores

Every section includes a `confidence` float (0.0–1.0) reflecting how much textual evidence supports the analysis. Low confidence on sparse transcripts is correct and expected behavior — it is not a failure.

### Risk escalation

`risk_flags.requires_escalation: true` is set when any of the following signals are detected:

- Suicidal ideation or self-harm intent
- Active abuse disclosure
- Disordered eating patterns
- Symptoms requiring urgent medical attention
- Coach boundary violations or clinical overreach

When `requires_escalation` is `true`, `escalation_reason` is always populated with a plain-English explanation for the clinical supervisor.

---

## Retry Behavior

The pipeline runs two independent retry loops:

1. **API retries** (default 3): exponential back-off for transient Groq errors (rate limits, timeouts, 5xx)
2. **Validation retries** (default 3): targeted correction feedback when the LLM returns structurally invalid output

On validation retry, the model receives its previous (failed) response and a precise description of the validation error, enabling surgical self-correction rather than blind regeneration.

---

## Configuration Reference

All settings are read from environment variables or `.env`. See `example.env` for the full list.

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | *(required)* | Groq API key |
| `LLM_MODEL` | `llama-3.3-70b-versatile` | Groq model identifier |
| `LLM_MAX_TOKENS` | `4096` | Max output tokens |
| `LLM_TEMPERATURE` | `0.1` | Sampling temperature |
| `LLM_MAX_VALIDATION_RETRIES` | `3` | Retries for invalid LLM output |
| `LLM_MAX_API_RETRIES` | `3` | Retries for transient API errors |
| `LLM_REQUEST_TIMEOUT` | `120.0` | Per-request timeout (seconds) |
| `APP_ENV` | `production` | `production` / `staging` / `development` |
| `APP_PORT` | `8000` | Server port |
| `APP_DEBUG` | `false` | Enable auto-reload (development only) |
| `LOG_LEVEL` | `INFO` | Log verbosity |
| `LOG_JSON` | `true` | Structured JSON logs |

---

## Development

```bash
# Run with human-readable logs and auto-reload
APP_ENV=development LOG_JSON=false APP_DEBUG=true python -m app.main

# Interactive API docs (disabled in production)
open http://localhost:8000/docs
```

---

## Security Notes

- The full conversation transcript is **never logged** — only a 200-character sanitised preview.
- API docs (`/docs`, `/redoc`, `/openapi.json`) are disabled when `APP_ENV=production`.
- `GROQ_API_KEY` is read exclusively via `pydantic-settings` and never appears in logs.
- `.env` is in `.gitignore` — never commit secrets to source control.
