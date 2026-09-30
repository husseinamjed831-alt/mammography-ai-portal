"""Render every samples/*.json and samples/decks/*.json into samples/output/.

    python scripts/build_samples.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from studio.pdf import contact_sheet  # noqa: E402
from studio.render import render, render_deck  # noqa: E402

OUT = ROOT / "samples" / "output"


def main():
    for src in sorted((ROOT / "samples").glob("*.json")):
        report = json.loads(src.read_text(encoding="utf-8"))
        result = render(report, OUT / src.stem, basename=src.stem)
        pdf = Path(result["pdf"])
        contact_sheet(pdf, OUT / f"{src.stem}-showcase.png", pages=[0, 1, 2, 3], zoom=0.75)
        print(f"{src.stem}: {result['pages']} pages")
    for src in sorted((ROOT / "samples" / "decks").glob("*.json")):
        deck = json.loads(src.read_text(encoding="utf-8"))
        result = render_deck(deck, OUT / src.stem, basename=src.stem)
        contact_sheet(Path(result["pdf"]), OUT / f"{src.stem}-showcase.png",
                      pages=[0, 3, 5, 7], zoom=0.5)
        print(f"{src.stem}: {result['slides']} slides ({deck.get('tier')})")


if __name__ == "__main__":
    main()
