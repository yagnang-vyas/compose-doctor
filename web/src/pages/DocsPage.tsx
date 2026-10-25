import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { CodeBlock } from "../components/ui/CodeBlock";
import { SeverityBadge } from "../components/ui/Severity";
import snapshot from "../generated/analyzer-snapshot.json";
import { ANALYZER_VERSION, RULE_DOCS, ruleAnchor } from "../lib/rules";
import { INSTALL_COMMANDS, PIP_GIT_INSTALL, REPO_LINKS } from "../lib/site";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "install", label: "Installation" },
  { id: "usage", label: "Analyze a file" },
  { id: "output", label: "Reading the output" },
  { id: "suppressions", label: "Suppressions" },
  { id: "ci", label: "CI usage" },
  { id: "rules", label: "Rules" },
  { id: "contribute", label: "Issues & contributing" },
];

const USAGE = `# Lint compose.yaml (or compose.yml, docker-compose.yaml, docker-compose.yml) in this directory
compose-doctor

# Lint specific files, or standard input
compose-doctor deploy/compose.yaml deploy/compose.prod.yaml
cat compose.yaml | compose-doctor -

# Fail CI on warnings too, and write SARIF for code scanning
compose-doctor --fail-on warning --format sarif > compose-doctor.sarif

# See every rule with its rationale and fix
compose-doctor --list-rules`;

// Two lines of real CLI output, taken from the generated snapshot rather than typed by hand.
const TEXT_SAMPLE = (() => {
  const lines = snapshot.preview.text.split("\n");
  const index = lines.findIndex((line) => line.includes(" CD005 "));
  return lines.slice(index, index + 2).join("\n");
})();

const SUPPRESSION_SAMPLE = `services:
  db:
    image: postgres:16.4
    ports:
      # compose-doctor: ignore CD005 -- only reachable through the VPN
      - "10.8.0.1:5432:5432"
    container_name: db  # compose-doctor: ignore CD015

# compose-doctor: ignore-file CD010`;

const CONFIG_SAMPLE = `ignore: [CD015]          # ignore these rules everywhere
services:
  worker:
    ignore: [CD007]      # ignore these rules for one service
severity:
  CD010: warning         # change a rule's severity
fail_on: warning         # default for --fail-on`;

const EXIT_CODES = [
  ["0", "No unsuppressed finding at or above --fail-on (default error)"],
  ["1", "At least one such finding"],
  ["2", "Usage or input error: bad flag, missing file, YAML error, invalid config"],
  ["130", "Interrupted (Ctrl-C)"],
  ["141", "Output pipe closed early, for example by | head"],
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="border-b border-line py-10 first:pt-0 last:border-b-0">
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-px [&_code]:text-[13px] [&_code]:text-fg [&_pre_code]:bg-transparent [&_pre_code]:p-0">
        {children}
      </div>
    </section>
  );
}

function ExternalA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline-offset-4 hover:underline">
      {children}
    </a>
  );
}

export function DocsPage() {
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <nav aria-label="On this page">
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">On this page</p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 lg:flex-col">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-sm text-muted hover:text-fg">
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={REPO_LINKS.readme}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            Full README <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </nav>
      </aside>

      <article className="min-w-0 max-w-3xl">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Getting started</h1>
          <p className="mt-4 text-lg leading-8 text-muted">
            A short guide to Compose Doctor {ANALYZER_VERSION}. The <ExternalA href={REPO_LINKS.readme}>README</ExternalA>{" "}
            is the complete reference.
          </p>
        </header>

        <Section id="overview" title="What Compose Doctor does">
          <p>
            Compose Doctor reads Docker Compose files and reports security holes, misconfigurations and
            reliability problems, each with the exact line, the affected service and a concrete fix. It does
            not change your files, and it does not run Docker.
          </p>
          <p>
            It lints each file on its own: override files are not merged, <code>{"${VAR}"}</code>{" "}
            interpolation is detected but not resolved, and <code>.env</code> files are not read. It also only
            sees the Compose file, so a healthcheck in an image's Dockerfile is invisible to it.
          </p>
        </Section>

        <Section id="install" title="Installation">
          <p>
            Compose Doctor is not published on PyPI. Install it from a clone with Python 3.10 or newer:
          </p>
          <CodeBlock code={INSTALL_COMMANDS} prompt label="Terminal" />
          <p>Or install straight from GitHub, for example in a CI job:</p>
          <CodeBlock code={PIP_GIT_INSTALL} prompt />
        </Section>

        <Section id="usage" title="Analyze a Compose file">
          <CodeBlock code={USAGE} prompt label="Usage" />
          <p>
            <code>python -m compose_doctor</code> works the same as <code>compose-doctor</code>. To try it
            without installing anything, use the <Link className="font-medium text-accent underline-offset-4 hover:underline" to="/playground">playground</Link>,
            which runs the same Python package in your browser.
          </p>
        </Section>

        <Section id="output" title="Reading the output">
          <p>Each finding is one line with its location, severity, rule ID and service, followed by the fix:</p>
          <CodeBlock code={TEXT_SAMPLE} />
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <SeverityBadge severity="error" /> Settings that expose the host, data or credentials, and
              configuration Compose would reject. Fails the default <code>--fail-on error</code> gate.
            </li>
            <li>
              <SeverityBadge severity="warning" /> Problems that cause outages or drift, such as unpinned
              images or missing healthchecks.
            </li>
            <li>
              <SeverityBadge severity="note" /> Best practices worth a look, such as memory limits.
            </li>
          </ul>
          <p>
            <code>--format json</code> prints a stable object (<code>schema_version</code> 1), and{" "}
            <code>--format sarif</code> prints SARIF 2.1.0 for code scanning.
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Exit codes</caption>
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Exit code</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {EXIT_CODES.map(([code, meaning]) => (
                  <tr key={code}>
                    <td className="px-4 py-2.5 font-mono text-fg">{code}</td>
                    <td className="px-4 py-2.5">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="suppressions" title="Suppressions and configuration">
          <p>
            Suppress a finding with a comment on its line or on the line above. Anything after{" "}
            <code>--</code> is a free-text reason. Unknown rule IDs are an error, so a typo cannot silently
            suppress nothing.
          </p>
          <CodeBlock code={SUPPRESSION_SAMPLE} label="compose.yaml" />
          <p>
            A <code>.compose-doctor.yml</code> file in the current directory (or <code>--config PATH</code>)
            sets global and per-service ignores, severity overrides and the default <code>fail_on</code>:
          </p>
          <CodeBlock code={CONFIG_SAMPLE} label=".compose-doctor.yml" />
        </Section>

        <Section id="ci" title="CI usage">
          <p>Any CI system can use the exit code as a gate:</p>
          <CodeBlock code="compose-doctor --fail-on warning" prompt />
          <p>
            On GitHub, upload SARIF so findings appear as code scanning alerts on the lines they refer to. The{" "}
            <ExternalA href={`${REPO_LINKS.repo}#ci-usage`}>README's CI section</ExternalA> has a
            complete workflow.
          </p>
        </Section>

        <Section id="rules" title="Rules">
          <p>
            Generated from the analyzer's rule registry, the same source as <code>compose-doctor --list-rules</code>.
          </p>
          <ul className="space-y-3">
            {RULE_DOCS.map((rule) => (
              <li
                key={rule.id}
                id={ruleAnchor(rule.id)}
                className="scroll-mt-24 rounded-xl border border-line bg-surface p-5 target:border-accent target:ring-1 target:ring-accent"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-sm text-subtle">{rule.id}</span>
                  <h3 className="font-semibold text-fg">{rule.title}</h3>
                  <SeverityBadge severity={rule.severity} />
                </div>
                <p className="mt-3 text-sm leading-6">{rule.rationale}</p>
                <p className="mt-2 text-sm leading-6">
                  <span className="font-medium text-fg">Fix: </span>
                  {rule.fix}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="contribute" title="Issues and contributing">
          <p>
            Found a false positive, a missed problem or a bug? <ExternalA href={REPO_LINKS.newIssue}>Open an issue</ExternalA>{" "}
            with a minimal Compose file. Contributors should read{" "}
            <ExternalA href={REPO_LINKS.contributing}>AGENTS.md</ExternalA> for the ground rules and{" "}
            <ExternalA href={REPO_LINKS.spec}>SPEC.md</ExternalA> for the design. Each rule has good and bad
            fixtures, and <code>make check</code> runs linting, strict type checking and the tests.
          </p>
        </Section>
      </article>
    </div>
  );
}
