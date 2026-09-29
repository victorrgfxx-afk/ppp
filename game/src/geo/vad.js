import * as THREE from 'three';
import { GEO, heightAt, gridHeight, addFineZone, addHolePoly, inPoly, polyDist } from './data.js';
import { M } from '../materials.js';
import { Acc } from './bridge.js';
import { canvas, tex, grain, blobs, boxAt, merged, frame, pairs, road, clamp01 } from './pitigaia.js';
import { guardrail, guardrailMaterials } from './cantacuzino.js';

// The DJ101R bridge from Poiana Câmpina down to DN1 (OSM way 17505067, 330 m; "Podul Vadului"), from the user's
// Street View screenshots at 45.1425988 N 25.6948875 E: photo 61 on the approach (curving left onto the bridge),
// photo 62 from Strada Gării, which passes under its first span right by the west abutment.
// From the west it crosses Strada Gării (s ~ 25 m along the deck), the two tracks of the CF 300 main line (61, 67),
// a gravel road (122), a track (159) and the Prahova (299), landing at the DN1 junction (330).
//   Strada Gării: OSM draws it 3-5 m west of its asphalt on the aerial from ~70 m north of the bridge to ~100 m
//   south of it (the houses along it match the aerial), so that stretch is moved onto the aerial first; the
//   abutment's front stands ~0.8 m off its west edge (photo 62).
//   heights: photo 62 puts the top of the deck ~7 m over Strada Gării (at the abutment's front edge: ~5 m of
//   clearance under ~2 m of deck and cornice) - 26.95 m on the game's datum, which also clears the railway by ~6.5 m;
//   the deck's shadow on the aerial keeps 6-9 m over the ground all the way, so from there the deck descends with the
//   valley (~6.7 %) to the DN1 junction (12.2 m).
//   cross-section (photo 61): 7.5 m of asphalt with a solid centre line, raised sidewalks ~1.2 m behind concrete kerbs,
//   railings on white-painted cornices; below (photo 62): white outer girders, a dark soffit.
//   railings: repainted by 2025-26 (photo 62): blue bars, the panels' frames alternately blue and white (photo 61,
//   2023: black and yellow); a yellow plate across the sidewalks where they start.
//   west end (both photos): the approach (Strada 23 August) climbs on an embankment with W-beam guardrails on both
//   sides up to where the railings start; from there wing walls flush with the deck's edges run ~6.5 m to the
//   abutment's front, each with a paved quarter cone (1:1) in front, its apex at the wing wall's start; the
//   embankment's side is paved the same way just before. Stairs go down the south side just before the railing;
//   the lamp post with the flag is bolted to the south wing wall ~1 m from its front, ~2 m under the deck.
//   piers (none shown): frame piers (two columns and a cap) every ~20 m, clear of the road, the tracks and the river.
const ID = '17505067', APPROACH = '721120092';
const GARII_N = '1190212198', GARII_S = '14190389', GARII_W = '217351658';
const G_SHIFT = [-2.30, 3.98];                             // Strada Gării onto the aerial: 4.6 m towards bearing 72°
const X = { road: 3.75, kerb: 3.95, walk: 5.2, edge: 5.5, girder: 5.35, lift: 0.2 };   // across the deck (m from the axis)
const DEPTH = 1.7;                                        // top of the asphalt to the soffit
const CREST = 26.95, S_CREST = [6, 85], Y0 = 26.85;       // the deck's crest (m) and the join with the approach (photo 61:
                                                          // nearly level from the railings back to the curve)
const ABUT_E = 314;                                       // front face of the east abutment (s)
const WINGS = 8.6, BATTER = 2.5;                          // the west wing walls: the railings' start to the abutment's
                                                          // foot; its front face leans back 2.5 m (photo 62, resected)
const SINK = 0.4;                                         // the embankment's top under the deck's surface
const PIERS = [38, 57, 78, 100, 114, 136, 156, 178, 200, 222, 244, 266, 288];
const LAMPS = [[52, -1], [96, 1], [140, -1], [184, 1], [228, -1], [272, 1], [310, -1, true]];   // s, side (+1 south), flag
const PANEL = 2.5;                                         // railing panel length (photo 62)
const STAIRS = { back: 0.9, w: 1.2 };                      // the stairs' top before the railings' start, their width

const smooth = (a, b, t) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------------ Strada Gării onto the aerial
// the two ways meeting south of the bridge and the lane joining them there move together (the junction stays one
// point); the moved stretch fades out over ~35 m north of the bridge and ~70 m south of the junction; the lot fences
// and village poles along it follow
let MOVED = false;
const BEDS = [];                                           // the moved stretches: new axis, weight per vertex, width
function moveGarii() {
  if (MOVED) return;
  MOVED = true;
  const n = road(GARII_N), s = road(GARII_S), w = road(GARII_W);
  if (!n || !s) return;
  const ways = [[n, (t) => smooth(65, 100, t)], [s, (t) => 1 - smooth(60, 130, t)]];
  if (w) ways.push([w, (t, L) => 1 - smooth(0, 25, L - t)]);
  const frames = [], nodes = new Map(), key = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
  for (const [r, k] of ways) {
    const F = frame(pairs(r.p)), L = F.L, out = [];
    F.P.forEach((p, i) => { const v = k(F.S[i], L); if (v > 0.001) nodes.set(key(p[0], p[1]), v); });
    for (let i = 0; i < F.P.length; i++) {
      if (i > 0) {
        const a = F.S[i - 1], b = F.S[i], m = Math.ceil((b - a) / 3);
        for (let j = 1; j < m; j++) { const t = a + (b - a) * j / m, v = k(t, L); if (v > 0.001 && v < 0.999) { const q = F.at(t); out.push([q.x, q.z, t]); } }
      }
      out.push([F.P[i][0], F.P[i][1], F.S[i]]);
    }
    r.p = out.flatMap(([x, z, t]) => { const v = k(t, L); return [x + G_SHIFT[0] * v, z + G_SHIFT[1] * v]; });
    frames.push({ F, k, L });
    BEDS.push({ F: frame(pairs(r.p)), v: out.map(([, , t]) => k(t, L)), hw: r.w / 2 });
  }
  // other ways ending on the moved stretch keep their joint: their end moves too, fading out over 15 m
  const movedIds = new Set(ways.map(([r]) => r.id));
  for (const r of GEO.roads) {
    if (movedIds.has(r.id)) continue;
    const P = pairs(r.p), last = P.length - 1;
    for (const [e, dir] of [[0, 1], [last, -1]]) {
      const v = nodes.get(key(P[e][0], P[e][1]));
      if (!v) continue;
      let d = 0;
      for (let i = e; i >= 0 && i <= last; i += dir) {
        if (i !== e) d += Math.hypot(P[i][0] - P[i - dir][0], P[i][1] - P[i - dir][1]);
        const k = v * (1 - smooth(0, 15, d)); if (k < 0.001) break;
        P[i] = [P[i][0] + G_SHIFT[0] * k, P[i][1] + G_SHIFT[1] * k];
      }
    }
    r.p = P.flat();
  }
  const weight = (x, z) => {
    let best = null;
    for (const { F, k, L } of frames) { const q = F.local(x, z); if (q && q.d < 12 && (!best || q.d < best.d)) best = { d: q.d, v: k(q.s, L) }; }
    return best ? best.v : 0;
  };
  const movedF = new Set();
  for (const f of GEO.fences || []) for (let i = 1; i < f.length; i += 2) { const v = weight(f[i], f[i + 1]); if (v > 0.01) movedF.add(f); f[i] += G_SHIFT[0] * v; f[i + 1] += G_SHIFT[1] * v; }
  for (const run of GEO.poles || []) for (const p of run.p) { const v = weight(p[0], p[1]); p[0] += G_SHIFT[0] * v; p[1] += G_SHIFT[1] * v; }
  // lot fences that now run into a house are dropped
  const houses = [];
  for (const b of GEO.buildings || []) {
    const P = []; for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]);
    if (frames.some(({ F }) => { const q = F.local(P[0][0], P[0][1]); return q && q.d < 40; })) houses.push(P);
  }
  GEO.fences = (GEO.fences || []).filter(f => {
    if (!movedF.has(f)) return true;
    for (let i = 1; i < f.length - 2; i += 2) {
      const mx = (f[i] + f[i + 2]) / 2, mz = (f[i + 1] + f[i + 3]) / 2;
      if (houses.some(P => inPoly(P, mx, mz) || polyDist(P, mx, mz) < 0.4)) return false;
    }
    return true;
  });
}

let BR = null;
export function vadBridge() {
  if (BR !== null) return BR || null;
  const r = road(ID), a = road(APPROACH);
  if (!r || !a) { BR = false; return null; }
  const F = frame(pairs(r.p)), FA = frame(pairs(a.p)), L = F.L, LA = FA.L;
  const W = (s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
  const WA = (s, o) => { const q = FA.at(s), [ux, uz] = FA.dir(s); return [q.x - uz * o, q.z + ux * o]; };
  // the approach and the bridge as one path (the guardrails and photo 61's view run across the join)
  const PA = pairs(a.p), PB = pairs(r.p), join = Math.hypot(PA[PA.length - 1][0] - PB[0][0], PA[PA.length - 1][1] - PB[0][1]) < 0.5;
  const FC = frame([...PA, ...(join ? PB.slice(1) : PB)]);
  const WC = (s, o) => { const q = FC.at(s), [ux, uz] = FC.dir(s); return [q.x - uz * o, q.z + ux * o]; };
  // the west abutment's front ~0.8 m off Strada Gării's west edge (photo 62), the railings' start WINGS before it
  let sx = 21, sin = 1;
  const sg = road(GARII_N);
  if (sg) {
    const S = frame(pairs(sg.p));
    let bd = Infinity;
    for (let s = 5; s <= 45; s += 0.25) {
      const q = S.local(...W(s, 0));
      if (q && q.d < bd) { bd = q.d; sx = s; const [ux, uz] = F.dir(s), [vx, vz] = S.dir(q.s); sin = Math.sqrt(Math.max(0.05, 1 - (ux * vx + uz * vz) ** 2)); }
    }
  }
  const ABUT_W = sx - (sg ? sg.w / 2 : 3.2) / sin - 0.8, JOINT = ABUT_W - WINGS, ABUT_TOP = ABUT_W - BATTER;
  // the deck's profile: up from the approach to the crest over Strada Gării and the railway, then down the valley
  const yEnd = gridHeight(GEO, ...W(L, 0)) + 0.05, dA = 40, dB = 12, g = (CREST - yEnd) / (L - S_CREST[1] - dA / 2 - dB / 3);
  const yDeck = (s) => {
    if (s <= S_CREST[0]) { const t = clamp01(s / S_CREST[0]); return Y0 + (CREST - Y0) * (1 - (1 - t) * (1 - t)); }
    if (s <= S_CREST[1]) return CREST;
    const u = s - S_CREST[1];
    if (u <= dA) return CREST - g * u * u / (2 * dA);
    const y1 = CREST - g * dA / 2, e = L - dB;
    if (s <= e) return y1 - g * (u - dA);
    const v = s - e, y2 = y1 - g * (e - S_CREST[1] - dA);
    return y2 - g * v + (2 * g / 3) * v * v / (2 * dB);
  };
  // the approach's profile: from the ground at its start (the natural grade) to the deck's end (its grade)
  const ya0 = gridHeight(GEO, ...WA(0, 0)) + 0.035, m0 = (gridHeight(GEO, ...WA(3, 0)) - gridHeight(GEO, ...WA(0, 0))) / 3, m1 = (Y0 - yDeck(1)) / -1;
  const yApp = (s) => {
    const t = clamp01(s / LA), h00 = 2 * t ** 3 - 3 * t * t + 1, h10 = t ** 3 - 2 * t * t + t, h01 = -2 * t ** 3 + 3 * t * t, h11 = t ** 3 - t * t;
    return h00 * ya0 + h10 * LA * m0 + h01 * Y0 + h11 * LA * m1;
  };
  // along the joined path
  const yPath = (s) => s <= LA ? yApp(s) : yDeck(s - LA);
  // walkable: the carriageway and the raised sidewalks (null off the deck)
  const surface = (x, z) => {
    const q = F.local(x, z);
    if (!q || q.s < 0.05 || q.s > L - 0.05 || Math.abs(q.o) > X.edge) return null;
    return yDeck(q.s) + (Math.abs(q.o) > X.road ? X.lift : 0);
  };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of F.P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  BR = { r, a, F, FA, FC, L, LA, W, WA, WC, yDeck, yApp, yPath, surface, ABUT_W, ABUT_TOP, JOINT, x0: x0 - 8, x1: x1 + 8, z0: z0 - 8, z1: z1 + 8 };
  return BR;
}

// ------------------------------------------------------------------ before the terrain: the embankment, no clutter
export function prepareVad() {
  moveGarii();
  const V = vadBridge();
  if (!V) return false;
  const { r, a, F, FA, L, LA, W, WA, yDeck, yApp, ABUT_W, ABUT_TOP, JOINT } = V;
  r.own = true;                                           // the deck, its surface and markings are built here
  a.solidAt = [0, LA + 1];                                // photo 61: a solid centre line round the curve, no edge lines
  a.noEdgeAt = [0, LA + 1];
  // the house by the sign (photo 62: pale ochre walls; photo 61: its grey standing-seam roof beyond the stairs)
  for (const bd of GEO.buildings || []) if (String(bd.id) === '431613941') bd.o = { ...(bd.o || {}), wall: 'sand', roof: 'roofMetalGray', roofMat: 'metal' };
  // the houses by the approach keep their ground (a retaining edge instead of the slope)
  const near = [];
  for (const b of GEO.buildings || []) {
    const P = []; for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]);
    if (P.some(([x, z]) => Math.hypot(x - W(0, 0)[0], z - W(0, 0)[1]) < 90)) near.push(P);
  }
  const TOP = X.edge + 0.1;
  // the approach's embankment (1:1.5, grassed); by the bridge 1:1 and paved, the fill between the wing walls, the
  // quarter cones in front of them (their apex at the railings' start)
  // the moved Strada Gării lies on the old road's cut and fill (build_geo.py levelled the terrain along the OSM line):
  // its new bed takes the old axis's height across the asphalt, blending into the ground over 3 m
  const bed = (x, z) => {
    const g = gridHeight(GEO, x, z);
    let best = null;
    for (const B of BEDS) {
      const q = B.F.local(x, z);
      if (!q || q.d > B.hw + 4) continue;
      const i = Math.min(q.i, B.v.length - 2), t = clamp01((q.s - B.F.S[i]) / ((B.F.S[i + 1] - B.F.S[i]) || 1)), v = B.v[i] + (B.v[i + 1] - B.v[i]) * t;
      if (v < 0.01) continue;
      const c = B.F.at(q.s), y = gridHeight(GEO, c.x - G_SHIFT[0] * v, c.z - G_SHIFT[1] * v), k = 1 - smooth(B.hw + 0.8, B.hw + 4, q.d);
      if (!best || q.d < best.d) best = { d: q.d, h: g + (y - g) * k };
    }
    return best ? best.h : g;
  };
  V.bed = bed;
  const raise = (x, z) => {
    const g = bed(x, z);
    let h = g;
    const qa = FA.local(x, z), qb = F.local(x, z, 0, 6);
    // (past the approach's end the deck's own rules apply: its end height would reach the asphalt there)
    if (qa && !(qa.s > LA - 0.01 && qb && qb.s > 0.01)) h = Math.max(h, yApp(qa.s) - Math.max(0, qa.d - TOP) / 1.5);
    if (qb && qb.s > 0.01) {
      const ao = Math.abs(qb.o) - X.edge;
      if (qb.s <= JOINT) h = Math.max(h, yDeck(qb.s) - SINK - Math.max(0, ao));
      else if (qb.s <= ABUT_W + 0.5 && ao < 14) {
        if (ao <= 0) h = Math.max(h, yDeck(JOINT) - SINK - (qb.s - JOINT));           // hidden: as the cone at the wall
        else h = Math.max(h, yDeck(JOINT) - SINK - Math.hypot(qb.s - JOINT, ao));
      }
    }
    if (h - g < 0.01) return g;
    for (const P of near) if (inPoly(P, x, z) || polyDist(P, x, z) < 1.2) return g;
    return h;
  };
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const s of [0, LA / 2, LA]) { const [x, z] = WA(s, 0); bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); }
  for (const s of [0, ABUT_W]) { const [x, z] = W(s, 0); bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); }
  // the terrain is rebuilt at 1 m in every 5 m cell the embankment touches (a cell is picked by its centre, so the
  // mask of raised ground is widened by 4 m): no draped paving or kerb over coarse, lower cells at its foot
  for (const B of BEDS) B.F.P.forEach(([x, z], i) => { if (B.v[i] > 0.01) { bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); } });
  const Z = { x0: bb.x0 - 18, x1: bb.x1 + 18, z0: bb.z0 - 18, z1: bb.z1 + 18 };
  const mw = Math.ceil(Z.x1 - Z.x0) + 1, mh = Math.ceil(Z.z1 - Z.z0) + 1, up = new Uint8Array(mw * mh), mask = new Uint8Array(mw * mh);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) { const x = Z.x0 + i, z = Z.z0 + j; if (Math.abs(raise(x, z) - gridHeight(GEO, x, z)) > 0.01) up[j * mw + i] = 1; }
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) if (up[j * mw + i]) for (let v = Math.max(0, j - 4); v <= Math.min(mh - 1, j + 4); v++) for (let u = Math.max(0, i - 4); u <= Math.min(mw - 1, i + 4); u++) mask[v * mw + u] = 1;
  addFineZone({ ...Z, test: (x, z) => { const i = Math.round(x - Z.x0), j = Math.round(z - Z.z0); return i >= 0 && j >= 0 && i < mw && j < mh && mask[j * mw + i] === 1; }, h: raise });
  // no generated lot fences, poles or scattered trees on the embankment and under the deck
  const band = (Wf, s0, s1, o) => { const A = [], Bk = []; for (let s = s0; s <= s1 + 1e-6; s += 4) { A.push(Wf(Math.min(s, s1), -o)); Bk.push(Wf(Math.min(s, s1), o)); } return [...A, ...Bk.reverse()]; };
  addHolePoly(band(WA, 0, LA, 14), { noFences: true });
  addHolePoly(band(W, 0, L, 8), { noFences: true });
  addHolePoly(band(W, 0, ABUT_W + 1, 14), { noFences: true });
  // photo 62: the gravel yard south-west of the abutment (the Astra's spot) and the junction's west corner are open
  {
    // (west of the street only: from the deck's south edge down the street's west edge to the junction)
    const sg = road(GARII_N);
    if (sg) {
      const FN = frame(pairs(sg.p)), t0 = FN.local(...W(ABUT_W + 4, 5.5)).s, P = [];
      for (let t = JOINT - 6; t <= ABUT_W; t += 3) P.push(W(t, 5));
      for (let t = t0; t <= FN.L + 1e-6; t += 2) { const q = FN.at(t), [ux, uz] = FN.dir(Math.min(t, FN.L - 4.01)); P.push([q.x - uz * 3.4, q.z + ux * 3.4]); }
      P.push(W(JOINT - 6, 24));
      addHolePoly(P, { noFences: true });
    }
    const ss = road(GARII_S);
    if (ss) {
      const S2 = frame(pairs(ss.p)), Q = [];
      for (let t = 0; t <= 16; t += 2) { const q = S2.at(t), [ux, uz] = S2.dir(t); Q.push([q.x - uz * 3.3, q.z + ux * 3.3]); }
      for (let t = 16; t >= 0; t -= 2) { const q = S2.at(t), [ux, uz] = S2.dir(t); Q.push([q.x - uz * 14, q.z + ux * 14]); }
      addHolePoly(Q, { noFences: true });
      // no utility pole stands by the camera in photo 62
      for (const run of GEO.poles || []) run.p = run.p.filter(p => { const l = S2.local(p[0], p[1]); return !(l && l.s < 16 && l.d < 9); });
    }
  }
  for (const run of GEO.poles || []) run.p = run.p.filter(p => { const q = F.local(p[0], p[1]); return !(q && q.d < 8); });
  // photo 62: the linden in front of the house by the sign, bushes where the paving ends west of the cone
  const T = GEO.trees, ss = road(GARII_S);
  if (T && ss) {
    // the linden: on photo 62's ray (4° at 8.5 m from its camera), the only spot there off the asphalt and outside the
    // house's footprint, right behind the sign as in the photo; low crown, ~9 m
    const S2 = frame(pairs(ss.p)), q = S2.at(10.3), [ux, uz] = S2.dir(10.3), cx = q.x - uz * 2.5, cz = q.z + ux * 2.5;
    const add = [[cx + 8.5 * 0.6155, cz + 8.5 * 0.7879, 1, 0.85], [...W(JOINT - 9.5, 9), 12, 0.6], [...W(JOINT - 11.5, 12.5), 12, 0.75], [...W(JOINT - 13, 7.5), 12, 0.5], [...W(JOINT - 8.5, 14), 1, 0.7]];
    const n = T.n + add.length, x = new Float32Array(n), z = new Float32Array(n), t = new Uint8Array(n), sc = new Float32Array(n);
    x.set(T.x); z.set(T.z); t.set(T.t); sc.set(T.s);
    add.forEach(([ax, az, at, as], k) => { x[T.n + k] = ax; z[T.n + k] = az; t[T.n + k] = at; sc[T.n + k] = as; });
    GEO.trees = { n, x, z, t, s: sc };
    // the weathered picket fence of the yard in front of the house, from the sign past photo 62's camera
    const fp = []; for (let t = 4.9; t <= 14.01; t += 3) { const q2 = S2.at(t), [vx, vz] = S2.dir(t); fp.push(q2.x + vz * 3.9, q2.z - vx * 3.9); }
    (GEO.fences ??= []).push([5, ...fp]);
  }
  return true;
}

// ------------------------------------------------------------------ materials
let MT = null;
function mats() {
  if (MT) return MT;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const R = (() => { let s = 61; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967296; })();
  // the railing's bars (blue, 12 cm apart) between the frame's rails, transparent between them
  const bars = canvas(64, 64), bg = bars.getContext('2d');
  bg.clearRect(0, 0, 64, 64); bg.fillStyle = '#2a64ad';
  for (let x = 2; x < 64; x += 16) bg.fillRect(x, 0, 4, 64);
  const barsTex = tex(bars, { repeat: true }); barsTex.premultiplyAlpha = false;
  // weathered concrete for the abutment and the piers (rain streaks, a little graffiti low on the wall)
  const wall = canvas(256, 256), wg = wall.getContext('2d');
  wg.fillStyle = '#c3beb3'; wg.fillRect(0, 0, 256, 256);
  blobs(wg, 0, 0, 256, 256, 60, 8, 40, ['rgba(150,145,135,0.35)', 'rgba(200,196,188,0.3)', 'rgba(120,116,108,0.25)'], R);
  for (let i = 0; i < 40; i++) { wg.fillStyle = `rgba(90,86,78,${0.08 + R() * 0.12})`; wg.fillRect(R() * 256, 0, 1 + R() * 3, 60 + R() * 196); }
  grain(wg, 256, 256, 14, R);
  // the cones' concrete paving: grey, cast in bays, stained
  const pav = canvas(256, 256), pg = pav.getContext('2d');
  pg.fillStyle = '#9d9a93'; pg.fillRect(0, 0, 256, 256);
  blobs(pg, 0, 0, 256, 256, 70, 6, 34, ['rgba(120,117,110,0.35)', 'rgba(170,167,160,0.3)', 'rgba(95,92,86,0.25)'], R);
  pg.strokeStyle = 'rgba(70,68,64,0.45)'; pg.lineWidth = 2; for (const t of [0, 128]) { pg.beginPath(); pg.moveTo(t, 0); pg.lineTo(t, 256); pg.stroke(); pg.beginPath(); pg.moveTo(0, t); pg.lineTo(256, t); pg.stroke(); }
  grain(pg, 256, 256, 16, R);
  const graffiti = canvas(256, 128), gg = graffiti.getContext('2d');
  gg.clearRect(0, 0, 256, 128); gg.lineWidth = 5; gg.lineCap = 'round';
  for (let k = 0; k < 6; k++) { gg.strokeStyle = ['#2b2b33', '#3a3f6a', '#4a2b3a'][k % 3]; gg.beginPath(); let x = 20 + k * 36, y = 60 + R() * 30; gg.moveTo(x, y); for (let j = 0; j < 5; j++) { x += 6 + R() * 10; y += (R() - 0.5) * 50; gg.lineTo(x, y); } gg.stroke(); }
  const flag = canvas(96, 64), fg = flag.getContext('2d');
  [['#1f3f8f', 0], ['#f2cf1c', 32], ['#cf2a2a', 64]].forEach(([c, x]) => { fg.fillStyle = c; fg.fillRect(x, 0, 32, 64); });
  // 30 km/h
  const lim = canvas(128, 128), lg = lim.getContext('2d');
  lg.fillStyle = '#f4f4f2'; lg.beginPath(); lg.arc(64, 64, 63, 0, 7); lg.fill();
  lg.fillStyle = '#c4161c'; lg.beginPath(); lg.arc(64, 64, 60, 0, 7); lg.fill();
  lg.fillStyle = '#f4f4f2'; lg.beginPath(); lg.arc(64, 64, 46, 0, 7); lg.fill();
  lg.fillStyle = '#111'; lg.font = 'bold 54px Arial, Helvetica, sans-serif'; lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.fillText('30', 64, 67);
  const whiteConc = M.concrete.clone(); whiteConc.color = new THREE.Color(0xe9e7e1);
  const soffit = M.concrete.clone(); soffit.color = new THREE.Color(0x7d7a74);
  const walk = M.concrete.clone(); walk.color = new THREE.Color(0xb9b6ae);
  MT = {
    asphalt: M.asphalt, apron: Object.assign(M.asphalt.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), marking: M.marking, walk, kerb: M.curb ?? M.concrete, white: whiteConc, soffit,
    wall: std({ map: tex(wall), roughness: 0.92 }),
    graffiti: std({ map: tex(graffiti), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    pier: std({ map: tex(wall), roughness: 0.9, color: 0xe6e2da }),
    paving: std({ map: tex(pav, { repeat: true }), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    blue: std({ color: 0x2a64ad, roughness: 0.45, metalness: 0.35 }),
    whiteRail: std({ color: 0xe8ebee, roughness: 0.45, metalness: 0.3 }),
    bars: std({ map: barsTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.35 }),
    yellow: std({ color: 0xd9b52c, roughness: 0.6, metalness: 0.4 }),
    steel: std({ color: 0x55595c, roughness: 0.5, metalness: 0.7 }),
    black: std({ color: 0x1f2123, roughness: 0.55, metalness: 0.5 }),
    galv: M.galv, led: std({ color: 0x2b2e31, roughness: 0.5, metalness: 0.5 }),
    ledGlass: std({ color: 0xdfe4e6, roughness: 0.2, emissive: 0x000000 }),
    flag: std({ map: tex(flag), side: THREE.DoubleSide, roughness: 0.85 }),
    limit: std({ map: tex(lim), roughness: 0.45 }),
    ...guardrailMaterials(),
  };
  return MT;
}

const UP = [0, 1, 0], DOWN = [0, -1, 0];
// ------------------------------------------------------------------ build
export function buildVad(B, world) {
  const V = vadBridge();
  if (!V) return null;
  const Mt = mats();
  const { F, FA, FC, L, LA, W, WA, WC, yDeck, yApp, yPath, ABUT_W, ABUT_TOP, JOINT } = V;
  const bedH = V.bed || ((x, z) => gridHeight(GEO, x, z));             // the ground without the embankment
  const A = { apron: new Acc(), asphalt: new Acc(), marking: new Acc(), walk: new Acc(), kerb: new Acc(), white: new Acc(), soffit: new Acc(), wall: new Acc(), paving: new Acc(), bars: new Acc(), graffiti: new Acc(), beam: new Acc(), yellow: new Acc() };
  const G = { blue: [], whiteRail: [], yellow: [], steel: [], black: [], galv: [], led: [], ledGlass: [], pier: [], walk: [], post: [], flag: [], limit: [] };
  const P3 = (s, o, dy) => { const [x, z] = W(s, o); return [x, yDeck(s) + dy, z]; };
  const STEP = 2;
  const stations = []; for (let s = 0; s < L - 1e-6; s += STEP) stations.push(s); stations.push(L);
  for (const s of [JOINT, ABUT_TOP, ABUT_W]) if (!stations.some(v => Math.abs(v - s) < 0.05)) stations.push(s);
  stations.sort((p, q) => p - q);
  // horizontal strip between offsets o0..o1 at height dy over the deck, from s0 to s1
  const strip = (acc, s0, s1, o0, o1, dy, hint = UP, uvs = 2) => {
    for (let i = 0; i < stations.length - 1; i++) {
      const a = Math.max(s0, stations[i]), b = Math.min(s1, stations[i + 1]); if (b <= a) continue;
      acc.quad(P3(a, o0, dy), P3(a, o1, dy), P3(b, o1, dy), P3(b, o0, dy), hint, [o0 / uvs, a / uvs, o1 / uvs, a / uvs, o1 / uvs, b / uvs, o0 / uvs, b / uvs]);
    }
  };
  // vertical face at offset o, from dy0 to dy1 over the deck, facing outwards (sign of fo)
  const face = (acc, s0, s1, o, dy0, dy1, fo, uvs = 2) => {
    for (let i = 0; i < stations.length - 1; i++) {
      const a = Math.max(s0, stations[i]), b = Math.min(s1, stations[i + 1]); if (b <= a) continue;
      const [ux, uz] = F.dir((a + b) / 2), n = [-uz * fo, 0, ux * fo];
      acc.quad(P3(a, o, dy0), P3(b, o, dy0), P3(b, o, dy1), P3(a, o, dy1), n, [a / uvs, dy0 / uvs, b / uvs, dy0 / uvs, b / uvs, dy1 / uvs, a / uvs, dy1 / uvs]);
    }
  };

  // ---- the deck: asphalt, the solid centre line, kerbs, sidewalks; from the railings' start the cornices, over the
  //      spans the outer girders and the soffit
  strip(A.asphalt, 0, L, -X.road, X.road, 0.02);
  strip(A.marking, 0, L, -0.075, 0.075, 0.035);
  for (const sd of [-1, 1]) {
    const o = (v) => sd * v, lo = (a, b) => sd > 0 ? [a, b] : [-b, -a];
    face(A.kerb, 0, L, o(X.road), 0.02, X.lift, -sd);                             // kerb faces the road
    strip(A.kerb, 0, L, ...lo(X.road, X.kerb), X.lift);
    strip(A.walk, 0, L, ...lo(X.kerb, X.walk), X.lift);
    strip(A.walk, 0, JOINT, ...lo(X.walk, X.edge), X.lift);                        // on the embankment: to the edge,
    face(A.kerb, 0, JOINT, o(X.edge), -SINK - 0.35, X.lift, sd);                    // its face down to the paving
    strip(A.white, JOINT, L, ...lo(X.walk, X.edge), X.lift + 0.12);                // the cornice's top
    face(A.white, JOINT, L, o(X.walk), X.lift, X.lift + 0.12, -sd);
    face(A.white, JOINT, L, o(X.edge), -0.45, X.lift + 0.12, sd);                  // the cornice's face
    strip(A.white, ABUT_TOP, L, ...lo(X.girder, X.edge), -0.45, DOWN);
    face(A.white, ABUT_TOP, L, o(X.girder), -DEPTH, -0.45, sd);                       // the outer girder
  }
  strip(A.soffit, ABUT_TOP - 0.3, ABUT_E + 0.5, -X.girder, X.girder, -DEPTH, DOWN);
  // precast beams under the slab, dark gaps between them
  for (const o of [-3.6, -1.2, 1.2, 3.6]) for (const sd of [-1, 1]) face(A.soffit, ABUT_TOP, ABUT_E, o + sd * 0.35, -DEPTH, -0.3, sd);
  for (const o of [-3.6, -1.2, 1.2, 3.6]) strip(A.soffit, ABUT_TOP, ABUT_E, o - 0.35, o + 0.35, -DEPTH - 0.001, DOWN);
  // the deck's east end at the junction
  {
    const [ux, uz] = F.dir(L), n = [ux, 0, uz];
    A.white.quad(P3(L, -X.edge, -DEPTH), P3(L, X.edge, -DEPTH), P3(L, X.edge, 0), P3(L, -X.edge, 0), n);
  }

  // ---- railings: posts and alternately blue / white frames, blue bars; yellow plates over the joints
  const colliders = [];
  for (const sd of [-1, 1]) {
    const o = sd * (X.walk + 0.15), top = X.lift + 0.12 + 1.1;
    for (let s = JOINT, k = 0; s < L - 0.5; s += PANEL, k++) {
      const s1 = Math.min(L - 0.5, s + PANEL), [ux, uz] = F.dir((s + s1) / 2), rot = -Math.atan2(uz, ux);
      const pa = P3(s, o, 0), pb = P3(s1, o, 0), fr = k % 2 ? G.whiteRail : G.blue;
      const post = (p) => boxAt(G.blue, p[0], p[1] + X.lift + 0.12 + 0.55, p[2], 0.07, 1.1, 0.07, rot);
      post(pa);
      const len = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]), cx = (pa[0] + pb[0]) / 2, cz = (pa[2] + pb[2]) / 2, cy = (pa[1] + pb[1]) / 2;
      const tilt = Math.atan2(pb[1] - pa[1], len);
      const bar = (y, h, t) => { const g = new THREE.BoxGeometry(len, h, t); g.rotateZ(tilt); g.rotateY(rot); g.translate(cx, cy + y, cz); fr.push(g); };
      bar(top - 0.04, 0.08, 0.08); bar(X.lift + 0.12 + 0.12, 0.05, 0.05);
      // the bars: a transparent panel between the rails
      const b0 = X.lift + 0.12 + 0.15, b1 = top - 0.08;
      A.bars.quad([pa[0], pa[1] + b0, pa[2]], [pb[0], pb[1] + b0, pb[2]], [pb[0], pb[1] + b1, pb[2]], [pa[0], pa[1] + b1, pa[2]], [-uz * sd, 0, ux * sd], [0, 0, len / 0.5, 0, len / 0.5, 1, 0, 1]);
      colliders.push([cx, cz, len / 2, 0.15, Math.atan2(-uz, ux), cy - 1, cy + top]);
    }
    const pe = P3(L - 0.5, o, 0), [ux, uz] = F.dir(L - 0.5); boxAt(G.blue, pe[0], pe[1] + X.lift + 0.12 + 0.55, pe[2], 0.07, 1.1, 0.07, -Math.atan2(uz, ux));
    // plates across the sidewalks
    for (const s of [JOINT, ABUT_E]) A.yellow.quad(P3(s - 0.25, sd * X.kerb, X.lift + 0.006), P3(s + 0.25, sd * X.kerb, X.lift + 0.006), P3(s + 0.25, sd * X.walk, X.lift + 0.006), P3(s - 0.25, sd * X.walk, X.lift + 0.006), UP);
  }
  // steel strips of the joints across the carriageway
  for (const s of [JOINT, ABUT_E]) { const p = P3(s, 0, 0.03), [ux, uz] = F.dir(s); boxAt(G.steel, p[0], p[1], p[2], 0.25, 0.02, 2 * X.road, -Math.atan2(uz, ux)); }
  for (const c of colliders) world.addStatic(new world.Box(c[0], c[1], c[2], c[3], c[4], c[5], c[6], 'rail'));

  // ---- piers: two columns and a cap beam
  for (const s of PIERS) {
    const [ux, uz] = F.dir(s), rot = -Math.atan2(uz, ux), capY = yDeck(s) - DEPTH;
    for (const o of [-3.2, 3.2]) {
      const [x, z] = W(s, o), g0 = heightAt(x, z) - 0.6, h = capY - 1.0 - g0;
      const c = new THREE.CylinderGeometry(0.5, 0.5, h, 16); c.translate(x, g0 + h / 2, z); G.pier.push(c);
      world.addStatic(new world.Box(x, z, 0.5, 0.5, 0, g0, capY, 'pier'));
    }
    const [cx, cz] = W(s, 0); boxAt(G.pier, cx, capY - 0.5, cz, 1.1, 1.0, 2 * X.edge - 0.3, rot);
  }

  // ---- the west abutment: its front face by Strada Gării, leaning back BATTER from its foot to the soffit, the wing
  //      walls, the paved quarter cones
  {
    const s = ABUT_W, top = yDeck(ABUT_TOP) - DEPTH, [ux, uz] = F.dir(s);
    const foot = Math.min(...[-X.edge, 0, X.edge].map(o => heightAt(...W(s + 0.3, o)))) - 0.4;
    // the front face
    for (let i = 0; i < 10; i++) {
      const oa = -X.edge + i * (2 * X.edge / 10), ob = oa + 2 * X.edge / 10, [ax, az] = W(s, oa), [bx, bz] = W(s, ob), [cx, cz] = W(ABUT_TOP, ob), [dx, dz] = W(ABUT_TOP, oa);
      const ga = heightAt(ax + ux * 0.3, az + uz * 0.3) - 0.4, gb = heightAt(bx + ux * 0.3, bz + uz * 0.3) - 0.4;
      A.wall.quad([ax, ga, az], [bx, gb, bz], [cx, top, cz], [dx, top, dz], [ux, 0, uz], [oa / 4, ga / 4, ob / 4, gb / 4, ob / 4, top / 4, oa / 4, top / 4]);
    }
    // a little graffiti low on its south half (photo 62)
    {
      const k = 0.25, sg = ABUT_W - BATTER * k, [gx, gz] = W(sg, 3), gy = heightAt(...W(s + 0.3, 3)) + 0.1, t = BATTER / (top - gy + 0.4);
      const P = (o, h) => { const [x, z] = W(sg - h * t, o); return [x + ux * 0.03, gy + h, z + uz * 0.03]; };
      void gx; void gz;
      A.graffiti.quad(P(1.6, 0), P(4.4, 0), P(4.4, 1.4), P(1.6, 1.4), [ux, 0, uz]);
    }
    for (const sd of [-1, 1]) {
      const oE = sd * X.edge;
      // the wing wall under the cornice, from the natural ground up (the cone hides its lower part); its front edge
      // follows the face's lean
      for (let k = 0; k < 8; k++) {
        const b0 = JOINT + k * WINGS / 8, b1 = JOINT + (k + 1) * WINGS / 8, t0 = JOINT + k * (WINGS - BATTER) / 8, t1 = JOINT + (k + 1) * (WINGS - BATTER) / 8;
        const [ax, az] = W(b0, oE), [bx, bz] = W(b1, oE), [cx, cz] = W(t1, oE), [dx, dz] = W(t0, oE);
        const ga = gridHeight(GEO, ...W(b0, sd * (X.edge + 0.3))) - 0.4, gb = gridHeight(GEO, ...W(b1, sd * (X.edge + 0.3))) - 0.4;
        const [nx, nz] = F.dir((b0 + b1) / 2), yc = yDeck(t1) - 0.45, yd = yDeck(t0) - 0.45;
        A.wall.quad([ax, ga, az], [bx, gb, bz], [cx, yc, cz], [dx, yd, dz], [-nz * sd, 0, nx * sd], [b0 / 4, ga / 4, b1 / 4, gb / 4, t1 / 4, yc / 4, t0 / 4, yd / 4]);
      }
      // the paving, draped on the embankment's side (8 m before the wing wall) and on the cone, down to the ground
      const ds = 0.5, dO = 0.5;
      for (let s0 = JOINT - 8; s0 < ABUT_W + 0.5 - 1e-6; s0 += ds) for (let o0 = X.edge; o0 < X.edge + 13; o0 += dO) {
        const c = [[s0, o0], [s0 + ds, o0], [s0 + ds, o0 + dO], [s0, o0 + dO]].map(([p, q]) => { const [x, z] = W(p, sd * q), y = heightAt(x, z); return [x, y + 0.03, z, y - bedH(x, z)]; });
        if (Math.max(...c.map(v => v[3])) < 0.02) continue;                     // all down on the natural ground
        A.paving.quad(c[0].slice(0, 3), c[1].slice(0, 3), c[2].slice(0, 3), c[3].slice(0, 3), UP, [s0 / 4, o0 / 4, (s0 + ds) / 4, o0 / 4, (s0 + ds) / 4, (o0 + dO) / 4, s0 / 4, (o0 + dO) / 4]);
      }
      const [wx, wz] = W((JOINT + ABUT_W) / 2, sd * (X.edge - 0.3)), [dx, dz] = F.dir((JOINT + ABUT_W) / 2);
      world.addStatic(new world.Box(wx, wz, WINGS / 2, 0.35, Math.atan2(-dz, dx), gridHeight(GEO, wx, wz) - 1, yDeck(ABUT_W) - 0.45, 'abutment'));
    }
    // the face's collider (the embankment behind is terrain): the lower half, where cars and walkers reach it
    const [mx, mz] = W(s - BATTER * 0.2 - 0.6, 0); world.addStatic(new world.Box(mx, mz, 0.6, X.edge, Math.atan2(-uz, ux), foot, top, 'abutment'));
  }
  // ---- the east abutment, low, at the junction
  {
    const s = ABUT_E, top = yDeck(s) - DEPTH, [ux, uz] = F.dir(s);
    for (let i = 0; i < 6; i++) {
      const oa = -X.edge + i * (2 * X.edge / 6), ob = oa + 2 * X.edge / 6, [ax, az] = W(s, oa), [bx, bz] = W(s, ob);
      const ga = heightAt(ax - ux * 0.3, az - uz * 0.3) - 0.4, gb = heightAt(bx - ux * 0.3, bz - uz * 0.3) - 0.4;
      if (top > Math.min(ga, gb)) A.wall.quad([ax, ga, az], [bx, gb, bz], [bx, top, bz], [ax, top, az], [-ux, 0, -uz]);
    }
  }

  // ---- the approach (Strada 23 August on its embankment): sidewalks behind kerbs to the edge
  const PA = (s, o, dy) => { const [x, z] = WA(s, o); return [x, yApp(s) + dy, z]; };
  const aw = V.a.w / 2;
  for (let s = 12; s < LA - 1e-6; s += 2) {
    const t = Math.min(LA, s + 2), [ux, uz] = FA.dir(s + 1);
    for (const sd of [-1, 1]) {
      const o0 = sd * aw, o1 = sd * X.edge;
      A.walk.quad(PA(s, o0, X.lift), PA(s, o1, X.lift), PA(t, o1, X.lift), PA(t, o0, X.lift), UP);
      A.kerb.quad(PA(s, o0, 0.02), PA(t, o0, 0.02), PA(t, o0, X.lift), PA(s, o0, X.lift), [uz * sd, 0, -ux * sd], [0, 0, 1, 0, 1, 1, 0, 1]);
      A.kerb.quad(PA(s, o1, -0.5), PA(t, o1, -0.5), PA(t, o1, X.lift), PA(s, o1, X.lift), [-uz * sd, 0, ux * sd], [0, 0, 1, 0, 1, 1, 0, 1]);
    }
  }
  // W-beams on both sides from the approach onto the embankment by the bridge: the north one runs into the railing,
  // the south one stops at the stairs (photo 61)
  const beamAcc = new Acc(), posts = [];
  const onWalk = { h: (x, z, s) => yPath(s) + X.lift };
  const sStairs = LA + JOINT - STAIRS.back;
  guardrail(beamAcc, posts, world, FC, WC, 14, LA + JOINT - 0.2, -(X.edge - 0.12), undefined, { ...onWalk, open1: true });
  guardrail(beamAcc, posts, world, FC, WC, 14, sStairs - 1.1, X.edge - 0.12, undefined, { ...onWalk, open1: true });
  beamAcc.flush(B, Mt.beam); if (posts.length) B.geo(Mt.post, merged(posts));

  // ---- the stairs down the south side: from the sidewalk just before the railing, diagonally down the paved slope
  //      towards the west (photo 61: the handrails drop towards the camera; photo 62: the band along the paving's
  //      upper edge), black handrails on both sides
  {
    const s0 = JOINT - STAIRS.back;
    let s = s0, o = X.edge, y = yDeck(s0) + X.lift, n = 0;
    const steps = [];
    while (n < 80) {
      const s1 = s - 0.2, o1 = o + 0.2, [x1, z1] = W(s1, o1), g = heightAt(x1, z1);
      if (y - 0.17 <= g + 0.05) break;
      s = s1; o = o1; y -= 0.17; n++;
      steps.push([x1, y, z1, s, o]);
    }
    if (steps.length > 1) {
      const [ax, az] = W(s0, X.edge), [bx, bz] = W(steps[steps.length - 1][3], steps[steps.length - 1][4]);
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), fx = dx / l, fz = dz / l, rot = -Math.atan2(fz, fx);   // down the flight
      for (const [sx, sy, sz] of steps) { const h = sy - heightAt(sx, sz) + 0.35; boxAt(G.walk, sx, sy - h / 2, sz, 0.3, h, STAIRS.w, rot); }
      for (const side of [-1, 1]) {
        const off = side * (STAIRS.w / 2 - 0.05), px = -fz * off, pz = fx * off, a = steps[0], b = steps[steps.length - 1];
        const pa = [a[0] + px - fx * 0.28, a[1] + 0.95, a[2] + pz - fz * 0.28], pb = [b[0] + px, b[1] + 0.95, b[2] + pz];
        const d = new THREE.Vector3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]), dl = d.length(), g = new THREE.CylinderGeometry(0.025, 0.025, dl, 6);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2); G.black.push(g);
        for (let k = 0; k < steps.length; k += 5) { const q = steps[k]; boxAt(G.black, q[0] + px, q[1] + 0.475, q[2] + pz, 0.04, 0.95, 0.04); }
        const q = steps[steps.length - 1]; boxAt(G.black, q[0] + px, q[1] + 0.475, q[2] + pz, 0.04, 0.95, 0.04);
      }
    }
  }

  // ---- lamp posts (galvanised, an LED head over the road); the flag's post bolted to the south wing wall
  for (const [s, sd, flag] of [[ABUT_TOP - 1, 1, true], ...LAMPS]) {
    const [x, z] = W(s, sd * (X.edge + 0.25)), [ux, uz] = F.dir(s), y = flag ? yDeck(s) - DEPTH : yDeck(s) - 0.6, H = yDeck(s) + (flag ? 5.4 : 8.2) - y;
    const pole = new THREE.CylinderGeometry(0.06, 0.1, H, 10); pole.translate(x, y + H / 2, z); G.galv.push(pole);
    const nx = uz * sd, nz = -ux * sd;                                              // towards the road
    const arm = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6); arm.rotateZ(Math.PI / 2); arm.rotateY(-Math.atan2(nz, nx)); arm.translate(x + nx * 0.9, y + H - 0.1, z + nz * 0.9); G.galv.push(arm);
    boxAt(G.led, x + nx * 1.9, y + H - 0.12, z + nz * 1.9, 0.7, 0.1, 0.28, -Math.atan2(nz, nx));
    boxAt(G.ledGlass, x + nx * 1.9, y + H - 0.18, z + nz * 1.9, 0.6, 0.02, 0.22, -Math.atan2(nz, nx));
    world.addStatic(new world.Box(x, z, 0.12, 0.12, 0, y, y + H, 'pole'));
    if (flag) {
      // the tricolour on a short staff slanting out from the post, hanging
      const hx = x - nx * 0.05, hz = z - nz * 0.05, hy = y + H - 1.2, ox = -nx, oz = -nz;
      const staff = new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6); staff.rotateZ(-0.9); staff.rotateY(-Math.atan2(oz, ox)); staff.translate(hx + ox * 0.5, hy + 0.4, hz + oz * 0.5); G.galv.push(staff);
      const fx = hx + ox * 0.15, fz = hz + oz * 0.15, g = new THREE.BufferGeometry();
      const q = (a, b) => [fx + ox * a, hy + 0.8 - b, fz + oz * a];
      const p = [q(0, 0), q(0.9, 0.6), q(0.9, 1.5), q(0, 0), q(0.9, 1.5), q(0, 0.9)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
      g.computeVertexNormals(); G.flag.push(g);
    }
  }

  // ---- Strada Gării by the bridge (photo 62): the 30 km/h sign at the kerb ~4.5 m past the junction, facing the
  //      northbound traffic; photo 62's view from ~10 m further, resected on the abutment (the camera on the road's
  //      west edge, 334.6°, ~7.5° down, a vertical field of view of ~73°)
  let signPos = null;
  const bearing = (p, deg, d = 30) => { const b = deg * Math.PI / 180, e = Math.sin(b), n = Math.cos(b); return [p[0] + d * (-0.743 * e + 0.669 * n), p[1] + d * (0.669 * e + 0.743 * n)]; };
  // photo 61: 3 m before the bridge's start, just right of the centre line (the line runs from the frame's bottom,
  // left of centre), looking 82°; both railings' starts and the curve fall where they are in the photo
  const c61 = WC(LA - 3, 0.5);
  const views = { a: { from: c61, to: bearing(c61, 82) } };
  {
    const ss = road(GARII_S);
    if (ss) {
      const S2 = frame(pairs(ss.p));
      {
        const pt = S2.at(4.5), [ux, uz] = S2.dir(4.5), o = -(ss.w / 2 + 0.25);          // its left (north-east) edge
        const x = pt.x - uz * o, z = pt.z + ux * o, y = heightAt(x, z);
        const post = new THREE.CylinderGeometry(0.035, 0.035, 2.75, 8); post.translate(x, y + 1.375, z); G.galv.push(post);
        const face = new THREE.CircleGeometry(0.3, 24); face.rotateY(Math.atan2(ux, uz)); face.translate(x + ux * 0.04, y + 2.4, z + uz * 0.04); G.limit.push(face);   // faces south-east
        const back = new THREE.CircleGeometry(0.3, 24); back.rotateY(Math.atan2(-ux, -uz)); back.translate(x, y + 2.4, z); G.galv.push(back);
        world.addStatic(new world.Box(x, z, 0.06, 0.06, 0, y, y + 2.75, 'sign'));
        signPos = [x, z];
      }
      const p = S2.at(10.3), [ux, uz] = S2.dir(10.3), from = [p.x - uz * 2.5, p.z + ux * 2.5];
      views.b = { from, to: bearing(from, 334.6) };
    }
  }

  // ---- the junction's west corner (photo 62): one sweep of asphalt between Strada Gării and the lane going west
  {
    const ss = road(GARII_S), sw = road(GARII_W);
    if (ss && sw) {
      const S2 = frame(pairs(ss.p)), FW = frame(pairs(sw.p).reverse());
      const at = (Fr, t, o) => { const q = Fr.at(t), [ux, uz] = Fr.dir(t); return [q.x - uz * o, q.z + ux * o]; };
      const Q = [at(S2, 0.5, 3.25), at(S2, 7, 3.25), at(S2, 13, 3.25), at(S2, 13, 6.5), at(FW, 12, -6), at(FW, 12, -1.85), at(FW, 6, -1.85), at(FW, 2, -1.85)];
      const mx = Q.reduce((v, p) => v + p[0], 0) / Q.length, mz = Q.reduce((v, p) => v + p[1], 0) / Q.length;
      const Y = ([x, z]) => [x, heightAt(x, z) + 0.04, z], mid = (p, t) => [mx + (p[0] - mx) * t, mz + (p[1] - mz) * t];
      // a fan from its middle, each edge cut into <= 1 m pieces and 10 rings, draped on the ground
      for (let i = 0; i < Q.length; i++) {
        const a = Q[i], b = Q[(i + 1) % Q.length], m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
        for (let e = 0; e < m; e++) {
          const pa = [a[0] + (b[0] - a[0]) * e / m, a[1] + (b[1] - a[1]) * e / m], pb = [a[0] + (b[0] - a[0]) * (e + 1) / m, a[1] + (b[1] - a[1]) * (e + 1) / m];
          for (let k = 0; k < 10; k++) {
            const p = [mid(pa, k / 10), mid(pb, k / 10), mid(pb, (k + 1) / 10), mid(pa, (k + 1) / 10)];
            A.apron.quad(...p.map(Y), UP, p.flatMap(([x, z]) => [x / 4, z / 4]));
          }
        }
      }
    }
  }

  // ---- flush
  const flushA = [['apron', Mt.apron, { noCast: true }], ['asphalt', Mt.asphalt, { noCast: true }], ['marking', Mt.marking, { noCast: true }], ['walk', Mt.walk], ['kerb', Mt.kerb], ['white', Mt.white], ['soffit', Mt.soffit], ['wall', Mt.wall], ['paving', Mt.paving, { noCast: true }], ['bars', Mt.bars], ['graffiti', Mt.graffiti, { noCast: true }], ['yellow', Mt.yellow, { noCast: true }]];
  for (const [k, m, o] of flushA) A[k].flush(B, m, null, o ?? {});
  for (const [k, m] of [['blue', Mt.blue], ['whiteRail', Mt.whiteRail], ['yellow', Mt.yellow], ['steel', Mt.steel], ['black', Mt.black], ['galv', Mt.galv], ['led', Mt.led], ['ledGlass', Mt.ledGlass], ['pier', Mt.pier], ['walk', Mt.walk], ['flag', Mt.flag], ['limit', Mt.limit]]) if (G[k].length) B.geo(m, merged(G[k]));

  // the grey Opel Astra parked along the foot of the south cone, facing west (photo 62)
  const cars = [];
  {
    const s = JOINT + 2.5;
    let o = X.edge;
    while (o < X.edge + 14) { const [x, z] = W(s, o); if (heightAt(x, z) - bedH(x, z) < 0.05) break; o += 0.25; }
    const [x, z] = W(s, o + 1.3), [ux, uz] = F.dir(s);
    cars.push({ model: 'sedan', paint: 0x9ea3a6, x, z, h: Math.atan2(-ux, -uz) });
  }
  return {
    // the deck is walkable / drivable: index.js adds the surface to GEO.bridges once the roads are built
    type: 'vad', name: 'Podul Vadului (DJ101R)', bbox: { x0: V.x0, x1: V.x1, z0: V.z0, z1: V.z1 }, surface: V.surface, cars, W, WA, WC, L, LA, yDeck, yApp, ABUT_W, JOINT, sign: signPos, views,
  };
}
