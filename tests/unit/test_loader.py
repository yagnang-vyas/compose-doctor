from __future__ import annotations

import textwrap

import pytest

from compose_doctor.errors import InputError
from compose_doctor.loader import MAX_NODES, load_bytes, load_text
from compose_doctor.model import ComposeFile, Located, LocatedMap, Service, Value


def load(source: str) -> ComposeFile:
    return load_text(textwrap.dedent(source), "compose.yaml")


def service(source: str, name: str = "web") -> Service:
    for svc in load(source).services:
        if svc.name == name:
            return svc
    raise AssertionError(f"no service {name}")


def as_map(located: Located[Value]) -> LocatedMap:
    assert isinstance(located.value, LocatedMap)
    return located.value


def as_seq(located: Located[Value]) -> tuple[Located[Value], ...]:
    assert isinstance(located.value, tuple)
    return located.value


def load_error(source: str) -> InputError:
    with pytest.raises(InputError) as exc:
        load(source)
    return exc.value


# --- line numbers ---------------------------------------------------------------------------


def test_service_lines_and_order() -> None:
    compose = load(
        """\
        name: demo
        services:
          web:
            image: nginx:1.27
          db:
            image: postgres:16.4
        """
    )
    assert [(s.name, s.line, s.column) for s in compose.services] == [("web", 3, 3), ("db", 5, 3)]
    assert compose.path == "compose.yaml"
    assert "name" in compose.root


def test_key_and_value_lines() -> None:
    web = service(
        """\
        services:
          web:
            image: nginx:1.27
            privileged:
              true
        """
    )
    assert web.raw.key("image").line == 3
    assert web.raw["image"] == Located("nginx:1.27", 3, 12, raw="nginx:1.27")
    assert web.raw.key("privileged").line == 4
    assert web.raw["privileged"].line == 5


def test_list_item_lines() -> None:
    web = service(
        """\
        services:
          web:
            ports:
              - "8080:80"

              - target: 443
                published: 8443
        """
    )
    ports = as_seq(web.raw["ports"])
    assert [p.line for p in ports] == [4, 6]
    assert as_map(ports[1]).key("published").line == 7


def test_entry_returns_key_and_value() -> None:
    web = service("services:\n  web:\n    image: nginx\n")
    key, value = web.raw.entry("image")
    assert key.value == "image"
    assert value.value == "nginx"
    assert len(web.raw) == 1
    assert "LocatedMap" in repr(web.raw)


# --- scalar typing --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("true", True),
        ("yes", True),
        ("off", False),
        ("42", 42),
        ("0x1F", 31),
        ("22:22", 1342),  # YAML 1.1 sexagesimal: why the raw text is kept
        ("1.5", 1.5),
        ("~", None),
        ("", None),
        ('"true"', "true"),
        ("'42'", "42"),
        ("plain", "plain"),
        ("2024-01-01", "2024-01-01"),  # timestamps stay text
        ("!reset null", "null"),  # unknown tags keep their source text
    ],
)
def test_scalar_types(text: str, expected: object) -> None:
    web = service(f"services:\n  web:\n    value: {text}\n")
    value = web.raw["value"]
    assert value.value == expected
    assert type(value.value) is type(expected)


def test_raw_text_is_kept() -> None:
    web = service("services:\n  web:\n    ports:\n      - 22:22\n")
    port = as_seq(web.raw["ports"])[0]
    assert port.value == 1342
    assert port.raw == "22:22"


def test_keys_keep_source_text() -> None:
    web = service("services:\n  web:\n    on: 1\n    80: 2\n")
    assert list(web.raw) == ["on", "80"]


# --- aliases and merge keys -----------------------------------------------------------------


def test_alias_value_keeps_anchor_line() -> None:
    web = service(
        """\
        x-image: &image nginx:1.27
        services:
          web:
            image: *image
        """
    )
    assert web.raw.key("image").line == 4
    assert web.raw["image"].value == "nginx:1.27"
    assert web.raw["image"].line == 1


def test_single_merge_key() -> None:
    web = service(
        """\
        x-defaults: &defaults
          restart: unless-stopped
          mem_limit: 512m
        services:
          web:
            <<: *defaults
            image: nginx:1.27
        """
    )
    assert set(web.raw) == {"restart", "mem_limit", "image"}
    # A merged value keeps the line of its definition.
    assert web.raw.key("restart").line == 2
    assert web.raw["mem_limit"].line == 3
    assert "<<" not in web.raw


def test_explicit_keys_win_over_merged_keys() -> None:
    web = service(
        """\
        x-defaults: &defaults
          restart: always
        services:
          web:
            restart: "no"
            <<: *defaults
        """
    )
    assert web.raw["restart"].value == "no"
    assert web.raw["restart"].line == 5


def test_merge_list_earlier_entries_win() -> None:
    web = service(
        """\
        x-a: &a
          restart: always
          mem_limit: 1g
        x-b: &b
          restart: "no"
          cpus: 2
        services:
          web:
            <<: [*a, *b]
        """
    )
    assert web.raw["restart"].value == "always"
    assert web.raw["restart"].line == 2
    assert web.raw["mem_limit"].value == "1g"
    assert web.raw["cpus"].value == 2
    assert web.raw["cpus"].line == 6


def test_nested_merge_and_inline_merge_source() -> None:
    web = service(
        """\
        x-base: &base
          restart: always
        x-app: &app
          <<: *base
          mem_limit: 1g
        services:
          web:
            <<: [*app, {cpus: 1}]
        """
    )
    assert web.raw["restart"].line == 2
    assert web.raw["mem_limit"].line == 5
    assert web.raw["cpus"].line == 8


def test_merge_through_alias_to_list_of_mappings() -> None:
    web = service(
        """\
        x-parts: &parts
          - {restart: always}
          - {cpus: 1}
        services:
          web:
            <<: *parts
        """
    )
    assert set(web.raw) == {"restart", "cpus"}


def test_quoted_merge_key_is_a_plain_key() -> None:
    web = service('services:\n  web:\n    "<<": value\n')
    assert web.raw["<<"].value == "value"


def test_extension_services_are_skipped() -> None:
    compose = load(
        """\
        services:
          x-template:
            image: nginx
          web:
            image: nginx
        """
    )
    assert [s.name for s in compose.services] == ["web"]


def test_empty_services_mapping_is_allowed() -> None:
    assert load("services: {}\n").services == ()


# --- alias bombs and nesting ----------------------------------------------------------------


def billion_laughs(levels: int) -> str:
    lines = ["a0: &a0 [x, x, x, x, x, x, x, x, x, x]"]
    for i in range(1, levels):
        refs = ", ".join([f"*a{i - 1}"] * 10)
        lines.append(f"a{i}: &a{i} [{refs}]")
    lines.append("services: {}")
    return "\n".join(lines) + "\n"


def test_alias_bomb_rejected() -> None:
    err = load_error(billion_laughs(9))
    assert err.message == "document expands to too many nodes"
    assert err.file == "compose.yaml"


def test_moderate_alias_use_is_accepted() -> None:
    # 10 + 100 + 1000 values: well under the limit.
    assert MAX_NODES > 1200
    load(billion_laughs(3))


def test_recursive_alias_rejected() -> None:
    err = load_error("services: {}\nloop: &loop [*loop]\n")
    assert err.message == "recursive alias"
    assert err.line == 2


def test_deep_nesting_rejected() -> None:
    err = load_error("services: {}\nx: " + "[" * 150 + "]" * 150 + "\n")
    assert err.message == "document is nested too deeply"
    assert err.line == 2


def test_nesting_beyond_parser_recursion_rejected() -> None:
    err = load_error("services: {}\nx: " + "[" * 5000 + "]" * 5000 + "\n")
    assert err.message == "document is nested too deeply"


# --- input errors ---------------------------------------------------------------------------


def test_yaml_syntax_error_uses_problem_line() -> None:
    err = load_error("services:\n  web:\n    image: nginx\n   bad: [\n")
    assert err.message.startswith("invalid YAML: ")
    assert err.line == 4


def test_tab_indentation_error_line() -> None:
    err = load_error("services:\n\tweb: {}\n")
    assert err.line == 2


def test_undefined_alias_error() -> None:
    err = load_error("services:\n  web: *missing\n")
    assert err.message == "invalid YAML: found undefined alias 'missing'"
    assert err.line == 2


def test_empty_document() -> None:
    err = load_error("")
    assert (err.message, err.line) == ("file is empty", 1)


def test_comment_only_document() -> None:
    assert load_error("# nothing here\n").message == "file is empty"


def test_top_level_not_mapping() -> None:
    err = load_error("\n- web\n")
    assert (err.message, err.line) == ("top-level value must be a mapping", 2)


def test_missing_services() -> None:
    err = load_error("version: '3.8'\n")
    assert (err.message, err.line) == ("missing top-level 'services' key", 1)


@pytest.mark.parametrize("value", ["", " []", " nginx"])
def test_services_not_mapping(value: str) -> None:
    err = load_error(f"name: demo\nservices:{value}\n")
    assert (err.message, err.line) == ("'services' must be a mapping", 2)


def test_service_not_mapping() -> None:
    err = load_error("services:\n  web:\n    image: nginx\n  db: postgres\n")
    assert (err.message, err.line) == ("service 'db' must be a mapping", 4)


def test_multiple_documents() -> None:
    err = load_error("services: {}\n---\nservices: {}\n")
    assert err.message == "multiple YAML documents in one file are not supported"
    assert err.line == 2


def test_duplicate_key() -> None:
    err = load_error("services:\n  web:\n    image: a\n    image: b\n")
    assert (err.message, err.line) == ("duplicate key 'image'", 4)


def test_non_scalar_key() -> None:
    err = load_error("services:\n  web:\n    ? [a, b]\n    : value\n")
    assert (err.message, err.line) == ("mapping keys must be scalars", 3)


def test_merge_of_non_mapping() -> None:
    err = load_error("x: &x [1]\nservices:\n  web:\n    <<: *x\n")
    assert err.message == "merge key '<<' must refer to a mapping or a list of mappings"
    # A non-mapping item inside a sequence points at the item.
    err = load_error("services:\n  web:\n    <<: [{a: 1}, b]\n")
    assert err.line == 3


def test_error_message_does_not_echo_values() -> None:
    err = load_error("services:\n  web:\n    environment:\n      PASSWORD: fake-pass-123\n  bad\n")
    assert "fake-pass-123" not in str(err)


# --- byte decoding --------------------------------------------------------------------------


def test_load_bytes_utf8_with_bom() -> None:
    compose = load_bytes("﻿services:\n  wéb: {}\n".encode(), "compose.yaml")
    assert compose.services[0].name == "wéb"
    assert compose.services[0].line == 2


def test_load_bytes_invalid_utf8_names_file_and_line() -> None:
    with pytest.raises(InputError) as exc:
        load_bytes(b"services:\n  web:\n    image: \xff\n", "bad.yaml")
    assert str(exc.value) == "bad.yaml:3: file is not valid UTF-8"


def test_reader_error_for_control_character() -> None:
    err = load_error("services:\n  web: {}\n\x01\n")
    assert err.message.startswith("invalid YAML: ")
