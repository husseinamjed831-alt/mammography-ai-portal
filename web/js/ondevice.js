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

export { xgbProba };
