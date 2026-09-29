// واجهة الطبيب: مقدمة → مساحة العمل → المسح → النتيجة، + الأقسام (المرضى، الأجهزة، الإرشادات)
import { t, applyStatic, setLang, getLang, isRTL, locale, onLang } from './i18n.js';
import { createScene } from './scene.js';
import { go, splitChars, scramble, toast, api, downloadBlob, storage } from './ui.js';
import { loadModel, analyze as analyzeOnDevice, explain, drawHeat } from './ondevice.js';
import { makeReport } from './report.js';
import { createSections } from './sections.js';
import { initStore, addScan, makeThumb, findByPid } from './store.js';

applyStatic();

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
let modelState = 'loading';

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
  let active = null;
  $('tabs').querySelectorAll('button').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('on', on);
    if (on) { active = b; b.setAttribute('aria-current', 'page'); } else b.removeAttribute('aria-current');
  });
  if (active) gsap.to('#tabInk', { x: active.offsetLeft, width: active.offsetWidth, duration: 0.8, ease: 'expo.inOut' });
}
const currentTab = () => document.querySelector('#tabs button.on')?.dataset.tab;
addEventListener('resize', () => setTab(currentTab()));

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || (b.classList.contains('on') && b.dataset.tab !== 'patients')) return;
  const tab = b.dataset.tab;
  setTab(tab);
  if (tab === 'analyze') {
    if (last) showLastResult(); else if (file) openWork(); else showIntro();
  } else if (tab === 'devices') sections.showDevices();
  else if (tab === 'guide') sections.showGuide();
  else if (tab === 'patients') sections.showPatients();
});

// ===== اللغة =====
$('langBtn').addEventListener('click', () => {
  const next = getLang() === 'ar' ? 'en' : 'ar';
  // وميض خفيف والجسيمات تنفجر وقت التبديل
  gsap.timeline()
    .to('.stage.active, .topbar', { opacity: 0, filter: 'blur(10px)', duration: 0.35, ease: 'power2.in' })
    .add(() => { setLang(next); scene.burst(); })
    .to('.stage.active, .topbar', { opacity: 1, filter: 'blur(0px)', duration: 0.7, ease: 'expo.out', clearProps: 'filter' });
});
onLang(() => {
  scene.refreshPlace();
  setTab(currentTab());
  refreshModelLabel();
  if (MODE === 'device') $('downloadLabel').textContent = t('res.view');
  if (last) renderResultText(last, false);
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

function refreshModelLabel() {
  if (MODE !== 'device') return;
  if (modelState === 'ready') $('modelName').textContent = t('model.ready');
  else if (modelState === 'offline') $('modelName').textContent = t('model.offline');
}

function setupDevice() {
  MODE = 'device';
  $('modeBadge').hidden = false;
  $('portalLink').hidden = true;
  $('saveBtn').hidden = true;
  $('downloadLabel').dataset.i18n = 'res.view';
  $('downloadLabel').textContent = t('res.view');
  const label = $('modelName');
  label.textContent = '0%';
  loadModel((p) => { if (modelState === 'loading') label.textContent = Math.round(p * 100) + '%'; })
    .then(() => {
      modelState = 'ready';
      refreshModelLabel();
      gsap.fromTo(label, { color: '#27f5b0' }, { color: '#eef3ff', duration: 2 });
    })
    .catch(() => { modelState = 'offline'; refreshModelLabel(); toast(t('model.loadErr'), 'err'); });
}

function showIntro() {
  $('openRegister').hidden = MODE === 'device';
  $('tabs').hidden = false;
  setTab('analyze');
  scene.morph('breast');
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
    toast(t('auth.expired'), 'err');
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
  scene.morph('breast');
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
// القيمة الإنكليزية الثابتة (Right/Left/CC/MLO) بغض النظر عن لغة الواجهة
const segValue = (name) => document.querySelector(`.seg[data-name="${name}"] .on`).dataset.value;
const sideText = () => t('side.' + segValue('side'));

const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
$('file').addEventListener('change', (e) => { if (e.target.files[0]) setFile(e.target.files[0]); });

function setFile(f) {
  if (!f.type.startsWith('image/') && !/\.(tif|tiff|png|jpe?g)$/i.test(f.name)) {
    toast(t('work.notImage'), 'err');
    return;
  }
  file = f;
  const url = URL.createObjectURL(f);
  let img = drop.querySelector('img');
  if (!img) { img = document.createElement('img'); drop.appendChild(img); }
  img.alt = t('work.uploaded');
  img.src = url;
  $('scanImg').src = url;
  gsap.fromTo(img, { scale: 1.15, opacity: 0, filter: 'blur(20px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 1, ease: 'expo.out' });
  $('analyze').disabled = false;
  scene.burst();
}

// ===== المسح =====
const STEPS = ['scan.s1', 'scan.s2', 'scan.s3', 'scan.s4', 'scan.s5'];

async function logLine(text, ms = 420) {
  const line = document.createElement('div');
  $('scanLog').appendChild(line);
  await scramble(line, `> ${text}`, ms);
  line.innerHTML += ' <span class="ok">✓</span>';
}

// مكان الصورة داخل الإطار (object-fit: contain) حتى الخريطة تنطبق عليها بالضبط
function containRect(img, box) {
  const bw = box.clientWidth, bh = box.clientHeight;
  const s = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

function paintScanHeat(heat, reveal = true) {
  const frame = $('scanFrame'), c = $('scanHeat'), img = $('scanImg');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = frame.clientWidth * dpr; c.height = frame.clientHeight * dpr;
  const r = containRect(img, frame);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.translate(r.x * dpr, r.y * dpr);
  drawHeat(ctx, heat, r.w * dpr, r.h * dpr);
  ctx.restore();
  if (reveal) gsap.fromTo(c, { opacity: 0, clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, clipPath: 'inset(0 0 0% 0)', duration: 1.4, ease: 'power2.inOut' });
}

$('analyze').addEventListener('click', async () => {
  if (!file) return;
  scene.morph('breast');
  scene.place(0, 0, 1.12);
  scene.setState('scan');
  gsap.set('#scanHeat', { opacity: 0 });
  await go('stage-scan');

  const beam = gsap.fromTo('.scan-frame .beam', { top: '-120px' }, { top: '100%', duration: 1.6, ease: 'sine.inOut', repeat: -1, yoyo: true });
  $('scanLog').innerHTML = '';
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
      await logLine(t(STEPS[i]), 380);
      gsap.to('#scanBar', { width: `${((i + 1) / STEPS.length) * 70}%`, duration: 0.4 });
      await new Promise((r) => setTimeout(r, 180));
    }
  })();

  try {
    const [res] = await Promise.all([request, shown]);
    if (MODE === 'device') {
      // الأرقام الحقيقية من الموديل
      await drawFeatures(res.features);
      await logLine(t('scan.features', { n: res.features.length.toLocaleString(), ms: Math.round(res.featureMs) }));
      await logLine(t('scan.trees', { n: res.trees, ms: res.treeMs.toFixed(1) }));
      // خريطة الانتباه: نغطي كل منطقة ونشوف شكد تتغير النتيجة
      try {
        // على أجهزة بدون كرت شاشة (WebGL) الخريطة تاخذ وقت طويل، فنتجاوزها
        const { backend } = await loadModel();
        if (backend !== 'webgl') throw new Error('skip');
        const ex = await explain($('scanImg'), res.probability, (p) => gsap.to('#scanBar', { width: `${70 + p * 30}%`, duration: 0.3 }));
        res.heat = ex.heat;
        paintScanHeat(ex.heat);
        await logLine(t('scan.attn', { n: ex.probes, ms: Math.round(ex.ms) }));
      } catch { /* الخريطة إضافة، إذا فشلت نكمل بدونها */ }
      await new Promise((r) => setTimeout(r, 1400));
    }
    gsap.to('#scanBar', { width: '100%', duration: 0.3 });
    beam.kill();
    showResult(res);
  } catch (err) {
    beam.kill();
    if (handleAuthError(err)) return;
    toast(err.message || t('scan.failed'), 'err');
    scene.setState('idle');
    scene.place(2.6, 0.2, 0.85);
    go('stage-work');
  }
});

// ===== التحليل بالمتصفح =====
async function runOnDevice() {
  const img = $('scanImg');
  try { await img.decode(); } catch { throw new Error(t('scan.cantRead')); }
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
  scene.morph('breast');
  scene.setState(cls);
  scene.place(2.3, 0, 1.05);
  return go('stage-result');
}

// نصوص النتيجة (تنعاد لما تتغير اللغة)
function renderResultText(res, fresh) {
  $('verdictTag').textContent = res.malignant ? t('res.suspicious') : t('res.clear');
  if (!fresh) $('verdict').textContent = res.malignant ? t('res.malignant') : t('res.benign');
  const btn = $('profileBtn');
  if (btn.dataset.open) btn.innerHTML = `${t('res.openProfile')} <span class="arrow">→</span>`;
  else btn.textContent = findByPid($('pId').value.trim()) ? t('res.addProfile') : t('res.saveProfile');
  const meta = [
    $('pName').value.trim() || t('res.unnamed'),
    t('res.id', { v: $('pId').value.trim() || '—' }),
    t('res.age', { v: $('pAge').value || '—' }),
    sideText() + ' · ' + segValue('view'),
    res.model,
  ];
  $('meta').innerHTML = '';
  for (const m of meta) { const s = document.createElement('span'); s.textContent = m; $('meta').appendChild(s); }
}

function showResult(res) {
  last = res;
  if (!last.thumb) { try { last.thumb = makeThumb($('scanImg')); } catch { /* الصورة ما تنقرأ */ } }
  $('profileBtn').disabled = false;
  delete $('profileBtn').dataset.open;
  const cls = res.malignant ? 'malignant' : 'benign';
  $('result').className = 'result ' + cls;
  $('saveMsg').textContent = '';
  $('saveBtn').disabled = false;
  $('saveBtn').textContent = t('res.savePortal');
  renderResultText(res, true);

  // خريطة الانتباه المصغرة
  const hasHeat = Array.isArray(res.heat);
  $('attn').hidden = !hasHeat;
  $('viewerHeat').hidden = !hasHeat;
  if (hasHeat) {
    const img = $('attnImg');
    img.src = $('scanImg').src;
    img.alt = t('attn.title');
    img.decode().then(() => {
      const c = $('attnHeat');
      c.width = img.naturalWidth > 600 ? 600 : img.naturalWidth;
      c.height = Math.round(c.width * img.naturalHeight / img.naturalWidth);
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      drawHeat(ctx, res.heat, c.width, c.height);
    }).catch(() => {});
  }

  scene.setState(cls);
  scene.place(2.3, 0, 1.05);
  go('stage-result', {
    onEnter() {
      const chars = splitChars($('verdict'), res.malignant ? t('res.malignant') : t('res.benign'));
      gsap.from(chars, { yPercent: 120, opacity: 0, rotateX: -90, duration: 1.1, ease: 'expo.out', stagger: 0.05, delay: 0.25 });
      const pct = { v: 0 };
      gsap.to(pct, {
        v: res.confidence * 100, duration: 1.8, ease: 'power3.out', delay: 0.4,
        onUpdate: () => { $('confNum').textContent = pct.v.toFixed(1) + '%'; },
      });
      gsap.fromTo('#confBar', { width: '0%' }, { width: (res.confidence * 100).toFixed(1) + '%', duration: 1.8, ease: 'power3.out', delay: 0.4 });
      if (hasHeat) gsap.fromTo('#attnHeat', { opacity: 0 }, { opacity: 1, duration: 1.6, delay: 1, ease: 'power2.inOut' });
    },
  });
}

function patientInfo() {
  return {
    name: $('pName').value.trim(), pid: $('pId').value.trim(), age: $('pAge').value || '50',
    side: segValue('side'), view: segValue('view'),
  };
}

// التقرير داخل الصفحة، وتنزيل الـ PDF إذا متاح
function openSheet() {
  const p = patientInfo();
  const pct = (last.confidence * 100).toFixed(1) + '%';
  const label = last.malignant ? t('res.labelM') : t('res.labelB');
  $('sheetDate').textContent = new Date().toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
  const dl = $('sheetPatient');
  dl.innerHTML = '';
  for (const [k, v] of [[t('f.name'), p.name || '—'], [t('f.pid'), p.pid || '—'], [t('f.age'), p.age], [t('f.side'), sideText()], [t('f.view'), p.view]]) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  $('sheetResult').textContent = t('sheet.class', { v: label });
  $('sheetResult').className = 'sheet-result ' + (last.malignant ? 'm' : 'b');
  $('sheetConf').textContent = t('sheet.conf', { v: pct });
  $('sheetSummary').textContent = t('sheet.sumText', { label, pct, model: last.model });
  const canPdf = !!downloads || window.self === window.top;
  $('sheetPdf').hidden = !canPdf;
  $('pdfNote').hidden = !canPdf || getLang() !== 'ar';
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
    toast(err?.message || t('sheet.pdfErr'), 'err');
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
    msg.textContent = t('res.portalSaved');
    $('saveBtn').disabled = true;
    $('saveBtn').textContent = t('res.saved');
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
    $('saveMsg').textContent = t('res.needPid');
    return;
  }
  btn.disabled = true;
  try {
    const p = await addScan(pid, {
      prob: last.probability, conf: last.confidence, label: last.label, malignant: !!last.malignant,
      side: segValue('side'), view: segValue('view'), model: last.model, thumb: last.thumb || '',
      heat: last.heat || null,
    }, { name: $('pName').value.trim(), age: $('pAge').value });
    btn.dataset.open = p.id;
    btn.innerHTML = `${t('res.openProfile')} <span class="arrow">→</span>`;
    $('saveMsg').className = 'msg ok';
    $('saveMsg').textContent = t('res.savedTo', { name: p.name });
  } catch (err) {
    $('saveMsg').className = 'msg err';
    $('saveMsg').textContent = err.message;
  } finally { btn.disabled = false; }
});

// ===== عارض الدقة الكاملة (حتى 4K وأكثر) مع خريطة الانتباه =====
const view = { s: 1, x: 0, y: 0, min: 1 };
const vImg = $('viewerImg'), vStage = $('viewerStage'), vHeat = $('viewerHeatLayer');
function applyView() {
  const tf = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
  vImg.style.transform = tf;
  vHeat.style.transform = tf;
}
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
function setViewerHeat(on) {
  $('viewerHeat').setAttribute('aria-pressed', on);
  $('viewerHeat').classList.toggle('on', on);
  vHeat.hidden = !on;
  if (on) gsap.fromTo(vHeat, { opacity: 0 }, { opacity: 1, duration: 0.8 });
}
async function openViewer(withHeat) {
  vImg.src = $('scanImg').src;
  try { await vImg.decode(); } catch { toast(t('view.cant'), 'err'); return; }
  const w = vImg.naturalWidth, h = vImg.naturalHeight;
  const tier = Math.max(w, h) >= 3840 ? ' · 4K+' : '';
  $('viewerInfo').textContent = t('view.info', { w, h, mp: (w * h / 1e6).toFixed(1), tier });
  if (last?.heat) {
    // الخريطة بحجم الصورة الأصلي (بحد أقصى 2048) وتتكبر وياها
    const s = Math.min(1, 2048 / Math.max(w, h));
    vHeat.width = Math.round(w * s); vHeat.height = Math.round(h * s);
    vHeat.style.width = w + 'px'; vHeat.style.height = h + 'px';
    const ctx = vHeat.getContext('2d');
    ctx.clearRect(0, 0, vHeat.width, vHeat.height);
    drawHeat(ctx, last.heat, vHeat.width, vHeat.height);
  }
  $('viewer').hidden = false;
  fitView();
  setViewerHeat(!!withHeat && !!last?.heat);
  gsap.fromTo('#viewer', { opacity: 0 }, { opacity: 1, duration: 0.5 });
  gsap.fromTo(vImg, { opacity: 0, filter: 'blur(30px)' }, { opacity: 1, filter: 'blur(0px)', duration: 1.2, ease: 'expo.out' });
  $('viewerClose').focus();
}
$('inspectBtn').addEventListener('click', () => openViewer(false));
$('attnOpen').addEventListener('click', () => openViewer(true));
$('viewerHeat').addEventListener('click', () => setViewerHeat(vHeat.hidden));
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

// ===== درج التسجيل (نسخة السيرفر) =====
function drawer(open) {
  gsap.to('#drawer', { x: open ? '0%' : '100%', duration: 0.7, ease: 'expo.inOut' });
  gsap.to('#scrim', { autoAlpha: open ? 1 : 0, duration: 0.5 });
  if (open) {
    gsap.from('#regForm > *', { x: isRTL() ? -40 : 40, opacity: 0, stagger: 0.05, duration: 0.6, ease: 'expo.out', delay: 0.25 });
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
    msg.textContent = t('reg.done', { name: $('rName').value.trim() });
    if (!$('pId').value) { $('pId').value = $('rId').value.trim(); $('pName').value = $('rName').value.trim(); }
    e.target.reset();
  } catch (err) {
    if (handleAuthError(err)) { drawer(false); return; }
    msg.className = 'msg err';
    msg.textContent = err.message;
  }
});

boot();
