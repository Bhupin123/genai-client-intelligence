import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, Quote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Insight, ReviewStatus } from "@/types/intelligence";
import { ClassificationBadge, ConfidenceBadge } from "./ClassificationBadge";
import { cn } from "@/lib/utils";

interface Props {
  insight: Insight;
  onReview?: (id: string, status: ReviewStatus, editedDetail?: string) => void;
}

export function InsightCard({ insight, onReview }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(insight.detail);
  const status = insight.reviewStatus ?? "pending";

  return (
    <div
      className={cn(
        "group rounded-xl border border-border/60 bg-card/60 p-4 transition-colors",
        status === "approved" && "border-emerald-500/30 bg-emerald-500/5",
        status === "rejected" && "border-rose-500/30 bg-rose-500/5 opacity-70",
        status === "edited" && "border-sky-500/30 bg-sky-500/5",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-foreground">{insight.title}</h4>
          {editing ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-2 min-h-[70px] text-sm"
            />
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {insight.detail}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ClassificationBadge value={insight.classification} />
        <ConfidenceBadge value={insight.confidence} />
        {status !== "pending" && (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            · {status}
          </span>
        )}
      </div>

      {insight.evidence.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {open ? "Hide evidence" : `Show evidence (${insight.evidence.length})`}
        </button>
      )}

      {open && insight.evidence.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/40 p-3">
          {insight.evidence.map((ev, i) => (
            <div key={i} className="flex gap-2">
              <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold capitalize text-foreground">{ev.speaker}:</span>{" "}
                <span className="text-muted-foreground">&ldquo;{ev.text}&rdquo;</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        {editing ? (
          <>
            <Button
              size="sm"
              onClick={() => {
                onReview?.(insight.id, "edited", draft);
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(insight.detail);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => onReview?.(insight.id, "approved")}
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => onReview?.(insight.id, "rejected")}
            >
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
