"""The ``.compose-doctor.yml`` configuration file.

```yaml
ignore: [CD015]
services:
  worker:
    ignore: [CD007]
severity:
  CD010: warning
fail_on: warning
```
"""

from __future__ import annotations

from collections.abc import Collection, Mapping
from dataclasses import dataclass, field
from pathlib import Path

from compose_doctor.errors import InputError
from compose_doctor.loader import parse_mapping
from compose_doctor.model import Located, LocatedMap, Severity, Value
from compose_doctor.rules.base import mapping, sequence, text

DEFAULT_CONFIG_NAME = ".compose-doctor.yml"
FAIL_ON_CHOICES = ("error", "warning", "note", "never")

_TOP_LEVEL_KEYS = ("ignore", "services", "severity", "fail_on")
_SERVICE_KEYS = ("ignore",)
_SEVERITIES = tuple(severity.value for severity in Severity)


@dataclass(frozen=True)
class Config:
    ignore: frozenset[str] = frozenset()
    service_ignores: Mapping[str, frozenset[str]] = field(default_factory=dict)
    severity: Mapping[str, Severity] = field(default_factory=dict)
    fail_on: str | None = None

    def ignores(self, rule_id: str, service: str | None) -> bool:
        """Whether ``rule_id`` is ignored globally or for ``service``."""
        if rule_id in self.ignore:
            return True
        return service is not None and rule_id in self.service_ignores.get(service, frozenset())


def load_config(path: Path, known_rules: Collection[str]) -> Config:
    """Read and validate a config file. Raises :class:`InputError` naming the problem."""
    display = str(path)
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        raise InputError("config file not found", file=display) from None
    except OSError as exc:
        raise InputError(f"cannot read config file: {exc.strerror}", file=display) from None
    try:
        source = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise InputError("config file is not valid UTF-8", file=display) from None
    root = parse_mapping(source, display)
    if root is None:
        return Config()
    return _Parser(display, known_rules).parse(root)


class _Parser:
    def __init__(self, path: str, known_rules: Collection[str]) -> None:
        self._path = path
        self._known = known_rules

    def _error(self, message: str, at: Located[object]) -> InputError:
        return InputError(message, file=self._path, line=at.line)

    def _check_keys(self, raw: LocatedMap, allowed: tuple[str, ...], where: str) -> None:
        for name in raw:
            if name not in allowed:
                raise self._error(
                    f"unknown key '{name}' in {where}; valid keys are: {', '.join(allowed)}",
                    raw.key(name),
                )

    def _rule_id(self, value: Located[Value]) -> str:
        rule_id = text(value)
        if rule_id is None or rule_id not in self._known:
            shown = rule_id if rule_id is not None else "(not a string)"
            raise self._error(
                f"unknown rule ID '{shown}'; valid IDs are: {', '.join(sorted(self._known))}",
                value,
            )
        return rule_id

    def _rule_list(self, value: Located[Value], where: str) -> frozenset[str]:
        items = sequence(value)
        if items is None:
            raise self._error(f"'{where}' must be a list of rule IDs", value)
        return frozenset(self._rule_id(item) for item in items)

    def parse(self, root: LocatedMap) -> Config:
        self._check_keys(root, _TOP_LEVEL_KEYS, "config file")
        ignore = self._rule_list(root["ignore"], "ignore") if "ignore" in root else frozenset()
        return Config(
            ignore=ignore,
            service_ignores=self._services(root.get("services")),
            severity=self._severity(root.get("severity")),
            fail_on=self._fail_on(root.get("fail_on")),
        )

    def _services(self, value: Located[Value] | None) -> dict[str, frozenset[str]]:
        if value is None:
            return {}
        services = mapping(value)
        if services is None:
            raise self._error("'services' must be a mapping of service names", value)
        result = {}
        for name in services:
            settings = mapping(services[name])
            if settings is None:
                raise self._error(f"'services.{name}' must be a mapping", services[name])
            self._check_keys(settings, _SERVICE_KEYS, f"'services.{name}'")
            if "ignore" in settings:
                result[name] = self._rule_list(settings["ignore"], f"services.{name}.ignore")
        return result

    def _severity(self, value: Located[Value] | None) -> dict[str, Severity]:
        if value is None:
            return {}
        overrides = mapping(value)
        if overrides is None:
            raise self._error("'severity' must be a mapping of rule IDs to severities", value)
        result = {}
        for name in overrides:
            rule_id = self._rule_id(overrides.key(name))
            level = text(overrides[name])
            if level not in _SEVERITIES:
                raise self._error(
                    f"invalid severity for {rule_id}; valid values are: {', '.join(_SEVERITIES)}",
                    overrides[name],
                )
            result[rule_id] = Severity(level)
        return result

    def _fail_on(self, value: Located[Value] | None) -> str | None:
        if value is None:
            return None
        level = text(value)
        if level not in FAIL_ON_CHOICES:
            raise self._error(
                f"invalid 'fail_on'; valid values are: {', '.join(FAIL_ON_CHOICES)}", value
            )
        return level
