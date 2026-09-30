"""Order -> finished files. Shared by the HTTP server and the Telegram bot."""

from __future__ import annotations

import json
from pathlib import Path

from .render import render, safe_name
from .writer import generate_content, report_from_order


def produce(order: dict, out_dir: str | Path) -> dict:
    """Write the report with Claude, render it, return file paths and page count."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    content = generate_content(order)
    report = report_from_order(order, content)
    (out_dir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return render(report, out_dir, basename=safe_name(order.get("title", "")))
