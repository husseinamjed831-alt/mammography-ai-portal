"""الخادم الجديد: FastAPI يقدّم الـ API + واجهة WebGL من مجلد web/

التشغيل:  uvicorn server:app --host 0.0.0.0 --port 7860
"""
import base64
import hashlib
import hmac
import io
import os
import secrets
import threading
import time
from collections import OrderedDict
from datetime import datetime

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

import model
from database import (REPORTS_DIR, add_patient, get_patient_name, get_patient_reports,
                      get_report, init_db, save_report, verify_patient)
from report_pdf import make_report

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")

# مفتاح توقيع جلسات المريضات — لازم يكون ثابت بالإنتاج حتى الجلسات ما تنمسح عند إعادة التشغيل
SECRET = os.environ.get("MAMMO_SECRET") or secrets.token_hex(32)
# إذا انضبط، واجهة الطبيب تطلب كلمة سر
DOCTOR_PASSWORD = os.environ.get("DOCTOR_PASSWORD", "")
TOKEN_TTL = 60 * 60 * 8
MAX_UPLOAD = 40 * 1024 * 1024

# آخر التحليلات بالذاكرة حتى الطبيب يكدر يحفظها للبوابة بدون إعادة التحليل
_analyses = OrderedDict()
MAX_ANALYSES = 200

init_db()
app = FastAPI(title="Mammography AI", docs_url=None, redoc_url=None)


@app.on_event("startup")
def warm_up():
    # نحمّل الموديل بالخلفية حتى أول تحليل يكون سريع
    threading.Thread(target=model.load, daemon=True).start()


# ===== التوكنات =====
def _sign(payload):
    return hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def make_token(role, subject):
    payload = f"{role}|{subject}|{int(time.time()) + TOKEN_TTL}"
    raw = f"{payload}|{_sign(payload)}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def read_token(token, role):
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        payload, sig = raw.rsplit("|", 1)
        tok_role, subject, exp = payload.split("|")
    except Exception:
        raise HTTPException(401, "Invalid session")
    if not hmac.compare_digest(sig, _sign(payload)) or tok_role != role or int(exp) < time.time():
        raise HTTPException(401, "Session expired")
    return subject


def bearer(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not signed in")
    return authorization[7:]


def require_doctor(authorization):
    if DOCTOR_PASSWORD:
        read_token(bearer(authorization), "doctor")


# ===== الطبيب =====
class DoctorLogin(BaseModel):
    password: str


@app.get("/api/config")
def config():
    return {"doctor_auth": bool(DOCTOR_PASSWORD)}


@app.post("/api/doctor/login")
def doctor_login(body: DoctorLogin):
    if not DOCTOR_PASSWORD:
        return {"token": ""}
    if not hmac.compare_digest(body.password, DOCTOR_PASSWORD):
        raise HTTPException(401, "Wrong password")
    return {"token": make_token("doctor", "doctor")}


@app.get("/api/model")
def model_info():
    return {"name": model.model_name()}


@app.post("/api/analyze")
async def analyze(
    image: UploadFile = File(...),
    name: str = Form(""),
    patient_id: str = Form(""),
    age: int = Form(50),
    side: str = Form("Right"),
    view: str = Form("CC"),
    authorization: str = Header(None),
):
    require_doctor(authorization)
    data = await image.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Image too large")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Unsupported image file")

    proba = await run_in_threadpool(model.predict, img)
    malignant = proba >= model.threshold()
    label = "Malignant (Suspicious)" if malignant else "Benign"
    conf = proba if malignant else 1 - proba
    pdf_bytes = make_report(name, patient_id, age, side, view, label, conf, model.model_name())

    analysis_id = secrets.token_urlsafe(12)
    _analyses[analysis_id] = {"patient_id": patient_id, "label": label, "conf": conf, "pdf": pdf_bytes}
    while len(_analyses) > MAX_ANALYSES:
        _analyses.popitem(last=False)

    return {
        "probability": proba,
        "label": label,
        "malignant": bool(malignant),
        "confidence": conf,
        "model": model.model_name(),
        "threshold": model.threshold(),
        "analysis_id": analysis_id,
        "pdf": base64.b64encode(pdf_bytes).decode(),
    }


@app.post("/api/analyses/{analysis_id}/save")
def save_analysis(analysis_id: str, authorization: str = Header(None)):
    require_doctor(authorization)
    item = _analyses.get(analysis_id)
    if not item:
        raise HTTPException(404, "Analysis expired, please analyze again")
    patient_id = item["patient_id"]
    if not patient_id:
        raise HTTPException(400, "Enter a Patient ID to save the report")
    if get_patient_name(patient_id) is None:
        raise HTTPException(404, "No portal account for this Patient ID — register the patient first")
    if item.get("saved"):
        return {"ok": True}
    safe_id = "".join(c for c in patient_id if c.isalnum() or c in "-_") or "patient"
    filename = os.path.join(REPORTS_DIR, f"{safe_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{analysis_id[:6]}.pdf")
    with open(filename, "wb") as f:
        f.write(item["pdf"])
    save_report(patient_id, item["label"], item["conf"] * 100, filename)
    item["saved"] = True
    return {"ok": True}


class NewPatient(BaseModel):
    patient_id: str
    full_name: str
    password: str


@app.post("/api/patients")
def register_patient(body: NewPatient, authorization: str = Header(None)):
    require_doctor(authorization)
    if not (body.patient_id.strip() and body.full_name.strip() and body.password):
        raise HTTPException(400, "Fill all fields")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if not add_patient(body.patient_id.strip(), body.full_name.strip(), body.password):
        raise HTTPException(409, "Patient ID already exists")
    return {"ok": True}


# ===== المريضة =====
class PatientLogin(BaseModel):
    patient_id: str
    password: str


@app.post("/api/portal/login")
def portal_login(body: PatientLogin):
    name = verify_patient(body.patient_id, body.password)
    if not name:
        raise HTTPException(401, "Invalid Patient ID or password")
    return {"token": make_token("patient", body.patient_id), "name": name}


@app.get("/api/portal/reports")
def portal_reports(authorization: str = Header(None)):
    pid = read_token(bearer(authorization), "patient")
    reports = [
        {"id": r[0], "created_at": r[1], "result": r[2], "confidence": r[3],
         "available": os.path.exists(r[4])}
        for r in get_patient_reports(pid)
    ]
    return {"patient_id": pid, "name": get_patient_name(pid), "reports": reports}


@app.get("/api/portal/reports/{report_id}/pdf")
def portal_pdf(report_id: int, authorization: str = Header(None)):
    pid = read_token(bearer(authorization), "patient")
    row = get_report(report_id, pid)
    if not row or not os.path.exists(row[4]):
        raise HTTPException(404, "Report not found")
    return FileResponse(row[4], media_type="application/pdf", filename=f"report_{report_id}.pdf")


# ===== الواجهة =====
@app.get("/portal")
def portal_page():
    return FileResponse(os.path.join(WEB_DIR, "portal.html"))


@app.get("/healthz")
def health():
    return Response("ok")


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
