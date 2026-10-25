"""The README must describe the CLI as it really is."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

from compose_doctor.cli import build_parser
from compose_doctor.rules import RULES

ROOT = Path(__file__).resolve().parents[2]
README = (ROOT / "README.md").read_text(encoding="utf-8")


def test_generated_sections_are_current() -> None:
    result = subprocess.run(
        [sys.executable, "scripts/update_readme.py", "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_rule_table_matches_rules() -> None:
    rows = re.findall(r"^\| (CD\d{3}) \| (\w+) \| ([^|]+) \|", README, re.MULTILINE)
    assert rows == [(rule.id, rule.severity.value, rule.title) for rule in RULES]


def test_every_documented_flag_exists() -> None:
    documented = set(re.findall(r"(?<![\w-])(--[a-z][a-z-]+)", README))
    known = {option for action in build_parser()._actions for option in action.option_strings}
    others = {"--check", "--strict"}  # update_readme.py and mypy
    assert documented - others <= known
