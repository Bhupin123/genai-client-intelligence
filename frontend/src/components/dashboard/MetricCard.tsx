import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: number;
  suffix?: string;
  icon: LucideIcon;
  tone?: "positive" | "warning" | "danger" | "neutral";
}

const TONE_STYLES: Record<NonNullable<Props["tone"]>, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-rose-600 dark:text-rose-400",
  neutral: "text-foreground",
};

const BAR_STYLES: Record<NonNullable<Props["tone"]>, string> = {
  positive: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  neutral: "bg-foreground/60",
};

function toneFromValue(value: number): NonNullable<Props["tone"]> {
  if (value >= 70) return "positive";
  if (value >= 45) return "warning";
  return "danger";
}

export function MetricCard({ label, value, suffix = "/100", icon: Icon, tone }: Props) {
  const t = tone ?? toneFromValue(value);
  return (
    <Card className="border-border/60 bg-card/40 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className={cn("h-4 w-4", TONE_STYLES[t])} />
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn("text-3xl font-semibold tabular-nums", TONE_STYLES[t])}>
          {value}
        </span>
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", BAR_STYLES[t])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </Card>
  );
}
