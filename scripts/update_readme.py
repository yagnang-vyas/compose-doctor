"""Regenerate the README sections that come from running the CLI.

The sample output and the rule table in README.md are produced by actually running
``compose-doctor``, never typed by hand. Run this after changing rules or output::

    python scripts/update_readme.py          # rewrite README.md
    python scripts/update_readme.py --check  # exit 1 if README.md is out of date (used by tests)
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
README = ROOT / "README.md"

RULE_HEADER = re.compile(r"^(CD\d{3})\s+(\w+)\s+(.+)$")


def run_cli(*args: str, stdin: str | None = None) -> str:
    result = subprocess.run(
        [sys.executable, "-m", "compose_doctor", *args],
        cwd=ROOT,
        input=stdin,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode not in (0, 1):
        raise SystemExit(f"compose-doctor {' '.join(args)} failed:\n{result.stderr}")
    return result.stdout


def rule_table() -> str:
    rows = ["| ID | Severity | Rule | Why it matters |", "|---|---|---|---|"]
    for block in run_cli("--list-rules").strip().split("\n\n"):
        header, rationale, _fix = block.split("\n")
        match = RULE_HEADER.match(header)
        if match is None:
            raise SystemExit(f"unexpected --list-rules line: {header!r}")
        rule_id, severity, title = match.groups()
        rows.append(f"| {rule_id} | {severity} | {title} | {rationale.strip()} |")
    return "\n".join(rows)


def code_block(command: str, output: str) -> str:
    return f"```console\n$ {command}\n{output.rstrip()}\n```"


JSON_EXAMPLE_INPUT = """\
services:
  db:
    image: postgres:16.4
    restart: unless-stopped
    mem_limit: 1g
    ports:
      - "5432:5432"
"""


def json_example() -> str:
    output = run_cli("-", "--format", "json", stdin=JSON_EXAMPLE_INPUT)
    return (
        f"```yaml\n{JSON_EXAMPLE_INPUT}```\n\n"
        f"```console\n$ compose-doctor --format json - < compose.yaml\n{output.rstrip()}\n```"
    )


SECTIONS = {
    "json-output": json_example,
    "insecure-output": lambda: code_block(
        "compose-doctor examples/insecure/compose.yaml",
        run_cli("examples/insecure/compose.yaml"),
    ),
    "hardened-output": lambda: code_block(
        "compose-doctor examples/hardened/compose.yaml",
        run_cli("examples/hardened/compose.yaml"),
    ),
    "rule-table": rule_table,
}


def render(text: str) -> str:
    for name, build in SECTIONS.items():
        pattern = re.compile(
            rf"(<!-- generated:{name} -->\n)(?:.*?\n)?(<!-- /generated:{name} -->)", re.DOTALL
        )
        match = pattern.search(text)
        if match is None:
            raise SystemExit(f"README.md has no generated:{name} section")
        text = text[: match.end(1)] + build() + "\n" + text[match.start(2) :]
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if README.md is out of date")
    args = parser.parse_args()
    current = README.read_text(encoding="utf-8")
    updated = render(current)
    if args.check:
        if updated != current:
            print("README.md is out of date; run: python scripts/update_readme.py")
            return 1
        return 0
    README.write_text(updated, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
