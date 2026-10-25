from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

from compose_doctor.config import Config
from compose_doctor.engine import Report, Suppression, lint
from compose_doctor.loader import load_text
from compose_doctor.model import Severity
from compose_doctor.report import render
from compose_doctor.report.sarif import artifact_uri
from compose_doctor.rules import RULES

SOURCE = textwrap.dedent(
    """\
    services:
      web:
        image: nginx:1.27
        restart: always
        mem_limit: 64m
        container_name: web  # compose-doctor: ignore CD015
        privileged: true
      worker:
        image: worker:1.0
        restart: always
        # compose-doctor: ignore CD002
        privileged: true
    """
)


def report(config: Config | None = None, source: str = SOURCE) -> Report:
    return lint([load_text(source, "compose.yaml")], config or Config())


def test_inline_and_config_suppressions() -> None:
    result = report(Config(service_ignores={"worker": frozenset({"CD010"})}))
    assert [(f.rule_id, f.service) for f in result.findings] == [("CD002", "web")]
    suppressed = {(r.finding.rule_id, r.finding.service, r.suppression) for r in result.suppressed}
    assert suppressed == {
        ("CD015", "web", Suppression.INLINE),
        ("CD002", "worker", Suppression.INLINE),
        ("CD010", "worker", Suppression.CONFIG),
    }


def test_global_ignore() -> None:
    result = report(Config(ignore=frozenset({"CD002"})))
    assert all(f.rule_id != "CD002" for f in result.findings)


def test_severity_override() -> None:
    result = report(Config(severity={"CD010": Severity.ERROR}))
    assert [f.severity for f in result.findings if f.rule_id == "CD010"] == [Severity.ERROR]


@pytest.mark.parametrize(
    ("fail_on", "expected"),
    [("error", True), ("warning", True), ("note", True), ("never", False)],
)
def test_fails(fail_on: str, expected: bool) -> None:
    assert report().fails(fail_on) is expected


def test_fails_threshold_excludes_lower_severities() -> None:
    notes_only = "services:\n  web:\n    image: nginx:1.27\n    restart: always\n"
    result = report(source=notes_only)
    assert result.count(Severity.NOTE) == 1
    assert not result.fails("warning")
    assert result.fails("note")


# --- text -----------------------------------------------------------------------------------


def test_text_report() -> None:
    output = render(report(), "text")
    assert output.splitlines()[0] == (
        "compose.yaml:7:5 error CD002 [web] Container runs in privileged mode"
    )
    assert output.splitlines()[1].startswith("    fix: Remove 'privileged: true'")
    assert output.endswith("\n1 error, 0 warnings, 1 note, 2 suppressed in 1 file\n")


def test_text_show_suppressed() -> None:
    output = render(report(), "text", show_suppressed=True)
    assert (
        "CD015 [web] Service sets a fixed container_name (suppressed by inline comment)" in output
    )
    ignored = render(report(Config(ignore=frozenset({"CD002"}))), "text", show_suppressed=True)
    assert "(suppressed by configuration)" in ignored


def test_text_no_problems() -> None:
    clean = "services:\n  web:\n    image: nginx:1.27\n    restart: always\n    mem_limit: 64m\n"
    assert render(report(source=clean), "text") == "No problems found in 1 file.\n"
    everything_ignored = report(Config(ignore=frozenset({"CD002", "CD010"})))
    assert render(everything_ignored, "text") == "No problems found in 1 file (4 suppressed).\n"


def test_text_two_files_plural() -> None:
    files = [load_text(SOURCE, "a.yaml"), load_text(SOURCE, "b.yaml")]
    output = render(lint(files, Config()), "text")
    assert output.endswith("2 errors, 0 warnings, 2 notes, 4 suppressed in 2 files\n")


# --- JSON -----------------------------------------------------------------------------------


def test_json_report_shape() -> None:
    data = json.loads(render(report(), "json"))
    assert data["schema_version"] == 1
    assert data["tool"] == {"name": "compose-doctor", "version": "0.1.0"}
    assert data["files"] == ["compose.yaml"]
    assert data["summary"] == {"error": 1, "warning": 0, "note": 1, "suppressed": 2}
    assert data["findings"][0] == {
        "rule_id": "CD002",
        "severity": "error",
        "file": "compose.yaml",
        "line": 7,
        "column": 5,
        "service": "web",
        "message": "Container runs in privileged mode",
        "fix": RULES[2].fix,
    }
    assert "suppressed" not in data


def test_json_show_suppressed() -> None:
    data = json.loads(render(report(), "json", show_suppressed=True))
    assert [(s["rule_id"], s["suppression"]) for s in data["suppressed"]] == [
        ("CD015", "inline"),
        ("CD002", "inline"),
    ]


# --- SARIF ----------------------------------------------------------------------------------


def test_sarif_report() -> None:
    data = json.loads(render(report(), "sarif"))
    assert data["version"] == "2.1.0"
    assert data["$schema"].endswith("sarif-2.1.0.json")
    (run,) = data["runs"]
    driver = run["tool"]["driver"]
    assert driver["name"] == "compose-doctor"
    assert driver["informationUri"] == "https://github.com/ChakraCoder/compse-doctor"
    assert [rule["id"] for rule in driver["rules"]] == [rule.id for rule in RULES]
    assert driver["rules"][9]["name"] == "DependsOnWithoutHealthCondition"
    for rule in driver["rules"]:
        assert set(rule) == {
            "id",
            "name",
            "shortDescription",
            "fullDescription",
            "help",
            "defaultConfiguration",
        }
    results = run["results"]
    assert len(results) == 4  # suppressed results are kept, marked as suppressed
    kinds = sorted(r["suppressions"][0]["kind"] for r in results if "suppressions" in r)
    assert kinds == ["inSource", "inSource"]
    first = results[0]
    assert first["ruleId"] == driver["rules"][first["ruleIndex"]]["id"]
    assert first["locations"][0]["physicalLocation"]["region"] == {"startLine": 6, "startColumn": 5}


def test_sarif_external_suppression() -> None:
    data = json.loads(render(report(Config(ignore=frozenset({"CD010"}))), "sarif"))
    kinds = [
        r["suppressions"][0]["kind"] for r in data["runs"][0]["results"] if "suppressions" in r
    ]
    assert "external" in kinds


def test_sarif_is_deterministic() -> None:
    assert render(report(), "sarif") == render(report(), "sarif")


def test_artifact_uri(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "sub").mkdir()
    assert artifact_uri("sub/compose.yaml") == "sub/compose.yaml"
    assert artifact_uri("./sub/../compose.yaml") == "compose.yaml"
    assert artifact_uri("<stdin>") == "stdin"
    outside = artifact_uri(str(tmp_path.parent / "other.yaml"))
    assert outside.startswith("file:///")
