import streamlit as st
from database import verify_patient, get_patient_reports
from datetime import datetime
import os

st.set_page_config(page_title="Patient Portal", page_icon="🏥", layout="centered")

# ===== حالة الجلسة =====
if "logged_in" not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.patient_id = None
    st.session_state.patient_name = None


# ===== صفحة الدخول =====
def login_page():
    st.title("🏥 Patient Portal")
    st.caption("Secure access to your medical reports")
    st.divider()

    patient_id = st.text_input("Patient ID", placeholder="e.g. 2847")
    password = st.text_input("Password", type="password")

    if st.button("Sign In", type="primary", use_container_width=True):
        if not patient_id or not password:
            st.warning("Please enter both fields.")
            return

        name = verify_patient(patient_id, password)
        if name:
            st.session_state.logged_in = True
            st.session_state.patient_id = patient_id
            st.session_state.patient_name = name
            st.rerun()
        else:
            st.error("Invalid Patient ID or password.")


# ===== صفحة التقارير =====
def reports_page():
    col1, col2 = st.columns([3, 1])
    with col1:
        st.title(f"Welcome, {st.session_state.patient_name}")
        st.caption(f"Patient ID: {st.session_state.patient_id}")
    with col2:
        if st.button("Sign Out"):
            st.session_state.logged_in = False
            st.session_state.patient_id = None
            st.session_state.patient_name = None
            st.rerun()

    st.divider()
    st.subheader("📄 Your Reports")

    reports = get_patient_reports(st.session_state.patient_id)

    if not reports:
        st.info("No reports available yet.")
        return

    for report_id, created_at, result, confidence, pdf_path in reports:
        date = datetime.fromisoformat(created_at).strftime("%B %d, %Y — %I:%M %p")

        with st.container(border=True):
            c1, c2 = st.columns([2, 1])
            with c1:
                st.markdown(f"**Report #{report_id}**")
                st.caption(date)
                st.markdown(f"Result: **{result}**  ·  Confidence: **{confidence:.1f}%**")
            with c2:
                if os.path.exists(pdf_path):
                    with open(pdf_path, "rb") as f:
                        st.download_button(
                            "⬇ Download PDF",
                            f.read(),
                            file_name=f"report_{report_id}.pdf",
                            mime="application/pdf",
                            use_container_width=True,
                        )
                else:
                    st.caption("File unavailable")


# ===== التوجيه =====
if st.session_state.logged_in:
    reports_page()
else:
    login_page()
    