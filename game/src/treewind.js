import * as THREE from 'three';
import { WIND } from './util.js';

// The wind in the trees: one motion from the stem to the leaf, the way a tree really takes the wind.
//
//  * the wind: a mean speed (m/s, at the crowns: main.js, by the weather or the B key) and the way it blows; its
//    turbulence is a field of gusts ~55 m long and ~30 m across that the wind itself carries along (Taylor's frozen
//    turbulence: twGust), so a gust is seen to run across a wood, the crowns leaning one after another;
//  * the stem bends away from the wind like a cantilever (the offset ~ the height squared), as far as the drag on the
//    crown (~ speed^1.4: leaves and twigs streamline in a strong wind), and keeps its length (each point turns about
//    the foot instead of sliding); it sways about that at the tree's own frequency (~4.5 / height in m Hz: ~0.2 Hz a
//    20 m tree, ~1 Hz a 5 m sapling), harder in the gusts, and less across the wind than along it: an ellipse;
//  * the branches swing on their own (0.75-1.35 Hz, each its phase), pushed downwind, bobbing up and down, the more
//    the longer and the farther out along them (a bush's less: a short one is stiffer); the leaves on a branch go
//    with it (they stay on it);
//  * the leaves flutter (3-7 Hz, each corner of a spray its own phase), already in a light breeze.
// Every point needs its tree's facts in `aWind`: x the tree's height in its own model (m), y how much it swings with
// its branch (0 the stem, 1 a long branch's tip), z the branch's phase, w how much it flutters (1 a leaf). The far
// billboards bend with their stem only. The shadows move with the trees (windDepth: their depth pass bends them the
// same way). How strong it looks against the Beaufort scale at the crowns: 2 m/s the leaves barely stir, 3-5 m/s
// leaves and twigs in constant motion, 6-8 small branches move, 11-14 large branches, 14-17 whole trees in motion,
// 20 and more the crowns thrash and lean far over in the gusts.

export const TWIND = {
  uTwTime: WIND.time,
  uTwDir: { value: new THREE.Vector2(0.6, -0.8) },   // (world xz: the way it blows to)
  uTwSpeed: { value: 2.5 },
  uTwOff: { value: new THREE.Vector2() },            // how far the air has carried the gusts so far (no jump when the speed changes)
  uTwCam: { value: new THREE.Vector3() },            // the camera (the shadow passes too): the branches' and leaves' own motion only near
};

export const TWIND_GLSL = /* glsl */`
uniform float uTwTime, uTwSpeed;
uniform vec2 uTwDir, uTwOff;
uniform vec3 uTwCam;
// (a hash without sin: cheap, and as good far from the origin - Dave Hoskins' hash12)
float twHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float twNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(twHash(i), twHash(i + vec2(1.0, 0.0)), f.x), mix(twHash(i + vec2(0.0, 1.0)), twHash(i + vec2(1.0, 1.0)), f.x), f.y); }
// the gust at a point (0..1, ~0.5 on average): the field rides on the wind and changes slowly as it goes
float twGust(vec2 xz) {
  vec2 q = xz - uTwOff, c = vec2(-uTwDir.y, uTwDir.x), g = vec2(dot(q, uTwDir) / 55.0, dot(q, c) / 30.0);
  return 0.6 * twNoise(g + vec2(0.0, uTwTime * 0.02)) + 0.4 * twNoise(g * 2.3 + vec2(5.2, 1.3 - uTwTime * 0.05));
}
// (the grass's: its first octave only - a plant is small, and there are many of them)
float twGust1(vec2 xz) {
  vec2 q = xz - uTwOff, c = vec2(-uTwDir.y, uTwDir.x);
  return twNoise(vec2(dot(q, uTwDir) / 55.0, dot(q, c) / 30.0 + uTwTime * 0.02));
}`;

// (in begin_vertex: moves \`transformed\`, the model's own frame, and sets twMv, how far the point moved in metres)
const TW_VERT = /* glsl */`
float twMv = 0.0;
{
#ifdef USE_INSTANCING
  mat4 twM = modelMatrix * instanceMatrix;
#else
  mat4 twM = modelMatrix;
#endif
  vec3 twO = twM[3].xyz;
  mat3 twR = mat3(twM);
  float twS = max(length(twR[0]), 1e-4);                 // (an instance hidden by a zero matrix stays finite)
  twR /= twS;
  vec3 twD = transpose(twR) * vec3(uTwDir.x, 0.0, uTwDir.y), twC = transpose(twR) * vec3(-uTwDir.y, 0.0, uTwDir.x);
  float g = twGust(twO.xz), U = uTwSpeed * (0.62 + 0.76 * g), F = pow(U * 0.1, 1.4);
  float H = max(aWind.x, 0.5), w0 = 6.2832 * clamp(4.5 / (H * twS), 0.15, 1.2);
  float ph = twHash(twO.xz) * 6.2832, t = uTwTime;
  // (a branch's own swing seen to ~140 m, a leaf's flutter to ~70 m: farther the stem's bend is all that shows)
  float twFar = distance(twO, uTwCam), bNear = 1.0 - smoothstep(100.0, 140.0, twFar), lNear = 1.0 - smoothstep(45.0, 70.0, twFar);
  // the stem: bent downwind, swaying about that at its own frequency (three close tones: never quite periodic)
  float o1 = 0.6 * sin(w0 * t + ph) + 0.25 * sin(w0 * 1.43 * t + ph * 1.7) + 0.15 * sin(w0 * 0.71 * t + ph * 2.3);
  float o2 = 0.6 * sin(w0 * 0.93 * t + ph * 1.3 + 1.7) + 0.4 * sin(w0 * 1.61 * t + ph * 0.6);
  vec3 p0 = transformed;
  float h = clamp(p0.y / H, 0.0, 1.3), dyn = 0.010 * F * (0.5 + g);
  vec3 d = (twD * (0.018 * F + dyn * o1) + twC * (0.45 * dyn * o2)) * (h * h * H);
  // the branch it is on
  if (aWind.y > 0.0 && bNear > 0.0) {
    float bp = aWind.z + ph, wb = 6.2832 * (0.75 + 0.6 * fract(aWind.z * 0.37)), bA = aWind.y * (0.03 + 0.22 * F) * (0.55 + 0.9 * g) * clamp(H * twS / 8.0, 0.3, 1.0) * bNear;
    d += twD * (bA * (0.55 + 0.45 * sin(wb * t + bp))) + vec3(0.0, 0.5 * bA * sin(wb * 1.27 * t + bp * 1.3), 0.0) + twC * (0.35 * bA * sin(wb * 0.83 * t + bp * 0.7));
  }
  // the leaf's own flutter
  if (aWind.w > 0.0 && lNear > 0.0) {
    float lp = twHash(p0.xz * 7.3 + p0.y * 3.1) * 6.2832 + ph, wf = 6.2832 * (3.0 + 4.0 * fract(lp * 0.37));
    float fa = aWind.w * (0.01 + 0.04 * min(F * 2.0, 1.6)) * (0.6 + 0.8 * g) * lNear;
    d += normal * (fa * sin(wf * t + lp)) + twD * (0.4 * fa * (1.0 + sin(wf * 0.6 * t + lp * 1.3)));
  }
  // (each point turns about the foot: the stem keeps its length as it bends)
  vec3 p1 = p0 + d;
  float l0 = length(p0);
  if (l0 > 0.05) p1 *= l0 / max(length(p1), 1e-4);
  transformed = p1;
  twMv = length(p1 - p0) * twS;
}`;

const hookVert = (sh) => {
  Object.assign(sh.uniforms, TWIND);
  sh.vertexShader = '#define TREE_WIND\n' + sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aWind;\n' + TWIND_GLSL)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + TW_VERT);
};

// a tree's material (a clone of its own: geo/trees.js nearMat, vegetation.js): the wind over whatever it already does
// (the plain sway of materials.js addWind is left out: TREE_WIND). What moves is marked for the anti-aliasing (taa.js)
// as the leaves always were: the stem and the limbs only while they move by more than ~2 cm
export function windTree(m) {
  const prev = m.onBeforeCompile, key0 = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    hookVert(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vTwMv;')
      .replace('twMv = length(p1 - p0) * twS;\n}', 'twMv = length(p1 - p0) * twS;\n}\nvTwMv = twMv;');
    sh.uniforms.uSwayMark = WIND.mark;
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTwMv;');
    if (!/uniform float uSwayMark/.test(fs)) fs = fs.replace('#include <common>', '#include <common>\nuniform float uSwayMark;');
    sh.fragmentShader = fs.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n#ifdef OPAQUE\n  if (uSwayMark > 0.5 && vTwMv > 0.02) gl_FragColor.a = -abs(gl_FragColor.a);\n#endif');
  };
  m.customProgramCacheKey = () => key0 + '|twind';
  m.needsUpdate = true;
  return m;
}

// the shadow passes of a tree's mesh: bent the same way (and the leaves' cut-outs kept)
const DEPTH = new Map();
export function windDepth(m) {
  const k = m.uuid;
  if (DEPTH.has(k)) return DEPTH.get(k);
  const cut = m.alphaTest > 0 && m.map ? { map: m.map, alphaTest: m.alphaTest } : {};
  const depth = new THREE.MeshDepthMaterial({ ...cut, side: m.side });
  const dist = new THREE.MeshDistanceMaterial({ ...cut, side: m.side });
  for (const d of [depth, dist]) { d.onBeforeCompile = hookVert; d.customProgramCacheKey = () => 'twind' + (cut.map ? 'cut' : ''); }
  const out = { depth, dist };
  DEPTH.set(k, out);
  return out;
}
export function windShadows(mesh) {
  const d = windDepth(mesh.material);
  mesh.customDepthMaterial = d.depth;
  mesh.customDistanceMaterial = d.dist;
  return mesh;
}

// ---- the facts the shader needs, set on a tree's geometry
// a model built without its limbs' story (spruces, pines, the street's trees): the swing from how far out from the
// stem a point is (crown: the crown's radius), the branch's phase from its bearing round the stem and its height
// (3 x the bearing: no seam where the bearing wraps round), the flutter on the leaves
export function windAuto(g, H, crown, leaf, flutter = 1) {
  const p = g.attributes.position, n = p.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
    a[i * 4] = H;
    a[i * 4 + 1] = Math.pow(Math.min(1, r / Math.max(0.5, crown)), 1.5) * (y > 0.5 ? 1 : 0);
    a[i * 4 + 2] = 3 * Math.atan2(z, x) + 0.45 * y;
    a[i * 4 + 3] = leaf ? flutter : 0;
  }
  g.setAttribute('aWind', new THREE.BufferAttribute(a, 4));
  return g;
}
// the stem's bend only (the far billboards; a part with no branch of its own): H the tree's height in the model
export function windStem(g, H) {
  const n = g.attributes.position.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a[i * 4] = H;
  g.setAttribute('aWind', new THREE.BufferAttribute(a, 4));
  return g;
}
