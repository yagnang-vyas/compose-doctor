import { Eraser, LoaderCircle, Lock, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AnalyzerError, MAX_SOURCE_BYTES, byteLength, formatKiB } from "../../analyzer/client";
import { FAIL_ON_CHOICES, type FailOn, type RuleDoc } from "../../analyzer/types";
import { useAnalyzer } from "../../analyzer/useAnalyzer";
import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { CATEGORY_LABELS, DEFAULT_EXAMPLE, EXAMPLES, type Example, findExample } from "../../examples";
import { cn } from "../../lib/cn";
import { RULES_BY_ID } from "../../lib/rules";
import { readStored, writeStored } from "../../lib/storage";
import { ResultsPanel, type RunState } from "./ResultsPanel";
import { type EditorMarker, YamlEditor, type YamlEditorHandle } from "./YamlEditor";

const CATEGORY_ORDER = ["mixed", "security", "reliability", "configuration", "clean"] as const;
const DRAFT_KEY = "compose-doctor:draft";
const CUSTOM = "custom";

interface Draft {
  source: string;
  exampleId: string | null;
}

function initialDraft(param: string | null): Draft {
  const fromUrl = findExample(param);
  if (fromUrl) return { source: fromUrl.source, exampleId: fromUrl.id };
  const stored = readStored(DRAFT_KEY);
  if (stored) {
    try {
      const draft = JSON.parse(stored) as Partial<Draft>;
      if (typeof draft.source === "string") {
        return { source: draft.source, exampleId: findExample(draft.exampleId)?.id ?? null };
      }
    } catch {
      // Ignore a corrupt draft and fall back to the default example.
    }
  }
  return { source: DEFAULT_EXAMPLE.source, exampleId: DEFAULT_EXAMPLE.id };
}

function describeOutcome(run: RunState): string {
  if (run.status === "failed") return `Analysis failed: ${run.message}`;
  if (run.status !== "done") return "";
  const { result } = run.outcome;
  if (!result.ok) return `Compose Doctor could not read the file: ${result.error.message}.`;
  const { summary, findings } = result.report;
  if (findings.length === 0) return "Analysis complete. No problems found.";
  return `Analysis complete. ${findings.length} findings: ${summary.error} errors, ${summary.warning} warnings, ${summary.note} notes.`;
}

export default function PlaygroundPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initial] = useState(() => initialDraft(searchParams.get("example")));
  const [source, setSource] = useState(initial.source);
  const [exampleId, setExampleId] = useState<string | null>(initial.exampleId);
  const [failOn, setFailOn] = useState<FailOn>("error");
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [validation, setValidation] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const editor = useRef<YamlEditorHandle>(null);
  const runCounter = useRef(0);
  // Analyze the initial file as soon as the runtime is ready, so the page shows real output.
  const autoRan = useRef(false);
  const latest = useRef({ source, failOn });
  useEffect(() => {
    latest.current = { source, failOn };
  });
  const runInitial = useRef<() => void>(() => {});
  const { runtime, analyze, restart } = useAnalyzer({ onReady: () => runInitial.current() });

  const example = findExample(exampleId);
  const rules: ReadonlyMap<string, RuleDoc> = useMemo(
    () =>
      runtime.status === "ready" ? new Map(runtime.catalog.rules.map((rule) => [rule.id, rule])) : RULES_BY_ID,
    [runtime],
  );

  // Persist the draft so a reload keeps the user's edits.
  useEffect(() => {
    const timer = setTimeout(() => writeStored(DRAFT_KEY, JSON.stringify({ source, exampleId })), 400);
    return () => clearTimeout(timer);
  }, [source, exampleId]);

  const runAnalysis = useCallback(
    async (text: string, threshold: FailOn) => {
      if (!text.trim()) {
        setValidation("The editor is empty. Paste a Compose file or choose an example first.");
        return;
      }
      if (byteLength(text) > MAX_SOURCE_BYTES) {
        setValidation(
          `This file is ${formatKiB(byteLength(text))}. The playground accepts up to ${formatKiB(MAX_SOURCE_BYTES)}; use the CLI for larger files.`,
        );
        return;
      }
      setValidation(null);
      const id = ++runCounter.current;
      setRun({ status: "running" });
      setAnnouncement("Analyzing…");
      let next: RunState;
      try {
        const outcome = await analyze(text, threshold);
        next = { status: "done", id, outcome, source: text, failOn: threshold };
      } catch (error) {
        if (error instanceof AnalyzerError && error.kind === "too-large") {
          setValidation(error.message);
          next = { status: "idle" };
        } else {
          next = { status: "failed", message: error instanceof Error ? error.message : String(error) };
        }
      }
      if (id !== runCounter.current) return;
      setRun(next);
      setAnnouncement(describeOutcome(next));
    },
    [analyze],
  );

  useEffect(() => {
    runInitial.current = () => {
      if (autoRan.current) return;
      autoRan.current = true;
      if (latest.current.source.trim()) void runAnalysis(latest.current.source, latest.current.failOn);
    };
  }, [runAnalysis]);

  const selectExample = (next: Example) => {
    setExampleId(next.id);
    setSource(next.source);
    setSearchParams({ example: next.id }, { replace: true });
    autoRan.current = true;
    void runAnalysis(next.source, failOn);
  };

  const onEdit = useCallback(
    (value: string) => {
      setSource(value);
      setValidation(null);
      if (searchParams.has("example")) setSearchParams({}, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const reset = () => {
    const target = example ?? DEFAULT_EXAMPLE;
    setExampleId(target.id);
    setSource(target.source);
    editor.current?.focus();
  };

  const clear = () => {
    setSource("");
    setExampleId(null);
    setRun({ status: "idle" });
    setSearchParams({}, { replace: true });
    editor.current?.focus();
  };

  const changeFailOn = (value: FailOn) => {
    setFailOn(value);
    if (run.status === "done") void runAnalysis(run.source, value);
  };

  const submit = useCallback(() => void runAnalysis(source, failOn), [runAnalysis, source, failOn]);

  const markers: EditorMarker[] = useMemo(() => {
    if (run.status !== "done" || run.source !== source) return [];
    const { result } = run.outcome;
    if (!result.ok) {
      return result.error.line === null
        ? []
        : [{ line: result.error.line, column: 1, severity: "error", message: result.error.message }];
    }
    return result.report.findings.map((finding) => ({
      line: finding.line,
      column: finding.column,
      severity: finding.severity,
      message: `${finding.rule_id}: ${finding.message}`,
    }));
  }, [run, source]);

  const stale = run.status === "done" && run.source !== source;
  const busy = run.status === "running";
  const lineCount = source ? source.split("\n").length : 0;
  const modified = example !== undefined && source !== example.source;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col px-3 pb-4 pt-4 sm:px-5 lg:h-[calc(100dvh-3.5rem)]">
      <h1 className="sr-only">Compose Doctor playground</h1>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm font-semibold tracking-tight text-fg">Playground</p>
          <RuntimeBadge runtime={runtime} />
          <p className="flex items-center gap-1.5 text-xs text-subtle">
            <Lock aria-hidden="true" className="size-3.5" />
            Runs the real Python package in your browser. Your YAML is not uploaded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-subtle">
            <span>
              <code className="font-mono">--fail-on</code>
            </span>
            <select
              value={failOn}
              onChange={(event) => changeFailOn(event.target.value as FailOn)}
              className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm text-fg"
            >
              {FAIL_ON_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" onClick={submit} disabled={busy} aria-describedby="analyze-hint">
            {busy ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Play aria-hidden="true" />}
            {busy ? (runtime.status === "ready" ? "Analyzing…" : "Starting…") : "Analyze configuration"}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="editor-title"
          className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card lg:min-h-0"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <h2 id="editor-title" className="sr-only">
              Compose file editor
            </h2>
            <label htmlFor="example-select" className="sr-only">
              Example configuration
            </label>
            <select
              id="example-select"
              value={exampleId ?? CUSTOM}
              onChange={(event) => {
                const next = findExample(event.target.value);
                if (next) selectExample(next);
              }}
              className="h-8 min-w-0 max-w-full flex-1 rounded-lg border border-line bg-surface-2 px-2 text-[13px] font-medium text-fg sm:max-w-72 sm:flex-none"
            >
              {exampleId === null && <option value={CUSTOM}>Your file</option>}
              {CATEGORY_ORDER.map((category) => (
                <optgroup key={category} label={CATEGORY_LABELS[category]}>
                  {EXAMPLES.filter((item) => item.category === category).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {modified && <span className="text-xs text-subtle">edited</span>}
            <div className="ml-auto flex items-center gap-0.5">
              <Button variant="ghost" size="sm" onClick={reset} title={`Restore ${example?.title ?? DEFAULT_EXAMPLE.title}`}>
                <RotateCcw aria-hidden="true" />
                <span className="hidden sm:inline">Reset</span>
                <span className="sr-only sm:hidden">Reset to example</span>
              </Button>
              <CopyButton text={source} label="Copy YAML" />
              <Button variant="ghost" size="sm" onClick={clear} aria-label="Clear editor" title="Clear editor" className="w-8 px-0">
                <Eraser aria-hidden="true" />
              </Button>
            </div>
          </div>
          {example && (
            <p className="border-b border-line bg-surface-2/50 px-4 py-2 text-xs leading-5 text-muted">
              <span className="font-medium text-fg">{example.title}: </span>
              {example.discover}
            </p>
          )}
          <div className="relative min-h-0 flex-1">
            <YamlEditor
              ref={editor}
              value={source}
              onChange={onEdit}
              onSubmit={submit}
              markers={markers}
              labelledBy="editor-title"
              describedBy="analyze-hint"
            />
          </div>
          {validation && (
            <p role="alert" className="border-t border-error-line bg-error-soft px-4 py-2 text-sm text-error">
              {validation}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-[11px] text-subtle">
            <span>
              YAML · {lineCount} {lineCount === 1 ? "line" : "lines"} · {formatKiB(byteLength(source))} of{" "}
              {formatKiB(MAX_SOURCE_BYTES)}
            </span>
            <span id="analyze-hint">
              <kbd className="font-mono">Ctrl/⌘ + Enter</kbd> to analyze · <kbd className="font-mono">Esc</kbd> then{" "}
              <kbd className="font-mono">Tab</kbd> to leave the editor
            </span>
          </div>
        </section>

        <section
          aria-labelledby="results-title"
          aria-busy={busy}
          className={cn(
            "flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card lg:min-h-0",
          )}
        >
          <h2 id="results-title" className="sr-only">
            Analysis results
          </h2>
          <ResultsPanel
            run={run}
            runtime={runtime}
            rules={rules}
            stale={stale}
            onGoTo={(line, column) => editor.current?.goTo(line, column)}
            onRetry={() => {
              setRun({ status: "idle" });
              autoRan.current = false;
              restart();
            }}
          />
        </section>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

function RuntimeBadge({ runtime }: { runtime: ReturnType<typeof useAnalyzer>["runtime"] }) {
  const label =
    runtime.status === "ready"
      ? `compose-doctor ${runtime.catalog.version}`
      : runtime.status === "loading"
        ? "Loading analyzer…"
        : "Analyzer unavailable";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px]",
        runtime.status === "ready" && "border-success-line bg-success-soft text-success",
        runtime.status === "loading" && "border-line bg-surface-2 text-subtle",
        runtime.status === "failed" && "border-error-line bg-error-soft text-error",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          runtime.status === "ready" && "bg-success",
          runtime.status === "loading" && "animate-pulse bg-subtle",
          runtime.status === "failed" && "bg-error",
        )}
      />
      {label}
    </span>
  );
}
