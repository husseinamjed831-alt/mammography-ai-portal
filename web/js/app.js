// واجهة الطبيب: مقدمة → مساحة العمل → المسح → النتيجة
import { createScene } from './scene.js';
import { go, splitChars, scramble, toast, api, downloadBlob, storage } from './ui.js';
import { loadModel, analyze as analyzeOnDevice } from './ondevice.js';
import { makeReport } from './report.js';
import { createSections } from './sections.js';
import { initStore, addScan, makeThumb, findByPid } from './store.js';

const gsap = window.gsap;
const $ = (id) => document.getElementById(id);
const scene = createScene($('gl'), $('hud'));
let downloads = null;

let token = storage('doctorToken') || '';
// server: التحليل على السيرفر (server.py) — device: بدون سيرفر، الموديل يشتغل بالمتصفح
let MODE = 'server';
const DEVICE_MODEL = 'EfficientNetB0 + XGBoost (on-device)';
let file = null;
let last = null;

// ===== التبويبات =====
const sections = createSections({
  scene,
  onNewScan(p) {
    $('pName').value = p.name || '';
    $('pId').value = p.pid || '';
    if (p.age) $('pAge').value = p.age;
    resetScan();
    openWork();
  },
});

function setTab(name) {
  const tabs = $('tabs');
  let active = null;
  tabs.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('on', on);
    if (on) { active = b; b.setAttribute('aria-current', 'page'); } else b.removeAttribute('aria-current');
  });
  if (active) gsap.to('#tabInk', { x: active.offsetLeft, width: active.offsetWidth, duration: 0.8, ease: 'expo.inOut' });
}
addEventListener('resize', () => setTab(document.querySelector('#tabs button.on')?.dataset.tab));

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.classList.contains('on') && b.dataset.tab !== 'patients') return;
  const tab = b.dataset.tab;
  setTab(tab);
  if (tab === 'analyze') {
    if (last) showLastResult(); else if (file) openWork(); else showIntro();
  } else if (tab === 'devices') sections.showDevices();
  else if (tab === 'guide') sections.showGuide();
  else if (tab === 'patients') sections.showPatients();
});

// ===== البداية =====
async function boot() {
  initStore();
  window.claude?.use?.('downloads').then((d) => { downloads = d; }).catch(() => {});
  let cfg = { doctor_auth: false };
  try {
    cfg = await api('/api/config');
    api('/api/model').then((m) => { $('modelName').textContent = m.name.split(' ')[0]; }).catch(() => {});
  } catch {
    setupDevice();
  }

  if (cfg.doctor_auth && !token) {
    $('tabs').hidden = true;
    scene.place(0, 0, 0.9);
    go('stage-lock');
  } else {
    showIntro();
  }
  requestAnimationFrame(() => setTab('analyze'));
}

function setupDevice() {
  MODE = 'device';
  $('modeBadge').hidden = false;
  $('portalLink').hidden = true;
  $('saveBtn').hidden = true;
  $('download').innerHTML = 'View report <span class="arrow">→</span>';
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
  $('tabs').hidden = false;
  setTab('analyze');
  scene.morph('orb');
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
    $('tabs').hidden = true;
    scene.place(0, 0, 0.9);
    go('stage-lock');
    return true;
  }
  return false;
}

// ===== مساحة العمل =====
function openWork() {
  setTab('analyze');
  scene.morph('orb');
  scene.setState('idle');
  scene.place(2.6, 0.2, 0.85);
  return go('stage-work');
}
$('begin').addEventListener('click', openWork);

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
  scene.morph('orb');
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
  r.thumb = makeThumb(img);
  const malignant = r.probability >= 0.5;
  const label = malignant ? 'Malignant (Suspicious)' : 'Benign';
  const confidence = malignant ? r.probability : 1 - r.probability;
  return { ...r, malignant, label, confidence, model: DEVICE_MODEL };
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
function showLastResult() {
  const cls = last.malignant ? 'malignant' : 'benign';
  scene.morph('orb');
  scene.setState(cls);
  scene.place(2.2, 0, 1.25);
  return go('stage-result');
}

function showResult(res) {
  last = res;
  if (!last.thumb) { try { last.thumb = makeThumb($('scanImg')); } catch { /* الصورة ما تنقرأ */ } }
  $('profileBtn').disabled = false;
  $('profileBtn').textContent = findByPid($('pId').value.trim()) ? 'Add to patient profile' : 'Save to patient profile';
  delete $('profileBtn').dataset.open;
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

function patientInfo() {
  return {
    name: $('pName').value.trim(), pid: $('pId').value.trim(), age: $('pAge').value || '50',
    side: segValue('side'), view: segValue('view'),
  };
}

// بالنسخة اللي تشتغل بالمتصفح نعرض التقرير داخل الصفحة، وتنزيل الـ PDF إذا الصفحة مو داخل إطار
function openSheet() {
  const p = patientInfo();
  const pct = (last.confidence * 100).toFixed(1) + '%';
  $('sheetDate').textContent = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const dl = $('sheetPatient');
  dl.innerHTML = '';
  for (const [k, v] of [['Full name', p.name || '—'], ['Patient ID', p.pid || '—'], ['Age', p.age], ['Breast side', p.side], ['View', p.view]]) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  $('sheetResult').textContent = 'Classification: ' + last.label;
  $('sheetResult').className = 'sheet-result ' + (last.malignant ? 'm' : 'b');
  $('sheetConf').textContent = 'Model confidence: ' + pct;
  $('sheetSummary').textContent = `The automated analysis classified the uploaded mammogram as '${last.label}' with a model confidence of ${pct}. This output is produced by an AI-based screening model (${last.model}).`;
  $('sheetPdf').hidden = !downloads && window.self !== window.top;
  $('sheet').hidden = false;
  gsap.fromTo('#sheet', { opacity: 0 }, { opacity: 1, duration: 0.4 });
  gsap.fromTo('.sheet', { y: 60, rotateX: 12, opacity: 0 }, { y: 0, rotateX: 0, opacity: 1, duration: 0.8, ease: 'expo.out' });
  $('sheetClose').focus();
}
function closeSheet() {
  gsap.to('#sheet', { opacity: 0, duration: 0.3, onComplete: () => { $('sheet').hidden = true; } });
}
$('sheetClose').addEventListener('click', closeSheet);
$('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });
$('sheetPdf').addEventListener('click', async () => {
  try {
    const blob = await makeReport({ ...patientInfo(), label: last.label, confidence: last.confidence, model: last.model });
    const filename = `report_${$('pId').value.trim() || 'case'}.pdf`;
    if (downloads) await downloads.save({ filename, data: blob });
    else downloadBlob(blob, filename);
  } catch (err) {
    if (err?.code === 'declined') return;
    toast(err?.message || 'Could not create the PDF.', 'err');
  }
});

$('download').addEventListener('click', () => {
  if (!last) return;
  if (MODE === 'device') { openSheet(); return; }
  const name = `report_${$('pId').value.trim() || 'case'}.pdf`;
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

function resetScan() {
  file = null; last = null;
  $('file').value = '';
  drop.querySelector('img')?.remove();
  $('analyze').disabled = true;
}
$('again').addEventListener('click', () => { resetScan(); openWork(); });

// ===== حفظ النتيجة بملف المريضة =====
$('profileBtn').addEventListener('click', async () => {
  const btn = $('profileBtn');
  if (btn.dataset.open) { setTab('patients'); sections.showProfile(btn.dataset.open); return; }
  const pid = $('pId').value.trim();
  if (!pid || !last) {
    $('saveMsg').className = 'msg err';
    $('saveMsg').textContent = 'Enter a Patient ID on the previous step to save this result to a profile.';
    return;
  }
  btn.disabled = true;
  try {
    const p = await addScan(pid, {
      prob: last.probability, conf: last.confidence, label: last.label, malignant: !!last.malignant,
      side: segValue('side'), view: segValue('view'), model: last.model, thumb: last.thumb || '',
    }, { name: $('pName').value.trim(), age: $('pAge').value });
    btn.dataset.open = p.id;
    btn.innerHTML = 'Open profile <span class="arrow">→</span>';
    $('saveMsg').className = 'msg ok';
    $('saveMsg').textContent = `Saved to ${p.name}'s profile.`;
  } catch (err) {
    $('saveMsg').className = 'msg err';
    $('saveMsg').textContent = err.message;
  } finally { btn.disabled = false; }
});

// ===== عارض الدقة الكاملة (حتى 4K وأكثر) =====
const view = { s: 1, x: 0, y: 0, min: 1 };
const vImg = $('viewerImg'), vStage = $('viewerStage');
function applyView() { vImg.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`; }
function fitView() {
  const w = vStage.clientWidth, h = vStage.clientHeight;
  const s = Math.min(w / vImg.naturalWidth, h / vImg.naturalHeight);
  view.min = Math.min(s, 1);
  view.s = s; view.x = (w - vImg.naturalWidth * s) / 2; view.y = (h - vImg.naturalHeight * s) / 2;
  applyView();
}
function zoomAt(cx, cy, factor) {
  const s = Math.min(Math.max(view.s * factor, view.min), 8);
  const k = s / view.s;
  view.x = cx - (cx - view.x) * k; view.y = cy - (cy - view.y) * k; view.s = s;
  applyView();
}
$('inspectBtn').addEventListener('click', async () => {
  vImg.src = $('scanImg').src;
  try { await vImg.decode(); } catch { toast('This image cannot be displayed in the browser.', 'err'); return; }
  const w = vImg.naturalWidth, h = vImg.naturalHeight;
  const tier = Math.max(w, h) >= 3840 ? ' · 4K+' : '';
  $('viewerInfo').textContent = `${w} × ${h} px · ${(w * h / 1e6).toFixed(1)} MP${tier} · native resolution`;
  $('viewer').hidden = false;
  fitView();
  gsap.fromTo('#viewer', { opacity: 0 }, { opacity: 1, duration: 0.5 });
  gsap.fromTo(vImg, { opacity: 0, filter: 'blur(30px)' }, { opacity: 1, filter: 'blur(0px)', duration: 1.2, ease: 'expo.out' });
  $('viewerClose').focus();
});
$('viewerReset').addEventListener('click', fitView);
$('viewerClose').addEventListener('click', () => gsap.to('#viewer', { opacity: 0, duration: 0.35, onComplete: () => { $('viewer').hidden = true; } }));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('viewer').hidden) $('viewerClose').click(); });
vStage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = vStage.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
const pointers = new Map();
let pinch = 0;
vStage.addEventListener('pointerdown', (e) => { vStage.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
vStage.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const r = vStage.getBoundingClientRect();
    if (pinch) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, dist / pinch);
    pinch = dist;
  } else {
    view.x += e.clientX - prev.x; view.y += e.clientY - prev.y;
    applyView();
  }
});
const endPointer = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; };
vStage.addEventListener('pointerup', endPointer);
vStage.addEventListener('pointercancel', endPointer);
vStage.addEventListener('dblclick', (e) => { const r = vStage.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 2); });

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
