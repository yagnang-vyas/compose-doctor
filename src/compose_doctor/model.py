"""Data model: located YAML values, Compose services and findings."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from enum import Enum
from typing import Generic, TypeAlias, TypeVar, Union

T = TypeVar("T")

Scalar: TypeAlias = str | int | float | bool | None
"""A typed YAML scalar, as resolved by the YAML 1.1 rules PyYAML applies."""

Value: TypeAlias = Union[Scalar, "LocatedMap", "tuple[Located[Value], ...]"]
"""Any converted YAML value: a scalar, a mapping or a sequence of located values."""


@dataclass(frozen=True)
class Located(Generic[T]):
    """A value together with the 1-based position of the YAML node it came from.

    ``raw`` is the scalar's source text (``None`` for mappings and sequences). It matters
    where YAML 1.1 typing surprises people: ``22:22`` is the integer 1342, ``on`` is ``True``.
    """

    value: T
    line: int
    column: int = 1
    raw: str | None = None


class LocatedMap(Mapping[str, Located[Value]]):
    """An immutable mapping of string keys to located values that also remembers key positions.

    Indexing returns the located *value*; :meth:`key` returns the located *key*, so a finding can
    point at ``privileged:`` rather than at the value after it.
    """

    __slots__ = ("_entries",)

    def __init__(self, entries: Mapping[str, tuple[Located[str], Located[Value]]]) -> None:
        self._entries = dict(entries)

    def __getitem__(self, name: str) -> Located[Value]:
        return self._entries[name][1]

    def __iter__(self) -> Iterator[str]:
        return iter(self._entries)

    def __len__(self) -> int:
        return len(self._entries)

    def __repr__(self) -> str:
        return f"LocatedMap({dict(self.items())!r})"

    def key(self, name: str) -> Located[str]:
        """Return the located key ``name``. Raises ``KeyError`` when absent."""
        return self._entries[name][0]

    def entry(self, name: str) -> tuple[Located[str], Located[Value]]:
        """Return the located key and value for ``name``. Raises ``KeyError`` when absent."""
        return self._entries[name]


class Severity(Enum):
    """Finding severity. The values map one-to-one to SARIF result levels."""

    ERROR = "error"
    WARNING = "warning"
    NOTE = "note"

    @property
    def rank(self) -> int:
        """Higher is more severe."""
        return _RANKS[self]

    def __str__(self) -> str:
        return self.value


_RANKS = {Severity.NOTE: 1, Severity.WARNING: 2, Severity.ERROR: 3}


@dataclass(frozen=True)
class Service:
    """One entry under ``services:``. ``raw`` holds its configuration as located values."""

    name: str
    line: int
    column: int
    raw: LocatedMap


@dataclass(frozen=True)
class ComposeFile:
    """A loaded Compose file.

    ``path`` is the name used in reports (``<stdin>`` for standard input) and ``source`` is the
    decoded text, kept so inline suppression comments can be read.
    """

    path: str
    source: str
    root: LocatedMap
    services: tuple[Service, ...]


@dataclass(frozen=True)
class Finding:
    """A problem a rule found. ``service`` is ``None`` for file-level findings."""

    rule_id: str
    severity: Severity
    file: str
    line: int
    service: str | None
    message: str
    fix: str
    column: int = 1
