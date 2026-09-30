"""HTTP API that n8n (or any front end) calls.

POST /orders   form fields -> Claude writes the content -> DOCX/PDF/XLSX
POST /render   ready-made report JSON -> DOCX/PDF/XLSX (no AI call)
GET  /price    price for a set of options
GET  /files/{job}/{name}  download a generated file

Set STUDIO_API_KEY to require an `X-API-Key` header, PUBLIC_BASE_URL to the
address n8n/customers reach this server on, and ANTHROPIC_API_KEY for /orders.
"""

from __future__ import annotations

import os
import uuid
from urllib.parse import quote as urlquote
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.concurrency import run_in_threadpool

from studio.pipeline import produce
from studio.pricing import quote
from studio.render import render, safe_name

OUT_ROOT = Path(os.environ.get("STUDIO_OUT", "output")).resolve()
BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
API_KEY = os.environ.get("STUDIO_API_KEY")

app = FastAPI(title="Report Studio")


def auth(x_api_key: str | None = Header(default=None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(401, "bad api key")


def _publish(job: str, result: dict) -> dict:
    files = {}
    for kind in ("docx", "pptx", "pdf", "xlsx"):
        if result.get(kind):
            files[kind] = f"{BASE_URL}/files/{job}/{urlquote(Path(result[kind]).name)}"
    return {"job": job, "pages": result.get("pages") or result.get("slides"), "files": files}


def _job_dir() -> tuple[str, Path]:
    job = uuid.uuid4().hex[:12]
    d = OUT_ROOT / job
    d.mkdir(parents=True, exist_ok=True)
    return job, d


@app.post("/orders", dependencies=[Depends(auth)])
async def create_order(order: dict):
    if not order.get("title"):
        raise HTTPException(422, "title is required")
    job, d = _job_dir()
    result = await run_in_threadpool(produce, order, d)
    return {**_publish(job, result), "price": quote(order)}


@app.post("/render", dependencies=[Depends(auth)])
async def render_report(report: dict):
    job, d = _job_dir()
    title = (report.get("cover") or {}).get("title", "")
    result = await run_in_threadpool(render, report, d, basename=safe_name(title))
    return _publish(job, result)


@app.get("/price")
def price(kind: str = "report", pages: int = 10, animated: bool = False, three_d: bool = False):
    return quote({"kind": kind, "pages": pages, "animated": animated, "three_d": three_d})


@app.get("/files/{job}/{name}")
def download(job: str, name: str):
    path = (OUT_ROOT / job / name).resolve()
    if OUT_ROOT not in path.parents or not path.is_file():
        raise HTTPException(404)
    return FileResponse(path, filename=name)
