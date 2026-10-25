"""SARIF 2.1.0 report, suitable for GitHub code scanning.

Every rule is listed in ``tool.driver.rules``. Suppressed findings are included with a
``suppressions`` entry (``inSource`` for comments, ``external`` for configuration) so code
scanning shows them as dismissed instead of losing them. Output is deterministic.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from compose_doctor import __version__
from compose_doctor.engine import Report, Result
from compose_doctor.rules import RULES
from compose_doctor.rules.base import Rule

SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json"
INFORMATION_URI = "https://github.com/yagnang-vyas/compose-doctor"
STDIN_URI = "stdin"

_RULE_INDEX = {rule.id: index for index, rule in enumerate(RULES)}


def _rule_name(rule: Rule) -> str:
    """``Unpinned image`` -> ``UnpinnedImage`` (SARIF names are identifier-like)."""
    return "".join(word[:1].upper() + word[1:] for word in rule.title.replace("_", " ").split())


def _rule(rule: Rule) -> dict[str, Any]:
    return {
        "id": rule.id,
        "name": _rule_name(rule),
        "shortDescription": {"text": rule.title},
        "fullDescription": {"text": rule.rationale},
        "help": {"text": rule.fix},
        "defaultConfiguration": {"level": rule.severity.value},
    }


def artifact_uri(path: str) -> str:
    """Path relative to the current directory with forward slashes, as code scanning expects."""
    if path == "<stdin>":
        return STDIN_URI
    absolute = Path(path).resolve()
    try:
        return absolute.relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return absolute.as_uri()  # outside the working directory: an absolute file URI


def _result(result: Result) -> dict[str, Any]:
    finding = result.finding
    data: dict[str, Any] = {
        "ruleId": finding.rule_id,
        "ruleIndex": _RULE_INDEX[finding.rule_id],
        "level": finding.severity.value,
        "message": {"text": finding.message},
        "locations": [
            {
                "physicalLocation": {
                    "artifactLocation": {"uri": artifact_uri(finding.file)},
                    "region": {"startLine": finding.line, "startColumn": finding.column},
                }
            }
        ],
    }
    if result.suppression is not None:
        data["suppressions"] = [{"kind": result.suppression.value}]
    return data


def to_dict(report: Report) -> dict[str, Any]:
    return {
        "$schema": SARIF_SCHEMA,
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "compose-doctor",
                        "version": __version__,
                        "informationUri": INFORMATION_URI,
                        "rules": [_rule(rule) for rule in RULES],
                    }
                },
                "results": [_result(result) for result in report.results],
            }
        ],
    }


def render(report: Report) -> str:
    return json.dumps(to_dict(report), indent=2) + "\n"
