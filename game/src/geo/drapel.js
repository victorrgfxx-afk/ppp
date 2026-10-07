import * as THREE from 'three';
import { GEO, heightAt, gridHeight, addFineZone, addHole } from './data.js';
import { Acc } from './bridge.js';
import { canvas, tex, grain, blobs, clamp01 } from './pitigaia.js';
import { valueNoise2 } from './trees.js';
import { HILL, CLUMPS } from './drapel_mask.js';

// The flag by the cross on the hill above Strada Măgurii, from the user's photo 60 (45.1184398 N 25.7042024 E, by
// their car): a tall faded red-orange pole with the Romanian tricolour hanging limp from it, the lattice cross beyond seen
// exactly edge-on (its arms point along the view), the track climbing the knoll behind it to the wooded hill, the lane on
// the left, the thorn scrub on the meadow.
// The camera is resected on the photo: the skyline of the wooded hill (its dome just left of the frame's centre, traced
// on ~100 columns) against the bare-earth ground (FABDEM) with the stands' ~20 m of trees on it, and the cross's top and
// foot (pixels 646,1106 / 650,1283 on the 1320 x 1517 photo), solved for position, heading, tilt and focal length: the
// skyline fits to 0.24 deg rms, the cross to 2-3 px (the same pose to within 3 m for 14-22 m of trees). The camera stands
// ~95 m east of the cross (bearing 102 deg: the photo's coordinate is ~70 m off), looks west (282 deg), tilted up
// 15.8 deg, 54.4 deg vertical field of view (a cropped frame). Seen edge-on from there, the cross's arms run along
// bearing 102/282 deg (build_geo.py).
// The pole: 17 px thick at the car's roof (a ~11 cm steel pipe) puts it ~9.75 m ahead, 6 deg right of the centre, just
// past the car's nose; the frame's top edge is ~10.7 m up there and the flag's hoist runs on above it: a ~11.5 m pole,
// the flag (~3 x 2 m) hanging down to ~7 m.
const DIST = 94.88, POLE_AHEAD = 9.75, POLE_RIGHT = 0.97;       // metres
const VIEW = { pitch: 0.2758, fov: 54.4, yawOff: -0.0079 };      // the frame's centre is 0.45 deg right of the cross
const CAR = [6.3, 0.82];                                         // the car's centre: metres ahead, right
const POLE = { h: 11.5, r0: 0.057, r1: 0.032 };
const FLAG = { hoist: 2.0, fly: 3.0, droop: 1.0 };

// the view line: from the cross along its arms (the landmark's rot) back to the camera
function layout() {
  const cross = (GEO.landmarks || []).find(l => l.type === 'cross');
  if (!cross) return null;
  const ux = Math.cos(cross.rot), uz = -Math.sin(cross.rot);            // arms' direction, the eastern end (bearing 98 deg)
  const cam = [cross.x + ux * DIST, cross.z + uz * DIST];
  const hx = -ux, hz = -uz, rx = -hz, rz = hx;                           // heading towards the cross; right of it
  const pole = [cam[0] + hx * POLE_AHEAD + rx * POLE_RIGHT, cam[1] + hz * POLE_AHEAD + rz * POLE_RIGHT];
  return { cross, cam, pole, hx, hz, rx, rz };
}

// The hill's forests as the photo and the aerial show them: the dense broadleaf wood covering the hill behind the cross,
// the woods east and south, the rows of shrubs; the game's stand raster had only parts of them. The traced cover is
// added as broadleaf (code 1) where the raster has none; the map's scattered trees on the open meadow give way to the
// scrub clumps the aerial shows (the photo: dark thorn bushes and small trees on the yellowing grass).
export function prepareDrapel() {
  const B = GEO.forestBits, F = GEO.forest;
  if (!B || !F) return false;
  const L = layout();
  TR = L ? tracks(L) : [];
  const bits = (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const fo = bits(HILL.forest), op = bits(HILL.open), on = (u, k) => (u[k >> 3] >> (k & 7)) & 1;
  OPEN = op;
  for (let j = 0; j < HILL.nj; j++) for (let i = 0; i < HILL.ni; i++) {
    const k = j * HILL.ni + i, open = on(op, k);
    if (!on(fo, k) && !open) continue;
    const x = HILL.x0 + 5 * i, z = HILL.z0 + 5 * j, gi = Math.round((x + F.ext) / F.step), gj = Math.round((z + F.ext) / F.step);
    if (gi < 0 || gj < 0 || gi >= F.n || gj >= F.n) continue;
    const g = gj * F.n + gi;
    // the meadow traced on the aerial stays open (the 10 m forest maps round its edges into the wood)
    if (open) { B[g >> 2] &= ~(3 << ((g & 3) << 1)); continue; }
    if ((GEO.holes || []).some(h => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1 && h.test(x, z, 2))) continue;   // kept clear by another module
    if (((B[g >> 2] >> ((g & 3) << 1)) & 3) === 0) B[g >> 2] |= 1 << ((g & 3) << 1);
  }
  const T = GEO.trees;
  if (T) {
    const keep = [];
    for (let t = 0; t < T.n; t++) {
      const i = Math.round((T.x[t] - HILL.x0) / 5), j = Math.round((T.z[t] - HILL.z0) / 5);
      if (!(i >= 0 && j >= 0 && i < HILL.ni && j < HILL.nj && on(op, j * HILL.ni + i))) keep.push(t);
    }
    // and the scrub clumps the aerial shows there, in their place (off the dirt tracks)
    const u = bits(CLUMPS.b64), dv = new DataView(u.buffer), n = keep.length + CLUMPS.n;
    const out = { n, x: new Float32Array(n), z: new Float32Array(n), t: new Uint8Array(n), s: new Float32Array(n) };
    keep.forEach((t, k) => { out.x[k] = T.x[t]; out.z[k] = T.z[t]; out.t[k] = T.t[t]; out.s[k] = T.s[t]; });
    let k = keep.length;
    for (let c = 0; c < CLUMPS.n; c++) {
      const x = CLUMPS.x0 + dv.getInt16(6 * c, true) / 10, z = CLUMPS.z0 + dv.getInt16(6 * c + 2, true) / 10;
      if (TR.some(T => { const q = local(T, x, z); return q && q.d < 2.6; })) continue;
      out.x[k] = x; out.z[k] = z; out.t[k] = u[6 * c + 4]; out.s[k] = u[6 * c + 5] / 100; k++;
    }
    GEO.trees = { n: k, x: out.x.subarray(0, k), z: out.z.subarray(0, k), t: out.t.subarray(0, k), s: out.s.subarray(0, k) };
  }
  // the parking spot by the pole: the photo has the car's roof 3 deg under the horizon (0.23 m under the eye at its rear),
  // so the ground falls ~0.35 m from the camera to the car (5.5 %); the 30 m bare-earth DEM drops ~0.95 m there. The
  // flag's track is laid at that grade from the camera's ground (the eye height the pose was resected with), fading back
  // into the DEM 6 m past the level stretch and over 1.5 m at its sides
  const padY = L ? gridHeight(GEO, L.cam[0], L.cam[1]) : null;
  const sCam = TR.length ? local(TR[0], L.cam[0], L.cam[1])?.s ?? 6 : 6;
  const pad = (T, q, g) => padY === null || !T.flat0 ? g
    : g + (padY - 0.055 * Math.max(0, q.s - sCam) - g) * clamp01((T.flat0 + 6 - q.s) / 6) * clamp01((5 - q.d) / 1.5);
  // the two dirt tracks: rutted and bumpy in the ground itself (the car rides the ruts), no trees on them
  TR.forEach((T, k) => {
    addFineZone({ x0: T.x0, x1: T.x1, z0: T.z0, z1: T.z1,
      test: (x, z) => { const q = local(T, x, z); return !!q && q.d < 5; },
      h: (x, z) => { const q = local(T, x, z), g = gridHeight(GEO, x, z); return q ? pad(T, q, g) + rough(T, q.s, q.o) : g; } });
    for (let i = 0; i < T.pts.length - 1; i += 8) {
      const [ax, az] = T.pts[i], [bx, bz] = T.pts[Math.min(T.pts.length - 1, i + 8)], l = Math.hypot(bx - ax, bz - az) || 1;
      addHole([(ax + bx) / 2, (az + bz) / 2], l / 2 + 0.5, TW / 2 + 0.4, (bx - ax) / l, (bz - az) / l);
    }
    if (GEO.roads && !GEO.roads.some(r => r.id === T.id)) GEO.roads.push({ id: T.id, c: 'track', w: TW, s: 'dirt', own: true, p: T.ctrl.flat() });
  });
  // no village poles on the open hilltop (photos 24 and 60: the lane past the cross has none; the generated runs end here)
  const cross = (GEO.landmarks || []).find(l => l.type === 'cross');
  if (cross) for (const run of GEO.poles || []) run.p = run.p.filter(p => Math.hypot(p[0] - cross.x, p[1] - cross.z) > 210);
  return true;
}

// The two dirt tracks of photo 60 (neither is in OSM, the aerial predates them), in the view's frame:
// - the one the user drove up, very rough (ruts, bare soil, grass on the hump), from the lane just south of the cross to
//   the flagpole: the photo's lower left, ray-cast from its pixels onto the ground (8.7 m / -9 deg, 12.4 m / -8.5 deg,
//   68 m, 81 m, 96 m, joining the lane at its centre line 120 m out); [metres ahead, metres right]
const FLAG_TRACK = [[-6, -0.6], [0, -0.9], [8.6, -1.35], [12.3, -1.8], [40.5, -5.68], [67.0, -9.37], [80.1, -9.82], [95.0, -9.82], [108.1, -10.45], [119.5, -11.49]];
// - the one past the cross that leads to the wood: from the lane (120 m out) straight up the knoll just left of the
//   cross, bending right at the tree line (the photo: -1.1 deg at the cross's side, +2.3 deg where it meets the trees),
//   on into the wood; [distance, azimuth deg right of the axis] (from the lane, 111 m out)
const FOREST_TRACK = [[111.3, -1.3], [138.4, -1.25], [184.6, -1.15], [230.7, -1.05], [263.0, -0.8], [281.5, -0.1], [293.5, 0.8], [302.7, 1.6], [313.8, 2.3], [332.2, 3.1], [355.3, 3.8], [378.4, 4.3]];
const TW = 2.6;                                              // track width, m
let TR = [], OPEN = null;

// for the hill's ground cover (hillwood.js): the open meadow (the traced mask, 0..1 between its 5 m nodes, a node's
// neighbours counted so the scrub clumps' gaps are meadow too), the tracks, the photo spot
export function hillOpen(x, z) {
  if (!OPEN) return 0;
  const fx = (x - HILL.x0) / 5, fz = (z - HILL.z0) / 5, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 1 || j < 1 || i >= HILL.ni - 2 || j >= HILL.nj - 2) return 0;
  const at = (a, b) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const k = (b + dj) * HILL.ni + a + di; if ((OPEN[k >> 3] >> (k & 7)) & 1) return 1; } return 0; };
  const u = fx - i, v = fz - j;
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}
export const HILL_BOX = { x0: HILL.x0, x1: HILL.x0 + 5 * (HILL.ni - 1), z0: HILL.z0, z1: HILL.z0 + 5 * (HILL.nj - 1) };
// the nearest track at (x, z): { o, d, s, id } or null (beyond ~5 m)
export function trackAt(x, z) {
  let best = null;
  for (const T of TR) { const q = local(T, x, z); if (q && (!best || q.d < best.d)) best = { ...q, id: T.id, L: T.L }; }
  return best;
}
export function trackPoint(id, s) {
  const T = TR.find(t => t.id === id); if (!T) return null;
  let k = 0; while (k < T.S.length - 1 && T.S[k + 1] < s) k++;
  return { p: T.pts[k], t: T.tan[k] };
}
export function drapelSpots() {
  const L = layout(); if (!L) return null;
  const { cam, pole, hx, hz, rx, rz, cross } = L;
  return { cam, pole, cross, car: [cam[0] + hx * CAR[0] + rx * CAR[1], cam[1] + hz * CAR[0] + rz * CAR[1]], h: [hx, hz] };
}

// Catmull-Rom through the control points, sampled every ~0.6 m, with tangents, arc length and a 5 m grid index
function tracks(L) {
  const vy = Math.atan2(-L.hx, -L.hz) + VIEW.yawOff, vx = -Math.sin(vy), vz = -Math.cos(vy), wx = -vz, wz = vx;
  const at = (f, l) => [L.cam[0] + vx * f + wx * l, L.cam[1] + vz * f + wz * l];
  const flag = FLAG_TRACK.map(([f, l]) => at(f, l));
  const forest = FOREST_TRACK.map(([d, a]) => { const r = a * Math.PI / 180; return at(d * Math.cos(r), d * Math.sin(r)); });
  return [[flag, 'drapel-flag-track', 11, 17], [forest, 'drapel-forest-track', 23, 0]].map(([C, id, seed, flat0]) => {
    const pts = [];
    for (let i = 0; i < C.length - 1; i++) {
      const p0 = C[Math.max(0, i - 1)], p1 = C[i], p2 = C[i + 1], p3 = C[Math.min(C.length - 1, i + 2)];
      const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.6));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        pts.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    pts.push(C[C.length - 1]);
    const S = [0], tan = [];
    for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      tan.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l]);
    }
    const grid = new Map(), key = (i, j) => i * 100003 + j;
    pts.forEach(([x, z], k) => { const g = key(Math.floor(x / 5), Math.floor(z / 5)); if (!grid.has(g)) grid.set(g, []); grid.get(g).push(k); });
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    return { id, seed, flat0, ctrl: C, pts, tan, S, L: S[S.length - 1], grid, key,
      x0: Math.min(...xs) - 6, x1: Math.max(...xs) + 6, z0: Math.min(...zs) - 6, z1: Math.max(...zs) + 6 };
  });
}
// (x, z) in the track's frame: s along it, o across (+ to the left of its direction), d the distance; null beyond ~5 m
function local(T, x, z) {
  if (x < T.x0 || x > T.x1 || z < T.z0 || z > T.z1) return null;
  const ci = Math.floor(x / 5), cj = Math.floor(z / 5);
  let best = -1, bd = Infinity;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const l = T.grid.get(T.key(ci + di, cj + dj)); if (!l) continue;
    for (const k of l) { const d = (T.pts[k][0] - x) ** 2 + (T.pts[k][1] - z) ** 2; if (d < bd) { bd = d; best = k; } }
  }
  if (best < 0) return null;
  const [px, pz] = T.pts[best], [ux, uz] = T.tan[best], dx = x - px, dz = z - pz;
  const a = Math.max(-0.4, Math.min(0.4, dx * ux + dz * uz)), o = -dx * uz + dz * ux;
  return { s: Math.max(0, Math.min(T.L, T.S[best] + a)), o, d: Math.max(Math.abs(o), Math.sqrt(bd) - 0.35) };
}
// the ground of a rough dirt track: two wheel ruts ~0.1 m deep 1.56 m apart (a car's track), the grassy hump between
// them, uneven waves of 2-7 m (different under each wheel: the car pitches and rolls), potholes; faded out over 5 m at
// the lane and ~0.8 m beyond the edges; the flag's track is level for its first 17 m, the trodden parking spot by the
// pole (the photo: the car stands level, its roof at eye height), and rough from 6 m further on
function rough(T, s, o) {
  const k = clamp01((TW / 2 + 0.8 - Math.abs(o)) / 0.8) * clamp01(Math.min((s - T.flat0) / 6, (T.L - s) / 5));
  if (k <= 0) return 0;
  const rut = -0.1 * Math.exp(-(((Math.abs(o) - 0.78) / 0.3) ** 2)), hump = 0.03 * Math.exp(-((o / 0.35) ** 2));
  const wave = (ph) => 0.06 * Math.sin(s * 0.85 + ph) + 0.045 * Math.sin(s * 1.9 + ph * 2.3) + 0.03 * Math.sin(s * 2.7 + ph * 0.7);
  const wl = clamp01((o + 0.5) / 1.0), w = wave(T.seed) * (1 - wl) + wave(T.seed + 2.1) * wl;
  const pot = -0.13 * clamp01((valueNoise2(s, o + 5, 1.7, T.seed) - 0.72) / 0.16);
  return k * (rut + hump + w + pot);
}

let MT = null;
function mats() {
  if (MT) return MT;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // the tricolour: blue, yellow, red vertical bands from the hoist, sun-faded, with a little grain
  const flag = canvas(192, 128), fg = flag.getContext('2d');
  [['#1f3f8f', 0], ['#f2cf1c', 64], ['#cf2a2a', 128]].forEach(([c, x]) => { fg.fillStyle = c; fg.fillRect(x, 0, 64, 128); });
  grain(fg, 192, 128, 10, Math.random);
  // the pole: faded red-orange paint, chipped
  const pole = canvas(32, 256), pg = pole.getContext('2d');
  pg.fillStyle = '#c4553a'; pg.fillRect(0, 0, 32, 256);
  for (let i = 0; i < 90; i++) { pg.fillStyle = `rgba(${150 + Math.random() * 60 | 0},${90 + Math.random() * 40 | 0},70,${0.3 + Math.random() * 0.3})`; pg.fillRect(Math.random() * 32, Math.random() * 256, 2 + Math.random() * 5, 2 + Math.random() * 10); }
  // the rough dirt track (across: 3.4 m, the outer 0.4 m each side fading into the grass; along: 8 m): two dark wheel
  // ruts with tyre streaks, bare dry soil, grass tufts on the hump and creeping in from the verges, stones
  const R = (() => { let a = 60; return () => ((a = Math.imul(a ^ (a >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967296; })();
  const tw = 128, th = 512, tc = canvas(tw, th), tg = tc.getContext('2d', { willReadFrequently: true }), px = tw / 3.4, mid = tw / 2;
  tg.fillStyle = '#7b6c56'; tg.fillRect(0, 0, tw, th);
  blobs(tg, 0, 0, tw, th, 70, 6, 22, ['rgba(110,96,76,0.5)', 'rgba(138,124,100,0.4)', 'rgba(96,84,66,0.45)'], R);
  for (const sgn of [-1, 1]) {                                                      // the ruts, 0.78 m off the centre
    const x = mid + sgn * 0.78 * px;
    const gr = tg.createLinearGradient(x - 0.3 * px, 0, x + 0.3 * px, 0);
    gr.addColorStop(0, 'rgba(92,78,60,0)'); gr.addColorStop(0.5, 'rgba(84,70,54,0.85)'); gr.addColorStop(1, 'rgba(92,78,60,0)');
    tg.fillStyle = gr; tg.fillRect(x - 0.3 * px, 0, 0.6 * px, th);
    for (let i = 0; i < 26; i++) { tg.fillStyle = `rgba(60,50,38,${0.25 + R() * 0.3})`; tg.fillRect(x - 0.2 * px + R() * 0.4 * px, R() * th, 1 + R() * 1.5, 20 + R() * 90); }
  }
  blobs(tg, mid - 0.32 * px, 0, 0.64 * px, th, 140, 2, 7, ['rgba(104,118,62,0.9)', 'rgba(128,132,72,0.85)', 'rgba(90,104,52,0.9)'], R);   // the hump's grass
  for (const x0 of [0, tw - 0.62 * px]) blobs(tg, x0, 0, 0.62 * px, th, 160, 2, 8, ['rgba(84,98,50,0.9)', 'rgba(118,120,66,0.8)', 'rgba(74,88,44,0.9)'], R);
  for (let i = 0; i < 90; i++) { tg.fillStyle = `rgba(${170 + R() * 50 | 0},${160 + R() * 45 | 0},${140 + R() * 40 | 0},0.8)`; tg.fillRect(R() * tw, R() * th, 1 + R() * 2, 1 + R() * 2); }
  grain(tg, tw, th, 16, R);
  const id = tg.getImageData(0, 0, tw, th), ad = id.data;                          // alpha: fade into the grass at the sides
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const e = Math.min(x, tw - 1 - x) / px, a = Math.min(1, Math.max(0, (e - 0.08 + 0.1 * Math.sin(y * 0.07) * Math.sin(y * 0.031 + (x < mid ? 0 : 2))) / 0.4));
    ad[(y * tw + x) * 4 + 3] = a * 255;
  }
  tg.putImageData(id, 0, 0);
  MT = {
    track: std({ map: tex(tc, { repeat: true }), transparent: true, depthWrite: false, roughness: 0.97, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    flag: std({ map: tex(flag), side: THREE.DoubleSide, roughness: 0.85 }),
    pole: std({ map: tex(pole), roughness: 0.6, metalness: 0.4 }),
    base: std({ color: 0x9f9c94, roughness: 0.95 }),
  };
  return MT;
}

export function buildDrapel(B, world) {
  const L = layout();
  if (!L) return null;
  const Mt = mats();
  const { cam, pole, hx, hz, rx, rz } = L;
  const [px, pz] = pole, py = heightAt(px, pz);
  // the pole, tapering, on a small concrete footing; a halyard down its side
  const g = new THREE.CylinderGeometry(POLE.r1, POLE.r0, POLE.h, 10, 1); g.translate(px, py + POLE.h / 2, pz);
  B.geo(Mt.pole, g);
  const cap = new THREE.SphereGeometry(0.06, 8, 6); cap.translate(px, py + POLE.h + 0.05, pz); B.geo(Mt.pole, cap);
  const foot = new THREE.BoxGeometry(0.8, 0.3, 0.8); foot.translate(px, py + 0.05, pz); B.geo(Mt.base, foot);
  world.addStatic(new world.Box(px, pz, 0.12, 0.12, 0, py - 1, py + POLE.h, 'pole'));
  const wires = [px - rx * 0.06, py + POLE.h - 0.1, pz - rz * 0.06, px - rx * 0.06, py + 1.2, pz - rz * 0.06];   // the halyard, left of the pole in the photo
  // the flag: hoisted to the top and hanging limp down the pole's right side, twisted, the fly end lowest (photo 60)
  {
    const acc = new Acc(), NU = 16, NV = 8, top = py + POLE.h - 0.2;
    const dx = rx * 0.8 + hx * 0.6, dz = rz * 0.8 + hz * 0.6, dl = Math.hypot(dx, dz), ax = dx / dl, az = dz / dl;   // out from the pole
    const P = (i, j) => {
      const u = i / NU, v = j / NV, a = FLAG.droop * (0.55 + 0.45 * u);                                         // steeper towards the fly
      const out = u * FLAG.fly * Math.cos(a) * 0.4 + Math.sin(u * 6 + v * 2) * 0.12, down = v * FLAG.hoist + u * FLAG.fly * Math.sin(a);
      const tw = Math.sin(u * 3.2) * 0.35 * u;                                                                 // the twist
      return [px + ax * out - az * tw, top - down, pz + az * out + ax * tw];
    };
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) acc.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), [-az, 0, ax], [i / NU, 1 - j / NV, (i + 1) / NU, 1 - j / NV, (i + 1) / NU, 1 - (j + 1) / NV, i / NU, 1 - (j + 1) / NV]);
    acc.flush(B, Mt.flag, null, {});
  }
  // the dirt tracks' surface, laid on the rough ground every 0.6 m (13 strips across, finer over the ruts)
  const cols = [-1.7, -1.3, -1.02, -0.78, -0.52, -0.25, 0, 0.25, 0.52, 0.78, 1.02, 1.3, 1.7];
  for (const T of TR) {
    const acc = new Acc();
    // never under the terrain's 1 m mesh of the rough ground (it cannot follow the ruts and potholes): its bilinear height
    const mesh = (x, z) => { const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
      return (heightAt(i, j) * (1 - u) + heightAt(i + 1, j) * u) * (1 - v) + (heightAt(i, j + 1) * (1 - u) + heightAt(i + 1, j + 1) * u) * v; };
    const P = (k, o) => { const [x, z] = T.pts[k], [ux, uz] = T.tan[k], X = x - uz * o, Z = z + ux * o; return [X, Math.max(heightAt(X, Z), mesh(X, Z)) + 0.035, Z]; };
    for (let i = 0; i < T.pts.length - 1; i++) for (let c = 0; c < cols.length - 1; c++) {
      const u0 = (cols[c] + 1.7) / 3.4, u1 = (cols[c + 1] + 1.7) / 3.4, v0 = T.S[i] / 8, v1 = T.S[i + 1] / 8;
      acc.quad(P(i, cols[c]), P(i, cols[c + 1]), P(i + 1, cols[c + 1]), P(i + 1, cols[c]), [0, 1, 0], [u0, v0, u1, v0, u1, v1, u0, v1]);
    }
    acc.flush(B, Mt.track, null, { noCast: true });
  }
  // the user's car parked just in front of the camera, facing the cross (photo 60): its rear spans half the frame's width
  // (1.8 m over 660 px: the tail ~4 m ahead), its roof 3 deg under the horizon, the body's centre line 11 deg right of the axis
  const car = { model: 'suv', paint: 0x8b9895, x: cam[0] + hx * CAR[0] + rx * CAR[1], z: cam[1] + hz * CAR[0] + rz * CAR[1], h: Math.atan2(-hx, -hz) };
  const bbox = { x0: Math.min(cam[0], px) - 5, x1: Math.max(cam[0], px) + 5, z0: Math.min(cam[1], pz) - 5, z1: Math.max(cam[1], pz) + 5 };
  // the open hilltop: no map trees on the pole, the car or the first 30 m of the view
  const T = GEO.trees;
  if (T) {
    const clear = (x, z) => { const vx = x - cam[0], vz = z - cam[1], f = vx * hx + vz * hz, r = Math.abs(vx * rx + vz * rz); return (f > -6 && f < 30 && r < 7) || Math.hypot(x - px, z - pz) < 6; };
    const keep = []; for (let i = 0; i < T.n; i++) if (!clear(T.x[i], T.z[i])) keep.push(i);
    if (keep.length < T.n) GEO.trees = { n: keep.length, x: Float32Array.from(keep, i => T.x[i]), z: Float32Array.from(keep, i => T.z[i]), t: Uint8Array.from(keep, i => T.t[i]), s: Float32Array.from(keep, i => T.s[i]) };
  }
  return {
    type: 'drapel', name: 'Drapelul de lângă crucea de pe deal', bbox, wires, cars: [car],
    view: { from: cam, yaw: Math.atan2(-hx, -hz) + VIEW.yawOff, pitch: VIEW.pitch, fov: VIEW.fov },
  };
}
