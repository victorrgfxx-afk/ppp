import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEX } from './textures.js';
import { rng, damp } from './util.js';

// A small campfire you can light and put out (E), by the red Doblò at the oil wells (geo/sonda.js FIRE).
//  * Cold: a ring of grey river stones blackened on the side facing the fire, a burnt patch fading out ragged into the
//    gravel, a bed of ash and coals, four split logs leaning together over two laid across, charred where the fire had
//    them, a log to sit on and a few split logs piled by the van.
//  * Lit, it catches over a few seconds, the kindling first. Seven tongues of flame rise from the logs (a cluster of
//    billboards turned to you about the vertical, drawn in one call; each one's fire made by noise in the shader: a
//    teardrop narrowing upwards, eaten into licks and flicks breaking off its top, dark red at the ragged edges, orange,
//    yellow, near white in the hot heart at the base; its light added to the view behind and that view partly hidden,
//    so it stays orange against a bright day and blooms at night). The charred wood and the coals glow through the
//    cracks of their alligatored char, pulsing. Sparks rise and drift with the wind, in bursts when the wood pops (with
//    the pop's crack). Smoke curls off in wisps, grey by day, dark against the night sky, lit warm from below. The air
//    above it shimmers (HeatShader, a pass after the temporal smoothing). A warm light flickers with the flames on the
//    gravel, the van and the trees, ~1900 K; at the High and Ultra settings it casts the stones', the van's and your
//    shadows, flickering with it.
//  * Put out, it hisses, the flames die down, the coals glow on for about a minute and a thicker, whiter smoke rises.
//  * Rain keeps it small. By day its light hardly shows against the sun. Beyond ~250 m only the stones and wood remain.

// ------------------------------------------------------------------ the flames
const FLAME_VS = /* glsl */`
attribute vec3 aOff;      // the tongue's foot, from the fire's centre (m)
attribute vec3 aSize;     // width, height (m), brightness
attribute float aSeed;
uniform vec3 uCam, uOrigin;
uniform float uLevel, uTime;
varying vec2 vUv;
varying float vSeed, vSize, vBright;
void main() {
  vec3 c = uOrigin + aOff;
  vec3 toCam = uCam - c; toCam.y = 0.0;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));
  // (each tongue flares and sinks on its own)
  float flick = 0.86 + 0.14 * sin(uTime * (3.1 + aSeed * 0.37) + aSeed * 5.0) * sin(uTime * (1.7 + aSeed * 0.21) + aSeed);
  vSize = clamp(uLevel * flick * (1.1 - 0.1 * step(0.5, fract(aSeed))), 0.0, 1.0);
  float w = aSize.x * (0.55 + 0.45 * uLevel);
  vec3 p = c + right * (position.x * w) + vec3(0.0, position.y * aSize.y, 0.0);
  vUv = uv; vSeed = aSeed; vBright = aSize.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FLAME_FS = /* glsl */`
uniform float uTime, uBright;
uniform vec2 uLean;       // the wind's bend across the view, at the tip (fraction of the width)
varying vec2 vUv;
varying float vSeed, vSize, vBright;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  float h = vUv.y / max(vSize, 0.01);                       // height in the tongue's own scale (0 foot, 1 tip)
  if (h > 1.0) discard;
  float x = (vUv.x - 0.5) * 2.0 - uLean.x * h * h;
  float t = uTime + vSeed * 3.7, s = vSeed;
  float n1 = fbm(vec2(x * 1.8 + s, h * 2.2 - t * 2.2));
  float n2 = fbm(vec2(x * 3.6 - s, h * 4.5 - t * 3.8));
  x += (n1 - 0.5) * 0.9 * h;                                // the flow sways more higher up
  // a teardrop narrowing upwards, eaten into licks by the noise, fading with height; flicks break off its top
  float w = 0.82 * pow(max(0.0, 1.0 - h), 0.75);
  float shape = 1.0 - smoothstep(w * 0.45, w, abs(x));
  float licks = 0.55 + 0.65 * smoothstep(0.32, 0.68, fbm(vec2(x * 4.2 + s * 3.0, h * 1.6 - t * 3.1)));
  float f = clamp(shape * smoothstep(0.0, 0.08, h) * (n2 * 1.5 - h * 0.95 + 0.12) * licks * 1.7, 0.0, 1.0);
  // dark red at the ragged edges and the tips, orange, yellow, near white in the hot heart at the foot
  vec3 c = mix(vec3(0.5, 0.05, 0.0), vec3(1.0, 0.3, 0.02), smoothstep(0.0, 0.4, f));
  c = mix(c, vec3(1.0, 0.6, 0.11), smoothstep(0.4, 0.75, f));
  c = mix(c, vec3(1.0, 0.8, 0.42), smoothstep(0.85, 1.0, f) * (1.0 - h));
  float a = smoothstep(0.02, 0.25, f);
  // premultiplied: its light added, the view behind it partly hidden (orange against a bright day too)
  gl_FragColor = vec4(c * uBright * vBright * a, a * 0.6);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// the tongues: foot (x, y, z from the centre), width, height, brightness, seed - the tall one in the middle, the
// others over the logs' tops round it, two low ones licking along the logs laid across
const TONGUES = [
  [0, 0.02, 0, 0.85, 1.05, 0.75, 1.3], [0.1, 0.03, 0.08, 0.55, 0.78, 0.5, 7.1], [-0.16, 0.02, 0.06, 0.42, 0.62, 0.6, 3.7],
  [0.14, 0.02, -0.12, 0.45, 0.66, 0.6, 5.3], [-0.05, 0.02, -0.17, 0.38, 0.5, 0.65, 9.9], [0.22, 0.01, 0.12, 0.3, 0.34, 0.7, 2.2],
  [-0.24, 0.01, -0.04, 0.3, 0.3, 0.7, 4.4],
];
export function flameCluster(origin) {
  const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(TONGUES.flatMap(t => t.slice(0, 3))), 3));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(TONGUES.flatMap(t => t.slice(3, 6))), 3));
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(TONGUES.map(t => t[6])), 1));
  g.instanceCount = TONGUES.length;
  const m = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3() }, uOrigin: { value: origin.clone() }, uLevel: { value: 1 }, uTime: { value: 0 }, uBright: { value: 1 }, uLean: { value: new THREE.Vector2() } },
    vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.userData.noAO = true;
  return mesh;
}

// ------------------------------------------------------------------ the air shimmering over it (a pass: post.js)
export const HeatShader = {
  uniforms: { tDiffuse: { value: null }, uBase: { value: new THREE.Vector2() }, uTop: { value: new THREE.Vector2() }, uHalfW: { value: 0.05 },
    uAspect: { value: 1 }, uStrength: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uBase, uTop;
uniform float uHalfW, uAspect, uStrength, uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 ax = uTop - uBase; ax.x *= uAspect;
  vec2 d = vUv - uBase; d.x *= uAspect;
  float L2 = max(dot(ax, ax), 1e-6), s = clamp(dot(d, ax) / L2, 0.0, 1.0);
  float across = length(d - ax * s) / max(uHalfW * (0.7 + 0.9 * s), 1e-4);    // (the column widens as it rises)
  float w = (1.0 - smoothstep(0.3, 1.0, across)) * smoothstep(0.0, 0.15, s) * (1.0 - s);
  vec2 uv = vUv;
  if (w > 0.002) {
    // rising cells of hot air: the view behind wobbles, sideways mostly
    vec2 q = vec2(dot(d, vec2(ax.y, -ax.x)) / sqrt(L2) / max(uHalfW, 1e-4), s * 6.0 - uTime * 2.2);
    float n = noise(q * vec2(5.0, 1.0) + vec2(0.0, uTime * 0.7)) - 0.5, m = noise(q * vec2(9.0, 1.7) + 7.3) - 0.5;
    uv += vec2(n + 0.5 * m, 0.4 * m) * uStrength * w;
  }
  gl_FragColor = texture2D(tDiffuse, uv);
}`,
};

// ------------------------------------------------------------------ textures
function valueNoise(seed) {
  const R = rng(seed), P = new Float32Array(256 * 256).map(() => R());
  const at = (i, j) => P[((j & 255) << 8) | (i & 255)];
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
}
// a wisp of smoke: soft at its edge, torn by noise inside
function smokeTexture() {
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), N = valueNoise(77);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, r = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
    let f = 0, a = 0.5, s = 4 / n;
    for (let o = 0; o < 4; o++) { f += a * N(x * s + o * 17, y * s + o * 31); s *= 2.1; a *= 0.5; }
    const v = Math.max(0, 1 - r) ** 1.4 * Math.max(0, f * 1.6 - 0.35);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, 255 * v * 1.5);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// the burnt patch: ash in the middle, the charcoal and the blackened gravel round it fading out ragged; its embers
function scorchTextures(R) {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  const e = document.createElement('canvas'); e.width = e.height = n;
  const ge = e.getContext('2d'), em = ge.createImageData(n, n);
  const blobs = Array.from({ length: 26 }, () => [R() * n, R() * n, 6 + R() * 22]);
  const sparks = Array.from({ length: 140 }, () => { const a = R() * 6.283, r = Math.sqrt(R()) * 0.38 * n; return [n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r, 1 + R() * 2.5, 0.4 + R() * 0.6]; });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, r = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
    let b = 0; for (const [bx, by, br] of blobs) b += Math.max(0, 1 - Math.hypot(x - bx, y - by) / br) * 0.35;
    const ash = Math.max(0, 1 - r / 0.42), soot = Math.min(1, Math.max(0, (1.05 - r - b * 0.25) / 0.45));
    const v = 18 + 70 * ash * (0.6 + 0.4 * Math.sin(x * 0.7) * Math.sin(y * 0.9)) + 10 * b;
    img.data[i] = v; img.data[i + 1] = v * 0.97; img.data[i + 2] = v * 0.94; img.data[i + 3] = 255 * Math.min(1, soot * 1.1);
    let k = 0; for (const [sx, sy, sr, sk] of sparks) { const d = Math.hypot(x - sx, y - sy); if (d < sr * 2) k += sk * Math.max(0, 1 - d / (sr * 2)); }
    k = Math.min(1, k) * Math.min(1, ash * 2.5);
    em.data[i] = 255 * k; em.data[i + 1] = 90 * k; em.data[i + 2] = 20 * k; em.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); ge.putImageData(em, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(e); emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}
// charred wood: the char split into blocks ("alligatored"), its cracks glowing (emissive), the blocks' tops with a
// dull sheen; a tile that repeats (the cells wrap round)
function charTextures(R) {
  const n = 128, pts = Array.from({ length: 34 }, () => [R() * n, R() * n]);
  const c = document.createElement('canvas'); c.width = c.height = n;
  const e = document.createElement('canvas'); e.width = e.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), ge = e.getContext('2d'), em = ge.createImageData(n, n), N = valueNoise(311);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let d1 = 1e9, d2 = 1e9;
    for (const [px, py] of pts) {
      const dx = Math.min(Math.abs(x - px), n - Math.abs(x - px)), dy = Math.min(Math.abs(y - py), n - Math.abs(y - py)), d = Math.hypot(dx, dy * 0.6);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1, i = (y * n + x) * 4, crack = Math.max(0, 1 - edge / 2.2), top = Math.min(1, edge / 9);
    const v = 70 + 120 * top * (0.7 + 0.3 * N(x * 0.15, y * 0.15)) - 60 * crack;
    img.data[i] = v; img.data[i + 1] = v * 0.96; img.data[i + 2] = v * 0.92; img.data[i + 3] = 255;
    const k = crack ** 1.5 * (0.55 + 0.45 * N(x * 0.08 + 5, y * 0.08));
    em.data[i] = 255 * k; em.data[i + 1] = 120 * k * k; em.data[i + 2] = 30 * k * k * k; em.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); ge.putImageData(em, 0, 0);
  const t = (cv, srgb) => { const x = new THREE.CanvasTexture(cv); x.wrapS = x.wrapT = THREE.RepeatWrapping; if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x; };
  return { map: t(c, true), emissiveMap: t(e, true) };
}

// a log along a -> b (world points), radius r, bark tinted col, charred from charA (at a) to charB (at b); glow: how
// much of the char glows (the burning wood's cracks)
function logGeo(a, b, r, col, charA, charB, R, glow = 0) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r * (0.9 + 0.2 * R()), r, L, 8, 4);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv, cols = [], gl = [];
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getY(i) / L + 0.5, cap = Math.abs(nrm.getY(i)) > 0.9;
    const ch = Math.min(1, Math.max(0, charA + (charB - charA) * v + (R() - 0.5) * 0.15)), k = 0.85 + 0.3 * R();
    // the bark (or the light split wood at the ends), blackened where the fire had it
    const base = cap ? [0.62, 0.46, 0.3] : col;
    cols.push(...base.map(c => c * k * (1 - 0.9 * ch) + 0.015 * ch));
    gl.push(glow * Math.max(0, ch - 0.3) / 0.7);
    // (the char's cells ~4 cm: the texture repeated round the log and along it)
    uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(r * 6.283 / 0.16)), uv.getY(i) * L / 0.16);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('glow', new THREE.Float32BufferAttribute(gl, 1));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
// a coal: a small rough lump, glowing through its cracks
function coalGeo(x, y, z, r, R) {
  const g = new THREE.IcosahedronGeometry(r, 0), p = g.attributes.position, cols = [], gl = [];
  for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.8 + 0.4 * R()), p.getY(k) * 0.6, p.getZ(k) * (0.8 + 0.4 * R()));
  g.computeVertexNormals();
  g.rotateY(R() * 6.283).translate(x, y + r * 0.35, z);
  for (let k = 0; k < p.count; k++) { const c = 0.03 + 0.04 * R(); cols.push(c, c * 0.95, c * 0.9); gl.push(0.7 + 0.3 * R()); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('glow', new THREE.Float32BufferAttribute(gl, 1));
  return g;
}

export class Campfire {
  // at: { x, z, y (the ground), seat: [x, z, yaw], wood: [x, z, yaw] }; ground(x, z): the height there;
  // opts.shadows: its light casts shadows, re-rendered every n-th frame (0: none)
  constructor(scene, world, at, ground = () => at.y, opts = {}) {
    const { x, z, y } = at, R = rng(8461);
    this.x = x; this.z = z; this.y = y;
    this.lit = false; this.level = 0; this.glow = 0; this.smolder = 0; this.t = 0; this.pops = 0; this.frame = 0;
    const g = this.group = new THREE.Group();
    scene.add(g);
    // the flames, sparks and smoke move too fast for the temporal smoothing (taa.js): drawn after it (main.js setFX)
    const fx = this.fx = new THREE.Group();
    scene.add(fx);
    // ---- the burnt patch, the ash and its embers
    const { map, emissiveMap } = scorchTextures(R);
    this.ashMat = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.ashMat.userData.noWet = true;                    // (a decal: the rain's leaf cut-out would chop its soft edge)
    const ash = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40).rotateX(-Math.PI / 2), this.ashMat);
    ash.position.set(x, y + 0.012, z); ash.receiveShadow = true; ash.renderOrder = -1;
    g.add(ash);
    // ---- the stone ring: 12 stones, half sunk, sooted on the side facing the fire
    const stones = [];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + (R() - 0.5) * 0.25, rr = 0.5 + (R() - 0.5) * 0.06;
      const sg = new THREE.IcosahedronGeometry(1, 1), p = sg.attributes.position;
      const s = [0.1 + R() * 0.06, 0.07 + R() * 0.05, 0.09 + R() * 0.05];
      // (the bumps hashed from each corner's direction: the faces' shared corners move together, no cracks)
      const seed = R() * 100;
      for (let k = 0; k < p.count; k++) {
        const h = Math.sin(p.getX(k) * 12.9898 + p.getY(k) * 78.233 + p.getZ(k) * 37.719 + seed) * 43758.5453, f = 0.8 + 0.4 * (h - Math.floor(h));
        p.setXYZ(k, p.getX(k) * s[0] * f, p.getY(k) * s[1] * f, p.getZ(k) * s[2] * f);
      }
      sg.rotateY(R() * 6.283).rotateX((R() - 0.5) * 0.5);
      const sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr;
      sg.translate(sx, ground(sx, sz) + s[1] * 0.45, sz);
      const tone = 0.13 + R() * 0.09, warm = R() * 0.02, cols = [];          // (linear: grey river stones, ~0.4-0.5 on the screen)
      for (let k = 0; k < p.count; k++) {
        const vx = p.getX(k) - x, vz = p.getZ(k) - z, inner = Math.max(0, 1 - (Math.hypot(vx, vz) - 0.38) / 0.16);
        const top = Math.max(0, (p.getY(k) - y) / 0.12), soot = Math.min(1, inner * 0.85 + top * 0.25 * inner);
        const c = tone * (0.92 + 0.16 * R()) * (1 - 0.82 * soot);
        cols.push(c + warm, c, c - warm * 0.5);
      }
      sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      stones.push(sg.toNonIndexed());
    }
    const stoneMesh = new THREE.Mesh(mergeGeometries(stones), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    stoneMesh.castShadow = stoneMesh.receiveShadow = true;
    g.add(stoneMesh);
    // ---- the burning wood: two logs laid across, four leaning together over them, the coals between; its char glows
    const V = (a, b, c) => new THREE.Vector3(a, b, c), burning = [], bark = [0.36, 0.25, 0.16];
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI / 2 + 0.4 + R() * 0.3, c = Math.cos(a), s = Math.sin(a);
      burning.push(logGeo(V(x - c * 0.3, y + 0.05 + i * 0.07, z - s * 0.3), V(x + c * 0.3, y + 0.06 + i * 0.07, z + s * 0.3), 0.045, bark, 0.85, 0.85, R, 1));
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.2 + R() * 0.4, c = Math.cos(a), s = Math.sin(a);
      burning.push(logGeo(V(x + c * 0.32, y + 0.03, z + s * 0.32), V(x + c * 0.04, y + 0.42 + R() * 0.06, z + s * 0.04), 0.04 + R() * 0.015, bark, 0.3, 0.95, R, 1));
    }
    for (let i = 0; i < 34; i++) { const a = R() * 6.283, r = Math.sqrt(R()) * 0.3; burning.push(coalGeo(x + Math.cos(a) * r, y + 0.015, z + Math.sin(a) * r, 0.025 + R() * 0.03, R)); }
    const charT = charTextures(R);
    this.glowU = { value: 0 };
    const burnMat = new THREE.MeshStandardMaterial({ map: charT.map, emissiveMap: charT.emissiveMap, emissive: 0xff5a14, roughness: 0.92, vertexColors: true });
    burnMat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = this.glowU;
      sh.vertexShader = 'attribute float glow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = glow;');
      sh.fragmentShader = 'varying float vGlow;\nuniform float uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vGlow * uGlow;');
    };
    burnMat.customProgramCacheKey = () => 'campfireBurn';
    const burnMesh = new THREE.Mesh(mergeGeometries(burning.map(l => l.toNonIndexed())), burnMat);
    burnMesh.receiveShadow = true;                        // (no shadows cast from inside the light: they would spoke the ground)
    g.add(burnMesh);
    // ---- the seat and the pile (bark, ends sawn)
    const cold = [];
    const [sx, sz, sy] = at.seat, sc = Math.cos(sy), ss = Math.sin(sy), sh = ground(sx, sz) + 0.13;   // (settled a little into the gravel)
    cold.push(logGeo(V(sx - sc * 0.85, sh, sz - ss * 0.85), V(sx + sc * 0.85, sh + 0.02, sz + ss * 0.85), 0.17, [0.3, 0.22, 0.15], 0, 0, R));
    const [wx, wz, wy] = at.wood, wc = Math.cos(wy), ws = Math.sin(wy), wh = ground(wx, wz);
    for (let row = 0; row < 2; row++) for (let k = 0; k < 3 - row; k++) {
      const o = (k - (2 - row) / 2) * 0.13, px = wx - ws * o, pz = wz + wc * o, py = wh + 0.055 + row * 0.1;
      cold.push(logGeo(V(px - wc * 0.3, py, pz - ws * 0.3), V(px + wc * 0.3, py, pz + ws * 0.3), 0.05 + R() * 0.012, bark, 0, 0, R));
    }
    const coldMesh = new THREE.Mesh(mergeGeometries(cold.map(l => { l.deleteAttribute('glow'); return l.toNonIndexed(); })), new THREE.MeshStandardMaterial({ map: TEX.bark, normalMap: TEX.barkN, roughness: 0.95, vertexColors: true }));
    coldMesh.castShadow = coldMesh.receiveShadow = true;
    g.add(coldMesh);
    // you don't walk into the fire (the seat and the pile are low enough to step over)
    world.addStatic(new world.Box(x, z, 0.5, 0.5, 0, y - 1, y + 0.9, 'campfire'));
    // ---- the flames
    this.flames = flameCluster(new THREE.Vector3(x, y, z));
    this.flames.visible = false;
    fx.add(this.flames);
    // ---- the sparks: points rising from the fire, cooling from yellow to dull red as they go
    const NS = this.NS = 64;
    this.sp = Array.from({ length: NS }, () => ({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 1 }));
    const spg = new THREE.BufferGeometry();
    spg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NS * 3), 3));
    spg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(NS * 3), 3));
    this.sparks = new THREE.Points(spg, new THREE.PointsMaterial({ size: 0.022, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false; this.sparks.visible = false; this.sparks.userData.noAO = true;
    fx.add(this.sparks);
    // ---- the smoke: wisps that rise, widen, turn and thin out
    const puff = smokeTexture();
    this.smoke = Array.from({ length: 16 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0x8a8884, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; s.userData = { age: 1, life: 1, vx: 0, vz: 0, s0: 0.4, s1: 2, a: 0.3, rot: 0, g: 0.55 };
      fx.add(s);
      return s;
    });
    this.nextPuff = 0;
    // ---- its light: warm (~1900 K), flickering with the flames, a little above the logs
    const l = this.light = new THREE.PointLight(0xff8a3c, 0, 18, 2);
    l.position.set(x, y + 0.55, z);
    this.shadowEvery = opts.shadows || 0;
    if (this.shadowEvery) {
      l.castShadow = true;
      l.shadow.mapSize.set(512, 512);
      l.shadow.camera.near = 0.12; l.shadow.camera.far = 12;
      l.shadow.bias = -0.003; l.shadow.normalBias = 0.03; l.shadow.radius = 4;
      l.shadow.autoUpdate = false;
    }
    g.add(l);
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
  }
  near(px, pz) { return Math.hypot(px - this.x, pz - this.z) < 2.0; }
  set(on) { const was = this.lit; this.lit = !!on; if (was && !on && this.level > 0.2) this.smolder = 1; return was !== this.lit; }
  // how loud its crackle is from p (0..1)
  audible(p) { const d = Math.hypot(p.x - this.x, p.z - this.z); return this.level * Math.min(1, 2.5 / Math.max(d, 1)) * (d < 40 ? 1 : 0); }
  // env: { night 0..1, rain 0..1, wind THREE.Vector2 (m/s, x z), heat: the shimmer pass (post.js), camera }
  update(dt, cam, env = {}) {
    const d = Math.hypot(cam.x - this.x, cam.z - this.z), seen = d < 250;
    this.t += dt; this.frame++;
    // it catches over a few seconds (the kindling first) and dies down in a few; rain keeps it small
    const rain = env.rain ?? 0, target = this.lit ? 1 - 0.45 * rain : 0;
    this.level = damp(this.level, target, this.lit ? (this.level < 0.3 ? 0.35 : 0.8) : 1.1, dt);
    if (this.level < 0.003 && !this.lit) this.level = 0;
    this.glow = damp(this.glow, this.lit ? 1 : 0, this.lit ? 0.4 : 0.035, dt);        // (the coals glow on for a minute)
    this.smolder = Math.max(0, this.smolder - dt / 16);
    const L = this.level, night = env.night ?? 0, t = this.t;
    // the flicker: the light and the glow breathe with the flames (a slow swell, quicker flutters)
    const fl = 0.78 + 0.16 * Math.sin(t * 7.3 + Math.sin(t * 2.1) * 2) + 0.09 * Math.sin(t * 17.9 + 1.3) + 0.05 * Math.sin(t * 31.7);
    // (by day the fire's light hardly shows against the sun; at night it lights the clearing: ~10 cd, like the torch's
    // pool on the ground at 2 m, scaled with the night's exposure)
    this.light.intensity = seen ? 10 * L * fl * (0.06 + 0.94 * night) : 0;
    this.light.position.set(this.x + 0.05 * Math.sin(t * 5.1), this.y + 0.55 + 0.06 * Math.sin(t * 6.7), this.z + 0.05 * Math.cos(t * 4.3));
    if (this.shadowEvery && L > 0.05 && night > 0.15 && d < 60 && this.frame % this.shadowEvery === 0) this.light.shadow.needsUpdate = true;
    const ember = Math.max(L, this.glow * 0.75);
    this.glowU.value = seen ? ember * (2.2 + 1.4 * fl) * (0.6 + 0.4 * night) * (0.85 + 0.15 * Math.sin(t * 1.3)) : 0;
    this.ashMat.emissiveIntensity = seen ? (0.9 + 0.6 * fl) * ember * (0.5 + 0.5 * night) : 0;
    const wind = env.wind ?? null, wx = wind ? wind.x : 0, wz = wind ? wind.y : 0;
    // the flames turned to you (in their vertex shader), bent by the wind across the view
    this.flames.visible = seen && L > 0.01;
    if (this.flames.visible) {
      const u = this.flames.material.uniforms, yaw = Math.atan2(cam.x - this.x, cam.z - this.z);
      u.uCam.value.copy(cam); u.uTime.value = t; u.uLevel.value = Math.min(1, L * (0.93 + 0.07 * fl));
      u.uLean.value.set(Math.max(-0.6, Math.min(0.6, (wx * Math.cos(yaw) - wz * Math.sin(yaw)) * 0.08)), 0);
      u.uBright.value = 0.9 + 0.2 * fl;
    }
    // the sparks: a steady trickle, and a burst when the wood pops
    const sp = this.sp, pos = this.sparks.geometry.attributes.position, col = this.sparks.geometry.attributes.color;
    let burst = 0;
    if (seen && L > 0.5 && Math.random() < dt * 0.35 * L) { burst = 7 + Math.floor(Math.random() * 7); this.pops++; }
    this.sparks.visible = seen && (L > 0.05 || sp.some(s => s.age < s.life));
    if (this.sparks.visible) {
      for (let i = 0; i < this.NS; i++) {
        const s = sp[i];
        s.age += dt;
        if (s.age >= s.life && ((L > 0.3 && Math.random() < dt * 7 * L) || burst > 0)) {
          const big = burst > 0, a = Math.random() * 6.283, r = Math.random() * 0.18;
          if (big) burst--;
          Object.assign(s, { x: this.x + Math.cos(a) * r, y: this.y + 0.2 + Math.random() * 0.25, z: this.z + Math.sin(a) * r,
            vx: (Math.random() - 0.5) * (big ? 2.2 : 0.5), vy: (big ? 1.8 : 0.9) + Math.random() * (big ? 2.2 : 1.4), vz: (Math.random() - 0.5) * (big ? 2.2 : 0.5), life: 0.7 + Math.random() * 1.8, age: 0 });
        }
        const k = s.age < s.life ? 1 - s.age / s.life : 0;
        if (k > 0) {
          s.vx += ((wx - s.vx) * 0.6 + (Math.random() - 0.5) * 3) * dt; s.vz += ((wz - s.vz) * 0.6 + (Math.random() - 0.5) * 3) * dt;
          s.vy -= 0.25 * dt;
          s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        }
        pos.setXYZ(i, s.x, k > 0 ? s.y : -999, s.z);
        col.setXYZ(i, 4.0 * k, (0.5 + 1.4 * k) * k, 0.3 * k * k);
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    }
    // the smoke: thin and grey from the fire, thicker and whiter for a while after it is put out
    const puffRate = seen ? L * 2.2 + this.smolder * 3 : 0;
    this.nextPuff -= dt * puffRate;
    for (const s of this.smoke) {
      const u = s.userData;
      if (this.nextPuff <= 0 && u.age >= u.life) {
        this.nextPuff += 1;
        const white = this.smolder > L ? 1 : 0;
        Object.assign(u, { age: 0, life: 4.5 + Math.random() * 3.5, vx: (Math.random() - 0.5) * 0.12, vz: (Math.random() - 0.5) * 0.12, s0: 0.3 + Math.random() * 0.2, s1: 1.6 + Math.random() * 1.4,
          a: 0.2 + 0.25 * Math.max(L * 0.6, this.smolder) + 0.08 * white, rot: (Math.random() - 0.5) * 0.7 });
        s.position.set(this.x + (Math.random() - 0.5) * 0.15, this.y + 0.6 + 0.3 * L, this.z + (Math.random() - 0.5) * 0.15);
        u.g = white ? 0.8 : 0.58;
        s.material.rotation = Math.random() * 6.283;
      }
      u.age += dt;
      const k = u.age / u.life;
      s.visible = seen && k < 1;
      if (!s.visible) continue;
      u.vx += (wx * 0.35 - u.vx) * 0.5 * dt; u.vz += (wz * 0.35 - u.vz) * 0.5 * dt;
      s.position.x += u.vx * dt; s.position.z += u.vz * dt; s.position.y += (0.6 - 0.28 * k) * dt;
      const sc = u.s0 + (u.s1 - u.s0) * Math.sqrt(k);
      s.scale.set(sc, sc, 1);
      s.material.rotation += u.rot * dt;
      // (by night dark against the sky, only its first metre lit warm from below by the fire)
      const dim = 0.07 + 0.93 * (1 - night), glowC = night * L * (1 - k) ** 3 * 0.35;     // (the night's exposure is ~2.6x)
      s.material.color.setRGB(u.g * dim + glowC, u.g * dim + glowC * 0.45, u.g * dim + glowC * 0.15);
      s.material.opacity = u.a * Math.min(1, k * 6) * (1 - k) * (1 - 0.35 * night);
    }
    // the air shimmering over it: the column from the flames' tips up ~2 m, on the screen (off far off or out of view)
    const heat = env.heat, camera = env.camera;
    if (heat) {
      let on = seen && L > 0.05 && d > 1.2 && d < 40 && camera;
      if (on) {
        const b = this._v.set(this.x, this.y + 0.5 + 0.4 * L, this.z).project(camera), top = this._w.set(this.x, this.y + 2.8, this.z).project(camera);
        on = b.z < 1 && top.z < 1 && Math.abs(b.x) < 1.4 && b.y > -1.4 && top.y > -1.2 && b.y < 1.2;
        if (on) {
          const u = heat.uniforms;
          u.uBase.value.set((b.x + 1) / 2, (b.y + 1) / 2); u.uTop.value.set((top.x + 1) / 2, (top.y + 1) / 2);
          u.uAspect.value = camera.aspect;
          // (the column ~0.5 m wide each side at the flames: its half width on the screen, in units of the height)
          u.uHalfW.value = 0.5 / Math.max(0.5, d) / Math.tan(camera.fov * Math.PI / 360) / 2;
          u.uStrength.value = 0.0028 * L * Math.min(1, (40 - d) / 25) * (1 - 0.5 * rain);      // (a few pixels)
          u.uTime.value = t;
        }
      }
      heat.enabled = !!on;
    }
  }
}
