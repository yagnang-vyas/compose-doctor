import { CircleCheck } from "lucide-react";

import type { AnalysisSuccess, FailOn, Severity } from "../../analyzer/types";
import { SEVERITY_PLURALS, SeverityIcon } from "../../components/ui/Severity";
import { cn } from "../../lib/cn";

interface AnalysisSummaryProps {
  result: AnalysisSuccess;
  failOn: FailOn;
  durationMs: number;
}

const SEVERITY_ORDER: Severity[] = ["error", "warning", "note"];

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function AnalysisSummary({ result, failOn, durationMs }: AnalysisSummaryProps) {
  const { summary, findings } = result.report;
  const clean = findings.length === 0;
  const passes = result.exit_code === 0;

  return (
    <section aria-labelledby="summary-title" className="border-b border-line p-4 sm:p-5">
      <h2 id="summary-title" className="sr-only">
        Summary
      </h2>
      {clean ? (
        <div className="flex items-start gap-3 rounded-xl border border-success-line bg-success-soft p-4">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <p className="font-semibold text-fg">No problems found</p>
            <p className="mt-0.5 text-sm text-muted">
              {plural(result.services.length, "service")} analyzed
              {summary.suppressed > 0 && `, ${summary.suppressed} suppressed finding${summary.suppressed === 1 ? "" : "s"}`}.
            </p>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
            <dt className="text-xs text-subtle">Findings</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-fg">{findings.length}</dd>
          </div>
          {SEVERITY_ORDER.map((severity) => (
            <div key={severity} className="rounded-xl border border-line px-3.5 py-3">
              <dt className="flex items-center gap-1.5 text-xs text-subtle">
                <SeverityIcon severity={severity} className="size-3.5" />
                {SEVERITY_PLURALS[severity]}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-fg">{summary[severity]}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
        <span>{plural(result.services.length, "service")}</span>
        <span aria-hidden="true">·</span>
        <span>{summary.suppressed} suppressed</span>
        <span aria-hidden="true">·</span>
        <span>
          <code className="font-mono">--fail-on {failOn}</code> exits{" "}
          <span className={cn("font-mono font-semibold", passes ? "text-success" : "text-error")}>
            {result.exit_code}
          </span>
        </span>
        <span aria-hidden="true">·</span>
        <span>{durationMs} ms in your browser</span>
      </p>
    </section>
  );
}
