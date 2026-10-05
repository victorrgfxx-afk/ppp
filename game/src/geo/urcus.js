import * as THREE from 'three';
import { GEO, heightAt, gridHeight, addFineZone } from './data.js';
import { M } from '../materials.js';
import { brambleTexture, starGeo, addShortGrass } from './hillwood.js';
import { TREE_T, TREE_TYPES } from './trees.js';

// The lane up to the cross from Strada Măgurii (OSM way 198810461, 1.3 km of narrow asphalt over the hill), its first
// climb: the user's clip IMG_0725 (an iPhone 13 Pro's 3x lens, 11 October 2025, 16:11). The clip has no position in it;
// this is where it fits: the lane climbs at 10-15% from the junction towards the cross, bends hard left 45 m up and back
// right 30 m further, and the afternoon sun stands where the clip has it (ahead and to the right, the yellow crowns lit
// through). Measured in the clip's first frame (27.5 deg over its long side): the man 15 m from the lens, a concrete block
// 31 m away on the right edge where the lane turns left, the three walkers 75-81 m away on the lane's next leg, seen from
// the waist up over the thicket inside the S. As the clip shows it: 4 m of worn asphalt (OSM gives the residential default,
// 5.6 m), a mown verge on the right, then brambles and bushes, the thicket filling the inside of the S, tall trees in yellow
// leaf beyond it, a darker wood on the left.
export const LANE_ID = '198810461';
const LANE_W = 4.0;
// the clip's moment ([s, o] on the lane): the lens (1.6 m up, the player's eye), the man, the three walkers (hikers.js;
// the lines of sight to their hips stay clear)
export const CLIP = { cam: [15, 0.2], eye: 1.6, man: [30, 0], walkers: [[105.6, -0.6], [108.2, 0.3], [112.4, 0]], hip: 0.95, block: 48 };
let L = null;
function lane() {
  if (L) return L;
  const r = (GEO.roads || []).find(q => q.id === LANE_ID);
  if (!r) return null;
  const P = []; for (let i = 0; i < r.p.length; i += 2) P.push([r.p[i], r.p[i + 1]]);
  const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return (L = { r, P, S });
}
// the lane at s, o: the point and the heading uphill (unit), smoothed over the bends (+-3 m)
export function laneAt(s, o = 0) {
  const { P, S } = lane();
  const at = (t) => {
    t = Math.max(0, Math.min(S[S.length - 1], t));
    let i = 0; while (i < S.length - 2 && S[i + 1] < t) i++;
    const u = (t - S[i]) / ((S[i + 1] - S[i]) || 1);
    return [P[i][0] + (P[i + 1][0] - P[i][0]) * u, P[i][1] + (P[i + 1][1] - P[i][1]) * u];
  };
  const [x, z] = at(s), a = at(s - 3), b = at(s + 3), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const hx = (b[0] - a[0]) / l, hz = (b[1] - a[1]) / l;           // uphill; its right is (-hz, hx)
  return { x: x - hz * o, z: z + hx * o, hx, hz };
}
export const laneLength = () => lane()?.S.at(-1) ?? 0;
// the roads around the climb (any point within 250 m of its middle)
let NR = null;
function nearRoads() {
  if (NR) return NR;
  const c = laneAt(60);
  return (NR = (GEO.roads || []).filter(r => { if (r.p.length < 4) return false; for (let k = 0; k < r.p.length; k += 2) if (Math.abs(r.p[k] - c.x) < 250 && Math.abs(r.p[k + 1] - c.z) < 250) return true; return false; }));
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

// the lane's own frame on its stretch s0..s1: (x, z) -> { s, d } (the nearest point of the centre line, how far from it)
function laneLocal(x, z, s0, s1) {
  const { P, S } = lane();
  let best = null;
  for (let i = 0; i + 1 < P.length; i++) {
    if (S[i + 1] < s0 || S[i] > s1) continue;
    const ax = P[i][0], az = P[i][1], ex = P[i + 1][0] - ax, ez = P[i + 1][1] - az, l = S[i + 1] - S[i] || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (l * l))), d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (!best || d < best.d) best = { s: S[i] + t * l, d };
  }
  return best;
}
// The ground under the clip. The 30 m DEM has the climb at an even 12-14%; in the clip the lane is gentler for the first
// 15 m above the lens (~8%), steeper past the man (~15%) and steeper again up the S to the walkers: with the DEM the man's
// feet stand 1.9 deg too high against the block and the walkers, and the walkers' heads 0.6 deg too low. The lane's
// ground is lowered by up to 0.5 m from 18 to 55 m (a cutting, as hill lanes have) and raised by up to 0.8 m from 80 to
// 135 m (1 m terrain, fading out 9-15 m from the centre line): the man's feet, the block and the walkers' heads then land
// where the clip has them, to ~0.3 deg ([s, metres]; smooth between the points).
const PROFILE = [[18, 0], [27, -0.5], [36, -0.5], [55, 0], [80, 0], [100, 0.8], [115, 0.8], [135, 0]], FADE = [9, 15];
function profileLane() {
  const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const dh = (s) => { for (let i = 0; i + 1 < PROFILE.length; i++) { const [s0, h0] = PROFILE[i], [s1, h1] = PROFILE[i + 1]; if (s >= s0 && s <= s1) return h0 + (h1 - h0) * sm(s0, s1, s); } return 0; };
  const S0 = PROFILE[0][0], S1 = PROFILE.at(-1)[0];
  const bx = []; for (let s = S0 - 2; s <= S1 + 2; s += 2) for (const o of [-FADE[1] - 1, FADE[1] + 1]) { const p = laneAt(s, o); bx.push([p.x, p.z]); }
  const at = (x, z) => { const l = laneLocal(x, z, S0 - 8, S1 + 8); return l && l.s > S0 && l.s < S1 && l.d < FADE[1] ? l : null; };
  addFineZone({ x0: Math.min(...bx.map(p => p[0])), x1: Math.max(...bx.map(p => p[0])), z0: Math.min(...bx.map(p => p[1])), z1: Math.max(...bx.map(p => p[1])),
    test: (x, z) => !!at(x, z),
    h: (x, z) => { const g = gridHeight(GEO, x, z), l = at(x, z); return l ? g + dh(l.s) * (1 - sm(FADE[0], FADE[1], l.d)) : g; } });
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
// the trees and bushes ([x, z, type, scale], seeded): a wood on the left all the way up; on the right the mown verge, bushes
// and brambles, the tall yellow trees set back past the man's stretch (the clip has the near road in sun: at 16:11 their
// shadows fall back and to the left); the thicket over the inside of the S, no taller than the line of sight to the
// walkers where it crosses it; big crowns past the walkers filling the clip's top, dark green in the middle, yellow around
function trees(onLane) {
  let a = 11;
  const R = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const pick = (yellow) => R() < yellow ? (R() < 0.75 ? 'autumn' : 'autumnBirch') : (R() < 0.6 ? 'edge' : R() < 0.5 ? 'hornbeam' : 'oak');
  const out = [], L = (s, o, ty, sc) => { const p = laneAt(s, o); out.push([p.x, p.z, ty, sc]); };
  for (let s = 10; s < 100; s += 4.2 + R() * 1.6) L(s, -(4.1 + R() * 2.4), pick(s > 38 ? 0.45 : 0.15), 0.9 + R() * 0.25);   // left, by the road
  for (let s = 12; s < 104; s += 5 + R() * 2) L(s, -(8.5 + R() * 3), pick(0.3), 0.95 + R() * 0.3);                          // left, behind
  for (let s = 20; s < 46; s += 2.4 + R() * 1.4) L(s, 4.4 + R() * 2.2, 'shrubTall', 0.9 + R() * 0.6);                         // right: bushes past the verge
  for (let s = 52; s < 100; s += 3.6 + R() * 1.4) L(s, 8 + R() * 3, pick(0.7), 1.0 + R() * 0.3);                            // right, behind the brambles
  for (let s = 40; s < 70; s += 2.6 + R() * 1.2) R() < 0.5 ? L(s, 5.6 + R() * 1.6, 'edge', 0.4 + R() * 0.15) : L(s, 4.8 + R() * 1.6, 'shrubTall', 1.4 + R() * 0.7);   // young trees in the thicket
  for (let s = 54; s < 100; s += 4.5 + R() * 2) L(s, 12 + R() * 5, pick(0.6), 1.05 + R() * 0.3);                             // and the slope beyond
  // the inside of the S, where the line of sight crosses it: bushes, capped under the line near it
  const S = sight();
  for (let d = 34; d < 67; d += 1.7 + R() * 0.6) for (let lat = -9; lat < 10; lat += 1.8 + R() * 0.7) {
    const [x, z] = S.point(d + (R() - 0.5) * 1.2, lat), q = S(x, z);
    if (onLane(x, z, LANE_W / 2 + 0.9)) continue;
    const cap = Math.abs(q.lat) < 4 ? q.h - 0.12 : 2.2 + R() * 2.4;                   // (shrub: leaves up to ~3.7 m at scale 1)
    if (cap < 0.7) continue;
    out.push([x, z, 'shrubTall', Math.min(cap / 3.7, 0.55 + R() * 0.9)]);
  }
  // past the walkers: a wall of leaves right behind them (trees in the open keep their branches down), and the crowns
  // over them in the clip
  for (let k = 0; k < 14; k++) {
    const d = S.len + 6 + R() * 14, lat = (R() - 0.5) * 16, [x, z] = S.point(d, lat);
    if (onLane(x, z, LANE_W / 2 + 2.5)) continue;
    out.push([x, z, R() < 0.7 ? 'edge' : 'hornbeam', 0.75 + R() * 0.35]);
  }
  for (let k = 0; k < 26; k++) {
    const d = S.len + 9 + R() * 34, lat = (R() - 0.5) * 34, [x, z] = S.point(d, lat);
    if (onLane(x, z, LANE_W / 2 + 2.5)) continue;
    out.push([x, z, Math.abs(lat) < 6 ? (R() < 0.6 ? 'oak' : 'edge') : pick(lat > 0 ? 0.8 : 0.45), 1.1 + R() * 0.35]);
  }
  return out;
}
export function prepareUrcus() {
  const ln = lane();
  if (!ln) return false;
  ln.r.w = LANE_W;
  profileLane();
  // (none on any road: 3 m off the lane's centre line anywhere along it, 2.5 m off the edge of any other)
  const roads = nearRoads();
  const onRoad = (x, z, own = 3.0) => roads.some(r => roadDist(r, x, z) < (r === ln.r ? own : r.w / 2 + 2.5));
  // the clip's lines of sight to the walkers (hikers.js) stay clear from their hips to their heads: no trunk near them, no
  // crown across them (the crown as trees.js builds it: cards up to 0.9 crown wide around an ellipsoid, crown radius across,
  // vr up and down from H*bole + 0.65*vr, so the leaves reach ~0.6 crown past it; +10% for the builder's jitter), the
  // bushes under it
  const S = sight();
  const blocks = (ti, sc, x, z) => {
    const T = TREE_TYPES[ti];
    if (!T || !S.near(x, z, 14)) return false;
    const q = S(x, z);
    const lat = Math.abs(q.lat);
    if (lat < 2.4) return true;
    if (T.conifer || T.pine) return false;
    const bole = T.bole ?? 0.4, vr = T.H * 0.34 * (1 - bole) / 0.6, cy = (T.H * bole + vr * 0.65) * sc, ry = (vr * 1.1 + 0.6 * T.crown) * sc;
    const y = Math.max(q.h - 0.3, Math.min(q.h + 1.0, cy)), f = 1 - ((y - cy) / ry) ** 2;
    return f > 0 && lat < T.crown * sc * (1.15 * Math.sqrt(f) + 0.6);
  };
  const LOW = { shrubTall: [3.7, 2.9], edge: [16.4, 8.5] };                   // (top and reach at scale 1, by the same rule)
  const fit = ([x, z, ty, sc]) => {
    const low = ty === 'shrubTall' || (ty === 'edge' && sc < 0.6);
    if (!low) return blocks(TREE_T[ty], sc, x, z) ? 0 : sc;
    const q = S(x, z);
    if (q.t < 0.04 || q.t > 0.97) return sc;
    const [H, cr] = LOW[ty];
    if (Math.abs(q.lat) > cr * sc + 0.6) return sc;
    const m = (q.h - 0.12) / H;
    return m < 0.2 ? 0 : Math.min(sc, m);
  };
  const TREES = trees(onRoad).map(t => [t[0], t[1], t[2], fit(t)]).filter(([x, z, ty, sc]) => sc > 0 && !onRoad(x, z, ty === 'shrubTall' ? LANE_W / 2 + 0.9 : 3.0));
  // the grass (hillwood.js): mown 3 m out from the asphalt up to the cross, short under the thicket (a 1 m raster)
  {
    const bx = []; for (let s = 0; s <= 200; s += 4) for (const o of [-12, 12]) { const p = laneAt(s, o); bx.push([p.x, p.z]); }
    const x0 = Math.floor(Math.min(...bx.map(p => p[0]))), z0 = Math.floor(Math.min(...bx.map(p => p[1])));
    const W = Math.ceil(Math.max(...bx.map(p => p[0]))) - x0 + 1, H = Math.ceil(Math.max(...bx.map(p => p[1]))) - z0 + 1, G = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = x0 + i, z = z0 + j; const l = laneLocal(x, z, 0, 204); if ((l && l.s < 200 && l.d < LANE_W / 2 + 3) || S.near(x, z, 9)) G[j * W + i] = 1; }
    addShortGrass((x, z) => { const i = Math.round(x - x0), j = Math.round(z - z0); return i >= 0 && j >= 0 && i < W && j < H && G[j * W + i] === 1; });
  }
  const T = GEO.trees;
  if (T) {
    const n = T.n + TREES.length, out = { n, x: new Float32Array(n), z: new Float32Array(n), t: new Uint8Array(n), s: new Float32Array(n), keep: new Uint8Array(n) };
    out.x.set(T.x.subarray(0, T.n)); out.z.set(T.z.subarray(0, T.n)); out.t.set(T.t.subarray(0, T.n)); out.s.set(T.s.subarray(0, T.n));
    if (T.keep) out.keep.set(T.keep.subarray(0, T.n));
    for (let i = 0; i < T.n; i++) if (blocks(T.t[i], T.s[i] * 1.1, T.x[i], T.z[i])) out.s[i] = 0;    // (the mapped ones across it: not built)
    out.keep.fill(1, T.n);
    TREES.forEach(([x, z, ty, sc], k) => { out.x[T.n + k] = x; out.z[T.n + k] = z; out.t[T.n + k] = TREE_T[ty]; out.s[T.n + k] = sc; });
    GEO.trees = out;
  }
  return true;
}

// the brambles at the foot of the bushes, and the concrete block where the lane turns
export function buildUrcus(B, world) {
  if (!lane()) return null;
  let a = 7;
  const R = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const bramble = new THREE.MeshStandardMaterial({ map: brambleTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9 });
  const star = starGeo(1.4), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), S = sight();
  const roads = nearRoads();
  const clear = (x, z) => roads.every(r => roadDist(r, x, z) > (r.id === LANE_ID ? LANE_W / 2 + 0.35 : r.w / 2 + 1));
  const boxes = new Map();
  // a mound of arching canes: two crossed sets of cards at random angles, h tall, w across; under the clip's line of sight
  // where it crosses it (the walkers seen from the waist up)
  const mound = (x, z, h, w, cast) => {
    if (!clear(x, z)) return;
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
  // the right side past the mown verge (2.5 m of it by the man, none from the block on), lower towards the road
  for (let s = 22; s < 60; s += 0.55 + R() * 0.5) {
    const edge = Math.min(1, (s - 22) / 4, (60 - s) / 4), verge = 0.5 + 2.0 * Math.min(1, Math.max(0, (CLIP.block - s) / 6));
    for (let k = 0; k < 3; k++) {
      if (R() < 0.18) continue;
      const p = laneAt(s + (R() - 0.5) * 0.8, LANE_W / 2 + verge + k * 1.3 + R() * 1.1);
      mound(p.x, p.z, (0.75 + 0.35 * k) * (0.6 + 0.4 * edge) + R() * 0.55, 1.3 + R() * 1.3, k > 0);
    }
  }
  // the inside of the S, all across the lines of sight
  for (let d = 33; d < 70; d += 0.9 + R() * 0.5) for (let lat = -9; lat < 10; lat += 1.1 + R() * 0.6) {
    if (R() < 0.15) continue;
    const [x, z] = S.point(d + (R() - 0.5) * 0.8, lat);
    mound(x, z, 0.9 + R() * 1.1, 1.4 + R() * 1.4, true);
  }
  for (const [x, z] of boxes.values()) world.addStatic(new world.Box(x, z, 1.1, 1.1, 0, -1e4, 1e4, 'bramble'));
  // the block: a culvert's concrete head, 30 x 60 cm, 60 cm high, on the right edge where the lane turns left
  const b = laneAt(CLIP.block, LANE_W / 2 + 0.22), g = new THREE.BoxGeometry(0.3, 0.66, 0.6);
  const y = heightAt(b.x, b.z);
  B.geo(M.concrete, g, new THREE.Matrix4().makeRotationY(Math.atan2(b.hx, b.hz)).setPosition(b.x, y + 0.27, b.z));
  world.addStatic(new world.Box(b.x, b.z, 0.15, 0.3, Math.atan2(b.hx, b.hz), y - 1, y + 0.6, 'block'));
  return null;
}
