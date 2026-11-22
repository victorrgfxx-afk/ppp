import * as THREE from 'three';
import { TEX } from './textures.js';
import { M } from './materials.js';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCabin } from './interior.js';
import { bodyOf, partGeo, rimGeo as rim3D, grow } from './carparts.js';
import { REAL } from './carmodels.js';
import { snowSlabMaterial } from './snowroofs.js';

// Geometry pieces [geometry, material (or one per group), matrix?] -> one non-indexed geometry with a single group
// (one draw call) per material, in the order the materials first appear. The same triangles as separate meshes.
export function mergeByMaterial(items) {
  const mats = [], bins = [];
  const bin = (mat) => { let i = mats.indexOf(mat); if (i < 0) { i = mats.push(mat) - 1; bins.push({ p: [], n: [], uv: [] }); } return bins[i]; };
  for (const [g0, mat, mtx] of items) {
    let g = g0.index ? g0.toNonIndexed() : g0;
    if (mtx) { g = g === g0 ? g.clone() : g; g.applyMatrix4(mtx); }
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv?.array;
    const ranges = Array.isArray(mat) ? g.groups.map(r => [r.start, r.count, mat[r.materialIndex]]) : [[0, g.attributes.position.count, mat]];
    for (const [start, count, m] of ranges) {
      const o = bin(m);
      for (let i = start; i < start + count; i++) {
        o.p.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); o.n.push(N[3 * i], N[3 * i + 1], N[3 * i + 2]);
        o.uv.push(U ? U[2 * i] : 0, U ? U[2 * i + 1] : 0);         // (no uv: the attribute's default, 0)
      }
    }
  }
  const nv = bins.reduce((s, o) => s + o.p.length / 3, 0);
  const p = new Float32Array(nv * 3), n = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), geo = new THREE.BufferGeometry();
  let start = 0;
  bins.forEach((o, i) => { p.set(o.p, start * 3); n.set(o.n, start * 3); uv.set(o.uv, start * 2); geo.addGroup(start, o.p.length / 3, i); start += o.p.length / 3; });
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return { geo, mats };
}
const pose = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

// Parametric car bodies lofted from side/top profiles of the real models in the photos.
// Local frame: forward = -Z, right = +X, origin on the ground under the middle of the car.

const P = (arr) => arr; // [s, value]
export const MODELS = {
  // BMW 3 Series E90 sedan (black, photos 1-4)
  bmw: {
    name: 'BMW Seria 3 (E90)', L: 4.52, W: 1.82, axles: [0.80, 3.56], r: 0.315, tireW: 0.205, wheelTex: 'wheelBMW',
    belt: P([[0, 0.56], [0.04, 0.66], [0.12, 0.75], [0.35, 0.8], [0.8, 0.845], [1.3, 0.885], [1.62, 0.92], [3.95, 0.99], [4.1, 1.0], [4.35, 0.99], [4.47, 0.93], [4.52, 0.8]]),
    roof: P([[1.62, 0.92], [1.9, 1.12], [2.15, 1.29], [2.35, 1.38], [2.7, 1.42], [3.0, 1.41], [3.25, 1.36], [3.5, 1.22], [3.75, 1.07], [3.95, 0.99]]),
    bottom: P([[0, 0.36], [0.1, 0.26], [0.35, 0.18], [4.15, 0.2], [4.38, 0.3], [4.52, 0.4]]),
    hwr: 0.66, wind: [1.66, 2.34], rear: [3.3, 3.93], side: [1.72, 3.6], pillars: [2.62, 3.52], eyeY: 1.13,
    lights: { head: [0.1, 0.7, 0.62, 0.42, 0.11], tail: [4.47, 0.88, 0.62, 0.36, 0.13] }, grille: 'kidney',
  },
  // Opel Corsa C 5-door (silver, "PH 13 KLI")
  corsa: {
    name: 'Opel Corsa C', L: 3.82, W: 1.65, axles: [0.72, 3.21], r: 0.29, tireW: 0.185, wheelTex: 'wheelOpel',
    belt: P([[0, 0.55], [0.05, 0.66], [0.15, 0.73], [0.5, 0.81], [0.9, 0.875], [1.05, 0.9], [3.7, 0.98], [3.78, 0.95], [3.82, 0.78]]),
    roof: P([[1.05, 0.9], [1.3, 1.1], [1.55, 1.28], [1.8, 1.4], [2.3, 1.445], [2.9, 1.43], [3.35, 1.39], [3.55, 1.3], [3.66, 1.12], [3.72, 0.98]]),
    bottom: P([[0, 0.36], [0.12, 0.24], [0.35, 0.18], [3.5, 0.2], [3.7, 0.3], [3.82, 0.4]]),
    hwr: 0.6, wind: [1.08, 1.78], rear: [3.36, 3.7], side: [1.14, 3.4], pillars: [2.25, 3.08], eyeY: 1.19,
    lights: { head: [0.1, 0.72, 0.56, 0.36, 0.12], tail: [3.77, 0.95, 0.62, 0.14, 0.3] }, grille: 'opel',
  },
  // Peugeot 508 sedan (gray, "PH 77 XXS", photos 6-8)
  p508: {
    name: 'Peugeot 508', L: 4.79, W: 1.83, axles: [0.93, 3.75], r: 0.33, tireW: 0.215, wheelTex: 'wheel508',
    belt: P([[0, 0.58], [0.05, 0.68], [0.15, 0.75], [0.5, 0.81], [1.0, 0.86], [1.65, 0.93], [4.2, 1.01], [4.45, 1.02], [4.66, 0.99], [4.75, 0.93], [4.79, 0.8]]),
    roof: P([[1.65, 0.93], [1.95, 1.13], [2.25, 1.32], [2.5, 1.43], [2.9, 1.46], [3.3, 1.45], [3.6, 1.38], [3.9, 1.2], [4.2, 1.01]]),
    bottom: P([[0, 0.36], [0.12, 0.25], [0.4, 0.18], [4.4, 0.2], [4.62, 0.31], [4.79, 0.41]]),
    hwr: 0.66, wind: [1.69, 2.47], rear: [3.56, 4.18], side: [1.76, 3.84], pillars: [2.8, 3.7], eyeY: 1.15,
    lights: { head: [0.1, 0.73, 0.63, 0.44, 0.1], tail: [4.75, 0.95, 0.6, 0.36, 0.13] }, grille: 'plain',
  },
  // Dark compact SUV (behind the Opel in photo 1)
  suv: {
    name: 'SUV', L: 4.5, W: 1.86, axles: [0.9, 3.54], r: 0.36, tireW: 0.235, wheelTex: 'wheelSUV',
    belt: P([[0, 0.72], [0.06, 0.86], [0.2, 0.95], [0.6, 1.02], [1.1, 1.06], [1.35, 1.08], [4.3, 1.14], [4.45, 1.12], [4.5, 1.0]]),
    roof: P([[1.35, 1.08], [1.6, 1.3], [1.85, 1.48], [2.1, 1.61], [2.6, 1.66], [3.6, 1.64], [4.1, 1.58], [4.3, 1.46], [4.4, 1.25], [4.45, 1.12]]),
    bottom: P([[0, 0.48], [0.12, 0.34], [0.4, 0.25], [4.1, 0.26], [4.35, 0.38], [4.5, 0.5]]),
    hwr: 0.74, wind: [1.38, 2.08], rear: [4.12, 4.42], side: [1.45, 4.12], pillars: [2.62, 3.62], eyeY: 1.33,
    lights: { head: [0.07, 0.9, 0.66, 0.4, 0.09], tail: [4.47, 1.08, 0.72, 0.34, 0.1] }, grille: 'suv',
  },
  // Generic sedan (Dacia Logan-like)
  sedan: {
    name: 'Dacia Logan', L: 4.29, W: 1.74, axles: [0.82, 3.45], r: 0.3, tireW: 0.185, wheelTex: 'wheelGen',
    belt: P([[0, 0.6], [0.05, 0.7], [0.15, 0.78], [0.5, 0.84], [1.0, 0.89], [1.45, 0.93], [3.75, 1.0], [3.9, 1.02], [4.15, 1.0], [4.25, 0.94], [4.29, 0.8]]),
    roof: P([[1.45, 0.93], [1.7, 1.15], [1.95, 1.36], [2.2, 1.48], [2.6, 1.52], [3.0, 1.5], [3.25, 1.42], [3.5, 1.24], [3.75, 1.0]]),
    bottom: P([[0, 0.36], [0.12, 0.25], [0.35, 0.19], [4.0, 0.21], [4.2, 0.31], [4.29, 0.4]]),
    hwr: 0.64, wind: [1.5, 2.2], rear: [3.28, 3.72], side: [1.56, 3.4], pillars: [2.5, 3.3], eyeY: 1.22,
    lights: { head: [0.08, 0.74, 0.6, 0.34, 0.12], tail: [4.26, 0.9, 0.6, 0.3, 0.13] }, grille: 'plain',
  },
  // Generic hatchback (Dacia Sandero-like)
  hatch: {
    name: 'Dacia Sandero', L: 4.07, W: 1.73, axles: [0.8, 3.39], r: 0.31, tireW: 0.195, wheelTex: 'wheelGen',
    belt: P([[0, 0.6], [0.05, 0.71], [0.15, 0.79], [0.5, 0.86], [0.95, 0.92], [1.15, 0.95], [3.95, 1.03], [4.02, 1.0], [4.07, 0.82]]),
    roof: P([[1.15, 0.95], [1.4, 1.16], [1.65, 1.36], [1.9, 1.49], [2.4, 1.53], [3.2, 1.51], [3.65, 1.46], [3.85, 1.34], [3.95, 1.12], [3.98, 1.03]]),
    bottom: P([[0, 0.37], [0.12, 0.25], [0.35, 0.2], [3.8, 0.22], [3.97, 0.33], [4.07, 0.42]]),
    hwr: 0.63, wind: [1.18, 1.88], rear: [3.66, 3.97], side: [1.24, 3.65], pillars: [2.4, 3.3], eyeY: 1.23,
    lights: { head: [0.08, 0.76, 0.6, 0.36, 0.12], tail: [4.03, 1.0, 0.64, 0.12, 0.28] }, grille: 'plain',
  },
  // Renault Kangoo II (the red one on Str. Uzinei, photos 81 and 83): short bonnet, tall box, vertical tailgate
  kangoo: {
    name: 'Renault Kangoo', L: 4.21, W: 1.83, axles: [0.82, 3.52], r: 0.315, tireW: 0.195, wheelTex: 'wheelGen',
    belt: P([[0, 0.62], [0.05, 0.74], [0.16, 0.84], [0.45, 0.93], [0.8, 0.99], [0.95, 1.02], [4.05, 1.1], [4.16, 1.08], [4.21, 0.95]]),
    roof: P([[0.95, 1.02], [1.2, 1.3], [1.45, 1.55], [1.7, 1.74], [2.0, 1.81], [3.8, 1.82], [4.08, 1.8], [4.16, 1.7], [4.19, 1.1]]),
    bottom: P([[0, 0.4], [0.12, 0.27], [0.35, 0.21], [3.9, 0.23], [4.1, 0.35], [4.21, 0.46]]),
    hwr: 0.8, wind: [0.97, 1.74], rear: [4.1, 4.19], side: [1.0, 4.0], pillars: [2.25, 3.25], eyeY: 1.36,
    lights: { head: [0.07, 0.86, 0.64, 0.42, 0.13], tail: [4.18, 1.15, 0.8, 0.1, 0.42] }, grille: 'plain',
  },
  // VW Transporter T5 (the white one parked on Str. Uzinei, photo 80)
  van: {
    name: 'VW Transporter', L: 4.89, W: 1.9, axles: [0.97, 3.97], r: 0.33, tireW: 0.215, wheelTex: 'wheelGen',
    belt: P([[0, 0.66], [0.05, 0.78], [0.2, 0.9], [0.55, 1.0], [0.9, 1.07], [1.05, 1.1], [4.75, 1.16], [4.85, 1.12], [4.89, 1.0]]),
    roof: P([[1.05, 1.1], [1.35, 1.42], [1.65, 1.72], [1.95, 1.93], [2.3, 1.98], [4.6, 1.98], [4.8, 1.95], [4.86, 1.8], [4.88, 1.16]]),
    bottom: P([[0, 0.42], [0.12, 0.3], [0.4, 0.23], [4.5, 0.25], [4.75, 0.38], [4.89, 0.5]]),
    hwr: 0.86, wind: [1.07, 1.95], rear: [4.78, 4.87], side: [1.1, 4.7], pillars: [2.3, 3.4], eyeY: 1.55,
    lights: { head: [0.06, 0.95, 0.68, 0.42, 0.12], tail: [4.87, 1.2, 0.85, 0.1, 0.4] }, grille: 'plain',
  },
};

Object.assign(MODELS, REAL);

// a profile [[s, value], ...] at s: a monotone cubic through its points (Fritsch-Carlson), smooth (no kinks, so the
// windscreen and its pillars run in clean lines) and never overshooting them (no bumps between two equal points)
const SLOPES = new WeakMap();
function slopesOf(arr) {
  let m = SLOPES.get(arr);
  if (m) return m;
  const n = arr.length, d = [], h = [];
  for (let i = 0; i < n - 1; i++) { h[i] = arr[i + 1][0] - arr[i][0]; d[i] = h[i] > 0 ? (arr[i + 1][1] - arr[i][1]) / h[i] : 0; }
  m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  const end = (h0, h1, d0, d1) => {
    if (h0 + h1 <= 0) return d0;
    let e = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(e) !== Math.sign(d0)) e = 0; else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(e) > 3 * Math.abs(d0)) e = 3 * d0;
    return e;
  };
  if (n > 2) { m[0] = end(h[0], h[1], d[0], d[1]); m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]); }
  else if (n === 2) m[0] = m[1] = d[0];
  SLOPES.set(arr, m);
  return m;
}
function interp(arr, s) {
  if (s <= arr[0][0]) return arr[0][1];
  const n = arr.length;
  if (s >= arr[n - 1][0]) return arr[n - 1][1];
  let i = 1;
  while (s > arr[i][0]) i++;
  const [s0, v0] = arr[i - 1], [s1, v1] = arr[i], h = s1 - s0;
  if (h <= 0) return v1;
  const m = slopesOf(arr), t = (s - s0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * h * m[i - 1] + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * h * m[i];
}

export function profileAt(m, s) {
  const belt = interp(m.belt, s);
  const inCab = s > m.roof[0][0] && s < m.roof[m.roof.length - 1][0];
  const roof = inCab ? Math.max(belt, interp(m.roof, s)) : belt;
  let yb = interp(m.bottom, s);
  for (const a of m.axles) {
    const R = m.r + 0.055;
    const d = s - a;
    if (Math.abs(d) < R) yb = Math.max(yb, m.r + Math.sqrt(R * R - d * d) * 0.97);
  }
  let f;
  if (m.plan) f = interp(m.plan, s);                                         // (V103: the real car's plan, traced)
  else {
    const d = Math.min(s, m.L - s), [f0, fl] = m.taper ?? [0.74, 0.55];     // (how the body narrows at the ends)
    f = f0 + (1 - f0) * Math.sqrt(Math.max(0, 1 - Math.pow(1 - Math.min(d / fl, 1), 2)));
  }
  const hw = m.W / 2 * f;
  return { belt, roof, yb, hw, cab: Math.min(1, (roof - belt) / 0.25) };
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// (V103) a model's own cross-section: how far in its sill tucks (k2 at d2 above the bottom), the height of its widest
// line (f3 of the way up to the belt), its shoulder crease (k4 at m.shoulder's height, or d4 under the belt) and how far
// in the door's top comes to meet the glass (k5)
const SEC0 = { k1: 0.86, k2: 0.985, d2: 0.07, f3: 0.5, k4: 0.985, d4: 0.05, k5: 0.93, k6: 0.9, d7: 0.07 };
export function section(m, s) {
  const { belt, roof, yb, hw, cab } = profileAt(m, s);
  const hwr = Math.min(m.hwrAt ? interp(m.hwrAt, s) : m.hwr, hw * 0.9);      // (a van: the glass leans in, the box does not)
  const q = m.sec ?? SEC0, k = (n) => q[n] ?? SEC0[n];
  const mid = yb + (belt - yb) * k('f3');
  const yS = m.shoulder ? Math.min(belt - 0.012, Math.max(mid + 0.02, interp(m.shoulder, s))) : belt - k('d4');
  const R = [
    [0, yb], [hw * k('k1'), yb], [hw * k('k2'), Math.min(yb + k('d2'), mid - 0.01)], [hw * 1.0, Math.min(mid, yS - 0.01)], [hw * k('k4'), yS], [hw * k('k5'), belt],
  ];
  // cabin (blend with a flat hood/trunk top when cab -> 0)
  const lerp = (a, b, t) => a + (b - a) * t;
  const wb = hw * k('k6');
  // (the bonnet's and the boot lid's crown over their edges: m.crown along s, else 4.6 cm)
  const cr = m.crown ? interp(m.crown, s) : 0.046;
  R.push([lerp(hw * 0.8, wb, cab), belt + lerp(cr * 0.39, 0.035, cab)]);
  // (along the windscreen the A pillar is a real one's ~7 cm between the glasses, not the roof edge's 13: the windscreen
  // reaching 95 % of the way out (not 84 %) and the door's glass coming up to 4.5 cm under its edge (not 7) - from the
  // seat ~6-8 degrees, as real ones are (ECE R125 allows 6 for both eyes); the top corners rounding into the roof's edge
  // over the last 14 cm)
  const aw = s > m.wind[0] && s < m.wind[1] + 0.01 ? 1 - smooth(m.wind[1] - 0.14, m.wind[1] + 0.01, s) : 0;
  R.push([lerp(hw * 0.52, hwr * 1.02, cab), lerp(belt + cr * 0.74, roof - k('d7') + 0.025 * aw, cab)]);
  R.push([lerp(hw * 0.25, hwr * (0.84 + 0.11 * aw), cab), lerp(belt + cr * 0.913, roof - 0.005, cab)]);
  R.push([0, lerp(belt + cr, roof + 0.012, cab)]);
  return R;
}

// where the body is lofted: every 3.5 cm at the ends, every 6 cm between
function stationsOf(m) {
  const stations = [];
  for (let s = 0; s <= m.L + 1e-6; s += (s < 0.4 || s > m.L - 0.4) ? 0.035 : 0.06) stations.push(Math.min(s, m.L));
  if (stations[stations.length - 1] < m.L) stations.push(m.L);
  return stations;
}
// the windscreen's glass as the body has it (its strips between stations): [from s, to s] - for the cabin's inside of
// it (interior.js), whose black border must sit exactly on the glass's edges
export function windscreenSpan(m) {
  const st = stationsOf(m);
  let a = null, b = null;
  for (let j = 0; j < st.length - 1; j++) {
    const s = (st[j] + st[j + 1]) / 2;
    if (s >= m.wind[0] && s <= m.wind[1] && profileAt(m, s).cab > 0.3) { a ??= st[j]; b = st[j + 1]; }
  }
  return [a, b];
}

// the windscreen as its wipers know it (windshield.js draws them sweeping in the rain, buildCar parks them): a plane
// from the middle of its lower edge B (where the body turns to glass) up to the middle of its upper edge T, its
// half widths there, and the two wipers in tandem (left-hand drive) - each [pivot across, pivot up the slope (m),
// blade from, to (m from the pivot)], parked at 0.07 rad, sweeping up to 1.85 / 1.65
export const WIPER_REST = 0.07, WIPER_TOP = [1.85, 1.65];
const WIPER_GLASS = new WeakMap();
export function wiperGlass(m) {
  let w = WIPER_GLASS.get(m);
  if (w) return w;
  let s0 = m.wind[0];
  while (s0 < m.wind[1] - 0.2 && profileAt(m, s0).cab < 0.3) s0 += 0.01;
  const s1 = m.wind[1] - 0.03, p0 = profileAt(m, s0), p1 = profileAt(m, s1);
  const hwOf = (s) => section(m, s)[8][0];                           // (the glass's half width: its side edge)
  const B = new THREE.Vector3(0, p0.roof + 0.008, s0 - m.L / 2), T = new THREE.Vector3(0, p1.roof + 0.008, s1 - m.L / 2);
  const Lv = B.distanceTo(T), hwB = hwOf(s0), hwT = hwOf(s1), Wg = 2 * hwT;
  const W = [[-0.3 * Wg, -0.04, 0.18 * Wg, Math.min(0.66 * Wg, 1.02 * Lv)], [0.06 * Wg, -0.04, 0.12 * Wg, Math.min(0.48 * Wg, 0.82 * Lv)]];
  w = { s0, s1, B, T, Lv, hwB, hwT, Wg, W };
  WIPER_GLASS.set(m, w);
  return w;
}
// the wipers parked at the windscreen's foot (a model's own sides bring their own: doblo.js): each arm from its pivot
// cap on the scuttle to the blade's middle, the blade with its rubber lying on the glass - one mesh per model
const WIPERS = new WeakMap();
function wiperGeometry(m) {
  if (WIPERS.has(m)) return WIPERS.get(m);
  const { B, T, W } = wiperGlass(m);
  const V = T.clone().sub(B).normalize(), U = new THREE.Vector3(1, 0, 0), N = new THREE.Vector3().crossVectors(V, U);   // (outward: forward and up)
  const at = (x, y, h) => B.clone().addScaledVector(U, x).addScaledVector(V, y).addScaledVector(N, h);
  const dir = U.clone().multiplyScalar(Math.cos(WIPER_REST)).addScaledVector(V, Math.sin(WIPER_REST)).normalize(), side = new THREE.Vector3().crossVectors(dir, N);
  const bar = (len, thick, wide, x, y, h) => {
    const g = new THREE.BoxGeometry(len, thick, wide);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(dir, N, side).setPosition(at(x, y, h)));
    return g;
  };
  const parts = [];
  for (const [px, py, b0, b1] of W) {
    const c = Math.cos(WIPER_REST), s = Math.sin(WIPER_REST), along = (r) => [px + c * r, py + s * r];
    parts.push(bar(b0 + 0.02, 0.012, 0.014, ...along((b0 + 0.02) / 2), 0.022));       // the arm
    parts.push(bar(b1 - b0, 0.016, 0.02, ...along((b0 + b1) / 2), 0.009));             // the blade
    const cap = new THREE.CylinderGeometry(0.017, 0.02, 0.025, 12);
    cap.applyMatrix4(new THREE.Matrix4().makeBasis(side, N, dir).setPosition(at(px, py, 0.012)));
    parts.push(cap);
  }
  const g = mergeGeometries(parts.map(p => p.toNonIndexed()));
  WIPERS.set(m, g);
  return g;
}

// (V103) the side windows as the real car has them: the greenhouse's band between the window line and the roof's edge
// (R[6] to R[7] of the sections) cut by the outlines of its glass traced from side photos (m.dlo.glass: polygons of
// [s, y]), round them the frames - black (m.dlo.black), chrome (m.dlo.chrome) or paint (m.dlo.frame). Cut in slabs
// between every station and every corner of an outline, each slab split where the outlines' edges cross it (straight
// within it), so the glass has the real car's corners - the slanted pillars, a quarter light, BMW's kink - not the
// loft's 6 cm steps. Vertices are shared along the glass's edges (the cabin's seals follow them: interior.js).
const pointIn = (poly, s, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [si, yi] = poly[i], [sj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && s < (sj - si) * (y - yi) / (yj - yi) + si) c = !c;
  }
  return c;
};
export const dloRange = (m) => {
  const all = m.dlo.glass.flat();
  return m.dlo.range ?? [Math.min(...all.map(p => p[0])) - 0.25, Math.max(...all.map(p => p[0])) + 0.25];
};
function greenhouseBand(m, stations, secs, pos, uvs, groups, ringOf) {
  const [r0, r1] = dloRange(m), L = m.L;
  // (the glass's surround, m.dlo.surround metres wide, black - or chrome: m.dlo.surroundChrome)
  const ring = m.dlo.surround ? m.dlo.glass.map(g => grow(g, m.dlo.surround)) : [];
  const polys = [['glass', m.dlo.glass], ['chrome', [...(m.dlo.chrome ?? []), ...(m.dlo.surroundChrome ? ring : [])]], ['trim', [...(m.dlo.black ?? []), ...(m.dlo.surroundChrome ? [] : ring)]]];
  const frame = m.dlo.frame === 'black' ? 'trim' : m.dlo.frame === 'chrome' ? 'chrome' : 'body';
  const brk = new Set(stations.filter(s => s > r0 && s < r1).map(s => +s.toFixed(5)));
  brk.add(+r0.toFixed(5)); brk.add(+r1.toFixed(5));
  for (const [, list] of polys) for (const pg of list) for (const [s] of pg) if (s > r0 && s < r1) brk.add(+s.toFixed(5));
  const B = [...brk].sort((a, b) => a - b).filter((s, i, a) => i === 0 || s - a[i - 1] > 2e-4);
  const bandAt = (s) => {
    let lo = 0, hi = stations.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (stations[mid] <= s) lo = mid; else hi = mid; }
    const t = (s - stations[lo]) / (stations[hi] - stations[lo] || 1), A = secs[lo], C = secs[hi];
    const l = (i, c) => A[i][c] + (C[i][c] - A[i][c]) * t;
    return { x6: l(6, 0), y6: l(6, 1), x7: l(7, 0), y7: l(7, 1) };
  };
  const edges = [];
  for (const [cls, list] of polys) for (const pg of list) for (let i = 0; i < pg.length; i++) edges.push([pg[i], pg[(i + 1) % pg.length]]);
  const base = pos.length / 3;
  for (const side of [1, -1]) {
    const ids = new Map();
    const vid = (s, y, edge) => {
      const k = s.toFixed(5) + ':' + y.toFixed(5);
      let i = ids.get(k);
      if (i === undefined) {
        const b = bandAt(s), u = Math.max(0, Math.min(1, (y - b.y6) / (b.y7 - b.y6 || 1)));
        i = pos.length / 3; ids.set(k, i);
        pos.push(side * (b.x6 + (b.x7 - b.x6) * u), y, s - L / 2); uvs.push(s / L, y);
        ringOf.push(edge === 'lo' ? (side > 0 ? 6 : 12) : edge === 'hi' ? (side > 0 ? 7 : 11) : -1);
      }
      return i;
    };
    for (let k = 0; k < B.length - 1; k++) {
      const sa = B[k], sb = B[k + 1], sm = (sa + sb) / 2, ba = bandAt(sa), bb = bandAt(sb), bm = bandAt(sm);
      const lines = [{ ya: ba.y6, yb: bb.y6, ym: bm.y6, e: 'lo' }];
      for (const [p, q] of edges) {
        if ((p[0] - sm) * (q[0] - sm) >= 0) continue;
        const at = (s) => p[1] + (q[1] - p[1]) * (s - p[0]) / (q[0] - p[0]);
        lines.push({ ya: Math.min(ba.y7, Math.max(ba.y6, at(sa))), yb: Math.min(bb.y7, Math.max(bb.y6, at(sb))), ym: Math.min(bm.y7, Math.max(bm.y6, at(sm))) });
      }
      lines.push({ ya: ba.y7, yb: bb.y7, ym: bm.y7, e: 'hi' });
      lines.sort((a, b) => a.ym - b.ym || (a.e === 'lo' ? -1 : b.e === 'lo' ? 1 : a.e === 'hi' ? 1 : b.e === 'hi' ? -1 : 0));
      for (let i = 0; i < lines.length - 1; i++) {
        const lo = lines[i], hi = lines[i + 1];
        if (hi.ym - lo.ym < 1e-5 && hi.ya - lo.ya < 1e-5 && hi.yb - lo.yb < 1e-5) continue;
        const ym = (lo.ym + hi.ym) / 2;
        let g = frame;
        for (const [cls, list] of polys) if (list.some(pg => pointIn(pg, sm, ym))) { g = cls; break; }
        const A = vid(sa, lo.ya, lo.e), Bv = vid(sa, hi.ya, hi.e), C = vid(sb, lo.yb, lo.e), D = vid(sb, hi.yb, hi.e);
        const tri = side > 0 ? [A, Bv, C, Bv, D, C] : [A, C, Bv, Bv, C, D];
        for (let t = 0; t < 6; t += 3) if (new Set(tri.slice(t, t + 3)).size === 3) groups[g].push(...tri.slice(t, t + 3));
      }
    }
  }
  return pos.length / 3 - base;
}

function carBodyGeometry(m) {
  const stations = stationsOf(m);
  const ring = 10 + 8;
  const pos = [], uvs = [], secs = [], ringOf = [];
  for (const s of stations) {
    const R = section(m, s);
    secs.push(R);
    const z = s - m.L / 2;
    const full = [...R, ...R.slice(1, 9).reverse().map(([x, y]) => [-x, y])];
    for (const [k, [x, y]] of full.entries()) { pos.push(x, y, z); uvs.push(s / m.L, y); ringOf.push(k); }
  }
  const groups = { body: [], glass: [], trim: [], under: [], chrome: [] };
  const inR = (s, r) => s >= r[0] && s <= r[1];
  const dlo = m.dlo ? dloRange(m) : null;
  const sill = m.dlo ? (() => { const g = m.dlo.glass.flat(); return [Math.min(...g.map(p => p[0])), Math.max(...g.map(p => p[0]))]; })() : null;
  for (let j = 0; j < stations.length - 1; j++) {
    const s = (stations[j] + stations[j + 1]) / 2;
    const p = profileAt(m, s);
    for (let i = 0; i < ring; i++) {
      const i2 = (i + 1) % ring;
      const a = j * ring + i, b = j * ring + i2, c = (j + 1) * ring + i, d = (j + 1) * ring + i2;
      // segment id relative to the right half (mirror left)
      const seg = i < 9 ? i : ring - 1 - i;          // 0..8
      let g = 'body';
      // (the underside - but where the bottom climbs steeply at a bumper, its face is the bumper's: paint)
      if (seg === 0) g = Math.abs(interp(m.bottom, stations[j + 1]) - interp(m.bottom, stations[j])) > 0.6 * (stations[j + 1] - stations[j]) ? 'body' : 'under';
      else if (dlo && seg === 6 && stations[j] >= dlo[0] - 1e-6 && stations[j + 1] <= dlo[1] + 1e-6) continue;   // (greenhouseBand)
      else if (dlo && seg === 5) { if (p.cab > 0.5 && inR(s, sill)) g = m.dlo.sill === 'paint' ? 'body' : m.dlo.sill ?? 'trim'; }
      else if ((seg === 6) && p.cab > 0.5 && !dlo) {
        g = inR(s, m.side) ? 'glass' : m.pillarPaint ? 'body' : 'trim';
        for (const pl of m.pillars) if (Math.abs(s - pl) < 0.055 && (g === 'glass' || !m.pillarPaint)) g = 'trim';
      } else if (seg === 8 && p.cab > 0.3) {
        if (inR(s, m.wind) || inR(s, m.rear)) g = 'glass';      // seg 7 stays body => A/C pillars
      } else if (seg === 5 && p.cab > 0.5 && inR(s, m.side) && !dlo) g = 'trim';   // window seal line
      groups[g].push(a, b, c, b, d, c);
    }
  }
  if (dlo) {
    // (the band's ends must fall on stations: it replaces whole quads)
    const st = stations.filter(s => s >= dlo[0] - 1e-6 && s <= dlo[1] + 1e-6);
    m.dlo.range = [st[0], st[st.length - 1]];
    greenhouseBand(m, stations, secs, pos, uvs, groups, ringOf);
  }
  const idx = [...groups.body, ...groups.glass, ...groups.trim, ...groups.under, ...groups.chrome];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  let o = 0;
  g.addGroup(o, groups.body.length, 0); o += groups.body.length;
  g.addGroup(o, groups.glass.length, 1); o += groups.glass.length;
  g.addGroup(o, groups.trim.length, 2); o += groups.trim.length;
  g.addGroup(o, groups.under.length, 3); o += groups.under.length;
  if (groups.chrome.length) g.addGroup(o, groups.chrome.length, 4);
  g.userData.ringOf = ringOf;          // (each vertex's place in its section's ring, -1 inside the greenhouse's band)
  g.userData.stations = stations; g.userData.secs = secs;
  g.computeVertexNormals();

  // end caps (flat normals, separate vertices)
  const caps = [];
  for (const [j, front] of [[0, true], [stations.length - 1, false]]) {
    const R = section(m, stations[j]);
    const z = stations[j] - m.L / 2;
    const full = [...R, ...R.slice(1, 9).reverse().map(([x, y]) => [-x, y])];
    const cy = full.reduce((a, p) => a + p[1], 0) / full.length;
    for (let i = 0; i < full.length; i++) {
      const p0 = full[i], p1 = full[(i + 1) % full.length];
      if (front) caps.push(0, cy, z, p1[0], p1[1], z, p0[0], p0[1], z);
      else caps.push(0, cy, z, p0[0], p0[1], z, p1[0], p1[1], z);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(caps, 3));
  cg.computeVertexNormals();
  return { body: g, caps: cg };
}

export function roundedRectGeo(w, h, r, depth) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

const shared = {};
// an unlit tail lamp's lens shows its red only in daylight (its slight emissive stands for the light it bounces back):
// k follows the day (main.js applyWeather), 0 at night, when only headlights make it glow; every lens made is here
export const DAYLIGHT = { k: 1, tails: [] };
function sharedMats() {
  if (shared.ready) return shared;
  shared.glass = new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.86, envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false });
  shared.glass.userData.glass = true;                  // (rain.js: snow lies on it opaque, as on the paint)
  shared.trim = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.35, metalness: 0.2 });
  shared.under = new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.95 });
  shared.tire = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.88 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: 0xdadde0, roughness: 0.12, metalness: 1.0 });
  shared.headGlass = new THREE.MeshPhysicalMaterial({ color: 0xcfd6dc, roughness: 0.05, metalness: 0.6, clearcoat: 1, emissive: 0xfff6e0, emissiveIntensity: 0.0 });
  shared.plastic = new THREE.MeshStandardMaterial({ color: 0x19191a, roughness: 0.55 });
  shared.mirror = new THREE.MeshStandardMaterial({ color: 0xa6aaae, roughness: 0.05, metalness: 1.0 });   // (a door mirror's glass: ~40-50 %)
  shared.ready = true;
  return shared;
}

// (V113) a car far away: one material for every part but its paint, each vertex's colour (its part's, linear) with its
// roughness and metal in the alpha (metal: 0.5 + 0.49 r, else 0.49 r - cars.js buildCar)
function farMaterial() {
  if (shared.farMat) return shared.farMat;
  const m = shared.farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 1.1 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  float farMk = step(0.5, vColor.a);
  metalnessFactor = farMk;
  roughnessFactor = max(0.03, (vColor.a - 0.5 * farMk) / 0.49);`);
  };
  m.customProgramCacheKey = () => 'carFar';
  return m;
}
// a part's look from afar: its colour (a map's: its average), whether metal, its roughness (a clear coat's, if it has
// one); a clear lens shows its lamp's reflector, a 3D rim's coloured parts a mid metal
const texAvgs = new WeakMap(), _lin = new THREE.Color();
function texAvg(t) {
  if (texAvgs.has(t)) return texAvgs.get(t);
  const out = new THREE.Color(0.5, 0.5, 0.5), img = t.image;
  try {
    if (img && img.width > 0 && typeof document !== 'undefined') {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data, srgb = t.colorSpace === THREE.SRGBColorSpace;
      out.setRGB(0, 0, 0);
      for (let i = 0; i < d.length; i += 4) { _lin.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace); out.r += _lin.r / 256; out.g += _lin.g / 256; out.b += _lin.b / 256; }
    }
  } catch { out.setRGB(0.5, 0.5, 0.5); }
  texAvgs.set(t, out);
  return out;
}
function farLook(mt) {
  if (mt.transparent && (mt.opacity ?? 1) < 0.5) return [new THREE.Color(0xd2d6db), true, 0.08];
  if (mt.vertexColors) return [new THREE.Color(0.45, 0.45, 0.46), true, 0.3];
  const c = mt.color ? mt.color.clone() : new THREE.Color(1, 1, 1);
  if (mt.map) c.multiply(texAvg(mt.map));
  let rough = mt.roughness ?? 0.5;
  if ((mt.clearcoat ?? 0) > 0.5) rough = Math.min(rough, (mt.clearcoatRoughness ?? 0) + 0.05);
  return [c, (mt.metalness ?? 0) > 0.5, Math.min(1, Math.max(0, rough))];
}

// (V103) a model's own parts (m.parts, carparts.js), laid on its body - made once per model, shared by its cars
const PARTS = new WeakMap(), BODIES = new WeakMap();
function partBody(m, raw) {
  if (!BODIES.has(m)) BODIES.set(m, bodyOf(m, raw.userData.stations, raw.userData.secs));
  return BODIES.get(m);
}
function partsOf(m, raw) {
  if (PARTS.has(m)) return PARTS.get(m);
  const body = partBody(m, raw), byMat = new Map();
  for (const part of m.parts.flatMap(p => p.rim ? [{ ...p, mat: 'black', grow: p.rim, off: (p.off ?? 0.003) - 0.0015, rim: 0, depth: 0 }, p] : [p])) {
    const g = partGeo(body, part, m.L);
    if (!g.attributes.position.count) continue;
    if (!byMat.has(part.mat)) byMat.set(part.mat, []);
    byMat.get(part.mat).push(g);
  }
  const out = [...byMat].map(([name, gs]) => [mergeGeometries(gs.map(g => { const c = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k); return c; })), name]);
  PARTS.set(m, out);
  return out;
}
// the parts' materials (shared by every car): lamp interiors, lenses, trims, grilles
function partMat(name, S) {
  const P = shared.parts ??= {};
  if (P[name]) return P[name];
  const std = (o) => new THREE.MeshStandardMaterial(o), phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const meshTex = (kind) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#060607'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#2a2b2e'; g.lineWidth = 5;
    if (kind === 'slats') { for (let y = 8; y < 64; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); } }
    else if (kind === 'vslats') { g.lineWidth = 6; for (let x = 8; x < 64; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); } }
    else for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const cx = x * 32 + (y % 2) * 16 + 8, cy = y * 32 + 16; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * 13, cy + Math.sin(a) * 13); } g.closePath(); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(0.5, 0.5);
    return t;
  };
  const M = {
    chrome: S.chrome, trim: S.trim, under: S.under, tire: S.tire,
    black: phys({ color: 0x050506, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }),   // (gloss black trim)
    matte: std({ color: 0x1c1d1f, roughness: 0.78 }),                      // (unpainted textured plastic)
    grey: std({ color: 0x3a3c3f, roughness: 0.7 }),
    housing: std({ color: 0xd2d6db, roughness: 0.07, metalness: 1 }),      // (a lamp's reflector, behind its lens)
    dark: std({ color: 0x24272b, roughness: 0.25, metalness: 0.9 }),       // (a smoked lamp's dark chrome)
    proj: phys({ color: 0x0e1114, roughness: 0.04, metalness: 0.2, clearcoat: 1 }),   // (a projector's lens: dark glass)
    lens: phys({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false }),
    amber: std({ color: 0xb8730f, roughness: 0.25, emissive: 0xff9a20, emissiveIntensity: 0.03 }),
    white: phys({ color: 0xe8eaec, roughness: 0.12, clearcoat: 1 }),       // (a reverse lamp's clear glass)
    red: std({ color: 0x5c0607, roughness: 0.3 }),                         // (reflectors)
    mesh: std({ map: meshTex('hex'), roughness: 0.6 }),
    slats: std({ map: meshTex('slats'), roughness: 0.5 }),
    vslats: std({ map: meshTex('vslats'), roughness: 0.5 }),
    glass: S.glass,
  };
  for (const [k, v] of Object.entries(M)) P[k] = v;
  return P[name] ?? S.trim;
}

// (V114) The snow lying on a parked car: after a night's snowfall a car is a pillow of it - on the roof, the bonnet, the
// boot and the windscreens (a windscreen at ~30 deg holds it, a door or a side window does not), as deep as on the
// ground or a little less, rounded off at every edge. Made once per model from its own body: its top surface sampled
// on a 7 cm grid (the highest of its triangles over each point, and how much that one faces up), the snow kept where
// the top faces up enough (thinner the steeper), its depth rounded down to nothing over the last three cells to the
// edge of where it lies. Drawn in the roofs' snow material (snowroofs.js: its depth a uniform, the ground's).
const CAPS = new WeakMap();
function carCap(m, P, groups) {
  if (CAPS.has(m)) return CAPS.get(m);
  const C = 0.07, x0 = -m.W / 2 - 0.15, z0 = -m.L / 2 - 0.15, nx = Math.ceil((m.W + 0.3) / C) + 1, nz = Math.ceil((m.L + 0.3) / C) + 1, NN = nx * nz;
  const top = new Float32Array(NN).fill(-1e9), up = new Float32Array(NN);
  for (const g of groups) for (let t = g.start; t + 2 < g.start + g.count; t += 3) {
    const ax = P[3 * t], ay = P[3 * t + 1], az = P[3 * t + 2], bx = P[3 * t + 3], by = P[3 * t + 4], bz = P[3 * t + 5], cx = P[3 * t + 6], cy = P[3 * t + 7], cz = P[3 * t + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx, nl = Math.hypot(nX, nY, nZ);
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (nl < 1e-12 || Math.abs(det) < 1e-12) continue;
    const ny = Math.abs(nY) / nl;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / C)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / C));
    const j0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - z0) / C)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + i * C, pz = z0 + j * C;
      const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det, l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det, l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const y = l1 * ay + l2 * by + l3 * cy, k = j * nx + i;
      if (y > top[k]) { top[k] = y; up[k] = ny; }
    }
  }
  const has = new Uint8Array(NN);
  for (let k = 0; k < NN; k++) has[k] = top[k] > -1e8 && up[k] > 0.55 ? 1 : 0;
  // how many cells in from the edge of the snow (up to 3)
  const dist = new Uint8Array(NN);
  let cur = has;
  for (let it = 1; it <= 3; it++) {
    const nxt = new Uint8Array(NN);
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (cur[k] && cur[k - 1] && cur[k + 1] && cur[k - nx] && cur[k + nx]) { nxt[k] = 1; dist[k] = it; }
    }
    cur = nxt;
  }
  const th = new Float32Array(NN);
  for (let k = 0; k < NN; k++) if (has[k]) th[k] = 0.85 * THREE.MathUtils.smoothstep(up[k], 0.55, 0.85) * Math.sqrt(dist[k] / 3);
  const idx = new Int32Array(NN).fill(-1), pos = [], dir = [], nrm = [], ind = [];
  const hRef = (i, j) => { const k = j * nx + i; return top[k] + th[k] * 0.25; };
  const vert = (i, j) => {
    const k = j * nx + i;
    if (idx[k] >= 0) return idx[k];
    idx[k] = pos.length / 3;
    pos.push(x0 + i * C, top[k], z0 + j * C); dir.push(0, th[k], 0);
    const il = Math.max(0, i - 1), ir = Math.min(nx - 1, i + 1), jl = Math.max(0, j - 1), jr = Math.min(nz - 1, j + 1);
    const ok = (ii, jj) => has[jj * nx + ii];
    const dx = ok(ir, j) && ok(il, j) ? (hRef(ir, j) - hRef(il, j)) / ((ir - il) * C) : 0, dz = ok(i, jr) && ok(i, jl) ? (hRef(i, jr) - hRef(i, jl)) / ((jr - jl) * C) : 0;
    const l = Math.hypot(dx, 1, dz);
    nrm.push(-dx / l, 1 / l, -dz / l);
    return idx[k];
  };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k = j * nx + i, ks = [k, k + 1, k + 1 + nx, k + nx];
    if (!ks.every(q => has[q])) continue;
    const hs = ks.map(q => top[q]);
    if (Math.max(...hs) - Math.min(...hs) > 0.12) continue;          // (no skin across a drop: a roof's edge to a door)
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1);
    ind.push(a, c, b, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('snowDir', new THREE.Float32BufferAttribute(dir, 3));
  g.setAttribute('snowFix', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));   // (the slab material's: none here)
  g.setIndex(ind);
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 0.6;
  CAPS.set(m, g);
  return g;
}

export function paintMaterial(color, { metallic = 0.6, rough = 0.32, dusty = 0 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color, metalness: metallic, roughness: rough + dusty * 0.35,
    clearcoat: 1 - dusty * 0.5, clearcoatRoughness: 0.04 + dusty * 0.35,
    envMapIntensity: 1.1,
  });
  if (dusty > 0) { m.roughnessMap = TEX.stucco; }
  return m;
}

export function buildCar(modelKey, paint, plateKey) {
  const m = MODELS[modelKey];
  const S = sharedMats();
  const group = new THREE.Group();
  const bodyPivot = new THREE.Group();      // for pitch/roll
  group.add(bodyPivot);
  const raw = carBodyGeometry(m);
  const body = toCreasedNormals(raw.body, 0.55), caps = raw.caps;
  // see-through from both sides: three.js draws such a material twice (inner faces, then outer) and re-picks its
  // shader program both times, every frame. Two materials, one per side, on the same triangles draw the same.
  const glassIn = S.glass.clone(), glassOut = S.glass.clone();
  glassIn.side = THREE.BackSide; glassOut.side = THREE.FrontSide;
  const glass = { set opacity(v) { glassIn.opacity = glassOut.opacity = v; }, get opacity() { return glassOut.opacity; } };
  // the body, its end caps and every fixed detail are merged into one mesh: one draw call per material
  const rigid = [[body, [paint, glassIn, S.trim, S.under, S.chrome]], [caps, paint]];

  const zAt = (s) => s - m.L / 2;
  const add = (geo, material, x, y, z, rx = 0, ry = 0, rz = 0) => { rigid.push([geo, material, pose(x, y, z, rx, ry, rz)]); return null; };

  // find where the body surface is for a point (x,y), marching from the front or rear
  const surfaceS = (x, y, fromFront) => {
    for (let k = 0; k <= 80; k++) {
      const s = fromFront ? k * 0.01 : m.L - k * 0.01;
      const p = profileAt(m, s);
      if (y > p.yb && y < p.belt + 0.02 && Math.abs(x) < p.hw * 0.97) return s;
    }
    return fromFront ? 0.1 : m.L - 0.1;
  };
  const headMat = S.headGlass.clone();
  const [, hy, hx, hw, hh] = m.lights.head;
  const headL = [], tailL = [];
  const own = !!(m.details || m.parts);           // (a model with its own lamps, grille and trims)
  if (!own) for (const sg of [-1, 1]) {
    const s0 = surfaceS(sg * hx, hy + hh * 0.3, true);
    const p = profileAt(m, s0 + 0.05);
    const x = sg * Math.min(hx, p.hw - hw / 2 - 0.03);
    headL.push(add(roundedRectGeo(hw, hh, 0.03, 0.12), headMat, x, hy, zAt(s0) + 0.035, -0.35, sg * 0.25, 0));
  }
  const tailMat = new THREE.MeshPhysicalMaterial({ color: 0x7a0a0a, roughness: 0.15, clearcoat: 1, emissive: 0xff1a10, emissiveIntensity: 0.15 * DAYLIGHT.k });
  DAYLIGHT.tails.push(tailMat);
  const [, ty, tx, tw, th] = m.lights.tail;
  if (!own) for (const sg of [-1, 1]) {
    const s0 = surfaceS(sg * tx, ty, false);
    const p = profileAt(m, s0 - 0.05);
    const x = sg * Math.min(tx, p.hw - tw / 2 - 0.02);
    tailL.push(add(roundedRectGeo(tw, th, 0.03, 0.1), tailMat, x, ty, zAt(s0) - 0.03, 0.1, -sg * 0.25, 0));
  }
  // grille
  const sg0 = surfaceS(0, m.lights.head[1], true);
  if (m.parts) for (const [geo, name] of partsOf(m, raw.body)) rigid.push([geo, name === 'paint' ? paint : name === 'head' ? headMat : name === 'tail' ? tailMat : partMat(name, S)]);
  else if (m.grille === 'kidney') {
    for (const sg of [-1, 1]) add(roundedRectGeo(0.17, 0.12, 0.04, 0.08), S.chrome, sg * 0.11, 0.66, zAt(surfaceS(0.11, 0.66, true)) + 0.02, -0.3, 0, 0);
    for (const sg of [-1, 1]) add(roundedRectGeo(0.14, 0.09, 0.035, 0.08), S.trim, sg * 0.11, 0.66, zAt(surfaceS(0.11, 0.66, true)) + 0.008, -0.3, 0, 0);
    add(roundedRectGeo(0.9, 0.12, 0.05, 0.06), S.trim, 0, 0.36, zAt(surfaceS(0.4, 0.36, true)) + 0.01);
  } else if (!m.details) {
    add(roundedRectGeo(m.W * 0.42, 0.13, 0.05, 0.08), S.trim, 0, m.lights.head[1] - 0.04, zAt(sg0) + 0.02, -0.3, 0, 0);
    add(roundedRectGeo(m.W * 0.5, 0.12, 0.05, 0.06), S.trim, 0, 0.38, zAt(surfaceS(0.4, 0.38, true)) + 0.01);
    if (m.grille === 'opel') add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), S.chrome, 0, m.lights.head[1] - 0.04, zAt(sg0) - 0.005, Math.PI / 2, 0, 0);
  }
  // plates
  const plateMat = new THREE.MeshStandardMaterial({ map: TEX[plateKey] ?? TEX.plateA, roughness: 0.4 });
  const pg = new THREE.PlaneGeometry(0.52, 0.112);
  // (a model with its own parts: its plates where its photos have them, on the paint - m.plates.front / .rear: [y])
  const pOff = m.plates?.off ?? 0.008;         // (how far out of the paint: on a grille, in front of it)
  const plateZ = (y, end) => { const o = partBody(m, raw.body).outline(y, end); return o ? (end === 'f' ? zAt(o[0][1]) - pOff : zAt(m.L - o[0][1]) + 0.008) : end === 'f' ? zAt(0) : zAt(m.L); };
  const [pfy, pfz] = m.plates?.front?.length === 1 ? [m.plates.front[0], plateZ(m.plates.front[0], 'f')] : m.plates?.front ?? [0.42, zAt(0) - 0.012];
  const [pry, prz] = m.plates?.rear?.length === 1 ? [m.plates.rear[0], plateZ(m.plates.rear[0], 'r')] : m.plates?.rear ?? [m.belt[m.belt.length - 1][1] - 0.05, zAt(m.L) + 0.012];
  add(pg, plateMat, 0, pfy, pfz, m.plates?.frontTilt ?? 0, Math.PI, 0);
  add(pg, plateMat, m.plates?.rearX ?? 0, pry, prz, m.plates?.rearTilt ?? 0);
  // mirrors, door handles and shut lines (a model with sides of its own draws them itself: doblo.js)
  const mirrors = [];
  // (the driver's eyes, as vehicle.js headPos() has them: the door mirrors are set from there)
  const eye = new THREE.Vector3(-0.37, m.eyeY ?? Math.max(...m.belt.map(b => b[1])) + 0.22, m.pillars[0] - 0.06 - m.L / 2);
  // (a door mirror: its painted shell, wider than tall, out from the door's front corner on a black foot; its glass on
  // the back, turned a little toward the driver - what the driver sees of it)
  if (!m.ownSides) for (const sg of [-1, 1]) {
    const s = m.mirrorAt?.[0] ?? m.wind[0] + 0.12;
    const p = profileAt(m, s);
    const [mw, mh] = m.mirror ?? [0.2, 0.12];
    const cx = sg * (p.hw + 0.05 + mw / 2), cy = m.mirrorAt?.[1] ?? p.belt + 0.075, cz = zAt(s);
    // set as a driver sets it: its glass's normal halves the angle between the eye and a level ray back past the car's
    // flank, a few degrees out (the flank just at the glass's inner edge; the passenger's convex one shows more)
    const toEye = eye.clone().sub(new THREE.Vector3(cx, cy, cz)).normalize(), back = new THREE.Vector3(sg * (sg < 0 ? 0.055 : 0.09), 0, 1).normalize();
    const nG = toEye.add(back).normalize(), ry = Math.atan2(nG.x, nG.z), rx = -Math.asin(nG.y);
    const glass = (o) => new THREE.Matrix4().compose(new THREE.Vector3(cx + Math.sin(ry) * o, cy, cz + Math.cos(ry) * o),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    add(roundedRectGeo(mw, mh, Math.min(0.045, mh / 2 - 0.01), 0.06), paint, cx, cy, cz, 0, ry, 0);
    rigid.push([new THREE.PlaneGeometry(mw - 0.024, mh - 0.024), S.mirror, glass(0.04)]);
    mirrors.push({ w: mw - 0.024, h: mh - 0.024, side: sg, m: glass(0.041) });   // (its glass: mirror.js)
    add(new THREE.BoxGeometry(0.1, 0.04, 0.06), S.trim, sg * (p.hw + 0.03), p.belt + 0.045, cz);
  }
  if (!m.ownSides) for (const sg of [-1, 1]) for (const [s, hy] of m.handles ?? [[m.pillars[0] - 0.2], [m.pillars[1] - 0.25]]) {
    const p = profileAt(m, s), y = hy ?? p.belt - 0.08, x = m.parts ? partBody(m, raw.body).sideX(s, y) : p.hw * 0.99;
    add(new THREE.BoxGeometry(0.02, 0.025, 0.13), m.chromeHandles ? S.chrome : m.handleMat === 'black' ? S.trim : paint, sg * (x + 0.005), y, zAt(s));
  }
  const seamMat = S.trim;
  if (!m.ownSides && !m.parts) for (const sg of [-1, 1]) for (const s of [m.wind[0] + 0.12, m.pillars[0] + 0.03, m.pillars[1] - 0.02]) {
    const p = profileAt(m, s);
    const y0 = Math.max(p.yb + 0.06, profileAt(m, s - 0.1).yb + 0.06, profileAt(m, s + 0.1).yb + 0.06), y1 = p.belt - 0.015;
    if (y1 - y0 < 0.1) continue;
    add(new THREE.BoxGeometry(0.006, y1 - y0, 0.006), seamMat, sg * (p.hw + 0.001), (y0 + y1) / 2, zAt(s));
  }
  // exhaust
  if (!own) add(new THREE.CylinderGeometry(0.035, 0.035, 0.15, 10), S.chrome, -0.5, 0.26, zAt(m.L) + 0.02, Math.PI / 2, 0, 0);
  else if (m.exhaust) for (const [x, y, r, len] of m.exhaust) add(new THREE.CylinderGeometry(r, r, len, 14, 1, true), S.chrome, x, y, zAt(m.L) - len / 2 + 0.03, Math.PI / 2, 0, 0);
  // a model's own details (grille, lamps, trim, its cabin: maybach.js), merged with the body like the rest
  m.details?.({ add, S, paint, zAt, prof: (s) => profileAt(m, s), surfaceS, headMat, tailMat, rigid, mirrors });

  // the cabin (interior.js): dashboard and instruments, steering wheel, seats, door cards, headliner - its own meshes,
  // which a car far away hides (main.js)
  const cabin = buildCabin(modelKey, m, raw.body, raw.caps);
  bodyPivot.add(cabin.group);
  // the parked wipers, with the cabin (drawn up to 16 m away, like it: main.js); the rain's sweeping ones replace them
  // in the cockpit (windshield.js)
  const wipers = m.ownSides || !m.wind ? null : new THREE.Mesh(wiperGeometry(m), S.trim);
  if (wipers) { wipers.castShadow = true; wipers.receiveShadow = true; cabin.group.add(wipers); }
  const steer = cabin.steer;

  // wheels
  const wheels = [];
  let tireGeo;
  // (V103: the model's own wheels, in 3D - its rim's design, on the real tyre's size)
  if (m.rimStyle && !m.rim) m.rim = { geo: rim3D(m.r * m.rimK, m.rimStyle), mat: (shared.rimMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.32 })) };
  if (m.rim) {
    // round a 3D rim: the tyre's section turned about the axle - the bead on the rim's lip, the sidewalls bulging, the
    // shoulders, the tread - open in the middle, so the rim shows through
    const w = m.tireW / 2, R0 = m.r * m.rimK - 0.012, rm = (R0 + m.r) / 2;
    const sec = [[R0, -w + 0.012], [R0 + 0.018, -w - 0.004], [rm, -w - 0.014], [m.r - 0.035, -w - 0.006], [m.r - 0.008, -w + 0.022], [m.r, -w + 0.05],
      [m.r, w - 0.05], [m.r - 0.008, w - 0.022], [m.r - 0.035, w + 0.006], [rm, w + 0.014], [R0 + 0.018, w + 0.004], [R0, w - 0.012]];
    tireGeo = new THREE.LatheGeometry(sec.map(([r, y]) => new THREE.Vector2(r, y)), 48);
    tireGeo.rotateZ(Math.PI / 2);
  } else {
    tireGeo = new THREE.CylinderGeometry(m.r, m.r, m.tireW, 28, 1);
    tireGeo.rotateZ(Math.PI / 2);
    // rounded sidewall bulge
    const tp = tireGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
      const rr = Math.hypot(y, z);
      if (rr > m.r * 0.99) { const k = 1 - 0.035 * Math.pow(Math.abs(x) / (m.tireW / 2), 4); tp.setY(i, y * k); tp.setZ(i, z * k); }
    }
  }
  tireGeo.computeVertexNormals();
  const rimMat = m.rim ? m.rim.mat : new THREE.MeshStandardMaterial({ map: TEX[m.wheelTex], roughness: 0.3, metalness: 0.8, alphaTest: 0 });
  const rimGeo = m.rim ? m.rim.geo : new THREE.CircleGeometry(m.r * 0.72, 28);
  const arch = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.9, side: THREE.DoubleSide });
  // each wheel: steering pivot -> spin -> tyre, rim (outside) and dark inner disc. The pivot and spin are kept as
  // transforms only; the 4 tyres, the 4 rims and the 4 discs are 3 meshes whose vertices setWheels places when the
  // wheels turn (a parked car: once). Not instanced: these materials are also drawn uninstanced (the body's
  // underside), and three.js would switch shader programs back and forth for every car.
  const fourOf = (geo0, mat) => {
    const g = geo0.index ? geo0.toNonIndexed() : geo0, n = g.attributes.position.count, U0 = g.attributes.uv?.array;
    const geo = new THREE.BufferGeometry(), U = new Float32Array(n * 8);
    if (U0) for (let i = 0; i < 4; i++) U.set(U0, i * n * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 12), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    const C0 = g.attributes.color?.array;                          // (a model's 3D rim: its parts' colours)
    if (C0) { const C = new Float32Array(n * 12); for (let i = 0; i < 4; i++) C.set(C0, i * n * 3); geo.setAttribute('color', new THREE.BufferAttribute(C, 3)); }
    return { mesh: new THREE.Mesh(geo, mat), n, P0: g.attributes.position.array, N0: g.attributes.normal.array };
  };
  const tires = fourOf(tireGeo, S.tire), rims = fourOf(rimGeo, rimMat), inners = fourOf(new THREE.CircleGeometry(m.r * (m.rimK ?? 0.72), 20), S.under);
  tires.mesh.castShadow = true;
  const wells = [];
  for (const [ai, a] of m.axles.entries()) {
    for (const sg of [-1, 1]) {
      const pivot = new THREE.Object3D();
      const x = sg * (m.track ? m.track[ai] / 2 : m.W / 2 - m.tireW / 2 - 0.005);    // (V103: the real tracks)
      pivot.position.set(x, m.r, zAt(a));
      const spin = new THREE.Object3D();
      const rimAt = pose(sg * (m.tireW / 2 + 0.002), 0, 0, 0, sg * Math.PI / 2, 0), innerAt = pose(-sg * (m.tireW / 2 + 0.002), 0, 0, 0, -sg * Math.PI / 2, 0);
      // dark wheel-well liner
      // (round a 3D rim, the liner arches over the top only: none of it shows beside the tyre down to the ground)
      wells.push([new THREE.CylinderGeometry(m.r + 0.06, m.r + 0.06, m.tireW + 0.1, 18, 1, true, m.rim ? 0 : -Math.PI / 2, Math.PI), arch, pose(x, m.r, zAt(a), 0, 0, Math.PI / 2)]);
      // (V103) the well's inner wall: through the arch, past the tyre, no view into the cabin's lining
      wells.push([new THREE.CircleGeometry(m.r + 0.075, 24), arch, pose(x - sg * (m.tireW / 2 + 0.05), m.r, zAt(a), 0, Math.PI / 2, 0)]);
      wheels.push({ pivot, spin, rimAt, innerAt, front: ai === 0, side: sg, x, z: zAt(a) });
    }
  }
  group.add(tires.mesh, rims.mesh, inners.mesh);
  const wellMesh = new THREE.Mesh(mergeByMaterial(wells).geo, arch);
  bodyPivot.add(wellMesh);
  const wm = new THREE.Matrix4(), wp = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  const put = (f, i, M) => {
    const P = f.mesh.geometry.attributes.position, N = f.mesh.geometry.attributes.normal, o = i * f.n;
    nm.getNormalMatrix(M);
    for (let k = 0; k < f.n; k++) {
      v.fromArray(f.P0, k * 3).applyMatrix4(M).toArray(P.array, (o + k) * 3);
      v.fromArray(f.N0, k * 3).applyNormalMatrix(nm).toArray(N.array, (o + k) * 3);
    }
  };
  let wSpin = NaN, wSteer = NaN;
  const wDrop = [0, 0, 0, 0];
  // (drops: each wheel's place on its spring, up (+) or down (-) from where it rests, m - V93: vehicle.js)
  const setWheels = (spinA, steerA, drops = null) => {
    let moved = false;
    for (let i = 0; i < 4; i++) { const d = drops ? drops[i] : 0; if (d !== wDrop[i]) { wDrop[i] = d; moved = true; } }
    if (spinA === wSpin && steerA === wSteer && !moved) return;
    wSpin = spinA; wSteer = steerA;
    wheels.forEach((w, i) => {
      w.spin.rotation.x = spinA; if (w.front) w.pivot.rotation.y = -steerA;
      w.pivot.position.y = m.r + (wDrop[i] ?? 0);
      w.pivot.updateMatrix(); w.spin.updateMatrix();
      wp.multiplyMatrices(w.pivot.matrix, w.spin.matrix);
      put(tires, i, wp); put(rims, i, wm.multiplyMatrices(wp, w.rimAt)); put(inners, i, wm.multiplyMatrices(wp, w.innerAt));
    });
    for (const f of [tires, rims, inners]) { const g = f.mesh.geometry; g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true; g.computeBoundingSphere(); }
  };
  setWheels(0, 0);
  // (V113) the far version (main.js: past FAR_LOD m) is two draws instead of ~13: the body's merge below, its windows and
  // its wheels and wells as they stand included (those in groups of their own, which the near body does not draw) -
  // the paint's triangles first, drawn in the car's own paint, every other part in one shared material whose colour,
  // roughness and metal each vertex carries (farMaterial)
  rigid.unshift([new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3)), paint]);
  for (const [o, mt] of [[tires.mesh, S.tire], [rims.mesh, rimMat], [inners.mesh, S.under], [wellMesh, arch]]) rigid.push([o.geometry, { far: mt }]);
  const merged = mergeByMaterial(rigid);
  const farGeo = new THREE.BufferGeometry(), nv = merged.geo.attributes.position.count, FC = new Uint8Array(nv * 4);
  for (const k of ['position', 'normal', 'uv']) farGeo.setAttribute(k, merged.geo.attributes[k]);
  for (const r of merged.geo.groups) {
    const [c, metal, rough] = farLook(merged.mats[r.materialIndex].far ?? merged.mats[r.materialIndex]);
    const a = Math.round((metal ? 0.5 + rough * 0.49 : rough * 0.49) * 255), rgb = [c.r, c.g, c.b].map(v => Math.round(Math.min(1, v) * 255));
    for (let i = r.start; i < r.start + r.count; i++) FC.set([rgb[0], rgb[1], rgb[2], a], i * 4);
  }
  farGeo.setAttribute('color', new THREE.BufferAttribute(FC, 4, true));
  const nPaint = merged.geo.groups[0].count;
  farGeo.addGroup(0, nPaint, 0); farGeo.addGroup(nPaint, nv - nPaint, 1);
  farGeo.boundingSphere = merged.geo.boundingSphere;
  merged.geo.groups = merged.geo.groups.filter(r => !merged.mats[r.materialIndex].far);
  const capGeo = carCap(m, merged.geo.attributes.position.array, merged.geo.groups);   // (V114: before the windows leave)
  merged.mats = merged.mats.map(mt => mt.far ? S.under : mt);      // (no group of the near body draws these)
  // the windows: a mesh of their own, which casts no shadow - the sun shines in through them onto the cabin (whose
  // inside skin, interior.js, shades it under the roof and the doors); inner faces first, then the outer ones
  const gIn = merged.geo.groups.find(r => merged.mats[r.materialIndex] === glassIn);
  merged.geo.groups.splice(merged.geo.groups.indexOf(gIn), 1);
  const glassGeo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) { const a = merged.geo.attributes[k]; glassGeo.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gIn.start * a.itemSize, (gIn.start + gIn.count) * a.itemSize), a.itemSize)); }
  glassGeo.addGroup(0, gIn.count, 0); glassGeo.addGroup(0, gIn.count, 1);
  glassGeo.computeBoundingSphere();
  const glassMesh = new THREE.Mesh(glassGeo, [glassIn, glassOut]);
  glassMesh.receiveShadow = true;
  const bodyMesh = new THREE.Mesh(merged.geo, merged.mats);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  bodyPivot.add(bodyMesh, glassMesh);
  // (V114) the snow lying on it (main.js shows it while snow lies, if the car has not been driven since)
  const cap = new THREE.Mesh(capGeo, snowSlabMaterial());
  cap.visible = false; cap.receiveShadow = true; cap.castShadow = false;
  bodyPivot.add(cap);
  const far = new THREE.Mesh(farGeo, [paint, farMaterial()]);
  far.castShadow = true; far.receiveShadow = true; far.visible = false;
  bodyPivot.add(far);
  const nearParts = [bodyMesh, glassMesh, wellMesh, tires.mesh, rims.mesh, inners.mesh];
  const setFar = (on) => { if (on === far.visible) return; far.visible = on; for (const o of nearParts) o.visible = !on; };

  // soft contact shadow (grounds the car like ambient occlusion)
  if (!shared.blob) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(64, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
      const dx = Math.max(0, Math.abs(x - 31.5) / 32 - 0.55) / 0.45, dy = Math.max(0, Math.abs(y - 63.5) / 64 - 0.7) / 0.3;
      const d = Math.min(1, Math.hypot(dx, dy));
      img.data[(y * 64 + x) * 4 + 3] = Math.pow(1 - d, 1.6) * 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    shared.blob = new THREE.MeshBasicMaterial({ color: 0x000000, map: t, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  }
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(m.W + 0.35, m.L + 0.5), shared.blob);
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1;
  group.add(blob);

  // (a car's materials are its own: rain.js leaves its lenses and badges alone inside the car you are in)
  group.traverse(o => { if (o.material) for (const mt of [].concat(o.material)) mt.userData.car = true; });
  return {
    group, bodyPivot, wheels, setWheels, steer, cabin, model: m, mirrors, wipers, blob, far, setFar, cap,
    lights: { head: headL, tail: tailL, tailMat, headMat }, glass,
    half: { w: m.W / 2 + 0.05, l: m.L / 2 },
  };
}
