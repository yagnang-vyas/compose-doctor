"""Inline suppression comments.

``# compose-doctor: ignore CD005`` (or ``ignore CD005,CD010``) suppresses those rules for findings
on the same line. On a line of its own it also covers the line directly below.
``# compose-doctor: ignore-file CD015`` anywhere suppresses a rule for the whole file.
A reason can follow the IDs after ``--``: ``# compose-doctor: ignore CD005 -- bound by firewall``.

PyYAML discards comments, so they are found by scanning the raw text. A marker must start a
comment: ``#`` at the start of a line or after whitespace.
"""

from __future__ import annotations

import re
from collections.abc import Collection
from dataclasses import dataclass

from compose_doctor.errors import InputError

_MARKER = re.compile(
    r"(?:^|\s)#\s*compose-doctor:\s*(?P<kind>ignore-file|ignore)\b(?P<ids>[^#]*)", re.IGNORECASE
)
_ID_SEPARATOR = re.compile(r"[\s,]+")


@dataclass(frozen=True)
class Suppressions:
    """Rule IDs suppressed per line, plus those suppressed for the whole file."""

    lines: dict[int, frozenset[str]]
    file: frozenset[str]

    def covers(self, rule_id: str, line: int) -> bool:
        return rule_id in self.file or rule_id in self.lines.get(line, frozenset())


def parse_suppressions(source: str, path: str, known_rules: Collection[str]) -> Suppressions:
    """Find every suppression comment in ``source``. Unknown rule IDs raise :class:`InputError`."""
    lines: dict[int, set[str]] = {}
    whole_file: set[str] = set()
    for number, line in enumerate(source.splitlines(), start=1):
        match = _MARKER.search(line)
        if match is None:
            continue
        ids = _rule_ids(match.group("ids"), path, number, known_rules)
        if match.group("kind").lower() == "ignore-file":
            whole_file.update(ids)
            continue
        lines.setdefault(number, set()).update(ids)
        if line.lstrip().startswith("#"):
            lines.setdefault(number + 1, set()).update(ids)
    return Suppressions(
        lines={number: frozenset(ids) for number, ids in lines.items()},
        file=frozenset(whole_file),
    )


def _rule_ids(text: str, path: str, line: int, known_rules: Collection[str]) -> list[str]:
    listed = text.split("--", 1)[0]
    ids = [part.upper() for part in _ID_SEPARATOR.split(listed.strip()) if part]
    if not ids:
        raise InputError("suppression comment names no rule IDs", file=path, line=line)
    unknown = [rule_id for rule_id in ids if rule_id not in known_rules]
    if unknown:
        raise InputError(
            f"unknown rule ID in suppression comment: {', '.join(unknown)}", file=path, line=line
        )
    return ids
