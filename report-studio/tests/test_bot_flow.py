"""Drive the whole bot conversation offline against a fake Telegram API.

    python tests/test_bot_flow.py

No token, network or Claude key needed: Telegram calls are answered by
FakeRequest and report writing is replaced with a sample's content.
"""

import asyncio
import json
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["STUDIO_DATA"] = tempfile.mkdtemp(prefix="bot-test-")
os.environ["ADMIN_CHAT_ID"] = "999"

from telegram import Update  # noqa: E402
from telegram.request import BaseRequest  # noqa: E402

import bot  # noqa: E402
import studio.pipeline as pipeline  # noqa: E402

STUDENT, ADMIN = 111, 999
BOT_USER = {"id": 1, "is_bot": True, "first_name": "Studio", "username": "studio_bot"}


class FakeRequest(BaseRequest):
    def __init__(self):
        self.calls = []
        self._mid = 1000

    @property
    def read_timeout(self):
        return 5

    async def initialize(self):
        pass

    async def shutdown(self):
        pass

    async def do_request(self, url, method, request_data=None, **kw):
        endpoint = url.rsplit("/", 1)[-1]
        params = request_data.json_parameters if request_data else {}
        self.calls.append((endpoint, params))
        if endpoint == "getMe":
            result = BOT_USER
        elif endpoint.startswith("send"):
            self._mid += 1
            chat = int(params.get("chat_id", 0))
            result = {"message_id": self._mid, "date": int(time.time()),
                      "chat": {"id": chat, "type": "private"}, "from": BOT_USER, "text": "x"}
            if endpoint == "sendMediaGroup":
                result = [result]
        else:
            result = True
        return 200, json.dumps({"ok": True, "result": result}).encode()


sample = json.loads((ROOT / "samples" / "02-solar-iraq-ar.json").read_text(encoding="utf-8"))
CONTENT = {k: sample[k] for k in ("abstract", "keywords", "sections", "references")}
pipeline.generate_content = lambda order: CONTENT
DECK = json.loads((ROOT / "samples" / "decks" / "01-ai-mammography-deck-ar.json").read_text(encoding="utf-8"))
pipeline.generate_deck_content = lambda order: {"slides": DECK["slides"]}

_uid = 0


def _next():
    global _uid
    _uid += 1
    return _uid


def user(uid):
    return {"id": uid, "is_bot": False, "first_name": "Ali", "username": f"u{uid}"}


def text_update(uid, text):
    msg = {"message_id": _next(), "date": int(time.time()), "chat": {"id": uid, "type": "private"},
           "from": user(uid), "text": text}
    if text.startswith("/"):
        msg["entities"] = [{"type": "bot_command", "offset": 0, "length": len(text.split()[0])}]
    return {"update_id": _next(), "message": msg}


def photo_update(uid):
    return {"update_id": _next(), "message": {
        "message_id": _next(), "date": int(time.time()), "chat": {"id": uid, "type": "private"},
        "from": user(uid),
        "photo": [{"file_id": "receipt-photo", "file_unique_id": "r1", "width": 90, "height": 90}]}}


def callback_update(uid, data):
    return {"update_id": _next(), "callback_query": {
        "id": str(_next()), "from": user(uid), "chat_instance": "c", "data": data,
        "message": {"message_id": 5, "date": int(time.time()), "chat": {"id": uid, "type": "private"},
                    "from": BOT_USER, "text": "summary"}}}


async def main():
    req = FakeRequest()
    app = bot.build_app("123:TEST", lambda b: b.request(req).get_updates_request(FakeRequest()))
    await app.initialize()

    async def send(raw):
        await app.process_update(Update.de_json(raw, app.bot))

    def texts_to(chat):
        return [p.get("text", "") for e, p in req.calls
                if e == "sendMessage" and int(p.get("chat_id", 0)) == chat]

    await send(text_update(STUDENT, "/start"))
    await send(text_update(STUDENT, bot.BTN_PRICES))
    await send(text_update(STUDENT, bot.BTN_SAMPLES))
    await send(text_update(STUDENT, bot.BTN_ORDER))
    answers = [bot.KIND_REPORT, "الطاقة الشمسية في العراق", "عربي", "abc", "٨", "علي كريم", "جامعة البصرة",
               "كلية الهندسة", bot.BTN_SKIP, "الطاقة المتجددة", "المرحلة الثالثة", bot.BTN_SKIP,
               "2025 – 2026", "هندسي", bot.BTN_SKIP]
    for a in answers:
        await send(text_update(STUDENT, a))
    assert any("رقم من 5 إلى 40" in t for t in texts_to(STUDENT)), "page validation"
    assert any("السعر: 5,000 دينار" in t for t in texts_to(STUDENT)), "summary + price"

    await send(callback_update(STUDENT, "confirm"))
    assert any("زين كاش" in t for t in texts_to(STUDENT)), "payment instructions"
    await send(text_update(STUDENT, "دفعت"))
    assert any("صورة" in t for t in texts_to(STUDENT)), "asks for a photo"
    await send(photo_update(STUDENT))
    to_admin = [p for e, p in req.calls if e == "sendPhoto" and int(p["chat_id"]) == ADMIN]
    assert to_admin and "ok:1" in json.dumps(to_admin[-1]["reply_markup"]), "receipt reaches admin"
    assert bot.store.get(1)["status"] == "awaiting_review"

    await send(callback_update(STUDENT, "ok:1"))  # a student cannot approve
    assert bot.store.get(1)["status"] == "awaiting_review"

    await send(callback_update(ADMIN, "ok:1"))
    for _ in range(300):  # rendering runs in a background task
        if bot.store.get(1)["status"] in ("delivered", "failed"):
            break
        await asyncio.sleep(0.5)
    assert bot.store.get(1)["status"] == "delivered", bot.store.get(1)["status"]
    docs = [p for e, p in req.calls if e == "sendDocument" and int(p["chat_id"]) == STUDENT]
    assert len(docs) >= 3 + 3, "sample PDFs + docx/pdf/xlsx delivered"

    order = bot.to_order(bot.store.get(1)["data"])
    assert order["theme"] == "engineering" and order["pages"] == 8 and order["lang"] == "ar"

    # A 3-D presentation order, placed by a second student.
    S2 = 222
    await send(text_update(S2, bot.BTN_ORDER))
    for a in [bot.KIND_DECK, "الذكاء الاصطناعي في الماموغرام", "عربي", "4", "12",
              "ثلاثي الأبعاد 3D 🧊", "زينب حيدر", "جامعة بغداد", "كلية الطب", bot.BTN_SKIP,
              "الأشعة", "المرحلة الخامسة", bot.BTN_SKIP, bot.BTN_SKIP, "طبي", bot.BTN_SKIP]:
        await send(text_update(S2, a))
    assert any("رقم من 6 إلى 30" in t for t in texts_to(S2)), "slide count validation"
    assert any("السعر: 20,000 دينار" in t for t in texts_to(S2)), texts_to(S2)[-1]
    assert not any("صفحة تريد" in t for t in texts_to(S2)), "no page question for decks"
    await send(callback_update(S2, "confirm"))
    await send(photo_update(S2))
    await send(callback_update(ADMIN, "ok:2"))
    for _ in range(300):
        if bot.store.get(2)["status"] in ("delivered", "failed"):
            break
        await asyncio.sleep(0.5)
    assert bot.store.get(2)["status"] == "delivered", bot.store.get(2)["status"]
    names = [p.get("document", {}) for e, p in req.calls if e == "sendDocument" and int(p["chat_id"]) == S2]
    deck_order = bot.to_order(bot.store.get(2)["data"])
    assert deck_order["kind"] == "presentation" and deck_order["tier"] == "three_d"
    assert deck_order["slides"] == 12 and "pages" not in deck_order
    assert len(names) == 2, "pptx + pdf delivered"

    await send(text_update(ADMIN, "/orders"))
    assert any("#1 • delivered" in t for t in texts_to(ADMIN)), texts_to(ADMIN)
    await app.shutdown()
    print("bot flow OK:", len(req.calls), "API calls")


asyncio.run(main())
