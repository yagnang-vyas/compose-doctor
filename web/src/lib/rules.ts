// Rule catalogue from the generated analyzer snapshot, grouped for presentation.

import type { RuleDoc, Severity } from "../analyzer/types";
import snapshot from "../generated/analyzer-snapshot.json";

export type RuleCategory = "security" | "reliability" | "configuration";

export const ANALYZER_VERSION: string = snapshot.version;

export const RULE_DOCS: readonly RuleDoc[] = snapshot.rules.map((rule) => ({
  ...rule,
  severity: rule.severity as Severity,
}));

export const RULES_BY_ID: ReadonlyMap<string, RuleDoc> = new Map(
  RULE_DOCS.map((rule) => [rule.id, rule]),
);

/** Grouping used by the README's feature list. */
const CATEGORY_BY_ID: Record<string, RuleCategory> = {
  CD000: "configuration",
  CD001: "reliability",
  CD002: "security",
  CD003: "security",
  CD004: "security",
  CD005: "security",
  CD006: "security",
  CD007: "reliability",
  CD008: "reliability",
  CD009: "reliability",
  CD010: "reliability",
  CD011: "security",
  CD012: "security",
  CD013: "security",
  CD014: "security",
  CD015: "reliability",
};

export function ruleCategory(id: string): RuleCategory {
  return CATEGORY_BY_ID[id] ?? "configuration";
}

export function rulesIn(category: RuleCategory): RuleDoc[] {
  return RULE_DOCS.filter((rule) => ruleCategory(rule.id) === category);
}

export function ruleAnchor(id: string): string {
  return id.toLowerCase();
}
