// الأقسام: الأجهزة، إرشادات FDA، المرضى، ملف المريضة (بالإنكليزي والعربي)
import { DEVICES, GUIDANCE } from './content.js';
import { go, splitChars, toast } from './ui.js';
import { t, pick, locale, onLang } from './i18n.js';
import { drawHeat } from './ondevice.js';
import { onPatients, getPatient, patients, upsertPatient, updateNotes, deletePatient, storeKind } from './store.js';

const gsap = window.gsap;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const pct = (v) => (v * 100).toFixed(1) + '%';
const fmtDate = (iso, opts = { dateStyle: 'medium' }) => { try { return new Date(iso).toLocaleDateString(locale(), opts); } catch { return ''; } };
// تاريخ للرسم البياني: دائماً بصيغة لاتينية ثابتة حتى ما يتلخبط اتجاهه
const fmtAxisDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch { return ''; } };
const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };
const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const sideLabel = (v) => (v === 'Right' || v === 'Left' ? t('side.' + v) : v);

export function createSections({ scene, onNewScan }) {
  // ===== الأجهزة =====
  let device = DEVICES[0];
  const list = $('devList');

  function renderDeviceList() {
    list.innerHTML = '';
    for (const d of DEVICES) {
      const b = el('button', 'dev-btn' + (d === device ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', d === device);
      b.dataset.id = d.id;
      b.append(el('b', null, d.short), el('small', null, pick(d.tag)));
      b.addEventListener('click', () => selectDevice(d, true));
      list.appendChild(b);
    }
  }

  function renderDevice(d) {
    const card = $('devCard');
    card.innerHTML = '';
    const reg = el('div', 'reg');
    const regText = el('div');
    regText.append(el('span', 'k', t('dev.reg')), document.createTextNode(pick(d.fda) + ' '));
    const a = el('a', 'src', t('dev.src'));
    a.href = d.src; a.target = '_blank'; a.rel = 'noopener';
    regText.appendChild(a);
    reg.append(el('div', 'seal', '✓'), regText);
    const parts = el('div', 'parts');
    for (const p of pick(d.parts)) parts.appendChild(el('span', null, p));
    card.append(
      el('div', 'tag', pick(d.tag)), el('h3', null, pick(d.name)),
      el('span', 'k', t('dev.how')), el('p', null, pick(d.what)),
      el('span', 'k', t('dev.when')), el('p', null, pick(d.use)),
      el('span', 'k', t('dev.parts')), parts, reg,
    );
  }

  function selectDevice(d, animate) {
    device = d;
    list.querySelectorAll('.dev-btn').forEach((b) => {
      const on = b.dataset.id === d.id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
    scene.morph(d.shape);
    if (!animate) { renderDevice(d); return; }
    const card = $('devCard');
    gsap.timeline()
      .to(card.children, { opacity: 0, y: -16, filter: 'blur(8px)', duration: 0.35, stagger: 0.02, ease: 'power2.in' })
      .add(() => renderDevice(d))
      .fromTo(() => card.children, { opacity: 0, y: 26, filter: 'blur(10px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, stagger: 0.05, ease: 'expo.out', clearProps: 'filter,transform' });
  }

  function showDevices() {
    scene.setState('device');
    scene.place(2.3, -0.1, 0.95);
    renderDeviceList();
    selectDevice(device, false);
    return go('stage-devices');
  }

  // ===== الإرشادات =====
  function renderGuide() {
    const phases = $('phases');
    phases.innerHTML = '';
    GUIDANCE.forEach((ph, i) => {
      const sec = el('section', 'phase');
      const h = el('h3');
      h.append(el('span', null, String(i + 1).padStart(2, '0')), document.createTextNode(pick(ph.phase)));
      const tips = el('div', 'tips');
      for (const tip of ph.items) {
        const card = el('article', 'panel tip' + (tip.warn ? ' warn' : ''));
        const a = el('a', 'src', tip.label + ' ↗');
        a.href = tip.src; a.target = '_blank'; a.rel = 'noopener'; a.dir = 'ltr';
        card.append(el('h4', null, pick(tip.title)), el('p', null, pick(tip.body)), a);
        tips.appendChild(card);
      }
      sec.append(h, tips);
      phases.appendChild(sec);
    });
  }
  renderGuide();

  function showGuide() {
    scene.setState('guide');
    scene.morph('shield');
    scene.place(2.9, 0, 0.8);
    return go('stage-guide', {
      onEnter() {
        gsap.fromTo('#phases .tip', { y: 50, opacity: 0, rotateY: -14, transformPerspective: 800 },
          { y: 0, opacity: 1, rotateY: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08, delay: 0.5, clearProps: 'transform' });
      },
    });
  }

  // ===== المرضى =====
  let query = '';
  let openId = null;
  $('patSearch').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); renderGrid(); });
  $('newPatBtn').addEventListener('click', () => {
    const f = $('newPatForm');
    f.hidden = !f.hidden;
    if (!f.hidden) { gsap.from(f, { y: -20, opacity: 0, duration: 0.6, ease: 'expo.out' }); $('npName').focus(); }
  });
  $('npCancel').addEventListener('click', () => { $('newPatForm').hidden = true; });
  $('newPatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = $('npId').value.trim();
    if (getPatient(pid.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_'))) {
      $('npMsg').className = 'msg err'; $('npMsg').textContent = t('pat.exists');
      return;
    }
    try {
      const p = await upsertPatient({ pid, name: $('npName').value.trim(), age: $('npAge').value });
      e.target.reset(); e.target.hidden = true; $('npMsg').textContent = '';
      showProfile(p.id);
    } catch (err) { $('npMsg').className = 'msg err'; $('npMsg').textContent = err.message; }
  });

  function sparkline(scans) {
    const pts = [...scans].reverse().map((s) => s.prob);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 96 28'); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
    if (!pts.length) return svg;
    const xs = (i) => (pts.length === 1 ? 48 : 4 + (i / (pts.length - 1)) * 88);
    const ys = (v) => 24 - v * 20;
    const th = document.createElementNS(svgNS, 'line');
    th.setAttribute('x1', 0); th.setAttribute('x2', 96); th.setAttribute('y1', ys(0.5)); th.setAttribute('y2', ys(0.5));
    th.setAttribute('stroke', 'rgba(255,211,110,.45)'); th.setAttribute('stroke-dasharray', '2 3');
    const line = document.createElementNS(svgNS, 'polyline');
    line.setAttribute('points', pts.map((v, i) => `${xs(i)},${ys(v)}`).join(' '));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#3fd8ff'); line.setAttribute('stroke-width', '1.6');
    const last = document.createElementNS(svgNS, 'circle');
    last.setAttribute('cx', xs(pts.length - 1)); last.setAttribute('cy', ys(pts[pts.length - 1])); last.setAttribute('r', 3);
    last.setAttribute('fill', pts[pts.length - 1] >= 0.5 ? '#ff3b5c' : '#27f5b0');
    svg.append(th, line, last);
    return svg;
  }

  const scanCount = (n) => (n === 1 ? t('pat.scan1') : t('pat.scans', { n }));

  function renderGrid() {
    const grid = $('patGrid');
    grid.innerHTML = '';
    const items = patients().filter((p) => !query || (p.name || '').toLowerCase().includes(query) || String(p.pid).toLowerCase().includes(query));
    if (!items.length) {
      grid.appendChild(el('p', 'empty', query ? t('pat.noMatch') : t('pat.empty')));
      return;
    }
    for (const p of items) {
      const lastScan = p.scans?.[0];
      const card = el('button', 'panel pat-card');
      card.type = 'button';
      const av = el('span', 'mini-av', initials(p.name));
      if (lastScan) av.style.setProperty('--ring', lastScan.malignant ? '#ff3b5c' : '#27f5b0');
      const who = el('div');
      who.append(el('b', null, p.name), el('small', null, p.age ? t('pat.idAge', { id: p.pid, age: p.age }) : t('pat.idOnly', { id: p.pid })));
      const top = el('div', 'pat-top'); top.append(av, who);
      const foot = el('div', 'pat-foot');
      const pill = el('span', 'pill' + (lastScan ? (lastScan.malignant ? ' m' : ' b') : ''),
        lastScan ? (lastScan.malignant ? t('pat.suspicious') : t('pat.benign')) + ' · ' + scanCount(p.scans.length) : t('pat.noScans'));
      foot.append(pill, sparkline(p.scans || []));
      card.append(top, foot);
      card.addEventListener('click', () => showProfile(p.id));
      grid.appendChild(card);
    }
  }

  function storeLabel() {
    $('storeLabel').textContent = storeKind() === 'cloud' ? t('pat.cloud') : t('pat.local');
  }

  function showPatients() {
    openId = null;
    storeLabel();
    scene.setState('profile');
    scene.morph('helix');
    scene.place(2.9, 0, 0.85);
    renderGrid();
    return go('stage-patients', {
      onEnter() {
        gsap.fromTo('#patGrid > *', { y: 40, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 1, ease: 'expo.out', stagger: 0.06, delay: 0.6, clearProps: 'transform' });
      },
    });
  }

  // ===== ملف المريضة =====
  function chart(scans) {
    const pts = [...scans].reverse();
    const W = 640, H = 220, L = 40, R = 16, T = 14, B = 30;
    const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + (i / (pts.length - 1)) * (W - L - R));
    const y = (v) => T + (1 - v) * (H - T - B);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('prof.chartAria'));
    svg.setAttribute('direction', 'ltr');
    svg.style.direction = 'ltr';
    svg.style.unicodeBidi = 'isolate';
    const add = (tag, attrs, text) => {
      const n = document.createElementNS(svgNS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      svg.appendChild(n);
      return n;
    };
    const defs = add('defs', {});
    const g = document.createElementNS(svgNS, 'linearGradient');
    g.id = 'area'; g.setAttribute('x1', 0); g.setAttribute('y1', 0); g.setAttribute('x2', 0); g.setAttribute('y2', 1);
    for (const [o, c, a] of [['0', '#3fd8ff', '.35'], ['1', '#3fd8ff', '0']]) {
      const s = document.createElementNS(svgNS, 'stop');
      s.setAttribute('offset', o); s.setAttribute('stop-color', c); s.setAttribute('stop-opacity', a); g.appendChild(s);
    }
    defs.appendChild(g);
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      add('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'rgba(160,190,255,.1)' });
      add('text', { x: L - 8, y: y(v) + 3, 'text-anchor': 'end', class: 'axis' }, Math.round(v * 100) + '%');
    }
    add('line', { x1: L, x2: W - R, y1: y(0.5), y2: y(0.5), stroke: '#ffd36e', 'stroke-dasharray': '5 5', 'stroke-opacity': '.7' });
    if (!pts.length) {
      add('text', { x: (L + W - R) / 2, y: H / 2, 'text-anchor': 'middle', class: 'axis' }, t('pat.noScans'));
      return svg;
    }
    const d = pts.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s.prob)}`).join(' ');
    if (pts.length > 1) add('path', { d: `${d} L${x(pts.length - 1)},${y(0)} L${x(0)},${y(0)} Z`, fill: 'url(#area)' });
    const path = add('path', { d, fill: 'none', stroke: '#3fd8ff', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
    pts.forEach((s, i) => {
      const lastOne = i === pts.length - 1;
      add('circle', { cx: x(i), cy: y(s.prob), r: lastOne ? 6 : 4, fill: s.malignant ? '#ff3b5c' : '#27f5b0', stroke: '#04060d', 'stroke-width': 2 });
      if (lastOne) add('text', { x: Math.min(x(i), W - R - 30), y: y(s.prob) - 12, 'text-anchor': 'middle', fill: '#eef3ff', 'font-size': 12, 'font-weight': 600 }, pct(s.prob));
    });
    add('text', { x: x(0), y: H - 8, 'text-anchor': pts.length === 1 ? 'middle' : 'start', class: 'axis' }, fmtAxisDate(pts[0].at));
    if (pts.length > 1) add('text', { x: x(pts.length - 1), y: H - 8, 'text-anchor': 'end', class: 'axis' }, fmtAxisDate(pts[pts.length - 1].at));
    requestAnimationFrame(() => {
      try {
        const len = path.getTotalLength();
        gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 2, ease: 'power2.inOut', delay: 0.9 });
      } catch { /* SVG مخفي */ }
    });
    return svg;
  }

  // صورة مصغرة + خريطة الانتباه فوقها (إذا محفوظة)
  function scanFigure(s) {
    const item = el('figure', 'scan-item');
    if (s.thumb) {
      const wrap = el('div', 'thumb');
      const img = el('img');
      img.src = s.thumb;
      img.alt = `${sideLabel(s.side)} ${s.view}`;
      wrap.appendChild(img);
      if (Array.isArray(s.heat) && s.heat.length) {
        const c = el('canvas', 'heat');
        img.decode().then(() => {
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          drawHeat(c.getContext('2d'), s.heat, c.width, c.height);
        }).catch(() => {});
        wrap.appendChild(c);
      }
      item.appendChild(wrap);
    }
    const cap = el('div');
    cap.append(el('b', s.malignant ? 'm' : 'b', `${s.malignant ? t('pat.suspicious') : t('pat.benign')} · ${pct(s.conf)}`),
      el('small', null, `${sideLabel(s.side)} ${s.view} · ${fmtDateTime(s.at)}`));
    item.appendChild(cap);
    return item;
  }

  function renderProfile(p) {
    const scans = p.scans || [];
    const lastScan = scans[0];
    $('profInitials').textContent = initials(p.name);
    const av = $('profAvatar');
    av.style.setProperty('--ring', lastScan ? (lastScan.malignant ? '#ff3b5c' : '#27f5b0') : '#3fd8ff');
    $('profEyebrow').textContent = t('prof.pid', { v: p.pid });
    const meta = $('profMeta');
    meta.innerHTML = '';
    for (const m of [p.age ? t('prof.age', { v: p.age }) : t('prof.noAge'), scanCount(scans.length), t('prof.since', { v: fmtDate(p.createdAt) })]) meta.appendChild(el('span', null, m));

    const tiles = $('profTiles');
    tiles.innerHTML = '';
    const maxScan = scans.reduce((m, s) => (!m || s.prob > m.prob ? s : m), null);
    const tile = (k, v, cls = '') => { const tl = el('div', 'panel tile'); tl.append(el('div', 'k', k), el('div', 'v ' + cls, v)); tiles.appendChild(tl); };
    tile(t('prof.latest'), lastScan ? (lastScan.malignant ? t('pat.suspicious') : t('pat.benign')) : '—', lastScan ? (lastScan.malignant ? 'm' : 'b') : '');
    tile(t('prof.latestScore'), lastScan ? pct(lastScan.prob) : '—');
    tile(t('prof.highest'), maxScan ? pct(maxScan.prob) : '—', maxScan ? (maxScan.malignant ? 'm' : 'b') : '');
    tile(t('prof.last'), lastScan ? fmtDate(lastScan.at) : '—');

    const ch = $('profChart');
    ch.innerHTML = '';
    ch.appendChild(chart(scans));

    const grid = $('profScans');
    grid.innerHTML = '';
    if (!scans.length) grid.appendChild(el('p', 'empty', t('prof.noScans')));
    for (const s of scans) grid.appendChild(scanFigure(s));
    const notes = $('profNotes');
    if (document.activeElement !== notes) notes.value = p.notes || '';
    return lastScan;
  }

  function showProfile(id) {
    const p = getPatient(id);
    if (!p) { toast(t('prof.gone'), 'err'); return showPatients(); }
    openId = id;
    disarm();
    const lastScan = renderProfile(p);
    scene.setState(lastScan ? (lastScan.malignant ? 'malignant' : 'benign') : 'profile');
    scene.morph('helix');
    scene.place(3.1, 0.2, 0.7);
    return go('stage-profile', {
      onEnter() {
        const chars = splitChars($('profName'), p.name);
        gsap.from(chars, { yPercent: 110, opacity: 0, rotateX: -80, duration: 1.2, ease: 'expo.out', stagger: 0.035, delay: 0.5 });
        const ring = { v: 0 };
        const target = lastScan ? lastScan.prob * 100 : 0;
        gsap.to(ring, { v: target, duration: 2, ease: 'power3.out', delay: 0.6, onUpdate: () => $('profAvatar').style.setProperty('--p', ring.v.toFixed(1)) });
        gsap.fromTo('#profTiles .v', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1, delay: 0.8, ease: 'expo.out' });
      },
    });
  }

  // تحديث حي إذا تغيرت البيانات
  onPatients(() => {
    if ($('stage-patients').classList.contains('active')) { storeLabel(); renderGrid(); }
    if (openId && $('stage-profile').classList.contains('active')) {
      const p = getPatient(openId);
      if (p) renderProfile(p); else showPatients();
    }
  });

  // تبديل اللغة: نعيد رسم الأقسام بالنصوص الجديدة
  onLang(() => {
    renderGuide();
    if ($('stage-devices').classList.contains('active')) { renderDeviceList(); renderDevice(device); }
    if ($('stage-patients').classList.contains('active')) { storeLabel(); renderGrid(); }
    if (openId && $('stage-profile').classList.contains('active')) {
      const p = getPatient(openId);
      if (p) { renderProfile(p); $('profName').textContent = p.name; }
    }
    disarm();
  });

  $('profBack').addEventListener('click', () => showPatients());
  $('profNotes').addEventListener('change', async (e) => {
    try { await updateNotes(openId, e.target.value); $('notesMsg').className = 'msg ok'; $('notesMsg').textContent = t('prof.notesSaved'); }
    catch (err) { $('notesMsg').className = 'msg err'; $('notesMsg').textContent = err.message; }
  });
  $('profScan').addEventListener('click', () => { const p = getPatient(openId); if (p) onNewScan(p); });

  let armTimer = null;
  function disarm() {
    clearTimeout(armTimer);
    const b = $('profDelete');
    b.classList.remove('armed');
    b.textContent = t('prof.delete');
  }
  $('profDelete').addEventListener('click', async () => {
    const b = $('profDelete');
    if (!b.classList.contains('armed')) {
      b.classList.add('armed');
      b.textContent = t('prof.confirm');
      armTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    try { await deletePatient(openId); toast(t('prof.deleted'), 'ok'); showPatients(); }
    catch (err) { toast(err.message, 'err'); }
  });

  return { showDevices, showGuide, showPatients, showProfile };
}
