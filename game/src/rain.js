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

// snow (the same hook as the rain: every patched material can be covered)
export const SNOW = {
  uSnow: { value: 0 },         // how much snow lies on the surfaces (0..1: a dusting on the level ones .. everything that faces up)
  uSnowFall: { value: 0 },     // how hard it snows now (0..1)
  uSnowLight: { value: 1 },    // daylight on the snow (the sparkle of its crystals)
  uSnowDepth: { value: 0 },    // how deep it lies in the open, in metres (it builds up while it snows: main.js)
  uSnowField: { value: null }, // the lying snow's shape around the camera (RainOcclusion)
  uSnowCar: { value: new THREE.Vector4() },        // the driven car: x, z, heading, 1 when driving (it ploughs through)
  uSnowCarSize: { value: new THREE.Vector2(1, 2.4) },   // its half width and half length (m)
};
// low plants that go under a cover deeper than a dusting (meadow grass, flowers, ferns, weeds): their materials are
// hidden then (main.js)
export const UNDER_SNOW = new Set();

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
uniform float uWet, uRain, uRainTime, uOccOn, uSnow, uSnowFall, uSnowLight;
uniform sampler2D uOcc;
uniform vec4 uOccBox;
varying vec3 vWetP;
float wetReflOut = 0.0;                              // how much this point mirrors the scene (screen-space reflections, post.js)
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
  float rough0 = roughnessFactor;
  float dist = length(wp - cameraPosition);
  // porous things darken when soaked (soil, plaster, asphalt), metal and paint hardly; everything gets glossier
  float por = clamp((roughnessFactor - 0.25) / 0.6, 0.0, 1.0) * (1.0 - metalnessFactor);
#ifndef WET_LEAF
  diffuseColor.rgb *= 1.0 - wet * por * mix(0.3, 0.5, upF);
#endif
  roughnessFactor = mix(roughnessFactor, roughnessFactor * mix(0.7, 0.32, upF), wet);
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
    float pud = smoothstep(0.57, 0.66, n) * lvl;
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
  roughnessFactor = mix(roughnessFactor, 0.05, water);
  // raindrop rings only on standing water; beyond ~25 m they are below a pixel
  float rip = uRain * open * upF * (1.0 - smoothstep(12.0, 26.0, dist)) * smoothstep(0.25, 0.7, water);
  if (rip > 0.01) slopeW += wetRipples(wp.xz, uRainTime) * rip * 0.24;
#ifndef WET_LEAF
  // the impacts: in a downpour hard ground 'boils' with tiny crowns of spray (~4 cm), each lasting ~0.08 s, about
  // 140 at a time on every square metre (~3000 drops/m2/s at 50 mm/h)
  float imp = uRain * open * upF * (1.0 - smoothstep(5.0, 13.0, dist));
  if (imp > 0.01) {
    float sp = 0.0;
    for (int k = 0; k < 2; k++) {
      vec2 q = wp.xz * 24.0 + float(k) * vec2(0.5, 0.27);
      vec2 c = floor(q);
      float ph = fract(uRainTime * 2.6 + rainHash(c + float(k) * 7.0));
      vec2 o = vec2(rainHash(c + 1.3), rainHash(c + 2.7)) * 0.6 + 0.2;
      float r = length(fract(q) - o);
      sp += (1.0 - smoothstep(0.04, 0.1 + 0.3 * ph, r)) * (1.0 - smoothstep(0.0, 0.22, ph)) * step(rainHash(c + 5.1), 0.55);
    }
    sp = clamp(sp, 0.0, 1.0) * imp;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72), sp * 0.65);
    roughnessFactor = mix(roughnessFactor, 0.45, sp);
  }
#endif
  normal = normalize(normal - (viewMatrix * vec4(slopeW.x, 0.0, slopeW.y, 0.0)).xyz);
  // for the screen-space reflections: standing and running water mirror, a wet road film a little, other level hard
  // surfaces (roofs, slabs, car roofs) a little; leaves and rough ground not
#ifdef WET_ROAD
  wetReflOut = max(water, 0.5 * wet * upF * open);
#elif !defined(WET_LEAF)
  wetReflOut = wet * upF * open * 0.25 * (1.0 - smoothstep(0.55, 0.85, rough0));
#endif
}
`;

// ------------------------------------------------------------------ snow cover
// Snow settles on what faces the sky (not on walls, not under roofs or eaves: the same height map as the rain), first
// in patches on the level surfaces, then over everything up to ~50 deg of slope. It hides the texture under a smooth,
// lumpy white with a few glinting crystals; on the roads it is driven into grey slush and wet asphalt shows between.
const SNOW_MAIN = /* glsl */`
#ifndef SNOW_SKIP
if (uSnow > 0.001) {
  vec3 sp = vWetP;
  float sUp = smoothstep(0.32, 0.78, wetGeoN.y);
  // (under a high canopy, a forest's crowns 10 m and more up, about half the snow still sifts through to the floor;
  // under low crowns and eaves 2-4 m up a little blows in: a patchy dusting thinning towards the trunk or the wall)
  float sGap = rainTop(sp.xz) - sp.y;
  float sOpen = max(wetOpen(sp), max(0.5 * smoothstep(10.0, 14.0, sGap), 0.28 * smoothstep(1.6, 4.0, sGap)));
  float sn = wetNoise(sp.xz * 0.7) * 0.55 + wetNoise(sp.xz * 2.9 + 7.1) * 0.3 + wetNoise(sp.xz * 11.0 + 3.3) * 0.15;
  float sVal = sUp * sOpen * (0.62 + 0.38 * sn) * SNOW_K;
  float sTh = 1.0 - uSnow;
  float sc = smoothstep(sTh, sTh + 0.12, sVal) * min(1.0, SNOW_K * 1.6);
#ifdef WET_ROAD
  // wheels, feet and the plough: slush in patches (at most ~4/5 cover), wet dark asphalt between
  sc *= 0.2 + 0.6 * smoothstep(0.35, 0.75, wetNoise(sp.xz * 0.45 + 4.0));
  diffuseColor.rgb *= 1.0 - 0.3 * uSnow * sOpen;
  roughnessFactor *= 1.0 - 0.45 * uSnow * sOpen;
#endif
  if (sc > 0.002) {
    vec3 snowCol = vec3(0.87, 0.9, 0.94) * (0.93 + 0.07 * sn);
#ifdef WET_ROAD
    snowCol = mix(vec3(0.5, 0.51, 0.52), snowCol, smoothstep(0.35, 0.8, sn));
#endif
    diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, sc);
    roughnessFactor = mix(roughnessFactor, 0.82, sc);
    metalnessFactor = mix(metalnessFactor, 0.0, sc);
    // smoother than what it covers, lumpy at the decimetre scale
    vec2 sg = vec2(wetNoise(sp.xz * 4.0 + 0.5) - wetNoise(sp.xz * 4.0 - 0.5), wetNoise(sp.zx * 4.0 + 0.5) - wetNoise(sp.zx * 4.0 - 0.5)) * 0.3;
    normal = normalize(mix(normal, normalize((viewMatrix * vec4(sg.x, 1.0, sg.y, 0.0)).xyz), sc * 0.75 * sUp));
#if !defined(WET_LEAF) && !defined(WET_ROAD)
    // crystals catching the light on the fresh cover (not on the trodden slush), twinkling as you move
    float sd = length(sp - cameraPosition);
    float tw = rainHash(floor(sp.xz * 55.0) + floor(cameraPosition.xz * 3.0 + cameraPosition.y * 5.0));
    totalEmissiveRadiance += vec3(step(0.9975, tw)) * smoothstep(0.6, 1.0, sc) * sUp * uSnowLight * 1.2 * (1.0 - smoothstep(5.0, 16.0, sd));
#endif
  }
}
#endif
`;

function injectWet(sh, kind, opaque, snowK, snowSkip) {
  const v = sh.vertexShader, f = sh.fragmentShader;
  if (v.includes('vWetP')) return;                 // already in (a material cloned from a patched one keeps its hook)
  if (!v.includes('#include <project_vertex>') || !f.includes('#include <normal_fragment_maps>') || !f.includes('#include <normal_fragment_begin>') || !f.includes('#include <lights_physical_fragment>')) return;
  Object.assign(sh.uniforms, RAIN, SNOW);
  sh.vertexShader = v.replace('#include <common>', '#include <common>\nvarying vec3 vWetP;').replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wetW = vec4(transformed, 1.0);
#ifdef USE_BATCHING
    wetW = batchingMatrix * wetW;
#endif
#ifdef USE_INSTANCING
    wetW = instanceMatrix * wetW;
#endif
    vWetP = (modelMatrix * wetW).xyz; }`);
  const def = (kind === 'road' ? '#define WET_ROAD\n' : kind === 'leaf' ? '#define WET_LEAF\n' : '') + (opaque ? '#define WET_OUT\n' : '') +
    `#define SNOW_K ${snowK.toFixed(3)}\n` + (snowSkip ? '#define SNOW_SKIP\n' : '');
  sh.fragmentShader = f.replace('#include <common>', '#include <common>\n' + def + WET_PARS)
    .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nvec3 wetGeoN = inverseTransformDirection(normal, viewMatrix);')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WET_MAIN + SNOW_MAIN)
    // opaque surfaces write their reflectivity into the (otherwise always 1) alpha of the scene buffer
    .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n#ifdef WET_OUT\n  gl_FragColor.a = 1.0 - wetReflOut;\n#endif');
}

// Make a standard / physical material react to the rain (its own onBeforeCompile, if any, runs first).
// Road surfaces are tagged with userData.wet = 'road' (the clones of M.asphalt, M.pavers, M.concrete inherit it).
const patched = new WeakSet();
export function wetMaterial(m) {
  if (!m || patched.has(m)) return;
  patched.add(m);
  if (!m.isMeshStandardMaterial || m.userData.noWet) return;
  const kind = m.userData.wet === 'road' ? 'road' : (m.alphaTest > 0 || m.transparent) ? 'leaf' : 'solid';
  // userData.snow: how much of it gets covered (leaf cards and the trees' far billboards only partly); noSnow: never
  const snowK = m.userData.snow ?? (kind === 'leaf' ? 0.45 : 1), snowSkip = !!m.userData.noSnow;
  const key0 = m.customProgramCacheKey();
  const prev = m.onBeforeCompile;
  const opaque = !m.transparent;
  m.onBeforeCompile = function (sh, r) { prev.call(this, sh, r); injectWet(sh, kind, opaque, snowK, snowSkip); };
  m.customProgramCacheKey = () => key0 + '|wet-' + kind + (opaque ? '-o' : '') + '|s' + snowK.toFixed(2) + (snowSkip ? 'x' : '');
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

// The snow's shape (the lying snow, SnowBlanket): baked from the height maps seen from above and from below (the
// ground under everything) and the roads, every time those are re-rendered. Per texel: R the surface the snow lies on
// (relative height, as the maps), G how much of the depth lies there (x SNOW.uSnowDepth), B the open surface around
// averaged over ~2 m (where a deep cover lies: it fills the steps).
const BAKE_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BAKE_FRAG = /* glsl */`
uniform sampler2D uTop, uLow, uRoad;
uniform vec4 uOccBox;
uniform vec2 uWind;
varying vec2 vUv;
float bHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float bNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), f.x), mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 at(vec2 d) { return vUv + vec2(d.x, -d.y) / (2.0 * uOccBox.z); }          // the texel d metres (x, z) away
float topH(vec2 uv) { return texture2D(uTop, uv).r; }
float lowH(vec2 uv) { return texture2D(uLow, vec2(uv.x, 1.0 - uv.y)).r; }    // (seen from below: mirrored)
// an obstacle the wind blows the snow against: 0.35-3 m over the ground (fences, walls, cars, hedges, shrubs)
float obstacle(vec2 uv) { float r = topH(uv) - lowH(uv); return smoothstep(0.35, 1.0, r) * (1.0 - smoothstep(2.8, 4.0, r)); }
void main() {
  vec2 p = uOccBox.xy + vec2(vUv.x - 0.5, 0.5 - vUv.y) * 2.0 * uOccBox.z;
  float h = topH(vUv), g = lowH(vUv);
  // open to the sky down to (nearly) the ground: not under a roof, eaves, a car, a bridge deck, a spruce. The snow lies
  // on the top surface there (ground, road, kerb, step); where it does not, on the open surface next to it.
  // Under a high canopy (a forest's crowns, 10 m and more up) about half of it still reaches the floor.
  float open = 0.0, baseSum = 0.0, ow = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 uv = at(vec2(float(i), float(j)) * 0.35);
    float t = topH(uv), l = lowH(uv), o = step(t - l, 0.6), c = 0.45 * smoothstep(10.0, 14.0, t - l);
    open += o + c; baseSum += o * t + c * l; ow += o + c;
  }
  float base = h - g < 0.6 ? h : h - g > 10.0 ? g : ow > 0.0 ? baseSum / ow : g;
  // ... and the open surface around, averaged over ~2 m: a deep cover fills the steps (kerbs, plinths, ditches) and
  // rounds them over instead of following them
  float wide = 0.0, wn = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 uv = at(vec2(float(i), float(j)) * 0.45);
    float t = topH(uv), l = lowH(uv), o = (step(t - l, 0.6) + 0.45 * smoothstep(10.0, 14.0, t - l)) * (1.0 - 0.12 * float(i * i + j * j));
    wide += o * (t - l < 0.6 ? t : l); wn += o;
  }
  wide = wn > 0.0 ? wide / wn : base;
  open /= 9.0;
  // the wind's work: dunes across it (~3 m apart, ~10 m long), lumps, and rounded mounds over what lies buried
  // (tussocks, stones, low shrubs)
  vec2 w = uWind, wp = vec2(dot(p, w), dot(p, vec2(-w.y, w.x)));
  float f = 1.0 + 0.6 * (bNoise(vec2(wp.x * 0.33, wp.y * 0.1)) - 0.5) + 0.5 * (bNoise(p * 0.5 + 3.1) - 0.5) + 0.2 * (bNoise(p * 1.7 + 7.7) - 0.5);
  vec2 cell = floor(p * 0.62);
  for (int j = 0; j <= 1; j++) for (int i = 0; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j)) - 0.5, r = vec2(bHash(c + 0.7), bHash(c + 5.3));
    vec2 m = (c + 0.2 + 0.6 * r) / 0.62;
    float rad = 0.35 + 0.5 * bHash(c + 9.1), q = clamp(1.0 - dot(p - m, p - m) / (rad * rad), 0.0, 1.0);
    f += step(0.6, bHash(c + 2.9)) * (0.25 + 0.4 * r.x) * q * q;
  }
  // drifts in the lee of the obstacles (the snow the wind carries settles behind them), scoured on their windward side
  float lee = 0.0, scour = 0.0;
  for (int k = 1; k <= 7; k++) lee = max(lee, obstacle(at(-w * float(k) * 0.45)) * (1.0 - float(k) / 8.5));
  for (int k = 1; k <= 2; k++) scour = max(scour, obstacle(at(w * float(k) * 0.35)));
  f += 1.2 * lee - 0.45 * scour;
  // roads: the wheels pack it to a thin layer (the slush of the cover shows), ploughed up into low banks along the
  // edges that slope down to the asphalt over ~1 m (the road mask blurred over ±1.1 m)
  float road = 0.0, rw = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    float k = 1.0 - 0.1 * float(i * i + j * j);
    road += k * texture2D(uRoad, at(vec2(float(i), float(j)) * 0.55)).r; rw += k;
  }
  road /= rw;
  float core = smoothstep(0.2, 0.85, road), bank = smoothstep(0.0, 0.18, road) * (1.0 - smoothstep(0.18, 0.5, road));
  f = f * (1.0 - core) + 0.3 * bank * (1.0 - core);
  f *= smoothstep(0.15, 0.85, open);                                             // thinning into the shelter
  gl_FragColor = vec4(base, max(f, 0.0), wide, 1.0);
}`;
// the snow's wind (downwind, world x / z: the flakes drift the same way)
const SNOW_WIND = new THREE.Vector2(0.93, 0.37).normalize();

const _cc = new THREE.Color();
export class RainOcclusion {
  constructor(size = 512, half = 48) {
    this.half = half; this.size = size;
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: true });
    this.cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 1500);
    this.cam.rotation.set(-Math.PI / 2, 0, 0);                 // looking straight down: screen right = +x, up = -z
    this.mat = new THREE.ShaderMaterial({ vertexShader: OCC_VERT, fragmentShader: OCC_FRAG, uniforms: { uRef: { value: 0 } }, side: THREE.DoubleSide });
    RAIN.uOcc.value = this.rt.texture;
    this.last = new THREE.Vector2(1e9, 1e9);
    this.frame = 0;
    this.snow = null; this.snowOn = false;
    this.roads = [];                                             // (main.js: the map's roads, for the snow)
  }

  // the snow's maps (made with the first snow): the lowest surface seen from below (the ground under everything), the
  // roads near the camera, and the lying snow's shape baked from them
  initSnow() {
    const { size, half } = this;
    const rt = (depth) => new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: depth });
    const camLow = new THREE.OrthographicCamera(-half, half, half, -half, 1, 1500);
    camLow.rotation.set(Math.PI / 2, 0, 0);                      // looking straight up: screen right = +x, up = +z
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const roadTex = new THREE.CanvasTexture(canvas);
    roadTex.colorSpace = THREE.NoColorSpace; roadTex.generateMipmaps = false; roadTex.minFilter = THREE.LinearFilter;
    const low = rt(true), field = rt(false);
    const bake = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uTop: { value: this.rt.texture }, uLow: { value: low.texture }, uRoad: { value: roadTex }, uOccBox: RAIN.uOccBox, uWind: { value: SNOW_WIND } } });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bake); quad.frustumCulled = false;
    const qs = new THREE.Scene(); qs.add(quad);
    this.snow = { low, field, camLow, canvas, ctx: canvas.getContext('2d'), roadTex, qs, qc: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    SNOW.uSnowField.value = field.texture;
  }

  // the roads around (cx, cz), white on black, as wide as they are (the snow's bake blurs the edges)
  drawRoads(cx, cz) {
    const S = this.snow, n = S.canvas.width, k = n / (2 * this.half), g = S.ctx;
    const x0 = cx - this.half, z0 = cz - this.half, x1 = cx + this.half, z1 = cz + this.half;
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of this.roads) {
      if (r.x1 < x0 - r.w || r.x0 > x1 + r.w || r.z1 < z0 - r.w || r.z0 > z1 + r.w) continue;
      g.lineWidth = r.w * k;
      g.beginPath();
      for (let i = 0; i < r.p.length; i += 2) { const px = (r.p[i] - x0) * k, py = (r.p[i + 1] - z0) * k; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
      g.stroke();
    }
    S.roadTex.needsUpdate = true;
  }

  // re-rendered when the camera has moved 6 m, else every 30 frames (cars and dogs move); skip(mesh): left out too
  // (in winter the bare broadleaf crowns let the snow through). snow: the lying snow's maps too (and at once when it
  // begins)
  update(renderer, scene, camPos, groundY, hide, skip, snow = false) {
    this.frame++;
    const fresh = snow && !this.snowOn;
    this.snowOn = snow;
    if (!fresh && Math.hypot(camPos.x - this.last.x, camPos.z - this.last.y) < 6 && this.frame % 30) return;
    const cx = Math.round(camPos.x / 2) * 2, cz = Math.round(camPos.z / 2) * 2;
    this.last.set(camPos.x, camPos.z);
    this.cam.position.set(cx, Math.max(camPos.y, groundY) + 600, cz);
    this.cam.updateMatrixWorld();
    this.mat.uniforms.uRef.value = groundY;
    RAIN.uOccBox.value.set(cx, cz, this.half, groundY);
    const rt0 = renderer.getRenderTarget(), bg = scene.background, ov = scene.overrideMaterial, sm = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(_cc); const ca = renderer.getClearAlpha();
    if (skip) scene.traverse((o) => { if (o.isMesh && o.visible && skip(o)) hide = [...hide, o]; });
    const vis = hide.map(o => o.visible);
    for (const o of hide) o.visible = false;
    scene.background = null; scene.overrideMaterial = this.mat; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);                         // (nothing drawn: taken as the ground near the camera)
    renderer.clear();
    scene.updateMatrixWorld();                                    // (the scene does not update itself: main.js)
    renderer.render(scene, this.cam);
    if (snow) {
      if (!this.snow) this.initSnow();
      const S = this.snow;
      S.camLow.position.set(cx, groundY - 600, cz);
      S.camLow.updateMatrixWorld();
      renderer.setRenderTarget(S.low);
      renderer.clear();
      renderer.render(scene, S.camLow);
      scene.overrideMaterial = ov;
      this.drawRoads(cx, cz);
      renderer.setRenderTarget(S.field);
      renderer.render(S.qs, S.qc);
    }
    renderer.setRenderTarget(rt0);
    renderer.setClearColor(_cc, ca);
    scene.background = bg; scene.overrideMaterial = ov; renderer.shadowMap.autoUpdate = sm;
    hide.forEach((o, i) => { o.visible = vis[i]; });
    RAIN.uOccOn.value = 1;
  }

  // is (x, z) on a road (within its width)? For the wheels and feet in deep snow (main.js)
  onRoad(x, z) {
    for (const r of this.roads) {
      const hw = r.w / 2;
      if (x < r.x0 - hw || x > r.x1 + hw || z < r.z0 - hw || z > r.z1 + hw) continue;
      const P = r.p;
      for (let i = 0; i < P.length - 2; i += 2) {
        const ax = P[i], az = P[i + 1], dx = P[i + 2] - ax, dz = P[i + 3] - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (Math.hypot(x - ax - t * dx, z - az - t * dz) < hw) return true;
      }
    }
    return false;
  }
}

// the map's roads for the snow (geo GEO.roads: flat x, z lists and widths; not the tunnels)
export function snowRoads(roads) {
  const out = [];
  for (const r of roads || []) {
    if (r.tu || !r.p || r.p.length < 4) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < r.p.length; i += 2) { x0 = Math.min(x0, r.p[i]); x1 = Math.max(x1, r.p[i]); z0 = Math.min(z0, r.p[i + 1]); z1 = Math.max(z1, r.p[i + 1]); }
    out.push({ p: r.p, w: r.w || 5, x0, z0, x1, z1 });
  }
  return out;
}

// ------------------------------------------------------------------ falling rain and splashes
const STREAK_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aSeed;
uniform float uRain, uRainTime, uOccOn, uRadius, uHeight, uSpeed, uLen, uWidth, uCurtain;
uniform sampler2D uOcc;
uniform vec4 uOccBox;
uniform vec2 uWind;
uniform vec3 uCam;
uniform vec4 uTorch, uTorchDir;      // torch position (w: on) and direction (w: cos of the cone)
uniform vec4 uBeam, uBeamDir;        // the moon's shaft: a point on its axis (w: radius) and the axis (w: on)
varying float vA, vLit, vB;
varying vec2 vC;
${OCC_GLSL}
void main() {
  vC = corner; vA = 0.0; vLit = 0.0; vB = 0.0;
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);                       // (culled unless placed below)
  if (aSeed.w > uRain) return;
  // drop size: big drops fall faster (~9 m/s for 3 mm, ~6 m/s for 1 mm), leave longer, wider, brighter streaks
  float sz = fract(aSeed.w * 7.31 + aSeed.x * 3.17);
  float fall = uSpeed * (0.66 + 0.36 * sz);
  vec3 vel = vec3(uWind.x, -fall, uWind.y);
  vec3 box = vec3(2.0 * uRadius, uHeight, 2.0 * uRadius);
  vec3 org = uCam - vec3(uRadius, uHeight * 0.4, uRadius);
  // world-anchored drops wrapped into a box around the camera (they keep their place when you move)
  vec3 p = org + mod(vec3(aSeed.x, aSeed.z, aSeed.y) * box + vel * uRainTime - org, box);
  if (p.y < rainTop(p.xz)) return;                            // landed: on a crown, a roof or the ground
  vec3 dir = normalize(vel), toCam = uCam - p;
  float dist = length(toCam);
  vec3 side = normalize(cross(dir, toCam));
  float w = (0.0025 + dist * 0.0011) * (0.7 + 0.6 * sz) * uWidth;   // ~1 px wide at any distance
  vec3 pos = p - dir * uLen * (0.45 + 0.8 * sz) * corner.y + side * w * corner.x;
  vA = (1.0 - smoothstep(uRadius * 0.7, uRadius, length(toCam.xz))) * smoothstep(0.5, 1.5, dist);
  vB = 0.55 + 0.45 * sz;
  // gusts drive denser sheets of rain across the view (curtains), drifting with the wind
  vec2 wd = normalize(uWind + vec2(1e-4));
  float cur = 0.5 + 0.5 * sin(dot(p.xz, wd) * 0.09 - uRainTime * 1.3) * cos(dot(p.xz, vec2(-wd.y, wd.x)) * 0.05 + uRainTime * 0.37);
  vA *= mix(1.0, 0.2 + 0.8 * cur, uCurtain);
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
varying float vA, vLit, vB;
varying vec2 vC;
void main() {
  // drawn additively: a drop is a tiny lens that shows the bright sky, so it lightens what is behind it - plain against
  // dark trees and walls, almost gone against the sky (like real rain)
  float a = vA * uOpacity * (1.0 - abs(vC.x)) * smoothstep(0.0, 0.2, vC.y) * (1.0 - smoothstep(0.55, 1.0, vC.y));
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * vB + vec3(0.9, 0.92, 1.0) * vLit * 1.4, min(a, 1.0));
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
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });   // (the quads face either way)
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.userData.noAO = true; m.renderOrder = 5; this.group.add(m); return m; };
    // two layers of streaks: close ones (a few metres, the ones you read as drops) and the curtain further out
    const quad = [-1, 0, 1, 0, 1, 1, -1, 1], qi = [0, 1, 2, 0, 2, 3];
    add(cloud(10000, quad, qi), mk(STREAK_VERT, STREAK_FRAG, { uRadius: { value: 9 }, uHeight: { value: 12 }, uSpeed: { value: 9.5 }, uLen: { value: 0.42 }, uOpacity: { value: 0.9 }, uWidth: { value: 1 }, uCurtain: { value: 0.3 } }));
    add(cloud(30000, quad, qi), mk(STREAK_VERT, STREAK_FRAG, { uRadius: { value: 34 }, uHeight: { value: 26 }, uSpeed: { value: 9.5 }, uLen: { value: 0.55 }, uOpacity: { value: 0.62 }, uWidth: { value: 1 }, uCurtain: { value: 1 } }));
    add(cloud(2600, [-1, -1, 1, -1, 1, 1, -1, 1], qi), mk(SPLASH_VERT, SPLASH_FRAG, { uRadius: { value: 12 }, uOpacity: { value: 0.55 } }));
  }

  // torch: { on, pos, dir } ; beam: { on, pos, dir, r } (the moon's shaft)
  update(camera, light, torch, beam) {
    this.group.visible = RAIN.uRain.value > 0.002;
    if (torch?.on) { this.torch.value.set(torch.pos.x, torch.pos.y, torch.pos.z, 1); this.torchDir.value.set(torch.dir.x, torch.dir.y, torch.dir.z, 0.93); } else this.torch.value.w = 0;
    if (beam?.on) { this.beam.value.set(beam.pos.x, beam.pos.y, beam.pos.z, beam.r); this.beamDir.value.set(beam.dir.x, beam.dir.y, beam.dir.z, 1); } else this.beamDir.value.w = 0;
    this.cam.value.copy(camera.position);
    this.color.value.setScalar(0.32 * light).multiply(_tint);         // (added on top of the scene)
    const t = RAIN.uRainTime.value;
    this.wind.value.set(1.6 + 0.8 * Math.sin(t * 0.37), 0.7 + 0.5 * Math.sin(t * 0.23 + 1));   // gusts
  }
}
const _tint = new THREE.Color(0.97, 1, 1.05);

// ------------------------------------------------------------------ falling snow
// Flakes fall at ~1 m/s (big wet ones a little faster), drift with the wind and each swings on its own small circle as
// it tumbles; world-anchored like the drops (they keep their place when you move) and gone where they land.
const FLAKE_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aSeed;
uniform float uSnowFall, uRainTime, uOccOn, uRadius, uHeight, uSize, uOpacity;
uniform sampler2D uOcc;
uniform vec4 uOccBox;
uniform vec2 uWind;
uniform vec3 uCam;
uniform vec4 uTorch, uTorchDir;
varying float vA, vLit;
varying vec2 vC;
${OCC_GLSL}
void main() {
  vC = corner; vA = 0.0; vLit = 0.0;
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  if (aSeed.w > uSnowFall) return;
  float sz = fract(aSeed.w * 7.31 + aSeed.x * 3.17);
  float t = uRainTime, ph = aSeed.z * 6.2832;
  vec3 vel = vec3(uWind.x, -(0.75 + 0.6 * sz), uWind.y);
  vec3 box = vec3(2.0 * uRadius, uHeight, 2.0 * uRadius);
  vec3 org = uCam - vec3(uRadius, uHeight * 0.4, uRadius);
  vec3 p = org + mod(vec3(aSeed.x, aSeed.z, aSeed.y) * box + vel * t - org, box);
  p += vec3(sin(t * (1.1 + sz) + ph), 0.0, cos(t * (0.8 + 0.7 * sz) + ph * 1.3)) * (0.15 + 0.25 * sz);
  if (p.y < rainTop(p.xz)) return;                            // landed
  vec3 toCam = uCam - p;
  float dist = length(toCam);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam)), up = normalize(cross(toCam, right));
  float real = uSize * (0.6 + 0.8 * sz), s = max(real, dist * 0.0017);       // at least ~1.5 px across
  gl_Position = projectionMatrix * viewMatrix * vec4(p + (right * corner.x + up * corner.y) * s, 1.0);
  vA = uOpacity * (1.0 - smoothstep(uRadius * 0.7, uRadius, length(toCam.xz))) * smoothstep(0.2, 0.7, dist) * min(1.0, 1.5 * real / s);
  vec3 tp = p - uTorch.xyz; float tl = length(tp);
  vLit = uTorch.w * smoothstep(uTorchDir.w, uTorchDir.w + 0.04, dot(tp / max(tl, 1e-3), uTorchDir.xyz)) * (1.0 - smoothstep(4.0, 22.0, tl));
}`;
const FLAKE_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA, vLit;
varying vec2 vC;
void main() {
  float a = vA * (1.0 - smoothstep(0.35, 1.0, length(vC)));
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor + vec3(0.9, 0.92, 1.0) * vLit * 1.2, min(a, 1.0));
}`;

export class SnowFX {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.userData.ueSkip = 'rain';
    this.group.visible = false;
    scene.add(this.group);
    this.cam = { value: new THREE.Vector3() };
    this.color = { value: new THREE.Color(1, 1, 1) };
    this.wind = { value: new THREE.Vector2(0.5, 0.2) };
    this.torch = { value: new THREE.Vector4() }; this.torchDir = { value: new THREE.Vector4(0, 0, -1, 0.92) };
    const common = { uSnowFall: SNOW.uSnowFall, uRainTime: RAIN.uRainTime, uOcc: RAIN.uOcc, uOccBox: RAIN.uOccBox, uOccOn: RAIN.uOccOn, uCam: this.cam, uColor: this.color, uWind: this.wind, uTorch: this.torch, uTorchDir: this.torchDir };
    const quad = [-1, -1, 1, -1, 1, 1, -1, 1], qi = [0, 1, 2, 0, 2, 3];
    const add = (n, u) => {
      const m = new THREE.Mesh(cloud(n, quad, qi), new THREE.ShaderMaterial({ vertexShader: FLAKE_VERT, fragmentShader: FLAKE_FRAG, uniforms: { ...common, ...u }, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.userData.noAO = true; m.renderOrder = 5;
      this.group.add(m);
    };
    // big flakes close by (the ones you see tumbling), and the fall further out that greys the view
    add(16000, { uRadius: { value: 7 }, uHeight: { value: 9 }, uSize: { value: 0.01 }, uOpacity: { value: 0.95 } });
    add(40000, { uRadius: { value: 30 }, uHeight: { value: 22 }, uSize: { value: 0.011 }, uOpacity: { value: 0.75 } });
  }

  update(camera, light, torch) {
    this.group.visible = SNOW.uSnowFall.value > 0.002;
    if (!this.group.visible) return;
    if (torch?.on) { this.torch.value.set(torch.pos.x, torch.pos.y, torch.pos.z, 1); this.torchDir.value.set(torch.dir.x, torch.dir.y, torch.dir.z, 0.93); } else this.torch.value.w = 0;
    this.cam.value.copy(camera.position);
    this.color.value.setRGB(0.93, 0.95, 1).multiplyScalar(Math.max(0.06, light));
    const t = RAIN.uRainTime.value;
    this.wind.value.set(0.5 + 0.45 * Math.sin(t * 0.21), 0.2 + 0.3 * Math.sin(t * 0.17 + 2));   // a light, gusting breeze
  }
}

// ------------------------------------------------------------------ the lying snow
// A blanket of snow over the ground around the camera (±48 m, a vertex every 0.4 m, on the world's grid so it does not
// swim): it lies on the surface baked by RainOcclusion, as deep as SNOW.uSnowDepth times the local shape (drifts behind
// fences and walls, dunes, mounds, thin on the roads with banks along them, none under roofs and cars), and it thins
// out where it ends. Further away the cover of rain.js (white surfaces) carries on.
const BLANKET_PARS = /* glsl */`
uniform sampler2D uSnowField;
uniform vec4 uOccBox, uSnowCar;
uniform vec2 uSnowCarSize;
uniform float uSnowDepth;
float snowAt(vec2 xz, out float d) {
  vec2 uv = vec2(0.5 + (xz.x - uOccBox.x) / (2.0 * uOccBox.z), 0.5 - (xz.y - uOccBox.y) / (2.0 * uOccBox.z));
  vec4 s = texture2D(uSnowField, uv);
  vec2 e = abs(uv - 0.5) * 2.0;
  d = uSnowDepth * s.g * (1.0 - smoothstep(0.78, 0.97, max(e.x, e.y)));
  // the car you drive pushes the snow aside (the maps follow it only every few metres)
  vec2 dc = xz - uSnowCar.xy, cs = vec2(cos(uSnowCar.z), sin(uSnowCar.z));
  vec2 q = abs(vec2(dot(dc, vec2(cs.x, -cs.y)), dot(dc, -cs.yx))) - uSnowCarSize;
  d *= 1.0 - uSnowCar.w * (1.0 - smoothstep(-0.2, 0.25, max(q.x, q.y)));
  // the deeper it lies, the more it smooths what is under it: it fills the low side of a step up to the step's
  // average (never below the surface it lies on)
  float b = mix(s.r, max(s.r, s.b), smoothstep(0.03, 0.35, d));
  return b + uOccBox.w + d;
}`;
const BLANKET_POS = /* glsl */`
  vec2 sxz = position.xz + uOccBox.xy;
  float sd;
  float sy = snowAt(sxz, sd);`;

export class SnowBlanket {
  constructor(scene) {
    const g = new THREE.PlaneGeometry(96, 96, 240, 240).rotateX(-Math.PI / 2);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    const uni = { uSnowField: SNOW.uSnowField, uOccBox: RAIN.uOccBox, uSnowDepth: SNOW.uSnowDepth, uSnowLight: SNOW.uSnowLight, uSnowCar: SNOW.uSnowCar, uSnowCarSize: SNOW.uSnowCarSize };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
    mat.color.setRGB(0.87, 0.9, 0.94);                         // (the cover's snow colour, rain.js)
    mat.userData.noWet = true;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + BLANKET_PARS + '\nvarying vec3 vSnowP;')
        // (the normal is worked out per pixel)
        .replace('#include <beginnormal_vertex>', BLANKET_POS + `
  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
  vSnowP = vec3(sxz.x, sy, sxz.y);`)
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(sxz.x, sy, sxz.y);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
${BLANKET_PARS}
uniform float uSnowLight;
varying vec3 vSnowP;
float sFd, sFn;
float bnHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float bnNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bnHash(i), bnHash(i + vec2(1.0, 0.0)), f.x), mix(bnHash(i + vec2(0.0, 1.0)), bnHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`)
        // where it ends and how it is lit, per pixel from the snow's shape (not from the 0.4 m triangles)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  snowAt(vSnowP.xz, sFd);
  if (sFd < 0.012) discard;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb *= 0.95 + 0.05 * bnNoise(vSnowP.xz * 0.8);`)
        // lumps at the decimetre and centimetre scale (finer than the vertices)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  float shx = snowAt(vSnowP.xz + vec2(0.2, 0.0), sFn) - snowAt(vSnowP.xz - vec2(0.2, 0.0), sFn);
  float shz = snowAt(vSnowP.xz + vec2(0.0, 0.2), sFn) - snowAt(vSnowP.xz - vec2(0.0, 0.2), sFn);
  normal = normalize((viewMatrix * vec4(-shx, 0.4, -shz, 0.0)).xyz);
  vec2 bq = vSnowP.xz * 3.0, bq2 = vSnowP.xz * 11.0;
  vec2 bg = vec2(bnNoise(bq + vec2(0.5, 0.0)) - bnNoise(bq - vec2(0.5, 0.0)), bnNoise(bq + vec2(0.0, 0.5)) - bnNoise(bq - vec2(0.0, 0.5))) * 0.35
          + vec2(bnNoise(bq2 + vec2(0.5, 0.0)) - bnNoise(bq2 - vec2(0.5, 0.0)), bnNoise(bq2 + vec2(0.0, 0.5)) - bnNoise(bq2 - vec2(0.0, 0.5))) * 0.12;
  normal = normalize(normal - (viewMatrix * vec4(bg.x, 0.0, bg.y, 0.0)).xyz);`)
        // crystals catching the light, twinkling as you move
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float sd = length(vSnowP - cameraPosition);
    float tw = bnHash(floor(vSnowP.xz * 55.0) + floor(cameraPosition.xz * 3.0 + cameraPosition.y * 5.0));
    totalEmissiveRadiance += vec3(step(0.9975, tw)) * uSnowLight * 1.2 * (1.0 - smoothstep(5.0, 16.0, sd)); }`);
    };
    mat.customProgramCacheKey = () => 'snowBlanket';
    // its own shadow (the low winter sun picks out the drifts)
    const depth = new THREE.MeshDepthMaterial();
    depth.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + BLANKET_PARS)
        .replace('#include <begin_vertex>', BLANKET_POS + '\nvec3 transformed = vec3(sxz.x, sy - (sd < 0.012 ? 0.05 : 0.0), sxz.y);');
    };
    depth.customProgramCacheKey = () => 'snowBlanketDepth';
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.customDepthMaterial = depth;
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.userData.noAO = true; this.mesh.userData.ueSkip = 'rain';
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update() { this.mesh.visible = SNOW.uSnowDepth.value > 0.012 && !!SNOW.uSnowField.value && RAIN.uOccOn.value > 0.5; }
}

// ------------------------------------------------------------------ spray thrown up by the tyres on a wet road
const SPRAY_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aP;          // position, size
attribute float aA;         // opacity
uniform vec3 uCam;
varying vec2 vC;
varying float vA;
void main() {
  vC = corner; vA = aA;
  vec3 toCam = normalize(uCam - aP.xyz);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  gl_Position = projectionMatrix * viewMatrix * vec4(aP.xyz + (right * corner.x + up * corner.y) * aP.w, 1.0);
}`;
const SPRAY_FRAG = /* glsl */`
uniform vec3 uColor;
uniform sampler2D uNoise;
varying vec2 vC;
varying float vA;
void main() {
  float r = length(vC);
  float n = texture2D(uNoise, vC * 0.35 + vec2(vA * 3.1, vA * 1.7)).r;
  float a = vA * (1.0 - smoothstep(0.25, 1.0, r)) * (0.45 + 0.55 * n);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class Spray {
  constructor(scene, noise, n = 420) {
    this.n = n; this.next = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.age = new Float32Array(n).fill(9); this.life = new Float32Array(n).fill(1);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.aP.setUsage(THREE.DynamicDrawUsage);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); this.aA.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aP', this.aP); g.setAttribute('aA', this.aA);
    g.instanceCount = n;
    this.cam = { value: new THREE.Vector3() }; this.color = { value: new THREE.Color() };
    const mat = new THREE.ShaderMaterial({ vertexShader: SPRAY_VERT, fragmentShader: SPRAY_FRAG, uniforms: { uCam: this.cam, uColor: this.color, uNoise: { value: noise } },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.visible = false;
    this.mesh.userData.noAO = true; this.mesh.userData.ueSkip = 'rain';
    scene.add(this.mesh);
  }

  // car: the driven vehicle (x, z, h, vx, vz, speed) and its ground height y, or null; wet: 0..1
  update(dt, car, y, wet, light, camPos) {
    const sp = car ? Math.abs(car.speed) : 0;
    if (car && wet > 0.25 && sp > 3) {
      // each tyre lifts a fan of spray behind it, more the faster it turns (rear ones more, in the front ones' wake)
      const fx = -Math.sin(car.h), fz = -Math.cos(car.h), rx = Math.cos(car.h), rz = -Math.sin(car.h);
      const rate = Math.min(1, (sp - 3) / 18) * 240 * wet;
      for (let k = 0; k < 4; k++) {
        const along = k < 2 ? -1.35 : 1.3, side = k % 2 ? 0.78 : -0.78, share = k < 2 ? 0.65 : 0.35;
        this.acc = (this.acc ?? 0) + rate * share * dt;
        while (this.acc >= 1) {
          this.acc -= 1;
          const i = this.next = (this.next + 1) % this.n, j = i * 3, back = 0.25 + Math.random() * 0.35;
          this.p[j] = car.x + fx * (along - 0.35) + rx * side + (Math.random() - 0.5) * 0.25;
          this.p[j + 1] = y + 0.1 + Math.random() * 0.25;
          this.p[j + 2] = car.z + fz * (along - 0.35) + rz * side + (Math.random() - 0.5) * 0.25;
          // thrown off the tread backwards about as fast as the car goes, so in the world it hangs nearly where it rose
          this.v[j] = car.vx * back * 0.5 + rx * side * (0.8 + Math.random() * 1.5);
          this.v[j + 1] = 1.5 + Math.random() * 3;
          this.v[j + 2] = car.vz * back * 0.5 + rz * side * (0.8 + Math.random() * 1.5);
          this.age[i] = 0; this.life[i] = 0.6 + Math.random() * 0.7;
        }
      }
    }
    let any = false;
    const P = this.aP.array, A = this.aA.array;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) { A[i] = 0; P[i * 4 + 3] = 0; continue; }
      any = true;
      const drag = Math.exp(-2.2 * dt);
      this.v[j] *= drag; this.v[j + 2] *= drag; this.v[j + 1] = this.v[j + 1] * drag - 1.5 * dt;   // mist: it floats
      this.p[j] += this.v[j] * dt; this.p[j + 1] = Math.max(y + 0.05, this.p[j + 1] + this.v[j + 1] * dt); this.p[j + 2] += this.v[j + 2] * dt;
      P[i * 4] = this.p[j]; P[i * 4 + 1] = this.p[j + 1]; P[i * 4 + 2] = this.p[j + 2]; P[i * 4 + 3] = 0.3 + 1.6 * t;   // mist spreading out
      A[i] = 0.17 * (1 - t) * Math.min(1, t * 5);
    }
    this.mesh.visible = any;
    if (!any) return;
    this.aP.needsUpdate = true; this.aA.needsUpdate = true;
    this.cam.value.copy(camPos);
    this.color.value.setScalar(0.55 * light);
  }
}
