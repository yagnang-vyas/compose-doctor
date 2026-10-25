import { CircleAlert, Info, TriangleAlert } from "lucide-react";

import type { Severity } from "../../analyzer/types";
import { cn } from "../../lib/cn";

export const SEVERITY_LABELS: Record<Severity, string> = {
  error: "Error",
  warning: "Warning",
  note: "Note",
};

export const SEVERITY_PLURALS: Record<Severity, string> = {
  error: "Errors",
  warning: "Warnings",
  note: "Notes",
};

const tone: Record<Severity, string> = {
  error: "text-error bg-error-soft border-error-line",
  warning: "text-warning bg-warning-soft border-warning-line",
  note: "text-note bg-note-soft border-note-line",
};

export const severityText: Record<Severity, string> = {
  error: "text-error",
  warning: "text-warning",
  note: "text-note",
};

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const Icon = severity === "error" ? CircleAlert : severity === "warning" ? TriangleAlert : Info;
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0", severityText[severity], className)} />;
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide",
        tone[severity],
        className,
      )}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
