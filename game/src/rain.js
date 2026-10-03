import * as THREE from 'three';

// Torrential rain: falling streaks, splashes, wet surfaces with puddles, water running down sloped roads and raindrop
// rings, all stopped by whatever is on top. A top-down height map around the camera (the highest surface: crowns,
// roofs, car roofs, bridge decks, the ground) tells where the rain lands: drops vanish there, splashes sit on it and
// whatever lies more than ~0.5 m under it stays sheltered (damp, no rings, no running water).

// shared uniform objects: the very same ones are put into every patched material, so one write reaches all
export const RAIN = {
  uWet: { value: 0 },          // how wet the surfaces are (0..1, follows the rain slowly)
  uRain: { value: 0 },         // how hard it rains now (0..1)
  uRainTime: { value: 0 },
  uOcc: { value: null },
  uOccBox: { value: new THREE.Vector4(0, 0, 48, 0) },   // centre x, z, half size (m), reference height
  uOccOn: { value: 0 },
};

// the height map look-up, shared by the surface, streak and splash shaders (top surface height or -1e5 outside)
const OCC_GLSL = /* glsl */`
float rainTop(vec2 xz) {
  if (uOccOn < 0.5) return -1e5;
  vec2 uv = vec2(0.5 + (xz.x - uOccBox.x) / (2.0 * uOccBox.z), 0.5 - (xz.y - uOccBox.y) / (2.0 * uOccBox.z));
  if (any(lessThan(uv, vec2(0.004))) || any(greaterThan(uv, vec2(0.996)))) return -1e5;
  return texture2D(uOcc, uv).r + uOccBox.w;
}
float rainHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

// ------------------------------------------------------------------ wet surfaces
const WET_PARS = /* glsl */`
uniform float uWet, uRain, uRainTime, uOccOn;
uniform sampler2D uOcc;
uniform vec4 uOccBox;
varying vec3 vWetP;
${OCC_GLSL}
float wetNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rainHash(i), rainHash(i + vec2(1.0, 0.0)), f.x), mix(rainHash(i + vec2(0.0, 1.0)), rainHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// raindrop rings: in every ~0.3 m cell a drop lands at a random spot and time; the ring runs out and fades.
// Returns the slope (gradient) of the water surface in world x / z.
vec2 wetRipples(vec2 p, float t) {
  vec2 g = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * 3.3 + float(k) * vec2(0.37, 0.71);
    vec2 c = floor(q), f = fract(q);
    float h = rainHash(c + float(k) * 17.0);
    vec2 o = vec2(rainHash(c + 3.7), rainHash(c + 9.1)) * 0.4 + 0.3;
    float ph = fract(t * 1.7 + h);
    vec2 d = f - o; float r = length(d) + 1e-4;
    float x = (r - ph * 0.3) * 26.0;
    g += d / r * sin(x * 2.4) * exp(-x * x * 0.5) * (1.0 - ph) * (1.0 - ph) * step(r, 0.42);
  }
  return g;
}
float wetOpen(vec3 wp) {
  float top = rainTop(wp.xz);
  return top < -1e4 ? 1.0 : 1.0 - smoothstep(0.3, 0.9, top - wp.y);
}
`;

const WET_MAIN = /* glsl */`
if (uWet > 0.001) {
  vec3 wp = vWetP;
  float upF = smoothstep(0.6, 0.92, wetGeoN.y);
  float open = wetOpen(wp);
  float wet = uWet * mix(0.3, 1.0, open);
  // porous things darken when soaked (soil, plaster, asphalt), metal and paint hardly; everything gets glossier
  float por = clamp((roughnessFactor - 0.25) / 0.6, 0.0, 1.0) * (1.0 - metalnessFactor);
#ifndef WET_LEAF
  diffuseColor.rgb *= 1.0 - wet * por * mix(0.3, 0.45, upF);
#endif
  roughnessFactor = mix(roughnessFactor, roughnessFactor * mix(0.7, 0.35, upF), wet);
  vec2 slopeW = vec2(0.0);
  float water = 0.0;
#ifdef WET_ROAD
  {
    // the real tilt of the surface (the road ribbons carry flat normals): puddles on the level, a running film downhill
    vec3 gN = normalize(cross(dFdx(wp), dFdy(wp)));
    if (dot(gN, wetGeoN) < 0.0) gN = -gN;
    float sl = length(gN.xz) / max(gN.y, 0.05);
    float lvl = 1.0 - smoothstep(0.012, 0.035, sl);
    float n = wetNoise(wp.xz * 0.45) * 0.65 + wetNoise(wp.xz * 1.7 + 5.3) * 0.35;
    float pud = smoothstep(0.6, 0.7, n) * lvl;
    vec2 fd = normalize(gN.xz + vec2(1e-5));          // downhill
    vec2 fa = vec2(-fd.y, fd.x);
    float al = dot(wp.xz, fd), ac = dot(wp.xz, fa);
    float sp = clamp(sl * 14.0, 0.7, 3.0);             // faster on steeper roads (m/s scale)
    float s1 = wetNoise(vec2(ac * 3.0, al * 0.7 - uRainTime * sp));
    float s2 = wetNoise(vec2(ac * 7.5 + 3.1, al * 1.6 - uRainTime * sp * 2.1));
    float flowing = smoothstep(0.025, 0.05, sl);
    float sheet = flowing * (0.55 + 0.45 * smoothstep(0.35, 0.7, s1 * 0.65 + s2 * 0.35 + 0.08));   // a continuous film, thicker in rills
    water = max(pud, sheet) * open * upF * uWet;
    // wavelets of the running film, drawn out along the flow
    float s3 = wetNoise(vec2((ac + 0.12) * 7.5 + 3.1, al * 1.6 - uRainTime * sp * 2.1));
    float s4 = wetNoise(vec2(ac * 7.5 + 3.1, (al + 0.3) * 1.6 - uRainTime * sp * 2.1));
    slopeW += (fa * (s3 - s2) + fd * (s4 - s2) * 0.5) * 0.9 * sheet * open * upF * uWet;
  }
#endif
  diffuseColor.rgb *= 1.0 - 0.3 * water;
  roughnessFactor = mix(roughnessFactor, 0.06, water);
  // raindrop rings where the rain lands: open, level, near the camera (beyond ~25 m they are below a pixel)
  float rip = uRain * open * upF * (1.0 - smoothstep(12.0, 26.0, length(wp - cameraPosition)));
#ifdef WET_LEAF
  rip = 0.0;
#endif
#ifndef WET_ROAD
  rip *= 0.35;
#endif
  if (rip > 0.01) slopeW += wetRipples(wp.xz, uRainTime) * rip * mix(0.05, 0.24, water);   // rings show on standing water, faintly on a wet film
  normal = normalize(normal - (viewMatrix * vec4(slopeW.x, 0.0, slopeW.y, 0.0)).xyz);
}
`;

function injectWet(sh, kind) {
  const v = sh.vertexShader, f = sh.fragmentShader;
  if (v.includes('vWetP')) return;                 // already in (a material cloned from a patched one keeps its hook)
  if (!v.includes('#include <project_vertex>') || !f.includes('#include <normal_fragment_maps>') || !f.includes('#include <normal_fragment_begin>') || !f.includes('#include <lights_physical_fragment>')) return;
  Object.assign(sh.uniforms, RAIN);
  sh.vertexShader = v.replace('#include <common>', '#include <common>\nvarying vec3 vWetP;').replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wetW = vec4(transformed, 1.0);
#ifdef USE_BATCHING
    wetW = batchingMatrix * wetW;
#endif
#ifdef USE_INSTANCING
    wetW = instanceMatrix * wetW;
#endif
    vWetP = (modelMatrix * wetW).xyz; }`);
  const def = kind === 'road' ? '#define WET_ROAD\n' : kind === 'leaf' ? '#define WET_LEAF\n' : '';
  sh.fragmentShader = f.replace('#include <common>', '#include <common>\n' + def + WET_PARS)
    .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nvec3 wetGeoN = inverseTransformDirection(normal, viewMatrix);')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WET_MAIN);
}

// Make a standard / physical material react to the rain (its own onBeforeCompile, if any, runs first).
// Road surfaces are tagged with userData.wet = 'road' (the clones of M.asphalt, M.pavers, M.concrete inherit it).
const patched = new WeakSet();
export function wetMaterial(m) {
  if (!m || patched.has(m)) return;
  patched.add(m);
  if (!m.isMeshStandardMaterial || m.userData.noWet) return;
  const kind = m.userData.wet === 'road' ? 'road' : (m.alphaTest > 0 || m.transparent) ? 'leaf' : 'solid';
  const key0 = m.customProgramCacheKey();
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = function (sh, r) { prev.call(this, sh, r); injectWet(sh, kind); };
  m.customProgramCacheKey = () => key0 + '|wet-' + kind;
  m.needsUpdate = true;
}
export function wetScene(root) {
  root.traverse((o) => {
    if (!o.material) return;
    if (Array.isArray(o.material)) o.material.forEach(wetMaterial); else wetMaterial(o.material);
  });
}

// ------------------------------------------------------------------ the height map seen from above
const OCC_VERT = /* glsl */`
uniform float uRef;
varying float vH;
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  p = modelMatrix * p;
  vH = p.y - uRef;
  gl_Position = projectionMatrix * viewMatrix * p;
}`;
const OCC_FRAG = /* glsl */`
varying float vH;
void main() { gl_FragColor = vec4(vH, 0.0, 0.0, 1.0); }`;

const _cc = new THREE.Color();
export class RainOcclusion {
  constructor(size = 512, half = 48) {
    this.half = half;
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: true });
    this.cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 1500);
    this.cam.rotation.set(-Math.PI / 2, 0, 0);                 // looking straight down: screen right = +x, up = -z
    this.mat = new THREE.ShaderMaterial({ vertexShader: OCC_VERT, fragmentShader: OCC_FRAG, uniforms: { uRef: { value: 0 } }, side: THREE.DoubleSide });
    RAIN.uOcc.value = this.rt.texture;
    this.last = new THREE.Vector2(1e9, 1e9);
    this.frame = 0;
  }

  // re-rendered when the camera has moved 6 m, else every 30 frames (cars and dogs move)
  update(renderer, scene, camPos, groundY, hide) {
    this.frame++;
    if (Math.hypot(camPos.x - this.last.x, camPos.z - this.last.y) < 6 && this.frame % 30) return;
    const cx = Math.round(camPos.x / 2) * 2, cz = Math.round(camPos.z / 2) * 2;
    this.last.set(camPos.x, camPos.z);
    this.cam.position.set(cx, Math.max(camPos.y, groundY) + 600, cz);
    this.cam.updateMatrixWorld();
    this.mat.uniforms.uRef.value = groundY;
    const rt0 = renderer.getRenderTarget(), bg = scene.background, ov = scene.overrideMaterial, sm = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(_cc); const ca = renderer.getClearAlpha();
    const vis = hide.map(o => o.visible);
    for (const o of hide) o.visible = false;
    scene.background = null; scene.overrideMaterial = this.mat; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);                         // (nothing drawn: taken as the ground near the camera)
    renderer.clear();
    renderer.render(scene, this.cam);
    renderer.setRenderTarget(rt0);
    renderer.setClearColor(_cc, ca);
    scene.background = bg; scene.overrideMaterial = ov; renderer.shadowMap.autoUpdate = sm;
    hide.forEach((o, i) => { o.visible = vis[i]; });
    RAIN.uOccBox.value.set(cx, cz, this.half, groundY);
    RAIN.uOccOn.value = 1;
  }
}

// ------------------------------------------------------------------ falling rain and splashes
const STREAK_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aSeed;
uniform float uRain, uRainTime, uOccOn, uRadius, uHeight, uSpeed, uLen, uWidth;
uniform sampler2D uOcc;
uniform vec4 uOccBox;
uniform vec2 uWind;
uniform vec3 uCam;
uniform vec4 uTorch, uTorchDir;      // torch position (w: on) and direction (w: cos of the cone)
uniform vec4 uBeam, uBeamDir;        // the moon's shaft: a point on its axis (w: radius) and the axis (w: on)
varying float vA, vLit;
varying vec2 vC;
${OCC_GLSL}
void main() {
  vC = corner; vA = 0.0; vLit = 0.0;
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);                       // (culled unless placed below)
  if (aSeed.w > uRain) return;
  float fall = uSpeed * (0.8 + 0.4 * fract(aSeed.z * 13.7));
  vec3 vel = vec3(uWind.x, -fall, uWind.y);
  vec3 box = vec3(2.0 * uRadius, uHeight, 2.0 * uRadius);
  vec3 org = uCam - vec3(uRadius, uHeight * 0.4, uRadius);
  // world-anchored drops wrapped into a box around the camera (they keep their place when you move)
  vec3 p = org + mod(vec3(aSeed.x, aSeed.z, aSeed.y) * box + vel * uRainTime - org, box);
  if (p.y < rainTop(p.xz)) return;                            // landed: on a crown, a roof or the ground
  vec3 dir = normalize(vel), toCam = uCam - p;
  float dist = length(toCam);
  vec3 side = normalize(cross(dir, toCam));
  float w = (0.004 + dist * 0.0014) * uWidth;                   // ~1.5 px wide at any distance
  vec3 pos = p - dir * uLen * (0.75 + 0.5 * aSeed.w) * corner.y + side * w * corner.x;
  vA = (1.0 - smoothstep(uRadius * 0.7, uRadius, length(toCam.xz))) * smoothstep(0.5, 1.5, dist);
  // drops caught in the torch's cone or in the moon's shaft light up
  vec3 tp = p - uTorch.xyz; float tl = length(tp);
  vLit = uTorch.w * smoothstep(uTorchDir.w, uTorchDir.w + 0.04, dot(tp / max(tl, 1e-3), uTorchDir.xyz)) * (1.0 - smoothstep(4.0, 22.0, tl));
  vec3 bp = p - uBeam.xyz; float br = length(bp - uBeamDir.xyz * dot(bp, uBeamDir.xyz));
  vLit += uBeamDir.w * 0.1 * (1.0 - smoothstep(uBeam.w * 0.6, uBeam.w, br));
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;
const STREAK_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying float vA, vLit;
varying vec2 vC;
void main() {
  float a = vA * uOpacity * (1.0 - abs(vC.x)) * smoothstep(0.0, 0.2, vC.y) * (1.0 - smoothstep(0.55, 1.0, vC.y));
  a *= 1.0 + vLit * 0.6;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor + vec3(0.9, 0.92, 1.0) * vLit * 1.2, min(a, 1.0));
}`;

const SPLASH_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aSeed;
uniform float uRain, uRainTime, uOccOn, uRadius;
uniform sampler2D uOcc;
uniform vec4 uOccBox;
uniform vec3 uCam;
varying vec2 vC;
varying float vA, vPh;
${OCC_GLSL}
void main() {
  vC = corner; vA = 0.0; vPh = 0.0;
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  if (aSeed.w > uRain) return;
  float life = 0.28 + 0.12 * aSeed.z;
  float tt = uRainTime / life + aSeed.z * 7.0;
  float cyc = floor(tt), ph = fract(tt);
  // a new spot every cycle, where that drop lands (the top surface)
  vec2 h = vec2(rainHash(vec2(cyc * 0.731, aSeed.x * 91.0)), rainHash(vec2(aSeed.y * 57.0, cyc * 1.37)));
  vec2 xz = uCam.xz + (h - 0.5) * 2.0 * uRadius;
  float top = rainTop(xz);
  if (top < -1e4) return;
  vec3 c = vec3(xz.x, top + 0.005, xz.y);
  vec3 toCam = uCam - c;
  float dist = length(toCam);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  float s = (0.035 + 0.075 * ph) * (0.7 + 0.6 * aSeed.w);
  vec3 pos = c + right * corner.x * s + vec3(0.0, 1.0, 0.0) * (corner.y * 0.5 + 0.5) * s * 0.8;
  vA = (1.0 - smoothstep(uRadius * 0.6, uRadius, length(toCam.xz))) * smoothstep(0.6, 1.5, dist);
  vPh = ph;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;
const SPLASH_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vC;
varying float vA, vPh;
void main() {
  // a small crown: a thin rim that opens up, with a couple of droplets thrown out
  vec2 q = vec2(vC.x, vC.y * 0.5 + 0.5);
  float rim = (1.0 - smoothstep(0.0, 0.25, abs(length(vec2(q.x, q.y * 1.6)) - 0.55 - 0.3 * vPh))) * (1.0 - smoothstep(0.2, 0.9, q.y));
  float drops = 2.0 - smoothstep(0.0, 0.12, length(q - vec2(0.55, 0.45 + 0.4 * vPh))) - smoothstep(0.0, 0.12, length(q - vec2(-0.5, 0.5 + 0.35 * vPh)));
  float a = vA * uOpacity * (1.0 - vPh) * (rim + drops);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, min(a, 1.0));
}`;

function cloud(n, corners, idx) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(corners.length / 2 * 3), 3));
  g.setIndex(idx);
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = n;
  return g;
}

export class RainFX {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.userData.ueSkip = 'rain';
    this.group.visible = false;
    scene.add(this.group);
    const common = { uRain: RAIN.uRain, uRainTime: RAIN.uRainTime, uOcc: RAIN.uOcc, uOccBox: RAIN.uOccBox, uOccOn: RAIN.uOccOn };
    this.cam = { value: new THREE.Vector3() };
    this.color = { value: new THREE.Color(0.6, 0.63, 0.67) };
    this.wind = { value: new THREE.Vector2(1.6, 0.7) };
    this.torch = { value: new THREE.Vector4() }; this.torchDir = { value: new THREE.Vector4(0, 0, -1, 0.92) };
    this.beam = { value: new THREE.Vector4() }; this.beamDir = { value: new THREE.Vector4(0, 1, 0, 0) };
    const mk = (vs, fs, u) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: { ...common, uCam: this.cam, uColor: this.color, uWind: this.wind, uTorch: this.torch, uTorchDir: this.torchDir, uBeam: this.beam, uBeamDir: this.beamDir, ...u },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });   // (the quads face either way)
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.userData.noAO = true; m.renderOrder = 5; this.group.add(m); return m; };
    // two layers of streaks: close ones (a few metres, the ones you read as drops) and the curtain further out
    const quad = [-1, 0, 1, 0, 1, 1, -1, 1], qi = [0, 1, 2, 0, 2, 3];
    add(cloud(9000, quad, qi), mk(STREAK_VERT, STREAK_FRAG, { uRadius: { value: 9 }, uHeight: { value: 12 }, uSpeed: { value: 9 }, uLen: { value: 0.45 }, uOpacity: { value: 0.5 }, uWidth: { value: 1 } }));
    add(cloud(26000, quad, qi), mk(STREAK_VERT, STREAK_FRAG, { uRadius: { value: 34 }, uHeight: { value: 26 }, uSpeed: { value: 9 }, uLen: { value: 0.6 }, uOpacity: { value: 0.3 }, uWidth: { value: 1 } }));
    add(cloud(2600, [-1, -1, 1, -1, 1, 1, -1, 1], qi), mk(SPLASH_VERT, SPLASH_FRAG, { uRadius: { value: 12 }, uOpacity: { value: 0.55 } }));
  }

  // torch: { on, pos, dir } ; beam: { on, pos, dir, r } (the moon's shaft)
  update(camera, light, torch, beam) {
    this.group.visible = RAIN.uRain.value > 0.002;
    if (torch?.on) { this.torch.value.set(torch.pos.x, torch.pos.y, torch.pos.z, 1); this.torchDir.value.set(torch.dir.x, torch.dir.y, torch.dir.z, 0.93); } else this.torch.value.w = 0;
    if (beam?.on) { this.beam.value.set(beam.pos.x, beam.pos.y, beam.pos.z, beam.r); this.beamDir.value.set(beam.dir.x, beam.dir.y, beam.dir.z, 1); } else this.beamDir.value.w = 0;
    this.cam.value.copy(camera.position);
    this.color.value.setScalar(0.9 * light).multiply(_tint);
    const t = RAIN.uRainTime.value;
    this.wind.value.set(1.6 + 0.8 * Math.sin(t * 0.37), 0.7 + 0.5 * Math.sin(t * 0.23 + 1));   // gusts
  }
}
const _tint = new THREE.Color(0.97, 1, 1.05);
