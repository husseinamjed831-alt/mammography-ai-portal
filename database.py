import sqlite3
import hashlib
from datetime import datetime

DB_NAME = "mammo_system.db"


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
    """يشفّر كلمة السر"""
    return hashlib.sha256(password.encode()).hexdigest()


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
        SELECT full_name FROM patients
        WHERE patient_id = ? AND password_hash = ?
    """, (patient_id, hash_password(password)))
    row = cur.fetchone()
    conn.close()
    return row[0] if row else None


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


if __name__ == "__main__":
    init_db() 