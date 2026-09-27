import sqlite3
import hashlib
import hmac
import os
import secrets
from datetime import datetime

# على Hugging Face نخلي MAMMO_DATA_DIR=/data حتى البيانات تبقى بعد إعادة التشغيل
DATA_DIR = os.environ.get("MAMMO_DATA_DIR", ".")
REPORTS_DIR = os.path.join(DATA_DIR, "reports")
DB_NAME = os.path.join(DATA_DIR, "mammo_system.db")
os.makedirs(REPORTS_DIR, exist_ok=True)

PBKDF2_ITERATIONS = 200_000


def get_connection():
    """يفتح اتصال بقاعدة البيانات"""
    return sqlite3.connect(DB_NAME)


def init_db():
    """ينشئ الجداول أول مرة"""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            patient_id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            report_id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            result TEXT NOT NULL,
            confidence REAL NOT NULL,
            pdf_path TEXT NOT NULL,
            FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
        )
    """)

    conn.commit()
    conn.close()
    print("Database ready")


def hash_password(password):
    """يشفّر كلمة السر (PBKDF2 مع salt)"""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS).hex()
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt}${digest}"


def check_password(password, stored):
    """يقارن كلمة السر بالـ hash — يدعم الصيغة القديمة (SHA-256 بدون salt)"""
    if stored.startswith("pbkdf2$"):
        _, iterations, salt, digest = stored.split("$")
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
        return hmac.compare_digest(test, digest)
    return hmac.compare_digest(hashlib.sha256(password.encode()).hexdigest(), stored)


def add_patient(patient_id, full_name, password):
    """يسجّل مريضة جديدة"""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO patients (patient_id, full_name, password_hash, created_at)
            VALUES (?, ?, ?, ?)
        """, (patient_id, full_name, hash_password(password), datetime.now().isoformat()))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


def save_report(patient_id, result, confidence, pdf_path):
    """يحفظ تقرير ويربطه بالمريضة"""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO reports (patient_id, created_at, result, confidence, pdf_path)
        VALUES (?, ?, ?, ?, ?)
    """, (patient_id, datetime.now().isoformat(), result, confidence, pdf_path))
    conn.commit()
    conn.close()


def verify_patient(patient_id, password):
    """يتحقق من دخول المريضة"""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT full_name, password_hash FROM patients
        WHERE patient_id = ?
    """, (patient_id,))
    row = cur.fetchone()
    if row and check_password(password, row[1]):
        # نرقّي الـ hash القديم للصيغة الجديدة
        if not row[1].startswith("pbkdf2$"):
            cur.execute("UPDATE patients SET password_hash = ? WHERE patient_id = ?",
                        (hash_password(password), patient_id))
            conn.commit()
        conn.close()
        return row[0]
    conn.close()
    return None


def get_patient_reports(patient_id):
    """يجيب كل تقارير المريضة"""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT report_id, created_at, result, confidence, pdf_path
        FROM reports
        WHERE patient_id = ?
        ORDER BY created_at DESC
    """, (patient_id,))
    rows = cur.fetchall()
    conn.close()
    return rows


def get_patient_name(patient_id):
    """يجيب اسم المريضة"""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT full_name FROM patients WHERE patient_id = ?", (patient_id,))
    row = cur.fetchone()
    conn.close()
    return row[0] if row else None


def get_report(report_id, patient_id):
    """يجيب تقرير وحد بشرط يكون للمريضة نفسها"""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT report_id, created_at, result, confidence, pdf_path
        FROM reports
        WHERE report_id = ? AND patient_id = ?
    """, (report_id, patient_id))
    row = cur.fetchone()
    conn.close()
    return row


if __name__ == "__main__":
    init_db() 