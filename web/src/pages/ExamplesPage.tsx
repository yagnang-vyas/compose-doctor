import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonClass } from "../components/ui/Button";
import { CATEGORY_LABELS, EXAMPLES, type Example } from "../examples";
import { cn } from "../lib/cn";
import { repoFile } from "../lib/site";

function OutcomeChips({ example }: { example: Example }) {
  const { outcome } = example;
  if (outcome.kind === "clean") {
    return <span className="rounded-md bg-success-soft px-2 py-0.5 text-xs font-medium text-success">No findings</span>;
  }
  if (outcome.kind === "input-error") {
    return <span className="rounded-md bg-error-soft px-2 py-0.5 text-xs font-medium text-error">Input error, exit 2</span>;
  }
  return (
    <>
      {outcome.rules.map((id) => (
        <span key={id} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
          {id}
        </span>
      ))}
      {outcome.suppressed && (
        <span className="rounded-md border border-dashed border-line-strong px-1.5 py-0.5 text-[11px] text-subtle">
          + {outcome.suppressed.join(", ")} suppressed
        </span>
      )}
    </>
  );
}

export function ExamplesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Example configurations</h1>
        <p className="mt-4 text-lg leading-8 text-muted">
          Realistic Compose files that exercise the rules. Open one in the playground to run the analyzer on
          it and edit it. The rule IDs listed for each example are checked against the analyzer in the
          project's test suite.
        </p>
      </header>
      <ul className="mt-12 grid gap-5 md:grid-cols-2">
        {EXAMPLES.map((example) => (
          <li key={example.id} className="flex flex-col rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-subtle">
                {CATEGORY_LABELS[example.category]}
              </span>
              {example.repoPath && (
                <a
                  href={repoFile(example.repoPath)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-subtle hover:text-fg hover:underline"
                >
                  {example.repoPath}
                </a>
              )}
            </div>
            <h2 className="mt-3 text-lg font-semibold tracking-tight">{example.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{example.summary}</p>
            <div className="mt-4 rounded-xl bg-surface-2 p-4">
              <h3 className="text-xs font-semibold text-fg">What you will find</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted">{example.discover}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <OutcomeChips example={example} />
              </div>
            </div>
            <div className="mt-auto pt-5">
              <Link
                to={`/playground?example=${example.id}`}
                className={cn(buttonClass("secondary", "md"))}
                aria-label={`Open ${example.title} in the playground`}
              >
                Open in playground <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
