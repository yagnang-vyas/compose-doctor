"""Run the real CLI with ``python -m compose_doctor`` in a subprocess."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "tests" / "fixtures"
GOLDEN = ROOT / "tests" / "golden"
INSECURE = "examples/insecure/compose.yaml"
HARDENED = "examples/hardened/compose.yaml"

FAKE_SECRETS = ("fake-pass-123", "fake-token-xyz", "fake-user-abc")


def cli(*args: str, cwd: Path = ROOT, stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "compose_doctor", *args],
        cwd=cwd,
        input=stdin,
        capture_output=True,
        text=True,
        check=False,
    )


def json_output(*args: str) -> dict[str, Any]:
    result = cli(*args, "--format", "json")
    data: dict[str, Any] = json.loads(result.stdout)
    return data


# --- examples -------------------------------------------------------------------------------


def test_insecure_example_matches_golden() -> None:
    result = cli(INSECURE, "--format", "json")
    assert result.returncode == 1
    golden = GOLDEN / "insecure.json"
    if os.environ.get("UPDATE_GOLDEN"):
        golden.write_text(result.stdout, encoding="utf-8")
    assert result.stdout == golden.read_text(encoding="utf-8")


def test_insecure_example_triggers_at_least_twelve_rules() -> None:
    rule_ids = {f["rule_id"] for f in json_output(INSECURE)["findings"]}
    assert len(rule_ids) >= 12


def test_hardened_example_is_clean() -> None:
    result = cli(HARDENED)
    assert result.returncode == 0
    assert result.stdout == "No problems found in 1 file.\n"
    assert json_output(HARDENED)["summary"] == {
        "error": 0,
        "warning": 0,
        "note": 0,
        "suppressed": 0,
    }


# --- SARIF ----------------------------------------------------------------------------------


def test_sarif_output_is_valid_and_consistent_with_json() -> None:
    result = cli(INSECURE, "--format", "sarif")
    assert result.returncode == 1
    sarif = json.loads(result.stdout)
    assert sarif["version"] == "2.1.0"
    assert "$schema" in sarif
    (run,) = sarif["runs"]
    driver = run["tool"]["driver"]
    assert {"name", "version", "informationUri", "rules"} <= set(driver)
    rule_ids = [rule["id"] for rule in driver["rules"]]
    for rule in driver["rules"]:
        assert rule["shortDescription"]["text"]
        assert rule["fullDescription"]["text"]
        assert rule["help"]["text"]
        assert rule["defaultConfiguration"]["level"] in {"error", "warning", "note"}

    for item in run["results"]:
        assert item["ruleId"] in rule_ids
        assert rule_ids[item["ruleIndex"]] == item["ruleId"]
        assert item["level"] in {"error", "warning", "note"}
        assert item["message"]["text"]
        location = item["locations"][0]["physicalLocation"]
        assert location["artifactLocation"]["uri"] == INSECURE
        assert location["region"]["startLine"] >= 1

    sarif_locations = [
        (r["ruleId"], r["locations"][0]["physicalLocation"]["region"]["startLine"])
        for r in run["results"]
    ]
    json_locations = [(f["rule_id"], f["line"]) for f in json_output(INSECURE)["findings"]]
    assert sarif_locations == json_locations


def test_sarif_is_deterministic() -> None:
    assert cli(INSECURE, "--format", "sarif").stdout == cli(INSECURE, "--format", "sarif").stdout


# --- discovery and stdin --------------------------------------------------------------------


def test_discovers_default_file(tmp_path: Path) -> None:
    (tmp_path / "docker-compose.yml").write_text("services:\n  web:\n    image: nginx\n")
    result = cli(cwd=tmp_path)
    assert result.returncode == 0
    assert "docker-compose.yml:3:5 warning CD001 [web]" in result.stdout


def test_discovery_prefers_compose_yaml(tmp_path: Path) -> None:
    (tmp_path / "docker-compose.yml").write_text("services:\n  a:\n    privileged: true\n")
    (tmp_path / "compose.yaml").write_text(
        "services:\n  web:\n    image: nginx:1.27\n    restart: always\n    mem_limit: 1g\n"
    )
    assert cli(cwd=tmp_path).stdout == "No problems found in 1 file.\n"


def test_no_default_file_is_usage_error(tmp_path: Path) -> None:
    result = cli(cwd=tmp_path)
    assert result.returncode == 2
    assert "none of compose.yaml" in result.stderr


def test_reads_stdin() -> None:
    result = cli("-", stdin="services:\n  web:\n    image: nginx\n    privileged: true\n")
    assert result.returncode == 1
    assert "<stdin>:4:5 error CD002 [web]" in result.stdout


def test_multiple_files() -> None:
    result = cli(INSECURE, HARDENED, "--format", "json")
    data = json.loads(result.stdout)
    assert data["files"] == [INSECURE, HARDENED]
    assert {f["file"] for f in data["findings"]} == {INSECURE}


# --- exit codes -----------------------------------------------------------------------------


def test_exit_0_and_1() -> None:
    assert cli(INSECURE, "--fail-on", "never").returncode == 0
    assert cli(INSECURE).returncode == 1


@pytest.mark.parametrize(
    ("args", "stderr"),
    [
        (["--format", "xml", INSECURE], "invalid choice: 'xml'"),
        (["--ignore", "CD123", INSECURE], "unknown rule ID(s) for --ignore: CD123"),
        (["missing.yaml"], "compose-doctor: error: missing.yaml: no such file"),
        (
            ["tests/fixtures/privacy_broken.yaml"],
            "compose-doctor: error: tests/fixtures/privacy_broken.yaml:11: invalid YAML",
        ),
        (["--config", "missing.yml", INSECURE], "missing.yml: config file not found"),
    ],
)
def test_exit_2(args: list[str], stderr: str) -> None:
    result = cli(*args)
    assert result.returncode == 2
    assert result.stdout == ""
    assert stderr in result.stderr
    assert "Traceback" not in result.stderr


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX pipe semantics")
def test_exit_141_when_stdout_pipe_is_closed() -> None:
    read_end, write_end = os.pipe()
    os.close(read_end)  # the first write to the pipe fails with EPIPE
    try:
        process = subprocess.run(
            [sys.executable, "-m", "compose_doctor", INSECURE],
            cwd=ROOT,
            stdout=write_end,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    finally:
        os.close(write_end)
    assert process.returncode == 141
    assert process.stderr == ""


# --- privacy --------------------------------------------------------------------------------


@pytest.mark.parametrize("output_format", ["text", "json", "sarif"])
def test_secret_values_never_printed(output_format: str) -> None:
    result = cli(
        "tests/fixtures/privacy_secrets.yaml",
        "--format",
        output_format,
        "--show-suppressed",
    )
    assert result.returncode == 1
    assert "POSTGRES_PASSWORD" in result.stdout  # the key is reported...
    for value in FAKE_SECRETS:  # ...but never its value
        assert value not in result.stdout
        assert value not in result.stderr


def test_secret_values_not_in_error_message() -> None:
    result = cli("tests/fixtures/privacy_broken.yaml")
    assert result.returncode == 2
    for value in FAKE_SECRETS:
        assert value not in result.stderr
        assert value not in result.stdout
