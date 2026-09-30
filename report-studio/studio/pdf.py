"""PDF conversion (LibreOffice), page-number lookup and PNG previews."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import pymupdf as fitz


def soffice_bin() -> str:
    for name in ("soffice", "libreoffice"):
        path = shutil.which(name)
        if path:
            return path
    raise RuntimeError("LibreOffice (soffice) is not installed")


def docx_to_pdf(docx: Path, out_dir: Path, timeout: int = 180) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    # A private profile lets several conversions run side by side.
    with tempfile.TemporaryDirectory(prefix="lo-profile-") as profile:
        subprocess.run(
            [
                soffice_bin(), f"-env:UserInstallation=file://{profile}",
                "--headless", "--norestore", "--convert-to", "pdf",
                "--outdir", str(out_dir), str(docx),
            ],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=timeout,
        )
    pdf = out_dir / (docx.stem + ".pdf")
    if not pdf.exists():
        raise RuntimeError(f"LibreOffice did not produce {pdf.name}")
    return pdf


def heading_pages(pdf: Path) -> list[int]:
    """1-based page of every bookmarked heading, in document order."""
    with fitz.open(pdf) as doc:
        return [page for _lvl, _title, page in doc.get_toc(simple=True)]


def page_count(pdf: Path) -> int:
    with fitz.open(pdf) as doc:
        return doc.page_count


def previews(pdf: Path, out_dir: Path, pages: int = 4, zoom: float = 1.4) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    made = []
    with fitz.open(pdf) as doc:
        for i in range(min(pages, doc.page_count)):
            pix = doc[i].get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            path = out_dir / f"{pdf.stem}-p{i + 1}.png"
            pix.save(path)
            made.append(path)
    return made


def contact_sheet(pdf: Path, out_path: Path, pages: list[int] | None = None,
                  zoom: float = 0.9, gap: int = 28, bg=(236, 239, 243)) -> Path:
    """A single wide PNG showing several pages side by side (for marketing)."""
    with fitz.open(pdf) as doc:
        idx = [p for p in (pages or range(min(4, doc.page_count))) if p < doc.page_count]
        pixes = [doc[i].get_pixmap(matrix=fitz.Matrix(zoom, zoom)) for i in idx]
    w = sum(p.width for p in pixes) + gap * (len(pixes) + 1)
    h = max(p.height for p in pixes) + gap * 2
    sheet = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, w, h), False)
    sheet.set_rect(sheet.irect, bg)
    x = gap
    for p in pixes:
        # Soft shadow, then the page.
        shadow = fitz.IRect(x + 6, gap + 6, x + p.width + 6, gap + p.height + 6)
        sheet.set_rect(shadow, (205, 210, 218))
        p.set_origin(x, gap)
        sheet.copy(p, p.irect)
        x += p.width + gap
    sheet.save(out_path)
    return out_path
