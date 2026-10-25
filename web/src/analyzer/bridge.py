"""Entry point the web playground calls inside Pyodide.

It only wires the unmodified ``compose_doctor`` package together the way ``cli.py`` does for
standard input: load the text with ``load_bytes``, lint it with the default configuration and
render the real JSON, text and SARIF reports. Nothing here reads files, the environment or the
network, and the input is never executed.
"""

from __future__ import annotations

import json
from typing import Any

from compose_doctor import __version__
from compose_doctor.config import FAIL_ON_CHOICES, Config
from compose_doctor.engine import lint
from compose_doctor.errors import InputError
from compose_doctor.loader import load_bytes
from compose_doctor.report import json_report, sarif, text
from compose_doctor.rules import RULES

EXIT_OK = 0
EXIT_FINDINGS = 1
EXIT_USAGE = 2


def rules() -> str:
    """Every registered rule with its documentation, as JSON."""
    return json.dumps(
        {
            "version": __version__,
            "rules": [
                {
                    "id": rule.id,
                    "title": rule.title,
                    "severity": rule.severity.value,
                    "rationale": rule.rationale,
                    "fix": rule.fix,
                }
                for rule in RULES
            ],
        }
    )


def analyze(source: str, filename: str, fail_on: str) -> str:
    """Lint ``source`` as the CLI would lint a file named ``filename``, as JSON.

    The result is ``{"ok": true, ...}`` with the reports, or ``{"ok": false, "error": ...}``
    with the same message the CLI prints to stderr (exit code 2).
    """
    if fail_on not in FAIL_ON_CHOICES:
        raise ValueError(f"fail_on must be one of {', '.join(FAIL_ON_CHOICES)}")
    result: dict[str, Any]
    try:
        compose = load_bytes(source.encode("utf-8"), filename)
    except InputError as exc:
        result = {
            "ok": False,
            "exit_code": EXIT_USAGE,
            "error": {
                "message": exc.message,
                "line": exc.line,
                "display": f"compose-doctor: error: {exc}",
            },
        }
        return json.dumps(result)

    report = lint([compose], Config(fail_on=fail_on))
    result = {
        "ok": True,
        "exit_code": EXIT_FINDINGS if report.fails(fail_on) else EXIT_OK,
        "services": [service.name for service in compose.services],
        "report": json_report.to_dict(report, show_suppressed=True),
        "text": text.render(report),
        "json": json_report.render(report, show_suppressed=True),
        "sarif": sarif.render(report),
    }
    return json.dumps(result)
