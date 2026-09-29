// تخزين ملفات المرضى
// - داخل claude.ai: قاعدة بيانات خاصة بكل مستخدم (data/users/<id>/...) — محد غيره يشوفها، حتى صاحب الصفحة
// - برا claude.ai: على نفس الجهاز (localStorage)
// كل مريضة = وثيقة وحدة فيها معلوماتها وآخر الفحوصات (مع صورة مصغرة)

import { t } from './i18n.js';

const LOCAL_KEY = 'mammo.patients.v1';
const MAX_SCANS = 14; // حتى الوثيقة تبقى أصغر من 256KB

let backend = null;
const listeners = new Set();
let cache = [];

function emit() {
  cache.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  for (const fn of listeners) fn(cache);
}

// ===== محلي =====
function localBackend() {
  const read = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; } };
  const write = (list) => {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); }
    catch { throw new Error(t('store.full')); }
  };
  return {
    kind: 'local',
    start() { cache = read(); emit(); },
    async save(p) { const list = read().filter((x) => x.id !== p.id); list.push(p); write(list); cache = list; emit(); },
    async remove(id) { const list = read().filter((x) => x.id !== id); write(list); cache = list; emit(); },
  };
}

// ===== claude.ai =====
async function cloudBackend() {
  const claude = window.claude;
  if (!claude?.use) return null;
  const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
  if (!db || !user) return null;
  const uid = await user.id();
  if (!uid) return null;
  const col = db.doc(`data/users/${uid}/app`).collection('patients');
  return {
    kind: 'cloud',
    start() {
      col.onSnapshot((snap) => {
        cache = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        emit();
      }, () => { /* الاشتراك مات: نبقى على آخر نسخة */ });
    },
    async save(p) {
      const { id, ...body } = p;
      try { await col.doc(id).set(JSON.parse(JSON.stringify(body))); }
      catch (e) {
        if (e?.code === 'quota_exceeded') throw new Error(t('store.quota'));
        if (e?.code === 'invalid_argument') throw new Error(t('store.readonly'));
        throw new Error(t('store.later'));
      }
    },
    async remove(id) { await col.doc(id).delete(); },
  };
}

export async function initStore() {
  backend = (await cloudBackend().catch(() => null)) || localBackend();
  backend.start();
  return backend.kind;
}

export const storeKind = () => backend?.kind || 'local';
export const patients = () => cache;
export const getPatient = (id) => cache.find((p) => p.id === id);
export function onPatients(fn) { listeners.add(fn); fn(cache); return () => listeners.delete(fn); }

const slug = (s) => String(s).trim().replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 80) || 'patient';

export function findByPid(pid) {
  const key = slug(pid);
  return cache.find((p) => p.id === key);
}

function merged({ pid, name, age }) {
  const now = new Date().toISOString();
  const id = slug(pid);
  const existing = getPatient(id);
  return existing
    ? { ...existing, name: name || existing.name, age: age || existing.age, updatedAt: now }
    : { id, pid, name: name || 'Unnamed patient', age: age || '', notes: '', createdAt: now, updatedAt: now, scans: [] };
}

export async function upsertPatient(info) {
  const p = merged(info);
  await backend.save(p);
  return p;
}

export async function addScan(pid, scan, info) {
  const p = merged({ pid, ...info });
  const next = { ...p, scans: [{ ...scan, at: p.updatedAt }, ...(p.scans || [])].slice(0, MAX_SCANS) };
  await backend.save(next);
  return next;
}

export async function updateNotes(id, notes) {
  const p = getPatient(id);
  if (!p || p.notes === notes) return;
  await backend.save({ ...p, notes, updatedAt: new Date().toISOString() });
}

export async function deletePatient(id) { await backend.remove(id); }

// صورة مصغرة (JPEG صغير) حتى تنحفظ ويا الفحص
export function makeThumb(img, max = 150) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  const ctx = c.getContext('2d');
  ctx.filter = 'grayscale(1)';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}
