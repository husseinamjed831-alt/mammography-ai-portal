"""End-to-end render: report dict -> DOCX + PDF (+ previews).

The table of contents needs real page numbers, which only exist after
layout. So the report is built twice: once with placeholders, converted to
PDF to read where each heading landed, then rebuilt with those numbers.
The TOC always fits on one page, so the second pass does not move anything.
"""

from __future__ import annotations

import re
import tempfile
from pathlib import Path

from .docx_builder import build_docx
from .xlsx_export import build_xlsx
from .pdf import docx_to_pdf, has_soffice, heading_pages, page_count, previews


def safe_name(text: str, fallback: str = "report") -> str:
    name = re.sub(r"[^\w؀-ۿ\- ]+", "", text or "").strip().replace(" ", "_")
    return name[:60] or fallback


def render(report: dict, out_dir: str | Path, *, basename: str | None = None,
           make_pdf: bool = True, make_xlsx: bool = True, preview_pages: int = 0) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    name = basename or safe_name((report.get("cover") or {}).get("title", ""))
    docx_path = out_dir / f"{name}.docx"

    result: dict = {"docx": str(docx_path)}
    if make_xlsx:
        result["xlsx"] = str(build_xlsx(report, out_dir / f"{name}.xlsx"))
    # Without LibreOffice there is no PDF (and no TOC page numbers); Word still works.
    if not make_pdf or not has_soffice():
        build_docx(report, docx_path)
        return result

    with tempfile.TemporaryDirectory(prefix="studio-") as tmp:
        tmp = Path(tmp)
        draft = tmp / f"{name}.docx"
        build_docx(report, draft)
        pages = heading_pages(docx_to_pdf(draft, tmp / "pass1"))

    build_docx(report, docx_path, toc_pages=pages or None)
    pdf_path = docx_to_pdf(docx_path, out_dir)
    result.update(pdf=str(pdf_path), pages=page_count(pdf_path))
    if preview_pages:
        result["previews"] = [str(p) for p in previews(pdf_path, out_dir / "previews", preview_pages)]
    return result




def render_deck(deck: dict, out_dir: str | Path, *, basename: str | None = None,
                make_pdf: bool = True) -> dict:
    from .pptx_builder import build_pptx

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    name = basename or safe_name((deck.get("cover") or {}).get("title", ""), "presentation")
    pptx_path = build_pptx(deck, out_dir / f"{name}.pptx")
    result: dict = {"pptx": str(pptx_path), "slides": len(deck.get("slides") or []) + 3}
    if make_pdf and has_soffice():
        pdf_path = docx_to_pdf(pptx_path, out_dir)
        result.update(pdf=str(pdf_path), slides=page_count(pdf_path))
    return result
