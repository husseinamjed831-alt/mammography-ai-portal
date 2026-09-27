from datetime import datetime
from fpdf import FPDF


def make_report(name, pid, age, side, view, label, conf, model_name="EfficientNet feature extraction + XGBoost"):
    """ينشئ تقرير PDF ويرجعه كـ bytes"""
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
               f"AI-based screening model ({model_name}).")
    pdf.multi_cell(0, 6, summary)
    pdf.ln(4)

    pdf.set_draw_color(180,180,180); pdf.line(12, pdf.get_y(), 198, pdf.get_y()); pdf.ln(4)
    pdf.set_font("Helvetica", "I", 9); pdf.set_text_color(90,90,90)
    note = ("Note: This is an AI-assisted analysis intended for research and clinical "
            "decision support. It is not a certified diagnostic tool. The final diagnosis "
            "must be determined by a qualified radiologist.")
    pdf.multi_cell(0, 5, note)
    return bytes(pdf.output())
