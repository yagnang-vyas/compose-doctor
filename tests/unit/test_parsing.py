from __future__ import annotations

import pytest

from compose_doctor.model import Located, LocatedMap, Value
from compose_doctor.rules.parsing import (
    EnvVar,
    Invalid,
    Mount,
    Port,
    PortRange,
    is_loopback,
    iter_environment,
    normalize_host_path,
    parse_image,
    parse_port,
    parse_volume,
)


def scalar(value: Value, raw: str | None = None) -> Located[Value]:
    return Located(value, 1, 1, raw=raw if raw is not None else str(value))


def mapping(**items: Value) -> Located[Value]:
    entries = {
        name: (Located(name, 1), Located(value, 1, raw=str(value))) for name, value in items.items()
    }
    return Located(LocatedMap(entries), 1)


# --- images ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("reference", "name", "tag", "digest", "repository"),
    [
        ("nginx", "nginx", None, None, "nginx"),
        ("nginx:1.27", "nginx", "1.27", None, "nginx"),
        ("nginx:latest", "nginx", "latest", None, "nginx"),
        ("registry.local:5000/app", "registry.local:5000/app", None, None, "app"),
        ("registry.local:5000/app:1.2", "registry.local:5000/app", "1.2", None, "app"),
        ("ghcr.io/org/team/app:2.0", "ghcr.io/org/team/app", "2.0", None, "app"),
        ("postgres@sha256:abc", "postgres", None, "sha256:abc", "postgres"),
        ("postgres:16@sha256:abc", "postgres", "16", "sha256:abc", "postgres"),
        ("app:${TAG}", "app", "${TAG}", None, "app"),
        ("app:${TAG:-1.0}", "app", "${TAG:-1.0}", None, "app"),
        ("${REGISTRY:-localhost:5000}/app", "${REGISTRY:-localhost:5000}/app", None, None, "app"),
        ("${IMAGE}", "${IMAGE}", None, None, "${IMAGE}"),
    ],
)
def test_parse_image(
    reference: str, name: str, tag: str | None, digest: str | None, repository: str
) -> None:
    image = parse_image(reference)
    assert (image.name, image.tag, image.digest, image.repository) == (
        name,
        tag,
        digest,
        repository,
    )


# --- ports ----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("entry", "host_ip", "target"),
    [
        (scalar("80"), "", PortRange(80, 80)),
        (scalar(80), "", PortRange(80, 80)),
        (scalar("8080:80"), "", PortRange(80, 80)),
        (scalar(1342, raw="22:22"), "", PortRange(22, 22)),  # YAML 1.1 sexagesimal
        (scalar("127.0.0.1:8080:80"), "127.0.0.1", PortRange(80, 80)),
        (scalar("127.0.0.1::80"), "127.0.0.1", PortRange(80, 80)),
        (scalar("[::1]:8080:80"), "::1", PortRange(80, 80)),
        (scalar("::1:8080:80"), "::1", PortRange(80, 80)),
        (scalar("9000-9010:9000-9010"), "", PortRange(9000, 9010)),
        (scalar("53:53/udp"), "", PortRange(53, 53)),
        (scalar(" 8080:80/TCP "), "", PortRange(80, 80)),
        (scalar("${PORT}:80"), "", PortRange(80, 80)),
        (scalar("${PORT:-8080}:80"), "", PortRange(80, 80)),
        (scalar("${IP}:8080:80"), None, PortRange(80, 80)),
        (scalar("127.0.0.1:${PORT}:${TARGET}"), "127.0.0.1", None),
        (scalar("8080:${TARGET:-bad}"), "", None),
        (mapping(target=80), "", PortRange(80, 80)),
        (
            mapping(target=80, published="8080", host_ip="127.0.0.1", protocol="tcp"),
            "127.0.0.1",
            PortRange(80, 80),
        ),
        (mapping(target="${TARGET}", host_ip="${IP}"), None, None),
    ],
)
def test_parse_port(entry: Located[Value], host_ip: str | None, target: PortRange | None) -> None:
    port = parse_port(entry)
    assert isinstance(port, Port)
    assert (port.host_ip, port.target) == (host_ip, target)


@pytest.mark.parametrize(
    ("entry", "reason"),
    [
        (scalar("0"), "container port '0' is outside 1-65535"),
        (scalar("70000:80"), "host port '70000' is outside 1-65535"),
        (scalar("10-5:10-5"), "host port range '10-5' is reversed"),
        (scalar("8080:"), "container port '' is not a port number or range"),
        (scalar("80/icmp"), "port '80/icmp' has an unknown protocol 'icmp'"),
        (scalar("[::1"), "port '[::1' has a malformed IPv6 host address"),
        (scalar("[::1]:80"), "port '[::1]:80' has a host IP but no container port"),
        (scalar("example.com:80:80"), "host IP 'example.com' is not an IP address"),
        (scalar(True, raw="true"), "port entry must be a string, a number or a mapping"),
        (scalar(80.5, raw="80.5"), "port entry must be a string, a number or a mapping"),
        (Located((), 1), "port entry must be a string, a number or a mapping"),
        (mapping(published=80), "long-syntax port has no 'target'"),
        (mapping(target="abc"), "container port 'abc' is not a port number or range"),
        (mapping(target=80, host_ip="nope"), "host IP 'nope' is not an IP address"),
    ],
)
def test_parse_port_invalid(entry: Located[Value], reason: str) -> None:
    port = parse_port(entry)
    assert isinstance(port, Invalid)
    assert port.reason == reason
    assert port.at is entry


def test_port_range_membership_and_text() -> None:
    assert 5432 in PortRange(5000, 6000)
    assert 4999 not in PortRange(5000, 6000)
    assert "5432" not in PortRange(5000, 6000)
    assert str(PortRange(80, 80)) == "80"
    assert str(PortRange(80, 90)) == "80-90"


@pytest.mark.parametrize(
    ("address", "expected"),
    [("127.0.0.1", True), ("127.0.0.2", True), ("::1", True), ("0.0.0.0", False), ("", False)],
)
def test_is_loopback(address: str, expected: bool) -> None:
    assert is_loopback(address) is expected


# --- volumes --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/etc/", "/etc"),
        ("//var/run/docker.sock", "/var/run/docker.sock"),
        ("/srv/../etc", "/etc"),
        ("/./root/./x", "/root/x"),
        ("/", "/"),
        ("/../..", "/"),
    ],
)
def test_normalize_host_path(path: str, expected: str) -> None:
    assert normalize_host_path(path) == expected


@pytest.mark.parametrize(
    ("entry", "source"),
    [
        (scalar("/etc:/etc:ro"), "/etc"),
        (scalar("data:/data"), None),
        (scalar("./data:/data"), None),
        (scalar("/anonymous"), None),
        (scalar("${PWD}/x:/x"), None),
        (mapping(type="bind", source="/etc/", target="/x"), "/etc"),
        (mapping(type="bind", source="./x", target="/x"), None),
        (mapping(type="volume", source="data", target="/x"), None),
        (mapping(source="/etc", target="/x"), None),
    ],
)
def test_parse_volume(entry: Located[Value], source: str | None) -> None:
    mount = parse_volume(entry)
    assert isinstance(mount, Mount)
    assert mount.bind_source == source


def test_parse_volume_invalid() -> None:
    assert isinstance(parse_volume(scalar(5)), Invalid)
    assert isinstance(parse_volume(scalar("  ")), Invalid)


# --- environment ----------------------------------------------------------------------------


def test_environment_map_form() -> None:
    env = list(iter_environment(mapping(A="1", B=None)))
    assert [(e.name, e.value) for e in env if isinstance(e, EnvVar)] == [("A", "1"), ("B", None)]


def test_environment_list_form() -> None:
    items: tuple[Located[Value], ...] = (scalar("A=1"), scalar("B"), scalar("C="), scalar("D=x=y"))
    env = [e for e in iter_environment(Located(items, 1)) if isinstance(e, EnvVar)]
    assert [(e.name, e.value) for e in env] == [("A", "1"), ("B", None), ("C", ""), ("D", "x=y")]


def test_environment_invalid_shapes() -> None:
    (only,) = iter_environment(scalar("A=1"))
    assert isinstance(only, Invalid)
    (bad_item,) = iter_environment(Located((scalar(5),), 1))
    assert isinstance(bad_item, Invalid)
