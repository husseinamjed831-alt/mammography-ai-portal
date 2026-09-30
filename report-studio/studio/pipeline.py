"""Order -> finished files. Shared by the HTTP server and the Telegram bot."""

from __future__ import annotations

import json
from pathlib import Path

from .render import render, render_deck, safe_name
from .writer import (deck_from_order, generate_content, generate_deck_content,
                     report_from_order)


def produce(order: dict, out_dir: str | Path) -> dict:
    """Write the report or deck with Claude, render it, return the file paths."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    name = safe_name(order.get("title", ""))
    if order.get("kind") == "presentation":
        deck = deck_from_order(order, generate_deck_content(order))
        (out_dir / "deck.json").write_text(
            json.dumps(deck, ensure_ascii=False, indent=1), encoding="utf-8")
        return render_deck(deck, out_dir, basename=name)
    report = report_from_order(order, generate_content(order))
    (out_dir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return render(report, out_dir, basename=name)
