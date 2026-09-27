// مشهد WebGL: كرة جسيمات حيّة تتفاعل مع حالة التحليل
// الحالات: idle → scan → benign | malignant
import * as THREE from 'three';

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
uniform float uScan;      // 0..1 شدة المسح
uniform float uBurst;     // 0..1 انفجار لحظي
uniform float uCalm;      // 0..1 هدوء (reduced motion)
uniform vec2  uMouse;
uniform float uPixelRatio;
attribute float aRandom;
attribute float aLayer;   // 0 قشرة ، 1 نواة
varying float vGlow;
varying float vLayer;
varying float vScanLine;
${noiseGLSL}
void main(){
  vec3 p = position;
  float t = uTime * mix(0.35, 0.08, uCalm);
  float n = snoise(p * 1.4 + vec3(t, t * 0.6, -t));
  float n2 = snoise(p * 3.5 - vec3(t * 1.7));
  float amp = mix(0.28, 0.12, aLayer) + uScan * 0.18;
  p += normalize(p) * (n * amp + n2 * 0.05 * (1.0 + uScan * 3.0));
  p *= 1.0 + uBurst * (0.6 + aRandom * 1.4);

  // دوران ذاتي + ميل مع الماوس
  float ang = uTime * (0.08 + uScan * 0.9);
  float c = cos(ang), s = sin(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p.y += uMouse.y * 0.15; p.x += uMouse.x * 0.15;

  // خط المسح يمر عمودياً عبر الكرة
  float scanY = sin(uTime * 2.2) * 1.6;
  vScanLine = uScan * smoothstep(0.18, 0.0, abs(p.y - scanY));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(2.2, 3.4, aRandom) * (1.0 + vScanLine * 2.5 + uBurst * 1.5);
  gl_PointSize = size * uPixelRatio * (6.0 / -mv.z);
  vGlow = 0.45 + 0.55 * (n * 0.5 + 0.5);
  vLayer = aLayer;
}`;

const fragmentShader = /* glsl */`
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorScan;
uniform float uAlpha;
varying float vGlow;
varying float vLayer;
varying float vScanLine;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = exp(-d * d * 18.0);
  vec3 col = mix(uColorA, uColorB, vLayer * 0.8 + vGlow * 0.3);
  col = mix(col, uColorScan, vScanLine);
  gl_FragColor = vec4(col * (0.6 + vGlow), a * uAlpha * (0.55 + vScanLine));
}`;

const PALETTES = {
  idle:      { a: '#3fd8ff', b: '#ff4f9a', scan: '#ffffff' },
  scan:      { a: '#6f7bff', b: '#3fd8ff', scan: '#e8fbff' },
  benign:    { a: '#27f5b0', b: '#3fd8ff', scan: '#ffffff' },
  malignant: { a: '#ff3b5c', b: '#ff9a3b', scan: '#ffffff' },
};

export function createScene(canvas) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.documentElement.classList.add('no-webgl');
    return fallbackScene();
  }
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  const mobile = innerWidth < 700;
  const COUNT = mobile ? 26000 : 70000;
  const positions = new Float32Array(COUNT * 3);
  const randoms = new Float32Array(COUNT);
  const layers = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const core = Math.random() < 0.28;
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u, phi = Math.acos(2 * v - 1);
    const r = core ? Math.cbrt(Math.random()) * 0.9 : 1.25 + (Math.random() - 0.5) * 0.12;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    randoms[i] = Math.random();
    layers[i] = core ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
  geo.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));

  const uniforms = {
    uTime: { value: 0 }, uScan: { value: 0 }, uBurst: { value: 0 }, uCalm: { value: reduced ? 1 : 0 },
    uMouse: { value: new THREE.Vector2() }, uPixelRatio: { value: dpr }, uAlpha: { value: 0 },
    uColorA: { value: new THREE.Color(PALETTES.idle.a) },
    uColorB: { value: new THREE.Color(PALETTES.idle.b) },
    uColorScan: { value: new THREE.Color(PALETTES.idle.scan) },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const orb = new THREE.Points(geo, mat);
  scene.add(orb);

  // غبار خلفي بعيد
  const DUST = mobile ? 1500 : 4000;
  const dPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST * 3; i++) dPos[i] = (Math.random() - 0.5) * 30;
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  // نقطة دائرية ناعمة بدل المربع
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const g = dot.getContext('2d').createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  const ctx = dot.getContext('2d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({
    size: 0.05, color: 0x7fa8ff, map: new THREE.CanvasTexture(dot), transparent: true, opacity: 0.4,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(dust);

  const target = { x: 0, y: 0, scale: 1 };
  const mouse = new THREE.Vector2();
  addEventListener('pointermove', (e) => {
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { clock.getDelta(); loop(); }
  });
  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    uniforms.uTime.value += dt;
    uniforms.uMouse.value.lerp(mouse, reduced ? 0.01 : 0.04);
    orb.position.x += (target.x - orb.position.x) * 0.05;
    orb.position.y += (target.y - orb.position.y) * 0.05;
    const s = orb.scale.x + (target.scale - orb.scale.x) * 0.05;
    orb.scale.setScalar(s);
    dust.rotation.y += dt * 0.01;
    camera.position.x += (mouse.x * 0.3 - camera.position.x) * 0.02;
    camera.position.y += (mouse.y * 0.2 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();

  const gsap = window.gsap;
  gsap.to(uniforms.uAlpha, { value: 1, duration: 2.4, ease: 'power2.out' });

  function tweenColors(name, duration = 1.2) {
    const p = PALETTES[name];
    for (const [key, hex] of [['uColorA', p.a], ['uColorB', p.b], ['uColorScan', p.scan]]) {
      const c = new THREE.Color(hex);
      gsap.to(uniforms[key].value, { r: c.r, g: c.g, b: c.b, duration, ease: 'power2.inOut' });
    }
  }

  return {
    // يحرّك الكرة لموقع بالشاشة (وحدات المشهد) وحجم
    place(x, y, scale = 1) {
      // بالموبايل نرفع الكرة لفوق ونصغرها حتى ما تغطي النص
      const narrow = innerWidth < 900;
      target.x = narrow ? 0 : x;
      target.y = narrow ? 1.35 : y;
      target.scale = narrow ? scale * 0.55 : scale;
    },
    setState(name) {
      tweenColors(name);
      if (name === 'scan') {
        gsap.to(uniforms.uScan, { value: 1, duration: 1.2, ease: 'power3.out' });
      } else {
        gsap.to(uniforms.uScan, { value: 0, duration: 1.4, ease: 'power3.inOut' });
      }
      if (name === 'benign' || name === 'malignant') this.burst();
    },
    burst() {
      gsap.fromTo(uniforms.uBurst, { value: 0 }, {
        value: 1, duration: 0.5, ease: 'expo.out', yoyo: true, repeat: 1,
      });
    },
  };
}

function fallbackScene() {
  return { place() {}, setState() {}, burst() {} };
}
