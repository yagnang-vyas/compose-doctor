from __future__ import annotations

import pytest

from compose_doctor.errors import InputError
from compose_doctor.rules import RULES_BY_ID
from compose_doctor.suppress import Suppressions, parse_suppressions


def parse(source: str) -> Suppressions:
    return parse_suppressions(source, "compose.yaml", RULES_BY_ID)


def test_same_line() -> None:
    sup = parse("a: 1\nb: 2  # compose-doctor: ignore CD005\n")
    assert sup.covers("CD005", 2)
    assert not sup.covers("CD005", 1)
    assert not sup.covers("CD005", 3)  # a trailing comment does not cover the next line
    assert not sup.covers("CD006", 2)


def test_line_above() -> None:
    sup = parse("  # compose-doctor: ignore CD005, CD010\n  ports: x\n")
    assert sup.covers("CD005", 1)
    assert sup.covers("CD005", 2)
    assert sup.covers("CD010", 2)


def test_multiple_ids_space_and_comma() -> None:
    sup = parse("x: 1 # compose-doctor: ignore CD001,CD002 cd003\n")
    assert all(sup.covers(rule, 1) for rule in ("CD001", "CD002", "CD003"))


def test_reason_after_double_dash() -> None:
    sup = parse("x: 1 # compose-doctor: ignore CD005 -- firewalled at the edge\n")
    assert sup.covers("CD005", 1)


def test_ignore_file() -> None:
    sup = parse("services: {}\n# compose-doctor: ignore-file CD015\n")
    assert sup.covers("CD015", 1)
    assert sup.covers("CD015", 500)
    assert sup.file == {"CD015"}


def test_marker_must_start_a_comment() -> None:
    sup = parse("image: app#compose-doctor: ignore CD001\n")
    assert not sup.covers("CD001", 1)


def test_unrelated_comments_ignored() -> None:
    sup = parse("# compose-doctor is great\nx: 1 # ignore CD001\n")
    assert sup.lines == {}
    assert sup.file == frozenset()


def test_unknown_rule_id_rejected() -> None:
    with pytest.raises(InputError) as exc:
        parse("a: 1\nb: 2 # compose-doctor: ignore CD005, CD999\n")
    assert str(exc.value) == "compose.yaml:2: unknown rule ID in suppression comment: CD999"


def test_empty_id_list_rejected() -> None:
    with pytest.raises(InputError) as exc:
        parse("b: 2 # compose-doctor: ignore\n")
    assert exc.value.message == "suppression comment names no rule IDs"
