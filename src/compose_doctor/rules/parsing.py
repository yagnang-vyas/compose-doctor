"""Parsers for the Compose value formats rules need: image references, ports, volumes and
environment entries.

Each parser takes a located value and returns either a parsed result or an :class:`Invalid`
describing why the entry cannot be understood. Invalid entries become ``CD000`` findings; the
other rules skip them. Error reasons never quote environment values.
"""

from __future__ import annotations

import ipaddress
import posixpath
import re
from collections.abc import Iterator
from dataclasses import dataclass

from compose_doctor.interpolation import contains_interpolation
from compose_doctor.model import Located, Value
from compose_doctor.rules.base import mapping, sequence, text


@dataclass(frozen=True)
class Invalid:
    """An entry that could not be parsed. ``reason`` is safe to print."""

    reason: str
    at: Located[Value]


# --- interpolation-aware splitting ---------------------------------------------------------

_BRACED = re.compile(r"\$\{[^}]*\}")


def _mask(value: str) -> str:
    """Replace each ``${...}`` with same-length filler so separators inside it are ignored."""
    return _BRACED.sub(lambda m: "_" * len(m.group()), value)


# --- image references ----------------------------------------------------------------------


@dataclass(frozen=True)
class ImageRef:
    """A parsed image reference such as ``registry.local:5000/team/app:1.2@sha256:...``."""

    name: str
    tag: str | None
    digest: str | None

    @property
    def repository(self) -> str:
        """The last path component of the name: ``postgres`` for ``docker.io/library/postgres``."""
        return self.name.rsplit("/", 1)[-1]


def parse_image(reference: str) -> ImageRef:
    """Split an image reference into name, tag and digest.

    A ``:`` only starts a tag when it comes after the last ``/``, so a registry port
    (``registry.local:5000/app``) is not mistaken for a tag. ``${...}`` spans are opaque.
    """
    masked = _mask(reference)
    digest = None
    at = masked.find("@")
    if at != -1:
        reference, digest, masked = reference[:at], reference[at + 1 :], masked[:at]
    colon = masked.rfind(":")
    if colon > masked.rfind("/"):
        return ImageRef(reference[:colon], reference[colon + 1 :], digest)
    return ImageRef(reference, None, digest)


# --- ports ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class PortRange:
    start: int
    end: int

    def __contains__(self, port: object) -> bool:
        return isinstance(port, int) and self.start <= port <= self.end

    def __str__(self) -> str:
        return str(self.start) if self.start == self.end else f"{self.start}-{self.end}"


@dataclass(frozen=True)
class Port:
    """A published port. ``None`` fields are unknown because they are interpolated.

    ``host_ip`` is ``""`` when no host IP is given, meaning every interface.
    """

    at: Located[Value]
    host_ip: str | None
    target: PortRange | None


_PROTOCOLS = {"tcp", "udp", "sctp"}


def _port_range(value: str, *, what: str) -> PortRange | str:
    """Parse ``80`` or ``9000-9010``. Returns an error reason string on failure."""
    start_text, dash, end_text = value.partition("-")
    if not dash:
        end_text = start_text
    if not (start_text.isdigit() and end_text.isdigit()):
        return f"{what} '{value}' is not a port number or range"
    start, end = int(start_text), int(end_text)
    if not (1 <= start <= 65535 and 1 <= end <= 65535):
        return f"{what} '{value}' is outside 1-65535"
    if start > end:
        return f"{what} range '{value}' is reversed"
    return PortRange(start, end)


def _host_ip(value: str) -> str | None:
    """Validate a host IP; returns an error reason or ``None`` when it is acceptable."""
    if value == "" or contains_interpolation(value):
        return None
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return f"host IP '{value}' is not an IP address"
    return None


def _split_short_port(entry: str) -> tuple[str, str, str] | str:
    """Split ``[[host_ip:]published:]target`` into its three parts, or return a reason."""
    if entry.startswith("["):
        close = entry.find("]")
        if close == -1 or entry[close + 1 : close + 2] != ":":
            return f"port '{entry}' has a malformed IPv6 host address"
        published, sep, target = entry[close + 2 :].partition(":")
        if not sep:
            return f"port '{entry}' has a host IP but no container port"
        return entry[1:close], published, target

    parts = entry.split(":")
    if len(parts) > 3:
        # Unbracketed IPv6 host address: the last two fields are the ports.
        return ":".join(parts[:-2]), parts[-2], parts[-1]
    padded = ["", "", *parts][-3:]
    return padded[0], padded[1], padded[2]


def parse_short_port(at: Located[Value]) -> Port | Invalid:
    entry = text(at)
    if entry is None or isinstance(at.value, (bool, float)):
        return Invalid("port entry must be a string, a number or a mapping", at)
    entry = entry.strip()
    if contains_interpolation(entry):
        return _parse_interpolated_port(entry, at)

    body, slash, protocol = entry.partition("/")
    if slash and protocol.lower() not in _PROTOCOLS:
        return Invalid(f"port '{entry}' has an unknown protocol '{protocol}'", at)
    split = _split_short_port(body)
    if isinstance(split, str):
        return Invalid(split, at)
    host_ip, published, target_text = split

    reason = _host_ip(host_ip)
    if reason is None and published:
        published_range = _port_range(published, what="host port")
        reason = published_range if isinstance(published_range, str) else None
    if reason is not None:
        return Invalid(reason, at)
    target = _port_range(target_text, what="container port")
    if isinstance(target, str):
        return Invalid(target, at)
    return Port(at, host_ip, target)


def _parse_interpolated_port(entry: str, at: Located[Value]) -> Port:
    """Best-effort parse of an entry with ``${...}``: interpolated parts become unknown."""
    masked = _mask(entry.partition("/")[0])
    fields = masked.split(":")
    raw_fields = []
    offset = 0
    for field in fields:
        raw_fields.append(entry[offset : offset + len(field)])
        offset += len(field) + 1
    target_text = raw_fields[-1]
    host_ip = raw_fields[0] if len(raw_fields) == 3 else ""
    target: PortRange | None = None
    if not contains_interpolation(target_text):
        parsed = _port_range(target_text, what="container port")
        target = parsed if isinstance(parsed, PortRange) else None
    return Port(at, None if contains_interpolation(host_ip) else host_ip, target)


def parse_long_port(at: Located[Value]) -> Port | Invalid:
    spec = mapping(at)
    assert spec is not None  # callers only pass mappings
    target_text = text(spec.get("target"))
    if target_text is None:
        return Invalid("long-syntax port has no 'target'", at)
    host_ip = text(spec.get("host_ip")) or ""
    reason = _host_ip(host_ip)
    if reason is not None:
        return Invalid(reason, at)

    target: PortRange | None = None
    if not contains_interpolation(target_text):
        parsed = _port_range(target_text.strip(), what="container port")
        if isinstance(parsed, str):
            return Invalid(parsed, at)
        target = parsed
    return Port(at, None if contains_interpolation(host_ip) else host_ip, target)


def parse_port(at: Located[Value]) -> Port | Invalid:
    """Parse one entry of ``ports:`` in short or long syntax."""
    if mapping(at) is not None:
        return parse_long_port(at)
    return parse_short_port(at)


def is_loopback(host_ip: str) -> bool:
    try:
        return ipaddress.ip_address(host_ip).is_loopback
    except ValueError:
        return False


# --- volumes -------------------------------------------------------------------------------


@dataclass(frozen=True)
class Mount:
    """A volume entry. ``bind_source`` is the normalized host path for bind mounts."""

    at: Located[Value]
    bind_source: str | None


def normalize_host_path(path: str) -> str:
    """Normalize an absolute host path: collapse ``//``, ``.``, ``..`` and trailing slashes."""
    normalized = posixpath.normpath("/" + path.lstrip("/"))
    return normalized


def parse_volume(at: Located[Value]) -> Mount | Invalid:
    """Parse one entry of a service's ``volumes:`` in short or long syntax."""
    spec = mapping(at)
    if spec is not None:
        source = text(spec.get("source"))
        kind = text(spec.get("type"))
        if text(spec.get("target")) is None:
            return Invalid("long-syntax volume has no 'target'", at)
        if kind == "bind" and source is not None and not contains_interpolation(source):
            return Mount(at, normalize_host_path(source) if source.startswith("/") else None)
        return Mount(at, None)

    entry = text(at) if isinstance(at.value, str) else None
    if entry is None or not entry.strip():
        return Invalid("volume entry must be a non-empty string or a mapping", at)
    parts = entry.split(":")
    if len(parts) > 3:
        return Invalid(f"volume '{entry}' has too many ':'-separated fields", at)
    source = parts[0] if len(parts) > 1 else ""
    if source.startswith("/") and not contains_interpolation(source):
        return Mount(at, normalize_host_path(source))
    return Mount(at, None)


# --- environment ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EnvVar:
    """One environment entry. ``value`` is ``None`` when the key is listed without a value.

    The value is only ever inspected, never printed.
    """

    name: str
    value: str | None
    at: Located[object]


def iter_environment(value: Located[Value]) -> Iterator[EnvVar | Invalid]:
    """Yield the entries of ``environment:`` in map or ``KEY=value`` list form."""
    env_map = mapping(value)
    if env_map is not None:
        for name in env_map:
            yield EnvVar(name, text(env_map[name]), env_map.key(name))
        return
    items = sequence(value)
    if items is None:
        yield Invalid("'environment' must be a mapping or a list", value)
        return
    for item in items:
        if not isinstance(item.value, str):
            yield Invalid("environment list entries must be strings", item)
            continue
        name, equals, entry_value = item.value.partition("=")
        yield EnvVar(name.strip(), entry_value if equals else None, item)
