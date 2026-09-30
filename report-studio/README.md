# Report Studio: تقارير جامعية جاهزة بتصميم احترافي

خدمة تستلم طلب الطالب (معلومات الواجهة، العنوان، عدد الصفحات، التصميم)، فيكتب Claude محتوى التقرير، ثم يحوّله المحرك إلى ملفات جاهزة:

- **Word (.docx)** قابل للتعديل، والخطوط مدمجة داخله فيظهر بنفس الشكل على أي جهاز
- **PDF** جاهز للطباعة
- **Excel (.xlsx)** فيه فهرس التقرير وجداوله بأرقام قابلة للرسم البياني

في كل تقرير: غلاف بصيغة الجامعات العراقية، وفهرس بأرقام صفحات حقيقية، وترقيم عناوين (أولاً، ثانياً…)، وجداول ملونة، وصناديق أفكار، وترقيم صفحات، وقائمة مراجع. الملف نظيف: بياناته الوصفية (المؤلف والعنوان) باسم الطالب، ولا يحمل أي علامة أو صورة مصغّرة لأداة.

## العينات

في `samples/output/` ثلاث عينات جاهزة لعرضها على الزبائن:

| العينة | اللغة | التصميم | الصفحات |
|---|---|---|---|
| الذكاء الاصطناعي في الكشف المبكر عن سرطان الثدي | عربي | طبي | 9 |
| الطاقة الشمسية في العراق | عربي | كلاسيكي عراقي (إطار) | 7 |
| Antimicrobial Resistance | English | علوم | 8 |

الصور `*-showcase.png` تعرض أول أربع صفحات من كل عينة، وتصلح للنشر على إنستغرام وتيليگرام.

## التشغيل

```bash
cd report-studio
pip install -r requirements.txt        # ويحتاج LibreOffice Writer للـ PDF
export ANTHROPIC_API_KEY=...           # مفتاح Claude
export STUDIO_API_KEY=سر-تختاره        # يحمي الخادم
export PUBLIC_BASE_URL=https://your-server.example.com
uvicorn server:app --host 0.0.0.0 --port 8000
```

أو عبر Docker:

```bash
docker build -t report-studio .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=... -e STUDIO_API_KEY=... \
  -e PUBLIC_BASE_URL=https://your-server.example.com -v $PWD/data:/data report-studio
```

لإعادة بناء العينات: `python scripts/build_samples.py`

## ربطه بـ n8n

1. استورد `n8n/report-studio-workflow.json` (Workflows ← Import from file).
2. في عقدة **توليد التقرير** غيّر الرابط `https://YOUR-STUDIO-SERVER/orders` إلى عنوان خادمك، وأنشئ Credential من نوع *Header Auth* باسم `X-API-Key` وقيمة `STUDIO_API_KEY`.
3. فعّل الـ workflow وانشر رابط الاستمارة للطلاب.

المسار: استمارة الطلب ← تجهيز الحقول ← `POST /orders` ← صفحة فيها روابط التحميل والسعر.

## واجهة الخادم

| المسار | الوظيفة |
|---|---|
| `POST /orders` | حقول الاستمارة ← Claude يكتب ← الملفات والسعر |
| `POST /render` | JSON تقرير جاهز ← الملفات (بدون ذكاء اصطناعي) |
| `GET /price?kind=report&pages=20` | السعر |
| `GET /files/{job}/{name}` | تحميل ملف |

## الأسعار

تُعدَّل من `studio/pricing.py`:

| الخدمة | السعر |
|---|---|
| تقرير حتى 10 صفحات | 5,000 د.ع |
| تقرير حتى 20 صفحة | 10,000 د.ع |
| تقرير حتى 40 صفحة | 15,000 د.ع |
| عرض تقديمي عادي | 5,000 د.ع |
| عرض متحرك | 15,000 د.ع |
| عرض مع 3D | 20,000 د.ع |

## التصاميم

`classic` (كلاسيكي عراقي بإطار)، `medical`، `engineering`، `science`، `law` (بإطار)، `humanities`، `business`، `minimal`. الألوان في `studio/themes.py`.

## صيغة JSON للتقرير

```json
{
  "lang": "ar",
  "theme": "medical",
  "cover": {"title": "...", "subtitle": "...", "university": "...", "college": "...",
            "department": "...", "subject": "...", "stage": "...", "student": "...",
            "supervisor": "...", "academic_year": "...", "logo_path": "اختياري"},
  "abstract": "...",
  "keywords": ["..."],
  "sections": [
    {"heading": "المقدمة",
     "blocks": [
       {"type": "paragraph", "text": "نص فيه **كلمة عريضة**"},
       {"type": "bullets", "items": ["..."]},
       {"type": "numbered", "items": ["..."]},
       {"type": "table", "caption": "...", "headers": ["..."], "rows": [["..."]]},
       {"type": "callout", "title": "...", "text": "..."},
       {"type": "quote", "text": "...", "source": "..."}
     ],
     "subsections": [{"heading": "...", "blocks": []}]}
  ],
  "references": ["..."]
}
```

## ملاحظات على الجودة

- البرومبت (`prompts/writer_system.md`) يمنع العبارات المستهلكة، ويطلب نقاشاً نقدياً وأمثلة من الواقع العراقي، ويمنع اختراع الإحصاءات أو المراجع. مع ذلك **راجع المراجع قبل التسليم**، فهذا أهم ما يحمي سمعة الخدمة.
- عدد الصفحات يُقدَّر من عدد الكلمات (نحو 210 كلمة للصفحة بالعربي و250 بالإنكليزي)، وقد يختلف الناتج بصفحة زائدة أو ناقصة. الرقم الفعلي يرجع في حقل `pages`.
- النموذج الافتراضي `claude-opus-5-5` بجهد `high`. غيّرهما عبر `STUDIO_MODEL` و`STUDIO_EFFORT`.
