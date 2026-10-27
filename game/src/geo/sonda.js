import * as THREE from 'three';
import { GEO, gridHeight, heightAt, addFineZone, addHolePoly, addFloorPoly, forestCode, polyDist, inPoly } from './data.js';
import { Acc } from './bridge.js';
import { ribbonPath } from './roads.js';
import { addForestMix, keepClearArea, TREE_T } from './trees.js';
import { M } from '../materials.js';
import { SNOW } from '../rain.js';
import { rng } from '../util.js';
import { canvas, tex, grain, blobs, boxAt, cyl, tuft, merged, clamp01, pairs, road } from './pitigaia.js';

// The oil wells in the wood south of the village (the user's photos 84-86, 45.1044027 N 25.7210507 E): at the end of
// the gravel road through the wood (OSM way 338364635), a gravel pad with a few old cracked concrete slabs in a
// clearing on the ridge, and two beam pumping units in blue welded-mesh fences, on one line with their horseheads
// outward:
//  * north-north-east: a big Vulcan unit (Bucharest): blue samson post with a vertical ladder up to a railed platform
//    round the saddle, blue walking beam with the red Vulcan logo, yellow pitmans and cranks with sector counterweights,
//    the yellow belt guard down to the motor;
//  * south-south-west: a smaller one: blue samson post with a ladder, the walking beam and the horsehead rusted
//    brown, a yellow box at the beam's tail, blue pitmans, an open yellow spoked sheave on the reducer, the wellhead with
//    its stuffing box, flowline and valves under the horsehead;
//  * between the fences the white electrical cabinets and a perforated concrete pole with a floodlight; safety signs
//    on the fences; a strip of dry grass between the gravel and the fences, tall grass with wild carrot inside them and
//    in the meadow to the south; the red Fiat Doblò Cargo parked on the pad; a broad shallow puddle that mirrors the rusty unit.
// Neither unit is in OSM. The layout is resected from the photos: both beams side-on in both (the line square to the
// view), the Vulcan farther in photo 84 and nearer in 85, the morning sun (~48-55 deg high) in the middle of photo 85
// -> the camera looks ~110 deg (ESE), the line runs ~195 deg; sizes from the pivots' heights over the horizon (the
// pivots ~6.0 and ~4.8 m high, the horseheads' radii ~3.8 and ~3.4 m: a bridle hangs from the pivot's height); the
// line's middle on the light blocks the aerial shows ~35 m south of the road's end (Esri World Imagery z18). The DEM
// has the clearing as a near level terrace; the pad is levelled. Both units pump all the time (~6 and ~7 strokes a
// minute): crank, pitmans, beam, horsehead, bridle and polished rod move as the real four-bar linkage does.
// Photo 86: the gravel road through the wood ~200 m before the clearing, from the driver's seat: ~3.6 m of grey
// gravel with two wheel ruts, last year's leaves on the verges, a high forest of slender beeches, hornbeams and oaks
// standing 1-3 m from it (the forest map leaves a ~15 m wide grassy corridor there: filled up to the verges).

// the site: the user's pin; compass east / north as game-frame vectors (the map is turned 42.02 deg)
const P0 = [-2785.19, -1937.13];
const EV = [-0.7429, 0.6693], NV = [0.6693, 0.7429];
const at = (e, n) => [P0[0] + EV[0] * e + NV[0] * n, P0[1] + EV[1] * e + NV[1] * n];
const dirOf = (az) => { const a = az * Math.PI / 180, e = Math.sin(a), n = Math.cos(a); return [EV[0] * e + NV[0] * n, EV[1] * e + NV[1] * n]; };
const toEN = (x, z) => { const dx = x - P0[0], dz = z - P0[1]; return [dx * EV[0] + dz * EV[1], dx * NV[0] + dz * NV[1]]; };
// the units' line (s: along it to the SSW), t across it (to the WNW: the pad's side)
const LINE_AZ = 195, CENTRE = [-1.5, -33];
const LD = dirOf(LINE_AZ), LT = dirOf(LINE_AZ + 90);
const C0 = at(...CENTRE);
const site = (s, t) => [C0[0] + LD[0] * s + LT[0] * t, C0[1] + LD[1] * s + LT[1] * t];
const st = (x, z) => { const dx = x - C0[0], dz = z - C0[1]; return [dx * LD[0] + dz * LD[1], dx * LT[0] + dz * LT[1]]; };
const UP = [0, 1, 0];
let FLOOR = null;                                                  // the pad's level
const ROAD = '338364635', ROAD_W = 3.6;
// the road's stretch through the wood (compass east of the pin, m) whose corridor is filled with forest
const WOOD_E = [-345, -48];

// the two units: s of the pivot on the line, which way the horsehead faces (-1: NNE, +1: SSW), the linkage drawn at
// a base size (Hs pivot height, A front arm = horsehead radius, C rear arm, I crank centre behind the pivot, Hg its
// height, R crank radius, P pitman length), then scaled by k to the measured size (pivots 7.5 and 6.2 m high: the
// horizon from the van's height in photo 85, the pivots' and the units' feet over and under it); strokes a minute,
// phase; beam depth, skid half-width, the samson post's front / rear feet
const UNITS = [
  { key: 'vulcan', s: -8.7, face: -1, k: 1.25, Hs: 6.0, A: 3.8, C: 3.1, I: 3.2, Hg: 1.95, R: 1.05, P: 4.1, spm: 6.2, ph: 0.4, beam: 0.64, skid: 1.25, fr: 1.3, rr: 1.9 },
  { key: 'rusty', s: 9.0, face: 1, k: 1.29, Hs: 4.8, A: 3.4, C: 2.6, I: 2.7, Hg: 1.5, R: 0.85, P: 3.3, spm: 7.1, ph: 2.6, beam: 0.5, skid: 1.0, fr: 1.1, rr: 1.15 },
];
// the photos' cameras (s, t, eye height, compass heading, pitch): resected on the pivots, the cabinets and the pole
// behind them (left of the tall cabinet in photo 85, right of it in 84: ~2 m behind them)
const CAM = {
  84: { s: 6.6, t: 12.6, eye: 1.5, az: 92.5, pitch: 0.04 },
  85: { s: -3.2, t: 21.1, eye: 1.55, az: 132, pitch: 0.078 },
};
const PUDDLE = { s: -0.4, t: 18.0, a: 2.7, b: 1.8 };
const VAN = { s: 8.8, t: 15.7, az: 200 };
// the campfire (src/campfire.js) on the gravel ~6 m west of the van, clear of its doors, the puddle and the fences; the
// log to sit on beyond it, the split logs piled by the van
const FIRE = { s: 10.5, t: 21.5, seat: [10.5, 23.25], wood: [12.7, 20.3] };

// the road's polyline: OSM, then on along the track the aerial shows from its end down to the pad
function roadPts() {
  const r = road(ROAD);
  if (!r) return null;
  const P = pairs(r.p);
  const d0 = Math.hypot(P[0][0] - P0[0], P[0][1] - P0[1]), d1 = Math.hypot(P[P.length - 1][0] - P0[0], P[P.length - 1][1] - P0[1]);
  if (d0 < d1) P.reverse();                                        // (from the village to the wells)
  // (the turn from the OSM way's end onto the track down to the pad rounded like a lorry's track: corner cutting, 3
  // passes, from 20 m before it; the track's first point lies on its line, so the turn rounds onto it)
  const c = P[P.length - 1], b = P[P.length - 2], l = Math.hypot(b[0] - c[0], b[1] - c[1]) || 1, k = Math.min(20, l * 0.5) / l;
  let T = [[c[0] + (b[0] - c[0]) * k, c[1] + (b[1] - c[1]) * k], c, site(-16, 8)];
  for (let it = 0; it < 3; it++) {
    const Q = [T[0]];
    for (let i = 0; i < T.length - 1; i++) { const [a, b] = [T[i], T[i + 1]]; Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    Q.push(T[T.length - 1]); T = Q;
  }
  return [...P.slice(0, -1), ...T];
}
const segDist = (P, x, z) => {
  let d = Infinity;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    d = Math.min(d, Math.hypot(x - ax - u * dx, z - az - u * dz));
  }
  return d;
};
// a band of half-width w along the polyline P (closed polygon)
function band(P, w) {
  const L = [], Rr = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    L.push([P[i][0] - dz / l * w, P[i][1] + dx / l * w]); Rr.push([P[i][0] + dz / l * w, P[i][1] - dx / l * w]);
  }
  return [...L, ...Rr.reverse()];
}

export function prepareSonda() {
  if (!GEO.H) return false;
  // the pad and the meadow round it: no scattered trees, grass under them (the gravel is draped over it)
  const pad = [[-26, 1], [-28, 14], [-20, 27], [0, 28], [20, 27], [36, 18], [38, -6], [24, -9], [-22, -6]].map(([s, t]) => site(s, t));
  addHolePoly(pad, { lawn: true, noFences: true });
  // the pad levelled (the DEM's terrace varies by ~1 m over it), blended over 8 m into the ground round it
  let sum = 0, n = 0;
  for (let s = -16; s <= 16; s += 4) for (let t = -3; t <= 20; t += 4) { sum += gridHeight(GEO, ...site(s, t)); n++; }
  FLOOR = sum / n;
  // (the zone reaches a cell beyond the blend: the 5 m cells it cuts out along its edge then lie where its height is
  // the ground's own, so the edges they share with the kept cells, drawn from the coarse grid, are where heightAt says;
  // ending right at the blend, the grass there stood above the levelled height: the road's gravel hid under it)
  const E = 8, M = E + 6, S0 = -18, S1 = 22, T0 = -6, T1 = 24;
  const cs = [site(S0 - M, T0 - M), site(S1 + M, T0 - M), site(S1 + M, T1 + M), site(S0 - M, T1 + M)];
  addFineZone({ x0: Math.min(...cs.map(p => p[0])), x1: Math.max(...cs.map(p => p[0])), z0: Math.min(...cs.map(p => p[1])), z1: Math.max(...cs.map(p => p[1])),
    test: (x, z) => { const [s, t] = st(x, z); return s > S0 - M && s < S1 + M && t > T0 - M && t < T1 + M; },
    h: (x, z) => {
      const [s, t] = st(x, z), g0 = gridHeight(GEO, x, z), d = Math.max(S0 - s, s - S1, T0 - t, t - T1, 0);
      // (the pad's own unevenness: the puddle's hollow, ruts and bumps of a few cm, a slight fall to the wood)
      const pu = Math.exp(-(((s - PUDDLE.s) / (PUDDLE.a * 1.3)) ** 2 + ((t - PUDDLE.t) / (PUDDLE.b * 1.3)) ** 2)) * 0.14;
      // (gentle enough for the gravel draped on it in ~0.7 m triangles to stay above the ground mesh)
      const w = 0.025 * Math.sin(s * 0.7 + t * 0.3) * Math.sin(t * 0.9 - s * 0.2);
      const fall = Math.min(0, t) * 0.04;
      return FLOOR - pu + w + fall + (g0 - FLOOR - w - fall) * clamp01(d / E) ** 1.5;
    } });
  // the road: built here (its own gravel with the ruts); through the wood its grassy corridor becomes forest up to the
  // verges, the ground there forest floor, no tree on the road
  const r = road(ROAD), P = roadPts();
  if (r && P) {
    r.own = 'sonda'; r.w = ROAD_W;
    // no generated village poles along it: no house stands by it, no line is mapped there, photo 86 shows none
    // (a flag only: nothing is cleared under it)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    (GEO.holes ??= []).push({ x0: x0 - 14, x1: x1 + 14, z0: z0 - 14, z1: z1 + 14, test: (x, z) => segDist(P, x, z) < 13, noFences: true, scatter: false });
    const W = P.filter(([x, z]) => { const e = toEN(x, z)[0]; return e > WOOD_E[0] && e < WOOD_E[1]; });
    if (W.length > 1 && GEO.forestBits) {
      const F = GEO.forest, B = GEO.forestBits;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of W) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const i0 = Math.floor((x0 - 20 + F.ext) / F.step), i1 = Math.ceil((x1 + 20 + F.ext) / F.step);
      const j0 = Math.floor((z0 - 20 + F.ext) / F.step), j1 = Math.ceil((z1 + 20 + F.ext) / F.step);
      const fill = [];
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -F.ext + i * F.step, z = -F.ext + j * F.step, d = segDist(W, x, z);
        if (d < 4.6 || d > 16 || forestCode(x, z)) continue;
        // (only where the wood stands beyond: the road's open stretches stay open)
        let wood = 0;
        for (const [ox, oz] of [[8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [-6, 6], [6, -6], [-6, -6]]) if (segDist(W, x + ox, z + oz) > d + 4 && forestCode(x + ox, z + oz)) wood++;
        if (wood) fill.push(j * F.n + i);
      }
      for (const k of fill) B[k >> 2] = (B[k >> 2] & ~(3 << ((k & 3) << 1))) | (1 << ((k & 3) << 1));
      addFloorPoly(band(W, 13));
      // the gravel and its first metre clear of the understory and the edge bushes too (photo 86: nothing grows on it)
      keepClearArea(x0 - 5, z0 - 5, x1 + 5, z1 + 5, (x, z) => segDist(W, x, z) < 2.8);
      // the trees by the road: forest-grown (clear boles, high crowns), not the leafy stand edge; none within 3 m of
      // the road's middle
      const bx0 = x0 - 20, bx1 = x1 + 20, bz0 = z0 - 20, bz1 = z1 + 20;
      const kind = [TREE_T.beech, TREE_T.hornbeamF, TREE_T.oakF, TREE_T.beech, TREE_T.hornbeamF];
      addForestMix((x, z, ty, edge, code, h1) => {
        if (x < bx0 || x > bx1 || z < bz0 || z > bz1) return ty;
        const d = segDist(W, x, z);
        if (d < 3.1) return -1;
        if (d < 16 && (ty === TREE_T.edge || ty === TREE_T.spruceLow)) return kind[Math.floor(h1 * kind.length)];
        return ty;
      });
    }
  }
  return true;
}

// ------------------------------------------------------------------ materials
let MT = null;
const off = (m, units) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: units });
function mats() {
  if (MT) return MT;
  const R = rng(84);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // weathered enamel: the colour, scuffs, dust and a little rust bleeding through (tiled ~2 m)
  const paint = (base, rustK, dirt) => {
    const c = canvas(256, 256), g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    blobs(g, 0, 0, 256, 256, 40, 8, 60, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.07)', `rgba(120,110,90,${dirt})`], R);
    for (let i = 0; i < 60 * rustK; i++) { g.fillStyle = `rgba(${110 + R() * 40},${55 + R() * 25},${25 + R() * 15},${0.25 + R() * 0.4})`; g.fillRect(R() * 256, R() * 256, 1 + R() * 4, 1 + R() * 10); }
    for (let i = 0; i < 25 * rustK; i++) { g.strokeStyle = `rgba(100,55,30,${0.15 + R() * 0.2})`; g.lineWidth = 1 + R(); const x = R() * 256, y = R() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 4, y + 10 + R() * 30); g.stroke(); }
    grain(g, 256, 256, 10, R);
    return tex(c, { repeat: true });
  };
  // the rusted beam: brown iron oxide with darker scale, streaks and a few patches of the old grey paint
  const rustC = canvas(256, 256), rg = rustC.getContext('2d');
  rg.fillStyle = '#6b4530'; rg.fillRect(0, 0, 256, 256);
  blobs(rg, 0, 0, 256, 256, 80, 6, 50, ['rgba(140,78,38,0.35)', 'rgba(48,30,20,0.35)', 'rgba(118,112,96,0.22)', 'rgba(160,98,58,0.22)'], R);
  for (let i = 0; i < 80; i++) { rg.strokeStyle = `rgba(${40 + R() * 40},${25 + R() * 20},15,0.25)`; rg.lineWidth = 1 + R() * 2; const x = R() * 256; rg.beginPath(); rg.moveTo(x, R() * 256); rg.lineTo(x + (R() - 0.5) * 3, R() * 256); rg.stroke(); }
  grain(rg, 256, 256, 26, R);
  // river gravel: grey and white stones 1-6 cm in a dusty matrix (and their bump: brighter where a stone stands up)
  const stones = (g, gb, W, Hh, n, sizeK, wrapY, lo = 78, span = 95) => {
    for (let i = 0; i < n; i++) {
      const x = R() * W, y = R() * Hh, r = (2.5 + R() * R() * 12) * sizeK, v = lo + R() * span, warm = R() < 0.3 ? 14 : 0, rot = R() * 3.14, e = 0.55 + R() * 0.4;
      for (const yy of wrapY ? [y, y - Hh, y + Hh] : [y]) {
        g.fillStyle = 'rgba(30,28,24,0.32)'; g.beginPath(); g.ellipse(x + r * 0.2, yy + r * 0.3, r * 1.05, r * e * 1.05, rot, 0, 6.283); g.fill();
        g.fillStyle = `rgb(${v + warm},${v - 3 + warm * 0.5},${v - 10})`; g.beginPath(); g.ellipse(x, yy, r, r * e, rot, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(255,255,250,0.12)'; g.beginPath(); g.ellipse(x - r * 0.25, yy - r * 0.25, r * 0.45, r * 0.3 * e, rot, 0, 6.283); g.fill();
        if (gb) {
          const gr = gb.createRadialGradient(x, yy, 0, x, yy, r); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          gb.fillStyle = gr; gb.beginPath(); gb.ellipse(x, yy, r, r * e, rot, 0, 6.283); gb.fill();
        }
      }
    }
  };
  // the pad's gravel (1 tile = 1.6 m), a few weeds
  const gravC = canvas(512, 512), gg = gravC.getContext('2d'), gravB = canvas(512, 512), gbb = gravB.getContext('2d');
  gg.fillStyle = '#8a857b'; gg.fillRect(0, 0, 512, 512); gbb.fillStyle = '#404040'; gbb.fillRect(0, 0, 512, 512);
  stones(gg, gbb, 512, 512, 3400, 1, false, 92, 100);
  stones(gg, gbb, 512, 512, 140, 1.9, false, 84, 115);
  for (let i = 0; i < 170; i++) { gg.strokeStyle = `rgba(${70 + R() * 40},${100 + R() * 40},40,0.7)`; gg.lineWidth = 1.5; const x = R() * 512, y = R() * 512; for (let k = 0; k < 5; k++) { gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + (R() - 0.5) * 14, y - 4 - R() * 10); gg.stroke(); } }
  grain(gg, 512, 512, 12, R);
  // the forest road across its 3.6 m (u) and 3.6 m along (v): the verges' leaves, two compacted ruts of finer darker
  // gravel, a crown of coarser stones with a few leaves on it
  const roadC = canvas(512, 512), rd = roadC.getContext('2d'), roadB = canvas(512, 512), rb = roadB.getContext('2d');
  rd.fillStyle = '#8a8479'; rd.fillRect(0, 0, 512, 512); rb.fillStyle = '#404040'; rb.fillRect(0, 0, 512, 512);
  stones(rd, rb, 512, 512, 6500, 0.42, true, 90, 85);
  for (const [u0, u1] of [[0.17, 0.36], [0.64, 0.83]]) {
    const x0 = u0 * 512, x1 = u1 * 512, gr = rd.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, 'rgba(70,62,52,0)'); gr.addColorStop(0.25, 'rgba(70,62,52,0.55)'); gr.addColorStop(0.75, 'rgba(70,62,52,0.55)'); gr.addColorStop(1, 'rgba(70,62,52,0)');
    rd.fillStyle = gr; rd.fillRect(x0, 0, x1 - x0, 512);
    rb.fillStyle = 'rgba(30,30,30,0.6)'; rb.fillRect(x0 + 10, 0, x1 - x0 - 20, 512);
    for (let i = 0; i < 500; i++) { const v = 90 + R() * 70; rd.fillStyle = `rgba(${v},${v - 4},${v - 10},0.8)`; rd.fillRect(x0 + R() * (x1 - x0), R() * 512, 2 + R() * 3, 2 + R() * 3); }
  }
  const LEAF = [[112, 84, 58], [96, 72, 50], [128, 100, 70], [84, 64, 46], [118, 94, 72]];
  const leaf = (g, x, y) => { const s = 2 + R() * 3, c = LEAF[Math.floor(R() * LEAF.length)]; g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.75 + R() * 0.25})`; g.beginPath(); g.ellipse(x, y, s, s * 0.55, R() * 3.14, 0, 6.283); g.fill(); };
  for (let i = 0; i < 4200; i++) { const u = R() < 0.5 ? R() ** 2.2 * 0.16 : 1 - R() ** 2.2 * 0.16; leaf(rd, u * 512, R() * 512); }
  for (let i = 0; i < 160; i++) leaf(rd, (0.4 + R() * 0.2) * 512, R() * 512);
  const edge = (u0, u1) => { const gr = rd.createLinearGradient(u0 * 512, 0, u1 * 512, 0); gr.addColorStop(0, 'rgba(84,66,48,0.9)'); gr.addColorStop(1, 'rgba(84,66,48,0)'); rd.fillStyle = gr; rd.fillRect(Math.min(u0, u1) * 512, 0, Math.abs(u1 - u0) * 512, 512); };
  edge(0, 0.1); edge(1, 0.9);
  grain(rd, 512, 512, 12, R);
  // the old slabs: pale weathered concrete, the aggregate showing, dark cracks with moss and grit
  const slabC = canvas(512, 512), sg = slabC.getContext('2d');
  sg.fillStyle = '#a7a39b'; sg.fillRect(0, 0, 512, 512);
  blobs(sg, 0, 0, 512, 512, 80, 10, 80, ['rgba(90,88,80,0.14)', 'rgba(230,228,220,0.18)', 'rgba(120,110,90,0.12)'], R);
  for (let i = 0; i < 9000; i++) { const v = 70 + R() * 110; sg.fillStyle = `rgba(${v},${v},${v - 6},0.5)`; sg.fillRect(R() * 512, R() * 512, 1 + R() * 3, 1 + R() * 3); }
  const crack = (x, y, a, len) => { sg.beginPath(); sg.moveTo(x, y); for (let k = 0; k < len; k++) { a += (R() - 0.5) * 0.7; x += Math.cos(a) * 6; y += Math.sin(a) * 6; sg.lineTo(x, y); } sg.stroke(); };
  sg.strokeStyle = 'rgba(45,42,36,0.85)'; sg.lineWidth = 1.8;
  for (let i = 0; i < 6; i++) crack(R() * 512, R() * 512, R() * 6.28, 20 + R() * 40);
  sg.strokeStyle = 'rgba(70,95,40,0.55)'; sg.lineWidth = 3;
  for (let i = 0; i < 3; i++) crack(R() * 512, R() * 512, R() * 6.28, 15 + R() * 25);
  stones(sg, null, 512, 512, 520, 0.45, false, 70, 90);
  blobs(sg, 0, 0, 512, 512, 30, 20, 90, ['rgba(70,64,52,0.18)', 'rgba(60,70,40,0.12)'], R);
  grain(sg, 512, 512, 14, R);
  // the welded mesh: ~5 x 20 cm, galvanised wire (alpha cut out)
  const meshC = canvas(256, 256), mg = meshC.getContext('2d');
  mg.strokeStyle = 'rgba(150,158,165,1)'; mg.lineWidth = 2.2;
  for (let x = 1; x < 256; x += 12.8) { mg.beginPath(); mg.moveTo(x, 0); mg.lineTo(x, 256); mg.stroke(); }
  for (let y = 1; y < 256; y += 51.2) { mg.beginPath(); mg.moveTo(0, y); mg.lineTo(256, y); mg.stroke(); }
  // the safety sign: white board, rows of pictograms (prohibition, warning, mandatory)
  const signC = canvas(256, 384), ig = signC.getContext('2d');
  ig.fillStyle = '#f4f4f0'; ig.fillRect(0, 0, 256, 384);
  const pict = (x, y, kind) => {
    if (kind === 0) { ig.strokeStyle = '#c81e1e'; ig.lineWidth = 6; ig.beginPath(); ig.arc(x, y, 22, 0, 6.283); ig.stroke(); ig.beginPath(); ig.moveTo(x - 15, y - 15); ig.lineTo(x + 15, y + 15); ig.stroke(); ig.fillStyle = '#222'; ig.fillRect(x - 8, y - 4, 16, 8); }
    else if (kind === 1) { ig.fillStyle = '#f2c21b'; ig.strokeStyle = '#222'; ig.lineWidth = 3; ig.beginPath(); ig.moveTo(x, y - 24); ig.lineTo(x + 26, y + 20); ig.lineTo(x - 26, y + 20); ig.closePath(); ig.fill(); ig.stroke(); ig.fillStyle = '#222'; ig.fillRect(x - 2, y - 8, 4, 16); ig.fillRect(x - 2, y + 11, 4, 4); }
    else { ig.fillStyle = '#1f5fb4'; ig.beginPath(); ig.arc(x, y, 23, 0, 6.283); ig.fill(); ig.fillStyle = '#fff'; ig.beginPath(); ig.arc(x, y - 6, 8, 3.14, 6.283); ig.fill(); ig.fillRect(x - 10, y - 6, 20, 4); }
  };
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) pict(60 + k * 68, 60 + r * 86, r === 0 ? 0 : r === 3 ? 2 : 1);
  ig.strokeStyle = '#555'; ig.lineWidth = 4; ig.strokeRect(2, 2, 252, 380);
  // the Vulcan logo on the beam: a red V in a ring and the name in red italics on the blue paint
  const logoC = canvas(512, 96), lg = logoC.getContext('2d');
  lg.fillStyle = '#55739a'; lg.fillRect(0, 0, 512, 96);
  lg.strokeStyle = '#c42a24'; lg.lineWidth = 5; lg.beginPath(); lg.arc(48, 48, 34, 0, 6.283); lg.stroke();
  lg.fillStyle = '#c42a24'; lg.font = 'bold italic 58px serif'; lg.fillText('V', 26, 70); lg.fillText('Vulcan', 100, 70);
  grain(lg, 512, 96, 12, R);
  // the cabinets: white enamel, the door seams, louvres, a lock, a warning triangle
  const cabC = canvas(128, 256), cg = cabC.getContext('2d');
  cg.fillStyle = '#ecece7'; cg.fillRect(0, 0, 128, 256);
  cg.strokeStyle = 'rgba(80,80,80,0.6)'; cg.lineWidth = 2; cg.strokeRect(8, 10, 112, 236); cg.beginPath(); cg.moveTo(64, 10); cg.lineTo(64, 246); cg.stroke();
  for (let y = 30; y < 240; y += 14) { cg.strokeStyle = 'rgba(120,120,120,0.25)'; cg.beginPath(); cg.moveTo(12, y); cg.lineTo(60, y); cg.stroke(); }
  cg.fillStyle = '#555'; cg.fillRect(56, 120, 5, 14); cg.fillRect(67, 120, 5, 14);
  cg.fillStyle = '#f2c21b'; cg.beginPath(); cg.moveTo(92, 34); cg.lineTo(108, 60); cg.lineTo(76, 60); cg.closePath(); cg.fill();
  blobs(cg, 0, 0, 128, 256, 20, 4, 30, ['rgba(120,110,90,0.12)', 'rgba(60,60,60,0.06)'], R);
  grain(cg, 128, 256, 8, R);
  // tall summer grass (dry gold and green) with wild carrot umbels (cards)
  const grassCard = (flowers, dry) => {
    const c = canvas(256, 256), wg = c.getContext('2d');
    for (let i = 0; i < 90; i++) {
      const x = R() * 256, h = 80 + R() * 170, lean = (R() - 0.5) * 60, gc = 90 + R() * 70, d = R() < dry;
      wg.strokeStyle = d ? `rgb(${150 + R() * 50},${140 + R() * 40},${80 + R() * 30})` : `rgb(${gc - 40 + R() * 40},${gc + 20},${40 + R() * 30})`; wg.lineWidth = 1.2 + R() * 1.6;
      wg.beginPath(); wg.moveTo(x, 256); wg.quadraticCurveTo(x + lean * 0.3, 256 - h * 0.6, x + lean, 256 - h); wg.stroke();
      if (R() < 0.25) { wg.fillStyle = wg.strokeStyle; wg.beginPath(); wg.ellipse(x + lean, 256 - h - 6, 2, 8, lean * 0.01, 0, 6.283); wg.fill(); }
    }
    for (let i = 0; i < flowers; i++) {
      const x = 20 + R() * 216, y = 20 + R() * 100;
      wg.strokeStyle = '#7c9a52'; wg.lineWidth = 2; wg.beginPath(); wg.moveTo(x, y); wg.lineTo(x + (R() - 0.5) * 20, 256); wg.stroke();
      for (let k = 0; k < 46; k++) { const a = R() * 6.283, r = R() * 14; wg.fillStyle = 'rgba(250,250,244,0.96)'; wg.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.45, 2.5, 2.5); }
    }
    return c;
  };
  MT = {
    blue: std({ map: paint('#55739a', 1, 0.1), roughness: 0.55, metalness: 0.35 }),
    blueDark: std({ map: paint('#45648c', 1.4, 0.12), roughness: 0.6, metalness: 0.35 }),
    fenceBlue: std({ map: paint('#2f62b0', 0.6, 0.06), roughness: 0.5, metalness: 0.4 }),
    yellow: std({ map: paint('#cfa936', 1.2, 0.14), roughness: 0.55, metalness: 0.3 }),
    rust: std({ map: tex(rustC, { repeat: true }), roughness: 0.85, metalness: 0.3 }),
    steel: std({ color: 0x2c2e30, roughness: 0.45, metalness: 0.7 }),
    rod: std({ color: 0xc9ccd0, roughness: 0.15, metalness: 0.95 }),
    wire: std({ color: 0x3a3b3c, roughness: 0.5, metalness: 0.7 }),
    concrete: M.concretePole,
    foundation: std({ map: tex(slabC, { repeat: true }), roughness: 0.92, color: 0x9d9a93 }),
    gravel: off(std({ map: tex(gravC, { repeat: true }), bumpMap: tex(gravB, { repeat: true, srgb: false }), bumpScale: 2, roughness: 0.95, vertexColors: true }), -4),
    road: off(std({ map: tex(roadC, { repeat: true }), bumpMap: tex(roadB, { repeat: true, srgb: false }), bumpScale: 2, roughness: 0.95 }), -5),
    slab: off(std({ map: tex(slabC, { repeat: true }), bumpMap: tex(gravB, { repeat: true, srgb: false }), bumpScale: 0.6, roughness: 0.92, color: 0xf0eee8 }), -6),
    mesh: std({ map: tex(meshC, { repeat: true }), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.6 }),
    sign: std({ map: tex(signC), roughness: 0.5 }),
    logo: std({ map: tex(logoC), roughness: 0.55, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    cabinet: std({ map: tex(cabC), roughness: 0.4, metalness: 0.2 }),
    grey: std({ color: 0x8d9092, roughness: 0.5, metalness: 0.4 }),
    dark: std({ color: 0x2a2c2e, roughness: 0.55, metalness: 0.5 }),
    lens: std({ color: 0xdfe6ea, roughness: 0.08, metalness: 0.1, emissive: 0x000000 }),
    grass: std({ map: tex(grassCard(5, 0.4)), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 }),
    grassFl: std({ map: tex(grassCard(14, 0.25)), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 }),
    grassDry: std({ map: tex(grassCard(1, 0.75)), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }),
  };
  MT.gravel.userData.wet = 'ground';
  MT.road.userData.wet = 'road';
  MT.slab.userData.wet = 'road';
  // the puddle: still water over a dark muddy bottom; a mirror for the screen-space reflections (post.js: alpha = 1 -
  // how much it mirrors)
  MT.puddle = off(std({ color: 0x57554b, roughness: 0.04, metalness: 0.0 }), -8);    // (its muddy bottom through ~3 cm of water: ~0.09)
  MT.puddle.userData.noWet = true;
  MT.puddle.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = 0.06;'); };
  MT.puddle.customProgramCacheKey = () => 'sondaPuddle';
  return MT;
}

// ------------------------------------------------------------------ geometry helpers (local frames)
// a box from p to q (its long axis), w across horizontally, h up
function bar(list, p, q, w, h) {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), L = d.length();
  const g = new THREE.BoxGeometry(L, h, w);
  const x = d.clone().normalize(), up = Math.abs(x.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const z = new THREE.Vector3().crossVectors(x, up).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  list.push(g);
}
// an I-beam along x from x0 to x1 (y centre, height h, flange width b)
function ibeam(list, x0, x1, y, h, b, z = 0) {
  boxAt(list, (x0 + x1) / 2, y, z, x1 - x0, h - 0.04, b * 0.18);
  boxAt(list, (x0 + x1) / 2, y + h / 2 - 0.02, z, x1 - x0, 0.04, b);
  boxAt(list, (x0 + x1) / 2, y - h / 2 + 0.02, z, x1 - x0, 0.04, b);
}
// a ladder between p and q ([x, y, z]), its rails 0.42 m apart along x or z, rungs every 0.3 m
function ladder(list, p, q, across = 'z') {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), o = (k) => across === 'z' ? [0, k] : [k, 0];
  for (const k of [-0.21, 0.21]) { const [dx, dz] = o(k); bar(list, [p[0] + dx, p[1], p[2] + dz], [q[0] + dx, q[1], q[2] + dz], 0.045, 0.06); }
  for (let s = 0.3; s < L; s += 0.3) {
    const t = s / L, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t, z = p[2] + (q[2] - p[2]) * t, [ax, az] = o(-0.21), [bx, bz] = o(0.21);
    bar(list, [x + ax, y, z + az], [x + bx, y, z + bz], 0.025, 0.025);
  }
}
// an annular sector round the z axis (radii r0..r1, angles a0..a1), extruded over depth d centred on z
function sector(r0, r1, a0, a1, d, n = 16) {
  const s = new THREE.Shape();
  for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; if (k) s.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); else s.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); }
  for (let k = n; k >= 0; k--) { const a = a0 + (a1 - a0) * k / n; s.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); }
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
  return g;
}
const meshOf = (geos, mat, cast = true) => { const m = new THREE.Mesh(merged(geos), mat); m.castShadow = cast; m.receiveShadow = true; return m; };

// ------------------------------------------------------------------ a beam pumping unit
// Local frame: x along the beam towards the horsehead, y up, z across (near: the pad's side, +1 or -1); the origin on
// the ground under the pivot. Returns the static geometry per material (merged into the map) and the moving parts (a
// group) with animate(phi).
function pumpUnit(u, Mt, near) {
  const S = new Map(), add = (mat, f) => { if (!S.has(mat)) S.set(mat, []); f(S.get(mat)); };
  const vulcan = u.key === 'vulcan';
  const { Hs, A, C, I, Hg, R, P } = u, bh = u.beam, sw = u.skid;
  const post = Mt.blue, frame = vulcan ? Mt.blue : Mt.blueDark;
  const gx = -I, mx = gx - (vulcan ? 1.75 : 1.45), my = vulcan ? 1.05 : 0.95;
  const skidX0 = mx - 0.7, skidX1 = u.fr + 0.4;
  // the foundation under the skid, the wellhead's cellar slab
  add(Mt.foundation, L => { boxAt(L, (skidX0 + skidX1) / 2, 0.1, 0, skidX1 - skidX0 + 0.5, 0.36, 2 * sw + 0.7); boxAt(L, A, 0.05, 0, 1.5, 0.24, 1.5); });
  // the skid: two I-beams and cross members
  add(frame, L => {
    for (const z of [-sw, sw]) ibeam(L, skidX0, skidX1, 0.44, 0.3, 0.22, z);
    for (let x = skidX0 + 0.25; x < skidX1; x += 1.5) boxAt(L, x, 0.44, 0, 0.16, 0.26, 2 * sw);
  });
  // the samson post: front and rear legs from the skid up to the saddle, the braces of its sides and faces; the
  // saddle bearing
  const top = Hs - bh / 2 - 0.18, base = 0.6;
  const zAt = (k) => (sw - 0.08) + (0.3 - sw + 0.08) * k;
  const xf = (k) => u.fr - (u.fr - 0.14) * k, xr = (k) => -u.rr + (u.rr - 0.14) * k;
  add(post, L => {
    for (const z of [-1, 1]) {
      bar(L, [u.fr, base, z * zAt(0)], [0.14, top, z * 0.3], 0.2, 0.22);
      bar(L, [-u.rr, base, z * zAt(0)], [-0.14, top, z * 0.3], 0.2, 0.22);
      for (const k of [0.28, 0.56, 0.8]) { const y = base + (top - base) * k; bar(L, [xr(k), y, z * zAt(k)], [xf(k), y, z * zAt(k)], 0.08, 0.08); }
      const y1 = base + (top - base) * 0.28, y2 = base + (top - base) * 0.56;
      bar(L, [xr(0.28), y1, z * zAt(0.28)], [xf(0.56), y2, z * zAt(0.56)], 0.06, 0.06);
      bar(L, [xf(0.28), y1, z * zAt(0.28)], [xr(0.56), y2, z * zAt(0.56)], 0.06, 0.06);
    }
    for (const k of [0.28, 0.56]) { const y = base + (top - base) * k; for (const x of [xf(k), xr(k)]) bar(L, [x, y, -zAt(k)], [x, y, zAt(k)], 0.07, 0.07); }
    boxAt(L, 0, top + 0.08, 0, 0.6, 0.18, 0.8);
    const brg = new THREE.CylinderGeometry(0.16, 0.16, 0.9, 12); brg.rotateX(Math.PI / 2); brg.translate(0, Hs - bh / 2 - 0.05, 0); L.push(brg);
  });
  if (vulcan) {
    // the vertical ladder on the near side up to a railed platform round the saddle, hoops round its upper part
    const zL = near * (sw + 0.15), za = Math.abs(zL), py = top - 1.05;
    add(frame, L => {
      ladder(L, [0.05, base, zL], [0.05, py + 1.0, zL], 'x');
      boxAt(L, 0, py, 0, 2.0, 0.05, 2 * za + 0.1);
      for (const yy of [py + 0.55, py + 1.05]) {
        bar(L, [-1.0, yy, -za], [1.0, yy, -za], 0.04, 0.04); bar(L, [-1.0, yy, za], [1.0, yy, za], 0.04, 0.04);
        bar(L, [-1.0, yy, -za], [-1.0, yy, za], 0.04, 0.04); bar(L, [1.0, yy, -za], [1.0, yy, za], 0.04, 0.04);
      }
      for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0]]) bar(L, [x, py, z * za], [x, py + 1.05, z * za], 0.04, 0.04);
      for (let y = py - 2.4; y < py; y += 0.6) for (let a = 0; a < 7; a++) {
        const t0 = a / 7 * Math.PI, t1 = (a + 1) / 7 * Math.PI, r = 0.38;
        bar(L, [0.05 + r * Math.cos(t0), y, zL + near * r * Math.sin(t0)], [0.05 + r * Math.cos(t1), y, zL + near * r * Math.sin(t1)], 0.025, 0.025);
      }
      for (const a of [0.2, 0.5, 0.8]) { const c = Math.cos(a * Math.PI), s = Math.sin(a * Math.PI); bar(L, [0.05 + 0.38 * c, py - 2.4, zL + near * 0.38 * s], [0.05 + 0.38 * c, py, zL + near * 0.38 * s], 0.025, 0.025); }
    });
  } else {
    // the ladder up the rear legs to a small rest under the beam
    add(frame, L => { ladder(L, [-u.rr - 0.3, base, near * 0.2], [-0.45, top - 0.6, near * 0.2], 'z'); boxAt(L, -0.45, top - 0.62, near * 0.2, 0.6, 0.05, 0.8); });
  }
  // the gear reducer: a housing round the crank shaft, its rounded top and feet; the motor on its rails behind
  add(post, L => {
    boxAt(L, gx, Hg - 0.32, 0, vulcan ? 1.3 : 1.05, vulcan ? 1.05 : 0.9, vulcan ? 0.95 : 0.8);
    const rr = vulcan ? 0.64 : 0.52, dome = new THREE.CylinderGeometry(rr, rr, vulcan ? 0.92 : 0.78, 18, 1, false, -Math.PI / 2, Math.PI);
    dome.rotateX(Math.PI / 2); dome.translate(gx, Hg + 0.2, 0); L.push(dome);
    boxAt(L, gx, 0.82, 0, vulcan ? 1.7 : 1.35, 0.16, vulcan ? 1.15 : 1.0);
    // (the housing's split flange at the shafts' height, its bolts, the breather, the inspection cover)
    const hw = vulcan ? 0.66 : 0.53, hd = vulcan ? 0.5 : 0.43;
    boxAt(L, gx, Hg - 0.05, 0, 2 * hw + 0.12, 0.06, 2 * hd + 0.08);
    for (let k = 0; k < 6; k++) for (const sz of [-1, 1]) cyl(L, gx - hw + 0.08 + k * (2 * hw - 0.16) / 5, Hg - 0.02, sz * (hd + 0.02), 0.05, 0.025, 0.025, 6);
    cyl(L, gx - 0.15, Hg + 0.2 + (vulcan ? 0.64 : 0.52) - 0.04, 0, 0.12, 0.04, 0.03, 8);
    boxAt(L, gx + 0.2, Hg + 0.2 + (vulcan ? 0.6 : 0.48), 0, 0.36, 0.04, 0.3);
    // the motor: finned frame, the fan cowl at its back, the terminal box, the slide rails
    const mot = new THREE.CylinderGeometry(0.3, 0.3, 0.72, 16); mot.rotateX(Math.PI / 2); mot.translate(mx, my, near * 0.1); L.push(mot);
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; if (Math.sin(a) < -0.6) continue; const f = new THREE.BoxGeometry(0.018, 0.07, 0.62); f.rotateZ(a - Math.PI / 2); f.translate(mx + Math.cos(a) * 0.32, my + Math.sin(a) * 0.32, near * 0.12); L.push(f); }
    const fan = new THREE.CylinderGeometry(0.26, 0.3, 0.16, 14); fan.rotateX(Math.PI / 2); fan.translate(mx, my, -near * 0.33); L.push(fan);
    boxAt(L, mx, my + 0.36, near * 0.15, 0.22, 0.14, 0.24);
    boxAt(L, mx, my - 0.36, near * 0.05, 0.6, 0.2, 0.8);
    bar(L, [mx, 0.66, -0.5], [mx, 0.66, 0.5], 0.12, 0.12);
  });
  // the brake: a drum on the input shaft on the far side, its band and the rod back to the hand lever at the skid's end
  add(Mt.steel, L => {
    const zb = -near * (vulcan ? 0.62 : 0.55), cyb = Hg - 0.55;
    const dr = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16); dr.rotateX(Math.PI / 2); dr.translate(gx - 0.2, cyb, zb); L.push(dr);
    bar(L, [gx - 0.2, cyb - 0.24, zb], [mx - 0.55, 0.95, zb], 0.025, 0.025);
    bar(L, [mx - 0.55, 0.6, zb], [mx - 0.62, 1.3, zb], 0.04, 0.04);
    // the cable from the motor down into the ground (to the cabinets)
    bar(L, [mx, my + 0.36, near * 0.15], [mx + 0.05, 0.55, near * 0.45], 0.03, 0.03);
    bar(L, [mx + 0.05, 0.55, near * 0.45], [mx + 0.05, -0.3, near * 0.45], 0.03, 0.03);
  });
  if (vulcan) {
    // the belt guard on the near side: a flat case from the motor's pulley up to the reducer's input sheave
    add(Mt.yellow, L => {
      const g = new THREE.Shape(), r0 = 0.24, r1 = 0.46, cx = gx - 0.2, cy = Hg - 0.6;
      for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + k / 8 * Math.PI; const x = cx + Math.cos(a) * r1, y = cy + Math.sin(a) * r1; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      for (let k = 0; k <= 8; k++) { const a = Math.PI / 2 + k / 8 * Math.PI; g.lineTo(mx + Math.cos(a) * r0, my + Math.sin(a) * r0); }
      g.closePath();
      const eg = new THREE.ExtrudeGeometry(g, { depth: 0.2, bevelEnabled: false }); eg.translate(0, 0, near > 0 ? 0.62 : -0.82); L.push(eg);
    });
  } else {
    // the open yellow spoked sheave on the near side, the belts to the motor's pulley, the motor's hood
    const zc = near * 0.62, cy = Hg - 0.5, rr = 0.72, cx = gx + 0.15;
    add(Mt.yellow, L => {
      const rim = new THREE.TorusGeometry(rr, 0.05, 6, 28); rim.translate(cx, cy, zc); L.push(rim);
      const rim2 = new THREE.CylinderGeometry(rr, rr, 0.16, 28, 1, true); rim2.rotateX(Math.PI / 2); rim2.translate(cx, cy, zc); L.push(rim2);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; bar(L, [cx, cy, zc], [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, zc], 0.05, 0.05); }
      const hub = new THREE.CylinderGeometry(0.14, 0.14, 0.24, 12); hub.rotateX(Math.PI / 2); hub.translate(cx, cy, zc); L.push(hub);
    });
    add(Mt.steel, L => { for (const dz of [-0.04, 0.04]) { bar(L, [cx, cy + rr, zc + dz], [mx, my + 0.16, zc + dz], 0.025, 0.02); bar(L, [cx, cy - rr, zc + dz], [mx, my - 0.16, zc + dz], 0.025, 0.02); } });
    add(Mt.blueDark, L => { const hood = new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); hood.scale(1.1, 0.75, 1.0); hood.translate(mx, my + 0.15, 0); L.push(hood); });
  }
  // the wellhead: casing head, tubing head, the pumping tee and its flowline with a valve, the stuffing box
  add(Mt.steel, L => {
    cyl(L, A, 0.15, 0, 0.35, 0.19, 0.19, 12);
    cyl(L, A, 0.5, 0, 0.12, 0.24, 0.24, 12);
    cyl(L, A, 0.62, 0, 0.38, 0.09, 0.09, 10);
    cyl(L, A, 1.0, 0, 0.16, 0.13, 0.13, 10);
    cyl(L, A, 1.16, 0, 0.3, 0.075, 0.06, 10);
    bar(L, [A, 0.82, 0], [A, 0.82, -near * 1.5], 0.09, 0.09);
    bar(L, [A, 0.82, -near * 1.5], [A, 0.12, -near * 1.5], 0.09, 0.09);
    bar(L, [A, 0.82, 0], [A + 0.6, 0.82, 0], 0.07, 0.07);
    for (const [x, z] of [[A, -near * 0.7], [A + 0.45, 0]]) { const w = new THREE.TorusGeometry(0.12, 0.015, 6, 14); w.translate(x, 1.1, z); L.push(w); cyl(L, x, 0.82, z, 0.28, 0.03, 0.03, 6); }
    // the rod blowout preventer under the stuffing box: its rams' T-handles out to both sides
    boxAt(L, A, 1.08, 0, 0.2, 0.12, 0.2);
    for (const sz of [-1, 1]) { bar(L, [A, 1.08, sz * 0.1], [A, 1.08, sz * 0.32], 0.03, 0.03); bar(L, [A - 0.12, 1.08, sz * 0.32], [A + 0.12, 1.08, sz * 0.32], 0.025, 0.025); }
    // the pressure gauge on the tee, the check valve in the flowline
    bar(L, [A + 0.1, 0.82, 0], [A + 0.1, 1.02, 0.0], 0.02, 0.02);
    { const gg = new THREE.CylinderGeometry(0.06, 0.06, 0.035, 14); gg.rotateZ(Math.PI / 2); gg.translate(A + 0.1, 1.06, 0); L.push(gg); }
    boxAt(L, A, 0.82, -near * 1.1, 0.16, 0.16, 0.2);
  });

  // ---- the moving parts
  const group = new THREE.Group();
  const beamG = new THREE.Group(); beamG.position.set(0, Hs, 0); group.add(beamG);
  const crankG = new THREE.Group(); crankG.position.set(gx, Hg, 0); group.add(crankG);
  const beamMat = vulcan ? Mt.blue : Mt.rust, headMat = vulcan ? Mt.yellow : Mt.rust, pitMat = vulcan ? Mt.yellow : Mt.blueDark;
  {
    const L = [], H = [], E = [];
    ibeam(L, -C - 0.3, A - 0.2, 0, bh, bh * 0.6);
    // web stiffeners both sides every ~0.7 m, the plates over the saddle and the tail bearings
    for (let x = -C; x < A - 0.4; x += 0.7) for (const sz of [-1, 1]) boxAt(L, x, 0, sz * bh * 0.17, 0.03, bh - 0.06, bh * 0.25);
    boxAt(L, 0, -bh / 2 - 0.03, 0, 0.7, 0.06, bh * 0.75);
    { const sb = new THREE.CylinderGeometry(0.14, 0.14, bh * 0.9, 14); sb.rotateX(Math.PI / 2); sb.translate(0, -bh / 2 - 0.12, 0); L.push(sb); }
    for (const sx of [-0.3, 0.3]) for (const sz of [-1, 1]) cyl(L, sx, -bh / 2 - 0.08, sz * bh * 0.3, 0.06, 0.025, 0.025, 6);
    // the horsehead: two curved side plates on the arc of radius A round the pivot (the bridle hangs straight down
    // from it at every angle), the face plate, the brace frame back to the beam
    const a0 = -0.46, a1 = 0.36, rIn = A - (vulcan ? 0.5 : 0.42);
    for (const z of [-0.2, 0.2]) { const g = sector(rIn, A, a0, a1, 0.035); g.translate(0, 0, z); H.push(g); }
    H.push(sector(A - 0.03, A, a0, a1, 0.42));
    const hb = A - 1.2;
    bar(H, [rIn * Math.cos(a1), rIn * Math.sin(a1), 0], [hb, bh * 0.5, 0], 0.16, 0.12);
    bar(H, [rIn * Math.cos(a0), rIn * Math.sin(a0), 0], [hb, -bh * 0.5, 0], 0.16, 0.12);
    bar(H, [rIn * Math.cos(a1), rIn * Math.sin(a1), 0], [rIn * Math.cos(a0), rIn * Math.sin(a0), 0], 0.14, 0.1);
    bar(H, [rIn * Math.cos(a1 * 0.5), rIn * Math.sin(a1 * 0.5), 0], [hb + 0.5, -bh * 0.4, 0], 0.1, 0.08);
    // the flanges of the face's rope groove; the two wire ropes lying in it from the anchor at the top
    for (const z of [-0.23, 0.23]) { const fl = sector(A - 0.02, A + 0.05, a0, a1, 0.02); fl.translate(0, 0, z); H.push(fl); }
    const RW = [];
    for (const z of [-0.13, 0.13]) { const rw = sector(A, A + 0.026, a0 + 0.02, a1 - 0.01, 0.026, 24); rw.translate(0, 0, z); RW.push(rw); }
    boxAt(RW, Math.cos(a1) * (A + 0.06), Math.sin(a1) * (A + 0.06), 0, 0.12, 0.08, 0.36);
    // the equalizer at the tail: a cross beam with the pitman bearings (a yellow box on the rusty unit)
    boxAt(E, -C, vulcan ? -0.1 : 0.05, 0, vulcan ? 0.4 : 0.55, bh * (vulcan ? 0.9 : 1.15), vulcan ? 1.3 : 1.05);
    // its bearings: the tail bearing under the beam, the pitmans' at both ends
    { const tb = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12); tb.rotateX(Math.PI / 2); tb.translate(-C, -bh / 2 - 0.1, 0); E.push(tb); }
    for (const sz of [-1, 1]) { const eb = new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12); eb.rotateX(Math.PI / 2); eb.translate(-C, 0, sz * 0.42); E.push(eb); }
    beamG.add(meshOf(L, beamMat), meshOf(H, headMat), meshOf(E, Mt.yellow), meshOf(RW, Mt.wire));
    if (vulcan) {
      // the logo on both faces of the beam, towards the horsehead
      const LG = [];
      for (const s of [-1, 1]) { const lg = new THREE.PlaneGeometry(2.4, bh * 0.62); if (s < 0) lg.rotateY(Math.PI); lg.translate(A - 2.0, 0, s * (bh * 0.6 * 0.09 + 0.012)); LG.push(lg); }
      const lm = new THREE.Mesh(merged(LG), Mt.logo); lm.castShadow = false; beamG.add(lm);
    }
  }
  // the cranks: an arm each side of the reducer, the wrist pin at R, the sector counterweights at its end
  {
    const L = [], W = [], HL = [];
    for (const z of [-0.6, 0.6]) {
      const shp = new THREE.Shape(); shp.moveTo(-0.3, -0.26); shp.lineTo(R * 1.15, -0.16); shp.lineTo(R * 1.15, 0.16); shp.lineTo(-0.3, 0.26); shp.closePath();
      const g = new THREE.ExtrudeGeometry(shp, { depth: 0.1, bevelEnabled: false }); g.translate(0, 0, z - 0.05); L.push(g);
      const aw = vulcan ? 0.62 : 0.5, zo = z + (z > 0 ? 0.14 : -0.14);
      for (const [b0, b1] of [[-aw, -0.03], [0.03, aw]]) { const cw = sector(R * 0.55, R * 1.4, b0, b1, 0.18, 6); cw.translate(0, 0, zo); W.push(cw); }
      for (const a of [-aw * 0.5, aw * 0.5]) { const bt = new THREE.CylinderGeometry(0.035, 0.035, 0.24, 6); bt.rotateX(Math.PI / 2); bt.translate(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, zo); W.push(bt); }
      const pin = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 10); pin.rotateX(Math.PI / 2); pin.translate(R, 0, z); L.push(pin);
      for (const f of [0.55, 0.75]) { const hole = new THREE.CylinderGeometry(0.05, 0.05, 0.11, 10); hole.rotateX(Math.PI / 2); hole.translate(R * f, 0, z); HL.push(hole); }
      const brg = new THREE.CylinderGeometry(0.11, 0.11, 0.14, 12); brg.rotateX(Math.PI / 2); brg.translate(R, 0, z + (z > 0 ? -0.08 : 0.08)); HL.push(brg);
    }
    const shaft = new THREE.CylinderGeometry(0.12, 0.12, 1.5, 10); shaft.rotateX(Math.PI / 2); L.push(shaft);
    crankG.add(meshOf(L, Mt.yellow), meshOf(W, Mt.yellow), meshOf(HL, Mt.steel));
  }
  // the pitmans (one each side), the bridle (two wire ropes) with the carrier bar and the polished rod
  const pitGeo = (() => { const I = []; boxAt(I, 0, 0, 0, 1, 0.16, 0.025); boxAt(I, 0, 0.075, 0, 1, 0.02, 0.1); boxAt(I, 0, -0.075, 0, 1, 0.02, 0.1); return merged(I); })();
  const pit = [0, 1].map(() => { const m = new THREE.Mesh(pitGeo, pitMat); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; });
  const bridle = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1, 5), Mt.wire); group.add(m); return m; });
  const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.46), Mt.steel); group.add(carrier);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 1, 8), Mt.rod); group.add(rod);
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.16), Mt.steel); group.add(clamp);
  // the linkage: the beam's tail E on the circle of radius C round the pivot O, the wrist pin K on the crank circle;
  // the beam's angle is where |E K| = P (the pitman hangs from E down to K)
  const O = new THREE.Vector2(0, Hs), G = new THREE.Vector2(gx, Hg);
  const Kp = new THREE.Vector2(), Ep = new THREE.Vector2();
  const solve = (phi) => {
    Kp.set(G.x + R * Math.cos(phi), G.y + R * Math.sin(phi));
    const d = Kp.distanceTo(O), a = (C * C - P * P + d * d) / (2 * d), h = Math.sqrt(Math.max(0, C * C - a * a));
    const ux = (Kp.x - O.x) / d, uy = (Kp.y - O.y) / d, mxp = O.x + ux * a, myp = O.y + uy * a;
    const e1x = mxp - uy * h, e1y = myp + ux * h, e2x = mxp + uy * h, e2y = myp - ux * h;
    if (e1y > e2y) Ep.set(e1x, e1y); else Ep.set(e2x, e2y);              // (the tail above the wrist pin)
    return Math.atan2(-(Ep.y - O.y), -(Ep.x - O.x));
  };
  // the bridle's length: the carrier bar ~0.35 m over the stuffing box at the bottom of the stroke
  let thMin = Infinity;
  for (let k = 0; k < 72; k++) thMin = Math.min(thMin, solve(k / 72 * Math.PI * 2));
  const L0 = Hs - 1.81 + A * thMin;
  const pz = [-0.6, 0.6], tz = [-0.42, 0.42];
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  const animate = (phi) => {
    const th = solve(phi);
    beamG.rotation.z = th;
    crankG.rotation.z = phi;
    for (let k = 0; k < 2; k++) {
      p.set(Kp.x, Kp.y, pz[k]); q.set(Ep.x, Ep.y, tz[k]);
      const m = pit[k];
      m.position.copy(p).add(q).multiplyScalar(0.5);
      m.scale.set(p.distanceTo(q), 1, 1);
      m.rotation.set(0, 0, Math.atan2(q.y - p.y, q.x - p.x));
    }
    // the carrier bar rises and falls with the arc (arc length A th); the bridle from the arc's tangent point down to it
    const yc = Hs - L0 + A * th;
    for (let k = 0; k < 2; k++) { const b = bridle[k], len = Hs - yc; b.position.set(A, yc + len / 2, k ? 0.13 : -0.13); b.scale.set(1, len, 1); }
    carrier.position.set(A, yc, 0);
    clamp.position.set(A, yc + 0.12, 0);
    const top = yc + 0.4, bot = 1.3;
    rod.position.set(A, (top + bot) / 2, 0); rod.scale.set(1, top - bot, 1);
  };
  animate(u.ph);
  return { S, group, animate };
}

// ------------------------------------------------------------------ build
export function buildSonda(B, world) {
  if (FLOOR === null) return null;
  const Mt = mats();
  const R = rng(8486);
  const A = { slab: new Acc(), grass: new Acc(), grassFl: new Acc(), grassDry: new Acc(), mesh: new Acc(), sign: new Acc() };
  const G = { fence: [], concrete: [], cabinet: [], steel: [], grey: [], dark: [], lens: [] };
  const Y = (x, z) => heightAt(x, z);
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  const grow = (x, z, r = 0) => { bb.x0 = Math.min(bb.x0, x - r); bb.x1 = Math.max(bb.x1, x + r); bb.z0 = Math.min(bb.z0, z - r); bb.z1 = Math.max(bb.z1, z + r); };
  const yawOf = (d) => Math.atan2(-d[1], d[0]);                             // a local +x along the game direction d
  const rotLD = yawOf(LD);
  const vnoise = (x, z, s) => 0.5 + 0.25 * Math.sin(x * 0.37 * s + 1.3) * Math.sin(z * 0.41 * s - 0.7) + 0.25 * Math.sin((x + z) * 0.23 * s + 2.1);

  // ---- the ground: the gravel pad, its outline ragged; its colour drifts: damp patches, grass and moss coming through
  // (most between the puddle and the fences), darker wet gravel round the puddle, greener at its edge
  const PAD0 = [[-18, 5.6], [-21, 10], [-19, 18], [-13, 25], [-4, 27], [6, 26], [14, 22], [19, 15], [20, 7], [17, 3.4], [12, 3.6], [2, 4.2], [-8, 5.2]];
  const PAD = [];
  for (let i = 0; i < PAD0.length; i++) {
    const a = PAD0[i], b = PAD0[(i + 1) % PAD0.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6));
    for (let k = 0; k < n; k++) { const u = k / n, s = a[0] + (b[0] - a[0]) * u, t = a[1] + (b[1] - a[1]) * u; PAD.push(site(s + (R() - 0.5) * 1.2, t + (R() - 0.5) * 1.2)); }
  }
  const gp = [], gn = [], guv = [], gc = [];
  const shade = (x, z) => {
    const [s, t] = st(x, z), v = vnoise(x, z, 1), edge = clamp01(1 - polyDist(PAD, x, z) / 1.8);
    const weeds = clamp01(1 - Math.abs(t - 7) / 3.5) * 0.75 + clamp01((vnoise(x, z, 0.55) - 0.58) * 3) * 0.6 + edge * 0.8;
    const pr = Math.hypot((s - PUDDLE.s) / PUDDLE.a, (t - PUDDLE.t) / PUDDLE.b), wet = clamp01((1.45 - pr) / 0.45);
    const k = (0.7 + 0.26 * v - 0.14 * clamp01((vnoise(z, x, 2.1) - 0.6) * 4)) * (1 - 0.35 * wet);
    const g = clamp01(weeds) * (1 - wet), mud = clamp01(1 - Math.abs(pr - 1.06) / 0.22) * (0.8 + 0.4 * v);   // (the silt left at its rim)
    return [k * (1 - 0.3 * g) * (1 - 0.18 * mud), k * (1 - 0.02 * g) * (1 - 0.27 * mud), k * (1 - 0.45 * g) * (1 - 0.42 * mud)];
  };
  const drapeC = (P, lift, maxEdge) => {
    const faces = THREE.ShapeUtils.triangulateShape(P.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const emit = (a, b, c) => {
      const l = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
      if (l > maxEdge) {
        const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
        emit(a, ab, ca); emit(ab, b, bc); emit(ca, bc, c); emit(ab, bc, ca); return;
      }
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);         // (< 0: facing up as given)
      // (its edge settles into the grass: lifted less there, no step where it ends)
      for (const [x, z] of cr < 0 ? [a, b, c] : [a, c, b]) { gp.push(x, Y(x, z) + lift * (0.4 + 0.6 * clamp01(polyDist(P, x, z) / 1.5)), z); gn.push(0, 1, 0); guv.push(x / 1.6, z / 1.6); gc.push(...shade(x, z)); }
    };
    for (const [i, j, k] of faces) emit(P[i], P[j], P[k]);
  };
  drapeC(PAD, 0.045, 0.7);
  B.tris(Mt.gravel, gp, gn, guv, gc, { noCast: true });
  // round it the gravel thins out into the grass over ~1.4 m (the same gravel, fading: no edge like a laid carpet)
  const fringe = (() => {
    const W = 1.4, n = PAD.length, out = [];
    for (let i = 0; i < n; i++) {
      const p = PAD[i], a = PAD[(i + n - 1) % n], b = PAD[(i + 1) % n];
      let nx = -(b[1] - a[1]), nz = b[0] - a[0];
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (inPoly(PAD, p[0] + nx * W, p[1] + nz * W)) { nx = -nx; nz = -nz; }
      out.push([[p[0], p[1]], [p[0] + nx * W * 0.5, p[1] + nz * W * 0.5], [p[0] + nx * W, p[1] + nz * W]]);
    }
    const P = [], C = [], U = [], lift = [0.018, 0.012, 0.007], alpha = [1, 0.4, 0];
    const v = (q, r) => { const [x, z] = q[r]; P.push(x, Y(x, z) + lift[r], z); U.push(x / 1.6, z / 1.6); C.push(...shade(x, z), alpha[r]); };
    for (let i = 0; i < n; i++) {
      const q0 = out[i], q1 = out[(i + 1) % n];
      for (let r = 0; r < 2; r++) {
        const tri = [[q0, r], [q1, r], [q1, r + 1], [q0, r], [q1, r + 1], [q0, r + 1]];
        // (facing up: the winding by the outline's own turn)
        const [ax, az] = q0[r], [bx, bz] = q1[r], [cx, cz] = q1[r + 1], up = (bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0;
        for (const [q, rr] of up ? tri : [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]]) v(q, rr);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
    g.computeVertexNormals();
    const m = Mt.gravel.clone(); Object.assign(m, { transparent: true, depthWrite: false, polygonOffsetUnits: -5 });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.userData.noAO = true; mesh.renderOrder = 1;
    return mesh;
  })();
  // the old slabs: two rows in front of the camera of photo 84, each draped on the ground, a little turned
  for (const [s0, t0, w, l, rot] of [[5.6, 11.3, 1.4, 2.6, -0.7], [3.9, 10.9, 1.3, 2.4, -0.66], [4.6, 8.7, 1.3, 2.0, -0.68], [2.9, 8.9, 1.2, 1.7, -0.62], [4.4, 14.1, 2.4, 0.9, -0.1], [-3.6, 11.4, 1.1, 0.7, 0.2]]) {
    const c = Math.cos(rot), sn = Math.sin(rot), Q = (a, b) => site(s0 + a * c - b * sn, t0 + a * sn + b * c);
    const n = 4, us = s0 * 0.37, vs = t0 * 0.37;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a0 = -w / 2 + w * i / n, a1 = -w / 2 + w * (i + 1) / n, b0 = -l / 2 + l * j / n, b1 = -l / 2 + l * (j + 1) / n;
      const V = [Q(a0, b0), Q(a1, b0), Q(a1, b1), Q(a0, b1)].map(([x, z]) => [x, Y(x, z) + 0.065, z]);
      A.slab.quad(V[0], V[1], V[2], V[3], UP, [a0 / 2.2 + us, b0 / 2.2 + vs, a1 / 2.2 + us, b0 / 2.2 + vs, a1 / 2.2 + us, b1 / 2.2 + vs, a0 / 2.2 + us, b1 / 2.2 + vs]);
    }
    // its sides: ~10 cm of concrete, the top edge a little chipped and standing ~6 cm out of the gravel
    const E = [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2]];
    for (let e = 0; e < 4; e++) {
      const [pa, pb] = [E[e], E[(e + 1) % 4]], len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      for (let k = 0; k < n; k++) {
        const f0 = k / n, f1 = (k + 1) / n, P0 = Q(pa[0] + (pb[0] - pa[0]) * f0, pa[1] + (pb[1] - pa[1]) * f0), P1 = Q(pa[0] + (pb[0] - pa[0]) * f1, pa[1] + (pb[1] - pa[1]) * f1);
        const dx = P1[0] - P0[0], dz = P1[1] - P0[1], dl = Math.hypot(dx, dz), nx = dz / dl, nz = -dx / dl;
        const chip = (q) => 0.065 - 0.03 * clamp01((vnoise(q[0] * 7, q[1] * 7, 3) - 0.62) * 5);
        const y0 = Y(...P0), y1 = Y(...P1);
        A.slab.quad([P1[0], y1 - 0.04, P1[1]], [P0[0], y0 - 0.04, P0[1]], [P0[0], y0 + chip(P0), P0[1]], [P1[0], y1 + chip(P1), P1[1]], [nx, 0.15, nz], [len * f1 / 2.2, 0, len * f0 / 2.2, 0, len * f0 / 2.2, 0.05, len * f1 / 2.2, 0.05]);
      }
    }
  }

  // ---- the forest road: its own gravel ribbon (u across, v along) in five strips following the ground across
  const RP = roadPts();
  if (RP) {
    const P = ribbonPath(RP, 2.5, (x, z) => Y(x, z));
    const N = P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; });
    const pos = [], nrm = [], uv = [], cols = [0, 0.18, 0.36, 0.64, 0.82, 1];
    let acc = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
      for (let c = 0; c < cols.length - 1; c++) {
        const V = [];
        for (const [k, u, v] of [[i, cols[c], acc], [i, cols[c + 1], acc], [i + 1, cols[c + 1], acc + L], [i + 1, cols[c], acc + L]]) {
          const o = (u - 0.5) * ROAD_W, x = P[k][0] + N[k][0] * o, z = P[k][1] + N[k][1] * o;
          const crown = 0.03 * (1 - (2 * u - 1) ** 2) - 0.02 * Math.exp(-(((u - 0.27) / 0.08) ** 2)) - 0.02 * Math.exp(-(((u - 0.73) / 0.08) ** 2));
          V.push([x, Y(x, z) + 0.05 + crown, z, u, v / ROAD_W]);
        }
        const cr = (V[1][0] - V[0][0]) * (V[2][2] - V[0][2]) - (V[1][2] - V[0][2]) * (V[2][0] - V[0][0]);
        for (const k of cr < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { pos.push(V[k][0], V[k][1], V[k][2]); nrm.push(0, 1, 0); uv.push(V[k][3], V[k][4]); }
      }
      acc += L;
    }
    B.tris(Mt.road, pos, nrm, uv, null, { noCast: true });
  }

  // ---- the units
  const units = [];
  for (const u of UNITS) {
    const fwd = u.face < 0 ? [-LD[0], -LD[1]] : LD;                         // towards the horsehead
    const ry = yawOf(fwd), c = Math.cos(ry), s = Math.sin(ry);
    const near = Math.sign(s * LT[0] + c * LT[1]);                         // (its local z is (sin ry, cos ry))
    const pu = pumpUnit(u, Mt, near);
    const [px, pz] = site(u.s, 0), y = FLOOR - 0.05;
    const T = new THREE.Matrix4().makeRotationY(ry).scale(new THREE.Vector3(u.k, u.k, u.k)).setPosition(px, y, pz);
    for (const [mat, list] of pu.S) B.geo(mat, merged(list), T);
    pu.group.position.set(px, y, pz); pu.group.rotation.y = ry; pu.group.scale.setScalar(u.k);
    units.push({ ...pu, spm: u.spm, ph: u.ph });
    // its colliders: the skid with the reducer and the post, the wellhead
    const W = (lx, lz) => [px + lx * c + lz * s, pz - lx * s + lz * c];
    const k = u.k, x0 = (-u.I - 2.4) * k, x1 = (u.fr + 0.4) * k, ctr = W((x0 + x1) / 2, 0);
    box(ctr[0], ctr[1], (x1 - x0) / 2, (u.skid + 0.3) * k, ry, y - 0.5, y + 2.6, 'house');
    const wh = W(u.A * k, 0); box(wh[0], wh[1], 0.35, 0.35, 0, y - 0.5, y + 1.8, 'pole');
    grow(px, pz, (u.A + u.I + 4) * k);
  }

  // ---- the fences: blue square posts every ~2.2 m, top and bottom rails, welded mesh panels
  const ya0 = (p) => Y(p[0], p[1]);
  const fence = (pts, h = 1.75) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 2.2)), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (let k = 0; k < n; k++) {
        const x = a[0] + ux * L * k / n, z = a[1] + uz * L * k / n, y = Y(x, z), w = k ? 0.06 : 0.08;
        boxAt(G.fence, x, y + h / 2 - 0.1, z, w, h + 0.2, w, -Math.atan2(uz, ux));
        boxAt(G.steel, x, y + h + 0.11, z, w + 0.02, 0.02, w + 0.02, -Math.atan2(uz, ux));         // (the post's cap)
        boxAt(G.concrete, x, y + 0.02, z, 0.24, 0.08, 0.24, -Math.atan2(uz, ux));                    // (its footing)
      }
      // the corner post's braces into this side
      { const b0 = a[0] + ux * 1.4, b1 = a[1] + uz * 1.4; bar(G.fence, [a[0], ya0(a) + h * 0.8, a[1]], [b0, Y(b0, b1) + 0.12, b1], 0.04, 0.04); }
      const ya = Y(...a), yb = Y(...b);
      A.mesh.quad([a[0], ya + 0.06, a[1]], [b[0], yb + 0.06, b[1]], [b[0], yb + h - 0.05, b[1]], [a[0], ya + h - 0.05, a[1]], [uz, 0, -ux], [0, 0, L, 0, L, h, 0, h]);
      bar(G.fence, [a[0], ya + h, a[1]], [b[0], yb + h, b[1]], 0.045, 0.045);
      bar(G.fence, [a[0], ya + 0.05, a[1]], [b[0], yb + 0.05, b[1]], 0.035, 0.035);
      const m = Math.ceil(L / 3);
      for (let k = 0; k < m; k++) { const t0 = k / m, t1 = (k + 1) / m; box(a[0] + (b[0] - a[0]) * (t0 + t1) / 2, a[1] + (b[1] - a[1]) * (t0 + t1) / 2, L / m / 2, 0.06, Math.atan2(-uz, ux), ya - 0.5, ya + h + 0.1, 'fence'); }
    }
  };
  const rect = (s0, s1, t0, t1) => [[s0, t0], [s1, t0], [s1, t1], [s0, t1], [s0, t0]].map(([s, t]) => site(s, t));
  fence(rect(-15.2, -1.4, -3.4, 4.0));
  fence(rect(3.0, 14.9, -2.6, 2.5));
  // the double gates on the pad side: heavier posts, two framed mesh leaves, their hinges, the drop bolt, the padlock
  const gate = (s0, w, t, h = 1.7) => {
    const P = (s, dt = 0) => site(s, t + dt), hw = w / 2;
    for (const s of [s0, s0 + w]) { const [x, z] = P(s), y = Y(x, z); boxAt(G.fence, x, y + h / 2, z, 0.09, h + 0.3, 0.09, rotLD); boxAt(G.concrete, x, y + 0.03, z, 0.32, 0.1, 0.32, rotLD); }
    for (const [l0, l1] of [[s0 + 0.06, s0 + hw - 0.01], [s0 + hw + 0.01, s0 + w - 0.06]]) {
      const [x0, z0] = P(l0, 0.05), [x1, z1] = P(l1, 0.05), y0 = Y(x0, z0), y1 = Y(x1, z1);
      for (const yy of [0.12, h - 0.05]) bar(G.fence, [x0, y0 + yy, z0], [x1, y1 + yy, z1], 0.035, 0.035);
      for (const [x, z, y] of [[x0, z0, y0], [x1, z1, y1]]) bar(G.fence, [x, y + 0.1, z], [x, y + h - 0.03, z], 0.035, 0.035);
      bar(G.fence, [x0, y0 + 0.14, z0], [x1, y1 + h - 0.07, z1], 0.025, 0.025);
      A.mesh.quad([x0, y0 + 0.12, z0], [x1, y1 + 0.12, z1], [x1, y1 + h - 0.05, z1], [x0, y0 + h - 0.05, z0], [LT[0], 0, LT[1]], [0, 0, hw, 0, hw, h, 0, h]);
    }
    for (const [s, k] of [[s0 + 0.05, 1], [s0 + w - 0.05, -1]]) for (const yy of [0.3, h - 0.25]) { const [x, z] = P(s, 0.05); cyl(G.steel, x, Y(x, z) + yy - 0.06, z, 0.12, 0.022, 0.022, 6); }
    const [mx, mz] = P(s0 + hw, 0.09), my = Y(mx, mz);
    boxAt(G.steel, mx, my + 1.05, mz, 0.12, 0.05, 0.03, rotLD);
    boxAt(G.dark, mx + LT[0] * 0.03, my + 0.98, mz + LT[1] * 0.03, 0.045, 0.055, 0.022, rotLD);
    { const sh = new THREE.TorusGeometry(0.016, 0.004, 4, 10, Math.PI); sh.rotateY(rotLD); sh.translate(mx + LT[0] * 0.03, my + 1.008, mz + LT[1] * 0.03); G.steel.push(sh); }
    bar(G.steel, [mx - LD[0] * 0.08, my + 0.05, mz - LD[1] * 0.08], [mx - LD[0] * 0.08, my + 0.75, mz - LD[1] * 0.08], 0.018, 0.018);
  };
  gate(-11.6, 3.0, 4.0);
  gate(4.6, 3.0, 2.5);
  // the safety signs on the fences' pad sides
  for (const [s, t] of [[-6.6, 4.03], [12.4, 2.53]]) {
    const p = site(s - 0.3, t), q = site(s + 0.3, t), y = Y(...p);
    A.sign.quad([q[0], y + 0.7, q[1]], [p[0], y + 0.7, p[1]], [p[0], y + 1.55, p[1]], [q[0], y + 1.55, q[1]], [LT[0], 0, LT[1]], [0, 0, 1, 0, 1, 1, 0, 1]);
  }
  // ---- between the fences: the cabinets on their slabs (one on legs), a grey box, the floodlight pole
  for (const [s, t, w, h, d, legs] of [[-0.5, 1.0, 0.62, 1.5, 0.45, 0], [1.95, 0.6, 0.58, 0.9, 0.38, 0.6]]) {
    const [x, z] = site(s, t), y = FLOOR;
    boxAt(G.concrete, x, y + 0.06, z, 1.0, 0.16, 0.8, rotLD);
    if (legs) for (const o of [-0.22, 0.22]) { const [lx, lz] = site(s + o, t); boxAt(G.steel, lx, y + legs / 2, lz, 0.05, legs, 0.05); }
    boxAt(G.cabinet, x, y + 0.14 + legs + h / 2, z, w, h, d, rotLD + Math.PI / 2);
    boxAt(G.cabinet, x, y + 0.16 + legs + h, z, w + 0.06, 0.04, d + 0.08, rotLD + Math.PI / 2);
    boxAt(G.grey, x, y + 0.14 + legs + 0.04, z, w + 0.02, 0.08, d + 0.02, rotLD + Math.PI / 2);
    // (on both broad faces: the door's frame, its hinges, the handle, the louvres at the bottom)
    for (const sd of [-1, 1]) {
      const fx = x + LD[0] * sd * (d / 2 + 0.006), fz = z + LD[1] * sd * (d / 2 + 0.006), yc = y + 0.14 + legs + h / 2;
      for (const yy of [-h / 2 + 0.1, h / 2 - 0.05]) boxAt(G.cabinet, fx, yc + yy, fz, w - 0.03, 0.02, 0.012, rotLD + Math.PI / 2);
      for (const tt of [-1, 1]) { const ex = fx + LT[0] * tt * (w / 2 - 0.02), ez = fz + LT[1] * tt * (w / 2 - 0.02); boxAt(G.cabinet, ex, yc, ez, 0.02, h - 0.12, 0.012, rotLD + Math.PI / 2); }
      for (const yy of [-h * 0.32, h * 0.3]) { const ex = fx + LT[0] * (w / 2 - 0.005) + LD[0] * sd * 0.01, ez = fz + LT[1] * (w / 2 - 0.005) + LD[1] * sd * 0.01; cyl(G.grey, ex, yc + yy - 0.04, ez, 0.08, 0.012, 0.012, 6); }
      { const ex = fx - LT[0] * (w / 2 - 0.07) + LD[0] * sd * 0.02, ez = fz - LT[1] * (w / 2 - 0.07) + LD[1] * sd * 0.02; boxAt(G.dark, ex, yc, ez, 0.03, 0.14, 0.02, rotLD + Math.PI / 2); }
      for (let k = 0; k < 4; k++) boxAt(G.grey, fx + LD[0] * sd * 0.004, yc - h / 2 + 0.17 + k * 0.035, fz + LD[1] * sd * 0.004, w * 0.5, 0.012, 0.012, rotLD + Math.PI / 2);
    }
    if (legs) for (const o of [-0.12, 0.0, 0.12]) { const [cx, cz] = site(s + o * 0.6, t + o); cyl(G.grey, cx, y - 0.2, cz, legs + 0.36, 0.028, 0.028, 8); }
    box(x, z, w / 2 + 0.05, 0.3, rotLD, y - 0.5, y + 1.6 + legs, 'pole');
    grow(x, z, 1);
  }
  { const [x, z] = site(0.55, 1.2), y = FLOOR; boxAt(G.grey, x, y + 0.5, z, 0.42, 0.75, 0.3, rotLD); cyl(G.steel, x, y, z, 0.15, 0.06); }
  const pole = (s, t, h, lamp) => {
    const [x, z] = site(s, t), y = Y(x, z);
    // a perforated concrete pole (the vibrated type: two flanges joined by webs, holes between them)
    const taper = (k) => 1 - 0.45 * k;                                     // (the flanges narrow from 0.22 to 0.12 m)
    for (const d of [-0.075, 0.075]) {
      const g = new THREE.BoxGeometry(0.22, h + 0.8, 0.05, 1, 1, 1), pa = g.attributes.position;  // (deep along the line)
      for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 0) pa.setX(i, pa.getX(i) * taper(1));
      g.rotateY(rotLD); g.translate(x + LT[0] * d, y + h / 2 - 0.4, z + LT[1] * d); g.computeVertexNormals(); G.concrete.push(g);
    }
    for (let k = 0; k < h / 0.4; k++) { const f = (0.2 + k * 0.4 + 0.8) / (h + 0.8); boxAt(G.concrete, x, y + 0.2 + k * 0.4, z, 0.13 * taper(f), 0.14, 0.17, rotLD); }
    boxAt(G.concrete, x, y + h - 0.02, z, 0.13, 0.04, 0.2, rotLD);
    if (lamp) {
      // a slim LED floodlight: its die-cast body with cooling fins at the back, the glass tilted down, the U bracket
      const lx = x + LT[0] * 0.42, lz = z + LT[1] * 0.42, ly = y + h - 0.32;
      const bodyG = [], fin = [], glass = [];
      boxAt(bodyG, 0, 0, 0, 0.3, 0.05, 0.22); for (let k = 0; k < 7; k++) boxAt(fin, -0.12 + k * 0.04, 0.045, 0, 0.008, 0.04, 0.2);
      boxAt(glass, 0, -0.028, 0, 0.26, 0.006, 0.18);
      const T = new THREE.Matrix4().makeRotationY(rotLD + Math.PI / 2).multiply(new THREE.Matrix4().makeRotationZ(0.45)).setPosition(lx, ly, lz);
      for (const g of [...bodyG, ...fin]) { g.applyMatrix4(T); G.dark.push(g); }
      for (const g of glass) { g.applyMatrix4(T); G.lens.push(g); }
      bar(G.steel, [x + LT[0] * 0.1, ly + 0.12, z + LT[1] * 0.1], [lx, ly + 0.12, lz], 0.04, 0.03);
      bar(G.steel, [lx, ly + 0.12, lz], [lx, ly + 0.02, lz], 0.03, 0.03);
      bar(G.steel, [x + LT[0] * 0.11, ly + 0.06, z + LT[1] * 0.11], [x + LT[0] * 0.11, ly + 0.18, z + LT[1] * 0.11], 0.08, 0.02);
      // its cable down the pole's face into a conduit at the foot
      bar(G.dark, [x + LT[0] * 0.115, ly + 0.1, z + LT[1] * 0.115], [x + LT[0] * 0.12, y + 0.6, z + LT[1] * 0.12], 0.014, 0.014);
      cyl(G.grey, x + LT[0] * 0.13, y - 0.1, z + LT[1] * 0.13, 0.7, 0.025, 0.025, 8);
    }
    box(x, z, 0.15, 0.15, 0, y - 0.5, y + h, 'pole');
  };
  pole(0.6, -1.7, 6.6, true);
  pole(15.5, -11, 9, false);
  pole(12.6, 14.8, 9, false);

  // ---- the grass: a strip of dry tall grass between the gravel and the fences, tall grass with wild carrot inside them
  // and towards the wood, the meadow to the south full of it
  const tufts = (acc, s0, s1, t0, t1, n, w0, h0, skip) => { for (let i = 0; i < n; i++) { const s = s0 + R() * (s1 - s0), t = t0 + R() * (t1 - t0); if (skip && skip(s, t)) continue; const [x, z] = site(s, t); tuft(acc, x, Y(x, z), z, w0 * (0.8 + R() * 0.5), h0 * (0.7 + R() * 0.6), R() * 3); } };
  const inUnit = (s, t) => UNITS.some(u => Math.abs(t) < (u.skid + 0.6) * u.k && s > u.s - (u.face < 0 ? u.A + 0.9 : u.I + 2.7) * u.k && s < u.s + (u.face < 0 ? u.I + 2.7 : u.A + 0.9) * u.k);
  const inVan = (s, t) => Math.abs(s - VAN.s) < 2.7 && Math.abs(t - VAN.t) < 1.4;
  tufts(A.grassFl, -15.0, -1.6, -3.2, 3.8, 120, 0.9, 0.75, inUnit); tufts(A.grassFl, 3.2, 14.7, -2.4, 2.3, 100, 0.9, 0.8, inUnit);
  tufts(A.grassDry, -16, -1.5, 4.1, 6.4, 120, 0.9, 0.55); tufts(A.grassDry, -1.5, 16, 2.6, 5.0, 130, 0.9, 0.55);
  tufts(A.grassFl, -18, 18, -9, -2.7, 140, 1.0, 0.85);
  tufts(A.grassFl, 15, 38, -8, 22, 280, 1.0, 0.8, (s, t) => (s < 20.5 && t > 3) || inVan(s, t));
  tufts(A.grass, 15, 38, -8, 22, 170, 1.0, 0.6, (s, t) => (s < 20.5 && t > 3) || inVan(s, t));
  tufts(A.grass, -26, -18, -4, 24, 80, 0.9, 0.55);
  for (let i = 0; i < 30; i++) { const a = R() * 6.283, r = 0.3 + 0.75 * R(); const [x, z] = site(PUDDLE.s + Math.cos(a) * PUDDLE.a * r, PUDDLE.t + Math.sin(a) * PUDDLE.b * r); tuft(A.grass, x, FLOOR - 0.01, z, 0.18 + R() * 0.2, 0.08 + R() * 0.14, R() * 3); }
  // weeds coming up through the gravel: thick by the fences, sparse further out, none in the puddle
  for (let i = 0; i < 420; i++) {
    const s = -18 + R() * 37, t = 4 + R() * 22 * R() ** 0.6;
    if (inVan(s, t) || Math.hypot((s - PUDDLE.s) / PUDDLE.a, (t - PUDDLE.t) / PUDDLE.b) < 1.15) continue;
    if (Math.hypot(s - FIRE.s, t - FIRE.t) < 1.3 || (Math.abs(t - FIRE.seat[1]) < 0.45 && Math.abs(s - FIRE.seat[0]) < 1.1)) continue;
    const [x, z] = site(s, t); tuft(A.grass, x, Y(x, z), z, 0.2 + R() * 0.3, 0.1 + R() * 0.22, R() * 3);
  }

  // ---- flush the static parts
  A.slab.flush(B, Mt.slab, null, { noCast: true });
  A.grass.flush(B, Mt.grass, null, { noCast: true, noAO: true });
  A.grassFl.flush(B, Mt.grassFl, null, { noCast: true, noAO: true });
  A.grassDry.flush(B, Mt.grassDry, null, { noCast: true, noAO: true });
  A.mesh.flush(B, Mt.mesh, null, { noAO: true });
  A.sign.flush(B, Mt.sign, null, {});
  const geo = (list, mat, opts) => { if (list.length) B.geo(mat, merged(list), null, null, opts); };
  geo(G.fence, Mt.fenceBlue); geo(G.concrete, Mt.concrete); geo(G.cabinet, Mt.cabinet); geo(G.steel, Mt.steel); geo(G.grey, Mt.grey);
  geo(G.dark, Mt.dark); geo(G.lens, Mt.lens);
  for (const p of PAD) grow(p[0], p[1], 2);

  // ---- the puddle: its own mesh (a mirror; hidden under the snow)
  const pts = []; for (let k = 0; k < 56; k++) { const a = k / 56 * 6.283, r = 1 + 0.16 * Math.sin(a * 3 + 1) + 0.09 * Math.sin(a * 5 + 0.4) + 0.05 * Math.sin(a * 9 + 2.1) + 0.025 * Math.sin(a * 17 + 0.7); pts.push(site(PUDDLE.s + Math.cos(a) * PUDDLE.a * r, PUDDLE.t + Math.sin(a) * PUDDLE.b * r)); }
  const pg = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))));
  pg.rotateX(-Math.PI / 2); pg.translate(0, FLOOR - 0.005, 0);
  const puddle = new THREE.Mesh(pg, Mt.puddle); puddle.receiveShadow = true; puddle.userData.noAO = true;
  const [pcx, pcz] = site(PUDDLE.s, PUDDLE.t);

  // ---- on the forest road's verges, as in photo 86: hazel and hawthorn, young hornbeams and beeches, grown beeches,
  // hornbeams and oaks 1-3 m off the gravel (scattered trees)
  if (RP && GEO.trees) {
    const T = GEO.trees, add = [];
    for (let i = 0; i < RP.length - 1; i++) {
      const a = RP[i], b = RP[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      for (let d = 0; d < L; d += 3 + R() * 6) {
        const e = toEN(a[0] + dx * d, a[1] + dz * d)[0];
        if (e < WOOD_E[0] || e > WOOD_E[1]) continue;
        const k0 = R(), side = R() < 0.5 ? -1 : 1, o = side * (k0 < 0.55 ? 3.4 + R() * 1.8 : 4.0 + R() * 1.5), x = a[0] + dx * d - dz * o, z = a[1] + dz * d + dx * o;
        if (!forestCode(x - dz * side * 6, z + dx * side * 6)) continue;           // (the wood beyond)
        add.push(k0 < 0.55 ? [x, z, TREE_T.shrubTall, 0.45 + R() * 0.4] : [x, z, k0 < 0.8 ? TREE_T.hornbeamF : TREE_T.beech, 0.3 + R() * 0.2]);
      }
      // the grown trees lining it on both sides, their crowns meeting over it
      for (const side of [-1, 1]) for (let d = R() * 4; d < L; d += 3.5 + R() * 3.5) {
        const e = toEN(a[0] + dx * d, a[1] + dz * d)[0];
        if (e < WOOD_E[0] || e > WOOD_E[1]) continue;
        const o = side * (3.1 + R() * 1.6), x = a[0] + dx * d - dz * o, z = a[1] + dz * d + dx * o;
        if (!forestCode(x - dz * side * 6, z + dx * side * 6)) continue;
        const k = R();
        // (slender: mostly hornbeams and young beeches, the odd oak)
        add.push(k < 0.35 ? [x, z, TREE_T.beech, 0.6 + R() * 0.25] : k < 0.9 ? [x, z, TREE_T.hornbeamF, 0.65 + R() * 0.3] : [x, z, TREE_T.oakF, 0.6 + R() * 0.25]);
      }
    }
    if (add.length) {
      const n = T.n + add.length, x = new Float32Array(n), z = new Float32Array(n), t = new Uint8Array(n), sc = new Float32Array(n);
      x.set(T.x); z.set(T.z); t.set(T.t); sc.set(T.s);
      add.forEach(([ax, az, at_, as], k) => { x[T.n + k] = ax; z[T.n + k] = az; t[T.n + k] = at_; sc[T.n + k] = as; });
      GEO.trees = { n, x, z, t, s: sc };
    }
  }

  // ---- the views (photos 84-86) and the red Doblò on the pad (photo 85; oxidised paint: the bonnet in photo 86)
  const camView = (c, n, label, fov) => { const [x, z] = site(c.s, c.t), d = dirOf(c.az); return { n, from: [x, z], to: [x + d[0] * 20, z + d[1] * 20], pitch: c.pitch, fov, eye: c.eye, label }; };
  const views = [camView(CAM[84], 84, 'Poza 84 — sondele din pădure: unitatea Vulcan și balansierul ruginit', 59), camView(CAM[85], 85, 'Poza 85 — sondele din pădure: platforma de pietriș cu balta', 59)];
  if (RP) {
    // photo 86: on the straight ~200 m before the clearing, from the driver's seat, looking along the road (main lens)
    let k = 0, best = Infinity;
    for (let i = 0; i < RP.length; i++) { const d = Math.abs(toEN(...RP[i])[0] + 205); if (d < best) { best = d; k = i; } }
    const a = RP[k], b = RP[Math.min(RP.length - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
    const from = [a[0] + dx * 6 + dz * 0.3, a[1] + dz * 6 - dx * 0.3];             // (0.3 m left of the middle)
    views.push({ n: 86, from, to: [from[0] + dx * 30, from[1] + dz * 30], pitch: 0.03, fov: 33, eye: 1.25, label: 'Poza 86 — drumul de pietriș prin pădure spre sonde' });
  }
  const kd = site(VAN.s, VAN.t), kdir = dirOf(VAN.az);
  const [fx, fz] = site(FIRE.s, FIRE.t), seat = site(...FIRE.seat), wood = site(...FIRE.wood);
  const fire = { x: fx, z: fz, y: heightAt(fx, fz) + 0.03, seat: [...seat, Math.atan2(LD[1], LD[0])], wood: [...wood, Math.atan2(LT[1], LT[0])] };
  return {
    fire,
    type: 'sonda', name: 'Sondele din pădure', bbox: bb, units, views,
    cars: [{ x: kd[0], z: kd[1], h: Math.atan2(-kdir[0], -kdir[1]), model: 'doblo', paint: 0xa8161c, dusty: 0.6 }],
    groups: [...units.map(u => u.group), puddle, fringe],
    // the puddle mirrors the scene in any weather (the screen-space reflections are otherwise on only in the wet)
    mirrorNear: (cam) => puddle.visible && Math.hypot(cam.x - pcx, cam.z - pcz) < 70,
    // both units pump all the time; drawn within ~600 m, worked out within ~400 m
    animate(t, cam) {
      const d = Math.hypot(cam.x - C0[0], cam.z - C0[1]);
      for (const u of units) u.group.visible = d < 600;
      puddle.visible = d < 600 && SNOW.uSnow.value < 0.3;
      if (d > 400) return;
      for (const u of units) u.animate(t * u.spm / 60 * Math.PI * 2 + u.ph);
    },
  };
}
