"""Networking rules."""

from __future__ import annotations

from compose_doctor.model import ComposeFile, Finding, Service, Severity
from compose_doctor.rules.base import Rule, key, sequence, text
from compose_doctor.rules.parsing import Port, is_loopback, parse_image, parse_port

# --- CD004 ---------------------------------------------------------------------------------


def check_host_network(service: Service, compose: ComposeFile) -> list[Finding]:
    if (text(service.raw.get("network_mode")) or "").strip() != "host":
        return []
    return [
        HOST_NETWORK.finding(
            compose,
            service,
            key(service, "network_mode"),
            "Container uses the host's network stack",
        )
    ]


HOST_NETWORK = Rule(
    id="CD004",
    title="Host network mode",
    severity=Severity.WARNING,
    rationale=(
        "With 'network_mode: host' every port the container listens on is open on the host's "
        "interfaces, bypassing Compose port mapping, and the container can reach services bound "
        "to the host's loopback address."
    ),
    fix="Remove 'network_mode: host' and publish only the ports you need with 'ports:'.",
    check=check_host_network,
)


# --- CD005 ---------------------------------------------------------------------------------

DATABASE_PORTS = {
    5432: "PostgreSQL",
    3306: "MySQL/MariaDB",
    27017: "MongoDB",
    6379: "Redis",
    9200: "Elasticsearch/OpenSearch",
    9300: "Elasticsearch/OpenSearch",
    11211: "Memcached",
    5672: "RabbitMQ",
}

DATABASE_IMAGES = {
    "postgres": "PostgreSQL",
    "mysql": "MySQL",
    "mariadb": "MariaDB",
    "mongo": "MongoDB",
    "redis": "Redis",
    "elasticsearch": "Elasticsearch",
    "opensearch": "OpenSearch",
    "memcached": "Memcached",
    "rabbitmq": "RabbitMQ",
}


def _database_image(service: Service) -> str | None:
    reference = text(service.raw.get("image"))
    if reference is None:
        return None
    return DATABASE_IMAGES.get(parse_image(reference.strip()).repository.lower())


def _database_for_port(port: Port, image_product: str | None) -> str | None:
    if port.target is not None:
        for number, product in DATABASE_PORTS.items():
            if number in port.target:
                return product
    return image_product


def check_exposed_database(service: Service, compose: ComposeFile) -> list[Finding]:
    image_product = _database_image(service)
    findings = []
    for entry in sequence(service.raw.get("ports")) or ():
        port = parse_port(entry)
        if not isinstance(port, Port) or port.host_ip is None or is_loopback(port.host_ip):
            continue
        product = _database_for_port(port, image_product)
        if product is None:
            continue
        target = f"container port {port.target}" if port.target is not None else "a port"
        where = (
            "on all interfaces"
            if port.host_ip in ("", "0.0.0.0", "::")
            else f"on {port.host_ip}, which is not a loopback address"
        )
        findings.append(
            EXPOSED_DATABASE.finding(
                compose, service, entry, f"{product} {target} is published {where}"
            )
        )
    return findings


EXPOSED_DATABASE = Rule(
    id="CD005",
    title="Database port exposed on all interfaces",
    severity=Severity.ERROR,
    rationale=(
        "Publishing a database port without a loopback host IP makes it reachable from every "
        "network the host is on, and Docker's iptables rules bypass host firewalls such as ufw. "
        "Exposed databases are found and attacked within hours."
    ),
    fix=(
        "Remove the port mapping and connect over the Compose network, or bind to loopback: "
        "'127.0.0.1:5432:5432'."
    ),
    check=check_exposed_database,
)


RULES = (HOST_NETWORK, EXPOSED_DATABASE)
