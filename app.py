import streamlit as st
from PIL import Image
import numpy as np
import joblib
import os
from datetime import datetime
from fpdf import FPDF
from database import init_db, add_patient, save_report

init_db()
os.makedirs("reports", exist_ok=True)

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
    from tensorflow.keras.applications import EfficientNetB0
    cnn = EfficientNetB0(weights='imagenet', include_top=False, pooling='avg', input_shape=(224,224,3))
    xgb = joblib.load('mammo_xgb.pkl')
    return cnn, xgb

def predict(img, cnn, xgb):
    from tensorflow.keras.applications.efficientnet import preprocess_input
    im = img.convert('RGB').resize((224,224))
    arr = preprocess_input(np.array(im).astype('float32'))
    feats = cnn.predict(np.expand_dims(arr,0), verbose=0)
    return xgb.predict_proba(feats)[0,1]

def make_report(name, pid, age, side, view, label, conf):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_fill_color(13, 59, 102)
    pdf.rect(0, 0, 210, 30, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_xy(12, 9); pdf.cell(0, 10, "Mammography AI - Case Report")
    pdf.set_text_color(0, 0, 0); pdf.ln(28)

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 8, f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}", ln=True)
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 13); pdf.cell(0, 9, "Patient Information", ln=True)
    pdf.set_font("Helvetica", "", 11)
    for k, v in [("Full Name", name or "-"), ("Patient ID", pid or "-"),
                 ("Age", str(age)), ("Breast Side", side), ("View", view)]:
        pdf.cell(45, 8, k + ":", border=0)
        pdf.cell(0, 8, str(v), ln=True)
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 13); pdf.cell(0, 9, "Analysis Result", ln=True)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*( (180,30,30) if label.startswith("Malignant") else (30,130,60)))
    pdf.cell(0, 9, f"Classification: {label}", ln=True)
    pdf.set_text_color(0,0,0)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, f"Model Confidence: {conf:.1%}", ln=True)
    pdf.ln(6)

    pdf.set_font("Helvetica", "B", 12); pdf.cell(0, 8, "Summary", ln=True)
    pdf.set_font("Helvetica", "", 10)
    summary = (f"The automated analysis classified the uploaded mammogram as '{label}' "
               f"with a model confidence of {conf:.1%}. This output is produced by an "
               f"AI-based screening model (EfficientNet feature extraction + XGBoost).")
    pdf.multi_cell(0, 6, summary)
    pdf.ln(4)

    pdf.set_draw_color(180,180,180); pdf.line(12, pdf.get_y(), 198, pdf.get_y()); pdf.ln(4)
    pdf.set_font("Helvetica", "I", 9); pdf.set_text_color(90,90,90)
    note = ("Note: This is an AI-assisted analysis intended for research and clinical "
            "decision support. It is not a certified diagnostic tool. The final diagnosis "
            "must be determined by a qualified radiologist.")
    pdf.multi_cell(0, 5, note)
    return bytes(pdf.output())

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
    cnn, xgb = load_models()

col1, col2 = st.columns([1, 1], gap="large")

with col1:
    st.markdown('<p class="section-title">📤 Upload Mammogram</p>', unsafe_allow_html=True)
    uploaded = st.file_uploader("Select a mammogram image", label_visibility="collapsed")
    if uploaded:
        img = Image.open(uploaded)
        st.image(img, caption="Uploaded image", use_container_width=True)
        if st.button("🔬 Analyze Image", type="primary", use_container_width=True):
            with st.spinner("Analyzing..."):
                proba = predict(img, cnn, xgb)
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
        label = "Malignant (Suspicious)" if proba >= 0.5 else "Benign"
        conf = proba if proba >= 0.5 else 1 - proba

        if patient_name or patient_id:
            st.markdown(f"**Patient:** {patient_name or '—'}  |  **ID:** {patient_id or '—'}  |  **Age:** {age}  |  **{side} / {view}**")

        if proba >= 0.5:
            st.error(f"### ⚠️ {label}")
        else:
            st.success(f"### ✅ {label}")

        st.write(f"**Confidence:** {conf:.1%}")
        st.progress(float(conf))

        pdf_bytes = make_report(patient_name, patient_id, age, side, view, label, conf)
        st.download_button("📄 Download Report (PDF)", data=pdf_bytes,
                           file_name=f"report_{patient_id or 'case'}.pdf",
                           mime="application/pdf", use_container_width=True)

        if patient_id:
            if st.button("💾 Save to Patient Portal", use_container_width=True):
                filename = f"reports/{patient_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
                with open(filename, "wb") as f:
                    f.write(pdf_bytes)
                save_report(patient_id, label, conf * 100, filename)
                st.success("✅ Report saved. Patient can now access it in the portal.")
        else:
            st.caption("⚠️ Enter a Patient ID to save the report to the portal.")

        st.caption("AI decision-support output. Final diagnosis is determined by a radiologist.")
        