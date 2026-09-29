// الترجمة: إنكليزي / عربي، مع اتجاه الصفحة (RTL)
// العناصر الثابتة بالـ HTML تاخذ data-i18n (نص) أو data-i18n-html (نص بيه <br>) أو data-i18n-ph (placeholder)
// والنصوص المتغيرة بالكود تاخذ t('key', {vars})
import { EN } from './i18n-en.js';
import { AR } from './i18n-ar.js';

const STR = { en: EN, ar: AR };
const KEY = 'mammo.lang';
let lang = 'en';
try { lang = localStorage.getItem(KEY) || ((navigator.language || '').startsWith('ar') ? 'ar' : 'en'); } catch { /* التخزين مقفول */ }
if (!STR[lang]) lang = 'en';
const listeners = new Set();

export const getLang = () => lang;
export const isRTL = () => lang === 'ar';
// أرقام لاتينية حتى بالعربي (أوضح بالقيم الطبية)
export const locale = () => (lang === 'ar' ? 'ar-IQ-u-nu-latn' : undefined);

export function t(key, vars = {}) {
  const s = STR[lang][key] ?? STR.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

// يختار النص حسب اللغة من كائن فيه { en, ar } أو يرجع القيمة كما هي
export const pick = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? (v[lang] ?? v.en) : v);

export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}

export function setLang(next) {
  lang = STR[next] ? next : 'en';
  try { localStorage.setItem(KEY, lang); } catch { /* التخزين مقفول */ }
  applyStatic();
  for (const fn of listeners) fn(lang);
}
export function onLang(fn) { listeners.add(fn); return () => listeners.delete(fn); }
