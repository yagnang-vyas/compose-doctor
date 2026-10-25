"""CD000: configuration the other rules cannot understand.

Rules skip entries they cannot parse; this rule reports them, once each, so a typo is never
silently treated as "no problem".
"""

from __future__ import annotations

import re
from collections.abc import Iterator

from compose_doctor.interpolation import contains_interpolation
from compose_doctor.model import ComposeFile, Finding, Located, LocatedMap, Service, Severity, Value
from compose_doctor.rules.base import Rule, mapping, sequence, text
from compose_doctor.rules.parsing import Invalid, iter_environment, parse_port, parse_volume
from compose_doctor.rules.reliability import dependencies

LIST_KEYS = ("ports", "volumes", "cap_add", "security_opt")
RESTART_VALUE = re.compile(r"no|always|unless-stopped|on-failure(:\d+)?")


def _shape_problems(raw: LocatedMap) -> Iterator[tuple[str, Located[object]]]:
    for name in LIST_KEYS:
        if name in raw and raw[name].value is not None and sequence(raw[name]) is None:
            yield f"'{name}' must be a list", raw.key(name)
    depends = raw.get("depends_on")
    if depends is not None and sequence(depends) is None and mapping(depends) is None:
        yield "'depends_on' must be a list or a mapping", raw.key("depends_on")
    image = raw.get("image")
    if image is not None and not isinstance(image.value, str):
        yield "'image' must be a string", raw.key("image")


def _entry_problems(raw: LocatedMap) -> Iterator[Invalid]:
    for entry in sequence(raw.get("ports")) or ():
        port = parse_port(entry)
        if isinstance(port, Invalid):
            yield port
    for entry in sequence(raw.get("volumes")) or ():
        volume = parse_volume(entry)
        if isinstance(volume, Invalid):
            yield volume
    environment = raw.get("environment")
    if environment is not None and environment.value is not None:
        yield from (var for var in iter_environment(environment) if isinstance(var, Invalid))


def _restart_problem(raw: LocatedMap) -> tuple[str, Located[Value]] | None:
    restart = raw.get("restart")
    value = text(restart)
    if restart is None or value is None or contains_interpolation(value):
        return None
    if value.strip().lower() == "false" or RESTART_VALUE.fullmatch(value.strip()):
        return None
    return f"restart policy '{value}' is not one of no, always, unless-stopped, on-failure", restart


def check_invalid_configuration(service: Service, compose: ComposeFile) -> list[Finding]:
    problems: list[tuple[str, Located[object]]] = list(_shape_problems(service.raw))
    problems.extend((invalid.reason, invalid.at) for invalid in _entry_problems(service.raw))
    restart = _restart_problem(service.raw)
    if restart is not None:
        problems.append(restart)

    defined = {svc.name for svc in compose.services}
    problems.extend(
        (f"depends on undefined service '{name}'", at)
        for name, at in dependencies(service)
        if name not in defined
    )

    return [
        INVALID_CONFIGURATION.finding(compose, service, at, f"Invalid configuration: {reason}")
        for reason, at in problems
    ]


INVALID_CONFIGURATION = Rule(
    id="CD000",
    title="Invalid configuration",
    severity=Severity.ERROR,
    rationale=(
        "An entry that does not follow the Compose specification is either rejected by Docker "
        "Compose or silently means something other than intended, and the other rules cannot "
        "check it."
    ),
    fix="Correct the entry using the syntax in the Compose specification.",
    check=check_invalid_configuration,
)

RULES = (INVALID_CONFIGURATION,)
