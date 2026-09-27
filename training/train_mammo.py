"""تدريب موديل ماموغرام أقوى (EfficientNetV2 مدرّب end-to-end)

يشتغل على Kaggle / Colab GPU. البيانات تنقرأ بالتدفق (tf.data) من القرص،
فما يهم عدد الصور — 50 ألف أو ملايين — الذاكرة ما تنملي.

الناتج:
  mammo_model.keras   ← حطه جنب server.py والسيرفر يستخدمه تلقائياً
  mammo_model.json    ← العتبة (threshold) المثلى + نتائج التقييم

أمثلة:
  # RSNA (صور PNG مجهزة: <png_dir>/<patient_id>/<image_id>.png)
  python train_mammo.py --rsna-csv /kaggle/input/rsna-breast-cancer-detection/train.csv \
                        --rsna-png-dir /kaggle/input/<rsna-png-dataset>/train_images

  # أي dataset بمجلدات: <root>/benign/*.png و <root>/malignant/*.png
  python train_mammo.py --folder /kaggle/input/cbis-ddsm-png

  # CSV عام بالأعمدة: path,label[,patient_id]
  python train_mammo.py --csv my_images.csv

  تكدر تجمع أكثر من مصدر بنفس الأمر.
"""
import argparse
import glob
import json
import os
import random

import numpy as np
import pandas as pd
import tensorflow as tf

IMG_EXT = (".png", ".jpg", ".jpeg")


# ===== جمع البيانات =====
def from_rsna(csv_path, png_dir):
    df = pd.read_csv(csv_path)
    out = pd.DataFrame({
        "path": [os.path.join(png_dir, str(p), f"{i}.png") for p, i in zip(df.patient_id, df.image_id)],
        "label": df.cancer.astype(int),
        "patient_id": "rsna_" + df.patient_id.astype(str),
    })
    return out[out.path.map(os.path.exists)]


def from_folder(root):
    rows = []
    for label_name, label in (("benign", 0), ("normal", 0), ("malignant", 1), ("cancer", 1)):
        for path in glob.glob(os.path.join(root, "**", label_name, "**", "*"), recursive=True):
            if path.lower().endswith(IMG_EXT):
                # بدون رقم مريضة نستخدم اسم الملف كمجموعة
                rows.append((path, label, "folder_" + os.path.splitext(os.path.basename(path))[0]))
    return pd.DataFrame(rows, columns=["path", "label", "patient_id"]).drop_duplicates("path")


def from_csv(csv_path):
    df = pd.read_csv(csv_path)
    if "patient_id" not in df:
        df["patient_id"] = df["path"]
    df["patient_id"] = "csv_" + df["patient_id"].astype(str)
    return df[["path", "label", "patient_id"]]


def split_by_patient(df, val_frac, seed):
    """نقسم حسب المريضة حتى صور نفس المريضة ما تكون بالتدريب والتقييم سوية"""
    patients = sorted(df.patient_id.unique())
    random.Random(seed).shuffle(patients)
    val_patients = set(patients[: max(1, int(len(patients) * val_frac))])
    is_val = df.patient_id.isin(val_patients)
    return df[~is_val].reset_index(drop=True), df[is_val].reset_index(drop=True)


# ===== خط البيانات =====
def load_image(path, size):
    raw = tf.io.read_file(path)
    img = tf.io.decode_image(raw, channels=1, expand_animations=False)
    img = tf.image.resize_with_pad(tf.cast(img, tf.float32), size, size)
    return tf.image.grayscale_to_rgb(img)  # 0-255


def augment(img):
    img = tf.image.random_flip_left_right(img)
    img = tf.image.random_flip_up_down(img)
    img = tf.image.random_brightness(img, 20.0)
    img = tf.image.random_contrast(img, 0.85, 1.15)
    return tf.clip_by_value(img, 0.0, 255.0)


def make_dataset(df, size, batch, training, pos_fraction):
    AUTOTUNE = tf.data.AUTOTUNE

    def build(frame):
        ds = tf.data.Dataset.from_tensor_slices((frame.path.values, frame.label.values.astype("float32")))
        if training:
            ds = ds.shuffle(min(len(frame), 50_000), reshuffle_each_iteration=True).repeat()
        return ds

    if training and pos_fraction > 0:
        # الحالات الخبيثة قليلة (RSNA ≈ 2%) — نعيد أخذ عينات منها حتى الموديل يتعلمها
        pos, neg = df[df.label == 1], df[df.label == 0]
        ds = tf.data.Dataset.sample_from_datasets(
            [build(pos), build(neg)], weights=[pos_fraction, 1 - pos_fraction])
    else:
        ds = build(df)

    ds = ds.map(lambda p, y: (load_image(p, size), y), num_parallel_calls=AUTOTUNE)
    if training:
        ds = ds.map(lambda x, y: (augment(x), y), num_parallel_calls=AUTOTUNE)
    return ds.batch(batch).prefetch(AUTOTUNE)


# ===== الموديل =====
def build_model(size, backbone, weights):
    apps = tf.keras.applications
    ctor = {
        "v2s": apps.EfficientNetV2S,
        "v2m": apps.EfficientNetV2M,
        "b0": apps.EfficientNetV2B0,
    }[backbone]
    # include_preprocessing=True: الموديل ياخذ بكسلات 0-255 مباشرة (نفس اللي يرسله model.py)
    base = ctor(include_top=False, weights=weights, input_shape=(size, size, 3),
                pooling="avg", include_preprocessing=True)
    inp = tf.keras.Input((size, size, 3))
    x = base(inp)
    x = tf.keras.layers.Dropout(0.3)(x)
    out = tf.keras.layers.Dense(1, activation="sigmoid", dtype="float32")(x)
    return tf.keras.Model(inp, out), base


def best_threshold(y, p):
    """العتبة اللي تعطي أعلى F1"""
    best_t, best_f1 = 0.5, 0.0
    for t in np.linspace(0.05, 0.95, 91):
        pred = p >= t
        tp = np.sum(pred & (y == 1)); fp = np.sum(pred & (y == 0)); fn = np.sum(~pred & (y == 1))
        f1 = 2 * tp / max(2 * tp + fp + fn, 1)
        if f1 > best_f1:
            best_t, best_f1 = float(t), float(f1)
    return best_t, best_f1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rsna-csv"); ap.add_argument("--rsna-png-dir")
    ap.add_argument("--folder", action="append", default=[])
    ap.add_argument("--csv", action="append", default=[])
    ap.add_argument("--img-size", type=int, default=512)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--backbone", choices=["b0", "v2s", "v2m"], default="v2s")
    ap.add_argument("--weights", default="imagenet", help="imagenet أو none")
    ap.add_argument("--head-epochs", type=int, default=2, help="مرحلة 1: تدريب الرأس فقط")
    ap.add_argument("--epochs", type=int, default=12, help="مرحلة 2: fine-tuning كامل")
    ap.add_argument("--steps-per-epoch", type=int, default=0, help="0 = حسب حجم البيانات")
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--pos-fraction", type=float, default=0.25, help="نسبة الخبيث بكل batch تدريب")
    ap.add_argument("--val-frac", type=float, default=0.15)
    ap.add_argument("--out", default="mammo_model.keras")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    tf.keras.utils.set_random_seed(args.seed)
    if tf.config.list_physical_devices("GPU"):
        tf.keras.mixed_precision.set_global_policy("mixed_float16")
    strategy = tf.distribute.MirroredStrategy()  # يستخدم كل الـ GPUs الموجودة (Kaggle T4 x2)
    print("Devices:", strategy.num_replicas_in_sync)

    parts = []
    if args.rsna_csv:
        parts.append(from_rsna(args.rsna_csv, args.rsna_png_dir))
    parts += [from_folder(f) for f in args.folder]
    parts += [from_csv(c) for c in args.csv]
    if not parts:
        ap.error("give at least one data source (--rsna-csv, --folder or --csv)")
    df = pd.concat(parts, ignore_index=True).drop_duplicates("path")
    if df.label.nunique() < 2:
        ap.error("data must contain both benign (0) and malignant (1) images")
    train_df, val_df = split_by_patient(df, args.val_frac, args.seed)
    print(f"Images: {len(df)}  train={len(train_df)}  val={len(val_df)}  malignant={int(df.label.sum())}")

    batch = args.batch * strategy.num_replicas_in_sync
    train_ds = make_dataset(train_df, args.img_size, batch, True, args.pos_fraction)
    val_ds = make_dataset(val_df, args.img_size, batch, False, 0)
    steps = args.steps_per_epoch or max(1, len(train_df) // batch)

    with strategy.scope():
        net, base = build_model(args.img_size, args.backbone, None if args.weights == "none" else args.weights)
        metrics = [tf.keras.metrics.AUC(name="auc"), tf.keras.metrics.Recall(name="recall"),
                   tf.keras.metrics.Precision(name="precision")]

        # المرحلة 1: نجمّد الـ backbone وندرب الرأس
        base.trainable = False
        net.compile(tf.keras.optimizers.Adam(args.lr * 3), "binary_crossentropy", metrics=metrics)
    if args.head_epochs:
        net.fit(train_ds, validation_data=val_ds, epochs=args.head_epochs, steps_per_epoch=steps)

    with strategy.scope():
        # المرحلة 2: fine-tuning لكل الطبقات مع cosine decay
        base.trainable = True
        schedule = tf.keras.optimizers.schedules.CosineDecay(args.lr, decay_steps=steps * max(args.epochs, 1))
        net.compile(tf.keras.optimizers.AdamW(schedule, weight_decay=1e-5), "binary_crossentropy", metrics=metrics)
    callbacks = [tf.keras.callbacks.ModelCheckpoint(args.out, monitor="val_auc", mode="max", save_best_only=True)]
    if args.epochs:
        net.fit(train_ds, validation_data=val_ds, epochs=args.epochs, steps_per_epoch=steps, callbacks=callbacks)
    if not os.path.exists(args.out):
        net.save(args.out)

    # التقييم النهائي على أفضل نسخة
    best = tf.keras.models.load_model(args.out, compile=False)
    p = best.predict(val_ds, verbose=0).ravel()
    y = val_df.label.values
    auc = float(tf.keras.metrics.AUC()(y, p).numpy())
    t, f1 = best_threshold(y, p)
    pred = p >= t
    report = {
        "backbone": args.backbone, "img_size": args.img_size, "threshold": t,
        "val_auc": auc, "val_f1": f1,
        "val_sensitivity": float(np.sum(pred & (y == 1)) / max(np.sum(y == 1), 1)),
        "val_specificity": float(np.sum(~pred & (y == 0)) / max(np.sum(y == 0), 1)),
        "train_images": len(train_df), "val_images": len(val_df),
    }
    with open(os.path.splitext(args.out)[0] + ".json", "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
