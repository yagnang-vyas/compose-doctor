"""Lint loaded files: run rules, apply severity overrides and suppressions."""

from __future__ import annotations

import dataclasses
from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum

from compose_doctor.config import Config
from compose_doctor.model import ComposeFile, Finding, Severity
from compose_doctor.rules import RULES_BY_ID, run_rules, sort_key
from compose_doctor.suppress import parse_suppressions


class Suppression(Enum):
    """Why a finding was suppressed. Values are SARIF ``suppression.kind`` values."""

    INLINE = "inSource"
    CONFIG = "external"


@dataclass(frozen=True)
class Result:
    finding: Finding
    suppression: Suppression | None = None


@dataclass(frozen=True)
class Report:
    files: tuple[str, ...]
    results: tuple[Result, ...]

    @property
    def findings(self) -> list[Finding]:
        """Unsuppressed findings."""
        return [r.finding for r in self.results if r.suppression is None]

    @property
    def suppressed(self) -> list[Result]:
        return [r for r in self.results if r.suppression is not None]

    def count(self, severity: Severity) -> int:
        return sum(1 for finding in self.findings if finding.severity is severity)

    def fails(self, fail_on: str) -> bool:
        """Whether any unsuppressed finding is at or above ``fail_on`` (or never, for "never")."""
        if fail_on == "never":
            return False
        threshold = Severity(fail_on).rank
        return any(finding.severity.rank >= threshold for finding in self.findings)


def lint_file(compose: ComposeFile, config: Config) -> list[Result]:
    inline = parse_suppressions(compose.source, compose.path, RULES_BY_ID)
    results = []
    for finding in run_rules(compose):
        override = config.severity.get(finding.rule_id)
        if override is not None:
            finding = dataclasses.replace(finding, severity=override)
        if inline.covers(finding.rule_id, finding.line):
            results.append(Result(finding, Suppression.INLINE))
        elif config.ignores(finding.rule_id, finding.service):
            results.append(Result(finding, Suppression.CONFIG))
        else:
            results.append(Result(finding))
    return results


def lint(files: Sequence[ComposeFile], config: Config) -> Report:
    results = [result for compose in files for result in lint_file(compose, config)]
    results.sort(key=lambda result: sort_key(result.finding))
    return Report(files=tuple(compose.path for compose in files), results=tuple(results))
