"""Telegram bot: students order a report, pay, and receive the files.

Flow: questions (cover info, length, design) -> summary + price -> payment
receipt photo -> the admin approves or rejects from Telegram -> the report
is written and rendered -> Word/PDF/Excel are sent back to the student.

Environment:
  TELEGRAM_BOT_TOKEN   token from @BotFather
  ADMIN_CHAT_ID        your numeric Telegram id (get it from @userinfobot)
  ANTHROPIC_API_KEY    Claude key used to write the reports
  PAYMENT_INFO         payment instructions shown to the student
  CONTACT_INFO         shown on the "contact us" button
  STUDIO_DATA          where orders.db and generated files live (default ./data)

Run:  python bot.py
"""

from __future__ import annotations

import asyncio
import html
import logging
import os
from pathlib import Path
from warnings import filterwarnings

from telegram import (InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto,
                      ReplyKeyboardMarkup, ReplyKeyboardRemove, Update)
from telegram.constants import ParseMode
from telegram.warnings import PTBUserWarning
from telegram.ext import (Application, CallbackQueryHandler, CommandHandler, ContextTypes,
                          ConversationHandler, MessageHandler, filters)

from studio.orders import OrderStore
from studio.pipeline import produce
from studio.pricing import PRICES, quote
from studio.themes import THEMES

# The confirm buttons belong to one summary message per chat, so tracking
# callbacks per chat (per_message=False) is what we want.
filterwarnings("ignore", message=r".*per_message=False.*", category=PTBUserWarning)

logging.basicConfig(format="%(asctime)s %(levelname)s %(name)s: %(message)s", level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("report-bot")

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("STUDIO_DATA", ROOT / "data"))
ADMIN_ID = int(os.environ.get("ADMIN_CHAT_ID", "0") or 0)
PAYMENT_INFO = os.environ.get(
    "PAYMENT_INFO",
    "حوّل المبلغ على زين كاش للرقم: 07XX XXX XXXX\nثم دز صورة وصل التحويل هنا 👇",
)
CONTACT_INFO = os.environ.get("CONTACT_INFO", "للتواصل: @YourUsername")
SAMPLES = ROOT / "samples" / "output"

store = OrderStore(DATA / "orders.db")

# ------------------------------------------------------------------ texts

BTN_ORDER = "📝 اطلب تقرير"
BTN_SAMPLES = "📂 نماذج من شغلنا"
BTN_PRICES = "💰 الأسعار"
BTN_CONTACT = "☎️ تواصل معنا"
BTN_SKIP = "⏭ تخطي"
BTN_CANCEL = "❌ إلغاء"

MAIN_KB = ReplyKeyboardMarkup(
    [[BTN_ORDER], [BTN_SAMPLES, BTN_PRICES], [BTN_CONTACT]], resize_keyboard=True)

THEME_LABELS = {f"{t.name_ar}": key for key, t in THEMES.items()}
STAGES = ["المرحلة الأولى", "المرحلة الثانية", "المرحلة الثالثة", "المرحلة الرابعة",
          "المرحلة الخامسة", "المرحلة السادسة", "ماجستير", "دكتوراه"]

# Each step: (key, question, choices or None, optional, columns)
STEPS = [
    ("title", "✍️ شنو <b>عنوان التقرير</b>؟", None, False, 1),
    ("lang", "🌐 لغة التقرير؟", ["عربي", "English"], False, 2),
    ("pages", "📄 كم <b>صفحة</b> تريد؟ (اختار أو اكتب رقم من 5 إلى 40)",
     ["5", "8", "10", "15", "20", "30", "40"], False, 4),
    ("student", "👤 <b>اسم الطالب</b> مثل ما تريده على الغلاف:\n(إذا أكثر من طالب اكتب الأسماء بينها فارزة)",
     None, False, 1),
    ("university", "🏛 اسم <b>الجامعة</b>؟", None, False, 1),
    ("college", "🏫 اسم <b>الكلية</b>؟", None, False, 1),
    ("department", "📚 اسم <b>القسم</b>؟", None, True, 1),
    ("subject", "📘 اسم <b>المادة</b>؟", None, False, 1),
    ("stage", "🎓 <b>المرحلة</b>؟", STAGES, False, 2),
    ("supervisor", "👨‍🏫 اسم <b>الأستاذ المشرف</b>؟ (مع اللقب العلمي مثل: م.د. أو أ.م.د.)",
     None, True, 1),
    ("academic_year", "📅 <b>العام الدراسي</b>؟", ["2025 – 2026"], True, 1),
    ("theme", "🎨 اختار <b>التصميم</b> (تگدر تشوف النماذج من القائمة الرئيسية):",
     list(THEME_LABELS), False, 2),
    ("notes", "📝 عندك <b>ملاحظات</b> من الأستاذ أو نقاط لازم يركز عليها التقرير؟\nاكتبها، أو اضغط تخطي.",
     None, True, 1),
]
LABELS = {
    "title": "العنوان", "lang": "اللغة", "pages": "الصفحات", "student": "الطالب",
    "university": "الجامعة", "college": "الكلية", "department": "القسم", "subject": "المادة",
    "stage": "المرحلة", "supervisor": "المشرف", "academic_year": "العام الدراسي",
    "theme": "التصميم", "notes": "ملاحظات",
}

ASK, CONFIRM, RECEIPT = range(3)


def fmt_iqd(n: int) -> str:
    return f"{n:,} دينار"


def step_keyboard(choices, optional, columns):
    rows = []
    if choices:
        rows = [choices[i:i + columns] for i in range(0, len(choices), columns)]
    tail = [BTN_SKIP, BTN_CANCEL] if optional else [BTN_CANCEL]
    rows.append(tail)
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, one_time_keyboard=False)


def to_order(answers: dict) -> dict:
    """Bot answers -> the order dict the pipeline expects."""
    stage = answers.get("stage", "")
    order = {k: v for k, v in answers.items() if v}
    order["lang"] = "en" if answers.get("lang") == "English" else "ar"
    order["theme"] = THEME_LABELS.get(answers.get("theme", ""), "classic")
    order["pages"] = int(answers.get("pages", 10))
    order["level"] = "postgraduate" if stage in ("ماجستير", "دكتوراه") else "undergraduate"
    order["kind"] = "report"
    return order


def summary(answers: dict, price: int, order_id: int | None = None) -> str:
    head = f"🧾 <b>طلب رقم #{order_id}</b>" if order_id else "🧾 <b>ملخص طلبك</b>"
    lines = [head, ""]
    for key, *_ in STEPS:
        v = answers.get(key)
        if v:
            lines.append(f"• <b>{LABELS[key]}:</b> {html.escape(str(v))}")
    lines += ["", f"💰 <b>السعر: {fmt_iqd(price)}</b>"]
    return "\n".join(lines)


def is_admin(update: Update) -> bool:
    return bool(ADMIN_ID) and update.effective_user and update.effective_user.id == ADMIN_ID


# ------------------------------------------------------------------ menu


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    name = html.escape(update.effective_user.first_name or "")
    await update.message.reply_text(
        f"هلا {name} 👋\n\n"
        "نسويلك <b>تقرير جامعي كامل</b> بتصميم احترافي:\n"
        "• غلاف بصيغة الجامعات العراقية\n"
        "• فهرس، ترقيم صفحات، جداول، ومراجع\n"
        "• يوصلك Word + PDF + Excel\n\n"
        "اختار من القائمة 👇",
        parse_mode=ParseMode.HTML, reply_markup=MAIN_KB)


async def prices(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lines = ["💰 <b>الأسعار</b>", "", "<b>التقارير</b>"]
    lower = 1
    for max_pages, iqd in PRICES["report"]:
        lines.append(f"• من {lower} إلى {max_pages} صفحة: {fmt_iqd(iqd)}")
        lower = max_pages + 1
    lines += ["", "<b>العروض التقديمية</b> (قريباً)",
              f"• عادي: {fmt_iqd(PRICES['presentation']['standard'])}",
              f"• متحرك: {fmt_iqd(PRICES['presentation']['animated'])}",
              f"• ثلاثي الأبعاد 3D: {fmt_iqd(PRICES['presentation']['three_d'])}"]
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML, reply_markup=MAIN_KB)


async def samples(update: Update, context: ContextTypes.DEFAULT_TYPE):
    shots = sorted(SAMPLES.glob("*-showcase.png"))
    if not shots:
        await update.message.reply_text("النماذج راح تنزل قريباً 🙏", reply_markup=MAIN_KB)
        return
    media = [InputMediaPhoto(p.read_bytes()) for p in shots[:10]]
    media[0] = InputMediaPhoto(shots[0].read_bytes(),
                               caption="📂 نماذج من تقاريرنا (أول 4 صفحات من كل تقرير)")
    await update.message.reply_media_group(media)
    for pdf in sorted(SAMPLES.glob("*/*.pdf")):
        with pdf.open("rb") as fh:
            await update.message.reply_document(fh, filename=pdf.name)
    await update.message.reply_text("عجبك الشغل؟ اضغط «اطلب تقرير» 👇", reply_markup=MAIN_KB)


async def contact(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(CONTACT_INFO, reply_markup=MAIN_KB)


# ------------------------------------------------------------------ order conversation


async def ask_current(update: Update, context: ContextTypes.DEFAULT_TYPE):
    i = context.user_data["step"]
    key, question, choices, optional, cols = STEPS[i]
    progress = f"<i>({i + 1}/{len(STEPS)})</i>\n"
    await update.effective_message.reply_text(
        progress + question, parse_mode=ParseMode.HTML,
        reply_markup=step_keyboard(choices, optional, cols))
    return ASK


async def order_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    context.user_data.update(step=0, answers={})
    await update.message.reply_text("تمام، نبدي 🚀 جاوب على الأسئلة وحدة وحدة.")
    return await ask_current(update, context)


async def on_answer(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = (update.message.text or "").strip()
    i = context.user_data.get("step", 0)
    key, _q, choices, optional, _c = STEPS[i]

    if text == BTN_SKIP:
        if not optional:
            await update.message.reply_text("هذا السؤال ضروري 🙏")
            return ASK
        text = ""
    elif key == "pages":
        digits = text.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
        if not digits.isdigit() or not 5 <= int(digits) <= 40:
            await update.message.reply_text("اكتب رقم من 5 إلى 40 لو سمحت.")
            return ASK
        text = digits
    elif key in ("lang", "theme") and text not in choices:
        await update.message.reply_text("اختار من الأزرار لو سمحت 👇")
        return ASK
    elif len(text) > 400:
        await update.message.reply_text("النص طويل شوية، اختصره لو سمحت.")
        return ASK

    context.user_data["answers"][key] = text
    context.user_data["step"] = i + 1
    if i + 1 < len(STEPS):
        return await ask_current(update, context)

    answers = context.user_data["answers"]
    price = quote(to_order(answers))["iqd"]
    context.user_data["price"] = price
    buttons = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ تأكيد الطلب", callback_data="confirm")],
        [InlineKeyboardButton("🔄 أعيد من البداية", callback_data="restart"),
         InlineKeyboardButton("❌ إلغاء", callback_data="cancel")],
    ])
    await update.message.reply_text("راجع طلبك 👇", reply_markup=ReplyKeyboardRemove())
    await update.message.reply_text(summary(answers, price), parse_mode=ParseMode.HTML,
                                    reply_markup=buttons)
    return CONFIRM


async def on_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    if q.data == "restart":
        await q.edit_message_reply_markup(None)
        context.user_data.update(step=0, answers={})
        return await ask_current(update, context)
    if q.data == "cancel":
        await q.edit_message_reply_markup(None)
        await q.message.reply_text("انلغى الطلب. نتشرف بيك بأي وقت 🌹", reply_markup=MAIN_KB)
        context.user_data.clear()
        return ConversationHandler.END

    answers, price = context.user_data["answers"], context.user_data["price"]
    user = update.effective_user
    await q.edit_message_reply_markup(None)

    if is_admin(update):  # the owner can order without paying, e.g. for new samples
        oid = store.create(user.id, q.message.chat_id, user.username, answers, price, "approved")
        await q.message.reply_text(f"👑 طلب إداري #{oid}، بدأ التحضير.", reply_markup=MAIN_KB)
        context.application.create_task(fulfil(context.application, oid))
        context.user_data.clear()
        return ConversationHandler.END

    oid = store.create(user.id, q.message.chat_id, user.username, answers, price, "awaiting_payment")
    context.user_data["order_id"] = oid
    await q.message.reply_text(
        f"✅ انحفظ طلبك برقم <b>#{oid}</b>\n\n"
        f"💰 المبلغ: <b>{fmt_iqd(price)}</b>\n\n{html.escape(PAYMENT_INFO)}",
        parse_mode=ParseMode.HTML,
        reply_markup=ReplyKeyboardMarkup([[BTN_CANCEL]], resize_keyboard=True))
    return RECEIPT


async def on_receipt(update: Update, context: ContextTypes.DEFAULT_TYPE):
    oid = context.user_data.get("order_id")
    order = store.get(oid) if oid else None
    if not order:
        await update.message.reply_text("ما لگيت الطلب، ابدي من جديد 🙏", reply_markup=MAIN_KB)
        return ConversationHandler.END

    store.set_status(oid, "awaiting_review")
    user = update.effective_user
    who = f"@{user.username}" if user.username else html.escape(user.full_name)
    caption = summary(order["data"], order["price"], oid) + f"\n\n👤 {who} (<code>{user.id}</code>)"
    buttons = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ الدفع وصل", callback_data=f"ok:{oid}"),
        InlineKeyboardButton("❌ رفض", callback_data=f"no:{oid}"),
    ]])
    if ADMIN_ID:
        if update.message.photo:
            await context.bot.send_photo(ADMIN_ID, update.message.photo[-1].file_id, caption=caption,
                                         parse_mode=ParseMode.HTML, reply_markup=buttons)
        else:
            await context.bot.send_document(ADMIN_ID, update.message.document.file_id, caption=caption,
                                            parse_mode=ParseMode.HTML, reply_markup=buttons)
    else:
        log.warning("ADMIN_CHAT_ID is not set; order #%s cannot be reviewed", oid)

    await update.message.reply_text(
        "🙏 وصل الوصل، راح نتأكد من الدفع ونبلش بتقريرك.\n"
        "يوصلك إشعار هنا أول ما يجهز (عادة خلال دقائق من التأكيد).",
        reply_markup=MAIN_KB)
    context.user_data.clear()
    return ConversationHandler.END


async def receipt_not_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("دز <b>صورة</b> وصل التحويل لو سمحت 📸", parse_mode=ParseMode.HTML)
    return RECEIPT


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    oid = context.user_data.get("order_id")
    if oid:
        store.set_status(oid, "rejected")
    context.user_data.clear()
    await update.effective_message.reply_text("انلغى الطلب. نتشرف بيك بأي وقت 🌹", reply_markup=MAIN_KB)
    return ConversationHandler.END


# ------------------------------------------------------------------ admin


async def on_review(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    if not is_admin(update):
        await q.answer("غير مسموح", show_alert=True)
        return
    action, oid = q.data.split(":")
    oid = int(oid)
    order = store.get(oid)
    if not order or order["status"] != "awaiting_review":
        await q.answer("الطلب مو بانتظار المراجعة", show_alert=True)
        return
    await q.answer()
    await q.edit_message_reply_markup(None)
    if action == "no":
        store.set_status(oid, "rejected")
        await q.message.reply_text(f"❌ انرفض الطلب #{oid}")
        await context.bot.send_message(
            order["chat_id"],
            f"⚠️ ما گدرنا نتأكد من دفع الطلب #{oid}. تواصل ويانا حتى نحلها:\n{CONTACT_INFO}")
        return
    store.set_status(oid, "approved")
    await q.message.reply_text(f"✅ تأكد الدفع للطلب #{oid}، بدأ التحضير…")
    await context.bot.send_message(
        order["chat_id"], f"✅ تأكد الدفع! بدينا نكتب تقريرك #{oid} ✍️\nيوصلك خلال دقائق.")
    context.application.create_task(fulfil(context.application, oid))


async def fulfil(app: Application, oid: int):
    order = store.get(oid)
    chat = order["chat_id"]
    try:
        result = await asyncio.to_thread(produce, to_order(order["data"]), DATA / "jobs" / str(oid))
    except Exception:
        log.exception("order #%s failed", oid)
        store.set_status(oid, "failed")
        await app.bot.send_message(chat, f"😔 صار خلل بتحضير الطلب #{oid}. فريقنا ديتابع وراح نرجعلك قريباً.")
        if ADMIN_ID:
            await app.bot.send_message(ADMIN_ID, f"🚨 فشل الطلب #{oid}، شوف السجل (logs).")
        return

    await app.bot.send_message(
        chat, f"🎉 تقريرك جاهز! ({result.get('pages', '?')} صفحة)\n"
              "راجعه قبل التسليم، وإذا تحتاج تعديل تگدر تعدل على ملف الـ Word مباشرة.")
    for kind in ("docx", "pdf", "xlsx"):
        path = result.get(kind)
        if path:
            with open(path, "rb") as fh:
                await app.bot.send_document(chat, fh, filename=Path(path).name)
    store.set_status(oid, "delivered")
    await app.bot.send_message(chat, "بالتوفيق 🌹 إذا عجبك الشغل دز البوت لأصدقائك.", reply_markup=MAIN_KB)
    if ADMIN_ID:
        await app.bot.send_message(ADMIN_ID, f"📦 انسلم الطلب #{oid}")


async def list_orders(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        return
    rows = store.recent(15)
    if not rows:
        await update.message.reply_text("ماكو طلبات بعد.")
        return
    lines = [f"#{r['id']} • {r['status']} • {fmt_iqd(r['price'])} • {html.escape(r['data'].get('title', ''))[:40]}"
             for r in rows]
    await update.message.reply_text("\n".join(lines))


async def whoami(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(f"الـ ID مالتك: {update.effective_user.id}")


# ------------------------------------------------------------------ wiring


def build_app(token: str, builder_hook=None) -> Application:
    builder = Application.builder().token(token)
    if builder_hook:
        builder = builder_hook(builder)
    app = builder.build()
    cancel_filter = filters.Regex(f"^{BTN_CANCEL}$")
    conv = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex(f"^{BTN_ORDER}$"), order_start),
                      CommandHandler("order", order_start)],
        states={
            ASK: [MessageHandler(cancel_filter, cancel),
                  MessageHandler(filters.TEXT & ~filters.COMMAND, on_answer)],
            CONFIRM: [CallbackQueryHandler(on_confirm, pattern="^(confirm|restart|cancel)$")],
            RECEIPT: [MessageHandler(cancel_filter, cancel),
                      MessageHandler(filters.PHOTO | filters.Document.IMAGE, on_receipt),
                      MessageHandler(filters.ALL & ~filters.COMMAND, receipt_not_photo)],
        },
        fallbacks=[CommandHandler("cancel", cancel), CommandHandler("start", cancel)],
        allow_reentry=True,
    )
    app.add_handler(conv)
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("orders", list_orders))
    app.add_handler(CommandHandler("id", whoami))
    app.add_handler(CallbackQueryHandler(on_review, pattern=r"^(ok|no):\d+$"))
    app.add_handler(MessageHandler(filters.Regex(f"^{BTN_SAMPLES}$"), samples))
    app.add_handler(MessageHandler(filters.Regex(f"^{BTN_PRICES}$"), prices))
    app.add_handler(MessageHandler(filters.Regex(f"^{BTN_CONTACT}$"), contact))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, start))
    return app


def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN (from @BotFather)")
    if not ADMIN_ID:
        log.warning("ADMIN_CHAT_ID not set: payment receipts will have nowhere to go")
    build_app(token).run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
