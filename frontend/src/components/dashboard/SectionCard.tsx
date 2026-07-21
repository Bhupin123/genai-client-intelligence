import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  icon?: ReactNode;
  summary?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, icon, summary, action, children, className }: Props) {
  return (
    <Card className={cn("border-border/60 bg-card/40 backdrop-blur-sm", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            {icon && <span className="text-muted-foreground">{icon}</span>}
            {title}
          </CardTitle>
          {summary && (
            <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
