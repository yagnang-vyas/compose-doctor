"""Resource and naming rules."""

from __future__ import annotations

from compose_doctor.model import ComposeFile, Finding, Service, Severity
from compose_doctor.rules.base import Rule, key, lookup

# --- CD010 ---------------------------------------------------------------------------------


def check_memory_limit(service: Service, compose: ComposeFile) -> list[Finding]:
    deploy_limit = lookup(service.raw, "deploy", "resources", "limits", "memory")
    if "mem_limit" in service.raw or deploy_limit is not None:
        return []
    return [MEMORY_LIMIT.finding(compose, service, None, "Service has no memory limit")]


MEMORY_LIMIT = Rule(
    id="CD010",
    title="No memory limit",
    severity=Severity.NOTE,
    rationale=(
        "Without a memory limit one leaking or overloaded container can consume all host memory "
        "and trigger the kernel's OOM killer against unrelated services, including the database."
    ),
    fix="Set 'mem_limit: 512m' or 'deploy.resources.limits.memory: 512M'.",
    check=check_memory_limit,
)


# --- CD015 ---------------------------------------------------------------------------------


def check_container_name(service: Service, compose: ComposeFile) -> list[Finding]:
    name_key = key(service, "container_name")
    if name_key is None:
        return []
    return [
        CONTAINER_NAME.finding(compose, service, name_key, "Service sets a fixed container_name")
    ]


CONTAINER_NAME = Rule(
    id="CD015",
    title="Fixed container_name",
    severity=Severity.NOTE,
    rationale=(
        "A fixed container name prevents scaling the service beyond one replica and clashes "
        "when two Compose projects on the same host use the same name. Compose already gives "
        "each container a unique, predictable name."
    ),
    fix="Remove 'container_name' and refer to the service by its service name.",
    check=check_container_name,
)


RULES = (MEMORY_LIMIT, CONTAINER_NAME)
