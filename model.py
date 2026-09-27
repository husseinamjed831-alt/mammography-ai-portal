"""تحميل الموديل والتنبؤ — مشترك بين app.py و server.py

الأولوية:
1. mammo_model.keras  → الموديل الجديد المدرّب end-to-end (من training/train_mammo.py)
2. mammo_xgb.pkl      → الموديل القديم (EfficientNetB0 features + XGBoost)
"""
import json
import os
import threading
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KERAS_PATH = os.path.join(BASE_DIR, "mammo_model.keras")
XGB_PATH = os.path.join(BASE_DIR, "mammo_xgb.pkl")
META_PATH = os.path.join(BASE_DIR, "mammo_model.json")

_cache = {}
_lock = threading.Lock()


def load():
    """يحمّل الموديل مرة وحدة ويرجعه"""
    with _lock:
        return _load()


def _load():
    if "model" in _cache:
        return _cache["model"]

    if os.path.exists(KERAS_PATH):
        import tensorflow as tf
        net = tf.keras.models.load_model(KERAS_PATH, compile=False)
        size = int(net.input_shape[1])
        _cache["model"] = ("keras", net, size)
    else:
        import joblib
        from tensorflow.keras.applications import EfficientNetB0
        cnn = EfficientNetB0(weights='imagenet', include_top=False, pooling='avg', input_shape=(224, 224, 3))
        xgb = joblib.load(XGB_PATH)
        _cache["model"] = ("xgb", (cnn, xgb), 224)
    return _cache["model"]


def model_name():
    if os.path.exists(KERAS_PATH):
        return "fine-tuned EfficientNetV2 (end-to-end)"
    return "EfficientNet feature extraction + XGBoost"


def threshold():
    """العتبة اللي فوقها تنحسب الصورة مشبوهة — تنحسب أثناء التدريب وتنحفظ بـ mammo_model.json"""
    if os.path.exists(KERAS_PATH) and os.path.exists(META_PATH):
        with open(META_PATH) as f:
            return float(json.load(f).get("threshold", 0.5))
    return 0.5


def predict(img):
    """يرجع احتمال الخباثة (0 → 1) لصورة PIL"""
    kind, net, size = load()
    im = img.convert('RGB').resize((size, size))
    arr = np.array(im).astype('float32')

    if kind == "keras":
        # الموديل الجديد يحتوي طبقة preprocessing داخلية، ياخذ بكسلات 0-255
        out = net.predict(np.expand_dims(arr, 0), verbose=0)
        return float(np.ravel(out)[0])

    from tensorflow.keras.applications.efficientnet import preprocess_input
    cnn, xgb = net
    feats = cnn.predict(np.expand_dims(preprocess_input(arr), 0), verbose=0)
    return float(xgb.predict_proba(feats)[0, 1])
