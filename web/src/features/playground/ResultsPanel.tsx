import { CircleX, FileWarning, LoaderCircle, RefreshCw, ScanSearch } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";

import type { AnalysisOutcome } from "../../analyzer/client";
import type { RuntimeState } from "../../analyzer/useAnalyzer";
import type { FailOn, RuleDoc } from "../../analyzer/types";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { AnalysisSummary } from "./AnalysisSummary";
import { FindingsList } from "./FindingsList";
import { type RawFormat, RawOutput } from "./RawOutput";

export type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; id: number; outcome: AnalysisOutcome; source: string; failOn: FailOn }
  | { status: "failed"; message: string };

interface ResultsPanelProps {
  run: RunState;
  runtime: RuntimeState;
  rules: ReadonlyMap<string, RuleDoc>;
  stale: boolean;
  onGoTo: (line: number, column: number) => void;
  onRetry: () => void;
}

type Tab = "findings" | RawFormat["id"];

function rawFormats(run: Extract<RunState, { status: "done" }>): RawFormat[] {
  const { result } = run.outcome;
  if (!result.ok) return [];
  const failOn = run.failOn === "error" ? "" : ` --fail-on ${run.failOn}`;
  return [
    {
      id: "text",
      label: "Text",
      command: `compose-doctor compose.yaml${failOn}`,
      filename: "compose-doctor.txt",
      mime: "text/plain",
      content: result.text,
    },
    {
      id: "json",
      label: "JSON",
      command: `compose-doctor compose.yaml --format json --show-suppressed${failOn}`,
      filename: "compose-doctor.json",
      mime: "application/json",
      content: result.json,
    },
    {
      id: "sarif",
      label: "SARIF",
      command: `compose-doctor compose.yaml --format sarif${failOn}`,
      filename: "compose-doctor.sarif",
      mime: "application/sarif+json",
      content: result.sarif,
    },
  ];
}

function Placeholder({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-subtle">{icon}</div>
      <p className="mt-4 font-semibold text-fg">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm leading-6 text-muted">{children}</div>}
    </div>
  );
}

export function ResultsPanel({ run, runtime, rules, stale, onGoTo, onRetry }: ResultsPanelProps) {
  const [tab, setTab] = useState<Tab>("findings");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (run.status === "idle" || run.status === "running") {
    const booting = runtime.status === "loading";
    if (runtime.status === "failed") {
      return (
        <Placeholder icon={<CircleX aria-hidden="true" className="size-5 text-error" />} title="The analyzer could not start">
          <p>{runtime.message}</p>
          <Button className="mt-4" onClick={onRetry}>
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </Placeholder>
      );
    }
    if (run.status === "running" || booting) {
      return (
        <Placeholder
          icon={<LoaderCircle aria-hidden="true" className="size-5 animate-spin text-accent" />}
          title={booting ? "Starting the analyzer" : "Analyzing"}
        >
          {booting
            ? "Downloading the Python runtime. This takes a few seconds on the first visit and is cached afterwards."
            : "Running Compose Doctor on your file."}
        </Placeholder>
      );
    }
    return (
      <Placeholder icon={<ScanSearch aria-hidden="true" className="size-5" />} title="No analysis yet">
        Choose an example or paste a Compose file, then select <strong className="font-medium text-fg">Analyze</strong>{" "}
        or press <kbd className="rounded border border-line bg-surface-2 px-1 font-mono text-xs">Ctrl</kbd>+
        <kbd className="rounded border border-line bg-surface-2 px-1 font-mono text-xs">Enter</kbd>.
      </Placeholder>
    );
  }

  if (run.status === "failed") {
    return (
      <Placeholder icon={<CircleX aria-hidden="true" className="size-5 text-error" />} title="Analysis failed">
        <p>{run.message}</p>
        <p className="mt-2 text-xs text-subtle">This is a problem with the playground, not with your file.</p>
        <Button className="mt-4" onClick={onRetry}>
          <RefreshCw aria-hidden="true" /> Restart the analyzer
        </Button>
      </Placeholder>
    );
  }

  const { result, durationMs } = run.outcome;

  if (!result.ok) {
    const { error } = result;
    return (
      <div className="p-4 sm:p-5">
        <div className="rounded-xl border border-error-line bg-error-soft p-4" role="alert">
          <div className="flex items-start gap-3">
            <FileWarning aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-error" />
            <div className="min-w-0">
              <p className="font-semibold text-fg">Compose Doctor could not read this file</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {error.message}
                {error.line !== null && ` (line ${error.line})`}
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-surface px-3 py-2 font-mono text-xs text-fg">
                {error.display}
              </pre>
              <p className="mt-3 text-xs text-subtle">The CLI exits with code 2 for input errors. No rules were run.</p>
              {error.line !== null && (
                <Button className="mt-3" size="sm" onClick={() => onGoTo(error.line ?? 1, 1)}>
                  Go to line {error.line}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const formats = rawFormats(run);
  const tabs: { id: Tab; label: string }[] = [
    { id: "findings", label: "Findings" },
    ...formats.map((format) => ({ id: format.id, label: format.label })),
  ];
  const active = formats.find((format) => format.id === tab);

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-2 sm:px-3">
        <div role="tablist" aria-label="Report format" className="flex">
          {tabs.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[item.id] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => onTabKey(event, index)}
              className={cn(
                "relative px-3 py-3 text-sm font-medium transition-colors",
                tab === item.id
                  ? "text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent"
                  : "text-subtle hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {stale && (
          <span className="mr-2 hidden rounded-md bg-warning-soft px-2 py-1 text-xs font-medium text-warning sm:inline">
            Edited since this analysis
          </span>
        )}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="min-h-0 flex-1 overflow-auto"
      >
        {active ? (
          <RawOutput format={active} />
        ) : (
          <>
            {stale && (
              <p className="border-b border-line bg-warning-soft px-4 py-2 text-xs text-warning sm:hidden">
                Edited since this analysis
              </p>
            )}
            <AnalysisSummary result={result} failOn={run.failOn} durationMs={durationMs} />
            <FindingsList key={run.id} report={result.report} rules={rules} onGoTo={onGoTo} />
          </>
        )}
      </div>
    </div>
  );
}
