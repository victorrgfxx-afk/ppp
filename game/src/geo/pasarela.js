import * as THREE from 'three';
import { GEO, heightAt, addHolePoly, inPoly } from './data.js';
import { M } from '../materials.js';
import { Acc } from './bridge.js';
import { canvas, tex, grain, blobs, boxAt, cyl, tube, merged, frame, pairs, road } from './pitigaia.js';
import { guardrail, guardrailMaterials } from './cantacuzino.js';

// Photo 67 (Street View, 2021, "45.1721232 N 25.6883978 E"): DN1 northbound ~700 m past the roadside restaurant, at the
// exit to Breaza (DC1) and the red footbridge over DN1. The screenshot is zoomed in (its view 33.5° high: the lane
// divider's dashes, 3 m long every 12 m as in photo 66, give the focal length) and taken ~130 m before the bridge;
// the coordinate is on the exit road ~65 m ahead of the camera.
//  * DN1 here: 6.6 m between the edge lines, the lane divider 3 m from the left one (pastravaria.js: the carriageways
//    narrow past the restaurant), the barrier 3.85 m left of the divider; the camera 0.84 m right of the divider,
//    turned 1.4° right, looking 2.8° up the road
//  * the exit leaves DN1's right edge ~10 m ahead and climbs beside it on a ledge held by a concrete wall (0.7 m high
//    where it starts, ~2.8 m by the bridge; a W-beam guardrail on top) up to the junction on the hillside; the way
//    back onto DN1 comes down past the bridge. The terrain's 10 m grid can't hold a wall between two roads 0.5 m
//    apart, so the ledge is built on it (and walkable), DN1's ground stays flat under both carriageways
//  * the footbridge (OSM path over DN1): a steel tied arch painted red, ~22 m between the ends, the deck's underside
//    5.9 m over DN1, its sides clad in faded white-and-red banners, lattice railings at the ends, the arch 10.7 m up;
//    a white concrete pier and a straight flight of steps down to the south on the west side; on the east side a
//    thin white pier on the ledge and a tall enclosure (dark brown, then light grey panels) at the deck's end
//  * the southbound's outer guardrail; the hillside of marl cliffs ahead (the white scarps 350-700 m away: the photo's
//    white areas cast onto the terrain from the camera, trees cleared there)
//  * lettering on the banners can't be read on the screenshot: generic
const NBW = ['1107424497', '555628049', '1107424495'];
const EXIT = '27851110', BACK = '161450643', FOOT = '161450658', STEPS = '1188492544', LANDING = '1037878801';
const CAM = { s: 515, o: 0.84, yaw: 1.36, pitch: 0.0489, fov: 33.5 };      // pitch: over the road's own slope
// the ledge's height over DN1's axis along our way (the exit up to the junction, the way back down to DN1)
const RISE = [[522, 0], [537, 0.05], [550, 0.55], [575, 1.15], [600, 1.8], [621, 2.4], [640, 2.7], [652, 2.8], [665, 2.6], [690, 1.6], [704, 0.8], [716, 0], [727, 0]];
// and up towards the junction on the hillside (the roads meet 4.1 m over DN1 there, 18 m out)
const JUNCTION = { s0: 630, s1: 666, o: 9, k: 0.1 };
const LEDGE = { s0: 522, s1: 727, o0: 3.8, o1: 26 };
const EXIT_START = [[510, 5.15], [522, 5.3], [532, 5.85], [542, 6.6], [555, 7.7], [570, 7.95]];   // the exit's axis (o) where it leaves DN1
const WALL = { s0: 538, s1: 708, o0: 3.8, o1: 4.15 };   // ends before the way back crosses its line
const BR = { o0: -17.6, o1: 5.0, bot: 5.9, deck: 6.2, top: 7.85, apex: 10.7, hw: 1.35 };   // over DN1 at the bridge
const STAIR = { o: -18.95, hw: 0.9, run: 14 };
// photo 72 (Street View, June 2022, from the exit before the junction): a flight down to the south on the east side too,
// from a landing in front of the brown enclosure to the ledge, between the wall's guardrail and the exit; yellow railings
const STAIR_E = { o: 5.85, hw: 0.72, land: [-3.2, -1.8] };
const CAM72 = { s: 617, o: 8.1, ts: 648.7, to: 22.9, pitch: 0, fov: 77.3 };
const TOWER = [{ o0: 4.7, o1: 7.3, ds0: -1.8, ds1: 3.2, top: 9.6, mat: 'brown' }, { o0: 7.3, o1: 12.2, ds0: -1.0, ds1: 4.3, top: 9.5, mat: 'panel' }];
// the white scarps cast from the screenshot onto the terrain (game x, z)
const CHALK = [
  [[4320, 2100], [4320, 2110], [4340, 2130], [4360, 2140], [4390, 2170], [4390, 2180], [4400, 2190], [4440, 2210], [4460, 2230], [4460, 2240], [4450, 2250], [4460, 2260], [4480, 2270], [4510, 2300], [4510, 2310], [4550, 2330], [4560, 2340], [4580, 2350], [4590, 2360],
    [4590, 2370], [4600, 2380], [4600, 2390], [4640, 2390], [4640, 2380], [4630, 2370], [4640, 2360], [4640, 2300], [4630, 2290], [4630, 2280], [4640, 2270], [4640, 2220], [4620, 2210], [4580, 2200], [4560, 2190], [4530, 2180], [4520, 2170], [4460, 2150], [4420, 2140], [4400, 2130], [4360, 2120], [4340, 2100]],
  [[4640, 2220], [4700, 2225], [4730, 2245], [4775, 2270], [4795, 2305], [4760, 2295], [4700, 2285], [4655, 2275]],
];
const UP = [0, 1, 0];

const Wf = (F, s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
const smooth = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
const lin = (A, x) => { if (x <= A[0][0]) return A[0][1]; for (let i = 0; i < A.length - 1; i++) if (x <= A[i + 1][0]) return A[i][1] + (A[i + 1][1] - A[i][1]) * (x - A[i][0]) / (A[i + 1][0] - A[i][0]); return A[A.length - 1][1]; };
const chain = () => { const C = []; for (const id of NBW) { const r = road(id); if (r) for (const p of pairs(r.p)) { const q = C[C.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.01) C.push(p); } } return C; };

// shared by prepare and build (the roads are moved by then; the terrain is final once prepare has run)
let S = null;
function state() {
  if (S) return S;
  if (!road(NBW[0]) || !road(EXIT)) return null;
  const F = frame(chain());
  const fb = road(FOOT); let sB = 645;
  if (fb) { const P = pairs(fb.p); sB = F.local((P[0][0] + P[P.length - 1][0]) / 2, (P[0][1] + P[P.length - 1][1]) / 2).s; }
  const yAx = (s) => { const q = F.at(s); return heightAt(q.x, q.z); };
  // the ledge: DN1's level plus the rise, never under the ground
  const ledge = (x, z) => {
    const q = F.local(x, z);
    if (!q || q.s < LEDGE.s0 || q.s > LEDGE.s1 || q.o < LEDGE.o0 || q.o > LEDGE.o1) return null;
    const j = Math.sin(Math.PI * Math.max(0, Math.min(1, (q.s - JUNCTION.s0) / (JUNCTION.s1 - JUNCTION.s0)))) ** 2;
    return Math.max(heightAt(x, z), yAx(q.s) + lin(RISE, q.s) + j * JUNCTION.k * Math.max(0, q.o - JUNCTION.o));
  };
  S = { F, sB, yAx, ledge };
  return S;
}

// ------------------------------------------------------------------ before the terrain, roads and trees
export function preparePasarela() {
  S = null;
  const st = state();
  if (!st || !GEO.W) return false;
  const { F } = st;
  const ex = road(EXIT), bk = road(BACK);
  // the exit: its left edge line leaves DN1's edge line ~7 m ahead of the camera and is 2.4 m out 40 m on (photo), so
  // it runs 2 m further out than mapped (room for the wall, the guardrail and a verge), back onto the mapped line at
  // the junction; at DN1's level until it has left the lanes (under DN1's asphalt there), then on the ledge
  {
    const P = pairs(ex.p), last = P[P.length - 1], Q = EXIT_START.map(([a, b]) => Wf(F, a, b));
    for (const [x, z] of P.slice(0, -1)) { const q = F.local(x, z); if (q.s > EXIT_START[EXIT_START.length - 1][0] + 6) Q.push(Wf(F, q.s, q.o + 2.0 * (1 - smooth(626, 646, q.s)))); }
    Q.push(last);
    ex.p = Q.flat(); ex.noShoulder = true;
  }
  if (bk) bk.noShoulder = true;
  // the footbridge and its steps are built here (roads.js would lay the mapped path as a low deck across DN1)
  for (const id of [FOOT, STEPS, LANDING]) { const r = road(id); if (r) r.own = true; }
  // over DN1's lanes (the exit's start, the way back's end) under DN1's asphalt, else on the ledge
  // (the ledge 3.5 m on either side too: the ribbon's points are 3.5 m apart and the ledge's grass must stay under it)
  const onLedge = (x, z) => {
    const q = F.local(x, z); if (!q || q.s < WALL.s0 - 10) return 0.028;
    const y = Math.max(...[0, -3.5, 3.5].map(d => (d ? st.ledge(...Wf(F, q.s + d, q.o)) : st.ledge(x, z)) ?? -Infinity));
    return y === -Infinity ? 0.028 : 0.028 + (Math.max(0, y - heightAt(x, z)) + 0.007) * smooth(WALL.s0 - 10, WALL.s0 - 3, q.s);
  };
  ex.dy = onLedge; if (bk) bk.dy = onLedge;
  // where the exit still runs at DN1's level, the hillside's first nodes (14-22 m out) tilted the 10 m triangles under
  // its outer edge (the ground up to 15 cm over the asphalt): no higher than DN1 there
  {
    const W = GEO.W, { n, ext, step, H } = W, sA = 495, sZ = 545;
    const prof = []; for (let s = sA - 5; s <= sZ + 5; s += 5) prof.push([s, st.yAx(s)]);
    const pts = []; for (let s = sA; s <= sZ; s += 10) for (const o of [0, 22]) pts.push(Wf(F, s, o));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let j = Math.floor((z0 + ext) / step); j <= Math.ceil((z1 + ext) / step); j++) for (let i = Math.floor((x0 + ext) / step); i <= Math.ceil((x1 + ext) / step); i++) {
      const q = F.local(-ext + i * step, -ext + j * step), k = j * n + i;
      if (!q || q.s < sA || q.s > sZ || q.o < 0 || q.o > 22) continue;
      const t = lin(prof, q.s), w = smooth(sA, sA + 10, q.s) * (1 - smooth(sZ - 10, sZ, q.s)) * (1 - smooth(18, 22, q.o));
      if (H[k] > t) H[k] += (t - H[k]) * w;
    }
  }
  // the ground east of the ledge up to its level (DN1's flat corridor ends 14 m out), so the trees there stand on it
  {
    const W = GEO.W, { n, ext, step, H } = W;
    const pts = []; for (let s = LEDGE.s0 - 20; s <= LEDGE.s1 + 20; s += 10) for (const o of [0, 40]) pts.push(Wf(F, s, o));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let j = Math.floor((z0 + ext) / step); j <= Math.ceil((z1 + ext) / step); j++) for (let i = Math.floor((x0 + ext) / step); i <= Math.ceil((x1 + ext) / step); i++) {
      const x = -ext + i * step, z = -ext + j * step, q = F.local(x, z);
      if (!q || q.o < 18 || q.o > 40) continue;                                    // a 10 m cell reaching DN1's lanes stays flat
      const w = smooth(LEDGE.s0, LEDGE.s0 + 20, q.s) * (1 - smooth(LEDGE.s1 - 20, LEDGE.s1, q.s)) * (1 - smooth(30, 40, q.o));
      if (w <= 0) continue;
      const t = st.ledge(x, z) ?? st.yAx(q.s) + lin(RISE, q.s), k = j * n + i;
      if (H[k] < t) H[k] += (t - H[k]) * w;
    }
  }
  // past popas.js's levelled stretch (it ends ~280 m beyond the bridge) the terrain grid is flat only to 8 m left of our
  // axis, so the southbound's outer lane leaned on the valley side (its edge line up to 1.3 m low, cars rolled 13°):
  // flat across it at DN1's level up to the end of our line
  {
    const W = GEO.W, { n, ext, step, H } = W, E = GEO.ext, sA = 850, sZ = F.L;
    const prof = []; for (let s = sA - 10; s <= sZ + 10; s += 5) prof.push([s, st.yAx(Math.max(0, Math.min(sZ, s)))]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let s = sA; s <= sZ; s += 10) for (const o of [-30, 10]) { const [x, z] = Wf(F, s, o); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let j = Math.floor((z0 + ext) / step); j <= Math.ceil((z1 + ext) / step); j++) for (let i = Math.floor((x0 + ext) / step); i <= Math.ceil((x1 + ext) / step); i++) {
      const x = -ext + i * step, z = -ext + j * step;
      if (Math.abs(x) <= E && Math.abs(z) <= E) continue;
      const q = F.local(x, z);
      if (!q || q.s < sA || q.s > sZ || q.o < -27 || q.o > 4) continue;
      const oF = 19 + 3 * (1 - smooth(1740, 1780, q.s));                         // 3 m less where the railway runs close
      const w = (q.o >= 0 ? 1 - smooth(0, 4, q.o) : 1 - smooth(oF, oF + 5, -q.o)) * smooth(sA, sA + 40, q.s) * (1 - smooth(sZ - 30, sZ, q.s)), k = j * n + i;
      if (w > 0) H[k] += (lin(prof, q.s) - H[k]) * w;
    }
    if (GEO.water2) GEO.water2 = GEO.water2.filter(([i, j]) => { const q = F.local(-ext + (i + 0.5) * step, -ext + (j + 0.5) * step); return !q || q.s < sA || q.s > sZ - 1 || q.o < -30 || q.o > 0; });
  }
  // no trees on the ledge between the wall and the exit, over DN1 by the bridge, in the chalk
  const strip = []; for (let s = LEDGE.s0; s <= LEDGE.s1; s += 5) strip.push(Wf(F, s, 3.5)); for (let s = LEDGE.s1; s >= LEDGE.s0; s -= 5) strip.push(Wf(F, s, 9.5));
  addHolePoly(strip, { noFences: true });
  // (on the west the clearing runs 40 m back: the steps stand free in the screenshot, a bare trunk beside them)
  const span = []; for (const [s, o] of [[st.sB - 40, -26], [st.sB - 40, -12], [st.sB - 20, -12], [st.sB - 20, 14], [st.sB + 6, 14], [st.sB + 6, -26]]) span.push(Wf(F, s, o));
  addHolePoly(span, { noFences: true });
  // photo 72: kerb, a strip of grass, then the bushes (no forest right by the exit's last straight)
  const bend = []; for (const [s, o] of [[604, 10.4], [642, 10.4], [642, 14.5], [604, 14.5]]) bend.push(Wf(F, s, o));
  addHolePoly(bend, { noFences: true, lawn: true });
  for (const P of CHALK) addHolePoly(P, { noFences: true, scatter: false });   // the mapped trees in it are dropped below
  // the wood round here is broadleaved (the screenshot: yellowing crowns on both sides): the mixed stands become
  // broadleaved, the mapped conifers edge broadleaves; tall broadleaves over the exit on the hillside
  const RG = [[380, -90], [380, 150], [900, 450], [1250, 450], [1250, -90]].map(([s, o]) => Wf(F, s, o)), CONIFER = new Set([2, 9, 10, 15]);
  if (GEO.forestBits) {
    const Fo = GEO.forest, FB = GEO.forestBits;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of RG) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let j = Math.floor((z0 + Fo.ext) / Fo.step); j <= Math.ceil((z1 + Fo.ext) / Fo.step); j++) for (let i = Math.floor((x0 + Fo.ext) / Fo.step); i <= Math.ceil((x1 + Fo.ext) / Fo.step); i++) {
      if (i < 0 || j < 0 || i >= Fo.n || j >= Fo.n || !inPoly(RG, -Fo.ext + i * Fo.step, -Fo.ext + j * Fo.step)) continue;
      const k = j * Fo.n + i, sh = (k & 3) << 1;
      if (((FB[k >> 2] >> sh) & 3) >= 2) FB[k >> 2] = (FB[k >> 2] & ~(3 << sh)) | (1 << sh);
    }
  }
  if (GEO.trees) {
    const T = GEO.trees, keep = [];
    for (let k = 0; k < T.n; k++) if (!inPoly(strip, T.x[k], T.z[k]) && !inPoly(span, T.x[k], T.z[k]) && !CHALK.some(P => inPoly(P, T.x[k], T.z[k]))) { keep.push(k); if (CONIFER.has(T.t[k]) && inPoly(RG, T.x[k], T.z[k])) T.t[k] = 12; }
    let seed = 67; const Rn = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const add = [];
    for (let s = 522; s < 640; s += 7 + Rn() * 5) { const o = 11 + Rn() * 6, ty = Rn() < 0.7 ? 12 : 1, sc = 1.15 + Rn() * 0.35; if (Math.hypot(s - CAM72.s, o - CAM72.o) > 8 && !(s > CAM72.s - 6 && s < 645 && o < 14)) add.push([...Wf(F, s, o), ty, sc]); }
    // photo 72: poplars over the exit's last bend (white trunks at the screenshot's right edge)
    for (const [s, o, k] of [[622, 16.8, 0.9], [630, 18.2, 1.0], [637, 19.8, 0.9]]) add.push([...Wf(F, s, o), 14, k]);
    // and the acacias and bushes on the bank beside it, a strip of grass from the kerb (photo 72)
    for (let s = 605; s < 642; s += 1.6 + Rn() * 1.2) { const o = 14.6 + Rn() * 2.5; if (Math.hypot(s - CAM72.s, o - CAM72.o) > 6.5) add.push([...Wf(F, s, o), Rn() < 0.45 ? 12 : 11, Rn() < 0.45 ? 0.9 + Rn() * 0.3 : 1.1 + Rn() * 0.3]); }
    for (let s = 500; s < st.sB - 44; s += 9 + Rn() * 6) add.push([...Wf(F, s, -(15 + Rn() * 8)), 12, 0.9 + Rn() * 0.4]);
    // scrub and a few trees clinging to the scarps
    for (const P of CHALK) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let x = x0; x <= x1; x += 14) for (let z = z0; z <= z1; z += 14) { const px = x + (Rn() - 0.5) * 12, pz = z + (Rn() - 0.5) * 12; if (Rn() < 0.3 && inPoly(P, px, pz)) add.push([px, pz, 12, 0.35 + Rn() * 0.5]); } }
    const m = keep.length + add.length, x = new Float32Array(m), z = new Float32Array(m), t = new Uint8Array(m), sc = new Float32Array(m);
    keep.forEach((k, i) => { x[i] = T.x[k]; z[i] = T.z[k]; t[i] = T.t[k]; sc[i] = T.s[k]; });
    add.forEach(([ax, az, at, as], i) => { x[keep.length + i] = ax; z[keep.length + i] = az; t[keep.length + i] = at; sc[keep.length + i] = as; });
    GEO.trees = { n: m, x, z, t, s: sc };
  }
  return true;
}

// ------------------------------------------------------------------ materials
let MT = null;
function mats() {
  if (MT) return MT;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const R = (() => { let s = 67; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967296; })();
  // the banners along the deck: faded white sheets in red frames, blurred red and grey prints (not legible)
  const bn = canvas(1024, 64), b = bn.getContext('2d');
  b.fillStyle = '#8f3b33'; b.fillRect(0, 0, 1024, 64);
  for (let k = 0; k < 8; k++) {
    const x = 6 + k * 127; b.fillStyle = '#efe6e2'; b.fillRect(x, 5, 119, 54);
    blobs(b, x + 4, 10, 111, 44, 10, 4, 16, ['rgba(186,70,64,0.55)', 'rgba(140,120,118,0.35)', 'rgba(205,120,110,0.4)'], R);
    b.fillStyle = 'rgba(160,60,55,0.5)'; b.fillRect(x, 44 + R() * 8, 119, 3 + R() * 5);
  }
  grain(b, 1024, 64, 14, R);
  // chalk and marl: off-white with gullies and scrub
  const ch = canvas(256, 256), c = ch.getContext('2d');
  c.fillStyle = '#c4b9a2'; c.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 120; k++) { const x = R() * 256, w = 1 + R() * 5, y = R() * 180; c.fillStyle = R() < 0.55 ? 'rgba(140,126,102,0.4)' : 'rgba(246,242,230,0.55)'; c.fillRect(x, y, w, 60 + R() * 200); }   // gullies down the face
  blobs(c, 0, 0, 256, 256, 34, 4, 18, ['rgba(96,108,58,0.55)', 'rgba(120,100,60,0.4)', 'rgba(70,78,44,0.5)'], R);                                    // scrub clinging to it
  grain(c, 256, 256, 16, R);
  MT = {
    ...guardrailMaterials(),
    red: std({ color: 0x94503f, roughness: 0.65, metalness: 0.3 }), banner: std({ map: tex(bn), roughness: 0.75, side: THREE.DoubleSide }),
    lattice: std({ color: 0xc9b58c, roughness: 0.6, metalness: 0.3 }), white: std({ color: 0xe9e8e4, roughness: 0.8 }),
    steps: std({ color: 0x9d9a94, roughness: 0.9 }), brown: std({ color: 0x4f3a2e, roughness: 0.8 }), yellow: std({ color: 0xd9b43c, roughness: 0.55, metalness: 0.3 }), stringer: std({ color: 0x6e3a2c, roughness: 0.7, metalness: 0.3 }), stepsDark: std({ color: 0x4d4a47, roughness: 0.85 }), panel: std({ color: 0xc8cacd, roughness: 0.7, metalness: 0.2 }),
    wall: Object.assign(M.concrete.clone(), { color: new THREE.Color(0x9b9c9e) }),
    chalk: Object.assign(std({ map: tex(ch, { repeat: true }), roughness: 1 }), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }),
    marking: M.marking,
  };
  MT.ledgeTop = Object.assign(MT.verge.clone(), { polygonOffset: false });
  { const c = canvas(128, 128), g = c.getContext('2d'); g.clearRect(0, 0, 128, 128); g.fillStyle = '#c8202a'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(64, 64, 47, 0, 7); g.fill();
    MT.signRound = new THREE.MeshStandardMaterial({ map: tex(c), alphaTest: 0.5, roughness: 0.5, side: THREE.DoubleSide });
    const d = canvas(128, 160), h = d.getContext('2d'); h.fillStyle = '#f2f2ee'; h.fillRect(0, 0, 128, 160); h.strokeStyle = '#222'; h.lineWidth = 4; h.strokeRect(4, 4, 120, 152);
    h.fillStyle = '#1c1c1c'; for (let k = 0; k < 6; k++) h.fillRect(16 + (k % 2) * 8, 20 + k * 22, 96 - (k % 3) * 14, 9);
    MT.signPlate = new THREE.MeshStandardMaterial({ map: tex(d), roughness: 0.5, side: THREE.DoubleSide });
    const e = canvas(128, 32), k2 = e.getContext('2d'); k2.fillStyle = '#1d4f9a'; k2.fillRect(0, 0, 128, 32); k2.fillStyle = '#fff'; k2.font = 'bold 16px sans-serif'; k2.textAlign = 'center'; k2.fillText('Mihai Viteazul', 64, 22);
    MT.signBlue = new THREE.MeshStandardMaterial({ map: tex(e), roughness: 0.5, side: THREE.DoubleSide }); }            // over the ledge: above the terrain already
  return MT;
}

// ------------------------------------------------------------------ build
export function buildPasarela(B, world) {
  const st = state();
  if (!st) return null;
  const { F, sB, yAx, ledge } = st;
  const Mt = mats();
  const A = { ledge: new Acc(), ledgeTop: new Acc(), wall: new Acc(), banner: new Acc(), chalk: new Acc(), marking: new Acc(), beam: new Acc(), signRound: new Acc(), signPlate: new Acc(), signBlue: new Acc() };
  const G = { red: [], lattice: [], white: [], steps: [], brown: [], panel: [], post: [], yellow: [], stringer: [], stepsDark: [] };
  const box = (x, z, hx, hz, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hx, hz, rot, y0, y1, tag));
  const P2 = (s, o) => Wf(F, s, o), P3 = (s, o, y) => { const [x, z] = P2(s, o); return [x, y, z]; };
  const [ux, uz] = F.dir(sB), rx = -uz, rz = ux, ROT = -Math.atan2(uz, ux);
  // a drape over (s, o) cells with its own height function
  // (an inner edge given as a function of s is followed at both ends of each strip: no steps along a diverging edge)
  const sheet = (acc, s0, s1, o0f, o1, h, ds = 2, dO = 2, tile = 3) => {
    const oA = typeof o0f === 'function' ? o0f : () => o0f;
    for (let s = s0; s < s1 - 1e-6; s += ds) {
      const sN = Math.min(s1, s + ds), a0 = oA(s), b0 = oA(sN), k = Math.max(1, Math.ceil((o1 - Math.min(a0, b0)) / dO - 1e-6));
      for (let j = 0; j < k; j++) {
        const c = [[s, a0 + (o1 - a0) * j / k], [sN, b0 + (o1 - b0) * j / k], [sN, b0 + (o1 - b0) * (j + 1) / k], [s, a0 + (o1 - a0) * (j + 1) / k]].map(([a, b]) => { const [x, z] = P2(a, b); return [x, h(x, z, a, b), z]; });
        acc.quad(c[0], c[1], c[2], c[3], UP, [c[0][0] / tile, c[0][2] / tile, c[1][0] / tile, c[1][2] / tile, c[2][0] / tile, c[2][2] / tile, c[3][0] / tile, c[3][2] / tile]);
      }
    }
  };

  // ---- the ledge (grass and scrub between the wall, the exit road and the hillside)
  sheet(A.ledgeTop, WALL.s0, LEDGE.s1 - 8, WALL.o1, 24, (x, z) => (ledge(x, z) ?? heightAt(x, z)) + 0.01);
  // the verge before it, past DN1's gravel and the exit
  // (from the exit's start 8 cm under its right edge: the asphalt is drawn over the verge, so no ground shows between)
  const gV = (x, z) => heightAt(x, z) + 0.01, e0 = EXIT_START[0][0];
  sheet(A.ledge, 470, e0, 4.6, 24, gV);
  sheet(A.ledge, e0, WALL.s0, (s) => lin(EXIT_START, s) + 2.05, 24, gV);
  // ---- the wall along DN1's edge: 0.3 m over the ledge, its south end sloping down to DN1
  for (let s = WALL.s0; s < WALL.s1 - 1e-6; s += 2) {
    const t = Math.min(WALL.s1, s + 2), yb = (a) => yAx(a) - 0.3, yt = (a) => Math.max(yAx(a) + 0.05, yAx(a) + lin(RISE, a) + 0.3) * Math.min(1, (a - WALL.s0) / 8) + yAx(a) * (1 - Math.min(1, (a - WALL.s0) / 8));
    const f0 = P3(s, WALL.o0, 0), f1 = P3(t, WALL.o0, 0), b0 = P3(s, WALL.o1, 0), b1 = P3(t, WALL.o1, 0);
    const Y = (p, y) => [p[0], y, p[2]];
    A.wall.quad(Y(f0, yb(s)), Y(f1, yb(t)), Y(f1, yt(t)), Y(f0, yt(s)), [-rx, 0, -rz], [s / 2.5, yb(s) / 2.5, t / 2.5, yb(t) / 2.5, t / 2.5, yt(t) / 2.5, s / 2.5, yt(s) / 2.5]);
    A.wall.quad(Y(f0, yt(s)), Y(f1, yt(t)), Y(b1, yt(t)), Y(b0, yt(s)), UP, [s / 2.5, 0, t / 2.5, 0, t / 2.5, 0.14, s / 2.5, 0.14]);
    A.wall.quad(Y(b0, yb(s)), Y(b1, yb(t)), Y(b1, yt(t)), Y(b0, yt(s)), [rx, 0, rz], [s / 2.5, yb(s) / 2.5, t / 2.5, yb(t) / 2.5, t / 2.5, yt(t) / 2.5, s / 2.5, yt(s) / 2.5]);
    const [cx, cz] = P2((s + t) / 2, (WALL.o0 + WALL.o1) / 2);
    if (yt(s) - yAx(s) > 0.25) box(cx, cz, 1.02, (WALL.o1 - WALL.o0) / 2, Math.atan2(-uz, ux), yb(s), Math.max(yt(s), yt(t)), 'wall');
  }
  // ---- the exit's guardrail on the ledge, a white post on the wall's end, the exit's edge lines
  {
    const ex = road(EXIT), FE = frame(pairs(ex.p));
    guardrail(A.beam, G.post, world, F, P2, 552, 640, 4.5, undefined, { h: (x, z) => ledge(x, z) ?? heightAt(x, z) });
    const line = (pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [a, b] = [pts[i], pts[i + 1]], ya = a[2], yb = b[2];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l * 0.075, nz = (b[0] - a[0]) / l * 0.075;
        A.marking.quad([a[0] - nx, ya, a[1] - nz], [b[0] - nx, yb, b[1] - nz], [b[0] + nx, yb, b[1] + nz], [a[0] + nx, ya, a[1] + nz], UP, [0, 0, l / 4, 0, l / 4, 1, 0, 1]);
      }
    };
    const left = [], right = [];
    // the left line leaves DN1's edge line and bends out (photo); the right one along the hillside; both on the exit's
    // asphalt (its ribbon: flat across at the axis's height plus its dy)
    for (let s = 1; s < FE.local(...P2(640, 8.4)).s; s += 2) {
      const q = FE.at(s), n = F.local(q.x, q.z);
      if (!n) continue;
      const y = heightAt(q.x, q.z) + (typeof ex.dy === 'function' ? ex.dy(q.x, q.z) : 0.035) + 0.018;
      if (n.o - 1.95 >= 3.35) left.push([...Wf(FE, s, -1.95), y]);
      if (n.s > 530) right.push([...Wf(FE, s, 1.95), y]);
    }
    line(left); line(right);
    const [px, pz] = P2(WALL.s0 + 9, WALL.o1 + 0.15), py = ledge(px, pz) ?? heightAt(px, pz);
    boxAt(G.white, px, py + 0.5, pz, 0.2, 1.0, 0.2, ROT); box(px, pz, 0.1, 0.1, 0, py, py + 1, 'post');
  }

  // ---- the footbridge: DN1's level at the bridge, the deck's frame along it (a = along the deck from its west end)
  const y0 = yAx(sB), L = BR.o1 - BR.o0, mid = (BR.o0 + BR.o1) / 2;
  const DP = (a, side, y) => P3(sB + side * BR.hw, BR.o0 + a, y0 + y);           // side -1: the south face (towards the camera)
  {
    // walkway slab, bottom chords, banner panels, top rails
    const [dx, dz] = P2(sB, mid);
    boxAt(G.red, dx, y0 + (BR.bot + BR.deck) / 2, dz, BR.hw * 2, BR.deck - BR.bot, L, ROT);
    for (const side of [-1, 1]) {
      const [cx, cz] = P2(sB + side * BR.hw, mid);
      boxAt(G.red, cx, y0 + BR.bot + 0.15, cz, 0.25, 0.3, L, ROT);
      boxAt(G.red, cx, y0 + BR.top - 0.06, cz, 0.12, 0.12, L, ROT);
      // the banners between the lattice ends, on both faces
      const a0 = 1.4, a1 = L - 2.2, yb = BR.bot + 0.35, yt = BR.top - 0.15;
      for (const f of [-1, 1]) {                                                    // outer and inner faces
        const n = [ux * side * f, 0, uz * side * f], p = (a, y) => { const q = DP(a, side, y); return [q[0] + n[0] * 0.07, q[1], q[2] + n[2] * 0.07]; };
        A.banner.quad(p(a0, yb), p(a1, yb), p(a1, yt), p(a0, yt), n, [0, 0, 1, 0, 1, 1, 0, 1]);
      }
      // lattice railings at the ends
      for (const [b0, b1] of [[0, a0], [a1, L]]) for (let a = b0; a <= b1 + 1e-6; a += 0.2) { const q = DP(a, side, (BR.deck + BR.top) / 2); boxAt(G.lattice, q[0], q[1], q[2], 0.03, BR.top - BR.deck, 0.03, ROT); }
      // the arch and its hangers
      const archY = (a) => { const t = (a - L / 2) / (L / 2 - 0.2); return BR.deck + 0.7 + (BR.apex - BR.deck - 0.7) * (1 - t * t); };
      let prev = null;
      for (let k = 0; k <= 20; k++) { const a = 0.2 + (L - 0.4) * k / 20, q = DP(a, side, archY(a)); if (prev) tube(G.red, prev, q, 0.11, 8); prev = q; }
      for (let a = 2.0; a < L - 1.9; a += 2.0) tube(G.red, DP(a, side, BR.top), DP(a, side, archY(a)), 0.025, 5);
      box(cx, cz, L / 2, 0.08, Math.atan2(-rz, rx), y0 + BR.deck, y0 + BR.top, 'rail');
    }
    for (let a = 2.0; a < L - 1.9; a += 4.0) { const p = DP(a, -1, BR.bot + 0.1), q = DP(a, 1, BR.bot + 0.1); tube(G.red, p, q, 0.06, 6); }   // cross beams under the deck
    // the white pier on the west, the thin one on the ledge
    const [wx, wz] = P2(sB, -17.0), gw = heightAt(wx, wz);
    boxAt(G.white, wx, (gw - 0.3 + y0 + BR.bot) / 2, wz, 0.7, y0 + BR.bot - gw + 0.3, 1.5, ROT);
    box(wx, wz, 0.4, 0.8, Math.atan2(-uz, ux), gw - 0.3, y0 + BR.bot, 'pier');
    const [ex, ez] = P2(sB, 5.3), ge = ledge(ex, ez) ?? heightAt(ex, ez);
    boxAt(G.white, ex, (ge + y0 + BR.bot) / 2, ez, 0.45, y0 + BR.bot - ge, 0.45, ROT);
    box(ex, ez, 0.25, 0.25, 0, ge, y0 + BR.bot, 'pier');
  }
  // ---- the flight of steps down to the south on the west side, with its landing and railings
  {
    const sTop = sB - BR.hw - 0.2, sBot = sTop - STAIR.run, [bx, bz] = P2(sBot, STAIR.o), gB = heightAt(bx, bz), yTop = y0 + BR.deck;
    const nSt = Math.max(8, Math.round((yTop - gB) / 0.17)), tread = STAIR.run / nSt;
    // landing (joins the deck's west end)
    const [lx, lz] = P2(sB, (STAIR.o + BR.o0) / 2 - 0.2); boxAt(G.steps, lx, yTop - 0.15, lz, BR.hw * 2 + 0.4, 0.3, Math.abs(STAIR.o - BR.o0) + STAIR.hw * 2, ROT);
    for (let k = 0; k < nSt; k++) {
      const s = sTop - (k + 0.5) * tread, y = yTop - (k + 1) * (yTop - gB) / nSt, [x, z] = P2(s, STAIR.o);
      boxAt(G.steps, x, y + 0.085 - 0.09, z, tread + 0.02, 0.2, STAIR.hw * 2, ROT);
    }
    for (const sd of [-1, 1]) {
      const o = STAIR.o + sd * (STAIR.hw + 0.05);
      tube(G.red, P3(sTop, o, yTop - 0.35), P3(sBot, o, gB - 0.1), 0.09, 6);                       // stringers
      tube(G.lattice, P3(sTop, o, yTop + 0.95), P3(sBot, o, gB + 0.95), 0.03, 6);                   // handrails
      for (let k = 0; k <= nSt; k += 3) { const s = sTop - k * tread, y = yTop - k * (yTop - gB) / nSt; tube(G.lattice, P3(s, o, y), P3(s, o, y + 0.95), 0.02, 4); }
      const [cx, cz] = P2((sTop + sBot) / 2, o); box(cx, cz, STAIR.run / 2, 0.06, Math.atan2(-uz, ux), gB, yTop + 1, 'rail');
    }
    for (const s of [sTop - 0.3, sBot + 1]) { const [px, pz] = P2(s, STAIR.o + STAIR.hw + 0.4), py = s > sBot + 2 ? yTop : gB; cyl(G.white, px, heightAt(px, pz), pz, py - heightAt(px, pz), 0.18); }
    st.stair = { sTop, sBot, yTop, gB };
  }
  // ---- the enclosure at the deck's east end (dark brown, then light grey panels)
  for (const t of TOWER) {
    const s0 = sB + t.ds0, s1 = sB + t.ds1, [cx, cz] = P2((s0 + s1) / 2, (t.o0 + t.o1) / 2);
    let g = Infinity; for (const [a, b] of [[s0, t.o0], [s1, t.o0], [s0, t.o1], [s1, t.o1]]) { const [x, z] = P2(a, b); g = Math.min(g, ledge(x, z) ?? heightAt(x, z)); }
    boxAt(G[t.mat], cx, (g - 0.3 + y0 + t.top) / 2, cz, s1 - s0, y0 + t.top - g + 0.3, t.o1 - t.o0, ROT);
    box(cx, cz, (s1 - s0) / 2, (t.o1 - t.o0) / 2, Math.atan2(-uz, ux), g - 0.3, y0 + t.top, 'house');
  }
  // ---- the east flight (photo 72): landing in front of the brown enclosure, straight down to the south onto the ledge
  {
    const oS = STAIR_E.o, hw = STAIR_E.hw, sTop = sB + STAIR_E.land[0], yTop = y0 + BR.deck, lg = (s) => { const [x, z] = P2(s, oS); return ledge(x, z) ?? heightAt(x, z); };
    let n = 10; while (n < 34 && (yTop - lg(sTop - n * 0.28)) / n > 0.175) n++;
    const run = n * 0.28, sBot = sTop - run, gB = lg(sBot), rise = (yTop - gB) / n;
    // the landing (joins the deck through the enclosure) on four brown posts
    { const [lx, lz] = P2(sB + (STAIR_E.land[0] + STAIR_E.land[1]) / 2, oS); boxAt(G.stepsDark, lx, yTop - 0.1, lz, STAIR_E.land[1] - STAIR_E.land[0], 0.2, 2 * hw + 0.1, ROT);
      for (const [a, b] of [[STAIR_E.land[0] + 0.1, -hw + 0.1], [STAIR_E.land[0] + 0.1, hw - 0.1], [STAIR_E.land[1] - 0.1, -hw + 0.1], [STAIR_E.land[1] - 0.1, hw - 0.1]]) { const [x, z] = P2(sB + a, oS + b), g = ledge(x, z) ?? heightAt(x, z); boxAt(G.stringer, x, (g + yTop - 0.2) / 2, z, 0.12, yTop - 0.2 - g, 0.12, ROT); } }
    for (let k = 0; k < n; k++) {
      const s = sTop - (k + 0.5) * 0.28, y = yTop - (k + 1) * rise, [x, z] = P2(s, oS);
      boxAt(G.stepsDark, x, y - 0.02, z, 0.3, 0.05, 2 * hw, ROT);
    }
    for (const sd of [-1, 1]) {
      const o = oS + sd * (hw + 0.04);
      tube(G.stringer, P3(sTop, o, yTop - 0.3), P3(sBot, o, gB - 0.05), 0.09, 6);
      tube(G.yellow, P3(sTop, o, yTop + 1.0), P3(sBot - 0.3, o, gB + 1.0), 0.028, 6);
      tube(G.yellow, P3(sTop, o, yTop + 0.5), P3(sBot, o, gB + 0.5), 0.018, 5);
      for (let k = 0; k <= n; k++) { const s = sTop - k * 0.28, y = yTop - k * rise; tube(G.yellow, P3(s, o, y), P3(s, o, y + 1.0), 0.013, 4); }
      const [cx, cz] = P2((sTop + sBot) / 2, o); box(cx, cz, run / 2, 0.05, Math.atan2(-uz, ux), gB, yTop + 1.05, 'rail');
    }
    // the landing's railing (south and east sides), a short run at the foot
    const rail = (pts, y) => { for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], pa = P3(sB + a[0], oS + a[1], y), pb = P3(sB + b[0], oS + b[1], y), l = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
      tube(G.yellow, [pa[0], y + 1.0, pa[2]], [pb[0], y + 1.0, pb[2]], 0.028, 6); tube(G.yellow, [pa[0], y + 0.5, pa[2]], [pb[0], y + 0.5, pb[2]], 0.018, 5);
      for (let t = 0; t <= l + 1e-6; t += 0.14) { const f = t / (l || 1), q = [pa[0] + (pb[0] - pa[0]) * f, pa[2] + (pb[2] - pa[2]) * f]; tube(G.yellow, [q[0], y, q[1]], [q[0], y + 1.0, q[1]], 0.013, 4); }
      box((pa[0] + pb[0]) / 2, (pa[2] + pb[2]) / 2, l / 2, 0.05, Math.atan2(-(pb[2] - pa[2]), pb[0] - pa[0]), y, y + 1.05, 'rail'); } };
    rail([[STAIR_E.land[1], hw + 0.04], [STAIR_E.land[0], hw + 0.04]], yTop);
    rail([[STAIR_E.land[1], -hw - 0.04], [STAIR_E.land[0], -hw - 0.04]], yTop);
    rail([[sBot - sB - 0.3, hw + 0.04], [sBot - sB - 1.6, hw + 0.04], [sBot - sB - 1.6, hw + 0.9]], gB);
    st.stairE = { sTop, sBot, yTop, gB };
    // photo 72: a guardrail from the flight's foot along the exit's west side towards the junction
    { const pa = P2(sBot - 1.2, 7.05), pb = P2(sB + 0.5, 8.6), Fg = frame([pa, pb]);                       // (clear of the exit's left edge)
      guardrail(A.beam, G.post, world, Fg, (s, o) => Wf(Fg, s, o), 0, Fg.L, -0.01, undefined, { h: (x, z) => ledge(x, z) ?? heightAt(x, z) }); }
    // the street lamp at the junction's west corner, the no-vehicles sign on it with its plates
    { const [lx, lz] = P2(sB + 1.8, 9.6), gl = ledge(lx, lz) ?? heightAt(lx, lz), [ux2, uz2] = F.dir(sB);
      cyl(G.post, lx, gl - 0.3, lz, 8.3, 0.09, 0.06, 8);
      tube(G.post, [lx, gl + 7.9, lz], [lx + uz2 * 1.1, gl + 8.05, lz - ux2 * 1.1], 0.035, 5);
      boxAt(G.post, lx + uz2 * 1.25, gl + 8.0, lz - ux2 * 1.25, 0.55, 0.08, 0.22, ROT + Math.PI / 2);
      const face = (w, h, y, key) => { const c = [lx - ux2 * 0.08, y, lz - uz2 * 0.08], a = [-uz2 * w / 2, 0, ux2 * w / 2];
        A[key].quad([c[0] - a[0], y - h / 2, c[2] - a[2]], [c[0] + a[0], y - h / 2, c[2] + a[2]], [c[0] + a[0], y + h / 2, c[2] + a[2]], [c[0] - a[0], y + h / 2, c[2] - a[2]], [-ux2, 0, -uz2], [0, 0, 1, 0, 1, 1, 0, 1]); };
      face(0.62, 0.62, gl + 3.0, 'signRound'); face(0.5, 0.62, gl + 2.35, 'signPlate'); face(0.5, 0.12, gl + 1.97, 'signBlue');
      box(lx, lz, 0.1, 0.1, 0, gl - 1, gl + 8, 'pole'); }
  }
  // ---- the southbound's outer guardrail by the bridge, a concrete barrier in front of the west pier
  guardrail(A.beam, G.post, world, F, (s, o) => Wf(F, s, o), sB - 60, sB - 32, -12.0);
  guardrail(A.beam, G.post, world, F, (s, o) => Wf(F, s, o), sB + 12, sB + 50, -12.0);
  for (let s = sB - 31; s < sB + 11; s += 3) {
    const [cx, cz] = P2(s + 1.5, -12.0), y = heightAt(cx, cz);
    boxAt(G.white, cx, y + 0.12, cz, 2.96, 0.3, 0.6, ROT); boxAt(G.white, cx, y + 0.55, cz, 2.96, 0.6, 0.26, ROT);
    box(cx, cz, 1.5, 0.3, Math.atan2(-uz, ux), y - 0.3, y + 0.85, 'barrier');
  }
  // ---- the white marl scarps on the hillside ahead
  for (const P of CHALK) chalkDrape(A.chalk, P, 0.15, 6, 22);

  // ---- flush
  A.ledge.flush(B, Mt.verge, null, { noCast: true }); A.ledgeTop.flush(B, Mt.ledgeTop, null, { noCast: true }); A.wall.flush(B, Mt.wall); A.banner.flush(B, Mt.banner); A.chalk.flush(B, Mt.chalk, null, { noCast: true });
  A.marking.flush(B, Mt.marking, null, { noCast: true }); A.beam.flush(B, Mt.beam); A.signRound.flush(B, Mt.signRound); A.signPlate.flush(B, Mt.signPlate); A.signBlue.flush(B, Mt.signBlue);
  for (const k of Object.keys(G)) if (G[k].length) B.geo(Mt[k], merged(G[k]));

  // walkable: the ledge, the deck, the steps (a car under the deck keeps DN1's ground: bridgeHeight's rule)
  const sf = st.stair;
  const surface = (x, z) => {
    const q = F.local(x, z);
    if (!q) return null;
    if (Math.abs(q.s - sB) <= BR.hw && q.o >= BR.o0 && q.o <= BR.o1) return y0 + BR.deck;
    if (Math.abs(q.o - STAIR.o) <= STAIR.hw + 0.05 && q.s <= sf.sTop && q.s >= sf.sBot) return sf.gB + (sf.yTop - sf.gB) * (q.s - sf.sBot) / (sf.sTop - sf.sBot);
    if (Math.abs(q.o - (STAIR.o + BR.o0) / 2) <= 1.5 && Math.abs(q.s - sB) <= BR.hw + 0.2) return y0 + BR.deck;
    const se = st.stairE;
    if (Math.abs(q.o - STAIR_E.o) <= STAIR_E.hw && q.s <= se.sTop && q.s >= se.sBot) return se.gB + (se.yTop - se.gB) * (q.s - se.sBot) / (se.sTop - se.sBot);
    if (Math.abs(q.o - STAIR_E.o) <= STAIR_E.hw && q.s > se.sTop && q.s <= sB + STAIR_E.land[1] + 0.2) return se.yTop;
    return ledge(x, z);
  };
  const bb = []; for (const [s, o] of [[LEDGE.s0, -22], [LEDGE.s0, LEDGE.o1], [LEDGE.s1, -22], [LEDGE.s1, LEDGE.o1]]) bb.push(P2(s, o));
  const bbox = { x0: Math.min(...bb.map(p => p[0])), x1: Math.max(...bb.map(p => p[0])), z0: Math.min(...bb.map(p => p[1])), z1: Math.max(...bb.map(p => p[1])) };

  // photo 67's view: the Street View camera 0.84 m right of the lane divider, 1.4° right, 2.8° up the road
  const [cx, cz] = Wf(F, CAM.s, CAM.o), [vx, vz] = F.dir(CAM.s), a = CAM.yaw * Math.PI / 180;
  const dx = vx * Math.cos(a) - vz * Math.sin(a), dz = vz * Math.cos(a) + vx * Math.sin(a);
  const slope = (yAx(CAM.s + 20) - yAx(CAM.s - 20)) / 40;
  return { type: 'pasarela', name: 'DN1 · pasarela de la ieșirea spre Breaza', surface, bbox,
    view: { from: [cx, cz], to: [cx + dx * 60, cz + dz * 60], pitch: CAM.pitch + Math.atan(slope), fov: CAM.fov },
    // photo 72: on the exit before the junction, the east flight and the enclosure on the left (focal length ~990 px)
    view72: { from: Wf(F, CAM72.s, CAM72.o), to: Wf(F, CAM72.ts, CAM72.to), pitch: CAM72.pitch, fov: CAM72.fov } };
}

// the terrain under a polygon, lifted a little (big cells: far away)
function chalkDrape(acc, P, lift, maxEdge, tile) {
  const faces = THREE.ShapeUtils.triangulateShape(P.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const emit = (a, b, c) => {
    const l = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
    if (l > maxEdge) {
      const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      emit(a, ab, ca); emit(ab, b, bc); emit(ca, bc, c); emit(ab, bc, ca); return;
    }
    const V = [a, b, c].map(([x, z]) => [x, heightAt(x, z) + lift, z]);
    // steep faces: the texture runs down the slope (u along x, v along the height)
    acc.quad(V[0], V[1], V[2], V[0], UP, [a[0] / tile, V[0][1] / tile, b[0] / tile, V[1][1] / tile, c[0] / tile, V[2][1] / tile, a[0] / tile, V[0][1] / tile]);
  };
  for (const [i, j, k] of faces) emit(P[i], P[j], P[k]);
}
