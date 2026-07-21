import type {
  Classification,
  Confidence,
  EvidenceExcerpt,
  IntelligenceReport,
  Insight,
  SectionData,
} from "@/types/intelligence";
import { MOCK_REPORT } from "./mockData";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a 0–10 backend score to 0–100 display percentage. */
function toPercent(score: number | null | undefined, fallback = 50): number {
  return score != null ? Math.round((score / 10) * 100) : fallback;
}

/**
 * Build an Insight from a plain text item.
 * evidenceText + evidenceSpeaker populate the collapsible evidence panel.
 */
function makeInsight(
  id: string,
  title: string,
  detail: string,
  classification: Classification,
  confidence: Confidence,
  evidenceText?: string | null,
  evidenceSpeaker: "coach" | "client" = "client",
): Insight {
  const evidence: EvidenceExcerpt[] = evidenceText
    ? [{ speaker: evidenceSpeaker, text: evidenceText }]
    : [];
  return { id, title, detail: detail || title, classification, confidence, evidence };
}

// ---------------------------------------------------------------------------
// Health-metric section builder
// ---------------------------------------------------------------------------

interface RawMetricDetail {
  score: number | null;
  raw_value: string | null;
  classification: string;
  evidence: string | null;
}

function classificationFromMetric(raw: string): Classification {
  const map: Record<string, Classification> = {
    confirmed_fact: "confirmed_fact",
    client_report: "client_report",
    ai_inference: "ai_inference",
    unavailable: "missing_information",
  };
  return map[raw] ?? "ai_inference";
}

function confidenceFromScore(score: number | null): Confidence {
  if (score == null) return "low";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function buildHealthMetricInsights(
  hm: Record<string, RawMetricDetail>,
): Insight[] {
  const entries: Array<{ key: string; label: string }> = [
    { key: "nutrition_adherence", label: "Nutrition Adherence" },
    { key: "exercise_activity", label: "Exercise / Activity" },
    { key: "sleep_quality", label: "Sleep Quality" },
    { key: "water_intake", label: "Water Intake" },
    { key: "stress_symptoms", label: "Stress / Symptoms" },
  ];

  return entries.map(({ key, label }, idx) => {
    const m = hm[key] as RawMetricDetail | undefined;
    if (!m) {
      return makeInsight(
        `hm-${idx}`,
        label,
        "Not discussed in this session.",
        "missing_information",
        "low",
      );
    }

    const detail = m.raw_value
      ? `${label}: ${m.raw_value}`
      : m.classification === "unavailable"
        ? "Not discussed in this session."
        : `Score: ${m.score?.toFixed(1) ?? "N/A"}/10`;

    return makeInsight(
      `hm-${idx}`,
      label,
      detail,
      classificationFromMetric(m.classification),
      confidenceFromScore(m.score),
      m.evidence,
      "client",
    );
  });
}

// ---------------------------------------------------------------------------
// Main transformer
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformBackendReport(data: any, processingTimeMs: number): IntelligenceReport {
  const s  = data.sentiment_analysis;
  const e  = data.coaching_effectiveness;
  const p  = data.progress_assessment;
  const m  = data.conversation_metrics;
  const hm = data.health_metrics as Record<string, RawMetricDetail> | undefined;

  // ---------------------------------------------------------------------------
  // Metrics — sourced from health_metrics when available; proxy only as fallback
  // ---------------------------------------------------------------------------

  const nutrition = toPercent(
    hm?.nutrition_adherence?.score,
    Math.round(((s.sentiment_score + 1) / 2) * 60 + 20),
  );
  const exercise = toPercent(
    hm?.exercise_activity?.score,
    Math.round((p.goal_adherence_score / 10) * 100),
  );
  const sleep = toPercent(hm?.sleep_quality?.score, 50);
  const hydration = toPercent(
    hm?.water_intake?.score,
    Math.round((m.rapport_score / 10) * 60 + 20),
  );
  const stress = toPercent(
    hm?.stress_symptoms?.score,
    Math.round((1 - (s.sentiment_score + 1) / 2) * 100),
  );
  const engagement =
    e.engagement_level === "high" ? 85 : e.engagement_level === "medium" ? 55 : 30;

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------

  const sections: SectionData[] = [
    {
      id: "executive-summary",
      title: "Executive Summary",
      summary: data.executive_summary,
      insights: (data.key_insights as string[]).map((text, i) =>
        makeInsight(`ki-${i}`, text.slice(0, 60), text, "ai_inference", "medium"),
      ),
    },

    {
      id: "client-profile",
      title: "Client Profile",
      insights: [
        ...(data.client_profile.health_goals as string[]).map((g, i) =>
          makeInsight(`goal-${i}`, "Health Goal", g, "client_report", "high"),
        ),
        ...(data.client_profile.current_challenges as string[]).map((c, i) =>
          makeInsight(`challenge-${i}`, "Key Barrier", c, "client_report", "high"),
        ),
        ...(data.client_profile.motivational_drivers as string[]).map((d, i) =>
          makeInsight(`driver-${i}`, "Motivational Driver", d, "ai_inference", "medium"),
        ),
      ],
    },

    {
      id: "health-metrics",
      title: "Health Metrics",
      summary: "Domain-specific adherence extracted from the conversation.",
      insights: hm ? buildHealthMetricInsights(hm) : [],
    },

    {
      id: "sentiment",
      title: "Sentiment Analysis",
      summary: s.sentiment_trajectory,
      insights: (s.emotional_peaks as string[]).map((ep, i) =>
        makeInsight(`ep-${i}`, "Emotional Peak", ep, "ai_inference", "medium"),
      ),
    },

    {
      id: "coaching-effectiveness",
      title: "Coaching Effectiveness",
      summary: `Style: ${e.coaching_style} · Score: ${e.effectiveness_score}/10`,
      insights: [
        ...(e.strengths as string[]).map((str, i) =>
          makeInsight(`strength-${i}`, "Coach Strength", str, "confirmed_fact", "high"),
        ),
        ...(e.improvement_areas as string[]).map((a, i) =>
          makeInsight(`improve-${i}`, "Improvement Area", a, "ai_inference", "medium"),
        ),
        ...(e.techniques_used as string[]).map((t, i) =>
          makeInsight(`technique-${i}`, "Technique Used", t, "confirmed_fact", "high"),
        ),
      ],
    },

    {
      id: "health-topics",
      title: "Health Topic Coverage",
      summary: data.health_topic_coverage.topic_depth_assessment,
      insights: [
        ...(data.health_topic_coverage.primary_topics as string[]).map((t, i) =>
          makeInsight(`topic-${i}`, "Primary Topic", t, "confirmed_fact", "high"),
        ),
        ...(data.health_topic_coverage.missing_topics as string[]).map((t, i) =>
          makeInsight(`missing-${i}`, "Missing Topic", t, "missing_information", "medium"),
        ),
      ],
    },

    {
      id: "action-items",
      title: "Action Items",
      summary: data.action_items.next_session_focus
        ? `Next session focus: ${data.action_items.next_session_focus}`
        : undefined,
      insights: [
        ...(data.action_items.client_commitments as string[]).map((c, i) =>
          makeInsight(`commit-${i}`, "Client Commitment", c, "client_report", "high", c, "client"),
        ),
        ...(data.action_items.coach_follow_ups as string[]).map((f, i) =>
          makeInsight(`followup-${i}`, "Coach Follow-up", f, "confirmed_fact", "high", f, "coach"),
        ),
        ...(data.action_items.suggested_resources as string[]).map((r, i) =>
          makeInsight(`resource-${i}`, "Suggested Resource", r, "ai_inference", "medium"),
        ),
      ],
    },

    {
      id: "progress",
      title: "Progress Assessment",
      summary: `Status: ${p.status.replace(/_/g, " ")} · Adherence: ${p.goal_adherence_score}/10`,
      insights: [
        ...(p.progress_indicators as string[]).map((pi, i) =>
          makeInsight(`progress-${i}`, "Progress Indicator", pi, "ai_inference", "medium"),
        ),
        ...(p.barriers_to_progress as string[]).map((b, i) =>
          makeInsight(`barrier-${i}`, "Barrier to Progress", b, "client_report", "medium"),
        ),
      ],
    },

    {
      id: "risk-flags",
      title: "Risk Flags",
      summary: `Risk level: ${data.risk_flags.overall_risk_level}${
        data.risk_flags.requires_escalation ? " · ESCALATION REQUIRED" : ""
      }`,
      insights: (data.risk_flags.flags as string[]).map((f, i) =>
        makeInsight(`risk-${i}`, "Risk Flag", f, "ai_inference", "high", f, "client"),
      ),
    },

    {
      id: "recommendations",
      title: "Recommended Next Actions",
      summary: "Prioritised actions for the coaching team.",
      insights: (data.recommendations as string[]).map((r, i) =>
        makeInsight(`rec-${i}`, `Recommendation ${i + 1}`, r, "ai_inference", "high"),
      ),
    },
  ];

  // ---------------------------------------------------------------------------
  // Trend data — W1–W3 are placeholders; W4 reflects actual session analysis
  // ---------------------------------------------------------------------------

  const weeklyHabits = [
    { label: "W1 (est.)", nutrition: 60, exercise: 55, sleep: 58 },
    { label: "W2 (est.)", nutrition: 65, exercise: 60, sleep: 62 },
    { label: "W3 (est.)", nutrition: 70, exercise: 65, sleep: 67 },
    { label: "W4 (this session)", nutrition, exercise, sleep },
  ];

  // ---------------------------------------------------------------------------
  // Confidence
  // ---------------------------------------------------------------------------

  const avgConfidence =
    (s.confidence + e.confidence + p.confidence + m.confidence) / 4;
  const overallConfidence: Confidence =
    avgConfidence >= 0.7 ? "high" : avgConfidence >= 0.4 ? "medium" : "low";

  return {
    meta: {
      clientName: data.client_profile.inferred_age_range
        ? `Anonymous Client (est. ${data.client_profile.inferred_age_range})`
        : "Anonymous Client",
      conversationDate: new Date().toISOString().split("T")[0],
      generatedAt: new Date().toISOString(),
      processingTimeMs,
      overallConfidence,
    },
    metrics: { nutrition, exercise, sleep, hydration, stress, engagement },
    weeklySummary: data.executive_summary,
    sections,

    // FIX — every timeline entry now has a stable `id` field
    timeline: (data.action_items.client_commitments as string[]).map((c, i) => ({
      id: `tl-commit-${i}`,   // <-- was missing; caused key={ev.id} to be undefined
      date: new Date().toISOString().split("T")[0],
      title: `Commitment ${i + 1}`,
      description: c,
      category: "action",
    })),

    trends: {
      weeklyHabits,
      progress: [
        { label: "W1 (est.)", value: 50 },
        { label: "W2 (est.)", value: 55 },
        { label: "W3 (est.)", value: 60 },
        { label: "W4", value: toPercent(p.goal_adherence_score) },
      ],
      sleep: [
        { label: "W1 (est.)", value: 6 },
        { label: "W2 (est.)", value: 6.5 },
        { label: "W3 (est.)", value: 7 },
        {
          label: "W4",
          value:
            hm?.sleep_quality?.score != null
              ? Math.round((hm.sleep_quality.score / 10) * 9)
              : Math.round((sleep / 100) * 9),
        },
      ],
      water: [
        { label: "W1 (est.)", value: 4 },
        { label: "W2 (est.)", value: 5 },
        { label: "W3 (est.)", value: 6 },
        {
          label: "W4",
          value:
            hm?.water_intake?.score != null
              ? parseFloat((hm.water_intake.score / 10 * 3).toFixed(1))
              : Math.round((hydration / 100) * 3 * 10) / 10,
        },
      ],
    },
    missingInformation: data.health_topic_coverage.missing_topics as string[],
    keyBarriers: data.client_profile.current_challenges as string[],
    pendingActions: [
      ...(data.action_items.client_commitments as string[]),
      ...(data.action_items.coach_follow_ups as string[]),
    ],
    riskFlags: (data.risk_flags.flags as string[]).map((f) => ({
      level:
        data.risk_flags.overall_risk_level === "none"
          ? "low"
          : (data.risk_flags.overall_risk_level as "high" | "medium" | "low"),
      message: f,
    })),
    recommendations: data.recommendations as string[],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function analyzeConversation(
  conversation: string,
): Promise<IntelligenceReport> {
  if (!API_BASE) {
    await new Promise((r) => setTimeout(r, 1600));
    return { ...MOCK_REPORT };
  }

  const start = Date.now();
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `Analyze failed: ${res.status}`;
    throw new Error(msg);
  }
  const json = await res.json();
  return transformBackendReport(json.data, Date.now() - start);
}

// ---------------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "ci_report";

export function saveReport(report: IntelligenceReport): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(report));
  } catch {
    // sessionStorage may be unavailable (private mode, quota exceeded)
  }
}

export function loadReport(): IntelligenceReport | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as IntelligenceReport) : null;
  } catch {
    return null;
  }
}