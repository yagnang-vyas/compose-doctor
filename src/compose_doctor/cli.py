"""Command-line interface."""

from __future__ import annotations

import argparse
from collections.abc import Sequence

from compose_doctor import __version__

PROG = "compose-doctor"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=PROG,
        description="Lint Docker Compose files for security and reliability problems.",
    )
    parser.add_argument("--version", action="version", version=f"{PROG} {__version__}")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    parser.parse_args(argv)
    return 0
