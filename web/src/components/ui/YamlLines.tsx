import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

const KEY = /^(\s*(?:-\s+)?)([A-Za-z_][\w.-]*)(:)(.*)$/;

function renderValue(text: string): ReactNode {
  const comment = text.indexOf(" #");
  const value = comment >= 0 ? text.slice(0, comment) : text;
  const rest = comment >= 0 ? text.slice(comment) : "";
  return (
    <>
      <span className={/^\s*["']/.test(value) ? "text-[var(--code-string)]" : undefined}>{value}</span>
      {rest && <span className="text-[var(--code-comment)]">{rest}</span>}
    </>
  );
}

function renderLine(line: string): ReactNode {
  if (/^\s*#/.test(line)) return <span className="text-[var(--code-comment)]">{line}</span>;
  const match = KEY.exec(line);
  if (match) {
    const [, indent, key, colon, rest] = match;
    return (
      <>
        {indent}
        <span className="text-[var(--code-key)]">{key}</span>
        {colon}
        {renderValue(rest)}
      </>
    );
  }
  const item = /^(\s*-\s+)(.*)$/.exec(line);
  if (item) return <>{item[1]}{renderValue(item[2])}</>;
  return line;
}

interface YamlLinesProps {
  source: string;
  /** Line numbers to mark, with the most severe tone for each. */
  marks?: ReadonlyMap<number, "error" | "warning" | "note">;
  className?: string;
}

const markTone = {
  error: "bg-error-soft border-l-error",
  warning: "bg-warning-soft border-l-warning",
  note: "bg-note-soft border-l-note",
};

/** Read-only, lightly highlighted YAML with line numbers, for static previews. */
export function YamlLines({ source, marks, className }: YamlLinesProps) {
  const lines = source.replace(/\n$/, "").split("\n");
  return (
    <pre className={cn("overflow-x-auto py-3 font-mono text-[12.5px] leading-[1.7]", className)}>
      <code>
        {lines.map((line, index) => {
          const mark = marks?.get(index + 1);
          return (
            <span
              key={index}
              className={cn("flex border-l-2 border-l-transparent pr-4", mark && markTone[mark])}
            >
              <span aria-hidden="true" className="w-10 shrink-0 select-none pr-3 text-right text-subtle/70">
                {index + 1}
              </span>
              <span className="whitespace-pre">{renderLine(line) || " "}</span>
            </span>
          );
        })}
      </code>
    </pre>
  );
}
