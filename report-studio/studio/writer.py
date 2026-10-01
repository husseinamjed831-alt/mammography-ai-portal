"""Generate report content with Claude as schema-valid JSON."""

from __future__ import annotations

import json
import os
from pathlib import Path

import anthropic

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "writer_system.md"
DEFAULT_MODELS = {"claude": "claude-opus-5-5", "gemini": "gemini-flash-latest"}


def provider() -> str:
    """AI_PROVIDER=claude (default) or gemini, read at call time."""
    return os.environ.get("AI_PROVIDER", "claude").strip().lower()

# Words of body text per content page, measured on the rendered samples
# (mixed prose, tables and callouts;
# A4, 2.4 cm margins, Amiri 14 pt / 1.35 for Arabic, 12 pt / 1.4 English).
WORDS_PER_PAGE = {"ar": 210, "en": 250}
# Cover + contents + references occupy about this many pages.
FIXED_PAGES = 3

_text = {"type": "string"}
_list = {"type": "array", "items": _text}
BLOCK = {
    "anyOf": [
        {"type": "object", "additionalProperties": False, "required": ["type", "text"],
         "properties": {"type": {"const": "paragraph"}, "text": _text}},
        {"type": "object", "additionalProperties": False, "required": ["type", "items"],
         "properties": {"type": {"enum": ["bullets", "numbered"]}, "items": _list}},
        {"type": "object", "additionalProperties": False,
         "required": ["type", "caption", "headers", "rows"],
         "properties": {"type": {"const": "table"}, "caption": _text, "headers": _list,
                        "rows": {"type": "array", "items": _list}}},
        {"type": "object", "additionalProperties": False, "required": ["type", "title", "text"],
         "properties": {"type": {"const": "callout"}, "title": _text, "text": _text}},
        {"type": "object", "additionalProperties": False, "required": ["type", "text", "source"],
         "properties": {"type": {"const": "quote"}, "text": _text, "source": _text}},
    ]
}
SUBSECTION = {
    "type": "object", "additionalProperties": False, "required": ["heading", "blocks"],
    "properties": {"heading": _text, "blocks": {"type": "array", "items": BLOCK}},
}
CONTENT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["abstract", "keywords", "sections", "references"],
    "properties": {
        "abstract": _text,
        "keywords": _list,
        "sections": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["heading", "blocks", "subsections"],
                "properties": {
                    "heading": _text,
                    "blocks": {"type": "array", "items": BLOCK},
                    "subsections": {"type": "array", "items": SUBSECTION},
                },
            },
        },
        "references": _list,
    },
}


def word_budget(lang: str, pages: int) -> int:
    content_pages = max(1, int(pages) - FIXED_PAGES)
    return content_pages * WORDS_PER_PAGE["en" if lang == "en" else "ar"]


def order_message(order: dict) -> str:
    lang = "en" if order.get("lang") == "en" else "ar"
    pages = int(order.get("pages") or 10)
    lines = [
        f"Title: {order.get('title', '')}",
        f"Subject / course: {order.get('subject', '')}",
        f"College / department: {order.get('college', '')} {order.get('department', '')}".strip(),
        f"Stage: {order.get('stage', '')}",
        f"Report language: {'English' if lang == 'en' else 'Arabic'}",
        f"Academic level: {order.get('level', 'undergraduate')}",
        f"Citation style: {order.get('citation', 'APA 7')}",
        f"Requested length: {pages} pages in total "
        f"→ word budget for the body: about {word_budget(lang, pages)} words",
    ]
    if order.get("notes"):
        lines.append(f"Notes from the student/professor: {order['notes']}")
    return "Write the report for this order.\n\n" + "\n".join(lines)


def _claude(system: str, message: str, schema: dict) -> dict:
    client = anthropic.Anthropic()
    with client.beta.messages.stream(
        model=os.environ.get("STUDIO_MODEL", DEFAULT_MODELS["claude"]),
        max_tokens=64000,
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": message}],
        thinking={"type": "adaptive"},
        output_config={"effort": os.environ.get("STUDIO_EFFORT", "high"),
                       "format": {"type": "json_schema", "schema": schema}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    ) as stream:
        msg = stream.get_final_message()
    if msg.stop_reason == "refusal":
        raise RuntimeError("The model declined this order; review the title/notes.")
    if msg.stop_reason == "max_tokens":
        raise RuntimeError("Output was cut off; lower the length or raise max_tokens.")
    return json.loads(next(b.text for b in msg.content if b.type == "text"))


def _gemini_schema(node):
    """Gemini's JSON-schema subset has no `const`; express it as a one-value enum."""
    if isinstance(node, dict):
        out = {k: _gemini_schema(v) for k, v in node.items() if k != "const"}
        if "const" in node:
            out["type"] = "string"
            out["enum"] = [node["const"]]
        return out
    if isinstance(node, list):
        return [_gemini_schema(v) for v in node]
    return node


def _gemini(system: str, message: str, schema: dict) -> dict:
    from google import genai
    from google.genai import types

    client = genai.Client(http_options=types.HttpOptions(timeout=600_000))
    resp = client.models.generate_content(
        model=os.environ.get("STUDIO_MODEL", DEFAULT_MODELS["gemini"]),
        contents=message,
        config=types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_json_schema=_gemini_schema(schema),
            max_output_tokens=65536,
        ),
    )
    reason = str(resp.candidates[0].finish_reason) if resp.candidates else "NO_CANDIDATES"
    if "MAX_TOKENS" in reason:
        raise RuntimeError("Output was cut off; lower the length.")
    if not resp.text:
        raise RuntimeError(f"Gemini returned no text ({reason}).")
    return json.loads(resp.text)


def _generate(prompt_path: Path, message: str, schema: dict) -> dict:
    system = prompt_path.read_text(encoding="utf-8")
    if provider() == "gemini":
        return _gemini(system, message, schema)
    return _claude(system, message, schema)


def generate_content(order: dict) -> dict:
    return _generate(PROMPT_PATH, order_message(order), CONTENT_SCHEMA)


def report_from_order(order: dict, content: dict) -> dict:
    """Merge the form fields (cover, design) with generated content."""
    lang = "en" if order.get("lang") == "en" else "ar"
    return {
        "lang": lang,
        "theme": order.get("theme") or "classic",
        "options": {
            "ministry_header": str(order.get("ministry_header", "true")).lower() not in ("false", "0", "no", "لا"),
        },
        "cover": {
            k: order.get(k)
            for k in ("title", "subtitle", "university", "college", "department", "subject",
                      "stage", "student", "supervisor", "academic_year", "logo_path")
            if order.get(k)
        },
        **content,
    }


# ---------------------------------------------------------------- presentations

DECK_PROMPT_PATH = PROMPT_PATH.parent / "deck_system.md"


def _obj(props: dict) -> dict:
    return {"type": "object", "additionalProperties": False,
            "required": list(props), "properties": props}


_side = _obj({"heading": _text, "bullets": _list})
SLIDE = {"anyOf": [
    _obj({"layout": {"const": "section"}, "title": _text, "subtitle": _text, "notes": _text}),
    _obj({"layout": {"const": "bullets"}, "title": _text, "bullets": _list,
          "highlight": _obj({"value": _text, "label": _text}), "notes": _text}),
    _obj({"layout": {"const": "two_column"}, "title": _text, "left": _side, "right": _side,
          "notes": _text}),
    _obj({"layout": {"const": "stats"}, "title": _text,
          "stats": {"type": "array", "items": _obj({"value": _text, "label": _text})},
          "note": _text, "notes": _text}),
    _obj({"layout": {"const": "table"}, "title": _text,
          "table": _obj({"caption": _text, "headers": _list,
                         "rows": {"type": "array", "items": _list}}), "notes": _text}),
    _obj({"layout": {"const": "timeline"}, "title": _text,
          "steps": {"type": "array", "items": _obj({"title": _text, "text": _text})},
          "notes": _text}),
    _obj({"layout": {"const": "quote"}, "quote": _obj({"text": _text, "source": _text}),
          "notes": _text}),
]}
DECK_SCHEMA = _obj({"slides": {"type": "array", "items": SLIDE}})

# Title, agenda and closing slides are added by the design engine.
AUTO_SLIDES = 3


def deck_message(order: dict) -> str:
    lang = "en" if order.get("lang") == "en" else "ar"
    total = int(order.get("slides") or 12)
    lines = [
        f"Title: {order.get('title', '')}",
        f"Subject / course: {order.get('subject', '')}",
        f"College / department: {order.get('college', '')} {order.get('department', '')}".strip(),
        f"Stage: {order.get('stage', '')}",
        f"Presentation language: {'English' if lang == 'en' else 'Arabic'}",
        f"Academic level: {order.get('level', 'undergraduate')}",
        f"Content slides to write: exactly {max(3, total - AUTO_SLIDES)} "
        f"(the deck will have {total} slides in total)",
    ]
    if order.get("notes"):
        lines.append(f"Notes from the student/professor: {order['notes']}")
    return "Write the presentation for this order.\n\n" + "\n".join(lines)


def generate_deck_content(order: dict) -> dict:
    return _generate(DECK_PROMPT_PATH, deck_message(order), DECK_SCHEMA)


def deck_from_order(order: dict, content: dict) -> dict:
    base = report_from_order(order, {})
    base["tier"] = order.get("tier") or "standard"
    base["slides"] = content.get("slides") or []
    return base
