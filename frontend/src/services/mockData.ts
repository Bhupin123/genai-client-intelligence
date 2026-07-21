import type { IntelligenceReport } from "@/types/intelligence";

export const SAMPLE_CONVERSATION = `Coach: Hey Sarah, how was your week? Let's go through it.
Client: Honestly, it was rough. Work has been insane and I barely slept.
Coach: I'm sorry to hear that. How many hours were you getting on average?
Client: Maybe 5 hours, and it was really broken up. I woke up around 3am most nights.
Coach: That's tough. And how did that affect your eating?
Client: I stress-ate a lot. Lots of takeout - pizza twice, and I skipped breakfast most days because I was rushing.
Coach: Got it. Did you manage any workouts?
Client: I made it to the gym twice - Monday and Thursday. Both were strength sessions. But I didn't hit my step goal any day. Probably averaged 4,000 steps.
Coach: Water?
Client: Not great. Maybe 3-4 glasses a day. I know, I know.
Coach: No judgment. Any symptoms this week?
Client: Yeah - persistent headaches by the afternoon, and my lower back has been really tight.
Coach: The headaches could be tied to hydration and sleep. Let's watch that. How's your mood?
Client: Anxious. I'm behind on a project and I feel like I'm failing at everything, including this.
Coach: You're not failing. You showed up here and you got two workouts in during a hard week. That matters.
Client: Thanks. I want to do better next week.
Coach: Let's set two small commitments: 7 hours of sleep at least 4 nights, and 2 liters of water daily. Sound doable?
Client: Yes, I can commit to that.
Coach: Great. I'll check in Wednesday.`;

export const MOCK_REPORT: IntelligenceReport = {
  meta: {
    clientName: "Sarah Chen",
    conversationDate: "2026-07-18",
    generatedAt: "2026-07-20T09:14:22Z",
    processingTimeMs: 3820,
    overallConfidence: "high",
  },
  metrics: {
    nutrition: 42,
    exercise: 58,
    sleep: 31,
    hydration: 38,
    stress: 78,
    engagement: 82,
  },
  weeklySummary:
    "Sarah had a high-stress work week that disrupted sleep, hydration, and nutrition. She maintained baseline exercise (2 strength sessions) and remains highly engaged in the program despite setbacks. Sleep deprivation and dehydration are likely driving the reported headaches.",
  sections: [
    {
      id: "nutrition",
      title: "Nutrition",
      summary: "Irregular meals with elevated processed food intake.",
      insights: [
        {
          id: "n1",
          title: "Skipped breakfast most days",
          detail:
            "Client reports skipping breakfast on the majority of weekdays due to time pressure.",
          classification: "client_report",
          confidence: "high",
          evidence: [
            {
              speaker: "client",
              text: "I skipped breakfast most days because I was rushing.",
            },
          ],
        },
        {
          id: "n2",
          title: "Two pizza meals this week",
          detail:
            "Elevated processed food and refined carb intake driven by work stress.",
          classification: "confirmed_fact",
          confidence: "high",
          evidence: [{ speaker: "client", text: "Lots of takeout - pizza twice" }],
        },
        {
          id: "n3",
          title: "Stress-driven eating pattern",
          detail:
            "Emotional eating behavior correlated with elevated work stressors.",
          classification: "ai_inference",
          confidence: "medium",
          evidence: [
            { speaker: "client", text: "I stress-ate a lot." },
            { speaker: "client", text: "Work has been insane" },
          ],
        },
      ],
    },
    {
      id: "exercise",
      title: "Exercise & Steps",
      summary: "Consistent strength work; low ambient activity.",
      insights: [
        {
          id: "e1",
          title: "Two strength sessions completed",
          detail: "Monday and Thursday sessions logged despite high-stress week.",
          classification: "confirmed_fact",
          confidence: "high",
          evidence: [
            {
              speaker: "client",
              text: "I made it to the gym twice - Monday and Thursday. Both were strength sessions.",
            },
          ],
        },
        {
          id: "e2",
          title: "Step goal missed every day",
          detail: "Averaged ~4,000 steps/day vs 8,000 target.",
          classification: "client_report",
          confidence: "high",
          evidence: [
            {
              speaker: "client",
              text: "I didn't hit my step goal any day. Probably averaged 4,000 steps.",
            },
          ],
        },
      ],
    },
    {
      id: "sleep",
      title: "Sleep",
      summary: "Severe sleep deprivation with fragmentation.",
      insights: [
        {
          id: "s1",
          title: "Averaging 5 hours of sleep",
          detail:
            "Well below 7-9 hour recommendation. Duration is a primary concern.",
          classification: "client_report",
          confidence: "high",
          evidence: [
            { speaker: "client", text: "Maybe 5 hours, and it was really broken up." },
          ],
        },
        {
          id: "s2",
          title: "Frequent 3am wakeups",
          detail:
            "Consistent middle-of-night awakening pattern suggests stress-related sleep fragmentation.",
          classification: "coach_observation",
          confidence: "medium",
          evidence: [
            { speaker: "client", text: "I woke up around 3am most nights." },
          ],
        },
      ],
    },
    {
      id: "hydration",
      title: "Water Intake",
      summary: "Chronically under-hydrated.",
      insights: [
        {
          id: "w1",
          title: "3-4 glasses per day",
          detail:
            "Estimated ~800ml, well below 2L target. Likely contributor to headaches.",
          classification: "client_report",
          confidence: "high",
          evidence: [{ speaker: "client", text: "Maybe 3-4 glasses a day." }],
        },
      ],
    },
    {
      id: "symptoms",
      title: "Symptoms",
      summary: "Two active physical symptoms reported this week.",
      insights: [
        {
          id: "sy1",
          title: "Afternoon headaches",
          detail:
            "Persistent afternoon headaches likely tied to dehydration and sleep loss.",
          classification: "client_report",
          confidence: "high",
          evidence: [
            { speaker: "client", text: "persistent headaches by the afternoon" },
          ],
        },
        {
          id: "sy2",
          title: "Lower back tightness",
          detail: "May correlate with reduced movement and prolonged sitting.",
          classification: "client_report",
          confidence: "high",
          evidence: [
            { speaker: "client", text: "my lower back has been really tight" },
          ],
        },
      ],
    },
    {
      id: "stress",
      title: "Stress & Mood",
      summary: "Elevated anxiety with self-critical framing.",
      insights: [
        {
          id: "st1",
          title: "Elevated anxiety, feelings of failure",
          detail:
            "Client verbalizes anxiety and self-critical framing around progress.",
          classification: "client_report",
          confidence: "high",
          evidence: [
            {
              speaker: "client",
              text: "Anxious. I'm behind on a project and I feel like I'm failing at everything.",
            },
          ],
        },
      ],
    },
    {
      id: "engagement",
      title: "Engagement Level",
      summary: "High engagement despite a difficult week.",
      insights: [
        {
          id: "en1",
          title: "High engagement despite setbacks",
          detail:
            "Client showed up, was transparent, and committed to two specific goals for next week.",
          classification: "coach_observation",
          confidence: "high",
          evidence: [
            { speaker: "client", text: "I want to do better next week." },
            { speaker: "client", text: "Yes, I can commit to that." },
          ],
        },
      ],
    },
    {
      id: "barriers",
      title: "Key Barriers",
      summary: "Work pressure is the primary driver of all setbacks this week.",
      insights: [
        {
          id: "b1",
          title: "Work-related time pressure",
          detail:
            "Primary driver of skipped meals, low movement, and disrupted sleep.",
          classification: "ai_inference",
          confidence: "high",
          evidence: [
            { speaker: "client", text: "Work has been insane" },
            { speaker: "client", text: "I'm behind on a project" },
          ],
        },
      ],
    },
    {
      id: "actions",
      title: "Pending Actions",
      summary: "Two client commitments and one coach touchpoint scheduled.",
      insights: [
        {
          id: "a1",
          title: "Commit to 7+ hours sleep, 4 nights/week",
          detail: "Agreed-upon commitment for the coming week.",
          classification: "confirmed_fact",
          confidence: "high",
          evidence: [
            { speaker: "coach", text: "7 hours of sleep at least 4 nights" },
          ],
        },
        {
          id: "a2",
          title: "2L water daily",
          detail: "Agreed hydration target for the coming week.",
          classification: "confirmed_fact",
          confidence: "high",
          evidence: [{ speaker: "coach", text: "2 liters of water daily" }],
        },
        {
          id: "a3",
          title: "Coach check-in Wednesday",
          detail: "Scheduled midweek accountability touchpoint.",
          classification: "confirmed_fact",
          confidence: "high",
          evidence: [{ speaker: "coach", text: "I'll check in Wednesday." }],
        },
      ],
    },
    {
      id: "risk",
      title: "Risk & Attention Flags",
      summary: "One medium-risk cluster requiring monitoring.",
      insights: [
        {
          id: "r1",
          title: "Sleep-hydration-headache cluster",
          detail:
            "Persistent headaches combined with 5h sleep and low hydration warrant close monitoring.",
          classification: "ai_inference",
          confidence: "medium",
          evidence: [
            { speaker: "client", text: "persistent headaches by the afternoon" },
            { speaker: "client", text: "Maybe 5 hours" },
          ],
        },
      ],
    },
    {
      id: "recommendations",
      title: "Coach Recommendations",
      summary: "Two AI-suggested interventions based on reported patterns.",
      insights: [
        {
          id: "rc1",
          title: "Introduce 5-minute wind-down ritual",
          detail:
            "Address 3am wakeups with a pre-sleep breathing or journaling protocol.",
          classification: "ai_inference",
          confidence: "medium",
          evidence: [
            { speaker: "client", text: "I woke up around 3am most nights." },
          ],
        },
        {
          id: "rc2",
          title: "Prep 3 grab-and-go breakfasts",
          detail: "Reduces friction on the identified skipped-breakfast pattern.",
          classification: "ai_inference",
          confidence: "medium",
          evidence: [
            { speaker: "client", text: "I skipped breakfast most days" },
          ],
        },
      ],
    },
    {
      id: "missing",
      title: "Missing Information",
      summary: "Several context gaps that could affect symptom interpretation.",
      insights: [
        {
          id: "m1",
          title: "Caffeine and alcohol intake not discussed",
          detail:
            "Both can meaningfully affect the reported sleep and headache patterns.",
          classification: "missing_information",
          confidence: "low",
          evidence: [],
        },
        {
          id: "m2",
          title: "Menstrual cycle context unknown",
          detail: "Not covered; could inform symptom interpretation.",
          classification: "missing_information",
          confidence: "low",
          evidence: [],
        },
      ],
    },
  ],
  timeline: [
    {
      id: "tl-001",
      date: "Mon",
      title: "Strength session",
      description: "Completed gym session",
      category: "exercise",
    },
    {
      id: "tl-002",
      date: "Tue",
      title: "Pizza takeout",
      description: "Stress-related meal",
      category: "nutrition",
    },
    {
      id: "tl-003",
      date: "Wed",
      title: "3am wakeup",
      description: "Fragmented sleep reported",
      category: "sleep",
    },
    {
      id: "tl-004",
      date: "Thu",
      title: "Strength session",
      description: "Second gym session of week",
      category: "exercise",
    },
    {
      id: "tl-005",
      date: "Fri",
      title: "Headache onset",
      description: "Afternoon headache reported",
      category: "symptoms",
    },
    {
      id: "tl-006",
      date: "Sat",
      title: "Pizza takeout",
      description: "Second pizza meal",
      category: "nutrition",
    },
    {
      id: "tl-007",
      date: "Sun",
      title: "Coach check-in",
      description: "Weekly review conversation",
      category: "engagement",
    },
  ],
  trends: {
    weeklyHabits: [
      { label: "W1", nutrition: 65, exercise: 60, sleep: 62 },
      { label: "W2", nutrition: 58, exercise: 64, sleep: 55 },
      { label: "W3", nutrition: 50, exercise: 62, sleep: 42 },
      { label: "W4", nutrition: 42, exercise: 58, sleep: 31 },
    ],
    progress: [
      { label: "W1", value: 62 },
      { label: "W2", value: 59 },
      { label: "W3", value: 51 },
      { label: "W4", value: 48 },
    ],
    sleep: [
      { label: "Mon", value: 5.5 },
      { label: "Tue", value: 4.5 },
      { label: "Wed", value: 5 },
      { label: "Thu", value: 6 },
      { label: "Fri", value: 4 },
      { label: "Sat", value: 5.5 },
      { label: "Sun", value: 5 },
    ],
    water: [
      { label: "Mon", value: 0.8 },
      { label: "Tue", value: 1.0 },
      { label: "Wed", value: 0.6 },
      { label: "Thu", value: 1.2 },
      { label: "Fri", value: 0.9 },
      { label: "Sat", value: 0.8 },
      { label: "Sun", value: 1.0 },
    ],
  },
  missingInformation: [
    "Caffeine intake",
    "Alcohol intake",
    "Menstrual cycle context",
    "Weekend activity data",
  ],
  keyBarriers: [
    "Work-related time pressure",
    "Poor sleep onset routine",
    "Low meal prep bandwidth",
  ],
  pendingActions: [
    "7h sleep × 4 nights",
    "2L water daily",
    "Coach check-in Wednesday",
  ],
  riskFlags: [
    { level: "medium", message: "Sleep-hydration-headache cluster developing" },
    { level: "low", message: "Emotional eating pattern under stress" },
  ],
  recommendations: [
    "Introduce 5-minute pre-sleep wind-down ritual",
    "Prep 3 grab-and-go breakfasts on Sunday",
    "Schedule two 10-minute walk breaks during workday",
  ],
};