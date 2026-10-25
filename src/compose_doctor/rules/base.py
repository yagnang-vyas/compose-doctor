"""The ``Rule`` type and small typed helpers rules use to read service configuration."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from compose_doctor.model import ComposeFile, Finding, Located, LocatedMap, Service, Severity, Value

CheckFunction = Callable[[Service, ComposeFile], list[Finding]]


@dataclass(frozen=True)
class Rule:
    """A documented check. ``check`` is a pure function of one service and its file."""

    id: str
    title: str
    severity: Severity
    rationale: str
    fix: str
    check: CheckFunction

    def finding(
        self,
        compose: ComposeFile,
        service: Service,
        at: Located[object] | None,
        message: str,
        *,
        severity: Severity | None = None,
        fix: str | None = None,
    ) -> Finding:
        """Build a finding located at ``at``, or at the service key when ``at`` is ``None``."""
        line, column = (service.line, service.column) if at is None else (at.line, at.column)
        return Finding(
            rule_id=self.id,
            severity=severity or self.severity,
            file=compose.path,
            line=line,
            column=column,
            service=service.name,
            message=message,
            fix=fix or self.fix,
        )


def key(service: Service, name: str) -> Located[str] | None:
    """The located key ``name`` of a service, or ``None`` when it is not set."""
    return service.raw.key(name) if name in service.raw else None


def text(value: Located[Value] | None) -> str | None:
    """The text of a scalar, or ``None`` for a missing value, a null, a mapping or a sequence.

    Strings are returned as they are; other scalars return their source text, so ``22:22`` stays
    ``"22:22"`` rather than the YAML 1.1 integer 1342 and ``no`` stays ``"no"`` rather than False.
    """
    if value is None or value.value is None or isinstance(value.value, (LocatedMap, tuple)):
        return None
    if isinstance(value.value, str):
        return value.value
    return value.raw if value.raw is not None else str(value.value)


def mapping(value: Located[Value] | None) -> LocatedMap | None:
    """The mapping held by ``value``, or ``None`` when it is not a mapping."""
    if value is not None and isinstance(value.value, LocatedMap):
        return value.value
    return None


def sequence(value: Located[Value] | None) -> tuple[Located[Value], ...] | None:
    """The items held by ``value``, or ``None`` when it is not a sequence."""
    if value is not None and isinstance(value.value, tuple):
        return value.value
    return None


def lookup(start: LocatedMap, *path: str) -> Located[Value] | None:
    """Follow ``path`` through nested mappings: ``lookup(raw, "deploy", "resources")``."""
    current: Located[Value] | None = None
    container: LocatedMap | None = start
    for name in path:
        if container is None or name not in container:
            return None
        current = container[name]
        container = mapping(current)
    return current


def is_true(value: Located[Value] | None) -> bool:
    """True for a YAML boolean true or the string ``"true"`` (any case)."""
    if value is None:
        return False
    if value.value is True:
        return True
    return isinstance(value.value, str) and value.value.strip().lower() == "true"
