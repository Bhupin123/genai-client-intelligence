import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast, Toaster } from "sonner";
import {
  Brain,
  Eraser,
  FileText,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { analyzeConversation, saveReport } from "@/services/api";
import { SAMPLE_CONVERSATION } from "@/services/mockData";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GenAI Client Intelligence Platform" },
      {
        name: "description",
        content:
          "Analyze coaching conversations and generate structured, explainable client intelligence with AI.",
      },
      { property: "og:title", content: "GenAI Client Intelligence Platform" },
      {
        property: "og:description",
        content: "Turn client-coach conversations into evidence-grounded insights.",
      },
    ],
  }),
  component: AnalyzerPage,
});

const MAX_CHARS = 50000;

function AnalyzerPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const navigate = useNavigate();
  const dropRef = useRef<HTMLDivElement | null>(null);

  const onAnalyze = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Please paste a conversation first.");
      return;
    }
    if (trimmed.length < 40) {
      toast.error("Conversation is too short to analyze.");
      return;
    }
    setLoading(true);
    try {
      const report = await analyzeConversation(trimmed);
      saveReport(report);
      toast.success("Analysis complete");
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [text, navigate]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("text/") && !file.name.match(/\.(txt|md|log|json)$/i)) {
      toast.error("Please drop a text file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "").slice(0, MAX_CHARS);
      setText(content);
      toast.success(`Loaded ${file.name}`);
    };
    reader.readAsText(file);
  }, []);

  useEffect(() => {
    const onPrevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", onPrevent);
    window.addEventListener("drop", onPrevent);
    return () => {
      window.removeEventListener("dragover", onPrevent);
      window.removeEventListener("drop", onPrevent);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-violet-500/20 via-sky-500/10 to-transparent blur-3xl" />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background">
            <Brain className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Client Intelligence
          </span>
        </div>
        <a
          href="https://github.com"
          className="hidden text-xs text-muted-foreground transition-colors hover:text-foreground sm:block"
        >
          Docs
        </a>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-8 sm:pt-16">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
            <Sparkles className="h-3 w-3" />
            Explainable AI · Evidence-grounded
          </div>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            GenAI Client Intelligence Platform
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Analyze coaching conversations and generate structured client
            intelligence using explainable AI.
          </p>
        </div>

        <Card
          ref={dropRef}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "relative overflow-hidden border-border/60 bg-card/50 p-2 shadow-xl shadow-black/5 backdrop-blur-sm transition-all",
            dragging && "border-primary/60 ring-2 ring-primary/30",
          )}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            placeholder="Paste a client-coach conversation here..."
            className="min-h-[320px] resize-none border-0 bg-transparent p-4 text-sm shadow-none focus-visible:ring-0"
            disabled={loading}
          />

          {dragging && (
            <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-md bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Upload className="h-5 w-5" />
                Drop text file to load
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-3 py-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">
                <Upload className="mr-1 inline h-3 w-3" />
                Drag & drop a .txt file
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setText("")}
                disabled={loading || !text}
              >
                <Eraser className="h-4 w-4" /> Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setText(SAMPLE_CONVERSATION)}
                disabled={loading}
              >
                <FileText className="h-4 w-4" /> Load Sample
              </Button>
              <Button onClick={onAnalyze} disabled={loading} size="sm">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Analyze Conversation
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {loading && (
          <div className="mt-8 space-y-3">
            <ProcessingStep label="Parsing conversation" delay={0} />
            <ProcessingStep label="Extracting insights" delay={400} />
            <ProcessingStep label="Classifying evidence" delay={900} />
            <ProcessingStep label="Building intelligence report" delay={1300} />
          </div>
        )}

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          <FeatureBullet
            title="Explainable"
            body="Every insight ties back to the exact excerpt it came from."
          />
          <FeatureBullet
            title="Classified"
            body="Confirmed fact, client report, coach observation, or inference."
          />
          <FeatureBullet
            title="Reviewable"
            body="Approve, edit, or reject each AI insight before it ships."
          />
        </div>
      </main>
    </div>
  );
}

function ProcessingStep({ label, delay }: { label: string; delay: number }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setActive(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-3 text-sm transition-opacity",
        active ? "opacity-100" : "opacity-40",
      )}
    >
      {active ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      ) : (
        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
      )}
      <span className={active ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}

function FeatureBullet({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{body}</div>
    </div>
  );
}
