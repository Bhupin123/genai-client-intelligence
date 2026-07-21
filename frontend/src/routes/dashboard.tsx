import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Brain,
  Check,
  ClipboardCopy,
  Clock,
  Coffee,
  Copy,
  Download,
  Droplet,
  Dumbbell,
  Flag,
  Heart,
  HeartPulse,
  Lightbulb,
  ListChecks,
  Moon,
  Repeat,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Utensils,
  Zap,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { InsightCard } from "@/components/dashboard/InsightCard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ConfidenceBadge } from "@/components/dashboard/ClassificationBadge";
import { loadReport } from "@/services/api";
import { MOCK_REPORT } from "@/services/mockData";
import type {
  IntelligenceReport,
  ReviewStatus,
} from "@/types/intelligence";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Client Intelligence Report — Dashboard" },
      {
        name: "description",
        content:
          "Structured, explainable AI dashboard summarizing a coaching conversation.",
      },
    ],
  }),
  component: DashboardPage,
});

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  nutrition: Utensils,
  exercise: Dumbbell,
  sleep: Moon,
  hydration: Droplet,
  symptoms: Stethoscope,
  stress: HeartPulse,
  engagement: Heart,
  barriers: Flag,
  actions: ListChecks,
  risk: AlertTriangle,
  recommendations: Lightbulb,
  missing: Coffee,
};

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

/** Standard tone: higher score = better (nutrition, sleep, exercise, etc.) */
function metricTone(value: number): "positive" | "warning" | "danger" {
  if (value >= 65) return "positive";
  if (value >= 40) return "warning";
  return "danger";
}

/** FIX #1 — Stress tone is INVERTED: higher stress score = worse */
function stressTone(value: number): "positive" | "warning" | "danger" {
  if (value <= 35) return "positive";
  if (value <= 60) return "warning";
  return "danger";
}

function metricLabel(value: number): string {
  if (value >= 75) return "Strong";
  if (value >= 60) return "On Track";
  if (value >= 40) return "Needs Attention";
  return "Concern";
}

/** FIX #1 — Inverted label for stress */
function stressLabel(value: number): string {
  if (value <= 35) return "Well Managed";
  if (value <= 60) return "Elevated";
  return "High — Needs Attention";
}

// ---------------------------------------------------------------------------
// FIX #2 — progressStatus derived purely from metrics, no fragile string split
// Compute an overall score from the five positive-direction metrics
// ---------------------------------------------------------------------------

function deriveOverallStatus(metrics: IntelligenceReport["metrics"]): {
  label: string;
  tone: "positive" | "warning" | "danger";
} {
  const overallScore = Math.round(
    (metrics.nutrition +
      metrics.exercise +
      metrics.sleep +
      metrics.hydration +
      metrics.engagement) /
      5,
  );
  return { label: metricLabel(overallScore), tone: metricTone(overallScore) };
}

// ---------------------------------------------------------------------------
// DynamicTrendAnalysis
// ---------------------------------------------------------------------------

function DynamicTrendAnalysis({
  metrics,
}: {
  metrics: IntelligenceReport["metrics"];
}) {
  const overall = deriveOverallStatus(metrics);

  return (
    <SectionCard title="Trend Analysis" icon={<TrendingUp className="h-4 w-4" />}>
      <div className="space-y-3 text-sm">
        <TrendRow
          label="Overall progress"
          value={overall.label}
          tone={overall.tone}
          detail={`Composite score across nutrition, exercise, sleep, hydration & engagement.`}
        />
        <TrendRow
          label="Sleep"
          value={metricLabel(metrics.sleep)}
          tone={metricTone(metrics.sleep)}
          detail={`Sleep score: ${metrics.sleep}/100.`}
        />
        <TrendRow
          label="Exercise consistency"
          value={metricLabel(metrics.exercise)}
          tone={metricTone(metrics.exercise)}
          detail={`Exercise score: ${metrics.exercise}/100.`}
        />
        <TrendRow
          label="Stress"
          value={stressLabel(metrics.stress)}
          tone={stressTone(metrics.stress)}   // FIX #1 — uses inverted tone
          detail={`Stress score: ${metrics.stress}/100 (lower is better).`}
        />
        <TrendRow
          label="Engagement"
          value={metricLabel(metrics.engagement)}
          tone={metricTone(metrics.engagement)}
          detail={`Engagement score: ${metrics.engagement}/100.`}
        />
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

function DashboardPage() {
  const navigate = useNavigate();
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [reviews, setReviews] = useState<
    Record<string, { status: ReviewStatus; detail?: string }>
  >({});

  useEffect(() => {
    const r = loadReport() ?? MOCK_REPORT;
    setReport(r);
  }, []);

  const enriched = useMemo<IntelligenceReport | null>(() => {
    if (!report) return null;
    return {
      ...report,
      sections: report.sections.map((s) => ({
        ...s,
        insights: s.insights.map((i) => {
          const r = reviews[i.id];
          if (!r) return i;
          return {
            ...i,
            reviewStatus: r.status,
            detail: r.detail ?? i.detail,
          };
        }),
      })),
    };
  }, [report, reviews]);

  const handleReview = (
    id: string,
    status: ReviewStatus,
    editedDetail?: string,
  ) => {
    setReviews((prev) => ({ ...prev, [id]: { status, detail: editedDetail } }));
  };

  const copyReport = async () => {
    if (!enriched) return;
    await navigator.clipboard.writeText(JSON.stringify(enriched, null, 2));
    toast.success("Report copied to clipboard");
  };

  // FIX #4 — revoke blob URL in finally so it always cleans up, even on error
  const downloadJSON = () => {
    if (!enriched) return;
    const blob = new Blob([JSON.stringify(enriched, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `client-intelligence-${enriched.meta.clientName
        .toLowerCase()
        .replace(/\s+/g, "-")}.json`;
      a.click();
      toast.success("Downloaded JSON");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  if (!enriched) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading report...
      </div>
    );
  }

  const { meta, metrics, weeklySummary, sections, timeline, trends } = enriched;

  const insightCounts = sections.reduce((acc, s) => acc + s.insights.length, 0);
  const approvedCount = Object.values(reviews).filter(
    (r) => r.status === "approved" || r.status === "edited",
  ).length;

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />

      {/* Top nav */}
      <div className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Analyzer</span>
            </Link>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background">
                <Brain className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-semibold">Client Intelligence</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* FIX #6 — aria-label on icon-only buttons for accessibility */}
            <Button
              variant="ghost"
              size="sm"
              onClick={copyReport}
              aria-label="Copy report to clipboard"
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">Copy</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadJSON}
              aria-label="Download report as JSON"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">JSON</span>
            </Button>
            <Button size="sm" onClick={() => navigate({ to: "/" })}>
              <Repeat className="h-4 w-4" />
              <span className="hidden sm:inline">Analyze another</span>
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Report Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="bg-card/60">
              <Sparkles className="h-3 w-3" /> AI Report
            </Badge>
            <span>·</span>
            <span>
              Client:{" "}
              <span className="font-medium text-foreground">
                {meta.clientName}
              </span>
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Client Intelligence Report
          </h1>
          {/*
            FIX #5 — weeklySummary was duplicated (header + Weekly Summary card).
            Header now shows a short truncated preview (2 sentences max).
            Full summary lives only in the Weekly Summary card below.
          */}
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base line-clamp-2">
            {weeklySummary}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeaderStat
              label="Conversation Date"
              value={new Date(meta.conversationDate).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric", year: "numeric" },
              )}
              icon={<Clock className="h-3.5 w-3.5" />}
            />
            <HeaderStat
              label="Generated At"
              value={new Date(meta.generatedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              icon={<Zap className="h-3.5 w-3.5" />}
            />
            <HeaderStat
              label="Processing Time"
              value={`${(meta.processingTimeMs / 1000).toFixed(2)}s`}
              icon={<Activity className="h-3.5 w-3.5" />}
            />
            <HeaderStat
              label="Overall Confidence"
              value={<ConfidenceBadge value={meta.overallConfidence} />}
              icon={<Sparkles className="h-3.5 w-3.5" />}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ClipboardCopy className="h-3.5 w-3.5" />
            {insightCounts} insights extracted · {approvedCount} reviewed
          </div>
        </div>

        {/* Metrics Row */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Nutrition" value={metrics.nutrition} icon={Utensils} />
          <MetricCard label="Exercise" value={metrics.exercise} icon={Dumbbell} />
          <MetricCard label="Sleep" value={metrics.sleep} icon={Moon} />
          <MetricCard label="Hydration" value={metrics.hydration} icon={Droplet} />
          <MetricCard
            label="Stress"
            value={metrics.stress}
            icon={HeartPulse}
            // FIX #1 — stress tone correctly inverted via stressTone()
            tone={stressTone(metrics.stress)}
          />
          <MetricCard label="Engagement" value={metrics.engagement} icon={Heart} />
        </div>

        {/* Charts */}
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Weekly Habit Overview"
            icon={<TrendingUp className="h-4 w-4" />}
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trends.weeklyHabits}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  width={30}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="nutrition" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="exercise" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sleep" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <ChartLegend
              items={[
                { label: "Nutrition", color: "#10b981" },
                { label: "Exercise", color: "#0ea5e9" },
                { label: "Sleep", color: "#8b5cf6" },
              ]}
            />
          </ChartCard>

          <ChartCard
            title="Progress Trend"
            icon={<Activity className="h-4 w-4" />}
          >
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trends.progress}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  width={30}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#8b5cf6" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Sleep Trend" icon={<Moon className="h-4 w-4" />}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trends.sleep}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  width={30}
                  domain={[0, 10]}
                />
                <Tooltip content={<ChartTooltip suffix="h" />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#6366f1" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Water Intake Trend"
            icon={<Droplet className="h-4 w-4" />}
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trends.water}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  width={30}
                />
                <Tooltip content={<ChartTooltip suffix="L" />} />
                <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* FIX #5 — Single Weekly Summary card (not duplicated from header) */}
        <Card className="mb-6 border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" /> Weekly Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {weeklySummary}
            </p>
          </CardContent>
        </Card>

        {/* Sections grid */}
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((s) => {
            const Icon = SECTION_ICONS[s.id] ?? Activity;
            return (
              <SectionCard
                key={s.id}
                title={s.title}
                summary={s.summary}
                icon={<Icon className="h-4 w-4" />}
              >
                {s.insights.map((ins) => (
                  <InsightCard
                    key={ins.id}
                    insight={ins}
                    onReview={handleReview}
                  />
                ))}
              </SectionCard>
            );
          })}
        </div>

        {/* Timeline */}
        <SectionCard
          title="Timeline"
          summary="Chronological events extracted from the conversation."
          icon={<Clock className="h-4 w-4" />}
          className="mt-6"
        >
          <ol className="relative space-y-4 border-l border-border/60 pl-6">
            {/*
              FIX #3 — use composite key instead of array index.
              Add `id` to your TimelineEvent type when possible; this is a
              safe interim that avoids reorder bugs.
            */}
            {timeline.map((ev) => (
              <li key={`${ev.date}__${ev.title}`} className="relative">
                <span className="absolute -left-[27px] top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {ev.date}
                  </span>
                  <span className="text-sm font-medium">{ev.title}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {ev.category}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {ev.description}
                </p>
              </li>
            ))}
          </ol>
        </SectionCard>

        {/* Trend / missing info summary */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* FIX #1 + #2 — fully dynamic, no fragile string parsing */}
          <DynamicTrendAnalysis metrics={metrics} />

          <SectionCard
            title="Missing Information"
            icon={<Coffee className="h-4 w-4" />}
          >
            <ul className="space-y-2 text-sm">
              {enriched.missingInformation.map((m) => (
                <li key={m} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  <span className="text-muted-foreground">{m}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        {/* Footer actions */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="text-sm text-muted-foreground">
            Ready to run another conversation through the analyzer?
          </div>
          <div className="flex flex-wrap gap-2">
            {/* FIX #6 — aria-label on footer buttons too */}
            <Button
              variant="outline"
              size="sm"
              onClick={copyReport}
              aria-label="Copy report to clipboard"
            >
              <Copy className="h-4 w-4" /> Copy Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadJSON}
              aria-label="Download report as JSON"
            >
              <Download className="h-4 w-4" /> Download JSON
            </Button>
            <Button size="sm" onClick={() => navigate({ to: "/" })}>
              <Repeat className="h-4 w-4" /> Analyze Another Conversation
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HeaderStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  suffix,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="capitalize text-muted-foreground">{p.name}:</span>
          <span className="font-medium tabular-nums">
            {p.value}
            {suffix ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartLegend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: i.color }}
          />
          {i.label}
        </div>
      ))}
    </div>
  );
}

function TrendRow({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "warning" | "danger";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <div
        className={cn(
          "flex items-center gap-1 text-sm font-semibold",
          toneClass,
        )}
      >
        <Check className="h-3.5 w-3.5" />
        {value}
      </div>
    </div>
  );
}