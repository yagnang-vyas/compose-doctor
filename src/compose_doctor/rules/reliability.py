"""Startup ordering, health and restart rules."""

from __future__ import annotations

from enum import Enum

from compose_doctor.model import ComposeFile, Finding, Located, Service, Severity
from compose_doctor.rules.base import Rule, is_true, key, lookup, mapping, sequence, text


class Health(Enum):
    MISSING = "missing"
    DISABLED = "disabled"
    DEFINED = "defined"


def healthcheck(service: Service) -> Health:
    """Whether ``service`` defines a healthcheck, explicitly disables one, or has none."""
    spec = mapping(service.raw.get("healthcheck"))
    if spec is None:
        return Health.MISSING
    test = spec.get("test")
    items = sequence(test)
    first = text(items[0]) if items else text(test)
    if is_true(spec.get("disable")) or first == "NONE":
        return Health.DISABLED
    return Health.DEFINED


def dependencies(service: Service) -> list[tuple[str, Located[object]]]:
    """Services listed in ``depends_on`` with where they are listed, in list or mapping form."""
    value = service.raw.get("depends_on")
    as_map = mapping(value)
    if as_map is not None:
        return [(name, as_map.key(name)) for name in as_map]
    return [(name, item) for item in sequence(value) or () if (name := text(item)) is not None]


def dependency_names(service: Service) -> list[str]:
    """Names listed in ``depends_on``, in short (list) or long (mapping) form."""
    return [name for name, _ in dependencies(service)]


def _find(compose: ComposeFile, name: str) -> Service | None:
    return next((svc for svc in compose.services if svc.name == name), None)


# --- CD007 ---------------------------------------------------------------------------------


def check_missing_healthcheck(service: Service, compose: ComposeFile) -> list[Finding]:
    dependents = sorted(
        other.name for other in compose.services if service.name in dependency_names(other)
    )
    publishes = bool(sequence(service.raw.get("ports")))
    if not dependents and not publishes:
        return []

    reason = (
        f"other services depend on it ({', '.join(dependents)})"
        if dependents
        else "it publishes ports"
    )
    state = healthcheck(service)
    if state is Health.DEFINED:
        return []
    if state is Health.DISABLED:
        return [
            MISSING_HEALTHCHECK.finding(
                compose,
                service,
                key(service, "healthcheck"),
                f"Healthcheck is explicitly disabled although {reason}",
                severity=Severity.NOTE,
                fix="Make sure the disabled healthcheck is intentional.",
            )
        ]
    return [
        MISSING_HEALTHCHECK.finding(
            compose, service, None, f"Service has no healthcheck although {reason}"
        )
    ]


MISSING_HEALTHCHECK = Rule(
    id="CD007",
    title="No healthcheck",
    severity=Severity.WARNING,
    rationale=(
        "Without a healthcheck Docker only knows whether the process is running, not whether it "
        "is serving. Dependent services cannot wait for it to be ready, and a hung process is "
        "never reported as unhealthy. An explicitly disabled healthcheck is reported as a note."
    ),
    fix=(
        'Add a healthcheck, for example: healthcheck: {test: ["CMD", "pg_isready"], '
        "interval: 10s, timeout: 5s, retries: 5}."
    ),
    check=check_missing_healthcheck,
)


# --- CD008 ---------------------------------------------------------------------------------

RESTART_DISABLED = frozenset({"no", "false"})


def check_restart_policy(service: Service, compose: ComposeFile) -> list[Finding]:
    restart = text(service.raw.get("restart"))
    if restart is not None:
        if restart.strip().lower() in RESTART_DISABLED:
            return [
                RESTART_POLICY.finding(
                    compose, service, key(service, "restart"), "Restart policy is 'no'"
                )
            ]
        return []

    policy = mapping(lookup(service.raw, "deploy", "restart_policy"))
    if policy is not None:
        condition = policy.get("condition")
        if (text(condition) or "").strip() != "none":
            return []
        return [
            RESTART_POLICY.finding(
                compose, service, condition, "deploy.restart_policy condition is 'none'"
            )
        ]
    return [RESTART_POLICY.finding(compose, service, None, "Service has no restart policy")]


RESTART_POLICY = Rule(
    id="CD008",
    title="No restart policy",
    severity=Severity.WARNING,
    rationale=(
        "Docker's default is not to restart containers. After a crash or a host reboot the "
        "service stays down until someone notices."
    ),
    fix="Set 'restart: unless-stopped' (or 'always' / 'on-failure').",
    check=check_restart_policy,
)


# --- CD009 ---------------------------------------------------------------------------------

READY_CONDITIONS = frozenset({"service_healthy", "service_completed_successfully"})


def _has_healthcheck(compose: ComposeFile, name: str) -> bool:
    dependency = _find(compose, name)
    return dependency is not None and healthcheck(dependency) is Health.DEFINED


def check_depends_on_condition(service: Service, compose: ComposeFile) -> list[Finding]:
    value = service.raw.get("depends_on")
    findings = []
    long_form = mapping(value)
    if long_form is not None:
        for name in long_form:
            condition = lookup(long_form, name, "condition")
            if (text(condition) or "service_started").strip() in READY_CONDITIONS:
                continue
            if _has_healthcheck(compose, name):
                at: Located[object] = condition if condition is not None else long_form.key(name)
                findings.append(_depends_finding(compose, service, at, name))
        return findings

    for item in sequence(value) or ():
        dependency = text(item)
        if dependency is not None and _has_healthcheck(compose, dependency):
            findings.append(_depends_finding(compose, service, item, dependency))
    return findings


def _depends_finding(
    compose: ComposeFile, service: Service, at: Located[object], name: str
) -> Finding:
    return DEPENDS_ON_CONDITION.finding(
        compose,
        service,
        at,
        f"Depends on '{name}' only being started, not healthy, although it has a healthcheck",
    )


DEPENDS_ON_CONDITION = Rule(
    id="CD009",
    title="depends_on without health condition",
    severity=Severity.WARNING,
    rationale=(
        "Plain 'depends_on' only waits for the dependency's container to start, not for it to be "
        "ready, so the service races its database on every cold start. When the dependency has a "
        "healthcheck, Compose can wait for it properly. Dependencies without a healthcheck are "
        "reported by CD007 instead."
    ),
    fix="Use the long form: depends_on: {db: {condition: service_healthy}}.",
    check=check_depends_on_condition,
)


RULES = (MISSING_HEALTHCHECK, RESTART_POLICY, DEPENDS_ON_CONDITION)
