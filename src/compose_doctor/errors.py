"""Exception types raised by Compose Doctor."""

from __future__ import annotations


class ComposeDoctorError(Exception):
    """Base class for all errors Compose Doctor reports to the user."""


class InputError(ComposeDoctorError):
    """A problem with an input file or configuration.

    ``file`` and ``line`` locate the problem when known. ``str()`` renders the
    ``<file>:<line>: <message>`` form used on stderr.
    """

    def __init__(self, message: str, *, file: str | None = None, line: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.file = file
        self.line = line

    def __str__(self) -> str:
        if self.file is None:
            return self.message
        if self.line is None:
            return f"{self.file}: {self.message}"
        return f"{self.file}:{self.line}: {self.message}"
