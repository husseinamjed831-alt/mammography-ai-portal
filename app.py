import streamlit as st
from PIL import Image
import os
from datetime import datetime
import model
from report_pdf import make_report
from database import init_db, add_patient, save_report, REPORTS_DIR

init_db()

st.set_page_config(page_title="Mammography AI", page_icon="🩺", layout="wide")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
html, body, [class*="css"], .stApp { font-family: 'Inter', sans-serif; }
.app-header { background: linear-gradient(135deg, #0d3b66 0%, #1b6ca8 100%);
    padding: 28px 36px; border-radius: 18px; color: white; margin-bottom: 26px; }
.app-header h1 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.5px; }
.app-header p { margin: 6px 0 0; font-size: 14px; opacity: 0.9; }
.badge { display:inline-block; background: rgba(255,255,255,0.18); padding: 4px 12px;
    border-radius: 20px; font-size: 12px; margin-top: 10px; }
.section-title { font-size: 18px; font-weight: 600; color: #0d3b66; margin-bottom: 4px; }
</style>
""", unsafe_allow_html=True)

@st.cache_resource
def load_models():
    model.load()
    return model

with st.sidebar:
    st.header("📋 Patient Information")
    patient_name = st.text_input("Full Name", placeholder="e.g. Jane Doe")
    patient_id   = st.text_input("Patient ID", placeholder="e.g. 2847")
    age          = st.number_input("Age", min_value=18, max_value=100, value=50)
    side         = st.selectbox("Breast Side", ["Right", "Left"])
    view         = st.selectbox("View", ["CC", "MLO"])

    st.divider()
    with st.expander("➕ Register New Patient"):
        new_name = st.text_input("Name", key="reg_name")
        new_id   = st.text_input("ID", key="reg_id")
        new_pass = st.text_input("Temporary Password", type="password", key="reg_pass")
        if st.button("Create Account", use_container_width=True):
            if new_name and new_id and new_pass:
                if add_patient(new_id, new_name, new_pass):
                    st.success(f"Account created for {new_name}")
                else:
                    st.error("Patient ID already exists.")
            else:
                st.warning("Fill all fields.")

    st.divider()
    st.caption("Research Prototype · v2.0")

st.markdown("""
<div class="app-header">
    <h1>🩺 Mammography AI</h1>
    <p>Breast Cancer Screening Assistant · Decision Support System</p>
    <span class="badge">Research Prototype · v2.0</span>
</div>
""", unsafe_allow_html=True)

with st.spinner("Loading model... (first time may take a minute)"):
    load_models()

col1, col2 = st.columns([1, 1], gap="large")

with col1:
    st.markdown('<p class="section-title">📤 Upload Mammogram</p>', unsafe_allow_html=True)
    uploaded = st.file_uploader("Select a mammogram image", label_visibility="collapsed")
    if uploaded:
        img = Image.open(uploaded)
        st.image(img, caption="Uploaded image", use_container_width=True)
        if st.button("🔬 Analyze Image", type="primary", use_container_width=True):
            with st.spinner("Analyzing..."):
                proba = model.predict(img)
            st.session_state['proba'] = float(proba)
    else:
        st.info("Awaiting image upload...")
        st.session_state.pop('proba', None)

with col2:
    st.markdown('<p class="section-title">📊 Analysis Result</p>', unsafe_allow_html=True)
    if 'proba' not in st.session_state:
        st.info("Upload an image and click Analyze to view the result.")
    else:
        proba = st.session_state['proba']
        is_malignant = proba >= model.threshold()
        label = "Malignant (Suspicious)" if is_malignant else "Benign"
        conf = proba if is_malignant else 1 - proba

        if patient_name or patient_id:
            st.markdown(f"**Patient:** {patient_name or '—'}  |  **ID:** {patient_id or '—'}  |  **Age:** {age}  |  **{side} / {view}**")

        if is_malignant:
            st.error(f"### ⚠️ {label}")
        else:
            st.success(f"### ✅ {label}")

        st.write(f"**Confidence:** {conf:.1%}")
        st.progress(float(conf))

        pdf_bytes = make_report(patient_name, patient_id, age, side, view, label, conf, model.model_name())
        st.download_button("📄 Download Report (PDF)", data=pdf_bytes,
                           file_name=f"report_{patient_id or 'case'}.pdf",
                           mime="application/pdf", use_container_width=True)

        if patient_id:
            if st.button("💾 Save to Patient Portal", use_container_width=True):
                filename = f"{REPORTS_DIR}/{patient_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
                with open(filename, "wb") as f:
                    f.write(pdf_bytes)
                save_report(patient_id, label, conf * 100, filename)
                st.success("✅ Report saved. Patient can now access it in the portal.")
        else:
            st.caption("⚠️ Enter a Patient ID to save the report to the portal.")

        st.caption("AI decision-support output. Final diagnosis is determined by a radiologist.")
        