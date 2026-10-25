"""Detect Compose variable interpolation (detection only, values are never resolved).

Compose substitutes ``${VAR}``, ``${VAR:-default}``, ``${VAR-default}``, ``${VAR:?err}``,
``${VAR?err}``, ``${VAR:+alt}``, ``${VAR+alt}`` and ``$VAR``. ``$$`` is an escaped literal
``$``. Rules treat an interpolated value as unknown.
"""

from __future__ import annotations

import re

_NAME = r"[A-Za-z_][A-Za-z0-9_]*"

# "$$" is matched first so an escaped dollar is consumed before it can start a reference.
_TOKEN = re.compile(rf"\$\$|\$\{{{_NAME}(?:(?::?[-?+])[^}}]*)?\}}|\${_NAME}")


def contains_interpolation(text: str) -> bool:
    """Return True if ``text`` contains at least one variable reference."""
    return any(match.group() != "$$" for match in _TOKEN.finditer(text))
