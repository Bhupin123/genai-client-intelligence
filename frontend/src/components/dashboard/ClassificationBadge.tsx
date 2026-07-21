import { Badge } from "@/components/ui/badge";
import type { Classification, Confidence } from "@/types/intelligence";
import { cn } from "@/lib/utils";

const CLASS_LABEL: Record<Classification, string> = {
  confirmed_fact: "Confirmed Fact",
  client_report: "Client Report",
  coach_observation: "Coach Observation",
  ai_inference: "AI Inference",
  missing_information: "Missing Info",
};

const CLASS_STYLES: Record<Classification, string> = {
  confirmed_fact:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  client_report:
    "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  coach_observation:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  ai_inference:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  missing_information:
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
};

const CONF_STYLES: Record<Confidence, string> = {
  high: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function ClassificationBadge({ value }: { value: Classification }) {
  return (
    <Badge variant="outline" className={cn("font-medium", CLASS_STYLES[value])}>
      {CLASS_LABEL[value]}
    </Badge>
  );
}

export function ConfidenceBadge({ value }: { value: Confidence }) {
  return (
    <Badge variant="outline" className={cn("font-medium capitalize", CONF_STYLES[value])}>
      {value} confidence
    </Badge>
  );
}
