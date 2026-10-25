// Shapes returned by bridge.py. They mirror Compose Doctor's JSON report (schema_version 1).

export type Severity = "error" | "warning" | "note";
export type FailOn = Severity | "never";

export const SEVERITIES: readonly Severity[] = ["error", "warning", "note"];
export const FAIL_ON_CHOICES: readonly FailOn[] = ["error", "warning", "note", "never"];

export interface Finding {
  rule_id: string;
  severity: Severity;
  file: string;
  line: number;
  column: number;
  service: string | null;
  message: string;
  fix: string;
}

export interface SuppressedFinding extends Finding {
  suppression: "inline" | "config";
}

export interface JsonReport {
  schema_version: number;
  tool: { name: string; version: string };
  files: string[];
  summary: Record<Severity | "suppressed", number>;
  findings: Finding[];
  suppressed: SuppressedFinding[];
}

export interface AnalysisSuccess {
  ok: true;
  exit_code: 0 | 1;
  services: string[];
  report: JsonReport;
  /** The CLI's text output. */
  text: string;
  /** The CLI's `--format json --show-suppressed` output. */
  json: string;
  /** The CLI's `--format sarif` output. */
  sarif: string;
}

export interface AnalysisInputError {
  ok: false;
  exit_code: 2;
  error: { message: string; line: number | null; display: string };
}

export type AnalysisResult = AnalysisSuccess | AnalysisInputError;

export interface RuleDoc {
  id: string;
  title: string;
  severity: Severity;
  rationale: string;
  fix: string;
}

export interface RuleCatalog {
  version: string;
  rules: RuleDoc[];
}
