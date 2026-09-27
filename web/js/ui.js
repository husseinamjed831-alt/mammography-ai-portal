// أدوات مشتركة: التنقل بين المراحل، الرسائل، الاتصال بالـ API
const gsap = window.gsap;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let current = null;

// ينقل من مرحلة لمرحلة بتأثير: الحالية تطير لفوق وتتضبب، الجديدة تطلع من تحت
export function go(id, { onEnter } = {}) {
  const next = document.getElementById(id);
  const prev = current;
  current = next;
  const d = reduced ? 0.01 : 1;

  const tl = gsap.timeline();
  if (prev && prev !== next) {
    const prevItems = prev.querySelectorAll(':scope > * > *');
    tl.to(prevItems, {
      y: -40, opacity: 0, filter: 'blur(12px)', duration: 0.5 * d, ease: 'power3.in', stagger: 0.03 * d,
    });
    tl.add(() => { prev.classList.remove('active'); gsap.set(prevItems, { clearProps: 'all' }); });
  }
  tl.add(() => {
    next.classList.add('active');
    next.scrollTop = 0;
    onEnter && onEnter();
  });
  const items = next.querySelectorAll(':scope > * > *');
  tl.fromTo(items,
    { y: 60, opacity: 0, filter: 'blur(14px)' },
    { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.9 * d, ease: 'expo.out', stagger: 0.07 * d, clearProps: 'filter,transform' });
  gsap.set(next, { opacity: 1 });
  return tl;
}

// يقسم النص لحروف حتى نحركها وحدة وحدة
export function splitChars(el, text) {
  el.textContent = '';
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = 'char';
    s.textContent = ch === ' ' ? ' ' : ch;
    el.appendChild(s);
  }
  return el.querySelectorAll('.char');
}

// يقلب النص بحروف عشوائية قبل ما يستقر (تأثير "فك تشفير")
export function scramble(el, finalText, duration = 900) {
  const glyphs = '01<>/\\#%&*+=ABCDEFXYZ';
  const start = performance.now();
  return new Promise((resolve) => {
    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const reveal = Math.floor(p * finalText.length);
      let out = '';
      for (let i = 0; i < finalText.length; i++) {
        out += i < reveal || finalText[i] === ' ' ? finalText[i] : glyphs[(Math.random() * glyphs.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(frame); else resolve();
    }
    requestAnimationFrame(frame);
  });
}

let toastTimer;
export function toast(text, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.className = 'toast ' + kind;
  gsap.killTweensOf(el);
  gsap.to(el, { y: 0, xPercent: -50, autoAlpha: 1, duration: 0.5, ease: 'expo.out' });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => gsap.to(el, { y: '200%', autoAlpha: 0, duration: 0.4, ease: 'power2.in' }), 3800);
}

export async function api(path, { method = 'GET', body, token, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch {}
    const err = new Error(typeof detail === 'string' ? detail : 'Request failed');
    err.status = res.status;
    throw err;
  }
  return raw ? res : res.json();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function storage(key, value) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value);
  } catch { return null; }
}
