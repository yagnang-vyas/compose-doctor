"""Rule registry."""

from __future__ import annotations

from compose_doctor.model import ComposeFile, Finding
from compose_doctor.rules import images, network, reliability, resources, security, validation
from compose_doctor.rules.base import Rule

RULES: tuple[Rule, ...] = tuple(
    sorted(
        (
            *validation.RULES,
            *images.RULES,
            *security.RULES,
            *network.RULES,
            *reliability.RULES,
            *resources.RULES,
        ),
        key=lambda rule: rule.id,
    )
)

RULES_BY_ID: dict[str, Rule] = {rule.id: rule for rule in RULES}


def sort_key(finding: Finding) -> tuple[str, int, str]:
    return (finding.file, finding.line, finding.rule_id)


def run_rules(compose: ComposeFile, rules: tuple[Rule, ...] = RULES) -> list[Finding]:
    """Run ``rules`` against every service and return findings sorted by file, line and rule."""
    findings = [
        finding
        for service in compose.services
        for rule in rules
        for finding in rule.check(service, compose)
    ]
    return sorted(findings, key=sort_key)


__all__ = ["RULES", "RULES_BY_ID", "Rule", "run_rules", "sort_key"]
