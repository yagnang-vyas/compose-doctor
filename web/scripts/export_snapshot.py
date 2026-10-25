"""Write src/generated/analyzer-snapshot.json from the real analyzer.

The landing and docs pages show the rule catalogue and a sample result without booting the
in-browser runtime, so they read this snapshot instead. It is produced by running Compose Doctor,
never typed by hand, and src/analyzer/runtime.node.test.ts fails when it is stale. Run it from the
repository root after changing rules or output::

    python web/scripts/export_snapshot.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WEB / "src" / "analyzer"))

import bridge  # noqa: E402 -- importable only after the sys.path change above

PREVIEW_SOURCE = """\
services:
  db:
    image: postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: fake-pass-123
"""


def snapshot() -> dict[str, object]:
    catalog = json.loads(bridge.rules())
    preview = json.loads(bridge.analyze(PREVIEW_SOURCE, "compose.yaml", "error"))
    return {
        "version": catalog["version"],
        "rules": catalog["rules"],
        "preview": {"source": PREVIEW_SOURCE, "text": preview["text"], "report": preview["report"]},
    }


def main() -> int:
    target = WEB / "src" / "generated" / "analyzer-snapshot.json"
    target.write_text(json.dumps(snapshot(), indent=2) + "\n", encoding="utf-8")
    print(f"wrote {target.relative_to(WEB.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
