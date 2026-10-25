import { ChevronRight, CornerDownRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { Finding, RuleDoc } from "../../analyzer/types";
import { CopyButton } from "../../components/ui/CopyButton";
import { SeverityBadge, SeverityIcon } from "../../components/ui/Severity";
import { cn } from "../../lib/cn";
import { ruleAnchor } from "../../lib/rules";

interface FindingItemProps {
  finding: Finding;
  rule: RuleDoc | undefined;
  expanded: boolean;
  onToggle: () => void;
  onGoTo: (line: number, column: number) => void;
  suppression?: "inline" | "config";
}

export function findingKey(finding: Finding): string {
  return `${finding.rule_id}:${finding.line}:${finding.column}:${finding.service ?? ""}:${finding.message}`;
}

export function FindingItem({ finding, rule, expanded, onToggle, onGoTo, suppression }: FindingItemProps) {
  const id = `finding-${findingKey(finding).replace(/[^\w-]/g, "_")}`;
  const ignoreComment = `# compose-doctor: ignore ${finding.rule_id} -- <reason>`;
  return (
    <li className={cn("group", suppression && "opacity-75")}>
      <div className="flex items-start gap-1 px-2 sm:px-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={id}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-surface-2"
        >
          <SeverityIcon severity={finding.severity} className="mt-0.5" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-5 text-fg">{finding.message}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
              <span className="font-mono font-medium text-muted">{finding.rule_id}</span>
              {rule && <span>{rule.title}</span>}
              {finding.service && (
                <span className="rounded bg-surface-2 px-1.5 py-px font-mono text-[11px] text-muted">
                  {finding.service}
                </span>
              )}
              {suppression && (
                <span className="rounded border border-dashed border-line-strong px-1.5 text-[11px]">
                  suppressed by {suppression === "inline" ? "inline comment" : "configuration"}
                </span>
              )}
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className={cn("mt-0.5 size-4 shrink-0 text-subtle transition-transform", expanded && "rotate-90")}
          />
        </button>
        <button
          type="button"
          onClick={() => onGoTo(finding.line, finding.column)}
          className="mt-2 shrink-0 rounded-md px-2 py-1 font-mono text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label={`Go to line ${finding.line}, column ${finding.column} in the editor`}
          title="Go to line"
        >
          L{finding.line}:{finding.column}
        </button>
      </div>
      {expanded && (
        <div id={id} className="mx-4 mb-3 ml-11 space-y-3 rounded-xl border border-line bg-surface-2/60 p-4 text-sm sm:mx-5 sm:ml-12">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <span className="font-mono text-xs text-muted">
              compose.yaml:{finding.line}:{finding.column}
            </span>
          </div>
          {rule && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-subtle">Why it matters</h4>
              <p className="mt-1 leading-6 text-muted">{rule.rationale}</p>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-subtle">How to fix</h4>
            <p className="mt-1 leading-6 text-fg">{finding.fix}</p>
          </div>
          {!suppression && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-subtle">
                Deliberate exception?
              </h4>
              <div className="mt-1.5 flex items-center gap-1 rounded-lg border border-line bg-surface pl-3">
                <CornerDownRight aria-hidden="true" className="size-3.5 shrink-0 text-subtle" />
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1.5 font-mono text-xs text-muted">
                  {ignoreComment}
                </code>
                <CopyButton text={ignoreComment} label="Copy suppression comment" />
              </div>
            </div>
          )}
          <Link
            to={`/docs#${ruleAnchor(finding.rule_id)}`}
            className="inline-block text-xs font-medium text-accent hover:underline"
          >
            {finding.rule_id} in the rule reference
          </Link>
        </div>
      )}
    </li>
  );
}
