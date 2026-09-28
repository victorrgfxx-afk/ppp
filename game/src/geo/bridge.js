import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt, addHole } from './data.js';
import { M } from '../materials.js';

// DJ100E bridge over the Prahova between Poiana Câmpina and Câmpina (OSM way 17505165, 173 m), rebuilt from the
// user's Street View screenshots (photos 30-32, 45.12914 N 25.71874 E); the canal, the weir and the DN1 dual
// carriageway under the east spans were placed on aerial imagery against OSM. Pier positions are estimated
// (no image shows them): ~27 m spans, one pier in the DN1 median.
//   deck: 7.5 m carriageway between concrete safety barriers: the north one with tall blocks and notches, the south
//   one painted in yellow and black blocks; a 1.8 m raised sidewalk on the north (upstream) side, a 1.1 m walkway on
//   the south side with the galvanised lamp posts that also carry the low-voltage lines; railings of square posts,
//   vertical bars and top rails, the panels alternately faded yellow and dark / rusty.
//   below: five precast girders per span on wall piers with rounded ends, abutments at both ends.
//   upstream: the concrete canal on the west bank (from the weir ~190 m upstream, under the bridge, into the river
//   below it) and the weir across the river.
const CFG = {
  id: '17505165',
  crest: 0.75,                                        // the deck rises this much above the chord between the abutments
  piers: [27.1, 54.1, 81.2, 108.3, 135.35, 154.1],    // distance from the west end; 135.35 = DN1 median
  median: 135.35,
  abut: 3.2,
  road: 3.75, bar: 0.5,                               // offsets across the deck (+ = south / downstream)
  south: { walk: 5.35, edge: 5.6, lift: 0.2, top: 0.74 },
  north: { walk: 6.05, edge: 6.3, lift: 0.25, top: 0.88, low: 0.46 },
  slab: 0.3, gd: 1.25, girders: [-4.85, -2.45, 0, 2.45, 4.75],
  lamps: [10, 44, 78, 112, 146],
  canal: [[-580.7, 64.3], [-618.9, 53.4], [-659.9, 39.3], [-706.5, 19.1], [-745.6, -2.3], [-783.0, -28.1], [-804.6, -42.6], [-836.4, -62.1], [-867.6, -79.2]],
  weir: [[-612.3, 70.1], [-623.7, 93.4]],
};

// Around the bridge the low-water channel is 10-14 m wide (aerial imagery, photo 32) and the rest of the bed is
// gravel: water cells of the Prahova farther than ~4.5 m from the OSM centreline (which follows the channel here)
// are dropped within 450 m of the bridge, tapering back to the full bed by 700 m.
const NARROW = { x: -825, z: -3, r0: 450, r1: 700, hw: 4.5 };
let RIV = null;
export function riverCellKept(x, z) {
  const dc = Math.hypot(x - NARROW.x, z - NARROW.z);
  if (dc > NARROW.r1) return true;
  const R = GEO.river;
  if (!R || !R.p) return true;
  if (!RIV) {
    RIV = [];
    for (let i = 0; i < R.p.length - 2; i += 2) if (Math.hypot(R.p[i] - NARROW.x, R.p[i + 1] - NARROW.z) < NARROW.r1 + 150) RIV.push([R.p[i], R.p[i + 1], R.p[i + 2], R.p[i + 3]]);
  }
  let d = Infinity;
  for (const [ax, az, bx, bz] of RIV) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  if (d > 80) return true;                                      // not the Prahova
  return d <= NARROW.hw + Math.max(0, dc - NARROW.r0) * 0.12;
}

let BR;
// deck frame: s along the bridge from the west (Poiana Câmpina) end, o across it (+ = south); null if not in the data
export function prahovaBridge() {
  if (BR !== undefined) return BR;
  const r = (GEO.roads || []).find(q => q.id === CFG.id);
  if (!r || r.p.length < 4) return (BR = null);
  const n = r.p.length;
  const ax = r.p[0], az = r.p[1], bx = r.p[n - 2], bz = r.p[n - 1];
  const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
  const y0 = heightAt(ax, az) + 0.05, y1 = heightAt(bx, bz) + 0.05;
  const yAt = (s) => { const t = Math.max(0, Math.min(1, s / L)); return y0 + (y1 - y0) * t + CFG.crest * Math.sin(Math.PI * t); };
  const local = (x, z) => [(x - ax) * ux + (z - az) * uz, (x - ax) * nx + (z - az) * nz];
  const W = (s, o) => [ax + ux * s + nx * o, az + uz * s + nz * o];
  // walkable surface: carriageway, raised sidewalk and walkway (null off the deck)
  const surface = (x, z) => {
    const [s, o] = local(x, z);
    if (s < -0.3 || s > L + 0.3 || o < -CFG.north.walk || o > CFG.south.walk) return null;
    return yAt(s) + (o < -(CFG.road + CFG.bar) ? CFG.north.lift : o > CFG.road + CFG.bar ? CFG.south.lift : 0);
  };
  const ex = 8 + L / 2;
  return (BR = { r, ax, az, L, ux, uz, nx, nz, yAt, local, W, surface, x0: (ax + bx) / 2 - ex, x1: (ax + bx) / 2 + ex, z0: (az + bz) / 2 - ex, z1: (az + bz) / 2 + ex });
}

// triangle accumulator; quads are wound to face the hint normal, their shading normal is the true face normal
export class Acc {
  constructor() { this.p = []; this.n = []; this.uv = []; }
  quad(a, b, c, d, hint, uv = [0, 0, 1, 0, 1, 1, 0, 1], vn = null) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = (d[0] - a[0]) + (c[0] - b[0]), vy = (d[1] - a[1]) + (c[1] - b[1]), vz = (d[2] - a[2]) + (c[2] - b[2]);
    let cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    let P = [a, b, c, d], T = [0, 1, 2, 3];
    if (cx * hint[0] + cy * hint[1] + cz * hint[2] < 0) { P = [a, d, c, b]; T = [0, 3, 2, 1]; cx = -cx; cy = -cy; cz = -cz; }
    const l = Math.hypot(cx, cy, cz);
    const fn = l > 1e-9 ? [cx / l, cy / l, cz / l] : hint;
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const q = P[k], t = T[k], nn = vn ? vn[t] : fn;
      this.p.push(q[0], q[1], q[2]); this.n.push(nn[0], nn[1], nn[2]); this.uv.push(uv[t * 2], uv[t * 2 + 1]);
    }
  }
  flush(B, mat, color = null, opts = {}) { if (this.p.length) B.tris(mat, this.p, this.n, this.uv, color, opts); this.p = []; this.n = []; this.uv = []; }
}

const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const UP = [0, 1, 0], DOWN = [0, -1, 0];

function tube(list, p, q, r, seg = 6) {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  list.push(g);
}

function catenary(out, p, q, sag, n = 8) {
  let prev = p;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const c = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - sag * 4 * t * (1 - t), p[2] + (q[2] - p[2]) * t];
    out.push(prev[0], prev[1], prev[2], c[0], c[1], c[2]);
    prev = c;
  }
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const vc = (m, extra = {}) => Object.assign(m.clone(), { vertexColors: true }, extra);
  MATS = {
    concrete: M.concrete,
    under: M.concrete.clone(),
    painted: vc(M.concrete, { roughness: 0.8 }),
    rail: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }),
    galv: M.galv, glass: M.lampGlass, pole: M.concretePole,
    water: new THREE.MeshStandardMaterial({ color: 0x46564c, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.88 }),
    foam: new THREE.MeshStandardMaterial({ color: 0xf2f4f2, roughness: 0.9, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
  };
  MATS.under.color = new THREE.Color(0xb3b0a8);
  MATS.canal = M.concrete.clone();
  MATS.canal.color = new THREE.Color(0xa7a49c);                  // weathered, darker than the new concrete of the deck
  return MATS;
}

// ------------------------------------------------------------------ the bridge
export function buildPrahovaBridge(B, world) {
  const br = prahovaBridge();
  if (!br) return null;
  const Mt = mats();
  const { L, yAt, W } = br;
  const U3 = [br.ux, 0, br.uz], N3 = [br.nx, 0, br.nz];
  const neg = (v) => [-v[0], -v[1], -v[2]];
  const P3 = (s, o, y) => { const [x, z] = W(s, o); return [x, y, z]; };
  const rot = Math.atan2(-br.uz, br.ux);                        // world.Box rotation with hw along the bridge
  const box = (s, o, hs, ho, y0, y1, tag) => { const [x, z] = W(s, o); world.addStatic(new world.Box(x, z, hs, ho, rot, y0, y1, tag)); };
  const A = { c: new Acc(), under: new Acc(), bar: new Acc(), yel: new Acc(), blk: new Acc(), rY: new Acc(), rD: new Acc(), rR: new Acc() };

  // box in the deck frame: s0..s1, o0..o1, bottom/top heights at s0 and s1; faces: t(op) b(ottom) o(0) O(1) s(0) S(1)
  const fbox = (acc, s0, s1, o0, o1, yb0, yb1, yt0, yt1, faces = 'tboOsS', tile = 2.2) => {
    const a = (s, o, y) => P3(s, o, y);
    if (faces.includes('t')) acc.quad(a(s0, o0, yt0), a(s1, o0, yt1), a(s1, o1, yt1), a(s0, o1, yt0), UP, [s0 / tile, o0 / tile, s1 / tile, o0 / tile, s1 / tile, o1 / tile, s0 / tile, o1 / tile]);
    if (faces.includes('b')) acc.quad(a(s0, o0, yb0), a(s1, o0, yb1), a(s1, o1, yb1), a(s0, o1, yb0), DOWN, [s0 / tile, o0 / tile, s1 / tile, o0 / tile, s1 / tile, o1 / tile, s0 / tile, o1 / tile]);
    const vs = (y) => y / tile;
    if (faces.includes('o')) acc.quad(a(s0, o0, yb0), a(s1, o0, yb1), a(s1, o0, yt1), a(s0, o0, yt0), neg(N3), [s0 / tile, vs(yb0), s1 / tile, vs(yb1), s1 / tile, vs(yt1), s0 / tile, vs(yt0)]);
    if (faces.includes('O')) acc.quad(a(s0, o1, yb0), a(s1, o1, yb1), a(s1, o1, yt1), a(s0, o1, yt0), N3, [s0 / tile, vs(yb0), s1 / tile, vs(yb1), s1 / tile, vs(yt1), s0 / tile, vs(yt0)]);
    if (faces.includes('s')) acc.quad(a(s0, o0, yb0), a(s0, o1, yb0), a(s0, o1, yt0), a(s0, o0, yt0), neg(U3), [o0 / tile, vs(yb0), o1 / tile, vs(yb0), o1 / tile, vs(yt0), o0 / tile, vs(yt0)]);
    if (faces.includes('S')) acc.quad(a(s1, o0, yb1), a(s1, o1, yb1), a(s1, o1, yt1), a(s1, o0, yt1), U3, [o0 / tile, vs(yb1), o1 / tile, vs(yb1), o1 / tile, vs(yt1), o0 / tile, vs(yt1)]);
  };

  const { road, bar, south: So, north: No } = CFG;
  const STEP = 4;
  const cuts = []; for (let s = 0; s < L; s += STEP) cuts.push(s); cuts.push(L);

  // ---- deck: walkways (south walkway, north sidewalk), cornices, slab underside
  for (let i = 0; i < cuts.length - 1; i++) {
    const s0 = cuts[i], s1 = cuts[i + 1], y0 = yAt(s0), y1 = yAt(s1);
    for (const [sg, side] of [[1, So], [-1, No]]) {
      const oi = sg * (road + bar), oe = sg * side.edge, lip = sg * (side.edge - 0.22);
      const [oa, ob] = sg > 0 ? [oi, lip] : [lip, oi];
      fbox(A.c, s0, s1, oa, ob, y0 - 0.8, y1 - 0.8, y0 + side.lift, y1 + side.lift, 't' + (i === 0 ? 's' : '') + (i === cuts.length - 2 ? 'S' : ''));
      // cornice: kerb on the outer edge, outer face down to the edge beam's soffit
      const [ka, kb] = sg > 0 ? [lip, oe] : [oe, lip];
      fbox(A.c, s0, s1, ka, kb, y0 - 0.8, y1 - 0.8, y0 + side.lift + 0.1, y1 + side.lift + 0.1, 'tboO' + (i === 0 ? 's' : '') + (i === cuts.length - 2 ? 'S' : ''));
    }
    fbox(A.under, s0, s1, -(No.edge - 0.22), So.edge - 0.22, y0 - CFG.slab, y1 - CFG.slab, 0, 0, 'b');
  }

  // ---- safety barriers
  const barrierRun = (sg, topAt, breaks, paint) => {
    const oR = sg * road, oM = sg * (road + 0.13), oB = sg * (road + bar);
    const lift = sg > 0 ? So.lift : No.lift;
    for (let i = 0; i < breaks.length - 1; i++) {
      const s0 = breaks[i], s1 = breaks[i + 1];
      if (s1 - s0 < 1e-3) continue;
      const acc = paint ? paint(s0, s1) : A.bar;
      const y0 = yAt(s0), y1 = yAt(s1), h0 = topAt(s0 + 1e-4), h1 = topAt(s1 - 1e-4);
      const tu = (s) => s / 2.2;
      const toRoad = neg([N3[0] * sg, 0, N3[2] * sg]);
      // sloped foot, vertical face, top, back face
      acc.quad(P3(s0, oR, y0), P3(s1, oR, y1), P3(s1, oM, y1 + 0.22), P3(s0, oM, y0 + 0.22), [toRoad[0] * 0.86, 0.5, toRoad[2] * 0.86], [tu(s0), 0, tu(s1), 0, tu(s1), 0.1, tu(s0), 0.1]);
      acc.quad(P3(s0, oM, y0 + 0.22), P3(s1, oM, y1 + 0.22), P3(s1, oM, y1 + h1), P3(s0, oM, y0 + h0), toRoad, [tu(s0), 0.1, tu(s1), 0.1, tu(s1), h1 / 2.2, tu(s0), h0 / 2.2]);
      acc.quad(P3(s0, oM, y0 + h0), P3(s1, oM, y1 + h1), P3(s1, oB, y1 + h1), P3(s0, oB, y0 + h0), UP, [tu(s0), 0, tu(s1), 0, tu(s1), 0.17, tu(s0), 0.17]);
      acc.quad(P3(s0, oB, y0 + lift), P3(s1, oB, y1 + lift), P3(s1, oB, y1 + h1), P3(s0, oB, y0 + h0), neg(toRoad), [tu(s0), 0, tu(s1), 0, tu(s1), h1 / 2.2, tu(s0), h0 / 2.2]);
    }
    // end caps
    for (const [s, dir] of [[breaks[0], neg(U3)], [breaks[breaks.length - 1], U3]]) {
      const y = yAt(s), h = topAt(s);
      const acc = paint ? paint(s, s) : A.bar;
      acc.quad(P3(s, oR, y), P3(s, oM, y), P3(s, oM, y + 0.22), P3(s, oR, y), dir);
      acc.quad(P3(s, oM, y), P3(s, oB, y), P3(s, oB, y + h), P3(s, oM, y + h), dir);
    }
    for (let s = breaks[0]; s < breaks[breaks.length - 1]; s += 12) {
      const e = Math.min(breaks[breaks.length - 1], s + 12), m = (s + e) / 2;
      box(m, sg * (road + bar / 2), (e - s) / 2, bar / 2, yAt(m) - 0.6, yAt(m) + 0.75, 'wall');
    }
  };
  const bs = 0.25, be = L - 0.25;
  // north: tall blocks (1.25 m) and notches (0.45 m) with short ramps, period 2 m
  const PER = 2.0;
  const topN = (s) => {
    const f = ((s - bs) % PER + PER) % PER;
    if (f < 1.25) return No.top;
    if (f < 1.4) return No.top + (No.low - No.top) * (f - 1.25) / 0.15;
    if (f < 1.85) return No.low;
    return No.low + (No.top - No.low) * (f - 1.85) / 0.15;
  };
  const bN = [bs];
  for (let k = 0; bs + k * PER < be; k++) for (const f of [1.25, 1.4, 1.85, 2.0]) { const s = bs + k * PER + f; if (s < be) bN.push(s); }
  bN.push(be);
  barrierRun(-1, topN, bN);
  // south: painted blocks, yellow 1.5 m / black 1.1 m
  const bS = [bs], paintAt = [];
  for (let s = bs, k = 0; s < be; k++) { const l = k % 2 ? 1.1 : 1.5; paintAt.push([s, s + l, k % 2]); s += l; bS.push(Math.min(be, s)); }
  barrierRun(1, () => So.top, bS, (s0, s1) => { const m = (s0 + s1) / 2; const p = paintAt.find(q => m >= q[0] - 1e-6 && m <= q[1] + 1e-6); return p && p[2] ? A.blk : A.yel; });

  // ---- railings: square posts every 2.4 m, top and bottom rails, vertical bars at 13 cm
  const HR = 1.08;
  for (const [sg, side] of [[1, So], [-1, No]]) {
    const oR = sg * (side.edge - 0.12);
    const base = (s) => yAt(s) + side.lift + 0.1;
    const n = Math.round((L - 1.2) / 2.4), d = (L - 1.2) / n;
    for (let k = 0; k <= n; k++) {
      const s = 0.6 + k * d, b = base(s);
      fbox(A.rY, s - 0.045, s + 0.045, oR - 0.045, oR + 0.045, b, b, b + HR + 0.03, b + HR + 0.03, 'toOsS');
      if (k === n) break;
      const s1 = s + d, b1 = base(s1);
      const h = Math.abs(Math.sin(k * 12.9898 + sg * 78.233) * 43758.5453) % 1;
      const acc = k % 2 === 0 ? A.rY : h < 0.45 ? A.rR : A.rD;
      fbox(acc, s + 0.045, s1 - 0.045, oR - 0.035, oR + 0.035, b + HR - 0.05, b1 + HR - 0.05, b + HR + 0.01, b1 + HR + 0.01, 'tboO');
      fbox(acc, s + 0.045, s1 - 0.045, oR - 0.02, oR + 0.02, b + 0.12, b1 + 0.12, b + 0.16, b1 + 0.16, 'tboO');
      const nb = Math.floor((d - 0.09) / 0.13);
      for (let j = 1; j < nb; j++) {
        const sb = s + 0.045 + j * (d - 0.09) / nb, bb = base(sb);
        fbox(acc, sb - 0.011, sb + 0.011, oR - 0.011, oR + 0.011, bb + 0.16, bb + 0.16, bb + HR - 0.05, bb + HR - 0.05, 'oOsS');
      }
    }
    for (let s = 0.6; s < L - 0.6; s += 12) {
      const e = Math.min(L - 0.6, s + 12), m = (s + e) / 2;
      box(m, oR, (e - s) / 2, 0.1, yAt(m) - 0.5, yAt(m) + side.lift + 1.25, 'railing');
    }
  }

  // ---- girders, pier caps, piers, abutments
  const sup = [CFG.abut, ...CFG.piers, L - CFG.abut];
  const soffit = (s) => yAt(s) - CFG.slab;
  for (let i = 0; i < sup.length - 1; i++) {
    const s0 = sup[i] + 0.3, s1 = sup[i + 1] - 0.3, t0 = soffit(s0), t1 = soffit(s1);
    for (const g of CFG.girders) {
      fbox(A.under, s0, s1, g - 0.2, g + 0.2, t0 - CFG.gd + 0.2, t1 - CFG.gd + 0.2, t0, t1, 'oOsS');
      fbox(A.under, s0, s1, g - 0.33, g + 0.33, t0 - CFG.gd, t1 - CFG.gd, t0 - CFG.gd + 0.2, t1 - CFG.gd + 0.2, 'tboOsS');
    }
  }
  const piers = [];
  for (const sp of CFG.piers) {
    const top = soffit(sp) - CFG.gd, capB = top - 1.0;
    fbox(A.under, sp - 0.75, sp + 0.75, -5.4, 5.2, capB, capB, top, top, 'tboOsS');
    const med = sp === CFG.median, r = med ? 0.5 : 0.55, hw = med ? 3.2 : 3.8;
    let g = Infinity;
    for (const o of [-hw, -hw / 2, 0, hw / 2, hw]) for (const ds of [-r, r]) { const [x, z] = W(sp + ds, o); g = Math.min(g, heightAt(x, z)); }
    const yb = g - 1.2, yt = capB + 0.02;
    // stadium outline: straight sides along o, half circles at the ends
    const ring = [];
    for (let k = 0; k <= 8; k++) { const f = Math.PI * k / 8; ring.push([Math.cos(f), Math.sin(f), r * Math.cos(f), hw - r + r * Math.sin(f)]); }
    for (let k = 0; k <= 8; k++) { const f = Math.PI + Math.PI * k / 8; ring.push([Math.cos(f), Math.sin(f), r * Math.cos(f), -(hw - r) + r * Math.sin(f)]); }
    ring.push(ring[0]);
    let acc = 0;
    for (let k = 0; k < ring.length - 1; k++) {
      const [ca, sa, da, oa] = ring[k], [cb, sb, db, ob] = ring[k + 1];
      const na = [U3[0] * ca + N3[0] * sa, 0, U3[2] * ca + N3[2] * sa], nb = [U3[0] * cb + N3[0] * sb, 0, U3[2] * cb + N3[2] * sb];
      const l = Math.hypot(db - da, ob - oa);
      A.under.quad(P3(sp + da, oa, yb), P3(sp + db, ob, yb), P3(sp + db, ob, yt), P3(sp + da, oa, yt), [(na[0] + nb[0]) / 2, 0, (na[2] + nb[2]) / 2],
        [acc / 2.2, yb / 2.2, (acc + l) / 2.2, yb / 2.2, (acc + l) / 2.2, yt / 2.2, acc / 2.2, yt / 2.2], [na, nb, nb, na]);
      acc += l;
    }
    box(sp, 0, r, hw, yb, yt, 'pier');
    piers.push({ s: sp, W: W(sp, 0) });
  }
  for (const [sa, dir] of [[CFG.abut, 1], [L - CFG.abut, -1]]) {
    const top = soffit(sa);
    let g = Infinity;
    for (const o of [-6.3, 0, 5.6]) { const [x, z] = W(sa, o); g = Math.min(g, heightAt(x, z)); }
    fbox(A.under, sa - 0.6 - dir * 0.6, sa + 0.6 - dir * 0.6, -No.edge, So.edge, g - 1.5, g - 1.5, top, top, 'oOsS');
  }

  // ---- lamps on the south walkway (they carry the low-voltage lines), wires and two concrete poles off the ends
  const parts = [], heads = [], lens = [], poles = [], wires = [];
  const oL = So.walk - 0.28, H = 8.7, R = 0.9;
  const attach = [];
  for (const s of CFG.lamps) {
    const y = yAt(s) + So.lift, at = (o, h) => P3(s, o, y + h);
    const pole = new THREE.CylinderGeometry(0.075, 0.12, H, 10);
    const [x, z] = W(s, oL); pole.translate(x, y + H / 2, z); parts.push(pole);
    const foot = new THREE.CylinderGeometry(0.2, 0.22, 0.12, 10); foot.translate(x, y + 0.06, z); parts.push(foot);
    // crosier arm over the road
    let prev = at(oL, H - 0.05);
    for (let k = 1; k <= 6; k++) {
      const f = (Math.PI / 2) * k / 6, q = at(oL - R + R * Math.cos(f), H - 0.05 + R * Math.sin(f));
      tube(parts, prev, q, 0.042); prev = q;
    }
    const end = at(oL - 2.2, H - 0.05 + R + 0.1);
    tube(parts, prev, end, 0.04);
    const head = new THREE.BoxGeometry(0.7, 0.13, 0.3), lz = new THREE.BoxGeometry(0.52, 0.02, 0.22);
    const yaw = Math.atan2(-br.nz, -br.nx);
    for (const [g, dy] of [[head, 0], [lz, -0.075]]) {
      g.rotateZ(0.06); g.rotateY(-yaw);
      const c = at(oL - 2.2 - 0.3, H - 0.05 + R + 0.1 + dy);
      g.translate(c[0], c[1], c[2]);
    }
    heads.push(head); lens.push(lz);
    // cross arm with the four insulated conductors
    const ca = at(oL - 0.35, H - 1.3), cb = at(oL + 0.35, H - 1.3);
    tube(parts, ca, cb, 0.03);
    attach.push([at(oL - 0.3, H - 1.26), at(oL + 0.3, H - 1.26), at(oL - 0.3, H - 1.6), at(oL + 0.3, H - 1.6)]);
    world.addStatic(new world.Box(x, z, 0.15, 0.15, 0, y - 1, y + H, 'pole'));
  }
  // concrete poles on the banks, off the approach roads
  const clearOfRoads = (x, z) => {
    let best = Infinity;
    for (const q of GEO.roads) {
      const p = q.p;
      for (let i = 0; i < p.length - 2; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
        if (Math.min(ax, bx) - 30 > x || Math.max(ax, bx) + 30 < x || Math.min(az, bz) - 30 > z || Math.max(az, bz) + 30 < z) continue;
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz) - q.w / 2);
      }
    }
    return best;
  };
  for (const [s, k] of [[-26, 0], [L + 26, CFG.lamps.length - 1]]) {
    let o = 6.5, x, z;
    for (let it = 0; it < 12; it++) { [x, z] = W(s, o); if (clearOfRoads(x, z) > 1.3) break; o += 1; }
    const y = heightAt(x, z);
    const pole = new THREE.CylinderGeometry(0.11, 0.17, 9.5, 8); pole.translate(x, y + 4.75, z); poles.push(pole);
    const at = (dox, h) => { const [px, pz] = W(s, o + dox); return [px, y + h, pz]; };
    tube(parts, at(-0.4, 8.2), at(0.4, 8.2), 0.035);
    const ends = [at(-0.35, 8.25), at(0.35, 8.25), at(-0.35, 7.9), at(0.35, 7.9)];
    const lamp = attach[k];
    for (let w = 0; w < 4; w++) catenary(wires, ends[w], lamp[w], 0.4);
    world.addStatic(new world.Box(x, z, 0.2, 0.2, 0, y - 1, y + 10, 'pole'));
  }
  for (let k = 0; k < attach.length - 1; k++) for (let w = 0; w < 4; w++) catenary(wires, attach[k][w], attach[k + 1][w], 0.32);

  // ---- flush
  const C = { yel: col(0xd2c690), blk: col(0x3b3b3b), rY: col(0xcbbd80), rD: col(0x302e2c), rR: col(0x7a5a40) };
  A.c.flush(B, Mt.concrete);
  A.under.flush(B, Mt.under);
  A.bar.flush(B, Mt.painted, col(0xd2cec5));
  A.yel.flush(B, Mt.painted, C.yel);
  A.blk.flush(B, Mt.painted, C.blk);
  A.rY.flush(B, Mt.rail, C.rY, { noCast: false });
  A.rD.flush(B, Mt.rail, C.rD);
  A.rR.flush(B, Mt.rail, C.rR);
  B.geo(Mt.galv, mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g)));
  B.geo(Mt.galv, mergeGeometries(heads));
  B.geo(Mt.glass, mergeGeometries(lens), null, null, { noCast: true });
  B.geo(Mt.pole, mergeGeometries(poles));
  // no trees on the deck
  addHole(br.W(L / 2, -0.35), L / 2 + 2, 7.5, br.ux, br.uz);

  const canal = buildCanal(B, world, Mt);
  const weir = buildWeir(B, world, Mt);
  return { type: 'bridge', name: 'Podul peste Prahova', L, W, yAt, surface: br.surface, piers, wires, canal, weir, x: W(L / 2, 0)[0], z: W(L / 2, 0)[1] };
}

// ------------------------------------------------------------------ canal on the west bank
// A raised concrete channel (the floodplain ground is at the river level here): stepped inner walls, a flat coping,
// a stepped outer face down into the ground, water ~0.6 m below the coping.
function buildCanal(B, world, Mt) {
  const pts = [];
  const src = CFG.canal;
  for (let i = 0; i < src.length - 1; i++) {
    const [ax, az] = src[i], [bx, bz] = src[i + 1], l = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(l / 3));
    for (let j = 0; j < k; j++) pts.push([ax + (bx - ax) * j / k, az + (bz - az) * j / k]);
  }
  pts.push(src[src.length - 1]);
  const n = pts.length;
  const tan = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  });
  const nrm = tan.map(([tx, tz]) => [-tz, tx]);
  const HW = 2.75;
  // coping level: the highest ground under the section + 0.95, smoothed, never rising downstream
  const g = pts.map(([x, z], i) => Math.max(...[-HW, -1.4, 0, 1.4, HW].map(q => heightAt(x + nrm[i][0] * q, z + nrm[i][1] * q))));
  let T = g.map((_, i) => { let m = -Infinity; for (let k = Math.max(0, i - 4); k <= Math.min(n - 1, i + 4); k++) m = Math.max(m, g[k]); return m + 0.95; });
  for (let i = 1; i < n; i++) T[i] = Math.min(T[i], T[i - 1]);
  T = T.map((t, i) => Math.max(t, g[i] + 0.55));
  const half = [[2.75, -1.7], [2.75, -0.48], [2.35, -0.48], [2.35, 0], [1.75, 0], [1.75, -0.3], [1.42, -0.3], [1.42, -0.6], [1.1, -0.6], [1.1, -1.0]];
  const prof = [...half.map(([q, h]) => [-q, h]), ...half.slice().reverse().map(([q, h]) => [q, h])];
  const acc = new Acc(), wat = new Acc();
  const P = (i, q, h) => [pts[i][0] + nrm[i][0] * q, T[i] + h, pts[i][1] + nrm[i][1] * q];
  let along = 0;
  for (let i = 0; i < n - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    let pv = 0;
    for (let k = 0; k < prof.length - 1; k++) {
      const [qa, ha] = prof[k], [qb, hb] = prof[k + 1];
      if (qa === qb && ha === hb) continue;
      const dq = qb - qa, dh = hb - ha, pl = Math.hypot(dq, dh);
      const on = [-dh / pl, dq / pl];                                    // outward (air side) in (q, h)
      const hint = [nrm[i][0] * on[0], on[1], nrm[i][1] * on[0]];
      acc.quad(P(i, qa, ha), P(i + 1, qa, ha), P(i + 1, qb, hb), P(i, qb, hb), hint,
        [along / 2.2, pv / 2.2, (along + l) / 2.2, pv / 2.2, (along + l) / 2.2, (pv + pl) / 2.2, along / 2.2, (pv + pl) / 2.2]);
      pv += pl;
    }
    wat.quad(P(i, -1.1, -0.62), P(i + 1, -1.1, -0.62), P(i + 1, 1.1, -0.62), P(i, 1.1, -0.62), UP);
    along += l;
    if (i % 4 === 0) {
      const m = Math.min(n - 1, i + 4), cx = (pts[i][0] + pts[m][0]) / 2, cz = (pts[i][1] + pts[m][1]) / 2;
      const dx = pts[m][0] - pts[i][0], dz = pts[m][1] - pts[i][1], ll = Math.hypot(dx, dz) || 1;
      world.addStatic(new world.Box(cx, cz, ll / 2, HW, Math.atan2(-dz, dx), Math.min(g[i], g[m]) - 1, T[i], 'wall'));
    }
  }
  // head wall at the intake (by the weir) and the end wall at the outfall
  for (const [i, sgn] of [[0, -1], [n - 1, 1]]) {
    const d = [tan[i][0] * sgn, 0, tan[i][1] * sgn];
    acc.quad(P(i, -HW, -1.7), P(i, HW, -1.7), P(i, HW, -0.48), P(i, -HW, -0.48), d);
    acc.quad(P(i, -2.35, -0.48), P(i, 2.35, -0.48), P(i, 2.35, 0), P(i, -2.35, 0), d);
  }
  acc.flush(B, Mt.canal);
  wat.flush(B, Mt.water, null, { noCast: true });
  for (let i = 0; i < n - 1; i += 2) {
    const j = Math.min(n - 1, i + 2);
    addHole([(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2], Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]) / 2 + 0.5, HW + 1.2, tan[i][0], tan[i][1]);
  }
  // the meadow west of the canal between the weir and the trees by the bridge (aerial imagery, photo 32)
  for (let i = 0; i < n - 1 && Math.hypot(pts[i][0] - src[0][0], pts[i][1] - src[0][1]) < 135; i += 3) {
    const j = Math.min(n - 1, i + 3), off = HW + 1 + 21;
    addHole([(pts[i][0] + pts[j][0]) / 2 + nrm[i][0] * off, (pts[i][1] + pts[j][1]) / 2 + nrm[i][1] * off], Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]) / 2 + 1, 21, tan[i][0], tan[i][1], { lawn: true });
  }
  return { pts, T };
}

// ------------------------------------------------------------------ weir ~190 m upstream
function buildWeir(B, world, Mt) {
  const [[ax, az], [bx, bz]] = CFG.weir;
  let dx = bx - ax, dz = bz - az;
  const l = Math.hypot(dx, dz); dx /= l; dz /= l;
  const cx = (ax + bx) / 2, cz = (az + bz) / 2;
  // water level: the highest water cell within 12 m (the river surface the foam must sit on)
  let lev = null;
  for (const [i, j, lc] of GEO.water || []) {
    const x = -GEO.ext + (i + 0.5) * GEO.step, z = -GEO.ext + (j + 0.5) * GEO.step;
    if (Math.abs(x - cx) < 12 && Math.abs(z - cz) < 12 && (lev === null || lc / 100 > lev)) lev = lc / 100;
  }
  if (lev === null) return null;
  // flow direction: across the weir, pointing downstream (towards the bridge)
  let fx = dz, fz = -dx;
  const br = prahovaBridge();
  if (br && (br.ax - cx) * fx + (br.az - cz) * fz < 0) { fx = -fx; fz = -fz; }
  const half = l / 2 + 7;
  // where the low-water channel (the OSM centreline) crosses the weir: the white water is centred there
  let a0 = 0;
  if (GEO.river && GEO.river.p) {
    const R = GEO.river.p;
    for (let i = 0; i < R.length - 2; i += 2) {
      const px = R[i], pz = R[i + 1], qx = R[i + 2], qz = R[i + 3], ex = qx - px, ez = qz - pz;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const a = ((px - cx) * ez - (pz - cz) * ex) / den, t = ((px - cx) * dz - (pz - cz) * dx) / den;
      if (t >= 0 && t <= 1 && Math.abs(a) < half) { a0 = a; break; }
    }
  }
  const P = (a, f, y) => [cx + dx * a + fx * f, y, cz + dz * a + fz * f];
  const acc = new Acc(), foam = new Acc();
  // crest (1.6 m) standing ~0.45 m above the downstream water, then four steps down into the pool below it
  const crest = lev + 0.45, uvw = [0, 0, 2 * half / 2.2, 0, 2 * half / 2.2, 0.7, 0, 0.7];
  acc.quad(P(-half, -0.8, crest), P(half, -0.8, crest), P(half, 0.8, crest), P(-half, 0.8, crest), UP, uvw);
  acc.quad(P(-half, -0.8, lev - 1.2), P(half, -0.8, lev - 1.2), P(half, -0.8, crest), P(-half, -0.8, crest), [-fx, 0, -fz], uvw);
  let f = 0.8, y = crest;
  for (let k = 0; k < 4; k++) {
    const y1 = y - 0.17, f1 = f + 0.9;
    acc.quad(P(-half, f, y1), P(half, f, y1), P(half, f, y), P(-half, f, y), [fx, 0, fz], uvw);
    acc.quad(P(-half, f, y1), P(half, f, y1), P(half, f1, y1), P(-half, f1, y1), UP, uvw);
    // white water pouring over the steps where the low-water channel crosses (the OSM centreline is near the middle)
    foam.quad(P(a0 - 7, f - 0.02, y + 0.03), P(a0 + 7, f - 0.02, y + 0.03), P(a0 + 7, f + 0.25, y1 + 0.04), P(a0 - 7, f + 0.25, y1 + 0.04), [fx, 1, fz]);
    foam.quad(P(a0 - 7, f + 0.25, y1 + 0.04), P(a0 + 7, f + 0.25, y1 + 0.04), P(a0 + 7, f1, y1 + 0.04), P(a0 - 7, f1, y1 + 0.04), UP);
    f = f1; y = y1;
  }
  foam.quad(P(a0 - 8, f, lev + 0.03), P(a0 + 8, f, lev + 0.03), P(a0 + 8, f + 3, lev + 0.03), P(a0 - 8, f + 3, lev + 0.03), UP);
  // training walls at both ends
  for (const a of [-half, half]) {
    const [gx, , gz] = P(a, 0, 0), g = Math.min(heightAt(gx, gz), lev);
    const y0 = g - 1, y1 = lev + 1.6;
    for (const [o0, o1] of [[-0.3, 0.3]]) {
      acc.quad(P(a + o0, -4, y0), P(a + o0, 6, y0), P(a + o0, 6, y1), P(a + o0, -4, y1), [-dx, 0, -dz]);
      acc.quad(P(a + o1, -4, y0), P(a + o1, 6, y0), P(a + o1, 6, y1), P(a + o1, -4, y1), [dx, 0, dz]);
      acc.quad(P(a + o0, -4, y1), P(a + o1, -4, y1), P(a + o1, 6, y1), P(a + o0, 6, y1), UP);
      acc.quad(P(a + o0, -4, y0), P(a + o1, -4, y0), P(a + o1, -4, y1), P(a + o0, -4, y1), [-fx, 0, -fz]);
      acc.quad(P(a + o0, 6, y0), P(a + o1, 6, y0), P(a + o1, 6, y1), P(a + o0, 6, y1), [fx, 0, fz]);
    }
    const [wx, , wz] = P(a, 1, 0);
    world.addStatic(new world.Box(wx, wz, 0.3, 5, Math.atan2(-dz, dx), y0, y1, 'wall'));
  }
  acc.flush(B, Mt.concrete);
  foam.flush(B, Mt.foam, null, { noCast: true });
  addHole([cx, cz], half + 1, 6, dx, dz);
  return { x: cx, z: cz, lev };
}
