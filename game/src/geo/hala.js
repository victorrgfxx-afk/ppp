import * as THREE from 'three';
import { GEO, heightAt, gridHeight, addHolePoly, addFineZone } from './data.js';
import { Acc } from './bridge.js';
import { M } from '../materials.js';
import { normalFromCanvas } from '../textures.js';
import { rng } from '../util.js';
import { canvas, tex, grain, blobs, boxAt, merged, frame, pairs, road, drape, tuft, clamp01 } from './pitigaia.js';
import { guardrail, guardrailMaterials } from './cantacuzino.js';

// Strada Toma Cantacuzino at the old industrial yard below the cemetery, from the user's photos 56-57
// (45.13451 N 25.70569 E, from a car heading north-west, down towards the village):
//  * 56: the yard on the left: the concrete apron up to the gate in the chain-link fence (concrete posts with cranked
//    tops and barbed wire), the steel lattice portal behind the fence, and behind them the stripped hall: white
//    silicate-brick walls and the steel columns and lattice trusses left without a roof
//  * 57: ahead, the fork with the lane on the left (OSM 16947046) past the round concrete tank, the gravel heap in front
//    of it, the short guardrail on the left with the fenced shed behind it, the pole with the warning sign on the right
// None of it is in OSM; the hall (two bays, 51 x 31.5 m), the tank (~10.6 m across) and the apron are measured on the
// Bing aerial (z19, measurements only). Both photos are from the main lens (1x): the views have fov 32. The DEM rises
// ~7 m under the hall, while the photo shows its walls level: its footprint is levelled into the slope.
// s runs along OSM way 271472034 from its north-east end, o > 0 on the yard's side.
const ROAD = '271472034', BRANCH = '16947046';
const HALL = { x: 428.7, z: -323.8, a: [-0.275, 0.961], b: [-0.961, -0.275], len: 51, wid: 31.5, mid: 17.5 };   // corner, long axis (to the road), width
const TANK = { x: 433.0, z: -237.7, r: 5.3, h: 7.5 };   // aerial: outer edge against its shadow; height from photo 57
const GATE = { s0: 164, s1: 168 };                      // the gate in the yard's fence, at the head of the apron (photo 56's centre)
const FENCE = { s0: 103, s1: 184 };
const fenceO = (s) => 7 + 6 * clamp01((s - 125) / 17);  // close to the road at the fork (photo 57), 13 m along the yard
const RAIL57 = { s0: 104, s1: 117 };                     // the guardrail before the fork (photo 57)
const PILE = { x: 424.5, z: -239.8, ax: [-0.17, 0.985] };  // the gravel heap in front of the tank, across the view (photo 57)
const CAM57 = 118;                                      // photo 57: ~50 m from the tank (its apparent size), past the rail's end
const UP = [0, 1, 0];

const hallP = (u, v) => [HALL.x + HALL.a[0] * u + HALL.b[0] * v, HALL.z + HALL.a[1] * u + HALL.b[1] * v];
const hallUV = (x, z) => { const dx = x - HALL.x, dz = z - HALL.z; return [dx * HALL.a[0] + dz * HALL.a[1], dx * HALL.b[0] + dz * HALL.b[1]]; };
let FLOOR = null;                                       // the hall's platform height (set in prepare)

// the yard and the verge in front of its fence, from the road's edge (no generated lot walls, poles or clutter there)
function yardPoly(W, hw) {
  const P = []; for (let s = FENCE.s0 - 6; s <= FENCE.s1 + 12; s += 6) P.push(W(s, hw + 0.8));
  return P.concat([W(FENCE.s1 + 12, 16), [336, -297], [372, -342], [403, -347], [438, -334], [431, -262], [415, -251]]);
}
const PORTAL = [[179.0, 15.3], [167.2, 16.0]];          // (s, o) of its legs, from photo 56's perspective (their heights)
const POLE56 = [157.2, 9.4];                            // the pole right of the gate in photo 56
const CAM56 = 188;                                      // photo 56: the hall, block to far corner, spans ~33 deg from here

export function prepareHala() {
  const r = road(ROAD);
  if (!r) return false;
  const F = frame(pairs(r.p));
  const W = (s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
  r.noMarkAt = [0, 205];                                // worn asphalt without lines from here down to the station (photos 56-59)
  // the hall's platform: level with the DEM at its road end, cut into the slope towards the far end, back to the DEM
  // within 9 m of the footprint
  const [nx, nz] = hallP(HALL.len, HALL.wid / 2);
  FLOOR = gridHeight(GEO, nx, nz) + 0.2;
  const U0 = -2, U1 = HALL.len + 6, V0 = -2, V1 = HALL.wid + 2, E = 9;
  const cs = [hallP(U0 - E, V0 - E), hallP(U1 + E, V0 - E), hallP(U1 + E, V1 + E), hallP(U0 - E, V1 + E)];
  addFineZone({ x0: Math.min(...cs.map(p => p[0])), x1: Math.max(...cs.map(p => p[0])), z0: Math.min(...cs.map(p => p[1])), z1: Math.max(...cs.map(p => p[1])),
    test: (x, z) => { const [u, v] = hallUV(x, z); return u > U0 - E && u < U1 + E && v > V0 - E && v < V1 + E; },
    h: (x, z) => {
      const [u, v] = hallUV(x, z), g0 = gridHeight(GEO, x, z);
      const d = Math.max(U0 - u, u - U1, V0 - v, v - V1, 0);
      return FLOOR + (g0 - FLOOR) * clamp01(d / E);
    } });
  // no generated lot fences, street poles or scattered clutter along the yard (the white wall and the pole in front of
  // the apron were generated, photo 56 has neither)
  addHolePoly(yardPoly(W, r.w / 2), { noFences: true, scatter: false });
  for (const run of GEO.poles || []) run.p = run.p.filter(p => Math.hypot(p[0] - 407.0, p[1] + 240.4) > 6);   // and the one in the fork (photo 57: the heap's side is clear)
  return true;
}

let MT = null;
function mats() {
  if (MT) return MT;
  const R = rng(5623);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // white silicate bricks, 25 x 6.5 cm, weathered, dirtier at the bottom (1 m x 1 m)
  const brick = canvas(256, 256), bg = brick.getContext('2d');
  bg.fillStyle = '#b9b5ac'; bg.fillRect(0, 0, 256, 256);
  for (let row = 0, y = 0; y < 256; row++, y += 256 / 13) {
    for (let x = (row % 2) * -32; x < 256; x += 64) {
      const v = 212 + Math.floor(R() * 22);
      bg.fillStyle = `rgb(${v},${v - 2},${v - 8})`; bg.fillRect(x + 2, Math.round(y) + 2, 60, Math.round(256 / 13) - 3);
    }
  }
  blobs(bg, 0, 0, 256, 256, 30, 6, 40, ['rgba(90,85,70,0.14)', 'rgba(150,140,110,0.12)', 'rgba(60,60,55,0.1)'], R);
  grain(bg, 256, 256, 14, R);
  // rusty grey steel
  const rust = canvas(64, 64), rg = rust.getContext('2d');
  rg.fillStyle = '#6a6259'; rg.fillRect(0, 0, 64, 64);
  blobs(rg, 0, 0, 64, 64, 30, 2, 10, ['rgba(120,70,35,0.45)', 'rgba(60,55,50,0.4)', 'rgba(150,140,125,0.25)'], R);
  grain(rg, 64, 64, 18, R);
  // chain link, 6 cm mesh (tile = 0.12 m)
  const chain = canvas(64, 64), cg = chain.getContext('2d');
  cg.clearRect(0, 0, 64, 64); cg.strokeStyle = 'rgba(96,98,94,1)'; cg.lineWidth = 5;              // thick enough to survive the mipmaps at 20 m
  cg.beginPath(); cg.moveTo(0, 0); cg.lineTo(64, 64); cg.moveTo(64, 0); cg.lineTo(0, 64); cg.stroke();
  // board-formed concrete of the tank: pour lines every ~0.3 m, rust and damp streaks, darker foot (6.7 m x 6.5 m)
  const tank = canvas(512, 256), tg = tank.getContext('2d');
  tg.fillStyle = '#a49c8e'; tg.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 12) { tg.fillStyle = `rgba(70,64,55,${0.12 + R() * 0.12})`; tg.fillRect(0, y + R() * 2, 512, 2); }
  for (let i = 0; i < 40; i++) { const x = R() * 512, w = 2 + R() * 14, l = 40 + R() * 200, g = tg.createLinearGradient(0, 0, 0, l); g.addColorStop(0, 'rgba(60,55,45,0.35)'); g.addColorStop(1, 'rgba(60,55,45,0)'); tg.fillStyle = g; tg.fillRect(x, 0, w, l); }
  { const g = tg.createLinearGradient(0, 180, 0, 256); g.addColorStop(0, 'rgba(60,70,45,0)'); g.addColorStop(1, 'rgba(60,70,45,0.5)'); tg.fillStyle = g; tg.fillRect(0, 180, 512, 76); }
  blobs(tg, 0, 0, 512, 256, 60, 6, 40, ['rgba(80,75,65,0.15)', 'rgba(190,185,170,0.14)'], R);
  grain(tg, 512, 256, 16, R);
  // reeds and tall weeds (crossed quads)
  const reed = canvas(128, 128), wg = reed.getContext('2d');
  wg.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) { const x = R() * 128, h = 60 + R() * 68, lean = (R() - 0.5) * 30; wg.strokeStyle = `rgba(${70 + R() * 50 | 0},${85 + R() * 40 | 0},${40 + R() * 25 | 0},1)`; wg.lineWidth = 1.5 + R() * 2; wg.beginPath(); wg.moveTo(x, 128); wg.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h); wg.stroke(); }
  // warning triangle
  const warn = canvas(64, 64), ng = warn.getContext('2d');
  ng.clearRect(0, 0, 64, 64); ng.fillStyle = '#d8d4c4'; ng.beginPath(); ng.moveTo(32, 4); ng.lineTo(62, 58); ng.lineTo(2, 58); ng.closePath(); ng.fill();
  ng.strokeStyle = '#b8261c'; ng.lineWidth = 6; ng.stroke();
  ng.fillStyle = '#1a1a1a'; ng.beginPath(); ng.moveTo(34, 20); ng.lineTo(26, 38); ng.lineTo(32, 38); ng.lineTo(28, 52); ng.lineTo(39, 32); ng.lineTo(33, 32); ng.lineTo(37, 20); ng.closePath(); ng.fill();
  MT = {
    brick: std({ map: tex(brick, { repeat: true }), normalMap: tex(normalFromCanvas(brick, 2, 256), { repeat: true, srgb: false }), roughness: 0.95 }),
    steel: std({ map: tex(rust, { repeat: true }), roughness: 0.75, metalness: 0.4, side: THREE.DoubleSide }),
    chain: std({ map: tex(chain, { repeat: true }), transparent: true, alphaTest: 0.22, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }),
    post: std({ map: M.concrete.map, color: 0xaaa69d, roughness: 0.9 }),
    tank: std({ map: tex(tank, { repeat: true }), normalMap: tex(normalFromCanvas(tank, 2, 256), { repeat: true, srgb: false }), roughness: 0.95, side: THREE.DoubleSide }),
    apron: Object.assign(std({ map: M.concrete.map, normalMap: M.concrete.normalMap, color: 0xc9c5bb, roughness: 0.95 }), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -5 }),
    soil: Object.assign(std({ map: M.soil ? M.soil.map : null, color: 0x8a8070, roughness: 1 }), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 }),
    gravel: std({ map: M.gravel.map, normalMap: M.gravel.normalMap, color: 0xb6b0a4, roughness: 1 }),
    block: std({ map: M.concrete.map, color: 0x9a978f, roughness: 0.95 }),
    roofLight: std({ color: 0xc4c7c6, roughness: 0.6, metalness: 0.3 }),
    reed: std({ map: tex(reed), transparent: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 }),
    warn: std({ map: tex(warn), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 }),
  };
  return MT;
}

// a square-section steel member from p to q (3D), half-width r
function member(acc, p, q, r) {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(d[0], d[1], d[2]);
  if (L < 1e-4) return;
  const t = d.map(v => v / L), ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let e1 = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]];
  const l1 = Math.hypot(...e1); e1 = e1.map(v => v / l1);
  const e2 = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]];
  const c = (P, a, b) => [P[0] + (e1[0] * a + e2[0] * b) * r, P[1] + (e1[1] * a + e2[1] * b) * r, P[2] + (e1[2] * a + e2[2] * b) * r];
  const K = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const [a1, b1] = K[k], [a2, b2] = K[(k + 1) % 4], n = [0, 1, 2].map(i => e1[i] * (a1 + a2) + e2[i] * (b1 + b2));
    acc.quad(c(p, a1, b1), c(p, a2, b2), c(q, a2, b2), c(q, a1, b1), n, [0, 0, 1, 0, 1, L, 0, L]);
  }
}
// a flat Warren truss in the vertical plane through the bottom chord p0-p1 (3D), depth dh, ~panel-long bays
function truss(acc, p0, p1, dh, panel, rc = 0.06, rd = 0.035) {
  const L = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), n = Math.max(1, Math.round(L / panel));
  const at = (t, y) => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t + y, p0[2] + (p1[2] - p0[2]) * t];
  member(acc, at(0, 0), at(1, 0), rc); member(acc, at(0, dh), at(1, dh), rc);
  member(acc, at(0, 0), at(0, dh), rd); member(acc, at(1, 0), at(1, dh), rd);
  for (let k = 0; k < n; k++) member(acc, at(k / n, k % 2 ? dh : 0), at((k + 1) / n, k % 2 ? 0 : dh), rd);
}
// a vertical quad strip p-q (2D) from y0 to y1 at each end, facing n
function wallQuad(acc, p, q, ya0, ya1, yb0, yb1, n, u0, u1) {
  acc.quad([p[0], ya0, p[1]], [q[0], yb0, q[1]], [q[0], yb1, q[1]], [p[0], ya1, p[1]], [n[0], 0, n[1]], [u0, ya0, u1, yb0, u1, yb1, u0, ya1]);
}

export function buildHala(B, world) {
  const r = road(ROAD);
  if (!r || FLOOR === null) return null;
  const Mt = mats(), G = guardrailMaterials();
  const F = frame(pairs(r.p)), hw = r.w / 2;
  const W = (s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
  const Y = (x, z) => heightAt(x, z);
  const box = (x, z, hwb, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hwb, hd, rot, y0, y1, tag));
  const seg = (p, q, t, y0, y1, tag) => { const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz); box((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, L / 2, t, Math.atan2(-dz, dx), y0, y1, tag); };
  const R = rng(4417);
  const A = { steel: new Acc(), brick: new Acc(), chain: new Acc(), tank: new Acc(), apron: new Acc(), soil: new Acc(), block: new Acc(), roof: new Acc(), reed: new Acc(), warn: new Acc(), beam: new Acc() };
  const posts = [], blocks = [], rails = [], roofs = [], wires = [];
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  const grow = (x, z, rr = 0) => { bb.x0 = Math.min(bb.x0, x - rr); bb.x1 = Math.max(bb.x1, x + rr); bb.z0 = Math.min(bb.z0, z - rr); bb.z1 = Math.max(bb.z1, z + rr); };

  // ---- the hall: brick walls 2.4 m, lattice columns every 6.4 m on three lines, trusses 6.0-7.2 m, purlins, no roof
  {
    const y0 = FLOOR, EAVE = 6.0, DEPTH = 1.2, NU = 8, du = HALL.len / NU, LINES = [0, HALL.mid, HALL.wid];
    const P3 = (u, v, y) => { const [x, z] = hallP(u, v); return [x, y, z]; };
    for (let k = 0; k <= NU; k++) {
      const u = k * du;
      for (const v of LINES) {
        // column: two channels 0.36 m apart across the frame, laced on both faces
        const c0 = P3(u, v - 0.18, y0), c1 = P3(u, v + 0.18, y0);
        member(A.steel, c0, [c0[0], y0 + EAVE + DEPTH, c0[2]], 0.06); member(A.steel, c1, [c1[0], y0 + EAVE + DEPTH, c1[2]], 0.06);
        for (let y = 0.3, j = 0; y < EAVE; y += 0.7, j++) { const a = j % 2 ? c0 : c1, b = j % 2 ? c1 : c0; member(A.steel, [a[0], y0 + y, a[2]], [b[0], y0 + y + 0.7, b[2]], 0.025); }
        const [x, z] = hallP(u, v); box(x, z, 0.25, 0.25, 0, y0 - 1, y0 + EAVE, 'column');
      }
      // roof trusses across both bays
      truss(A.steel, P3(u, 0, y0 + EAVE), P3(u, HALL.mid, y0 + EAVE), DEPTH, 1.45);
      truss(A.steel, P3(u, HALL.mid, y0 + EAVE), P3(u, HALL.wid, y0 + EAVE), DEPTH, 1.4);
    }
    // eave and valley girders along the column lines, purlins on the top chords every ~2.2 m
    for (const v of LINES) for (let k = 0; k < NU; k++) truss(A.steel, P3(k * du, v, y0 + EAVE + 0.5), P3((k + 1) * du, v, y0 + EAVE + 0.5), 0.7, 0.9, 0.05, 0.03);
    for (const [v0, v1] of [[0, HALL.mid], [HALL.mid, HALL.wid]]) {
      const n = Math.round((v1 - v0) / 2.2);
      for (let j = 1; j < n; j++) { const v = v0 + (v1 - v0) * j / n; member(A.steel, P3(0, v, y0 + EAVE + DEPTH + 0.06), P3(HALL.len, v, y0 + EAVE + DEPTH + 0.06), 0.045); }
    }
    // cross bracing in the two end bays of each long side
    for (const v of [0, HALL.wid]) for (const k of [0, NU - 1]) { const u0 = k * du, u1 = u0 + du; member(A.steel, P3(u0, v, y0 + 0.3), P3(u1, v, y0 + EAVE), 0.03); member(A.steel, P3(u1, v, y0 + 0.3), P3(u0, v, y0 + EAVE), 0.03); }
    // perimeter walls: 0.3 m white silicate brick, 2.4 m; the road end open in the middle of each bay, two breaches
    const WH = 2.4, T = 0.15;
    const wall = (u0, v0, u1, v1) => {
      const p = hallP(u0, v0), q = hallP(u1, v1), dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz), nx = -dz / L * T, nz = dx / L * T;
      const pa = [p[0] + nx, p[1] + nz], qa = [q[0] + nx, q[1] + nz], pb = [p[0] - nx, p[1] - nz], qb = [q[0] - nx, q[1] - nz];
      const top = WH - 0.15 * R(), ya = Y(...p), yb = Y(...q);
      wallQuad(A.brick, pa, qa, Math.min(ya, y0) - 0.2, y0 + top, Math.min(yb, y0) - 0.2, y0 + top, [nx, nz], 0, L);
      wallQuad(A.brick, pb, qb, Math.min(ya, y0) - 0.2, y0 + top, Math.min(yb, y0) - 0.2, y0 + top, [-nx, -nz], 0, L);
      A.brick.quad([pa[0], y0 + top, pa[1]], [qa[0], y0 + top, qa[1]], [qb[0], y0 + top, qb[1]], [pb[0], y0 + top, pb[1]], UP, [0, 0, L, 0, L, 0.3, 0, 0.3]);
      for (const [e, f] of [[pa, pb], [qa, qb]]) wallQuad(A.brick, e, f, y0 - 0.2, y0 + top, y0 - 0.2, y0 + top, e === pa ? [-dx, -dz] : [dx, dz], 0, 0.3);
      seg(p, q, T + 0.05, y0 - 1, y0 + top, 'wall');
    };
    const run = (u0, v0, u1, v1, gaps) => {                  // a wall line with gaps [t0, t1] (fractions)
      let t = 0; for (const [g0, g1] of [...gaps, [1, 1]]) { if (g0 > t) wall(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, u0 + (u1 - u0) * g0, v0 + (v1 - v0) * g0); t = g1; }
    };
    run(0, 0, HALL.len, 0, [[0.55, 0.62]]);
    run(0, HALL.wid, HALL.len, HALL.wid, [[0.3, 0.36], [0.8, 0.87]]);
    run(0, 0, 0, HALL.wid, []);
    run(HALL.len, 0, HALL.len, HALL.wid, [[0.17, 0.4], [0.62, 0.86]]);
    // the floor: bare concrete and soil
    const fl = [hallP(0, 0), hallP(HALL.len, 0), hallP(HALL.len, HALL.wid), hallP(0, HALL.wid)];
    drape(A.soil, fl, 0.03, 3, 4);
    for (const p of fl) grow(p[0], p[1], 3);
    // the white block by the road end (Bing aerial): 5.5 x 4.5 m, 3.2 m, flat roof
    const [bx, bz] = hallP(HALL.len + 3.8, HALL.wid - 3.1), by = Y(bx, bz), rot = Math.atan2(-HALL.a[1], HALL.a[0]);
    const bc = (du2, dv) => { const x = bx + HALL.a[0] * du2 + HALL.b[0] * dv, z = bz + HALL.a[1] * du2 + HALL.b[1] * dv; return [x, z]; };
    const K = [bc(-2.75, -2.25), bc(2.75, -2.25), bc(2.75, 2.25), bc(-2.75, 2.25)];
    for (let i = 0; i < 4; i++) { const p = K[i], q = K[(i + 1) % 4], dx = q[0] - p[0], dz = q[1] - p[1]; wallQuad(A.brick, p, q, by - 0.3, by + 3.2, by - 0.3, by + 3.2, [dz, -dx], 0, Math.hypot(dx, dz)); }
    boxAt(blocks, bx, by + 3.28, bz, 5.9, 0.16, 4.9, -rot + Math.PI / 2);
    box(bx, bz, 2.75, 2.25, rot, by - 1, by + 3.3, 'building');
  }

  // ---- the yard's fence along the road: chain link on concrete posts every 2.5 m with cranked tops and three strands
  //      of barbed wire; the gate at the head of the apron; a low block wall under it by the fork (photo 57)
  const tops = [];
  {
    const S = []; for (let s = FENCE.s0; s <= FENCE.s1 + 1e-6; s += 2.5) S.push(s);
    const pt = (s) => { const [x, z] = W(s, fenceO(s)); return { s, x, z, y: Y(x, z) }; };
    const list = S.filter(s => s < GATE.s0 - 0.3 || s > GATE.s1 + 0.3).concat([GATE.s0, GATE.s1]).sort((a, b) => a - b).map(pt);
    for (const p of list) {
      const [ux, uz] = F.dir(p.s), rx = uz, rz = -ux;                                  // towards the road (o decreasing)
      const H = 2.0, gp = p.s === GATE.s0 || p.s === GATE.s1;
      // concrete posts north-west of the gate, steel pipes south-east of it (photo 56)
      if (p.s > GATE.s1 + 0.1) member(A.steel, [p.x, p.y - 0.3, p.z], [p.x, p.y + H, p.z], 0.04);
      else boxAt(posts, p.x, p.y + H / 2 - 0.3, p.z, gp ? 0.14 : 0.12, H + 0.6, gp ? 0.14 : 0.12, -Math.atan2(uz, ux));
      const top = [p.x, p.y + H, p.z], end = [p.x + rx * 0.32, p.y + H + 0.32, p.z + rz * 0.32];
      member(A.steel, top, end, 0.025);
      tops.push({ p, top, end, gate: gp });
    }
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i], b = tops[i + 1];
      if (a.p.s === GATE.s0 && b.p.s === GATE.s1) continue;
      const L = Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z), [ux, uz] = F.dir(a.p.s);
      const base = a.p.s < 122 ? 0.6 : 0.05;
      wallQuad(A.chain, [a.p.x, a.p.z], [b.p.x, b.p.z], a.p.y + base, a.p.y + 1.95, b.p.y + base, b.p.y + 1.95, [uz, -ux], a.p.s / 0.12, (a.p.s + L) / 0.12);
      if (base > 0.1) {                                                              // block wall under the mesh
        boxAt(blocks, (a.p.x + b.p.x) / 2, (a.p.y + b.p.y) / 2 + 0.15, (a.p.z + b.p.z) / 2, L, 0.9, 0.2, -Math.atan2(b.p.z - a.p.z, b.p.x - a.p.x));
      }
      for (const f of [0.35, 0.7, 1]) wires.push(a.top[0] + (a.end[0] - a.top[0]) * f, a.top[1] + (a.end[1] - a.top[1]) * f, a.top[2] + (a.end[2] - a.top[2]) * f, b.top[0] + (b.end[0] - b.top[0]) * f, b.top[1] + (b.end[1] - b.top[1]) * f, b.top[2] + (b.end[2] - b.top[2]) * f);
      wires.push(a.top[0], a.top[1] - 0.05, a.top[2], b.top[0], b.top[1] - 0.05, b.top[2]);
      seg([a.p.x, a.p.z], [b.p.x, b.p.z], 0.08, Math.min(a.p.y, b.p.y) - 1, Math.max(a.p.y, b.p.y) + 2.3, 'fence');
      grow(a.p.x, a.p.z, 1);
    }
    // the gate: two leaves of tube frame and mesh, closed
    const g0 = pt(GATE.s0), g1 = pt(GATE.s1), gy = Math.max(g0.y, g1.y);
    const gm = [(g0.x + g1.x) / 2, (g0.z + g1.z) / 2];
    for (const [p, q] of [[g0, { x: gm[0], z: gm[1] }], [{ x: gm[0], z: gm[1] }, g1]]) {
      const a = [p.x, gy + 0.08, p.z], b = [q.x, gy + 0.08, q.z], c = [q.x, gy + 2.0, q.z], d = [p.x, gy + 2.0, p.z];
      member(A.steel, a, b, 0.025); member(A.steel, b, c, 0.025); member(A.steel, c, d, 0.025); member(A.steel, d, a, 0.025);
      member(A.steel, [a[0], gy + 1.05, a[2]], [b[0], gy + 1.05, b[2]], 0.02);
      const L = Math.hypot(q.x - p.x, q.z - p.z), [ux, uz] = F.dir(GATE.s0);
      wallQuad(A.chain, [p.x, p.z], [q.x, q.z], gy + 0.1, gy + 1.98, gy + 0.1, gy + 1.98, [uz, -ux], 0, L / 0.12);
    }
    seg([g0.x, g0.z], [g1.x, g1.z], 0.08, gy - 1, gy + 2.1, 'gate');
  }

  // ---- the concrete apron from the road up to the gate, a low kerb wall along its north-west side (photo 56)
  {
    const P = [W(156, hw + 0.1), W(171.5, hw + 0.1), W(GATE.s1 + 0.8, fenceO(GATE.s1) - 0.2), W(GATE.s0 - 0.4, fenceO(GATE.s0) - 0.2)];
    drape(A.apron, P, 0.05, 2, 3);
    const k0 = W(GATE.s0 - 0.6, fenceO(GATE.s0) - 0.3), k1 = W(155.6, hw + 0.3);
    const L = Math.hypot(k1[0] - k0[0], k1[1] - k0[1]), n = Math.ceil(L / 1.5);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, x0 = k0[0] + (k1[0] - k0[0]) * t0, z0 = k0[1] + (k1[1] - k0[1]) * t0, x1 = k0[0] + (k1[0] - k0[0]) * t1, z1 = k0[1] + (k1[1] - k0[1]) * t1;
      const y = Math.max(Y(x0, z0), Y(x1, z1));
      boxAt(blocks, (x0 + x1) / 2, y + 0.12, (z0 + z1) / 2, L / n + 0.02, 0.45, 0.25, -Math.atan2(z1 - z0, x1 - x0));
    }
    seg(k0, k1, 0.14, Y(...k1) - 1, Y(...k0) + 0.35, 'kerb');
  }

  // ---- the lattice portal inside the fence, left of the gate (photo 56): two posts, a box girder 0.7 m deep at ~9 m
  //      over the road's level, a stay wire; its span and height from the photo's perspective (from the gate's size)
  {
    const pa = W(...PORTAL[0]), pb = W(...PORTAL[1]), ya = Y(...pa), yb = Y(...pb), top = Y(...W(160, 0)) + 9.0;
    for (const [p, y] of [[pa, ya], [pb, yb]]) { boxAt(blocks, p[0], y + 0.1, p[1], 0.6, 0.4, 0.6); member(A.steel, [p[0], y, p[1]], [p[0], top + 0.1, p[1]], 0.11); box(p[0], p[1], 0.2, 0.2, 0, y - 1, top, 'post'); }
    const dx = pb[0] - pa[0], dz = pb[1] - pa[1], L = Math.hypot(dx, dz), nx = -dz / L * 0.2, nz = dx / L * 0.2;
    for (const s of [-1, 1]) truss(A.steel, [pa[0] + nx * s, top - 0.7, pa[1] + nz * s], [pb[0] + nx * s, top - 0.7, pb[1] + nz * s], 0.7, 0.7, 0.05, 0.03);
    for (let t = 0; t <= 1.001; t += 1 / Math.round(L / 1.4)) for (const y of [top - 0.7, top]) member(A.steel, [pa[0] + dx * t + nx, y, pa[1] + dz * t + nz], [pa[0] + dx * t - nx, y, pa[1] + dz * t - nz], 0.025);
    const g = W(174, 14.2);
    wires.push(pa[0], top - 2.2, pa[1], g[0], Y(...g) + 0.2, g[1]);
    grow(pa[0], pa[1], 2); grow(pb[0], pb[1], 2);
  }

  // ---- the concrete pole right of the gate (photo 56) and the next one along the yard's fence, the line between them
  {
    const pole = (s, o) => { const [px, pz] = W(s, o), py = Y(px, pz), [ux, uz] = F.dir(s), rot = -Math.atan2(uz, ux);
      boxAt(blocks, px, py + 4.2, pz, 0.24, 9.6, 0.24, rot); boxAt(blocks, px, py + 8.4, pz, 0.12, 0.1, 1.4, rot);
      box(px, pz, 0.15, 0.15, 0, py - 1, py + 9, 'pole'); return { px, py, pz, ux, uz }; };
    const a = pole(...POLE56), b = pole(126, 13.8);
    for (const e of [-0.6, 0.6]) wires.push(a.px - a.uz * e, a.py + 8.45, a.pz + a.ux * e, b.px - b.uz * e, b.py + 8.45, b.pz + b.ux * e);
  }

  // ---- the round concrete tank past the fork (photo 57): 10.6 m across, 7.5 m, open top with soil and weeds in it
  {
    const { x, z, r: rr, h } = TANK, N = 40, per = 2 * Math.PI * rr;
    let y = Infinity; for (let i = 0; i < 12; i++) y = Math.min(y, Y(x + Math.cos(i / 2) * rr, z + Math.sin(i / 2) * rr) - 0.2);
    for (let i = 0; i < N; i++) {
      const a0 = i / N * 2 * Math.PI, a1 = (i + 1) / N * 2 * Math.PI;
      const h0 = h + (Math.sin(a0 * 3) + Math.sin(a0 * 7 + 1)) * 0.08, h1 = h + (Math.sin(a1 * 3) + Math.sin(a1 * 7 + 1)) * 0.08;
      for (const [rad, sgn] of [[rr, 1], [rr - 0.25, -1]]) {
        const p = [x + Math.cos(a0) * rad, z + Math.sin(a0) * rad], q = [x + Math.cos(a1) * rad, z + Math.sin(a1) * rad];
        const n = [Math.cos((a0 + a1) / 2) * sgn, Math.sin((a0 + a1) / 2) * sgn];
        A.tank.quad([p[0], y, p[1]], [q[0], y, q[1]], [q[0], y + h1, q[1]], [p[0], y + h0, p[1]], [n[0], 0, n[1]], [a0 / (2 * Math.PI) * per / 6.7, 0, a1 / (2 * Math.PI) * per / 6.7, 0, a1 / (2 * Math.PI) * per / 6.7, 1, a0 / (2 * Math.PI) * per / 6.7, 1]);
      }
      A.tank.quad([x + Math.cos(a0) * rr, y + h0, z + Math.sin(a0) * rr], [x + Math.cos(a1) * rr, y + h1, z + Math.sin(a1) * rr], [x + Math.cos(a1) * (rr - 0.25), y + h1, z + Math.sin(a1) * (rr - 0.25)], [x + Math.cos(a0) * (rr - 0.25), y + h0, z + Math.sin(a0) * (rr - 0.25)], UP, [0, 0.97, 0.1, 0.97, 0.1, 1, 0, 1]);
      // the fill inside, ~1.2 m under the rim
      A.soil.quad([x, y + h - 1.2, z], [x + Math.cos(a0) * (rr - 0.25), y + h - 1.2, z + Math.sin(a0) * (rr - 0.25)], [x + Math.cos(a1) * (rr - 0.25), y + h - 1.2, z + Math.sin(a1) * (rr - 0.25)], [x, y + h - 1.2, z], UP, [x / 3, z / 3, x / 3, z / 3, x / 3, z / 3, x / 3, z / 3]);
    }
    for (let k = 0; k < 8; k++) {                                                      // an octagonal ring of wall segments
      const a0 = (k + 0.5) / 8 * 2 * Math.PI, cx = x + Math.cos(a0) * (rr - 0.15), cz = z + Math.sin(a0) * (rr - 0.15);
      box(cx, cz, rr * Math.sin(Math.PI / 8) + 0.1, 0.2, Math.atan2(-Math.cos(a0), -Math.sin(a0)), y - 1, y + h, 'tank');
    }
    for (let i = 0; i < 26; i++) { const a = R() * 2 * Math.PI, d = R() * (rr - 1); tuft(A.reed, x + Math.cos(a) * d, y + h - 1.2, z + Math.sin(a) * d, 1.2, 0.8 + R() * 0.8, R() * 3); }
    // reeds and tall weeds round its foot, thickest towards the road (photo 57)
    for (let i = 0; i < 70; i++) {
      const a = R() * 2 * Math.PI, d = rr + 0.6 + R() * 5, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const l = F.local(px, pz); if ((l && Math.abs(l.o) < hw + 1.5) || Math.hypot(px - PILE.x, pz - PILE.z) < 4.2) continue;
      tuft(A.reed, px, Y(px, pz), pz, 1.4, 1.4 + R() * 1.6, R() * 3);
    }
    grow(x, z, rr + 6);
  }

  // ---- the gravel heap in front of the tank: an elongated mound ~7.6 x 4 m, 1.1 m high
  {
    const { x, z } = PILE, [ux, uz] = PILE.ax, vx = -uz, vz = ux, NA = 20, NR = 5;
    const ring = (k, a) => { const t = k / NR, c = Math.cos(a), s = Math.sin(a), w = (1 - t) + 0.08 * Math.sin(a * 5 + k); const px = x + (ux * c * 3.8 + vx * s * 2.0) * w, pz = z + (uz * c * 3.8 + vz * s * 2.0) * w; return [px, Y(px, pz) - 0.05 + 1.1 * Math.sin(t * Math.PI / 2) * (1 - 0.3 * t * t), pz]; };
    const gv = new Acc();
    for (let k = 0; k < NR; k++) for (let i = 0; i < NA; i++) {
      const a0 = i / NA * 2 * Math.PI, a1 = (i + 1) / NA * 2 * Math.PI;
      gv.quad(ring(k, a0), ring(k, a1), ring(k + 1, a1), ring(k + 1, a0), UP, [a0, k, a1, k, a1, k + 1, a0, k + 1]);
    }
    gv.flush(B, Mt.gravel, null, {});
    box(x, z, 3.5, 1.8, Math.atan2(-uz, ux), Y(x, z) - 1, Y(x, z) + 1.0, 'gravel');
  }

  // ---- the lane's low concrete parapet on its outer side, past the heap (photo 57)
  {
    const br = road(BRANCH);
    if (br) {
      // the way runs towards the junction; its north side (o < 0) faces the heap and the tank
      const Fb = frame(pairs(br.p)), Wb = (s, o) => { const q = Fb.at(s), [ux, uz] = Fb.dir(s); return [q.x - uz * o, q.z + ux * o]; };
      const Lb = Fb.L ?? Fb.S?.[Fb.S.length - 1], o = -(br.w / 2 + 0.3);
      for (let s = Lb - 22; s < Lb - 13; s += 1.5) {
        const p = Wb(s, o), q = Wb(s + 1.5, o), y = Math.max(Y(...p), Y(...q));
        boxAt(blocks, (p[0] + q[0]) / 2, y + 0.2, (p[1] + q[1]) / 2, 1.52, 0.6, 0.3, -Math.atan2(q[1] - p[1], q[0] - p[0]));
        seg(p, q, 0.15, y - 1, y + 0.5, 'kerb');
      }
    }
  }

  // ---- photo 57: the guardrail before the fork, the shed behind the fence, the pole with the warning sign
  guardrail(A.beam, rails, world, F, W, RAIL57.s0, RAIL57.s1, hw + 0.6, grow);
  {
    // the concrete headwall it stands on, over the ditch (photo 57: a dark opening under the rail)
    const a = W(RAIL57.s0 + 2, hw + 0.95), b = W(RAIL57.s1 - 3, hw + 0.95), ya = Y(...a), yb = Y(...b), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    boxAt(blocks, (a[0] + b[0]) / 2, (ya + yb) / 2 - 0.35, (a[1] + b[1]) / 2, L, 0.9, 0.3, -Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
  // the yard's fence turns along the lane's south edge at the corner, a shed with a pale roof behind it (photo 57)
  {
    const br = road(BRANCH);
    if (br) {
      const Fb = frame(pairs(br.p)), Lb = Fb.L, Wb = (s, o) => { const q = Fb.at(s), [ux, uz] = Fb.dir(s); return [q.x - uz * o, q.z + ux * o]; };
      const ob = br.w / 2 + 1.2;                                                      // o > 0: the yard's side of the lane
      const pts = []; for (let d = 6; d <= 22; d += 2.5) pts.push(Wb(Lb - d, ob));
      const c0 = W(FENCE.s0, fenceO(FENCE.s0)); pts.unshift(c0);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], py = Y(...p), q = pts[Math.min(i + 1, pts.length - 1)], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
        const top = [p[0], py + 2.0, p[1]];
        boxAt(posts, p[0], py + 0.7, p[1], 0.12, 2.6, 0.12, -Math.atan2(dz, dx));
        const [bx, bz] = Fb.dir(Lb - 6);                                              // the arm leans over the lane (o decreasing)
        const end = [p[0] + bz * 0.32, py + 2.32, p[1] - bx * 0.32];
        member(A.steel, top, end, 0.025);
        if (i < pts.length - 1) {
          const qy = Y(...q), qtop = [q[0], qy + 2.0, q[1]], qend = [q[0] + bz * 0.32, qy + 2.32, q[1] - bx * 0.32];
          wallQuad(A.chain, p, q, py + 0.6, py + 1.95, qy + 0.6, qy + 1.95, [dz, -dx], 0, L / 0.12);
          boxAt(blocks, (p[0] + q[0]) / 2, (py + qy) / 2 + 0.15, (p[1] + q[1]) / 2, L, 0.9, 0.2, -Math.atan2(dz, dx));
          for (const f of [0.35, 0.7, 1]) wires.push(top[0] + (end[0] - top[0]) * f, top[1] + (end[1] - top[1]) * f, top[2] + (end[2] - top[2]) * f, qtop[0] + (qend[0] - qtop[0]) * f, qtop[1] + (qend[1] - qtop[1]) * f, qtop[2] + (qend[2] - qtop[2]) * f);
          seg(p, q, 0.08, Math.min(py, qy) - 1, Math.max(py, qy) + 2.3, 'fence');
        }
      }
      const [sx, sz] = Wb(Lb - 12, ob + 4.2), [ux, uz] = Fb.dir(Lb - 12), sy = Y(sx, sz), rot = Math.atan2(uz, ux);
      boxAt(blocks, sx, sy + 1.1, sz, 7.0, 2.6, 4.4, -rot);
      boxAt(roofs, sx, sy + 2.45, sz, 7.4, 0.12, 4.8, -rot);
      box(sx, sz, 3.5, 2.2, Math.atan2(-uz, ux), sy - 1, sy + 2.5, 'building');
    }
  }
  {
    const [px, pz] = W(100, -(hw + 2.2)), py = Y(px, pz), [ux, uz] = F.dir(100);
    boxAt(blocks, px, py + 4.2, pz, 0.26, 9.6, 0.26, -Math.atan2(uz, ux));
    const fx = -ux, fz = -uz, sxw = uz * 0.2, szw = -ux * 0.2;                         // faces traffic heading north-west
    A.warn.quad([px + fx * 0.15 - sxw, py + 2.0, pz + fz * 0.15 - szw], [px + fx * 0.15 + sxw, py + 2.0, pz + fz * 0.15 + szw], [px + fx * 0.15 + sxw, py + 2.4, pz + fz * 0.15 + szw], [px + fx * 0.15 - sxw, py + 2.4, pz + fz * 0.15 - szw], [fx, 0, fz]);
    box(px, pz, 0.15, 0.15, 0, py - 1, py + 9, 'pole');
  }

  // ---- trees: the yard is open ground; bushes along the fence and round the apron (photo 56)
  const T = GEO.trees;
  if (T) {
    const yp = yardPoly(W, hw);
    const inside = (x, z) => { let c = false; for (let i = 0, j = yp.length - 1; i < yp.length; j = i++) { const [xi, zi] = yp[i], [xj, zj] = yp[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    const nearTank = (x, z) => Math.hypot(x - TANK.x, z - TANK.z) < TANK.r + 1.5;
    const nearPile = (x, z) => Math.hypot(x - PILE.x, z - PILE.z) < 4;
    const add = [];
    for (let s = FENCE.s0 + 1; s < FENCE.s1; s += 3 + R() * 3) {
      if (s > 153 && s < 181) continue;                                              // the apron and the portal
      const o = fenceO(s) + (R() < 0.5 ? -1.2 : 1.2) * (0.5 + R());
      const [x, z] = W(s, o); add.push([x, z, 12, 0.28 + R() * 0.18]);
    }
    for (let i = 0; i < 14; i++) { const [x, z] = W(174 + R() * 14, 4.5 + R() * 5); add.push([x, z, 12, 0.16 + R() * 0.1]); }   // the low thicket left of the apron (photo 56)
    // photo 57, right of the road before the fork: a big tree over the pole, trees and bushes hiding the houses behind
    add.push([...W(103, -(hw + 5.5)), 0, 1.3], [...W(95, -(hw + 7)), 4, 1.1], [...W(88, -(hw + 6)), 1, 1.0], [...W(110, -(hw + 7.5)), 1, 1.05]);
    add.push([...W(84, -(hw + 9)), 0, 1.15], [...W(79, -(hw + 7.5)), 1, 1.05], [...W(90, -(hw + 11)), 4, 1.0], [...W(82, -(hw + 13)), 1, 1.1]);   // in front of the houses
    add.push([440, -252, 0, 1.15], [444, -257.5, 1, 1.1], [437.5, -259.5, 0, 1.2], [447, -251, 1, 1.05]);   // photo 57: the trees over the tank's left hide the houses up the hill
    add.push([...W(97, -(hw + 3.4)), 1, 1.0], [...W(92, -(hw + 4.2)), 0, 1.1], [...W(99.5, -(hw + 2.4)), 12, 0.55], [...W(94.5, -(hw + 2.6)), 12, 0.5], [...W(89, -(hw + 3)), 12, 0.5]);   // the thicket right of the car
    for (let s = 86; s < 114; s += 2.5 + R() * 1.5) add.push([...W(s, -(hw + 2.6 + R() * 2.5)), 12, 0.3 + R() * 0.2]);
    const keep = []; for (let i = 0; i < T.n; i++) { const x = T.x[i], z = T.z[i]; if (!(inside(x, z) || nearTank(x, z) || nearPile(x, z))) keep.push(i); }
    const n = keep.length + add.length, x = new Float32Array(n), z = new Float32Array(n), t = new Uint8Array(n), s = new Float32Array(n);
    keep.forEach((i, k) => { x[k] = T.x[i]; z[k] = T.z[i]; t[k] = T.t[i]; s[k] = T.s[i]; });
    add.forEach(([ax, az, at, as], k) => { const j = keep.length + k; x[j] = ax; z[j] = az; t[j] = at; s[j] = as; });
    GEO.trees = { n, x, z, t, s };
  }

  A.steel.flush(B, Mt.steel, null, {});
  A.brick.flush(B, Mt.brick, null, {});
  A.chain.flush(B, Mt.chain, null, { noCast: true });
  A.tank.flush(B, Mt.tank, null, {});
  A.apron.flush(B, Mt.apron, null, { noCast: true });
  A.soil.flush(B, Mt.soil, null, { noCast: true });
  A.reed.flush(B, Mt.reed, null, { noCast: true });
  A.warn.flush(B, Mt.warn, null, {});
  A.beam.flush(B, G.beam, null, {});
  if (rails.length) B.geo(G.post, merged(rails));
  if (posts.length) B.geo(Mt.post, merged(posts));
  if (blocks.length) B.geo(Mt.block, merged(blocks));
  if (roofs.length) B.geo(Mt.roofLight, merged(roofs));

  // photo 56: from the right lane ~25 m south-east of the apron, looking at its middle; photo 57: at the fork, the tank ~2 deg
  // left of the frame's centre
  const cam57 = W(CAM57, -1.6), dx = TANK.x - cam57[0], dz = TANK.z - cam57[1], L = Math.hypot(dx, dz), a = 2 * Math.PI / 180;
  const hx = (dx * Math.cos(a) - dz * Math.sin(a)) / L, hz = (dz * Math.cos(a) + dx * Math.sin(a)) / L;         // turned 2 deg right
  return {
    type: 'hala', name: 'Strada Toma Cantacuzino — curtea cu hala dezafectată și rezervorul', bbox: bb, wires,
    views: { a: { from: W(CAM56, -1.6), to: W(163, 9) }, b: { from: cam57, to: [cam57[0] + hx * 40, cam57[1] + hz * 40] } },
  };
}
