// أشكال الجسيمات: كل شكل = N نقطة (x,y,z). الجسيمات تتحول من شكل لشكل.
// الأجهزة مبنية من أشكال هندسية بسيطة ونوزع النقاط على سطوحها حسب المساحة.
import * as THREE from 'three';

const rnd = Math.random;

// يوزع n نقطة على سطوح مجموعة geometries بالتناسب مع المساحة
function sampleSurfaces(parts, n, out, offset = 0) {
  const tris = [];
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const g of parts) {
    const geo = g.index ? g.toNonIndexed() : g;
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      a.set(p[i], p[i + 1], p[i + 2]); b.set(p[i + 3], p[i + 4], p[i + 5]); c.set(p[i + 6], p[i + 7], p[i + 8]);
      const area = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
      if (area <= 0) continue;
      total += area;
      tris.push(total, p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5], p[i + 6], p[i + 7], p[i + 8]);
    }
  }
  const count = tris.length / 10;
  for (let k = 0; k < n; k++) {
    // بحث ثنائي على المساحة التراكمية
    const r = rnd() * total;
    let lo = 0, hi = count - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid * 10] < r) lo = mid + 1; else hi = mid; }
    const t = lo * 10;
    let u = rnd(), v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    const o = (offset + k) * 3;
    out[o] = tris[t + 1] * w + tris[t + 4] * u + tris[t + 7] * v;
    out[o + 1] = tris[t + 2] * w + tris[t + 5] * u + tris[t + 8] * v;
    out[o + 2] = tris[t + 3] * w + tris[t + 6] * u + tris[t + 9] * v;
  }
}

// يوزع نقاط على خطوط (منحنيات) مع ارتعاش بسيط
function sampleCurves(curves, n, out, offset, jitter = 0.012) {
  const lens = curves.map((c) => c.getLength());
  const total = lens.reduce((s, l) => s + l, 0);
  let k = 0;
  curves.forEach((c, i) => {
    const m = i === curves.length - 1 ? n - k : Math.round((lens[i] / total) * n);
    for (let j = 0; j < m && k < n; j++, k++) {
      const p = c.getPoint(rnd());
      const o = (offset + k) * 3;
      out[o] = p.x + (rnd() - 0.5) * jitter;
      out[o + 1] = p.y + (rnd() - 0.5) * jitter;
      out[o + 2] = p.z + (rnd() - 0.5) * jitter;
    }
  });
}

function box(w, h, d, x, y, z, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  if (rz) g.rotateZ(rz);
  return g.translate(x, y, z);
}
const line = (a, b) => new THREE.LineCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b));

// ===== الأشكال =====
function orb(n) {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const core = rnd() < 0.28;
    const theta = 2 * Math.PI * rnd(), phi = Math.acos(2 * rnd() - 1);
    const r = core ? Math.cbrt(rnd()) * 0.9 : 1.25 + (rnd() - 0.5) * 0.12;
    out[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    out[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    out[i * 3 + 2] = r * Math.cos(phi);
  }
  return out;
}

// جهاز الماموغرام: عمود + ذراع + رأس الأشعة + كاشف + لوح الضغط
function mammoParts() {
  return [
    box(1.5, 0.12, 1.1, 0, -1.62, 0),              // القاعدة
    box(0.38, 3.1, 0.42, -0.62, -0.05, 0),          // العمود
    box(0.26, 2.3, 0.38, -0.25, 0.25, 0),           // الذراع C
    box(0.95, 0.48, 0.66, 0.2, 1.3, 0),             // رأس أنبوب الأشعة
    box(1.0, 0.14, 0.76, 0.3, -0.52, 0),            // الكاشف الرقمي
    box(0.9, 0.035, 0.7, 0.3, -0.05, 0),            // لوح الضغط
    box(0.04, 0.55, 0.62, 0.72, 0.95, 0),           // واقي الوجه
    new THREE.CylinderGeometry(0.16, 0.16, 0.5, 24, 1).rotateZ(Math.PI / 2).translate(-0.25, 0.25, 0.28), // مفصل الدوران
  ];
}

function beamCone(out, offset, n, focus, base) {
  // حزمة أشعة: نقاط داخل مخروط من البؤرة إلى سطح الكاشف
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rnd(), 0.7);
    const bx = base.x + (rnd() - 0.5) * base.w, bz = base.z + (rnd() - 0.5) * base.d;
    const o = (offset + i) * 3;
    out[o] = focus.x + (bx - focus.x) * t;
    out[o + 1] = focus.y + (base.y - focus.y) * t;
    out[o + 2] = focus.z + (bz - focus.z) * t;
  }
}

function mammo(n) {
  const out = new Float32Array(n * 3);
  const beam = Math.floor(n * 0.14);
  sampleSurfaces(mammoParts(), n - beam, out);
  beamCone(out, n - beam, beam, { x: 0.3, y: 1.05, z: 0 }, { x: 0.3, y: -0.45, z: 0, w: 0.85, d: 0.6 });
  return out;
}

// التوموسينثيسس: الأنبوب يتحرك على قوس ويصور من زوايا متعددة
function dbt(n) {
  const out = new Float32Array(n * 3);
  const beams = Math.floor(n * 0.22), tubes = Math.floor(n * 0.1);
  sampleSurfaces(mammoParts(), n - beams - tubes, out);
  const cx = 0.3, cy = -0.45, R = 1.85;
  const angles = [-0.42, -0.31, -0.21, -0.1, 0, 0.1, 0.21, 0.31, 0.42];
  const tubeGeos = angles.map((a) => new THREE.SphereGeometry(0.07, 10, 8).translate(cx + Math.sin(a) * R, cy + Math.cos(a) * R, 0));
  sampleSurfaces(tubeGeos, tubes, out, n - beams - tubes);
  const curves = angles.map((a) => line([cx + Math.sin(a) * R, cy + Math.cos(a) * R, 0], [cx, cy + 0.06, 0]));
  curves.push(new THREE.EllipseCurve(cx, cy, R, R, Math.PI / 2 - 0.5, Math.PI / 2 + 0.5));
  const arc = curves.pop();
  const arc3 = new THREE.CatmullRomCurve3(arc.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0)));
  sampleCurves([...curves, arc3], beams, out, n - beams, 0.03);
  return out;
}

// الماموغرام بالصبغة: نسيج الثدي + شبكة أوعية دموية تضوي
function cem(n) {
  const out = new Float32Array(n * 3);
  const vessels = Math.floor(n * 0.42);
  const half = new THREE.SphereGeometry(1.3, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(1.15, 1, 1).translate(-0.6, 0, 0);
  sampleSurfaces([half], n - vessels, out);
  // أوعية متفرعة بخطوات عشوائية
  const curves = [];
  function branch(p, dir, len, depth) {
    const pts = [p.clone()];
    const d = dir.clone();
    for (let i = 0; i < 6; i++) {
      d.add(new THREE.Vector3((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5)).normalize();
      pts.push(pts[pts.length - 1].clone().addScaledVector(d, len / 6));
    }
    curves.push(new THREE.CatmullRomCurve3(pts));
    if (depth < 3) for (let k = 0; k < 2; k++) branch(pts[3 + k * 2], d, len * 0.62, depth + 1);
  }
  for (let i = 0; i < 5; i++) branch(new THREE.Vector3(-0.55, (i - 2) * 0.35, (rnd() - 0.5) * 0.4), new THREE.Vector3(1, (i - 2) * 0.15, (rnd() - 0.5) * 0.3), 1.1, 0);
  sampleCurves(curves, vessels, out, n - vessels, 0.02);
  return out;
}

// الألتراساوند: مجس + موجات صوتية على شكل مروحة
function ultrasound(n) {
  const out = new Float32Array(n * 3);
  const waves = Math.floor(n * 0.5);
  const probe = [
    new THREE.CylinderGeometry(0.17, 0.22, 1.3, 24, 3).translate(0, 1.25, 0),
    box(0.72, 0.28, 0.3, 0, 0.5, 0),
    new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8).rotateZ(0.5).translate(-0.25, 2.2, 0),
  ];
  sampleSurfaces(probe, n - waves, out);
  const curves = [];
  for (let r = 0.35; r <= 2.1; r += 0.16) {
    const e = new THREE.EllipseCurve(0, 0.36, r, r, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
    curves.push(new THREE.CatmullRomCurve3(e.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0))));
  }
  sampleCurves(curves, waves, out, n - waves, 0.05);
  return out;
}

// الرنين المغناطيسي: أسطوانة كبيرة بفتحة + سرير
function mri(n) {
  const out = new Float32Array(n * 3);
  const parts = [
    new THREE.CylinderGeometry(1.45, 1.45, 1.7, 64, 4, true).rotateZ(Math.PI / 2),
    new THREE.CylinderGeometry(0.72, 0.72, 1.7, 48, 4, true).rotateZ(Math.PI / 2),
    new THREE.RingGeometry(0.72, 1.45, 64, 2).rotateY(Math.PI / 2).translate(0.85, 0, 0),
    new THREE.RingGeometry(0.72, 1.45, 64, 2).rotateY(Math.PI / 2).translate(-0.85, 0, 0),
    box(3.4, 0.08, 0.7, 0.9, -0.42, 0),
    box(0.3, 0.9, 0.5, 2.3, -0.9, 0),
  ];
  sampleSurfaces(parts, n, out);
  return out;
}

// الذكاء الاصطناعي: شبكة عصبية بطبقات وروابط
function ai(n) {
  const out = new Float32Array(n * 3);
  const layers = [6, 10, 10, 3];
  const xs = [-1.7, -0.55, 0.55, 1.7];
  const nodes = layers.map((c, li) => Array.from({ length: c }, (_, i) => new THREE.Vector3(xs[li], ((i - (c - 1) / 2) / Math.max(c - 1, 1)) * 2.6, (rnd() - 0.5) * 0.3)));
  const nodePts = Math.floor(n * 0.45);
  sampleSurfaces(nodes.flat().map((v) => new THREE.SphereGeometry(0.07, 10, 8).translate(v.x, v.y, v.z)), nodePts, out);
  const curves = [];
  for (let l = 0; l < nodes.length - 1; l++) for (const a of nodes[l]) for (const b of nodes[l + 1]) if (rnd() < 0.55) curves.push(new THREE.LineCurve3(a, b));
  sampleCurves(curves, n - nodePts, out, nodePts, 0.01);
  return out;
}

// الملف الشخصي: شريط DNA مزدوج
function helix(n) {
  const out = new Float32Array(n * 3);
  const strands = Math.floor(n * 0.7);
  const H = 3.4, turns = 2.6, R = 0.72;
  for (let i = 0; i < strands; i++) {
    const t = rnd(), side = i % 2 ? Math.PI : 0;
    const a = t * turns * Math.PI * 2 + side;
    const r = R + (rnd() - 0.5) * 0.08;
    out[i * 3] = Math.cos(a) * r; out[i * 3 + 1] = (t - 0.5) * H; out[i * 3 + 2] = Math.sin(a) * r;
  }
  const curves = [];
  for (let k = 0; k <= 26; k++) {
    const t = k / 26, a = t * turns * Math.PI * 2;
    curves.push(line([Math.cos(a) * R, (t - 0.5) * H, Math.sin(a) * R], [Math.cos(a + Math.PI) * R, (t - 0.5) * H, Math.sin(a + Math.PI) * R]));
  }
  sampleCurves(curves, n - strands, out, strands, 0.02);
  return out;
}

// الإرشادات: درع (حواف واضحة + تعبئة خفيفة) وعلامة صح
function shield(n) {
  const out = new Float32Array(n * 3);
  const s = new THREE.Shape();
  s.moveTo(0, 1.55);
  s.bezierCurveTo(0.55, 1.25, 1.0, 1.25, 1.25, 1.3);
  s.bezierCurveTo(1.25, 0.2, 0.9, -0.9, 0, -1.55);
  s.bezierCurveTo(-0.9, -0.9, -1.25, 0.2, -1.25, 1.3);
  s.bezierCurveTo(-1.0, 1.25, -0.55, 1.25, 0, 1.55);
  const outline = s.getSpacedPoints(160);
  const rim = (z, k) => new THREE.CatmullRomCurve3(outline.map((p) => new THREE.Vector3(p.x * k, p.y * k, z)), true);
  const edge = Math.floor(n * 0.45), fill = Math.floor(n * 0.2), check = n - edge - fill;
  sampleCurves([rim(0.14, 1), rim(-0.14, 1), rim(0.14, 0.86)], edge, out, 0, 0.03);
  sampleSurfaces([new THREE.ShapeGeometry(s, 24)], fill, out, edge);
  const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.55, 0.05, 0.25), new THREE.Vector3(-0.15, -0.4, 0.25), new THREE.Vector3(0.62, 0.55, 0.25)], false, 'catmullrom', 0);
  sampleCurves([c], check, out, edge + fill, 0.1);
  return out;
}

const BUILDERS = { orb, mammo, dbt, cem, ultrasound, mri, ai, helix, shield };
const cache = new Map();

export function shapePositions(name, n) {
  const key = name + ':' + n;
  if (!cache.has(key)) cache.set(key, (BUILDERS[name] || orb)(n));
  return cache.get(key);
}

// كم "حيوية" (تموج عضوي) لكل شكل: الكرة حية، الأجهزة ثابتة وحادة
// شدة الإضاءة لكل شكل: الأشكال الصغيرة المزدحمة تحتاج أقل حتى ما تحترق للأبيض
export const GAIN = { orb: 1, mammo: 0.42, dbt: 0.45, cem: 0.6, ultrasound: 0.5, mri: 0.4, ai: 0.62, helix: 0.5, shield: 0.5 };
export const ORGANIC = { orb: 1, mammo: 0.08, dbt: 0.1, cem: 0.3, ultrasound: 0.14, mri: 0.08, ai: 0.12, helix: 0.18, shield: 0.1 };
