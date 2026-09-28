// واجهة الطبيب: مقدمة → مساحة العمل → المسح → النتيجة
import { createScene } from './scene.js';
import { go, splitChars, scramble, toast, api, downloadBlob, storage } from './ui.js';
import { loadModel, analyze as analyzeOnDevice } from './ondevice.js';
import { makeReport } from './report.js';

const gsap = window.gsap;
const $ = (id) => document.getElementById(id);
const scene = createScene($('gl'));

let token = storage('doctorToken') || '';
// server: التحليل على السيرفر (server.py) — device: بدون سيرفر، الموديل يشتغل بالمتصفح
let MODE = 'server';
const DEVICE_MODEL = 'EfficientNetB0 + XGBoost (on-device)';
let file = null;
let last = null;

// ===== البداية =====
async function boot() {
  let cfg = { doctor_auth: false };
  try {
    cfg = await api('/api/config');
    api('/api/model').then((m) => { $('modelName').textContent = m.name.split(' ')[0]; }).catch(() => {});
  } catch {
    setupDevice();
  }

  if (cfg.doctor_auth && !token) {
    scene.place(0, 0, 0.9);
    go('stage-lock');
  } else {
    showIntro();
  }
}

function setupDevice() {
  MODE = 'device';
  $('modeBadge').hidden = false;
  $('portalLink').hidden = true;
  $('saveBtn').hidden = true;
  const label = $('modelName');
  label.textContent = '0%';
  loadModel((p) => { label.textContent = Math.round(p * 100) + '%'; })
    .then(() => {
      label.textContent = 'Ready';
      gsap.fromTo(label, { color: '#27f5b0' }, { color: '#eef3ff', duration: 2 });
    })
    .catch(() => { label.textContent = 'Offline'; toast('Could not load the AI model. Check your connection.', 'err'); });
}

function showIntro() {
  $('openRegister').hidden = MODE === 'device';
  scene.place(1.7, 0, 1.15);
  scene.setState('idle');
  go('stage-intro', {
    onEnter() {
      gsap.from('#stage-intro h1 .line > span', {
        yPercent: 110, rotate: 4, duration: 1.3, ease: 'expo.out', stagger: 0.1, delay: 0.1,
      });
    },
  });
}

$('lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('lockMsg').textContent = '';
  try {
    const r = await api('/api/doctor/login', { method: 'POST', body: { password: $('docPass').value } });
    token = r.token;
    storage('doctorToken', token);
    showIntro();
  } catch (err) {
    $('lockMsg').className = 'msg err';
    $('lockMsg').textContent = err.message;
    gsap.fromTo('#lockForm', { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
  }
});

function handleAuthError(err) {
  if (err.status === 401) {
    token = ''; storage('doctorToken', null);
    toast('Session expired — please sign in again.', 'err');
    scene.place(0, 0, 0.9);
    go('stage-lock');
    return true;
  }
  return false;
}

// ===== مساحة العمل =====
$('begin').addEventListener('click', () => {
  scene.place(2.6, 0.2, 0.85);
  go('stage-work');
});

document.querySelectorAll('.seg').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
});
const segValue = (name) => document.querySelector(`.seg[data-name="${name}"] .on`).textContent;

const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
$('file').addEventListener('change', (e) => { if (e.target.files[0]) setFile(e.target.files[0]); });

function setFile(f) {
  if (!f.type.startsWith('image/') && !/\.(tif|tiff|png|jpe?g)$/i.test(f.name)) {
    toast('Please choose an image file.', 'err');
    return;
  }
  file = f;
  const url = URL.createObjectURL(f);
  let img = drop.querySelector('img');
  if (!img) { img = document.createElement('img'); img.alt = 'Uploaded mammogram'; drop.appendChild(img); }
  img.src = url;
  $('scanImg').src = url;
  gsap.fromTo(img, { scale: 1.15, opacity: 0, filter: 'blur(20px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 1, ease: 'expo.out' });
  $('analyze').disabled = false;
  scene.burst();
}

// ===== المسح =====
const STEPS = [
  'Normalizing image intensity',
  'Resizing to model input',
  'Extracting deep features',
  'Scoring tissue patterns',
  'Calibrating probability',
];

$('analyze').addEventListener('click', async () => {
  if (!file) return;
  scene.place(0, 0, 1.7);
  scene.setState('scan');
  await go('stage-scan');

  const beam = gsap.fromTo('.scan-frame .beam', { top: '-120px' }, { top: '100%', duration: 1.6, ease: 'sine.inOut', repeat: -1, yoyo: true });
  const log = $('scanLog');
  log.innerHTML = '';
  gsap.set('#scanBar', { width: '0%' });

  const form = new FormData();
  form.append('image', file);
  form.append('name', $('pName').value.trim());
  form.append('patient_id', $('pId').value.trim());
  form.append('age', $('pAge').value || '50');
  form.append('side', segValue('side'));
  form.append('view', segValue('view'));
  $('featWrap').hidden = MODE !== 'device';
  if (MODE === 'device') clearFeatures();
  const request = MODE === 'device' ? runOnDevice() : api('/api/analyze', { method: 'POST', body: form, token });

  // نعرض الخطوات بينما الطلب شغال، وأقل مدة 2.8 ثانية حتى الانتقال يبين
  const shown = (async () => {
    for (let i = 0; i < STEPS.length; i++) {
      const line = document.createElement('div');
      log.appendChild(line);
      await scramble(line, `> ${STEPS[i]}`, 380);
      line.innerHTML += ' <span class="ok">✓</span>';
      gsap.to('#scanBar', { width: `${((i + 1) / STEPS.length) * 90}%`, duration: 0.4 });
      await new Promise((r) => setTimeout(r, 180));
    }
  })();

  try {
    const [res] = await Promise.all([request, shown]);
    gsap.to('#scanBar', { width: '100%', duration: 0.3 });
    if (MODE === 'device') {
      // نعرض الأرقام الحقيقية من الموديل قبل النتيجة
      await drawFeatures(res.features);
      for (const text of [
        `> ${res.features.length.toLocaleString()} features in ${Math.round(res.featureMs)} ms`,
        `> ${res.trees} decision trees voted in ${res.treeMs.toFixed(1)} ms`,
      ]) {
        const line = document.createElement('div');
        log.appendChild(line);
        await scramble(line, text, 420);
        line.innerHTML += ' <span class="ok">✓</span>';
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    beam.kill();
    showResult(res);
  } catch (err) {
    beam.kill();
    if (handleAuthError(err)) return;
    toast(err.message || 'Analysis failed', 'err');
    scene.setState('idle');
    scene.place(2.6, 0.2, 0.85);
    go('stage-work');
  }
});

// ===== التحليل بالمتصفح =====
async function runOnDevice() {
  const img = $('scanImg');
  try { await img.decode(); } catch { throw new Error('This browser cannot read this image. Try PNG or JPG.'); }
  const r = await analyzeOnDevice(img);
  const malignant = r.probability >= 0.5;
  const label = malignant ? 'Malignant (Suspicious)' : 'Benign';
  const confidence = malignant ? r.probability : 1 - r.probability;
  const pdfBlob = await makeReport({
    name: $('pName').value.trim(), pid: $('pId').value.trim(), age: $('pAge').value || '50',
    side: segValue('side'), view: segValue('view'), label, confidence, model: DEVICE_MODEL,
  });
  return { ...r, malignant, label, confidence, model: DEVICE_MODEL, pdfBlob };
}

// خريطة الـ 1280 خاصية: كل مربع = خاصية وحدة، لمعانه = قوتها
const FEAT_COLS = 80, FEAT_ROWS = 16;
function clearFeatures() {
  const c = $('featCanvas');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}
function drawFeatures(features) {
  const c = $('featCanvas');
  const ctx = c.getContext('2d');
  const cw = c.width / FEAT_COLS, ch = c.height / FEAT_ROWS;
  let max = 0;
  for (const v of features) max = Math.max(max, Math.abs(v));
  const n = Math.min(features.length, FEAT_COLS * FEAT_ROWS);
  const state = { p: 0 };
  return new Promise((resolve) => {
    gsap.to(state, {
      p: 1, duration: 1.3, ease: 'power2.inOut',
      onUpdate() {
        ctx.clearRect(0, 0, c.width, c.height);
        const upto = Math.floor(state.p * n);
        for (let i = 0; i < upto; i++) {
          const v = Math.sqrt(Math.abs(features[i]) / (max || 1));
          const x = (i % FEAT_COLS) * cw, y = Math.floor(i / FEAT_COLS) * ch;
          // من سمائي (ضعيف) إلى وردي (قوي)
          const r = Math.round(63 + (255 - 63) * v), g = Math.round(216 - (216 - 79) * v), b = Math.round(255 - (255 - 154) * v);
          ctx.fillStyle = `rgba(${r},${g},${b},${0.12 + v * 0.88})`;
          ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
        }
      },
      onComplete: resolve,
    });
  });
}

// ===== النتيجة =====
function showResult(res) {
  last = res;
  const cls = res.malignant ? 'malignant' : 'benign';
  const box = $('result');
  box.className = 'result ' + cls;
  $('verdictTag').textContent = res.malignant ? '⚠ Suspicious finding' : '✓ No suspicious finding';
  const words = res.malignant ? 'Malignant' : 'Benign';
  $('saveMsg').textContent = '';
  $('saveBtn').disabled = false;
  $('saveBtn').textContent = 'Save to patient portal';

  const meta = [
    $('pName').value.trim() || 'Unnamed patient',
    'ID ' + ($('pId').value.trim() || '—'),
    'Age ' + ($('pAge').value || '—'),
    segValue('side') + ' · ' + segValue('view'),
    res.model,
  ];
  $('meta').innerHTML = '';
  for (const m of meta) { const s = document.createElement('span'); s.textContent = m; $('meta').appendChild(s); }

  scene.setState(cls);
  scene.place(2.2, 0, 1.25);
  go('stage-result', {
    onEnter() {
      const chars = splitChars($('verdict'), words);
      gsap.from(chars, { yPercent: 120, opacity: 0, rotateX: -90, duration: 1.1, ease: 'expo.out', stagger: 0.05, delay: 0.25 });
      const pct = { v: 0 };
      gsap.to(pct, {
        v: res.confidence * 100, duration: 1.8, ease: 'power3.out', delay: 0.4,
        onUpdate: () => { $('confNum').textContent = pct.v.toFixed(1) + '%'; },
      });
      gsap.fromTo('#confBar', { width: '0%' }, { width: (res.confidence * 100).toFixed(1) + '%', duration: 1.8, ease: 'power3.out', delay: 0.4 });
    },
  });
}

$('download').addEventListener('click', () => {
  if (!last) return;
  const name = `report_${$('pId').value.trim() || 'case'}.pdf`;
  if (last.pdfBlob) { downloadBlob(last.pdfBlob, name); return; }
  const bytes = Uint8Array.from(atob(last.pdf), (c) => c.charCodeAt(0));
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
});

$('saveBtn').addEventListener('click', async () => {
  if (!last) return;
  const msg = $('saveMsg');
  try {
    await api(`/api/analyses/${last.analysis_id}/save`, { method: 'POST', token });
    msg.className = 'msg ok';
    msg.textContent = 'Saved. The patient can now open this report in the portal.';
    $('saveBtn').disabled = true;
    $('saveBtn').textContent = 'Saved ✓';
  } catch (err) {
    if (handleAuthError(err)) return;
    msg.className = 'msg err';
    msg.textContent = err.message;
  }
});

$('again').addEventListener('click', () => {
  file = null; last = null;
  $('file').value = '';
  drop.querySelector('img')?.remove();
  $('analyze').disabled = true;
  scene.setState('idle');
  scene.place(2.6, 0.2, 0.85);
  go('stage-work');
});

// ===== درج التسجيل =====
function drawer(open) {
  gsap.to('#drawer', { x: open ? '0%' : '100%', duration: 0.7, ease: 'expo.inOut' });
  gsap.to('#scrim', { autoAlpha: open ? 1 : 0, duration: 0.5 });
  if (open) {
    gsap.from('#regForm > *', { x: 40, opacity: 0, stagger: 0.05, duration: 0.6, ease: 'expo.out', delay: 0.25 });
    setTimeout(() => $('rName').focus(), 400);
  }
}
$('openRegister').addEventListener('click', () => drawer(true));
$('closeRegister').addEventListener('click', () => drawer(false));
$('scrim').addEventListener('click', () => drawer(false));
addEventListener('keydown', (e) => { if (e.key === 'Escape') drawer(false); });

$('regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('regMsg');
  try {
    await api('/api/patients', {
      method: 'POST', token,
      body: { full_name: $('rName').value.trim(), patient_id: $('rId').value.trim(), password: $('rPass').value },
    });
    msg.className = 'msg ok';
    msg.textContent = `Account created for ${$('rName').value.trim()}.`;
    if (!$('pId').value) { $('pId').value = $('rId').value.trim(); $('pName').value = $('rName').value.trim(); }
    e.target.reset();
  } catch (err) {
    if (handleAuthError(err)) { drawer(false); return; }
    msg.className = 'msg err';
    msg.textContent = err.message;
  }
});

boot();
