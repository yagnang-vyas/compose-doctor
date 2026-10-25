import dataclasses

import pytest

from compose_doctor.model import Finding, Located, LocatedMap, Severity


def test_severity_rank_order() -> None:
    assert Severity.ERROR.rank > Severity.WARNING.rank > Severity.NOTE.rank


def test_severity_str_is_value() -> None:
    assert [str(s) for s in Severity] == ["error", "warning", "note"]


def test_finding_is_frozen() -> None:
    finding = Finding("CD002", Severity.ERROR, "compose.yaml", 3, "web", "msg", "fix")
    assert finding.column == 1
    with pytest.raises(dataclasses.FrozenInstanceError):
        finding.line = 4  # type: ignore[misc]  # deliberately violating frozen for the test


def test_located_map_missing_key() -> None:
    mapping = LocatedMap({"a": (Located("a", 1), Located(1, 1))})
    assert mapping.get("b") is None
    with pytest.raises(KeyError):
        mapping.key("b")
