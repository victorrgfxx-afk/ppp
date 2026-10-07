import * as THREE from 'three';
import { GEO, heightAt, speciesAt } from './data.js';
import { M } from '../materials.js';
import { brambleTexture, starGeo, addShortGrass } from './hillwood.js';
import { TREE_T, TREE_TYPES, addForestMix } from './trees.js';
import { WOOD } from './urcus_mask.js';

// The user's clip IMG_0725 (an iPhone 13 Pro's 3x lens, 11 October 2025, 16:11), on the lane over the hill from Strada
// Măgurii (OSM way 198810461, 1.3 km of narrow asphalt) where it runs through the wood above the meadow, 1 km from the
// junction: the user's pin, 45.1146323 N 25.6952029 E, is on the lane's edge there. Walking north-east (towards the
// junction, slightly uphill), with the sun at 16:11 behind (the bushes and the yellow crowns lit from the front, as the
// clip has them).
// Measured in the clip's first frame (27.5 deg over its long side) and fitted on the lane: the man 15 m from the lens, the
// concrete block on the right edge where a thicket starts (the dark clump on the aerial, by the road on the meadow's side),
// the three walkers ~75 m on, where the lane bends gently right, seen from the waist up over that thicket (the lines of
// sight cut across the inside of the bend). As the clip shows it: worn asphalt, a mown verge on the right, the thicket,
// the wood on both sides: broadleaves gone yellow and orange, oaks still green.
// Positions along the lane: s metres from the junction (the clip walks towards smaller s), o metres right of the centre
// line facing larger s (so o > 0 is north-west, on the clip's left).
export const LANE_ID = '198810461';
const LANE_W = 4.5;
// the clip's moment ([s, o] on the lane as traced), fitted in the game's own camera and ground to the clip's first frame
// (2160 x 3840), on the ground as geo/build_geo.py corrects it from this same frame (CLIP_LANE): the lens (1.6 m up, the
// player's eye), the man (15 m on: 940 px tall), the three walkers (hikers.js; their heads within 4 px of the clip's, the
// block within 10 px): abreast ~75 m on, one at the asphalt's right edge, two on the bank right of it among the bushes;
// the lines of sight to their hips stay clear
export const CLIP = { cam: [1051.5, 0.8], eye: 1.6, man: [1036.5, -0.4], walkers: [[976, -1.25], [977.5, -3.5], [976, -4.5]], hip: 0.95, block: 1021 };
// the walkers' path along the bank (hikers.js): off the asphalt between s 994 and 988, back onto it between 974 and 964
export const BANK = [994, 988, 974, 964];
// the thicket on the meadow's side, from the block on: s range, out to o (negative: the clip's right), as the aerial has
// the clump (none on the bank path)
const THICKET = { s0: 984, s1: 1021, out: -16 };
// the stretch of the lane that is the clip's place: no generated utility poles here (none in the clip), its verges mown
const PLACE = { s0: 880, s1: 1200 };
// The asphalt as the aerial shows it (Esri World Imagery z18): the mapped line runs up to 3.3 m south-east of it through
// the wood; the bright grey band's centre, traced every 5 m from s = 860 m to 1225 m (metres to the right of the mapped
// line facing larger s, smoothed over 25 m), moves the lane onto it.
const TRACE = { s0: 860, ds: 5, o: [0.0, 0.2, 0.4, 0.5, 0.6, 0.6, 0.7, 0.9, 1.1, 1.4, 1.6, 1.8, 2.2, 2.6, 2.9, 3.1, 3.3, 3.1, 2.9, 2.7, 2.6,
  2.5, 2.6, 2.7, 2.8, 2.8, 2.7, 2.5, 2.3, 2.1, 1.9, 1.8, 1.5, 1.1, 0.7, 0.3, -0.1, -0.3, -0.4, -0.5, -0.4, -0.3, -0.1, 0.1, 0.3, 0.4,
  0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.7, 0.8, 1.0, 1.2, 1.3, 1.4, 1.5, 1.3, 1.1, 0.9, 0.7, 0.6, 0.8, 1.1, 1.4, 1.7, 1.9, 2.0, 1.5,
  1.1, 0.6, 0.0] };
let L = null;
function lane() {
  if (L) return L;
  const r = (GEO.roads || []).find(q => q.id === LANE_ID);
  if (!r) return null;
  let P = []; for (let i = 0; i < r.p.length; i += 2) P.push([r.p[i], r.p[i + 1]]);
  if (!r.traced) {
    // onto the aerial: every vertex of the stretch moved across by the traced offset at its s (resampled every 5 m there)
    const S0 = [0]; for (let i = 1; i < P.length; i++) S0.push(S0[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const at = (t) => { let i = 0; while (i < P.length - 2 && S0[i + 1] < t) i++; const u = (t - S0[i]) / ((S0[i + 1] - S0[i]) || 1); return [P[i][0] + (P[i + 1][0] - P[i][0]) * u, P[i][1] + (P[i + 1][1] - P[i][1]) * u, P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]]; };
    const off = (t) => { const k = (t - TRACE.s0) / TRACE.ds, i = Math.floor(k); return i < 0 || i >= TRACE.o.length - 1 ? 0 : TRACE.o[i] + (TRACE.o[i + 1] - TRACE.o[i]) * (k - i); };
    const s1 = TRACE.s0 + TRACE.ds * (TRACE.o.length - 1), Q = [];
    for (let i = 0; i < P.length; i++) if (S0[i] < TRACE.s0) Q.push(P[i]);
    for (let t = TRACE.s0; t <= s1; t += TRACE.ds) { const [x, z, ex, ez] = at(t), l = Math.hypot(ex, ez) || 1, o = off(t); Q.push([x - ez / l * o, z + ex / l * o]); }
    for (let i = 0; i < P.length; i++) if (S0[i] > s1) Q.push(P[i]);
    P = Q; r.p = Q.flat(); r.traced = true;
  }
  const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return (L = { r, P, S });
}
// the lane at s, o: the point and the heading towards larger s (unit), smoothed over the bends (+-3 m)
export function laneAt(s, o = 0) {
  const { P, S } = lane();
  const at = (t) => {
    t = Math.max(0, Math.min(S[S.length - 1], t));
    let i = 0; while (i < S.length - 2 && S[i + 1] < t) i++;
    const u = (t - S[i]) / ((S[i + 1] - S[i]) || 1);
    return [P[i][0] + (P[i + 1][0] - P[i][0]) * u, P[i][1] + (P[i + 1][1] - P[i][1]) * u];
  };
  const [x, z] = at(s), a = at(s - 3), b = at(s + 3), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const hx = (b[0] - a[0]) / l, hz = (b[1] - a[1]) / l;           // towards larger s; its right is (-hz, hx)
  return { x: x - hz * o, z: z + hx * o, hx, hz };
}
export const laneLength = () => lane()?.S.at(-1) ?? 0;
// the roads around the place (any point within 450 m of it)
let NR = null;
function nearRoads() {
  if (NR) return NR;
  const c = laneAt(1040);
  return (NR = (GEO.roads || []).filter(r => { if (r.p.length < 4) return false; for (let k = 0; k < r.p.length; k += 2) if (Math.abs(r.p[k] - c.x) < 450 && Math.abs(r.p[k + 1] - c.z) < 450) return true; return false; }));
}
// how far (x, z) is from a road's centre line (Infinity when more than 120 m from all of its points)
function roadDist(r, x, z) {
  let m = Infinity;
  for (let k = 0; k + 3 < r.p.length; k += 2) {
    const ax = r.p[k], az = r.p[k + 1], ex = r.p[k + 2] - ax, ez = r.p[k + 3] - az, l2 = ex * ex + ez * ez || 1;
    if (Math.abs(x - ax) > 120 || Math.abs(z - az) > 120) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    m = Math.min(m, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return m;
}
// the lane's own frame on its stretch s0..s1: (x, z) -> { s, d, o } (the nearest point of the centre line, how far from
// it, and on which side: o > 0 right of it facing larger s)
function laneLocal(x, z, s0, s1) {
  const { P, S } = lane();
  let best = null;
  for (let i = 0; i + 1 < P.length; i++) {
    if (S[i + 1] < s0 || S[i] > s1) continue;
    const ax = P[i][0], az = P[i][1], ex = P[i + 1][0] - ax, ez = P[i + 1][1] - az, l = S[i + 1] - S[i] || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (l * l))), dx = x - ax - ex * t, dz = z - az - ez * t, d = Math.hypot(dx, dz);
    if (!best || d < best.d) best = { s: S[i] + t * l, d, o: (dx * -ez + dz * ex) / l >= 0 ? d : -d };
  }
  return best;
}
// the clip's lines of sight, from the lens to each walker's hips: at (x, z), on the nearest of them, how far along it is
// (d, metres; t, 0-1), how far off it in plan (lat, metres, + to the right) and how high it passes over the ground there
// (h); point(d, lat) and len along the middle one
function sight() {
  const C = laneAt(...CLIP.cam), cy = heightAt(C.x, C.z) + CLIP.eye;
  const lines = CLIP.walkers.map(w => { const H = laneAt(...w), ex = H.x - C.x, ez = H.z - C.z; return { ex, ez, l: Math.hypot(ex, ez), hy: heightAt(H.x, H.z) + CLIP.hip }; });
  const on = (L, x, z) => { const t = ((x - C.x) * L.ex + (z - C.z) * L.ez) / (L.l * L.l); return { t, d: t * L.l, lat: ((x - C.x) * L.ez - (z - C.z) * L.ex) / L.l, L }; };
  const best = (x, z) => { let b = null; for (const L of lines) { const q = on(L, x, z), k = q.t > 0.04 && q.t < 0.97 ? Math.abs(q.lat) : 1e9 + Math.abs(q.lat); if (!b || k < b.k) b = { ...q, k }; } return b; };
  const at = (x, z) => { const q = best(x, z); return { t: q.t, d: q.d, lat: q.lat, h: cy + (q.L.hy - cy) * q.t - heightAt(x, z) }; };
  at.near = (x, z, w) => { const q = best(x, z); return q.t > 0.04 && q.t < 0.97 && Math.abs(q.lat) < w; };
  const M = lines[1];
  at.point = (d, lat) => [C.x + (M.ex * d + M.ez * lat) / M.l, C.z + (M.ez * d - M.ex * lat) / M.l];
  at.len = M.l;
  return at;
}
const inThicket = (l) => l && l.s > THICKET.s0 && l.s < THICKET.s1 && l.o < -(LANE_W / 2 + 0.4) && l.o > THICKET.out;
// the bank path, as the walkers take it (hikers.js: from their place on the asphalt to their place at the clip's moment)
export function bankWeight(s) {
  const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  return sm(BANK[0], BANK[1], s) * (1 - sm(BANK[2], BANK[3], s));
}
export const ROAD_O = [-0.8, 0.1, 0.9];                                       // the walkers' places on the asphalt
let PATHS = null;
function onPath(x, z, r) {
  if (!PATHS) { PATHS = []; for (let k = 0; k < 3; k++) for (let s = BANK[3] - 2; s <= BANK[0] + 2; s += 0.75) { const b = bankWeight(s); if (b > 0.02) { const p = laneAt(s, ROAD_O[k] + (CLIP.walkers[k][1] - ROAD_O[k]) * b); PATHS.push([p.x, p.z]); } } }
  return PATHS.some(([px, pz]) => Math.abs(px - x) < r && Math.abs(pz - z) < r && Math.hypot(px - x, pz - z) < r);
}

// The wood, as the aerial has it (urcus_mask.js; the game's stand raster had most of it missing south of the lane): its
// cover and kind written into the raster here, none on the lines of sight or in the thicket (bushes there, below). And its
// trees, as in the clip and as such a Subcarpathian wood is: beech turning orange and yellow, hornbeam yellow, birches,
// oaks still green, some beech still green (fading back to the map's own mix 250-420 m out). No conifers: the clip shows
// none, and neither do the 10 m maps (CLC+ 2021: no needle-leaved pixel within 420 m; the genus map 2025: beech and oak
// stands), so the aerial's dark crowns are green oaks and the bramble-grown thickets, not spruce. Where the genus map
// has oak leading, oaks take a bigger share.
function stampWood(S) {
  const B = GEO.forestBits, F = GEO.forest;
  if (!B || !F) return;
  const bits = (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const codes = bits(WOOD.codes), valid = bits(WOOD.valid);
  for (let j = 0; j < WOOD.nj; j++) for (let i = 0; i < WOOD.ni; i++) {
    const k = j * WOOD.ni + i;
    if (!((valid[k >> 3] >> (k & 7)) & 1)) continue;
    const gi = WOOD.gi0 + i, gj = WOOD.gj0 + j, x = -8000 + 5 * gi, z = -8000 + 5 * gj;
    if (gi < 0 || gj < 0 || gi >= F.n || gj >= F.n) continue;
    if ((GEO.holes || []).some(h => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1 && h.test(x, z, 2))) continue;   // kept clear by another module
    let c = (codes[k >> 2] >> ((k & 3) << 1)) & 3;
    const l = laneLocal(x, z, CLIP.walkers[2][0] - 60, CLIP.cam[0] + 30);
    if (S.near(x, z, 7) || inThicket(l)) c = 0;
    const g = gj * F.n + gi;
    B[g >> 2] = (B[g >> 2] & ~(3 << ((g & 3) << 1))) | (c << ((g & 3) << 1));
  }
  const C = laneAt(1040), R0 = 250, R1 = 420;
  const T = TREE_T;
  addForestMix((x, z, ty, edge, code, h1, h2) => {
    const d = Math.hypot(x - C.x, z - C.z);
    if (d > R1 || h1 > (d < R0 ? 1 : (R1 - d) / (R1 - R0))) return ty;
    const g = speciesAt(x, z) & 15, u = h2;
    if (g === 4 || g === 5 || g === 6 || g === 12) return ty;                          // a mapped conifer stand keeps its own
    if (edge) return u < 0.45 ? T.autumn : u < 0.65 ? T.autumnBirch : u < 0.85 ? T.edge : T.oak;
    if (g === 2) return u < 0.2 ? T.autumnBeechF : u < 0.4 ? T.autumnHornbeamF : u < 0.47 ? T.autumnBirch : u < 0.55 ? T.beech : T.oakF;
    return u < 0.36 ? T.autumnBeechF : u < 0.6 ? T.autumnHornbeamF : u < 0.7 ? T.autumnBirch : u < 0.82 ? T.beech : T.oakF;
  });
}

// the thicket ([x, z, type, scale], seeded): hazel, hawthorn and young trees in a clump 2-5 m tall, no taller than the lines
// of sight to the walkers where they cross it
function thicket() {
  let a = 11;
  const R = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const out = [];
  for (let s = THICKET.s0 + 1; s < THICKET.s1; s += 1.6 + R() * 0.8) for (let o = -(LANE_W / 2 + 1.4); o > THICKET.out + 1; o -= 1.8 + R() * 0.8) {
    const p = laneAt(s + (R() - 0.5) * 1.2, o + (R() - 0.5) * 0.8), edge = Math.min(1, (s - THICKET.s0) / 5, (THICKET.s1 - s) / 4, (o - THICKET.out) / 4);
    if (edge < 0.15 || onPath(p.x, p.z, 1.8)) continue;
    out.push(R() < 0.78 ? [p.x, p.z, 'shrubTall', (0.9 + 0.7 * edge) * (0.8 + R() * 0.4)] : [p.x, p.z, 'edge', (0.32 + 0.12 * edge) * (0.8 + R() * 0.4)]);
  }
  // the clump's back is trees (the aerial: tall crowns on its far side; the clip: big yellow crowns over the thicket on
  // the right), and more stand at the meadow's edge behind the walkers (the clip: a dark green mass right behind them,
  // yellow crowns above): beech and hornbeam in autumn colour, a few still green, a birch
  const tall = () => { const u = R(); return u < 0.45 ? 'autumn' : u < 0.62 ? 'autumnBirch' : u < 0.82 ? 'edge' : 'hornbeam'; };
  for (let s = THICKET.s0 + 4; s < THICKET.s1 - 2; s += 4 + R() * 2.5) { const p = laneAt(s, THICKET.out + 2 + R() * 6); if (!onPath(p.x, p.z, 3)) out.push([p.x, p.z, tall(), 0.9 + R() * 0.35]); }
  for (let k = 0; k < 9; k++) {
    const s = BANK[3] - 6 + R() * 20, p = laneAt(s, -(7 + R() * 9));
    if (!onPath(p.x, p.z, 3.5)) out.push([p.x, p.z, k < 4 ? (R() < 0.6 ? 'edge' : 'hornbeam') : tall(), 0.85 + R() * 0.4]);
  }
  return out;
}
export function prepareUrcus() {
  const ln = lane();
  if (!ln) return false;
  ln.r.w = LANE_W;
  const S = sight();
  stampWood(S);
  // the lines of sight to the walkers (hikers.js) stay clear from their hips to their heads: no trunk near them, no crown
  // across them (the crown as trees.js builds it: cards up to 0.9 crown wide around an ellipsoid, crown radius across,
  // vr up and down from H*bole + 0.65*vr, so the leaves reach ~0.6 crown past it; +10% for the builder's jitter), the
  // bushes under them
  const blocks = (ti, sc, x, z) => {
    const T = TREE_TYPES[ti];
    if (!T || !S.near(x, z, 14)) return false;
    const q = S(x, z), lat = Math.abs(q.lat);
    if (lat < 2.4) return true;
    if (T.conifer || T.pine) return lat < T.crown * sc * 1.2 + 0.5;
    const bole = T.bole ?? 0.4, vr = T.H * 0.34 * (1 - bole) / 0.6, cy = (T.H * bole + vr * 0.65) * sc, ry = (vr * 1.1 + 0.6 * T.crown) * sc;
    const y = Math.max(q.h - 0.3, Math.min(q.h + 1.0, cy)), f = 1 - ((y - cy) / ry) ** 2;
    return f > 0 && lat < T.crown * sc * (1.15 * Math.sqrt(f) + 0.6);
  };
  const LOW = { shrubTall: [3.7, 2.9], edge: [16.4, 8.5] };                   // (top and reach at scale 1, by the same rule)
  const fit = ([x, z, ty, sc]) => {
    if (!(ty === 'shrubTall' || (ty === 'edge' && sc < 0.6))) return blocks(TREE_T[ty], sc * 1.1, x, z) ? 0 : sc;
    const q = S(x, z);
    if (q.t < 0.04 || q.t > 0.97) return sc;
    const [H, cr] = LOW[ty];
    if (Math.abs(q.lat) > cr * sc + 0.6) return sc;
    const m = (q.h - 0.12) / H;
    return m < 0.2 ? 0 : Math.min(sc, m);
  };
  const TREES = thicket().map(t => [t[0], t[1], t[2], fit(t)]).filter(t => t[3] > 0);
  // the grass (hillwood.js): mown 3 m out from the asphalt along the place, short under the thicket (a 1 m raster)
  {
    const bx = []; for (let s = PLACE.s0; s <= PLACE.s1; s += 4) for (const o of [-20, 20]) { const p = laneAt(s, o); bx.push([p.x, p.z]); }
    const x0 = Math.floor(Math.min(...bx.map(p => p[0]))), z0 = Math.floor(Math.min(...bx.map(p => p[1])));
    const W = Math.ceil(Math.max(...bx.map(p => p[0]))) - x0 + 1, H = Math.ceil(Math.max(...bx.map(p => p[1]))) - z0 + 1, G = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = x0 + i, z = z0 + j, l = laneLocal(x, z, PLACE.s0 - 4, PLACE.s1 + 4);
      if ((l && l.s > PLACE.s0 && l.s < PLACE.s1 && l.d < LANE_W / 2 + 3) || inThicket(l) || onPath(x, z, 1.0)) G[j * W + i] = 1;
    }
    addShortGrass((x, z) => { const i = Math.round(x - x0), j = Math.round(z - z0); return i >= 0 && j >= 0 && i < W && j < H && G[j * W + i] === 1; });
  }
  // the generated village poles along this lane: none through the wood (the clip has no line)
  if (GEO.poles) {
    const runs = [];
    for (const run of GEO.poles) {
      let cur = [];
      for (const p of run.p) {
        const l = laneLocal(p[0], p[1], PLACE.s0 - 40, PLACE.s1 + 40);
        if (l && l.d < 9 && l.s > PLACE.s0 && l.s < PLACE.s1) { if (cur.length > 1) runs.push({ ...run, p: cur }); cur = []; }
        else cur.push(p);
      }
      if (cur.length > 1) runs.push({ ...run, p: cur });
    }
    GEO.poles = runs;
  }
  const T = GEO.trees;
  if (T) {
    const n = T.n + TREES.length, out = { n, x: new Float32Array(n), z: new Float32Array(n), t: new Uint8Array(n), s: new Float32Array(n), keep: new Uint8Array(n) };
    out.x.set(T.x.subarray(0, T.n)); out.z.set(T.z.subarray(0, T.n)); out.t.set(T.t.subarray(0, T.n)); out.s.set(T.s.subarray(0, T.n));
    if (T.keep) out.keep.set(T.keep.subarray(0, T.n));
    for (let i = 0; i < T.n; i++) if (blocks(T.t[i], T.s[i] * 1.1, T.x[i], T.z[i])) out.s[i] = 0;    // (the mapped ones across them: not built)
    out.keep.fill(1, T.n);
    TREES.forEach(([x, z, ty, sc], k) => { out.x[T.n + k] = x; out.z[T.n + k] = z; out.t[T.n + k] = TREE_T[ty]; out.s[T.n + k] = sc; });
    GEO.trees = out;
  }
  return true;
}

// the brambles at the thicket's foot and along the verge's outer edge, and the concrete block where the thicket starts
export function buildUrcus(B, world) {
  if (!lane()) return null;
  let a = 7;
  const R = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const bramble = new THREE.MeshStandardMaterial({ map: brambleTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9 });
  const star = starGeo(1.4), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), S = sight();
  const roads = nearRoads();
  const clear = (x, z) => roads.every(r => roadDist(r, x, z) > (r.id === LANE_ID ? LANE_W / 2 + 0.35 : r.w / 2 + 1));
  const boxes = new Map();
  // a mound of arching canes: two crossed sets of cards at random angles, h tall, w across; under the clip's lines of
  // sight where they cross it (the walkers seen from the waist up)
  const mound = (x, z, h, w, cast) => {
    if (!clear(x, z) || onPath(x, z, 0.5 + 0.45 * w)) return;
    const s = S(x, z);                                                          // (the cards reach 0.84 w out, 1.15 h up)
    if (s.t > 0.04 && s.t < 0.97 && Math.abs(s.lat) < 0.84 * w + 0.4) h = Math.min(h, (s.h - 0.1) / 1.15);
    if (h < 0.35) return;
    for (let c = 0; c < 2; c++) {
      m4.compose(new THREE.Vector3(x, heightAt(x, z) - 0.06, z), q.setFromEuler(e.set((R() - 0.5) * 0.25, R() * 6.283, (R() - 0.5) * 0.25)), new THREE.Vector3(w * (0.8 + R() * 0.4), h * (0.85 + R() * 0.3), w * (0.8 + R() * 0.4)));
      B.geo(bramble, star, m4, null, { noCast: !cast });
    }
    const key = Math.round(x / 3) + ',' + Math.round(z / 3);
    if (h > 0.8 && !boxes.has(key) && roadDist(lane().r, x, z) > LANE_W / 2 + 1.1) boxes.set(key, [x, z]);     // (none over the asphalt)
  };
  // the thicket's front and inside: rows of mounds from the road's edge (no verge from the block on)
  for (let s = THICKET.s0; s < THICKET.s1 + 2; s += 0.6 + R() * 0.5) {
    const edge = Math.min(1, (s - THICKET.s0) / 3, (THICKET.s1 + 2 - s) / 3);
    for (let k = 0; k < 4; k++) {
      if (R() < 0.15) continue;
      const p = laneAt(s + (R() - 0.5) * 0.8, -(LANE_W / 2 + 0.6 + k * 1.4 + R() * 1.0));
      mound(p.x, p.z, (0.8 + 0.3 * k) * (0.55 + 0.45 * edge) + R() * 0.5, 1.3 + R() * 1.3, k > 0);
    }
  }
  // past the mown verge on the meadow's side, low brambles in its long grass, from the man's place to the thicket
  for (let s = THICKET.s1 + 2; s < CLIP.cam[0] + 8; s += 1.4 + R() * 1.6) {
    if (R() < 0.35) continue;
    const p = laneAt(s, -(LANE_W / 2 + 3.2 + R() * 2.5));
    mound(p.x, p.z, 0.5 + R() * 0.5, 1.0 + R() * 1.0, false);
  }
  for (const [x, z] of boxes.values()) world.addStatic(new world.Box(x, z, 1.1, 1.1, 0, -1e4, 1e4, 'bramble'));
  // the block: a culvert's concrete head, 30 x 60 cm, 60 cm high, on the right edge where the thicket starts
  const b = laneAt(CLIP.block, -(LANE_W / 2 + 0.22)), g = new THREE.BoxGeometry(0.3, 0.66, 0.6);
  const y = heightAt(b.x, b.z);
  B.geo(M.concrete, g, new THREE.Matrix4().makeRotationY(Math.atan2(b.hx, b.hz)).setPosition(b.x, y + 0.27, b.z));
  world.addStatic(new world.Box(b.x, b.z, 0.15, 0.3, Math.atan2(b.hx, b.hz), y - 1, y + 0.6, 'block'));
  return null;
}
