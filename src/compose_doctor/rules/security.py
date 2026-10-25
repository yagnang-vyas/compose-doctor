"""Container isolation and secret-handling rules."""

from __future__ import annotations

import re
from collections.abc import Iterator

from compose_doctor.interpolation import contains_interpolation
from compose_doctor.model import ComposeFile, Finding, Located, Service, Severity, Value
from compose_doctor.rules.base import Rule, is_true, key, sequence, text
from compose_doctor.rules.parsing import EnvVar, Mount, iter_environment, parse_volume

# --- CD002 ---------------------------------------------------------------------------------


def check_privileged(service: Service, compose: ComposeFile) -> list[Finding]:
    if not is_true(service.raw.get("privileged")):
        return []
    return [
        PRIVILEGED.finding(
            compose, service, key(service, "privileged"), "Container runs in privileged mode"
        )
    ]


PRIVILEGED = Rule(
    id="CD002",
    title="Privileged container",
    severity=Severity.ERROR,
    rationale=(
        "A privileged container gets every Linux capability and access to all host devices, and "
        "most isolation between it and the host is turned off. A compromise of the container is "
        "effectively a compromise of the host."
    ),
    fix="Remove 'privileged: true' and grant only the specific capabilities or devices needed.",
    check=check_privileged,
)


# --- volumes (CD003, CD014) -----------------------------------------------------------------


def _bind_mounts(service: Service) -> Iterator[tuple[Mount, str]]:
    for entry in sequence(service.raw.get("volumes")) or ():
        mount = parse_volume(entry)
        if isinstance(mount, Mount) and mount.bind_source is not None:
            yield mount, mount.bind_source


DOCKER_SOCKETS = frozenset({"/var/run/docker.sock", "/run/docker.sock"})


def check_docker_socket(service: Service, compose: ComposeFile) -> list[Finding]:
    return [
        DOCKER_SOCKET.finding(
            compose, service, mount.at, f"The Docker socket {source} is mounted into the container"
        )
        for mount, source in _bind_mounts(service)
        if source in DOCKER_SOCKETS
    ]


DOCKER_SOCKET = Rule(
    id="CD003",
    title="Docker socket mounted",
    severity=Severity.ERROR,
    rationale=(
        "Access to the Docker socket is root access to the host: anything in the container can "
        "start a privileged container that mounts the host filesystem. This applies even to a "
        "read-only mount, because the socket accepts API calls either way."
    ),
    fix=(
        "Remove the socket mount. If the service really needs the Docker API, put a filtering "
        "proxy (for example docker-socket-proxy) in front of it and allow only the calls it needs."
    ),
    check=check_docker_socket,
)


SENSITIVE_HOST_PATHS = ("/etc", "/root", "/proc", "/sys", "/boot", "/var/lib/docker")


def _is_sensitive(path: str) -> bool:
    return path == "/" or any(
        path == prefix or path.startswith(prefix + "/") for prefix in SENSITIVE_HOST_PATHS
    )


def check_sensitive_mount(service: Service, compose: ComposeFile) -> list[Finding]:
    return [
        SENSITIVE_MOUNT.finding(
            compose, service, mount.at, f"Sensitive host path {source} is mounted"
        )
        for mount, source in _bind_mounts(service)
        if _is_sensitive(source)
    ]


SENSITIVE_MOUNT = Rule(
    id="CD014",
    title="Sensitive host path mounted",
    severity=Severity.ERROR,
    rationale=(
        "Mounting the host root, system configuration (/etc), root's home, kernel interfaces "
        "(/proc, /sys), the boot partition or Docker's own data directory gives the container a "
        "way to read secrets from, or tamper with, the host."
    ),
    fix="Mount only the specific application directory the service needs, read-only if possible.",
    check=check_sensitive_mount,
)


# --- CD006 ---------------------------------------------------------------------------------

SECRET_NAME = re.compile(
    r"(?i)(pass(word)?|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|credential)"
)


def _is_hardcoded_secret(var: EnvVar) -> bool:
    if not SECRET_NAME.search(var.name) or var.name.upper().endswith("_FILE"):
        return False
    if var.value is None or not var.value.strip():
        return False
    return not contains_interpolation(var.value)


def check_hardcoded_secret(service: Service, compose: ComposeFile) -> list[Finding]:
    environment = service.raw.get("environment")
    if environment is None:
        return []
    return [
        # Only the variable's name is reported; its value must never reach any output.
        HARDCODED_SECRET.finding(
            compose,
            service,
            var.at,
            f"Environment variable '{var.name}' has a hard-coded secret value",
        )
        for var in iter_environment(environment)
        if isinstance(var, EnvVar) and _is_hardcoded_secret(var)
    ]


HARDCODED_SECRET = Rule(
    id="CD006",
    title="Hard-coded secret in environment",
    severity=Severity.ERROR,
    rationale=(
        "A password, token or key written into the Compose file ends up in version control, in "
        "'docker inspect' output and in anyone's copy of the repository. Rotating it means "
        "rewriting history."
    ),
    fix=(
        "Load it from the environment or an untracked .env file (KEY: ${KEY}), or use Docker "
        "secrets with a *_FILE variable."
    ),
    check=check_hardcoded_secret,
)


# --- CD011 ---------------------------------------------------------------------------------

DANGEROUS_CAPABILITIES = frozenset({"ALL", "SYS_ADMIN", "NET_ADMIN", "SYS_PTRACE", "SYS_MODULE"})


def _capability(item: Located[Value]) -> str:
    return (text(item) or "").strip().upper().removeprefix("CAP_")


def check_dangerous_capability(service: Service, compose: ComposeFile) -> list[Finding]:
    findings = []
    for item in sequence(service.raw.get("cap_add")) or ():
        capability = _capability(item)
        if capability in DANGEROUS_CAPABILITIES:
            findings.append(
                DANGEROUS_CAPABILITY.finding(
                    compose, service, item, f"Dangerous capability {capability} is added"
                )
            )
    return findings


DANGEROUS_CAPABILITY = Rule(
    id="CD011",
    title="Dangerous capability",
    severity=Severity.ERROR,
    rationale=(
        "SYS_ADMIN is close to full root, SYS_MODULE loads kernel modules, SYS_PTRACE can read "
        "other processes' memory, NET_ADMIN reconfigures host-visible networking, and ALL grants "
        "everything. Each one widens the path from a compromised container to the host."
    ),
    fix="Remove the capability, or replace it with the narrowest one the service needs.",
    check=check_dangerous_capability,
)


# --- CD012 ---------------------------------------------------------------------------------

UNCONFINED_OPTIONS = frozenset(
    {"seccomp:unconfined", "seccomp=unconfined", "apparmor:unconfined", "apparmor=unconfined"}
)


def check_security_profile(service: Service, compose: ComposeFile) -> list[Finding]:
    findings = []
    for item in sequence(service.raw.get("security_opt")) or ():
        option = (text(item) or "").replace(" ", "").lower()
        if option in UNCONFINED_OPTIONS:
            profile = option.split(":")[0].split("=")[0]
            findings.append(
                SECURITY_PROFILE.finding(
                    compose, service, item, f"The {profile} security profile is disabled"
                )
            )
    return findings


SECURITY_PROFILE = Rule(
    id="CD012",
    title="Security profile disabled",
    severity=Severity.ERROR,
    rationale=(
        "Docker's default seccomp and AppArmor profiles block system calls and file accesses "
        "that containers almost never need but exploits often do. Running unconfined removes "
        "that layer of defence."
    ),
    fix=(
        "Remove the 'unconfined' option. If a specific call is blocked, use a custom profile "
        "that allows only that call."
    ),
    check=check_security_profile,
)


# --- CD013 ---------------------------------------------------------------------------------

HOST_NAMESPACE_KEYS = ("pid", "ipc", "userns_mode")


def check_host_namespace(service: Service, compose: ComposeFile) -> list[Finding]:
    return [
        HOST_NAMESPACE.finding(
            compose, service, key(service, name), f"'{name}: host' shares the host's namespace"
        )
        for name in HOST_NAMESPACE_KEYS
        if (text(service.raw.get(name)) or "").strip() == "host"
    ]


HOST_NAMESPACE = Rule(
    id="CD013",
    title="Host namespace shared",
    severity=Severity.WARNING,
    rationale=(
        "Sharing the host's PID namespace lets the container see and signal host processes; "
        "sharing IPC exposes host shared memory; 'userns_mode: host' disables user-namespace "
        "remapping so container root is host root."
    ),
    fix="Remove the setting so the container gets its own namespace.",
    check=check_host_namespace,
)


RULES = (
    PRIVILEGED,
    DOCKER_SOCKET,
    HARDCODED_SECRET,
    DANGEROUS_CAPABILITY,
    SECURITY_PROFILE,
    HOST_NAMESPACE,
    SENSITIVE_MOUNT,
)
