"""Fixture-driven rule tests.

``bad_cdNNN.yaml`` marks every line where rule CDNNN must report with ``# expect: CDNNN``;
``good_cdNNN.yaml`` must produce no finding for that rule.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from compose_doctor.loader import load_text
from compose_doctor.model import ComposeFile, Finding, Severity
from compose_doctor.rules import RULES, RULES_BY_ID, run_rules

FIXTURES = Path(__file__).parent.parent / "fixtures"
EXPECT = re.compile(r"#\s*expect:\s*(CD\d{3})")
RULE_IDS = [rule.id for rule in RULES]


def load_fixture(name: str) -> ComposeFile:
    path = FIXTURES / name
    return load_text(path.read_text(encoding="utf-8"), name)


def expected_lines(compose: ComposeFile, rule_id: str) -> list[int]:
    return [
        number
        for number, line in enumerate(compose.source.splitlines(), start=1)
        if rule_id in EXPECT.findall(line)
    ]


def findings_for(compose: ComposeFile, rule_id: str) -> list[Finding]:
    return [f for f in run_rules(compose) if f.rule_id == rule_id]


def test_all_rules_registered() -> None:
    assert [f"CD{n:03d}" for n in range(16)] == RULE_IDS
    assert set(RULES_BY_ID) == set(RULE_IDS)


@pytest.mark.parametrize("rule_id", RULE_IDS)
def test_rule_metadata(rule_id: str) -> None:
    rule = RULES_BY_ID[rule_id]
    assert rule.title and rule.rationale and rule.fix
    assert len(rule.rationale) > 80


@pytest.mark.parametrize("rule_id", RULE_IDS)
def test_bad_fixture_triggers_rule_at_expected_lines(rule_id: str) -> None:
    compose = load_fixture(f"bad_{rule_id.lower()}.yaml")
    expected = expected_lines(compose, rule_id)
    assert expected, "fixture has no '# expect:' markers"
    assert [f.line for f in findings_for(compose, rule_id)] == expected


@pytest.mark.parametrize("rule_id", RULE_IDS)
def test_good_fixture_does_not_trigger_rule(rule_id: str) -> None:
    compose = load_fixture(f"good_{rule_id.lower()}.yaml")
    assert findings_for(compose, rule_id) == []


@pytest.mark.parametrize("rule_id", RULE_IDS)
def test_fixture_pair_exists(rule_id: str) -> None:
    assert (FIXTURES / f"bad_{rule_id.lower()}.yaml").is_file()
    assert (FIXTURES / f"good_{rule_id.lower()}.yaml").is_file()


def test_findings_are_sorted_by_file_line_rule() -> None:
    compose = load_fixture("bad_cd007.yaml")
    findings = run_rules(compose)
    assert findings == sorted(findings, key=lambda f: (f.file, f.line, f.rule_id))


def test_finding_fields() -> None:
    compose = load_fixture("bad_cd002.yaml")
    finding = findings_for(compose, "CD002")[0]
    assert finding.file == "bad_cd002.yaml"
    assert finding.service == "web"
    assert finding.severity is Severity.ERROR
    assert finding.column == 5
    assert finding.fix == RULES_BY_ID["CD002"].fix


def test_disabled_healthcheck_is_a_note() -> None:
    compose = load_fixture("bad_cd007.yaml")
    severities = {f.service: f.severity for f in findings_for(compose, "CD007")}
    assert severities == {
        "web": Severity.WARNING,
        "db": Severity.WARNING,
        "cache": Severity.NOTE,
        "queue": Severity.NOTE,
    }


def test_healthcheck_message_names_dependents() -> None:
    compose = load_fixture("bad_cd007.yaml")
    messages = {f.service: f.message for f in findings_for(compose, "CD007")}
    assert messages["db"] == "Service has no healthcheck although other services depend on it (app)"
    assert messages["web"] == "Service has no healthcheck although it publishes ports"


def test_database_message_names_product_and_binding() -> None:
    compose = load_fixture("bad_cd005.yaml")
    messages = [f.message for f in findings_for(compose, "CD005")]
    assert messages[0] == "PostgreSQL container port 5432 is published on all interfaces"
    assert messages[5] == (
        "PostgreSQL container port 5432 is published on 192.168.1.10, "
        "which is not a loopback address"
    )
    assert messages[-1] == "Redis container port 6379 is published on all interfaces"


def test_secret_messages_name_key_but_never_value() -> None:
    compose = load_fixture("bad_cd006.yaml")
    findings = findings_for(compose, "CD006")
    assert findings[0].message == (
        "Environment variable 'POSTGRES_PASSWORD' has a hard-coded secret value"
    )
    rendered = " ".join(f"{f.message} {f.fix}" for f in run_rules(compose))
    for value in ("fake-pass-123", "fake-token-xyz", "fake-secret", "12345"):
        assert value not in rendered


def test_invalid_configuration_messages() -> None:
    compose = load_fixture("bad_cd000.yaml")
    messages = [f.message for f in findings_for(compose, "CD000")]
    assert "Invalid configuration: host port '99999' is outside 1-65535" in messages
    assert "Invalid configuration: depends on undefined service 'ghost'" in messages
    assert "Invalid configuration: 'cap_add' must be a list" in messages
