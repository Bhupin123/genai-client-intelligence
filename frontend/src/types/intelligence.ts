export type Classification =
  | "confirmed_fact"
  | "client_report"
  | "coach_observation"
  | "ai_inference"
  | "missing_information";

export type Confidence = "high" | "medium" | "low";

export type ReviewStatus = "pending" | "approved" | "edited" | "rejected";

export interface EvidenceExcerpt {
  speaker: "coach" | "client";
  text: string;
  timestamp?: string;
}

export interface Insight {
  id: string;
  title: string;
  detail: string;
  classification: Classification;
  confidence: Confidence;
  evidence: EvidenceExcerpt[];
  reviewStatus?: ReviewStatus;
}

export interface SectionData {
  id: string;
  title: string;
  summary?: string;
  insights: Insight[];
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  category: string;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface IntelligenceReport {
  meta: {
    clientName: string;
    conversationDate: string;
    generatedAt: string;
    processingTimeMs: number;
    overallConfidence: Confidence;
  };
  metrics: {
    nutrition: number;
    exercise: number;
    sleep: number;
    hydration: number;
    stress: number;
    engagement: number;
  };
  weeklySummary: string;
  sections: SectionData[];
  timeline: TimelineEvent[];
  trends: {
    weeklyHabits: { label: string; nutrition: number; exercise: number; sleep: number }[];
    progress: TrendPoint[];
    sleep: TrendPoint[];
    water: TrendPoint[];
  };
  missingInformation: string[];
  keyBarriers: string[];
  pendingActions: string[];
  riskFlags: { level: "high" | "medium" | "low"; message: string }[];
  recommendations: string[];
}
