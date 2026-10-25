"""Output formats."""

from __future__ import annotations

from compose_doctor.engine import Report
from compose_doctor.report import json_report, sarif, text

FORMATS = ("text", "json", "sarif")


def render(report: Report, output_format: str, *, show_suppressed: bool = False) -> str:
    """Render ``report`` in ``output_format``. The result ends with a newline."""
    if output_format == "json":
        return json_report.render(report, show_suppressed=show_suppressed)
    if output_format == "sarif":
        return sarif.render(report)
    return text.render(report, show_suppressed=show_suppressed)


__all__ = ["FORMATS", "render"]
