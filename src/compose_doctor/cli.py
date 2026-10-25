"""Command-line interface: argument parsing, file discovery and exit codes."""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import NoReturn, TextIO

from compose_doctor import __version__
from compose_doctor.config import DEFAULT_CONFIG_NAME, FAIL_ON_CHOICES, Config, load_config
from compose_doctor.engine import lint
from compose_doctor.errors import ComposeDoctorError, InputError
from compose_doctor.loader import load_bytes
from compose_doctor.model import ComposeFile
from compose_doctor.report import FORMATS, render
from compose_doctor.rules import RULES, RULES_BY_ID

PROG = "compose-doctor"

EXIT_OK = 0
EXIT_FINDINGS = 1
EXIT_USAGE = 2
EXIT_INTERRUPTED = 130
EXIT_BROKEN_PIPE = 141

# The Compose specification's lookup order for a project's default file.
DEFAULT_FILES = ("compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml")

STDIN_NAME = "<stdin>"


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        self.print_usage(sys.stderr)
        self.exit(EXIT_USAGE, f"{self.prog}: error: {message}\n")


def build_parser() -> argparse.ArgumentParser:
    parser = _Parser(
        prog=PROG,
        description="Lint Docker Compose files for security, misconfiguration and reliability "
        "problems.",
        epilog="Exit codes: 0 no findings at or above --fail-on, 1 findings, 2 usage or input "
        "error, 130 interrupted.",
    )
    parser.add_argument(
        "files",
        nargs="*",
        metavar="FILE",
        help="Compose files to lint; '-' reads standard input. Default: the first of "
        + ", ".join(DEFAULT_FILES)
        + " in the current directory.",
    )
    parser.add_argument("--version", action="version", version=f"{PROG} {__version__}")
    parser.add_argument(
        "--format", choices=FORMATS, default="text", help="output format (default: text)"
    )
    parser.add_argument(
        "--fail-on",
        choices=FAIL_ON_CHOICES,
        default=None,
        help="exit 1 if an unsuppressed finding has this severity or worse (default: error)",
    )
    parser.add_argument(
        "--config",
        metavar="PATH",
        type=Path,
        help=f"configuration file (default: {DEFAULT_CONFIG_NAME} in the current directory)",
    )
    parser.add_argument(
        "--ignore",
        metavar="IDS",
        action="append",
        default=[],
        help="comma-separated rule IDs to ignore, added to the config file's list",
    )
    parser.add_argument(
        "--show-suppressed", action="store_true", help="also list suppressed findings"
    )
    parser.add_argument("--list-rules", action="store_true", help="describe every rule and exit")
    return parser


def _parse_ignore(parser: argparse.ArgumentParser, values: Sequence[str]) -> frozenset[str]:
    ids = {part.strip().upper() for value in values for part in value.split(",") if part.strip()}
    unknown = sorted(ids - set(RULES_BY_ID))
    if unknown:
        parser.error(
            f"unknown rule ID(s) for --ignore: {', '.join(unknown)} "
            f"(valid: {', '.join(RULES_BY_ID)})"
        )
    return frozenset(ids)


def _discover(parser: argparse.ArgumentParser) -> list[str]:
    for name in DEFAULT_FILES:
        if Path(name).is_file():
            return [name]
    parser.error(f"no Compose file given and none of {', '.join(DEFAULT_FILES)} found")


def _read(path: str, stdin: TextIO) -> ComposeFile:
    if path == "-":
        return load_bytes(stdin.buffer.read(), STDIN_NAME)
    try:
        data = Path(path).read_bytes()
    except FileNotFoundError:
        raise InputError("no such file", file=path) from None
    except IsADirectoryError:
        raise InputError("is a directory", file=path) from None
    except OSError as exc:
        raise InputError(f"cannot read file: {exc.strerror}", file=path) from None
    return load_bytes(data, path)


def _config(args: argparse.Namespace) -> Config:
    if args.config is not None:
        return load_config(args.config, RULES_BY_ID)
    default = Path(DEFAULT_CONFIG_NAME)
    if default.is_file():
        return load_config(default, RULES_BY_ID)
    return Config()


def list_rules() -> str:
    blocks = []
    for rule in RULES:
        blocks.append(
            f"{rule.id}  {rule.severity.value:<7}  {rule.title}\n"
            f"    {rule.rationale}\n"
            f"    fix: {rule.fix}"
        )
    return "\n\n".join(blocks) + "\n"


def _run(argv: Sequence[str] | None, stdout: TextIO, stdin: TextIO) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.list_rules:
        stdout.write(list_rules())
        return EXIT_OK

    cli_ignores = _parse_ignore(parser, args.ignore)
    paths = args.files or _discover(parser)
    if paths.count("-") > 1:
        parser.error("standard input ('-') can only be given once")

    config = _config(args)
    config = Config(
        ignore=config.ignore | cli_ignores,
        service_ignores=config.service_ignores,
        severity=config.severity,
        fail_on=args.fail_on or config.fail_on,
    )
    files = [_read(path, stdin) for path in paths]
    report = lint(files, config)
    stdout.write(render(report, args.format, show_suppressed=args.show_suppressed))
    stdout.flush()
    return EXIT_FINDINGS if report.fails(config.fail_on or "error") else EXIT_OK


def main(argv: Sequence[str] | None = None) -> int:
    try:
        return _run(argv, sys.stdout, sys.stdin)
    except ComposeDoctorError as exc:
        sys.stderr.write(f"{PROG}: error: {exc}\n")
        return EXIT_USAGE
    except KeyboardInterrupt:
        sys.stderr.write(f"{PROG}: interrupted\n")
        return EXIT_INTERRUPTED
    except BrokenPipeError:
        # The reader went away (e.g. `| head`). Point stdout at devnull so the interpreter's
        # final flush does not raise again, and exit quietly.
        devnull = os.open(os.devnull, os.O_WRONLY)
        os.dup2(devnull, sys.stdout.fileno())
        return EXIT_BROKEN_PIPE
