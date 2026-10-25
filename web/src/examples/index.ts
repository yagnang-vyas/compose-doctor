// Example configurations for the playground. The rule IDs each example is expected to produce
// are checked against the real analyzer in src/analyzer/runtime.node.test.ts.

import hardened from "../../../examples/hardened/compose.yaml?raw";
import insecure from "../../../examples/insecure/compose.yaml?raw";
import invalid from "./invalid.yaml?raw";
import malformed from "./malformed.yaml?raw";
import reliability from "./reliability.yaml?raw";
import security from "./security.yaml?raw";
import suppressions from "./suppressions.yaml?raw";

export type ExampleCategory = "mixed" | "security" | "reliability" | "configuration" | "clean";

export type ExampleOutcome =
  | { kind: "findings"; rules: readonly string[]; suppressed?: readonly string[] }
  | { kind: "clean" }
  | { kind: "input-error" };

export interface Example {
  id: string;
  title: string;
  category: ExampleCategory;
  summary: string;
  /** What a visitor should look for after running the analysis. */
  discover: string;
  source: string;
  outcome: ExampleOutcome;
  /** Path in the repository, for examples that come from it. */
  repoPath?: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    id: "insecure",
    title: "Insecure shop stack",
    category: "mixed",
    summary:
      "The repository's deliberately insecure example: a web app, PostgreSQL, Redis, a worker and Adminer.",
    discover:
      "Every one of the 15 checks fires: exposed databases, hard-coded secrets, a privileged worker with the Docker socket, missing healthchecks and more.",
    source: insecure,
    outcome: {
      kind: "findings",
      rules: [
        "CD001", "CD002", "CD003", "CD004", "CD005", "CD006", "CD007", "CD008",
        "CD009", "CD010", "CD011", "CD012", "CD013", "CD014", "CD015",
      ],
    },
    repoPath: "examples/insecure/compose.yaml",
  },
  {
    id: "security",
    title: "Host access and privileges",
    category: "security",
    summary: "A CI runner, a node exporter and a VPN container that all reach deep into the host.",
    discover:
      "Privileged mode, the Docker socket, host mounts of /, /proc and /sys, host networking, a shared PID namespace, NET_ADMIN and a disabled AppArmor profile.",
    source: security,
    outcome: {
      kind: "findings",
      rules: ["CD002", "CD003", "CD004", "CD006", "CD011", "CD012", "CD013", "CD014"],
    },
  },
  {
    id: "reliability",
    title: "Fragile API stack",
    category: "reliability",
    summary: "An API with PostgreSQL and Redis that races its database and stays down after a crash.",
    discover:
      "Unpinned images, missing healthchecks and restart policies, depends_on without a health condition, no memory limits and a fixed container name.",
    source: reliability,
    outcome: {
      kind: "findings",
      rules: ["CD001", "CD007", "CD008", "CD009", "CD010", "CD015"],
    },
  },
  {
    id: "suppressions",
    title: "Suppressions and anchors",
    category: "configuration",
    summary: "Inline and file-wide suppression comments with reasons, plus shared settings in x- blocks.",
    discover:
      "Four findings are suppressed and counted, not lost. The one remaining finding is inherited through a merge key and points at the line inside the x-debug block.",
    source: suppressions,
    outcome: { kind: "findings", rules: ["CD011"], suppressed: ["CD005", "CD007", "CD015"] },
  },
  {
    id: "invalid",
    title: "Invalid Compose entries",
    category: "configuration",
    summary: "Values Docker Compose would reject or silently misread.",
    discover:
      "CD000 flags an out-of-range port, an unknown protocol, a dependency on an undefined service and an unknown restart policy.",
    source: invalid,
    outcome: { kind: "findings", rules: ["CD000"] },
  },
  {
    id: "hardened",
    title: "Hardened shop stack",
    category: "clean",
    summary:
      "The insecure stack with every finding fixed: pinned images, loopback-only ports, secrets from .env and Docker secrets, healthchecks and limits.",
    discover: "A clean result. Compare it with the insecure stack to see what each fix looks like.",
    source: hardened,
    outcome: { kind: "clean" },
    repoPath: "examples/hardened/compose.yaml",
  },
  {
    id: "malformed",
    title: "Malformed YAML",
    category: "configuration",
    summary: "A file with a YAML syntax error.",
    discover:
      "No findings: the analyzer stops with the same input error the CLI prints (exit code 2), pointing at the line where parsing failed.",
    source: malformed,
    outcome: { kind: "input-error" },
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0];

export function findExample(id: string | null | undefined): Example | undefined {
  return EXAMPLES.find((example) => example.id === id);
}

export const CATEGORY_LABELS: Record<ExampleCategory, string> = {
  mixed: "Security + reliability",
  security: "Security",
  reliability: "Reliability",
  configuration: "Configuration",
  clean: "Clean",
};
