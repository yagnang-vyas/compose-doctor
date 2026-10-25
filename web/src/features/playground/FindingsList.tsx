import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import type { Finding, JsonReport, RuleDoc, Severity } from "../../analyzer/types";
import { SEVERITY_PLURALS, SeverityIcon } from "../../components/ui/Severity";
import { cn } from "../../lib/cn";
import { FindingItem, findingKey } from "./FindingItem";

export type SeverityFilter = Severity | "all";
export type GroupBy = "severity" | "service" | "line";

interface FindingsListProps {
  report: JsonReport;
  rules: ReadonlyMap<string, RuleDoc>;
  onGoTo: (line: number, column: number) => void;
}

const SEVERITY_ORDER: Severity[] = ["error", "warning", "note"];

function group(findings: Finding[], by: GroupBy): { key: string; label: string; severity?: Severity; items: Finding[] }[] {
  if (by === "line") return [{ key: "all", label: "", items: findings }];
  if (by === "severity") {
    return SEVERITY_ORDER.map((severity) => ({
      key: severity,
      label: SEVERITY_PLURALS[severity],
      severity,
      items: findings.filter((finding) => finding.severity === severity),
    })).filter((section) => section.items.length > 0);
  }
  const services = new Map<string, Finding[]>();
  for (const finding of findings) {
    const name = finding.service ?? "(file)";
    services.set(name, [...(services.get(name) ?? []), finding]);
  }
  return [...services].map(([name, items]) => ({ key: name, label: name, items }));
}

export function FindingsList({ report, rules, onGoTo }: FindingsListProps) {
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("severity");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [showSuppressed, setShowSuppressed] = useState(false);

  const visible = useMemo(
    () => report.findings.filter((finding) => filter === "all" || finding.severity === filter),
    [report.findings, filter],
  );
  const sections = useMemo(() => group(visible, groupBy), [visible, groupBy]);

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const filters: { value: SeverityFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: report.findings.length },
    ...SEVERITY_ORDER.map((severity) => ({
      value: severity,
      label: SEVERITY_PLURALS[severity],
      count: report.summary[severity],
    })),
  ];

  return (
    <div>
      {report.findings.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div role="group" aria-label="Filter by severity" className="flex flex-wrap gap-1">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                disabled={item.count === 0 && item.value !== "all"}
                onClick={() => setFilter(item.value)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-40",
                  filter === item.value
                    ? "bg-fg text-canvas"
                    : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {item.label}
                <span className="tabular-nums opacity-70">{item.count}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-subtle">
            Group by
            <select
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as GroupBy)}
              className="h-7 rounded-md border border-line bg-surface px-2 text-xs text-fg"
            >
              <option value="severity">Severity</option>
              <option value="service">Service</option>
              <option value="line">Line (as the CLI prints)</option>
            </select>
          </label>
        </div>
      )}

      {sections.map((section) => (
        <section key={section.key} aria-label={section.label || "Findings"} className="py-1">
          {section.label && (
            <h3 className="flex items-center gap-2 px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-subtle sm:px-5">
              {section.severity && <SeverityIcon severity={section.severity} className="size-3.5" />}
              <span className={groupBy === "service" ? "font-mono normal-case tracking-normal" : undefined}>
                {section.label}
              </span>
              <span className="font-normal tabular-nums">{section.items.length}</span>
            </h3>
          )}
          <ul>
            {section.items.map((finding) => {
              const key = findingKey(finding);
              return (
                <FindingItem
                  key={key}
                  finding={finding}
                  rule={rules.get(finding.rule_id)}
                  expanded={expanded.has(key)}
                  onToggle={() => toggle(key)}
                  onGoTo={onGoTo}
                />
              );
            })}
          </ul>
        </section>
      ))}

      {report.suppressed.length > 0 && (
        <section aria-label="Suppressed findings" className="border-t border-line py-1">
          <button
            type="button"
            aria-expanded={showSuppressed}
            onClick={() => setShowSuppressed((value) => !value)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-subtle hover:text-fg sm:px-5"
          >
            <ChevronRight aria-hidden="true" className={cn("size-3.5 transition-transform", showSuppressed && "rotate-90")} />
            Suppressed
            <span className="font-normal tabular-nums">{report.suppressed.length}</span>
          </button>
          {showSuppressed && (
            <ul>
              {report.suppressed.map((finding) => {
                const key = `suppressed:${findingKey(finding)}`;
                return (
                  <FindingItem
                    key={key}
                    finding={finding}
                    rule={rules.get(finding.rule_id)}
                    expanded={expanded.has(key)}
                    onToggle={() => toggle(key)}
                    onGoTo={onGoTo}
                    suppression={finding.suppression}
                  />
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
