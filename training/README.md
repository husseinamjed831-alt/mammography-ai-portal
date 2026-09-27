# تدريب موديل أقوى

الموديل الحالي (`mammo_xgb.pkl`) يستخدم EfficientNetB0 مدرّب على صور عامة (ImageNet)
كمستخرج خصائص بس، وفوقه XGBoost. الـ CNN نفسه ما شاف ماموغرام بحياته.

`train_mammo.py` يدرّب **EfficientNetV2 كامل (end-to-end) على صور الماموغرام نفسها** وبدقة أعلى
(512×512 بدل 224)، وهذا أقوى بكثير.

## ليش مو "10 مليون صورة"؟

ماكو dataset ماموغرام عام بهذا الحجم. أكبر المتاح:

| Dataset | عدد الصور | الوصول |
|---|---|---|
| RSNA Screening Mammography | ~54,700 | مجاني على Kaggle |
| VinDr-Mammo | ~20,000 | مجاني بعد تسجيل (PhysioNet) |
| CBIS-DDSM | ~10,000 | مجاني (TCIA) |
| CMMD | ~5,200 | مجاني (TCIA) |
| EMBED (Emory) | ~3.4 مليون | يحتاج طلب رسمي واتفاقية بيانات |

السكربت يقرأ الصور بالتدفق من القرص، فيتحمل أي عدد صور (حتى ملايين) بدون ما تنملي الذاكرة.
وتكدر تجمع أكثر من dataset بنفس الأمر. المهم مو بس العدد، **الجودة والتنوع** أهم.

## الخطوات على Kaggle (GPU مجاني)

1. سوّي حساب على https://kaggle.com وفعّل رقم الموبايل (حتى يفتحلك الـ GPU)
2. **Create ← New Notebook**
3. من اليمين: **Accelerator ← GPU T4 x2**
4. **Add Input** وأضف:
   - مسابقة `rsna-breast-cancer-detection` (حتى تاخذ `train.csv`؛ لازم توافق على قوانين المسابقة)
   - dataset صور RSNA محوّلة لـ PNG (دوّر على "rsna breast cancer png 512"). الصور الأصلية DICOM وحجمها ~300GB،
     أما المحوّلة فأصغر بكثير وأسرع
5. بأول خلية:
   ```python
   !git clone https://github.com/husseinamjed831-alt/mammography-ai-portal
   %cd mammography-ai-portal/training
   ```
6. شوف مسار الصور: `!ls /kaggle/input/` لازم يكون ترتيبها `<patient_id>/<image_id>.png`
7. درّب:
   ```python
   !python train_mammo.py \
       --rsna-csv /kaggle/input/rsna-breast-cancer-detection/train.csv \
       --rsna-png-dir /kaggle/input/<اسم-الـ-dataset>/<مجلد-الصور> \
       --img-size 512 --batch 16 --epochs 12 \
       --out /kaggle/working/mammo_model.keras
   ```
   التدريب ياخذ تقريباً 6-9 ساعات. Kaggle يسمح بـ 12 ساعة لكل جلسة، واستخدم **Save Version ← Save & Run All**
   حتى يكمل حتى لو سديت المتصفح.
8. نزّل `mammo_model.keras` و `mammo_model.json` من **Output** وحطهم جنب `server.py`

## مصادر بيانات ثانية

```bash
# مجلدات: <root>/benign/... و <root>/malignant/...  (أو normal / cancer)
python train_mammo.py --folder /kaggle/input/cbis-ddsm-png --folder /kaggle/input/cmmd-png

# CSV بالأعمدة path,label,patient_id  (label: 0 حميد / 1 خبيث)
python train_mammo.py --csv vindr.csv

# كلهم سوية
python train_mammo.py --rsna-csv ... --rsna-png-dir ... --folder ... --csv ...
```

## الخيارات المهمة

| الخيار | الافتراضي | شرح |
|---|---|---|
| `--img-size` | 512 | دقة الصورة. أعلى = أدق بس أبطأ ويحتاج ذاكرة GPU أكثر |
| `--backbone` | v2s | `b0` صغير وسريع، `v2s` متوازن، `v2m` أقوى وأبطأ |
| `--batch` | 16 | لكل GPU. إذا طلع خطأ ذاكرة (OOM) نزّله لـ 8 |
| `--epochs` | 12 | عدد دورات الـ fine-tuning |
| `--pos-fraction` | 0.25 | نسبة الصور الخبيثة بكل دفعة (بـ RSNA هي 2% بس، فنعيد أخذ عينات منها) |

## شلون تعرف الموديل زين؟

بالنهاية يطبع ويحفظ بـ `mammo_model.json`:
- **val_auc**: أهم رقم. 0.5 = عشوائي، 1.0 = مثالي. بـ RSNA نتيجة 0.80+ ممتازة
- **val_sensitivity**: شكد نسبة الحالات الخبيثة اللي لكاها (مهم جداً طبياً)
- **val_specificity**: شكد نسبة الحالات السليمة اللي صنفها صح
- **threshold**: العتبة المثلى، والسيرفر يستخدمها تلقائياً

التقسيم بين التدريب والتقييم يصير **حسب المريضة**، يعني صور نفس المريضة ما تكون بالجهتين،
حتى الأرقام تكون صادقة ومو مضخمة.
