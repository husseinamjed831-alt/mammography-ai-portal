// تقرير PDF داخل المتصفح (نفس تصميم report_pdf.py)
const JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';

function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf) return resolve(window.jspdf.jsPDF);
    const s = document.createElement('script');
    s.src = JSPDF_URL;
    s.onload = () => resolve(window.jspdf.jsPDF);
    s.onerror = () => reject(new Error('Could not load the PDF library'));
    document.head.appendChild(s);
  });
}

export async function makeReport({ name, pid, age, side, view, label, confidence, model }) {
  const jsPDF = await loadJsPDF();
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pct = (confidence * 100).toFixed(1) + '%';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  pdf.setFillColor(13, 59, 102); pdf.rect(0, 0, 210, 30, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18);
  pdf.text('Mammography AI - Case Report', 12, 18);

  let y = 44;
  pdf.setTextColor(0, 0, 0); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  pdf.text(`Date: ${date}`, 10, y); y += 12;

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text('Patient Information', 10, y); y += 8;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
  for (const [k, v] of [['Full Name', name || '-'], ['Patient ID', pid || '-'], ['Age', String(age)], ['Breast Side', side], ['View', view]]) {
    pdf.text(k + ':', 10, y); pdf.text(String(v), 55, y); y += 8;
  }
  y += 4;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text('Analysis Result', 10, y); y += 9;
  pdf.setFontSize(12);
  if (label.startsWith('Malignant')) pdf.setTextColor(180, 30, 30); else pdf.setTextColor(30, 130, 60);
  pdf.text(`Classification: ${label}`, 10, y); y += 8;
  pdf.setTextColor(0, 0, 0); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
  pdf.text(`Model Confidence: ${pct}`, 10, y); y += 12;

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text('Summary', 10, y); y += 7;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  const summary = `The automated analysis classified the uploaded mammogram as '${label}' with a model confidence of ${pct}. This output is produced by an AI-based screening model (${model}).`;
  const lines = pdf.splitTextToSize(summary, 188);
  pdf.text(lines, 10, y); y += lines.length * 5 + 6;

  pdf.setDrawColor(180, 180, 180); pdf.line(12, y, 198, y); y += 7;
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(9); pdf.setTextColor(90, 90, 90);
  const note = 'Note: This is an AI-assisted analysis intended for research and clinical decision support. It is not a certified diagnostic tool. The final diagnosis must be determined by a qualified radiologist.';
  pdf.text(pdf.splitTextToSize(note, 188), 10, y);
  return pdf.output('blob');
}
