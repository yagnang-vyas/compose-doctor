import subprocess
import sys

import pytest

from compose_doctor import __version__
from compose_doctor.cli import main


def test_version_constant() -> None:
    assert __version__ == "0.1.0"


def test_version_flag(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        main(["--version"])
    assert exc.value.code == 0
    assert capsys.readouterr().out.strip() == "compose-doctor 0.1.0"


def test_python_dash_m_version() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "compose_doctor", "--version"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert result.stdout.strip() == "compose-doctor 0.1.0"


def test_main_module_entry_point(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    import runpy

    monkeypatch.setattr(sys, "argv", ["compose-doctor", "--version"])
    with pytest.raises(SystemExit) as exc:
        runpy.run_module("compose_doctor", run_name="__main__")
    assert exc.value.code == 0
    assert "0.1.0" in capsys.readouterr().out


def test_list_rules_returns_zero(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--list-rules"]) == 0
    assert "CD001" in capsys.readouterr().out
