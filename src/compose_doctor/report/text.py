"""Plain-text report: one line per finding, an indented fix, then a summary."""

from __future__ import annotations

from compose_doctor.engine import Report, Result, Suppression
from compose_doctor.model import Finding, Severity

_SUPPRESSION_LABELS = {Suppression.INLINE: "inline comment", Suppression.CONFIG: "configuration"}


def _plural(count: int, word: str) -> str:
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def _finding_lines(finding: Finding, suffix: str = "") -> list[str]:
    service = f" [{finding.service}]" if finding.service is not None else ""
    return [
        f"{finding.file}:{finding.line}:{finding.column} {finding.severity} {finding.rule_id}"
        f"{service} {finding.message}{suffix}",
        f"    fix: {finding.fix}",
    ]


def _suppressed_lines(result: Result) -> list[str]:
    assert result.suppression is not None  # only called for suppressed results
    return _finding_lines(
        result.finding, f" (suppressed by {_SUPPRESSION_LABELS[result.suppression]})"
    )


def summary(report: Report) -> str:
    files = _plural(len(report.files), "file")
    suppressed = len(report.suppressed)
    if not report.findings:
        extra = f" ({suppressed} suppressed)" if suppressed else ""
        return f"No problems found in {files}{extra}."
    counts = ", ".join(
        [
            _plural(report.count(Severity.ERROR), "error"),
            _plural(report.count(Severity.WARNING), "warning"),
            _plural(report.count(Severity.NOTE), "note"),
            f"{suppressed} suppressed",
        ]
    )
    return f"{counts} in {files}"


def render(report: Report, *, show_suppressed: bool = False) -> str:
    lines: list[str] = []
    for result in report.results:
        if result.suppression is None:
            lines.extend(_finding_lines(result.finding))
        elif show_suppressed:
            lines.extend(_suppressed_lines(result))
    if lines:
        lines.append("")
    lines.append(summary(report))
    return "\n".join(lines) + "\n"
