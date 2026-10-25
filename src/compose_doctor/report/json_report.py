"""JSON report (``schema_version`` 1).

```
{
  "schema_version": 1,
  "tool": {"name": "compose-doctor", "version": "0.1.0"},
  "files": ["compose.yaml"],
  "summary": {"error": 0, "warning": 0, "note": 0, "suppressed": 0},
  "findings": [{"rule_id", "severity", "file", "line", "column", "service", "message", "fix"}],
  "suppressed": [... same fields plus "suppression": "inline" | "config"]   # --show-suppressed
}
```
"""

from __future__ import annotations

import json
from typing import Any

from compose_doctor import __version__
from compose_doctor.engine import Report, Suppression
from compose_doctor.model import Finding, Severity

SCHEMA_VERSION = 1

_SUPPRESSION_NAMES = {Suppression.INLINE: "inline", Suppression.CONFIG: "config"}


def _finding(finding: Finding) -> dict[str, Any]:
    return {
        "rule_id": finding.rule_id,
        "severity": finding.severity.value,
        "file": finding.file,
        "line": finding.line,
        "column": finding.column,
        "service": finding.service,
        "message": finding.message,
        "fix": finding.fix,
    }


def to_dict(report: Report, *, show_suppressed: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "tool": {"name": "compose-doctor", "version": __version__},
        "files": list(report.files),
        "summary": {
            "error": report.count(Severity.ERROR),
            "warning": report.count(Severity.WARNING),
            "note": report.count(Severity.NOTE),
            "suppressed": len(report.suppressed),
        },
        "findings": [_finding(finding) for finding in report.findings],
    }
    if show_suppressed:
        data["suppressed"] = [
            {**_finding(r.finding), "suppression": _SUPPRESSION_NAMES[r.suppression]}
            for r in report.suppressed
            if r.suppression is not None
        ]
    return data


def render(report: Report, *, show_suppressed: bool = False) -> str:
    return json.dumps(to_dict(report, show_suppressed=show_suppressed), indent=2) + "\n"
