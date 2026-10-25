"""In-process CLI tests (subprocess tests live in tests/integration)."""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest

from compose_doctor import cli
from compose_doctor.rules import RULES

CLEAN = "services:\n  web:\n    image: nginx:1.27\n    restart: always\n    mem_limit: 64m\n"
NOTE_ONLY = "services:\n  web:\n    image: nginx:1.27\n    restart: always\n"
WARNING = "services:\n  web:\n    image: nginx\n    restart: always\n    mem_limit: 64m\n"
ERROR = CLEAN + "    privileged: true\n"


@pytest.fixture
def workdir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.chdir(tmp_path)
    return tmp_path


def run(capsys: pytest.CaptureFixture[str], *argv: str) -> tuple[int, str, str]:
    code = cli.main(list(argv))
    out, err = capsys.readouterr()
    return code, out, err


def test_clean_file_exits_zero(workdir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (workdir / "c.yaml").write_text(CLEAN)
    assert run(capsys, "c.yaml") == (0, "No problems found in 1 file.\n", "")


@pytest.mark.parametrize(
    ("source", "fail_on", "code"),
    [
        (ERROR, None, 1),
        (WARNING, None, 0),
        (WARNING, "warning", 1),
        (NOTE_ONLY, "warning", 0),
        (NOTE_ONLY, "note", 1),
        (ERROR, "never", 0),
    ],
)
def test_fail_on(
    workdir: Path, capsys: pytest.CaptureFixture[str], source: str, fail_on: str | None, code: int
) -> None:
    (workdir / "c.yaml").write_text(source)
    args = ["c.yaml"] + ([f"--fail-on={fail_on}"] if fail_on else [])
    assert run(capsys, *args)[0] == code


def test_fail_on_from_config_and_cli_override(
    workdir: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (workdir / "c.yaml").write_text(WARNING)
    (workdir / ".compose-doctor.yml").write_text("fail_on: warning\n")
    assert run(capsys, "c.yaml")[0] == 1
    assert run(capsys, "c.yaml", "--fail-on", "error")[0] == 0


def test_explicit_config_path(workdir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (workdir / "c.yaml").write_text(ERROR)
    (workdir / "custom.yml").write_text("ignore: [CD002]\n")
    code, out, _ = run(capsys, "--config", "custom.yml", "c.yaml")
    assert code == 0
    assert out == "No problems found in 1 file (1 suppressed).\n"


def test_cli_ignore_adds_to_config(workdir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (workdir / "c.yaml").write_text(ERROR.replace("nginx:1.27", "nginx"))
    (workdir / ".compose-doctor.yml").write_text("ignore: [CD001]\n")
    code, out, _ = run(capsys, "c.yaml", "--ignore", "cd002", "--ignore=CD010,")
    assert (code, out) == (0, "No problems found in 1 file (2 suppressed).\n")


def test_unknown_ignore_id_is_usage_error(
    workdir: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as exc:
        cli.main(["--ignore", "CD001,CD404", "c.yaml"])
    assert exc.value.code == 2
    assert "unknown rule ID(s) for --ignore: CD404" in capsys.readouterr().err


def test_bad_format_is_usage_error(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        cli.main(["--format", "xml"])
    assert exc.value.code == 2


def test_list_rules(capsys: pytest.CaptureFixture[str]) -> None:
    code, out, _ = run(capsys, "--list-rules")
    assert code == 0
    for rule in RULES:
        assert f"{rule.id}  {rule.severity.value:<7}  {rule.title}\n    {rule.rationale}" in out


def test_discovery_order(workdir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (workdir / "docker-compose.yml").write_text(ERROR)
    (workdir / "compose.yml").write_text(CLEAN)
    code, out, _ = run(capsys)
    assert (code, out) == (0, "No problems found in 1 file.\n")


def test_discovery_none_found(workdir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        cli.main([])
    assert exc.value.code == 2
    assert "none of compose.yaml, compose.yml" in capsys.readouterr().err


def test_stdin(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    fake = io.TextIOWrapper(io.BytesIO(ERROR.encode()))
    monkeypatch.setattr("sys.stdin", fake)
    code, out, _ = run(capsys, "-", "--format", "json")
    assert code == 1
    assert json.loads(out)["findings"][0]["file"] == "<stdin>"


def test_stdin_only_once(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        cli.main(["-", "-"])
    assert exc.value.code == 2


@pytest.mark.parametrize(
    ("setup", "message"),
    [
        (lambda d: None, "compose-doctor: error: missing.yaml: no such file\n"),
        (
            lambda d: (d / "missing.yaml").mkdir(),
            "compose-doctor: error: missing.yaml: is a directory\n",
        ),
        (
            lambda d: (d / "missing.yaml").write_text("services:\n  web: [\n"),
            "compose-doctor: error: missing.yaml:3: invalid YAML: ",
        ),
    ],
)
def test_input_errors(
    workdir: Path, capsys: pytest.CaptureFixture[str], setup: object, message: str
) -> None:
    setup(workdir)  # type: ignore[operator]  # parametrized callables
    code, out, err = run(capsys, "missing.yaml")
    assert (code, out) == (2, "")
    assert err.startswith(message)
    assert "Traceback" not in err


def test_unreadable_file(
    workdir: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    (workdir / "c.yaml").write_text(CLEAN)

    def deny(self: Path) -> bytes:
        raise PermissionError(13, "Permission denied")

    monkeypatch.setattr(Path, "read_bytes", deny)
    code, _, err = run(capsys, "c.yaml")
    assert code == 2
    assert err == "compose-doctor: error: c.yaml: cannot read file: Permission denied\n"


def test_invalid_config_is_input_error(workdir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (workdir / "c.yaml").write_text(CLEAN)
    (workdir / ".compose-doctor.yml").write_text("ignore: [CD999]\n")
    code, _, err = run(capsys, "c.yaml")
    assert code == 2
    assert err.startswith("compose-doctor: error: .compose-doctor.yml:1: unknown rule ID 'CD999'")


def test_keyboard_interrupt(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def interrupt(*args: object) -> int:
        raise KeyboardInterrupt

    monkeypatch.setattr(cli, "_run", interrupt)
    assert run(capsys, "x")[0:2] == (130, "")


def test_broken_pipe(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    def broken(*args: object) -> int:
        raise BrokenPipeError

    duplicated: list[tuple[int, int]] = []
    monkeypatch.setattr(cli, "_run", broken)
    monkeypatch.setattr(cli.os, "dup2", lambda fd, fd2: duplicated.append((fd, fd2)))
    monkeypatch.setattr(cli.sys, "stdout", type("Out", (), {"fileno": lambda self: 1})())
    assert cli.main(["x"]) == 141
    assert duplicated and duplicated[0][1] == 1
