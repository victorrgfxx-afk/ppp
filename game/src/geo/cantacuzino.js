import * as THREE from 'three';
import { GEO, heightAt, gridHeight, addHolePoly, addFineZone } from './data.js';
import { Acc } from './bridge.js';
import { M } from '../materials.js';
import { normalFromCanvas } from '../textures.js';
import { rng } from '../util.js';
import { canvas, tex, grain, blobs, boxAt, merged, frame, pairs, road, clamp01 } from './pitigaia.js';

// Strada Toma Cantacuzino coming down past the cemetery towards the village, from the user's photo 55
// (45.13278 N 25.70670 E, from a car heading north-east, down the slope): steel W-beam guardrails on both sides
// (weathered, yellowish), a continuous centre line, dense trees and bushes right behind the rails, the road bending
// left at the bottom among the houses.
// s runs along OSM way 271472034 from its north-east end. The photo's coordinate (s ~364) is by the houses next to the
// cemetery (on the Bing aerial, measurements only, they stand right at the road); the frame, with woods on both sides
// and no houses, fits the stretch just below them, where the road enters the wood (s ~313, heading down).
const ROAD = '271472034';
const RAIL = { s0: 244, s1: 316 };             // guardrail stretch (both sides)
const SOLID = [236, 330];                       // continuous centre line
const NO_EDGE = [236, 330];                     // no edge lines there (photo 55)
const UP = [0, 1, 0];

export function prepareCantacuzino() {
  const r = road(ROAD);
  if (!r) return false;
  r.solidAt = SOLID;                            // roads.js: continuous centre line on this stretch
  r.noEdgeAt = NO_EDGE;
  const F = frame(pairs(r.p)), hw = r.w / 2;
  const W = (s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
  // the slope falls across the road here: the terrain level with the asphalt out to the rails, back to the DEM by 4 m
  // past the edge (otherwise the uphill verge pokes through the gravel shoulder)
  {
    const S0 = RAIL.s0 - 12, S1 = RAIL.s1 + 12, OX = hw + 4;
    const bx = []; for (let t = S0; t <= S1; t += 4) for (const o of [-OX - 1, OX + 1]) bx.push(W(t, o));
    const x0 = Math.min(...bx.map(p => p[0])), x1 = Math.max(...bx.map(p => p[0])), z0 = Math.min(...bx.map(p => p[1])), z1 = Math.max(...bx.map(p => p[1]));
    addFineZone({ x0, x1, z0, z1,
      test: (x, z) => { const l = F.local(x, z); return !!l && l.s > S0 && l.s < S1 && Math.abs(l.o) < OX; },
      h: (x, z) => {
        const l = F.local(x, z), g0 = gridHeight(GEO, x, z);
        if (!l) return g0;
        const c = gridHeight(GEO, ...W(l.s, 0));
        const k = clamp01((OX - Math.abs(l.o)) / (OX - hw - 1.2)) * clamp01(Math.min(l.s - S0, S1 - l.s) / 6);
        return g0 + (c - g0) * k;
      } });
  }
  // no generated lot fences along the rebuilt stretch: rails and trees there (photo 55)
  const band = []; for (let s = RAIL.s0 - 10; s <= RAIL.s1 + 10; s += 5) band.push(W(s, 16)); for (let s = RAIL.s1 + 10; s >= RAIL.s0 - 10; s -= 5) band.push(W(s, -16));
  addHolePoly(band, { noFences: true, scatter: false });
  const near = (x, z) => { const l = F.local(x, z); return l && l.s > RAIL.s0 - 10 && l.s < RAIL.s1 + 10 && Math.abs(l.o) < 16; };
  GEO.fences = (GEO.fences || []).filter(f => { for (let i = 1; i < f.length; i += 2) if (near(f[i], f[i + 1])) return false; return true; });
  return true;
}

// a W-beam guardrail along a road frame from s0 to s1 at offset o, facing the road: beam 0.45-0.76 m on posts every
// 2 m, the ends bent down to the ground over 4 m, 'rail' colliders
// opt.h(x, z, s): the ground under it (else the terrain); opt.open1: no terminal at s1 (it runs into a railing there)
export function guardrail(acc, posts, world, F, W, s0, s1, o, grow = () => {}, opt = {}) {
  const side = Math.sign(o), step = 2, hy = opt.h || ((x, z) => heightAt(x, z));
  const hAt = (s) => { const d = Math.min(s - s0, opt.open1 ? Infinity : s1 - s); return d >= 4 ? 1 : Math.max(0, d / 4); };   // terminals
  for (let s = s0; s < s1 - 1e-6; s += step) {
    const t = Math.min(s1, s + step), a = W(s, o), b = W(t, o), ya = hy(a[0], a[1], s), yb = hy(b[0], b[1], t), ka = hAt(s), kb = hAt(t);
    const a0 = ya + 0.45 * ka, a1 = ya + 0.45 * ka + 0.31, b0 = yb + 0.45 * kb, b1 = yb + 0.45 * kb + 0.31;
    const [ux, uz] = F.dir(s + 1), nx = -uz * -side, nz = ux * -side;                         // faces the road
    acc.quad([a[0], a0, a[1]], [b[0], b0, b[1]], [b[0], b1, b[1]], [a[0], a1, a[1]], [nx, 0, nz], [s / 4, 0, t / 4, 0, t / 4, 1, s / 4, 1]);
    acc.quad([a[0] - nx * 0.08, a1, a[1] - nz * 0.08], [b[0] - nx * 0.08, b1, b[1] - nz * 0.08], [b[0], b1, b[1]], [a[0], a1, a[1]], UP, [s / 4, 0.95, t / 4, 0.95, t / 4, 1, s / 4, 1]);
    if (ka > 0.99) { const p = W(s, o + side * 0.18); boxAt(posts, p[0], ya + 0.3, p[1], 0.1, 1.0, 0.15, -Math.atan2(uz, ux)); }
    world.addStatic(new world.Box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, step / 2, 0.12, Math.atan2(-uz, ux), Math.min(ya, yb) - 1, Math.max(a1, b1), 'rail'));
    grow(a[0], a[1], 2);
  }
}

let MT = null;
export function guardrailMaterials() { return mats(); }
function mats() {
  if (MT) return MT;
  const R = rng(9521);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // W-beam: two ridges and a valley across 0.31 m, streaks of dirt and rust along it
  const beam = canvas(256, 64), bg = beam.getContext('2d');
  const g = bg.createLinearGradient(0, 0, 0, 64);
  for (const [t, c] of [[0, '#8f8a74'], [0.12, '#d8d2b4'], [0.3, '#b3ad92'], [0.5, '#6f6b5b'], [0.7, '#b3ad92'], [0.88, '#d8d2b4'], [1, '#8f8a74']]) g.addColorStop(t, c);
  bg.fillStyle = g; bg.fillRect(0, 0, 256, 64);
  blobs(bg, 0, 0, 256, 64, 40, 3, 18, ['rgba(120,85,40,0.22)', 'rgba(70,60,40,0.18)', 'rgba(230,220,180,0.12)'], R);
  for (let x = 0; x < 256; x += 64) { bg.fillStyle = 'rgba(40,38,32,0.6)'; bg.fillRect(x, 0, 2, 64); for (const y of [16, 48]) { bg.beginPath(); bg.arc(x + 8, y, 2.5, 0, 7); bg.fill(); } }
  grain(bg, 256, 64, 12, R);
  MT = {
    beam: std({ map: tex(beam, { repeat: true }), normalMap: tex(normalFromCanvas(beam, 3, 256), { repeat: true, srgb: false }), roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide }),
    post: std({ color: 0x8c8672, roughness: 0.6, metalness: 0.4 }),
    // weeds and leaf litter under the trees, over the terrain's coarse grass/gravel edge
    verge: Object.assign(std({ map: M.grassGround ? M.grassGround.map : null, normalMap: M.grassGround ? M.grassGround.normalMap : null, color: 0xa9b486, roughness: 1 }), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
  };
  return MT;
}

export function buildCantacuzino(B, world) {
  const r = road(ROAD);
  if (!r) return null;
  const Mt = mats();
  const F = frame(pairs(r.p)), hw = r.w / 2;
  const W = (s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
  const Y = (x, z) => heightAt(x, z);
  const A = { beam: new Acc(), verge: new Acc() }, posts = [];
  const R = rng(2208);
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  const grow = (x, z, rr = 0) => { bb.x0 = Math.min(bb.x0, x - rr); bb.x1 = Math.max(bb.x1, x + rr); bb.z0 = Math.min(bb.z0, z - rr); bb.z1 = Math.max(bb.z1, z + rr); };

  // ---- guardrails on both sides, 0.6 m off the asphalt
  for (const side of [-1, 1]) guardrail(A.beam, posts, world, F, W, RAIL.s0, RAIL.s1, side * (hw + 0.6), grow);

  // ---- the verge behind the rails, from the gravel shoulder (0.9 m, roads.js) into the wood
  for (const side of [-1, 1]) {
    const O = [0.9, 2.4, 4, 5.5, 7].map(d => side * (hw + d)), step = 2;
    for (let s = RAIL.s0 - 6; s < RAIL.s1 + 6 - 1e-6; s += step) {
      const t = s + step;
      for (let j = 0; j < O.length - 1; j++) {
        const p = [[s, O[j]], [t, O[j]], [t, O[j + 1]], [s, O[j + 1]]].map(([ss, oo]) => { const [x, z] = W(ss, oo); return [x, Y(x, z) + 0.05, z]; });
        A.verge.quad(p[0], p[1], p[2], p[3], UP, [s / 3, O[j] / 3, t / 3, O[j] / 3, t / 3, O[j + 1] / 3, s / 3, O[j + 1] / 3]);
      }
    }
  }

  // ---- trees and bushes crowding the rails on both sides (photo 55); the map's trees there make way
  const add = [];
  const TYPES = [0, 1, 1, 4, 12, 12];                                                           // oak, hornbeam, walnut, edge broadleaf
  for (const side of [-1, 1]) {
    for (let s = RAIL.s0 - 8; s < RAIL.s1 + 8; s += 4.5 + R() * 3) {
      const o = side * (hw + 2.4 + R() * 6), [x, z] = W(s, o);
      add.push([x, z, TYPES[Math.floor(R() * TYPES.length)], 0.8 + R() * 0.45]);
      if (R() < 0.6) { const [bx, bz] = W(s + 2, side * (hw + 1.6 + R() * 0.8)); add.push([bx, bz, 12, 0.22 + R() * 0.12]); }   // bushes against the rail
    }
  }
  const T = GEO.trees;
  if (T) {
    const del = (x, z) => { if (x < bb.x0 - 12 || x > bb.x1 + 12 || z < bb.z0 - 12 || z > bb.z1 + 12) return false; const l = F.local(x, z); return l && l.s > RAIL.s0 - 10 && l.s < RAIL.s1 + 10 && Math.abs(l.o) < hw + 9; };
    const keep = []; for (let i = 0; i < T.n; i++) if (!del(T.x[i], T.z[i])) keep.push(i);
    const n = keep.length + add.length, x = new Float32Array(n), z = new Float32Array(n), t = new Uint8Array(n), s = new Float32Array(n);
    keep.forEach((i, k) => { x[k] = T.x[i]; z[k] = T.z[i]; t[k] = T.t[i]; s[k] = T.s[i]; });
    add.forEach(([ax, az, at, as], k) => { const j = keep.length + k; x[j] = ax; z[j] = az; t[j] = at; s[j] = as; });
    GEO.trees = { n, x, z, t, s };
  }

  A.beam.flush(B, Mt.beam, null, {});
  A.verge.flush(B, Mt.verge, null, { noCast: true });
  if (posts.length) B.geo(Mt.post, merged(posts));
  return {
    type: 'cantacuzino', name: 'Strada Toma Cantacuzino — coborârea cu parapete', bbox: bb,
    // photo 55: where the road enters the wood below the cemetery (s ~313, right lane), looking down the slope
    view: { from: W(313, -1.6), to: W(255, -1.2) },
  };
}
