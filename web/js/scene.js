// مشهد WebGL: جسيمات تتحول بين أشكال (كرة، أجهزة التصوير، شبكة عصبية، DNA...)
// مع توهج (bloom) ودقة تصل لـ 4K حسب الشاشة
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { shapePositions, shapeExtras, ORGANIC, GAIN } from './shapes.js';

const noiseGLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const vertexShader = /* glsl */`
uniform float uTime;
uniform float uScan;
uniform float uBurst;
uniform float uCalm;
uniform float uMorph;     // 0 → 1 التحول من aFrom إلى position
uniform float uOrganic;   // شكد الشكل "حي" ويتموج
uniform float uSpin;
uniform vec2  uMouse;
uniform float uPixelRatio;
uniform float uSize;
uniform float uTintMix;   // 0 = ألوان الحالة، 1 = ألوان تشريحية
uniform float uLesion;    // ظهور الورم
uniform float uCompress;  // ضغط الثدي بين لوحي الماموغرام
attribute vec3 aFrom;
attribute float aRandom;
attribute vec3 aTint;
attribute float aFlow;    // موقع الجسيم على القناة (-1 = مو قناة)
attribute float aFlag;    // 1 = جزء من الورم
varying float vGlow;
varying float vScanLine;
varying float vRand;
varying float vWarp;
varying vec3 vTint;
varying float vPulse;
varying float vFlag;
${noiseGLSL}
void main(){
  float delay = aRandom * 0.35;
  float m = clamp((uMorph - delay) / (1.0 - 0.35), 0.0, 1.0);
  float e = m < 0.5 ? 4.0*m*m*m : 1.0 - pow(-2.0*m + 2.0, 3.0) / 2.0;
  vec3 p = mix(aFrom, position, e);

  // بنص التحول الجسيمات تنفجر وتدور بدوامة
  float warp = sin(3.14159 * m);
  vec3 swirl = vec3(snoise(p * 0.7 + 11.0), snoise(p * 0.7 + 23.0), snoise(p * 0.7 + 37.0));
  p += swirl * warp * (1.3 + aRandom * 1.6);
  float wa = warp * 2.2 * (aRandom - 0.5);
  p.xz = mat2(cos(wa), -sin(wa), sin(wa), cos(wa)) * p.xz;

  float t = uTime * mix(0.35, 0.08, uCalm);
  float n = snoise(p * 1.4 + vec3(t, t * 0.6, -t));
  float n2 = snoise(p * 3.5 - vec3(t * 1.7));
  float amp = (0.26 + uScan * 0.18) * uOrganic;
  p += normalize(p + 0.0001) * (n * amp + n2 * 0.05 * uOrganic * (1.0 + uScan * 3.0));

  // تنفّس خفيف للنسيج + ضغط عمودي وقت التصوير (بس للثدي، مو للعضلة والأضلاع)
  p *= 1.0 + 0.014 * sin(uTime * 1.25) * uTintMix;
  float soft = smoothstep(-1.05, -0.6, p.x) * uTintMix;
  p.y *= 1.0 - 0.38 * uCompress * soft;
  p.z *= 1.0 + 0.16 * uCompress * soft;

  // الورم ينبض
  float lesion = aFlag * uLesion * uTintMix;
  p += (p - vec3(-0.05, 0.55, -0.45)) * lesion * 0.12 * sin(uTime * 5.0);

  p *= 1.0 + uBurst * (0.5 + aRandom * 1.3);

  float ang = uSpin;
  p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz;
  p.x += uMouse.x * 0.12; p.y += uMouse.y * 0.12;

  float scanY = sin(uTime * 2.2) * 1.6;
  vScanLine = uScan * smoothstep(0.16, 0.0, abs(p.y - scanY));

  // نبضات ضوء تمشي على القنوات من جدار الصدر للحلمة
  float pulse = aFlow >= 0.0 ? pow(max(0.0, sin(aFlow * 16.0 - uTime * 3.2)), 10.0) * uTintMix : 0.0;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(0.7, 1.35, aRandom) * uSize * (1.0 + vScanLine * 2.5 + uBurst * 1.5 + warp * 0.8 + pulse * 1.4 + lesion * 0.9);
  gl_PointSize = size * uPixelRatio * (6.0 / -mv.z);
  vGlow = 0.45 + 0.55 * (n * 0.5 + 0.5);
  vRand = aRandom;
  vWarp = warp;
  vTint = aTint;
  vPulse = pulse;
  vFlag = aFlag;
}`;

const fragmentShader = /* glsl */`
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorScan;
uniform float uAlpha;
uniform float uGain;
uniform float uTintMix;
uniform float uLesion;
uniform float uXray;
uniform float uTime;
varying float vGlow;
varying float vScanLine;
varying float vRand;
varying float vWarp;
varying vec3 vTint;
varying float vPulse;
varying float vFlag;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = exp(-d * d * 18.0);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.2, 0.95, vRand) * 0.85 + vGlow * 0.15);
  // ألوان تشريحية ممزوجة بلون الحالة (أخضر حميد، أحمر مشبوه...)
  vec3 anat = vTint * (0.55 + vGlow * 0.6) + vec3(0.6, 0.95, 1.0) * vPulse;
  anat = mix(anat, anat * 0.55 + col * 0.45, 0.35);
  col = mix(col, anat, uTintMix);
  // الورم: برتقالي/أبيض نابض
  float les = vFlag * uTintMix;
  col = mix(col, mix(vec3(1.0, 0.12, 0.05), vec3(1.0, 0.5, 0.15), 0.5 + 0.5 * sin(uTime * 5.0)) * 0.8, les);
  // وضع الأشعة السينية: أبيض مزرق حسب كثافة النسيج
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(0.78, 0.88, 1.0) * (0.35 + lum * 1.25), uXray * (1.0 - les * uLesion));
  col = mix(col, uColorScan, max(vScanLine, vWarp * 0.35 * step(0.85, vRand)));
  float alpha = a * uAlpha * uGain * (0.5 + vScanLine + vPulse * 0.8);
  // لما يظهر الورم نعتّم الباقي حتى يبرز
  alpha *= mix(1.0 - 0.6 * uLesion * uTintMix, uLesion * 1.6, les);
  gl_FragColor = vec4(col * (0.55 + vGlow * 0.8), alpha);
}`;

const PALETTES = {
  idle:      { a: '#3fd8ff', b: '#ff4f9a', scan: '#ffffff' },
  scan:      { a: '#6f7bff', b: '#3fd8ff', scan: '#e8fbff' },
  benign:    { a: '#27f5b0', b: '#3fd8ff', scan: '#ffffff' },
  malignant: { a: '#ff3b5c', b: '#ff9a3b', scan: '#ffffff' },
  device:    { a: '#7fe7ff', b: '#9b8cff', scan: '#ffffff' },
  guide:     { a: '#ffd36e', b: '#3fd8ff', scan: '#ffffff' },
  profile:   { a: '#ff6fb5', b: '#8f7bff', scan: '#ffffff' },
};

const MAX_PIXELS = 3840 * 2160; // سقف الدقة: 4K

export function createScene(canvas, hud) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    document.documentElement.classList.add('no-webgl');
    return fallbackScene();
  }
  renderer.setClearColor(new THREE.Color('#04060d'), 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  const mobile = Math.min(innerWidth, innerHeight) < 700;
  const COUNT = mobile ? 60000 : 160000;
  const start = shapePositions('orb', COUNT);
  const randoms = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) randoms[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(start.slice(), 3);
  const fromAttr = new THREE.BufferAttribute(start.slice(), 3);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aFrom', fromAttr);
  geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
  const tintAttr = new THREE.BufferAttribute(new Float32Array(COUNT * 3).fill(1), 3);
  const flowAttr = new THREE.BufferAttribute(new Float32Array(COUNT).fill(-1), 1);
  const flagAttr = new THREE.BufferAttribute(new Float32Array(COUNT), 1);
  geo.setAttribute('aTint', tintAttr);
  geo.setAttribute('aFlow', flowAttr);
  geo.setAttribute('aFlag', flagAttr);

  const uniforms = {
    uTime: { value: 0 }, uScan: { value: 0 }, uBurst: { value: 0 }, uCalm: { value: reduced ? 1 : 0 },
    uMorph: { value: 1 }, uOrganic: { value: 1 }, uSpin: { value: 0 }, uSize: { value: mobile ? 2.6 : 2.1 },
    uMouse: { value: new THREE.Vector2() }, uPixelRatio: { value: 1 }, uAlpha: { value: 0 }, uGain: { value: mobile ? 1.6 : 1 },
    uTintMix: { value: 0 }, uLesion: { value: 0 }, uXray: { value: 0 }, uCompress: { value: 0 },
    uColorA: { value: new THREE.Color(PALETTES.idle.a) },
    uColorB: { value: new THREE.Color(PALETTES.idle.b) },
    uColorScan: { value: new THREE.Color(PALETTES.idle.scan) },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const cloud = new THREE.Points(geo, mat);
  cloud.frustumCulled = false;
  scene.add(cloud);

  // لوحا الضغط (مثل جهاز الماموغرام): يظهرون وقت المسح وينطبقون على الثدي
  const paddleMat = new THREE.MeshBasicMaterial({ color: 0x7fe7ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
  const paddles = [1, -1].map((sgn) => {
    const g = new THREE.BoxGeometry(2.3, 0.025, 2.5);
    const mesh = new THREE.Mesh(g, paddleMat);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat));
    mesh.position.set(0.05, sgn * 1.75, 0);
    mesh.userData.sgn = sgn;
    cloud.add(mesh);
    return mesh;
  });
  const paddleState = { v: 0 };
  function updatePaddles() {
    const c = uniforms.uCompress.value;
    for (const m of paddles) m.position.y = m.userData.sgn * (1.75 - 0.72 * c);
    paddleMat.opacity = 0.07 * paddleState.v;
    edgeMat.opacity = 0.75 * paddleState.v;
  }

  // غبار بعيد ونجوم
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const dctx = dot.getContext('2d');
  const grad = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = grad; dctx.fillRect(0, 0, 32, 32);
  const DUST = mobile ? 2000 : 6000;
  const dPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dPos[i * 3] = (Math.random() - 0.5) * 40; dPos[i * 3 + 1] = (Math.random() - 0.5) * 24; dPos[i * 3 + 2] = -Math.random() * 30 + 2;
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({
    size: 0.06, color: 0x7fa8ff, map: new THREE.CanvasTexture(dot), transparent: true, opacity: 0.45,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(dust);

  // التوهج
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.35, 0.3);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const target = { x: 0, y: 0, scale: 1 };
  const mouse = new THREE.Vector2();
  addEventListener('pointermove', (e) => {
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });

  // الدقة: نستخدم كثافة بكسلات الشاشة كاملة لحد 4K، وننزل تلقائياً إذا الجهاز ما يلحك
  let quality = 1;
  function pixelRatio() {
    const w = innerWidth, h = innerHeight;
    return Math.max(0.75, Math.min(devicePixelRatio || 1, 3, Math.sqrt(MAX_PIXELS / (w * h))) * quality);
  }
  function resize() {
    const w = innerWidth, h = innerHeight, pr = pixelRatio();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    uniforms.uPixelRatio.value = pr;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let running = true, frames = 0, fpsStart = performance.now(), fps = 60, lowStreak = 0;
  const bornAt = performance.now();
  let spinSpeed = 0.08;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { clock.getDelta(); loop(); }
  });
  let currentShape = 'orb';
  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    uniforms.uTime.value += dt;
    if (currentShape === 'breast') {
      // الثدي: يتمايل حول المنظر الجانبي (مقطع سهمي) بدل ما يدور بالكامل، حتى التشريح يبقى واضح
      const sway = Math.sin(uniforms.uTime.value * 0.22) * 0.55 * (1 - uniforms.uScan.value);
      const target = -0.45 + sway - uniforms.uScan.value * 0.25;
      const cur = uniforms.uSpin.value;
      const diff = ((target - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      uniforms.uSpin.value = cur + diff * Math.min(1, dt * 1.2);
    } else {
      uniforms.uSpin.value += dt * (spinSpeed + uniforms.uScan.value * 0.9);
    }
    uniforms.uMouse.value.lerp(mouse, reduced ? 0.01 : 0.04);
    cloud.position.x += (target.x - cloud.position.x) * 0.04;
    cloud.position.y += (target.y - cloud.position.y) * 0.04;
    cloud.scale.setScalar(cloud.scale.x + (target.scale - cloud.scale.x) * 0.04);
    dust.rotation.y += dt * 0.01;
    camera.position.x += (mouse.x * 0.35 - camera.position.x) * 0.02;
    camera.position.y += (mouse.y * 0.22 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);
    updatePaddles();
    composer.render();

    // عداد الإطارات + جودة تتكيف
    frames++;
    const now = performance.now();
    if (now - fpsStart >= 1000) {
      fps = Math.round((frames * 1000) / (now - fpsStart)); frames = 0; fpsStart = now;
      // ننزل الدقة بس إذا الجهاز بطيء لثلاث ثواني متتالية (مو أثناء أول تحميل)
      if (now - bornAt > 4000 && fps < 30 && quality > 0.5) {
        if (++lowStreak >= 3) { quality = Math.max(0.5, quality - 0.25); resize(); lowStreak = 0; }
      } else lowStreak = 0;
      if (hud) {
        const w = renderer.domElement.width, h = renderer.domElement.height;
        hud.textContent = `WebGL · ${w}×${h}${w >= 3800 ? ' · 4K' : ''} · ${(COUNT / 1000).toFixed(0)}K particles · ${fps} fps`;
      }
    }
    requestAnimationFrame(loop);
  }
  loop();

  const gsap = window.gsap;
  gsap.to(uniforms.uAlpha, { value: 1, duration: 2.4, ease: 'power2.out' });

  function tweenColors(name, duration = 1.6) {
    const p = PALETTES[name] || PALETTES.idle;
    for (const [key, hex] of [['uColorA', p.a], ['uColorB', p.b], ['uColorScan', p.scan]]) {
      const c = new THREE.Color(hex);
      gsap.to(uniforms[key].value, { r: c.r, g: c.g, b: c.b, duration, ease: 'power2.inOut' });
    }
  }

  let morphTween = null;
  function morph(name, duration = reduced ? 0.01 : 2.6) {
    if (name === currentShape) return;
    currentShape = name;
    // نثبت المواقع الحالية (حتى لو التحول السابق ما كمل) ونبدأ منها
    const from = fromAttr.array, to = posAttr.array, m = uniforms.uMorph.value;
    if (m < 1) {
      for (let i = 0; i < COUNT; i++) {
        const k = Math.min(Math.max((m - randoms[i] * 0.35) / 0.65, 0), 1);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        for (let j = 0; j < 3; j++) from[i * 3 + j] = from[i * 3 + j] + (to[i * 3 + j] - from[i * 3 + j]) * e;
      }
    } else from.set(to);
    to.set(shapePositions(name, COUNT));
    fromAttr.needsUpdate = true; posAttr.needsUpdate = true;
    // ألوان تشريحية (الثدي): نبدّل الخصائص ونمزج الألوان تدريجياً
    const extras = shapeExtras(name, COUNT);
    if (extras) {
      tintAttr.array.set(extras.tint); flowAttr.array.set(extras.flow); flagAttr.array.set(extras.flag);
      tintAttr.needsUpdate = flowAttr.needsUpdate = flagAttr.needsUpdate = true;
    }
    gsap.to(uniforms.uTintMix, { value: extras ? 1 : 0, duration: duration * 0.9, ease: 'power2.inOut' });
    morphTween?.kill();
    uniforms.uMorph.value = 0;
    morphTween = gsap.to(uniforms.uMorph, { value: 1, duration, ease: 'none' });
    gsap.to(uniforms.uOrganic, { value: ORGANIC[name] ?? 1, duration: duration * 0.8, ease: 'power2.inOut' });
    // بالشاشات الضيقة الشكل يصير خلف النص، فنخففه حتى القراءة تبقى مريحة
    const behindText = innerWidth < 900 ? 0.45 : 1;
    gsap.to(uniforms.uGain, { value: (GAIN[name] ?? 1) * (mobile ? 1.6 : 1) * behindText, duration: duration * 0.7, ease: 'power2.inOut' });
    spinSpeed = name === 'orb' ? 0.08 : name === 'breast' ? 0.12 : 0.16;
  }

  let lastPlace = [0, 0, 1];
  function place(x, y, scale = 1) {
    lastPlace = [x, y, scale];
    const narrow = innerWidth < 900;
    // بالعربي (من اليمين لليسار) النص يصير يمين، فالشكل ينتقل لليسار
    const rtl = document.documentElement.dir === 'rtl';
    target.x = narrow ? 0 : (rtl ? -x : x);
    target.y = narrow ? 1.35 : y;
    target.scale = narrow ? scale * 0.55 : scale;
  }
  addEventListener('resize', () => place(...lastPlace));

  return {
    get shape() { return currentShape; },
    place,
    refreshPlace() { place(...lastPlace); },
    setState(name) {
      tweenColors(name);
      const scanning = name === 'scan';
      gsap.to(uniforms.uScan, { value: scanning ? 1 : 0, duration: 1.4, ease: 'power3.inOut' });
      // وقت المسح: وضع الأشعة السينية + لوحي الضغط ينزلون
      gsap.to(uniforms.uXray, { value: scanning ? 1 : 0, duration: 1.6, ease: 'power2.inOut' });
      gsap.to(paddleState, { v: scanning ? 1 : 0, duration: scanning ? 1 : 0.8, ease: 'power2.out' });
      gsap.to(uniforms.uCompress, { value: scanning ? 1 : 0, duration: scanning ? 2.2 : 1.6, ease: scanning ? 'power3.inOut' : 'elastic.out(1, 0.5)', delay: scanning ? 0.5 : 0 });
      // الورم يضوي بس إذا النتيجة مشبوهة
      gsap.to(uniforms.uLesion, { value: name === 'malignant' ? 1 : 0, duration: name === 'malignant' ? 2.4 : 1, ease: 'power2.inOut', delay: name === 'malignant' ? 0.6 : 0 });
      if (name === 'benign' || name === 'malignant') this.burst();
    },
    morph,
    burst() {
      gsap.fromTo(uniforms.uBurst, { value: 0 }, { value: 1, duration: 0.55, ease: 'expo.out', yoyo: true, repeat: 1 });
    },
  };
}

function fallbackScene() {
  return { shape: 'orb', place() {}, refreshPlace() {}, setState() {}, burst() {}, morph() {} };
}
