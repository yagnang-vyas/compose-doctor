from __future__ import annotations

from pathlib import Path

import pytest

from compose_doctor.config import Config, load_config
from compose_doctor.errors import InputError
from compose_doctor.model import Severity
from compose_doctor.rules import RULES_BY_ID


def write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / ".compose-doctor.yml"
    path.write_text(text, encoding="utf-8")
    return path


def config_error(tmp_path: Path, text: str) -> InputError:
    with pytest.raises(InputError) as exc:
        load_config(write(tmp_path, text), RULES_BY_ID)
    return exc.value


def test_full_config(tmp_path: Path) -> None:
    config = load_config(
        write(
            tmp_path,
            "ignore: [CD015]\n"
            "services:\n"
            "  worker:\n"
            "    ignore: [CD007, CD010]\n"
            "  web: {}\n"
            "severity:\n"
            "  CD010: warning\n"
            "fail_on: warning\n",
        ),
        RULES_BY_ID,
    )
    assert config.ignore == {"CD015"}
    assert config.service_ignores == {"worker": {"CD007", "CD010"}}
    assert config.severity == {"CD010": Severity.WARNING}
    assert config.fail_on == "warning"


def test_empty_config_file(tmp_path: Path) -> None:
    assert load_config(write(tmp_path, "# nothing\n"), RULES_BY_ID) == Config()


def test_ignores() -> None:
    config = Config(ignore=frozenset({"CD015"}), service_ignores={"worker": frozenset({"CD007"})})
    assert config.ignores("CD015", "web")
    assert config.ignores("CD007", "worker")
    assert not config.ignores("CD007", "web")
    assert not config.ignores("CD007", None)


def test_unknown_top_level_key(tmp_path: Path) -> None:
    err = config_error(tmp_path, "ignore: []\nignored: [CD001]\n")
    assert err.line == 2
    assert "unknown key 'ignored'" in err.message
    assert "ignore, services, severity, fail_on" in err.message


def test_unknown_rule_id(tmp_path: Path) -> None:
    err = config_error(tmp_path, "ignore:\n  - CD001\n  - CD999\n")
    assert err.line == 3
    assert "unknown rule ID 'CD999'" in err.message
    assert "CD000, CD001" in err.message


def test_non_string_rule_id(tmp_path: Path) -> None:
    assert "(not a string)" in config_error(tmp_path, "ignore: [[CD001]]\n").message


def test_ignore_must_be_list(tmp_path: Path) -> None:
    assert (
        config_error(tmp_path, "ignore: CD001\n").message == "'ignore' must be a list of rule IDs"
    )


def test_services_must_be_mapping(tmp_path: Path) -> None:
    assert "'services' must be a mapping" in config_error(tmp_path, "services: [web]\n").message


def test_service_entry_must_be_mapping(tmp_path: Path) -> None:
    err = config_error(tmp_path, "services:\n  web: CD001\n")
    assert err.message == "'services.web' must be a mapping"


def test_unknown_service_key(tmp_path: Path) -> None:
    err = config_error(tmp_path, "services:\n  web:\n    severity: {}\n")
    assert "unknown key 'severity' in 'services.web'" in err.message
    assert err.line == 3


def test_service_unknown_rule(tmp_path: Path) -> None:
    err = config_error(tmp_path, "services:\n  web:\n    ignore: [CD100]\n")
    assert "unknown rule ID 'CD100'" in err.message


def test_severity_must_be_mapping(tmp_path: Path) -> None:
    assert "'severity' must be a mapping" in config_error(tmp_path, "severity: [CD001]\n").message


def test_severity_unknown_rule(tmp_path: Path) -> None:
    assert "unknown rule ID 'CD777'" in config_error(tmp_path, "severity:\n  CD777: note\n").message


def test_severity_invalid_level(tmp_path: Path) -> None:
    err = config_error(tmp_path, "severity:\n  CD010: critical\n")
    assert err.message == "invalid severity for CD010; valid values are: error, warning, note"
    assert err.line == 2


def test_invalid_fail_on(tmp_path: Path) -> None:
    err = config_error(tmp_path, "fail_on: sometimes\n")
    assert err.message == "invalid 'fail_on'; valid values are: error, warning, note, never"


def test_missing_config_file(tmp_path: Path) -> None:
    with pytest.raises(InputError) as exc:
        load_config(tmp_path / "missing.yml", RULES_BY_ID)
    assert exc.value.message == "config file not found"


def test_config_path_is_directory(tmp_path: Path) -> None:
    with pytest.raises(InputError) as exc:
        load_config(tmp_path, RULES_BY_ID)
    assert exc.value.message.startswith("cannot read config file")


def test_config_not_utf8(tmp_path: Path) -> None:
    path = tmp_path / "c.yml"
    path.write_bytes(b"ignore: [\xff]\n")
    with pytest.raises(InputError) as exc:
        load_config(path, RULES_BY_ID)
    assert exc.value.message == "config file is not valid UTF-8"


def test_config_yaml_error_has_line(tmp_path: Path) -> None:
    err = config_error(tmp_path, "ignore: [CD001\nfail_on: note\n")
    assert err.message.startswith("invalid YAML")
