// بوابة المريضة: دخول → قائمة التقارير
import { createScene } from './scene.js';
import { go, splitChars, toast, api, downloadBlob, storage } from './ui.js';

const gsap = window.gsap;
const $ = (id) => document.getElementById(id);
const scene = createScene($('gl'));

let token = storage('patientToken') || '';

function showLogin() {
  $('signOut').hidden = true;
  scene.setState('idle');
  scene.place(0, 0, 1.35);
  go('stage-login');
}

async function showReports() {
  let data;
  try {
    data = await api('/api/portal/reports', { token });
  } catch (err) {
    token = ''; storage('patientToken', null);
    if (err.status === 401) toast('Please sign in again.', 'err');
    showLogin();
    return;
  }
  $('signOut').hidden = false;
  $('who').textContent = 'Patient ID ' + data.patient_id;
  renderList(data.reports);
  scene.setState('benign');
  scene.place(2.4, 0.3, 0.8);
  go('stage-reports', {
    onEnter() {
      const chars = splitChars($('welcome'), 'Welcome, ' + (data.name || ''));
      gsap.from(chars, { yPercent: 100, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.025, delay: 0.2 });
      gsap.fromTo('.report', { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.08, delay: 0.5, clearProps: 'transform' });
    },
  });
}

function renderList(reports) {
  const list = $('list');
  list.innerHTML = '';
  if (!reports.length) {
    const p = document.createElement('div');
    p.className = 'panel';
    p.textContent = 'No reports available yet. Your clinic will add them after your visit.';
    list.appendChild(p);
    return;
  }
  for (const r of reports) {
    const m = r.result.startsWith('Malignant');
    const date = new Date(r.created_at).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
    const card = document.createElement('div');
    card.className = 'panel report';

    const num = document.createElement('div');
    num.className = 'num'; num.textContent = '#' + String(r.id).padStart(3, '0');

    const info = document.createElement('div');
    const res = document.createElement('div');
    res.className = 'res ' + (m ? 'm' : 'b'); res.textContent = r.result;
    const when = document.createElement('div');
    when.className = 'when'; when.textContent = `${date} · Confidence ${r.confidence.toFixed(1)}%`;
    info.append(res, when);

    const btn = document.createElement('button');
    btn.className = 'btn ghost';
    if (r.available) {
      btn.innerHTML = 'Download PDF <span class="arrow">↓</span>';
      btn.addEventListener('click', () => download(r.id));
    } else {
      btn.textContent = 'File unavailable'; btn.disabled = true;
    }
    card.append(num, info, btn);
    list.appendChild(card);
  }
}

async function download(id) {
  try {
    const res = await api(`/api/portal/reports/${id}/pdf`, { token, raw: true });
    downloadBlob(await res.blob(), `report_${id}.pdf`);
  } catch (err) {
    toast(err.message, 'err');
  }
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('loginMsg');
  msg.textContent = '';
  try {
    const r = await api('/api/portal/login', { method: 'POST', body: { patient_id: $('pid').value.trim(), password: $('pass').value } });
    token = r.token;
    storage('patientToken', token);
    $('pass').value = '';
    scene.burst();
    showReports();
  } catch (err) {
    msg.className = 'msg err';
    // بالنسخة بدون سيرفر (مثلاً Vercel) ماكو قاعدة بيانات للبوابة
    msg.textContent = err.status === 404 || err.status === 405
      ? 'The patient portal is available on the clinic server edition only.'
      : err.message;
    gsap.fromTo('#loginForm', { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
  }
});

$('signOut').addEventListener('click', () => {
  token = ''; storage('patientToken', null);
  showLogin();
});

if (token) showReports(); else showLogin();
