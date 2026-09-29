// التحليل داخل المتصفح: EfficientNetB0 (TensorFlow.js) + XGBoost
// نفس الموديل الموجود بـ mammo_xgb.pkl، بس يشتغل على جهاز المستخدم — الصورة ما تطلع منه
const TFJS_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
const SIZE = 224;

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.tf) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load TensorFlow.js'));
    document.head.appendChild(s);
  });
}

// يحمّل الموديلين مرة وحدة. onProgress يستلم رقم من 0 إلى 1
export function loadModel(onProgress = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    await loadScript(TFJS_URL);
    const tf = window.tf;
    try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
    await tf.ready();
    const [cnn, xgb] = await Promise.all([
      tf.loadGraphModel('model/model.json', { onProgress }),
      fetch('model/xgb.json').then((r) => r.json()),
    ]);
    // تسخين: أول تشغيل على WebGL يبني الـ shaders
    tf.tidy(() => cnn.execute(tf.zeros([1, SIZE, SIZE, 3])));
    return { tf, cnn, xgb, backend: tf.getBackend() };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

// XGBoost: كل شجرة تنزل حسب الخاصية والعتبة لحد ما توصل ورقة، ونجمع الأوراق
function xgbProba(xgb, feats) {
  const base = xgb.base_score;
  let margin = Math.log(base / (1 - base));
  for (const t of xgb.trees) {
    let n = 0;
    while (t.l[n] !== -1) {
      const v = feats[t.f[n]];
      if (Number.isNaN(v)) n = t.d[n] ? t.l[n] : t.r[n];
      else n = v < Math.fround(t.c[n]) ? t.l[n] : t.r[n];
    }
    margin += t.c[n];
  }
  return 1 / (1 + Math.exp(-margin));
}

// يرجع { probability, features, featureMs, treeMs, trees } لصورة (HTMLImageElement / canvas)
export async function analyze(source) {
  const { tf, cnn, xgb } = await loadModel();
  const t0 = performance.now();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, SIZE, SIZE);
  const feats = tf.tidy(() => {
    const x = tf.browser.fromPixels(canvas, 3).toFloat().expandDims(0);
    return cnn.execute(x);
  });
  const features = await feats.data();
  feats.dispose();
  const t1 = performance.now();
  const probability = xgbProba(xgb, features);
  const t2 = performance.now();
  return { probability, features, featureMs: t1 - t0, treeMs: t2 - t1, trees: xgb.trees.length };
}

// خريطة الانتباه بطريقة الحجب (occlusion): نغطي كل منطقة من الصورة بلون رمادي متوسط
// ونعيد التحليل. المنطقة اللي تغطيتها تنزّل الاحتمال أكثر = المنطقة اللي أثرت بالنتيجة أكثر.
// ترجع شبكة GRID×GRID من القيم (موجب = المنطقة ترفع الشك، سالب = تنزله).
export const GRID = 8;
export async function explain(source, baseProb, onProgress = () => {}) {
  const { tf, cnn, xgb } = await loadModel();
  const t0 = performance.now();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, SIZE, SIZE);
  const base = tf.tidy(() => tf.browser.fromPixels(canvas, 3).toFloat());
  const mean = (await base.mean().data())[0];
  const cell = SIZE / GRID, win = cell * 2;
  const heat = new Float32Array(GRID * GRID);
  const BATCH = 16;
  for (let start = 0; start < GRID * GRID; start += BATCH) {
    const idx = [];
    for (let k = start; k < Math.min(start + BATCH, GRID * GRID); k++) idx.push(k);
    const feats = tf.tidy(() => {
      const masks = idx.map((k) => {
        const cx = (k % GRID + 0.5) * cell, cy = (Math.floor(k / GRID) + 0.5) * cell;
        const x0 = Math.max(0, Math.round(cx - win / 2)), y0 = Math.max(0, Math.round(cy - win / 2));
        const x1 = Math.min(SIZE, Math.round(cx + win / 2)), y1 = Math.min(SIZE, Math.round(cy + win / 2));
        // قناع: 1 داخل النافذة، 0 برا
        const rows = tf.logicalAnd(tf.range(0, SIZE).greaterEqual(y0), tf.range(0, SIZE).less(y1));
        const cols = tf.logicalAnd(tf.range(0, SIZE).greaterEqual(x0), tf.range(0, SIZE).less(x1));
        return tf.outerProduct(rows.toFloat(), cols.toFloat()).expandDims(-1);
      });
      const m = tf.stack(masks);
      const imgs = base.expandDims(0).mul(tf.scalar(1).sub(m)).add(m.mul(mean));
      return cnn.execute(imgs);
    });
    const data = await feats.data();
    feats.dispose();
    idx.forEach((k, j) => { heat[k] = baseProb - xgbProba(xgb, data.subarray(j * 1280, (j + 1) * 1280)); });
    onProgress(Math.min(1, (start + BATCH) / (GRID * GRID)));
    await new Promise((r) => setTimeout(r, 0)); // نخلي الواجهة تتنفس
  }
  base.dispose();
  return { heat: Array.from(heat, (v) => Math.round(v * 1e4) / 1e4), ms: performance.now() - t0, probes: GRID * GRID };
}

// يرسم الخريطة على canvas بالحجم المطلوب: بقع ناعمة ملونة (سمائي ← وردي ← أبيض)
export function drawHeat(ctx, heat, w, h, alpha = 0.85) {
  const n = Math.round(Math.sqrt(heat.length));
  let max = 0;
  for (const v of heat) max = Math.max(max, v);
  const small = document.createElement('canvas');
  small.width = small.height = n;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(n, n);
  for (let i = 0; i < heat.length; i++) {
    const v = max > 0 ? Math.max(0, heat[i]) / max : 0;
    const r = v < 0.5 ? 63 + (255 - 63) * v * 2 : 255;
    const g = v < 0.5 ? 216 - (216 - 79) * v * 2 : 79 + (255 - 79) * (v - 0.5) * 2;
    const b = v < 0.5 ? 255 - (255 - 154) * v * 2 : 154 + (255 - 154) * (v - 0.5) * 2;
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.round(255 * Math.pow(v, 1.3) * alpha);
  }
  sctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = `blur(${Math.max(w, h) / n / 3}px)`;
  ctx.drawImage(small, 0, 0, w, h);
  ctx.restore();
}

export { xgbProba };
