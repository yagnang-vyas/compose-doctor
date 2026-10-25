import {
  ArrowRight,
  BellOff,
  Braces,
  EyeOff,
  FileCheck2,
  GitPullRequest,
  HeartPulse,
  type LucideIcon,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { JsonReport, Severity } from "../analyzer/types";
import { ButtonLink, ExternalButtonLink } from "../components/ui/Button";
import { CodeBlock } from "../components/ui/CodeBlock";
import { GitHubIcon } from "../components/ui/icons";
import { SeverityIcon } from "../components/ui/Severity";
import { YamlLines } from "../components/ui/YamlLines";
import snapshot from "../generated/analyzer-snapshot.json";
import { ANALYZER_VERSION, type RuleCategory, ruleAnchor, rulesIn } from "../lib/rules";
import { INSTALL_COMMANDS, REPO_LINKS } from "../lib/site";

const preview = snapshot.preview as { source: string; text: string; report: JsonReport };

const RANK: Record<Severity, number> = { error: 3, warning: 2, note: 1 };

function previewMarks(): Map<number, Severity> {
  const marks = new Map<number, Severity>();
  for (const finding of preview.report.findings) {
    const current = marks.get(finding.line);
    if (!current || RANK[finding.severity] > RANK[current]) marks.set(finding.line, finding.severity);
  }
  return marks;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function ProductPreview() {
  const { summary, findings } = preview.report;
  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_8px_30px_rgb(0_0_0/0.06)]">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </span>
        <span className="ml-2 font-mono text-xs text-subtle">compose-doctor compose.yaml</span>
      </div>
      <div className="grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-line md:border-b-0 md:border-r">
          <div className="px-4 pt-3 font-mono text-[11px] uppercase tracking-wider text-subtle">compose.yaml</div>
          <YamlLines source={preview.source} marks={previewMarks()} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 text-xs">
            <span className="font-medium text-fg">{findings.length} findings</span>
            <span className="text-error">{plural(summary.error, "error")}</span>
            <span className="text-warning">{plural(summary.warning, "warning")}</span>
            <span className="text-note">{plural(summary.note, "note")}</span>
          </div>
          <ul className="divide-y divide-line">
            {findings.map((finding) => (
              <li key={`${finding.rule_id}-${finding.line}`} className="flex gap-3 px-4 py-2.5">
                <SeverityIcon severity={finding.severity} className="mt-0.5" />
                <div className="min-w-0 text-[13px] leading-5">
                  <p className="text-fg">{finding.message}</p>
                  <p className="mt-0.5 font-mono text-[11.5px] text-subtle">
                    {finding.rule_id} · line {finding.line}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="border-t border-line bg-surface-2 px-4 py-2.5 text-xs text-subtle">
        Actual output of Compose Doctor {ANALYZER_VERSION} for this file, generated from the analyzer at
        build time.
      </figcaption>
    </figure>
  );
}

const CATEGORIES: { id: RuleCategory; title: string; Icon: LucideIcon; blurb: string }[] = [
  {
    id: "security",
    title: "Security",
    Icon: ShieldCheck,
    blurb: "Settings that hand a container the keys to the host or leak credentials.",
  },
  {
    id: "reliability",
    title: "Reliability",
    Icon: HeartPulse,
    blurb: "Gaps that make deployments drift, race on startup or stay down after a crash.",
  },
  {
    id: "configuration",
    title: "Configuration",
    Icon: FileCheck2,
    blurb: "Entries Docker Compose would reject or silently read differently than intended.",
  },
];

function RuleCategories() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {CATEGORIES.map(({ id, title, Icon, blurb }) => {
        const rules = rulesIn(id);
        return (
          <section key={id} aria-labelledby={`cat-${id}`} className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon aria-hidden="true" className="size-[18px]" />
              </span>
              <div>
                <h3 id={`cat-${id}`} className="font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="text-xs text-subtle">
                  {rules.length} {rules.length === 1 ? "rule" : "rules"}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">{blurb}</p>
            <ul className="mt-4 space-y-1.5">
              {rules.map((rule) => (
                <li key={rule.id}>
                  <Link
                    to={`/docs#${ruleAnchor(rule.id)}`}
                    className="group flex items-baseline gap-3 rounded-md text-sm text-fg"
                  >
                    <span className="font-mono text-xs text-subtle">{rule.id}</span>
                    <span className="group-hover:underline group-hover:underline-offset-4">{rule.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const FEATURES: { title: string; body: string; Icon: LucideIcon }[] = [
  {
    title: "Accurate line numbers",
    body: "Findings point at the exact line, even through YAML anchors, aliases and << merge keys.",
    Icon: MapPin,
  },
  {
    title: "A concrete fix for every finding",
    body: "Each rule documents why it matters and what to change, and every finding carries the fix.",
    Icon: Wrench,
  },
  {
    title: "Text, JSON and SARIF 2.1.0",
    body: "Readable in a terminal, stable JSON for scripts, and SARIF for GitHub code scanning.",
    Icon: Braces,
  },
  {
    title: "Suppressions with reasons",
    body: "Inline ignore comments and a config file. Suppressed findings are counted, never lost.",
    Icon: BellOff,
  },
  {
    title: "Never prints secrets",
    body: "Findings about environment variables name the key, never the value.",
    Icon: EyeOff,
  },
  {
    title: "CI-friendly exit codes",
    body: "Gate pipelines with --fail-on error, warning or note, and a documented exit code for each case.",
    Icon: SlidersHorizontal,
  },
];

const WORKFLOW = [
  {
    step: "Run it on your Compose file",
    detail: "With no arguments it finds compose.yaml (or docker-compose.yml) in the current directory.",
    code: "compose-doctor",
  },
  {
    step: "Fix or suppress each finding",
    detail: "Apply the suggested fix, or record a deliberate exception with a reason.",
    code: "# compose-doctor: ignore CD005 -- only reachable through the VPN",
  },
  {
    step: "Gate CI and upload SARIF",
    detail: "Fail the build on warnings and show findings as code scanning alerts.",
    code: "compose-doctor --fail-on warning --format sarif > compose-doctor.sarif",
  },
];

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h2>
      {children && <p className="mt-3 text-base leading-7 text-muted">{children}</p>}
    </div>
  );
}

export function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--line)_1px,transparent_1px),linear-gradient(to_bottom,var(--line)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:gap-14 lg:pb-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              Open source · v{ANALYZER_VERSION} · MIT
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl">
              Catch Docker Compose issues before they reach production.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
              Compose Doctor is a command-line linter that finds exposed databases, hard-coded secrets,
              privileged containers, missing healthchecks and 12 other kinds of problems in your Compose files, and
              tells you the exact line and the fix.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/playground" variant="primary" size="lg">
                Try the Playground <ArrowRight aria-hidden="true" />
              </ButtonLink>
              <ExternalButtonLink href={REPO_LINKS.repo} size="lg">
                <GitHubIcon /> View on GitHub
              </ExternalButtonLink>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6 text-sm">
              <div>
                <dt className="text-subtle">Rules</dt>
                <dd className="mt-1 font-semibold text-fg">{snapshot.rules.length}</dd>
              </div>
              <div>
                <dt className="text-subtle">Python</dt>
                <dd className="mt-1 font-semibold text-fg">3.10+</dd>
              </div>
              <div>
                <dt className="text-subtle">Dependencies</dt>
                <dd className="mt-1 font-semibold text-fg">PyYAML</dd>
              </div>
            </dl>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6" aria-labelledby="checks">
        <div id="checks">
          <SectionHeading eyebrow="What it checks" title={`${snapshot.rules.length} documented rules, grouped by risk`}>
            Every rule explains why the setting is dangerous and how to fix it. Select a rule to read its
            rationale.
          </SectionHeading>
        </div>
        <div className="mt-10">
          <RuleCategories />
        </div>
      </section>

      <section className="border-y border-line bg-surface" aria-labelledby="features">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div id="features">
            <SectionHeading eyebrow="Built for developer workflows" title="Small, precise and safe to run in CI">
              One runtime dependency, safe YAML parsing that rejects alias bombs, and output formats for
              people, scripts and code scanning.
            </SectionHeading>
          </div>
          <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ title, body, Icon }) => (
              <li key={title} className="bg-surface p-6">
                <Icon aria-hidden="true" className="size-5 text-accent" />
                <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6" aria-labelledby="workflow">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <div id="workflow">
              <SectionHeading eyebrow="How it fits in" title="From first run to a CI gate" />
            </div>
            <ol className="mt-8 space-y-6">
              {WORKFLOW.map((item, index) => (
                <li key={item.step} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-4">
                  <span className="grid size-8 place-items-center rounded-full border border-line bg-surface font-mono text-sm text-muted">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold tracking-tight">{item.step}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted">{item.detail}</p>
                    <code className="mt-3 block overflow-x-auto whitespace-pre rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-fg">
                      {item.code}
                    </code>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div id="install">
            <SectionHeading eyebrow="Installation" title="Install from source">
              Compose Doctor is not published on PyPI yet. Install it from a clone with Python 3.10 or newer.
            </SectionHeading>
            <CodeBlock className="mt-8" code={INSTALL_COMMANDS} prompt label="Terminal" />
            <p className="mt-4 flex items-start gap-2 text-sm text-muted">
              <Terminal aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-subtle" />
              <span>
                <code className="text-fg">python -m compose_doctor</code> works the same as{" "}
                <code className="text-fg">compose-doctor</code>. See the <Link className="text-accent underline-offset-4 hover:underline" to="/docs">docs</Link> for usage.
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight">Open source, MIT licensed</h2>
            <p className="mt-3 leading-7 text-muted">
              Read the code, open an issue, or propose a rule. The specification records every design
              decision, and every sample in the README comes from running the CLI.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ExternalButtonLink href={REPO_LINKS.repo} variant="primary">
              <GitHubIcon /> Star on GitHub
            </ExternalButtonLink>
            <ExternalButtonLink href={REPO_LINKS.newIssue}>
              <GitPullRequest aria-hidden="true" /> Report an issue
            </ExternalButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
