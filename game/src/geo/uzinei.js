import * as THREE from 'three';
import { GEO, heightAt, gridHeight, addHolePoly, addFineZone, inPoly } from './data.js';
import { M } from '../materials.js';
import { Acc } from './bridge.js';
import { rng } from '../util.js';
import { canvas, tex, grain, blobs, boxAt, cyl, tube, catenary, merged, frame, pairs, road, clamp01 } from './pitigaia.js';

// Photos 78-83 (the user's Street View screenshots with their map insets, October 2024 and June 2022, "4PH6+MJX
// Poiana Câmpina"): Str. Uzinei (OSM: Strada Dimitrie Gusti) from the STOP junction with Strada Bisericii and Strada
// Sterieşti down past the PetroUtilaj works to the Primăria, and Strada Bisericii north of the junction.
//  * the cameras: each inset registered on the Google aerial (SIFT, ~300 matched points per inset), the blue disc's
//    centre is the pano, its arrow the heading; ~1.5 m of systematic offset towards the south-west taken out
//  * 83 (451 Str. Uzinei): at the junction, the STOP sign, the lamp and the transformer pole on the right, the red
//    Kangoo crossing on Strada Bisericii; 82 (227 Strada Bisericii, June 2022): north along it, the painted kerb and the
//    retaining wall with the vine trellis on the left, the white palisade on the right, the church tower far ahead
//  * 80 (CARABOI): the concrete retaining wall with its step on the left, the building with the tower above it;
//    81 (453): the long white hall with barred windows on the right, the painted kerb; 78 (217): the parking lot's
//    galvanised fence, the three-storey office with green window bands and its steel chimney, cars along the kerb;
//    79 (222): the long hall with the rusty roof behind the parking area, the "20" sign
//  * the aerial (measurements only): the carriageway 7.2 m wide below the junction, 9 m along the halls, the painted
//    kerb on the works' side with gaps at the yard entrances; the mapped line runs 2-3 m off the asphalt
// s runs along the mapped ways from the junction (0) towards the Primăria, o > 0 on the south-west (houses) side.
const IDS = ['271473987', '271473910', '14380927'];
const BIS = '34062352';
const S_END = 392, BIS_END = 110;
const SW = [[0, 2.6], [14, 2.2], [120, 2.2], [150, 3.2], [162, 4.2], [222, 4.2], [232, 3.2], [262, 2.8], [285, 2.0], [335, 2.0], [392, 1.8]];
const NE = [[0, -4.0], [12, -4.3], [45, -5.0], [80, -5.2], [160, -5.3], [200, -5.0], [219, -4.8], [226, -6.0], [240, -7.0], [247, -7.2], [252, -6.2], [276, -5.8], [282, -6.2], [287, -6.5], [335, -6.6], [392, -6.4]];
const KERB_NE = [[6, 219], [248, 277], [287, 349], [353, 368], [371.5, 392]];              // painted black and white; the gaps are the works' gates
const KB = { h: 0.16, w: 0.18 }, WALK = 2.3;
// below the Primăria (photos 77, 79): a painted median island, the Primăria's lane behind it, a walk and a stone-based fence
const ISLAND = { s0: 336, s1: 372, w: 0.6 }, LANE = 6.0, SWFENCE = { s0: 322, s1: 390, o: 7.6 };
// the shop with the glazed first floor on the works' side (photo 77), its gate with stone pillars
const SHOP = { s0: 351, s1: 368, o0: -8.6, o1: -20, h: 7.4 };
const WALL = { s0: 14, s1: 146, step: 0.9, stepH: 0.45, h: 2.6 };  // south-west retaining wall: low from the junction, tall from s 44 (photos 80, 83)
const BIS_W = -2.0, BIS_E = 6.3;                                  // Strada Bisericii's asphalt (o on its own mapped way)
const BWALL = { s0: 22, s1: 82, o: -5.7, h: 2.4 };                 // its west retaining wall with the vines (photo 82)
const TOWER = { s0: 40.5, s1: 46.5, o0: 3.4, o1: 9.4, h: 12.5, roof: 5.2 };
const TBODY = { s0: 29, s1: 46.5, o0: 9.4, o1: 36, h: 7.0 };
const HALL_A = { s0: 132, s1: 171, o0: -8.0, o1: -26, eave: 6.0, ridge: 8.4 };
const HALL_B = { s0: 183, s1: 219, o0: -8.4, o1: -30, eave: 4.8, rise: 8.5 };   // a steep shed roof up to the back, skylights near its top (photo 81)
const ANNEX = { s0: 247.5, s1: 258, o0: -8.8, o1: -20, h: 6.4 };
const OFFICE = { s0: 258, s1: 276, o0: -12.0, o1: -48, h: 9.8 };
const FAR = { s0: 224, s1: 246, o0: -10, o1: -24, h: 10.2 };                // three floors of ribbon windows (photo 78)
const CHIMNEY = { s: 258.7, o: -11.4, h: 13.2, r: 0.34 };
const DIAG = { a: [276, -15.2], b: [319.2, -36.8], depth: 16.5, eave: 6.2, ridge: 10.7, back: 18 };
const DROP = ['265126855', '265229727', '265229825', '265230331', '265122404', '265122217'];   // (the last: the parking lot is open now, photo 78)   // replaced by the buildings measured here
const STYLE = {
  '265125325': { wall: 'stuccoWhite', roof: 'roofMetalTeal', roofType: 'gable', pitch: 30 },   // white, turquoise roof (photo 78)
  '265125481': { wall: 'stuccoCream', roof: 'roofMetalBrown' }, '265125610': { wall: 'stuccoWhite', roof: 'roofMetalRed' },
  '304015160': { wall: 'stuccoCream', roof: 'roofMetalBrown' }, '304015161': { wall: 'stuccoWhite', roof: 'roofMetalRed' },
  '265122383': { wall: 'stuccoWhite', roof: 'roofMetalRust' }, '265122380': { wall: 'stuccoCream', roof: 'roofMetalGray' },
};
const UP = [0, 1, 0];

const smooth = (a, b, t) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u); };
const lin = (A, x) => { if (x <= A[0][0]) return A[0][1]; for (let i = 0; i < A.length - 1; i++) if (x <= A[i + 1][0]) return A[i][1] + (A[i + 1][1] - A[i][1]) * (x - A[i][0]) / (A[i + 1][0] - A[i][0]); return A[A.length - 1][1]; };
const sw = (s) => lin(SW, s), ne = (s) => lin(NE, s);
const bwallH = (s) => 0.15 + (BWALL.h - 0.15) * smooth(BWALL.s0, BWALL.s0 + 3, s) * (1 - smooth(BWALL.s1 - 3, BWALL.s1, s));
const kerbAt = (s) => KERB_NE.some(([a, b]) => s >= a && s <= b);
const wallH = (s) => s < WALL.s0 || s > WALL.s1 ? 0 : (0.7 + (WALL.h - 0.7) * smooth(40, 48, s)) * (1 - 0.6 * smooth(WALL.s1 - 8, WALL.s1, s));
const stepW = (s) => WALL.step * smooth(40, 46, s);

// ------------------------------------------------------------------ before the terrain, roads and trees
let ST = null;
export function prepareUzinei() {
  ST = null;
  const rs = IDS.map(road), rb = road(BIS);
  if (rs.some(r => !r) || !rb || !GEO.W) return false;
  // the chain from the junction: the three ways reversed
  const Ps = rs.map(r => pairs(r.p).reverse());
  for (let i = 0; i < 2; i++) { const a = Ps[i][Ps[i].length - 1], b = Ps[i + 1][0]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1) return false; }
  const P = [...Ps[0], ...Ps[1].slice(1), ...Ps[2].slice(1)], F = frame(P);
  if (F.L < S_END + 20) return false;
  // the last way is split at S_END: the part towards Strada Centru stays with roads.js
  {
    const r = rs[2], P0 = pairs(r.p), F0 = frame(P0), sC0 = F.L - F0.L, cut = F0.L - (S_END - sC0), i0 = F0.S.findIndex(s => s > cut), q = F0.at(cut);
    const { p: _p, id: _id, ...rest } = r;
    r.p = [...P0.slice(0, i0), [q.x, q.z]].flat();
    GEO.roads.splice(GEO.roads.indexOf(r) + 1, 0, { ...rest, id: r.id + ':uz', p: [[q.x, q.z], ...P0.slice(i0)].flat(), own: 'uzinei' });
  }
  rs[0].own = 'uzinei'; rs[1].own = 'uzinei';
  // Strada Bisericii from the junction: its first BIS_END metres are drawn here
  const PB0 = pairs(rb.p), FB0 = frame(PB0);
  let FB = null;
  if (FB0.L > BIS_END + 20 && Math.hypot(PB0[0][0] - P[0][0], PB0[0][1] - P[0][1]) < 1) {
    const i0 = FB0.S.findIndex(s => s > BIS_END), q = FB0.at(BIS_END), { p: _p, id: _id, ...rest } = rb, low = [...PB0.slice(0, i0), [q.x, q.z]];
    rb.p = [[q.x, q.z], ...PB0.slice(i0)].flat();
    GEO.roads.splice(GEO.roads.indexOf(rb) + 1, 0, { ...rest, id: BIS + ':uz', p: low.flat(), own: 'uzinei' });
    FB = frame(low);
  }
  const W = (s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
  const loc = (x, z) => F.local(x, z);
  const WB = FB ? (s, o) => { const q = FB.at(s), [ux, uz] = FB.dir(s); return [q.x - uz * o, q.z + ux * o]; } : null;
  const locB = FB ? (x, z) => FB.local(x, z) : () => null;
  // long profiles: the terrain along the middle of each carriageway, averaged over +-10 m
  const Wg = GEO.W;
  const prof = (Wf, s0, s1, oMid) => {
    const raw = []; for (let s = s0; s <= s1 + 1e-6; s += 2) raw.push([s, gridHeight(Wg, ...Wf(s, oMid(s)))]);
    return raw.map(([s]) => { let a = 0, n = 0; for (const [t, y] of raw) if (Math.abs(t - s) <= 10) { a += y; n++; } return [s, a / n]; });
  };
  const PU = prof(W, 0, S_END + 10, (s) => (sw(s) + ne(s)) / 2), Yu = (s) => lin(PU, s);
  const PBp = FB ? prof(WB, 0, BIS_END, () => (BIS_W + BIS_E) / 2) : null;
  const j0 = Yu(0), Yb = FB ? (s) => lin(PBp, s) + (j0 - lin(PBp, 0)) * (1 - smooth(0, 25, s)) : null;
  ST = { F, W, loc, Yu, FB, WB, locB, Yb };
  // the 1 m terrain: carriageways level across, the kerbs' walks, the ground behind the retaining walls
  {
    const { ext, step } = Wg;
    const cell = (v) => -ext + (Math.floor((v + ext) / step) + 0.5) * step;
    const inU = (l) => !!l && l.s > 0.3 && l.s < S_END + 6 && l.o > -22 && l.o < 34;
    const inB = (l) => !!l && l.s > 4 && l.s < BIS_END + 4 && l.o > -14 && l.o < 14;
    const inZone = (x, z) => inU(loc(cell(x), cell(z))) || inB(locB(cell(x), cell(z)));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const grow = (Wf, s0, s1, o0, o1) => { for (let s = s0; s <= s1; s += 4) for (const o of [o0, o1]) { const [x, z] = Wf(s, o); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } };
    grow(W, -8, S_END + 10, -34, 46); if (FB) grow(WB, 0, BIS_END + 8, -26, 26);
    addFineZone({ x0, x1, z0, z1, test: inZone, h: (x, z) => {
      const g = gridHeight(Wg, x, z), l = loc(x, z), lb = locB(x, z);
      if (inU(l) && !(inB(lb) && l.s < 8 && Math.abs(lb.o) < Math.abs(l.o))) {
        const w = smooth(0.3, 6, l.s) * (1 - smooth(S_END - 4, S_END + 6, l.s)) * smooth(-22, -14, l.o) * (1 - smooth(24, 34, l.o));
        return w > 0 ? g + (groundU(l.s, l.o, Yu(l.s), g) - g) * w : g;
      }
      if (inB(lb)) {
        const w = smooth(4, 10, lb.s) * (1 - smooth(BIS_END - 4, BIS_END + 4, lb.s)) * smooth(-14, -9, lb.o) * (1 - smooth(9, 14, lb.o));
        return w > 0 ? g + (groundB(lb.s, lb.o, Yb(lb.s), g) - g) * w : g;
      }
      return g;
    } });
  }
  // no forest or lot fences along the street; the mapped trees on the asphalt, walks and new buildings dropped
  const band = (Wf, s0, s1, o0, o1) => { const A = [], Bk = []; for (let s = s0; s <= s1 + 1e-6; s += 5) { A.push(Wf(s, o0(s))); Bk.push(Wf(s, o1(s))); } return [...A, ...Bk.reverse()]; };
  const HOLES = [band(W, -2, S_END + 4, (s) => ne(s) - WALK - 1.2, (s) => sw(s) + 2.0)];
  if (FB) HOLES.push(band(WB, 0, BIS_END + 2, () => BIS_W - 4, () => BIS_E + 2.2));
  for (const H of HOLES) addHolePoly(H, { noFences: true, scatter: false });
  const NEW = [rectP(W, HALL_A), rectP(W, HALL_B), rectP(W, ANNEX), rectP(W, OFFICE), rectP(W, FAR), rectP(W, SHOP), diagP(W, 0), diagP(W, 1), rectP(W, TBODY), rectP(W, TOWER)];
  for (const H of NEW) addHolePoly(H, { noFences: true, scatter: false });
  if (GEO.trees) {
    const T = GEO.trees, keep = [];
    for (let k = 0; k < T.n; k++) if (!HOLES.some(H => inPoly(H, T.x[k], T.z[k])) && !NEW.some(H => inPoly(H, T.x[k], T.z[k]))) keep.push(k);
    let seed = 7883; const Rn = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const add = [];
    // above the retaining wall: birches and maples in their autumn colours in the photos, a spruce at its end
    for (let s = 52; s < 140; s += 5 + Rn() * 3) add.push([W, s, sw(s) + 4 + Rn() * 6, Rn() < 0.6 ? 12 : 1, 0.85 + Rn() * 0.35]);
    for (const [s, o] of [[48, 6], [51, 10.5], [47.5, 15], [53, 16], [49, 21]]) add.push([W, s, o, Rn() < 0.5 ? 12 : 1, 0.9 + Rn() * 0.3]);   // in front of the tower's building (photo 80)
    for (let s = 58; s < 138; s += 2.2 + Rn()) add.push([W, s, sw(s) + WALL.step + 0.9 + Rn() * 1.2, 11, 0.9 + Rn() * 0.4]);
    add.push([W, 141, sw(141) + 7.5, 2, 1.05], [W, 150.5, sw(150.5) + 6.5, 12, 1.0], [W, 138, sw(138) + 9, 1, 1.1]);
    // the gardens of the south-west houses (photo 81), the pine and spruce by the parking lot (photo 78)
    for (const [s, o, t, sc] of [[166, 8.5, 3, 0.8], [180, 8, 12, 0.9], [190, 7.5, 3, 0.75], [199, 9, 12, 0.8], [228, 7.5, 3, 0.7], [246, 13, 15, 1.1], [249, 18, 2, 1.0], [254, 17, 12, 1.0], [300, 6.5, 12, 0.85], [312, 7, 3, 0.8]]) add.push([W, s, o, t, sc]);
    // the works' side: a tree by the office (photo 78), junipers by the gate and the parking area (photos 79, 77)
    for (const [s, o, t, sc] of [[277.5, -11.5, 12, 0.9], [296, -8.2, 13, 0.55], [305, -8.3, 13, 0.5], [245.5, -9, 13, 0.5], [100, -10, 12, 0.9], [112, -9.5, 3, 0.8], [30, -9, 12, 0.9], [45, -10, 1, 0.9]]) add.push([W, s, o, t, sc]);
    // below the Primăria (photo 77): the big tree behind the fence, junipers by the shop and its gate
    for (const [s, o, t, sc] of [[365, 10.2, 1, 1.6], [358.5, 11.5, 12, 1.35], [352, 11.5, 12, 1.0], [349.5, -9.6, 13, 0.55], [348.2, -9.8, 13, 0.5], [369.8, -9.4, 13, 0.5]]) add.push([W, s, o, t, sc]);
    // Strada Bisericii: the verge's shrubs, the gardens behind the palisade (photo 82)
    if (FB) {
      for (let s = 24; s < 84; s += 2 + Rn() * 1.5) add.push([WB, s, BIS_W - 2.2 - Rn() * 1.4, 11, 0.8 + Rn() * 0.4]);
      for (const [s, o, t, sc] of [[34, 11, 12, 1.1], [48, 12, 2, 1.0], [62, 10.5, 12, 1.15], [76, 12.5, 12, 1.05], [92, 11, 12, 1.1], [104, 12, 3, 0.9], [18, -9, 12, 0.9]]) add.push([WB, s, o, t, sc]);
    }
    const m = keep.length + add.length, x = new Float32Array(m), z = new Float32Array(m), t = new Uint8Array(m), sc = new Float32Array(m);
    keep.forEach((k, i) => { x[i] = T.x[k]; z[i] = T.z[k]; t[i] = T.t[k]; sc[i] = T.s[k]; });
    add.forEach(([Wf, as, ao, at, asc], i) => { const [ax, az] = Wf(as, ao); x[keep.length + i] = ax; z[keep.length + i] = az; t[keep.length + i] = at; sc[keep.length + i] = asc; });
    GEO.trees = { n: m, x, z, t, s: sc };
  }
  // the buildings measured here replace the mapped ones; the others on the rebuilt ground take its level
  GEO.buildings = GEO.buildings.filter(b => !DROP.includes(String(b.id)));
  for (const bd of GEO.buildings) {
    const st = STYLE[String(bd.id)];
    if (st) bd.o = { ...(bd.o || {}), ...st };
    const l = loc(bd.p[0], bd.p[1]), lb = locB(bd.p[0], bd.p[1]);
    if (!(l && l.s > -10 && l.s < S_END + 10 && l.o > -40 && l.o < 50) && !(lb && lb.s < BIS_END + 10 && Math.abs(lb.o) < 30)) continue;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < bd.p.length; i += 2) { const y = heightAt(bd.p[i], bd.p[i + 1]); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    bd.y0 = lo; bd.y1 = hi;
  }
  return true;
}

// footprints in the street frame
function rectP(W, R) { return [W(R.s0, R.o0), W(R.s1, R.o0), W(R.s1, R.o1), W(R.s0, R.o1)]; }
function diagP(W, k) {
  const a = W(...DIAG.a), b = W(...DIAG.b), dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), nx = dz / L, nz = -dx / L;
  // away from the street: the side of the normal pointing to more negative o
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t = ST ? ST.loc(m[0] + nx, m[1] + nz) : null, sg = !t || t.o < (DIAG.a[1] + DIAG.b[1]) / 2 ? 1 : -1;
  const d0 = k === 0 ? 0 : DIAG.depth, d1 = k === 0 ? DIAG.depth : DIAG.depth + DIAG.back;
  const off = (p, d) => [p[0] + nx * sg * d, p[1] + nz * sg * d];
  return [off(a, d0), off(b, d0), off(b, d1), off(a, d1)];
}

// the ground across Str. Uzinei at (s, o), y: its carriageway there, g: the terrain grid
function groundU(s, o, y, g) {
  const n = ne(s), w = sw(s);
  if (o >= n && o <= w) return y;
  if (o < n) {                                                                  // the works' side: walks, gates, yards
    const top = kerbAt(s) ? y + KB.h : y + 0.03;
    if (o > n - WALK - 14) return top;
    return g + (top - g) * clamp01(1 - (n - WALK - 14 - o) / 8);
  }
  const hW = wallH(s), sw0 = stepW(s);
  if (hW > 0.05) {                                                              // the step and the ground above the wall
    if (o < w + sw0 + 0.6) return y + (sw0 > 0.05 ? WALL.stepH : 0.12);
    const top = y + hW;
    return o < w + 18 ? Math.max(top, g) : g + (Math.max(top, g) - g) * clamp01(1 - (o - w - 18) / 10);
  }
  if (s > ISLAND.s0 - 1 && s < ISLAND.s1 + 1) {                                  // the Primăria's lane behind the island, the walk
    if (o < LANE) return y;
    const top = y + 0.15;
    return o < SWFENCE.o + 0.4 ? top : g + (top - g) * clamp01(1 - (o - SWFENCE.o - 0.4) / 8);
  }
  const top = y + 0.12;
  if (o < w + 3) return top;
  return g + (top - g) * clamp01(1 - (o - w - 3) / 9);
}
// Strada Bisericii: the verge up to the wall on the west, the walk and the palisade on the east
function groundB(s, o, y, g) {
  if (o >= BIS_W && o <= BIS_E) return y;
  if (o < BIS_W) {
    const inW = s > BWALL.s0 && s < BWALL.s1;
    if (o > BWALL.o - 0.6) return y + KB.h + 0.05 * (BIS_W - o);
    const top = inW ? y + bwallH(s) : y + 0.4;
    return Math.max(top, g);
  }
  const top = y + KB.h;
  if (o < BIS_E + 2.5) return top;
  return g + (top - g) * clamp01(1 - (o - BIS_E - 2.5) / 6);
}

// ------------------------------------------------------------------ textures and materials
let MT = null;
function mats() {
  if (MT) return MT;
  const R = rng(7890);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const off = (m, u = -4) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: u });
  const render = (g, w, h, base, R) => { g.fillStyle = base; g.fillRect(0, 0, w, h); blobs(g, 0, 0, w, h, 60, 6, 30, ['rgba(160,158,150,0.10)', 'rgba(120,118,110,0.08)', 'rgba(255,255,255,0.08)'], R); grain(g, w, h, 8, R); };
  // kerb stones painted black and white, a metre each
  const kb = canvas(128, 16), kg = kb.getContext('2d');
  kg.fillStyle = '#e8e8e4'; kg.fillRect(0, 0, 64, 16); kg.fillStyle = '#202122'; kg.fillRect(64, 0, 64, 16); grain(kg, 128, 16, 18, R);
  // the long hall (photo 81): white render, a grey plinth, a square window with a bar grid every 6 m (tile 6 x 6 m)
  const hw = canvas(256, 256), hg = hw.getContext('2d');
  render(hg, 256, 256, '#eeeeea', R);
  hg.fillStyle = '#9d9c97'; hg.fillRect(0, 234, 256, 22);
  { const x0 = 96, y0 = 94, s = 64; hg.fillStyle = '#6f746f'; hg.fillRect(x0 - 3, y0 - 3, s + 6, s + 6); hg.fillStyle = '#39413f'; hg.fillRect(x0, y0, s, s);
    hg.strokeStyle = '#c9ccc8'; hg.lineWidth = 2.2; for (let i = 0; i <= 8; i++) { hg.beginPath(); hg.moveTo(x0 + i * s / 8, y0); hg.lineTo(x0 + i * s / 8, y0 + s); hg.stroke(); hg.beginPath(); hg.moveTo(x0, y0 + i * s / 8); hg.lineTo(x0 + s, y0 + i * s / 8); hg.stroke(); }
    hg.fillStyle = 'rgba(0,0,0,0.12)'; hg.fillRect(x0 - 4, y0 + s + 3, s + 8, 3); }
  hg.fillStyle = '#b8bbb8'; hg.fillRect(4, 0, 5, 234);                          // the downpipe at the bay's edge
  // the office (photo 78): three floors of 3.4 m, a band of green-tinted windows in white mullions (tile 3.2 x 3.4 m)
  const of = canvas(128, 136), og = of.getContext('2d');
  render(og, 128, 136, '#efefeb', R);
  og.fillStyle = '#56796b'; og.fillRect(0, 40, 128, 62);
  for (let x = 0; x < 128; x += 32) { og.fillStyle = '#e9ebe7'; og.fillRect(x, 40, 5, 62); og.fillStyle = 'rgba(200,225,215,0.25)'; og.fillRect(x + 8, 44, 10, 54); }
  og.fillStyle = '#e9ebe7'; og.fillRect(0, 68, 128, 3);
  // the long hall behind the parking area (photo 79): white wall, a band of windows in green frames (tile 6 x 7 m)
  const dh = canvas(192, 224), dg = dh.getContext('2d');
  render(dg, 192, 224, '#ecebe6', R);
  dg.fillStyle = '#9a9994'; dg.fillRect(0, 208, 192, 16);
  dg.fillStyle = '#3f6d55'; dg.fillRect(0, 60, 192, 50);
  for (let x = 0; x < 192; x += 24) { dg.fillStyle = '#2d4a3b'; dg.fillRect(x + 2, 64, 20, 42); dg.fillStyle = 'rgba(190,210,205,0.35)'; dg.fillRect(x + 4, 66, 7, 38); }
  // the building with the tower (photo 80): worn beige stucco, a dark window per bay (tile 3 x 3.2 m)
  // the shop (photo 77): a stone-clad ground floor with a big window, the glazed first floor in yellow frames (tile 3.3 x 6.6 m)
  const sh = canvas(100, 200), sg = sh.getContext('2d');
  sg.fillStyle = '#cfc6b3'; sg.fillRect(0, 100, 100, 100);
  for (let y = 100; y < 200; y += 8) for (let x = (y / 8) % 2 ? 0 : -9; x < 100; x += 18) { const v = 175 + R() * 45; sg.fillStyle = `rgb(${v},${Math.round(v * 0.95)},${Math.round(v * 0.86)})`; sg.fillRect(x + 1, y + 1, 16, 6); }
  sg.fillStyle = '#b7ab8f'; sg.fillRect(18, 114, 64, 72); sg.fillStyle = '#3a3d3c'; sg.fillRect(22, 118, 56, 64); sg.fillStyle = 'rgba(200,180,90,0.35)'; sg.fillRect(24, 120, 20, 60);
  sg.fillStyle = '#e8e3d6'; sg.fillRect(0, 0, 100, 100); sg.fillStyle = '#e2b52e'; sg.fillRect(4, 18, 92, 70);
  for (let x = 4; x < 96; x += 23) { sg.fillStyle = '#4c5250'; sg.fillRect(x + 4, 22, 17, 62); sg.fillStyle = 'rgba(210,220,215,0.3)'; sg.fillRect(x + 6, 24, 5, 58); }
  sg.fillStyle = '#e2b52e'; sg.fillRect(4, 50, 92, 3); grain(sg, 100, 200, 10, R);
  const tw = canvas(96, 102), tg = tw.getContext('2d');
  render(tg, 96, 102, '#d9d1be', R);
  blobs(tg, 0, 60, 96, 42, 20, 5, 16, ['rgba(120,110,90,0.2)', 'rgba(90,85,75,0.15)'], R);
  tg.fillStyle = '#b9b09b'; tg.fillRect(30, 26, 36, 50); tg.fillStyle = '#2f3032'; tg.fillRect(34, 30, 28, 42);
  tg.fillStyle = '#c9c2b0'; tg.fillRect(30, 76, 36, 4);
  // black steel bars (fence panels between stone pillars, photo 80) and galvanised bars (the parking lot, photo 78)
  const bars = (colr, n, rails) => { const c = canvas(256, 128), g = c.getContext('2d'); g.clearRect(0, 0, 256, 128); g.fillStyle = colr; for (let i = 0; i < n; i++) g.fillRect(i * 256 / n, 0, 5, 128); for (const y of rails) g.fillRect(0, y, 256, 6); return c; };
  // white palisade (photo 82): wide slats with gaps
  const pal = canvas(256, 128), pg = pal.getContext('2d');
  pg.clearRect(0, 0, 256, 128); for (let x = 0; x < 256; x += 32) { pg.fillStyle = '#f2f2ef'; pg.fillRect(x + 2, 0, 24, 128); pg.fillStyle = 'rgba(0,0,0,0.08)'; pg.fillRect(x + 22, 0, 4, 128); }
  pg.fillStyle = '#e6e6e2'; pg.fillRect(0, 14, 256, 8); pg.fillRect(0, 104, 256, 8);
  // brown plank fence (photo 81)
  const pk = canvas(128, 128), kk = pk.getContext('2d');
  for (let x = 0; x < 128; x += 16) { const v = 118 + R() * 22; kk.fillStyle = `rgb(${v},${Math.round(v * 0.62)},${Math.round(v * 0.42)})`; kk.fillRect(x, 0, 15, 128); kk.fillStyle = 'rgba(40,20,10,0.5)'; kk.fillRect(x + 15, 0, 1, 128); }
  grain(kk, 128, 128, 14, R);
  // Virginia creeper on the works' fence (photo 78): red and orange leaves, a few green ones
  const cr = canvas(256, 128), cg = cr.getContext('2d');
  cg.fillStyle = '#4a2a1c'; cg.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 1400; i++) { const x = R() * 256, y = R() * 128, r = 3 + R() * 5, h = R(); cg.fillStyle = h < 0.55 ? `rgb(${150 + R() * 70},${30 + R() * 40},${25 + R() * 20})` : h < 0.85 ? `rgb(${190 + R() * 50},${90 + R() * 60},${30 + R() * 20})` : `rgb(${70 + R() * 40},${100 + R() * 40},${40})`; cg.beginPath(); cg.ellipse(x, y, r, r * 0.8, R() * 3, 0, 7); cg.fill(); }
  // vine leaves on the trellis (photo 82)
  const vn = canvas(256, 128), vg = vn.getContext('2d');
  vg.clearRect(0, 0, 256, 128);
  for (let i = 0; i < 420; i++) { const cx0 = R() * 256, cy0 = 30 + R() * 98; for (let k = 0; k < 3; k++) { const x = cx0 + (R() - 0.5) * 30, y = cy0 + (R() - 0.5) * 24 + (k === 0 ? 0 : 0), r = 3 + R() * 6, v = 50 + R() * 80; vg.fillStyle = `rgb(${Math.round(v * 0.62)},${Math.round(v * 1.18)},${Math.round(v * 0.42)})`; vg.beginPath(); vg.ellipse(x, y, r, r * 0.85, R() * 3, 0, 7); vg.fill(); } }
  // signs
  const sign = (draw) => { const c = canvas(128, 128), g = c.getContext('2d'); g.clearRect(0, 0, 128, 128); draw(g); return c; };
  const stop = sign((g) => { g.fillStyle = '#f4f4f2'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(64 + 62 * Math.cos(a), 64 + 62 * Math.sin(a)); } g.fill(); g.fillStyle = '#c1121c'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(64 + 57 * Math.cos(a), 64 + 57 * Math.sin(a)); } g.fill(); g.fillStyle = '#fff'; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 64, 66); });
  const lim20 = sign((g) => { g.fillStyle = '#c1121c'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#f7f7f4'; g.beginPath(); g.arc(64, 64, 48, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('20', 64, 67); });
  const nostop = sign((g) => { g.fillStyle = '#c1121c'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#1d4fa0'; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.fill(); g.strokeStyle = '#c1121c'; g.lineWidth = 12; g.beginPath(); g.moveTo(30, 30); g.lineTo(98, 98); g.moveTo(98, 30); g.lineTo(30, 98); g.stroke(); });
  const cut = (c) => std({ map: tex(c), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 });
  MT = {
    asphalt: Object.assign(M.asphalt.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -8 }),
    marking: Object.assign(M.marking.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -10 }),
    kerbPaint: std({ map: tex(kb, { repeat: true }), roughness: 0.8 }),
    kerb: std({ map: M.concrete.map, roughness: 0.85, color: 0xcfccc4 }),
    walk: off(std({ map: M.concrete.map, normalMap: M.concrete.normalMap, roughness: 0.92, color: 0xbab7ae }), -3),
    walkAsph: off(std({ map: M.asphalt.map, normalMap: M.asphalt.normalMap, roughness: 0.95, color: 0x9c9a95 }), -3),
    concrete: std({ map: M.concrete.map, normalMap: M.concrete.normalMap, roughness: 0.9, color: 0xc4c0b6 }),
    hall: std({ map: tex(hw, { repeat: true }), roughness: 0.9 }),
    office: std({ map: tex(of, { repeat: true }), roughness: 0.8 }),
    diag: std({ map: tex(dh, { repeat: true }), roughness: 0.9 }),
    tower: std({ map: tex(tw, { repeat: true }), roughness: 0.92 }),
    shop: std({ map: tex(sh, { repeat: true }), roughness: 0.8 }),
    white: std({ map: M.concrete.map, roughness: 0.9, color: 0xecebe6 }),
    roofDark: std({ map: M.roofMetalGray.map, normalMap: M.roofMetalGray.normalMap, roughness: 0.55, metalness: 0.45, color: 0x55595e, side: THREE.DoubleSide }),
    roofGray: std({ map: M.roofMetalGray.map, normalMap: M.roofMetalGray.normalMap, roughness: 0.5, metalness: 0.5, color: 0x8d9296, side: THREE.DoubleSide }),
    roofRust: std({ map: M.roofMetalGray.map, normalMap: M.roofMetalGray.normalMap, roughness: 0.75, metalness: 0.3, color: 0x8a5a40, side: THREE.DoubleSide }),
    roofRed: std({ map: M.roofTiles.map, normalMap: M.roofTiles.normalMap, roughness: 0.75, color: 0xa4443a, side: THREE.DoubleSide }),
    skylight: std({ color: 0xc9d2d4, roughness: 0.3, metalness: 0.2 }),
    flat: std({ color: 0x6a6b69, roughness: 0.95 }),
    barsBlack: cut(bars('#1c1d1f', 22, [4, 118])),
    barsGalv: cut(bars('#a9aeb2', 26, [6, 116])),
    palisade: cut(pal),
    planks: std({ map: tex(pk, { repeat: true }), roughness: 0.9 }),
    creeper: std({ map: tex(cr, { repeat: true }), roughness: 0.8 }),
    vines: std({ map: tex(vn, { repeat: true }), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
    stop: cut(stop), lim20: cut(lim20), nostop: cut(nostop),
    galv: M.galv, black: M.blackMetal, stone: M.stoneCladding, pole: M.concretePole,
    steel: std({ color: 0xa3a8ab, roughness: 0.45, metalness: 0.7 }),
    trafo: std({ color: 0x6e7270, roughness: 0.6, metalness: 0.5 }),
    lamp: std({ color: 0x8d9092, roughness: 0.4, metalness: 0.6 }),
    signBack: std({ color: 0x8e9396, roughness: 0.5, metalness: 0.6 }),
  };
  return MT;
}

// ------------------------------------------------------------------ build
export function buildUzinei(B, world) {
  if (!ST) return null;
  const { W, loc, Yu, FB, WB, locB, Yb, F } = ST;
  const Mt = mats();
  const A = {};
  const acc = (k) => (A[k] ??= new Acc());
  const G = {};
  const gl = (k) => (G[k] ??= []);
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const seg = (p, q, t, y0, y1, tag) => { const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz); box((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, L / 2, t, Math.atan2(-dz, dx), y0, y1, tag); };
  const R = rng(7891);
  const Y = (x, z) => heightAt(x, z);
  const surfaces = [];
  const out = { type: 'uzinei', name: 'Str. Uzinei', wires: [], cars: [] };
  // a band between two offsets on a frame, draped on y(s, o)
  const band = (Wf, a, s0, s1, oa, ob, y, uv, step = 1) => {
    const fa = typeof oa === 'function' ? oa : () => oa, fb = typeof ob === 'function' ? ob : () => ob;
    for (let s = s0; s < s1 - 1e-6; s += step) {
      const t = Math.min(s1, s + step), a0 = Wf(s, fa(s)), b0 = Wf(t, fa(t)), a1 = Wf(s, fb(s)), b1 = Wf(t, fb(t));
      a.quad([a0[0], y(s, fa(s)), a0[1]], [b0[0], y(t, fa(t)), b0[1]], [b1[0], y(t, fb(t)), b1[1]], [a1[0], y(s, fb(s)), a1[1]], UP, uv(s, t, fa, fb, a0, b0, b1, a1));
    }
  };
  const wuv = (tile) => (s, t, fa, fb, a0, b0, b1, a1) => [a0, b0, b1, a1].flatMap(([x, z]) => [x / tile, z / tile]);
  // a vertical face along an offset, between yb(s) and yt(s); its outward normal on the +o side if sgn > 0
  const face = (Wf, a, s0, s1, oo, yb, yt, sgn, uv, step = 1) => {
    const f = typeof oo === 'function' ? oo : () => oo;
    for (let s = s0; s < s1 - 1e-6; s += step) {
      const t = Math.min(s1, s + step), p = Wf(s, f(s)), q = Wf(t, f(t)), m = Wf((s + t) / 2, f((s + t) / 2)), n = Wf((s + t) / 2, f((s + t) / 2) + sgn);
      a.quad([p[0], yb(s), p[1]], [q[0], yb(t), q[1]], [q[0], yt(t), q[1]], [p[0], yt(s), p[1]], [n[0] - m[0], 0, n[1] - m[1]], uv(s, t));
    }
  };
  // a wall between two points (vertical quad), uv in metres over tile sizes
  const wallQ = (a, p, q, y0p, y0q, y1p, y1q, tu, tv, u0 = 0, hint = null) => {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = hint ?? [q[1] - p[1], 0, -(q[0] - p[0])];
    a.quad([p[0], y0p, p[1]], [q[0], y0q, q[1]], [q[0], y1q, q[1]], [p[0], y1p, p[1]], n, [u0 / tu, 0, (u0 + L) / tu, 0, (u0 + L) / tu, (y1q - y0q) / tv, u0 / tu, (y1p - y0p) / tv]);
  };

  // ================================================================ Str. Uzinei's carriageway, kerbs and walks
  const yR = (s) => Yu(s) + 0.035;
  band(W, acc('asphalt'), -1, S_END, ne, sw, (s) => yR(s), wuv(1.3), 1);
  {
    const oK = (s) => ne(s) + 0.01, oT = (s) => ne(s) - KB.w, yK = (s) => yR(s) + KB.h;
    for (const [s0, s1] of KERB_NE) {
      face(W, acc('kerbPaint'), s0, s1, oK, (s) => yR(s) - 0.05, yK, 1, (s, t) => [s / 2, 0, t / 2, 0, t / 2, 1, s / 2, 1], 1);
      band(W, acc('kerbPaint'), s0, s1, oT, oK, yK, (s, t) => [s / 2, 0.1, t / 2, 0.1, t / 2, 0.9, s / 2, 0.9], 1);
      band(W, acc('walk'), s0, s1, (s) => ne(s) - KB.w - WALK, oT, (s) => yK(s) - 0.005, wuv(2.5), 1);
      surfaces.push((x, z) => { const l = loc(x, z); return l && l.s > s0 && l.s < s1 && l.o < ne(l.s) && l.o > ne(l.s) - KB.w - WALK ? yK(l.s) : null; });
    }
    // the works' gates: the asphalt runs on into the yards
    for (const [s0, s1] of [[219, 248], [277, 287]]) band(W, acc('asphalt'), s0, s1, (s) => ne(s) - 12, ne, (s, o) => Y(...W(s, o)) + 0.03, wuv(1.3), 1);
    // the south-west side: a plain kerb and a walk where there is no retaining wall
    const oS = (s) => sw(s) - 0.01, oS2 = (s) => sw(s) + KB.w, ySK = (s) => yR(s) + 0.12;
    for (const [s0, s1] of [[WALL.s1 + 0.5, ISLAND.s0 - 1], [ISLAND.s1 + 1, S_END]]) {
      face(W, acc('kerb'), s0, s1, oS, (s) => yR(s) - 0.05, ySK, -1, (s, t) => [s, 0, t, 0, t, 0.15, s, 0.15], 1);
      band(W, acc('kerb'), s0, s1, oS, oS2, ySK, (s, t) => [s, 0.2, t, 0.2, t, 0.35, s, 0.35], 1);
      band(W, acc('walkAsph'), s0, s1, oS2, (s) => sw(s) + 2.6, (s, o) => Math.max(ySK(s) - 0.005, Y(...W(s, o)) + 0.02), wuv(2), 1);
    }
  }
  // ---- below the Primăria: the lane behind the painted island, its walk (photos 77, 79)
  {
    const s0 = ISLAND.s0 - 1, s1 = ISLAND.s1 + 1;
    band(W, acc('asphalt'), s0, s1, sw, LANE, (s) => yR(s), wuv(1.3), 1);
    const yI = (s) => yR(s) + KB.h;
    face(W, acc('kerbPaint'), ISLAND.s0, ISLAND.s1, (s) => sw(s), (s) => yR(s) - 0.05, yI, -1, (s, t) => [s / 2, 0, t / 2, 0, t / 2, 1, s / 2, 1], 1);
    face(W, acc('kerbPaint'), ISLAND.s0, ISLAND.s1, (s) => sw(s) + ISLAND.w, (s) => yR(s) - 0.05, yI, 1, (s, t) => [s / 2, 0, t / 2, 0, t / 2, 1, s / 2, 1], 1);
    band(W, acc('kerbPaint'), ISLAND.s0, ISLAND.s1, (s) => sw(s), (s) => sw(s) + ISLAND.w, yI, (s, t) => [s / 2, 0.1, t / 2, 0.1, t / 2, 0.9, s / 2, 0.9], 1);
    for (const [ss, sg] of [[ISLAND.s0, -1], [ISLAND.s1, 1]]) { const a = W(ss, sw(ss)), b = W(ss, sw(ss) + ISLAND.w), [ux, uz] = F.dir(ss); acc('kerbPaint').quad([a[0], yR(ss) - 0.05, a[1]], [b[0], yR(ss) - 0.05, b[1]], [b[0], yI(ss), b[1]], [a[0], yI(ss), a[1]], [ux * sg, 0, uz * sg], [0, 0, 0.3, 0, 0.3, 1, 0, 1]); }
    for (let s = ISLAND.s0; s < ISLAND.s1; s += 3) { const t = Math.min(ISLAND.s1, s + 3); seg(W(s, sw(s) + 0.3), W(t, sw(t) + 0.3), 0.3, yR(s) - 1, yI(s), 'kerb'); }
    surfaces.push((x, z) => { const l = loc(x, z); return l && l.s > ISLAND.s0 && l.s < ISLAND.s1 && l.o > sw(l.s) && l.o < sw(l.s) + ISLAND.w ? yI(l.s) : null; });
    const yW = (s) => yR(s) + 0.15;
    face(W, acc('kerb'), s0, s1, LANE, (s) => yR(s) - 0.05, yW, -1, (s, t) => [s, 0, t, 0, t, 0.15, s, 0.15], 1);
    band(W, acc('walk'), s0, s1, LANE, SWFENCE.o, yW, wuv(2.5), 1);
    surfaces.push((x, z) => { const l = loc(x, z); return l && l.s > s0 && l.s < s1 && l.o > LANE && l.o < SWFENCE.o ? yW(l.s) : null; });
  }
  // ---- the retaining wall on the south-west (photo 80): a concrete step at its foot, the wall, its coping
  {
    const s0 = WALL.s0, s1 = WALL.s1, o1 = (s) => sw(s), o2 = (s) => sw(s) + stepW(s), yb = (s) => yR(s) - 0.05, yS = (s) => yR(s) + (stepW(s) > 0.05 ? WALL.stepH : 0.12), yT = (s) => yR(s) + wallH(s);
    const cu = (s, t) => [s / 3, 0, t / 3, 0, t / 3, 0.3, s / 3, 0.3];
    face(W, acc('concrete'), s0, s1, o1, yb, yS, -1, cu, 1);
    band(W, acc('concrete'), s0, s1, o1, o2, yS, (s, t) => [s / 3, 0, t / 3, 0, t / 3, 0.3, s / 3, 0.3], 1);
    face(W, acc('concrete'), s0, s1, o2, yS, yT, -1, (s, t) => [s / 3, 0, t / 3, 0, t / 3, wallH(s) / 3, s / 3, wallH(s) / 3], 1);
    band(W, acc('concrete'), s0, s1, o2, (s) => sw(s) + stepW(s) + 0.6, (s) => yT(s) + 0.02, (s, t) => [s / 3, 0, t / 3, 0, t / 3, 0.08, s / 3, 0.08], 1);
    for (let s = s0; s < s1; s += 3) { const t = Math.min(s1, s + 3); if (stepW(s) > 0.05) seg(W(s, sw(s) + 0.45), W(t, sw(t) + 0.45), 0.45, yR(s) - 1, yR(s) + WALL.stepH, 'step'); seg(W(s, sw(s) + stepW(s) + 0.15), W(t, sw(t) + stepW(t) + 0.15), 0.15, yR(s) - 1, yT(s) + 0.1, 'wall'); }
    surfaces.push((x, z) => { const l = loc(x, z); return l && l.s > 44 && l.s < s1 && l.o > sw(l.s) && l.o < sw(l.s) + stepW(l.s) ? yS(l.s) : null; });
    // the old fence posts along its top, their mesh gone
    for (let s = 50; s < s1 - 4; s += 3) { const [x, z] = W(s, sw(s) + stepW(s) + 0.12); tube(gl('rust'), [x, yT(s), z], [x, yT(s) + 1.2, z], 0.025, 4); }
  }

  // ================================================================ Strada Bisericii north of the junction (photo 82)
  if (FB) {
    const yB = (s) => Yb(s) + 0.035;
    band(WB, acc('asphalt'), 0, BIS_END, BIS_W, BIS_E, (s) => yB(s), wuv(1.3), 1);
    const line = (s0, s1, o, w, dash) => { for (let s = s0; s < s1; s += dash ? 3 : 1) band(WB, acc('marking'), s, Math.min(s1, s + (dash ? 1 : 1)), o - w / 2, o + w / 2, (t) => yB(t) + 0.004, (a, b) => [0, 0, 1, 0, 1, 1, 0, 1], 1); };
    line(20, BIS_END - 2, BIS_E - 0.4, 0.12, true);                               // the dashed edge line on the east
    // the zebra at the junction
    for (let k = 0; k < 7; k++) { const o = BIS_W + 0.6 + k * 1.0; band(WB, acc('marking'), 11, 16.5, o, o + 0.5, (t) => yB(t) + 0.004, () => [0, 0, 1, 0, 1, 1, 0, 1], 5.5); }
    // the west kerb painted black and white, the verge, the retaining wall with the trellis of vines
    const oK = BIS_W - 0.01, yK = (s) => yB(s) + KB.h;
    face(WB, acc('kerbPaint'), 18, BIS_END, oK, (s) => yB(s) - 0.05, yK, 1, (s, t) => [s / 2, 0, t / 2, 0, t / 2, 1, s / 2, 1], 1);
    band(WB, acc('kerbPaint'), 18, BIS_END, oK, BIS_W - KB.w, yK, (s, t) => [s / 2, 0.1, t / 2, 0.1, t / 2, 0.9, s / 2, 0.9], 1);
    const s0 = BWALL.s0, s1 = BWALL.s1, yw0 = (s) => yB(s) + 0.1, yw1 = (s) => yB(s) + bwallH(s);
    face(WB, acc('concrete'), s0, s1, BWALL.o, yw0, yw1, 1, (s, t) => [s / 3, 0, t / 3, 0, t / 3, 0.7, s / 3, 0.7], 1);
    band(WB, acc('concrete'), s0, s1, BWALL.o - 0.6, BWALL.o, (s) => yw1(s) + 0.02, (s, t) => [s / 3, 0, t / 3, 0, t / 3, 0.1, s / 3, 0.1], 1);
    for (let s = s0; s < s1; s += 3) { const t = Math.min(s1, s + 3); seg(WB(s, BWALL.o - 0.15), WB(t, BWALL.o - 0.15), 0.15, yB(s) - 1, yw1(s), 'wall'); }
    for (let s = s0 + 1; s < s1 - 1; s += 2.6) {                                 // the trellis: rusty posts, wires, vines
      const [x, z] = WB(s, BWALL.o - 0.35), y = yw1(s);
      tube(gl('rust'), [x, y - 0.1, z], [x, y + 1.9, z], 0.03, 4);
      const [x2, z2] = WB(s, BWALL.o - 1.6); tube(gl('rust'), [x, y + 1.9, z], [x2, Y(x2, z2) + 2.0, z2], 0.02, 4);
    }
    face(WB, acc('vines'), s0 + 1, s1 - 1, BWALL.o - 0.4, (s) => yw1(s) + 0.1, (s) => yw1(s) + 1.8, 1, (s, t) => [s / 3, 0, t / 3, 0, t / 3, 1, s / 3, 1], 2);
    band(WB, acc('vines'), s0 + 1, s1 - 1, BWALL.o - 1.6, BWALL.o - 0.4, (s) => yw1(s) + 1.95, (s, t) => [s / 3, 0, t / 3, 0, t / 3, 0.5, s / 3, 0.5], 2);
    // the east walk and the white palisade on its low base
    const oE = BIS_E, oP = BIS_E + 1.6, yE = (s) => yB(s) + KB.h;
    face(WB, acc('kerb'), 16, BIS_END, oE + 0.01, (s) => yB(s) - 0.05, yE, -1, (s, t) => [s, 0, t, 0, t, 0.15, s, 0.15], 1);
    band(WB, acc('walkAsph'), 16, BIS_END, oE, oP + 0.2, yE, wuv(2), 1);
    surfaces.push((x, z) => { const l = locB(x, z); return l && l.s > 16 && l.s < BIS_END && l.o > oE && l.o < oP + 0.2 ? yE(l.s) : null; });
    for (let s = 26; s < BIS_END - 2; s += 2.5) {
      const t = Math.min(BIS_END - 2, s + 2.5), p = WB(s, oP), q = WB(t, oP), yp = yE(s), yq = yE(t);
      wallQ(acc('white'), p, q, yp - 0.1, yq - 0.1, yp + 0.3, yq + 0.3, 2, 1);
      wallQ(acc('palisade'), p, q, yp + 0.3, yq + 0.3, yp + 1.45, yq + 1.45, 1.2, 1.15);
      cyl(gl('galvWhite'), p[0], yp + 0.2, p[1], 1.35, 0.04, 0.04, 6);
      seg(p, q, 0.1, yp - 0.5, yp + 1.45, 'fence');
    }
  }

  // ================================================================ fences and walls along Str. Uzinei
  const fenceLine = (s0, s1, o, h, key, tu, plinth = 0, plinthMat = null, postKey = null, span = 2.5) => {
    for (let s = s0; s < s1 - 1e-6; s += span) {
      const t = Math.min(s1, s + span), p = W(s, typeof o === 'function' ? o(s) : o), q = W(t, typeof o === 'function' ? o(t) : o), yp = Y(...p), yq = Y(...q);
      if (plinth > 0) wallQ(acc(plinthMat), p, q, yp - 0.1, yq - 0.1, yp + plinth, yq + plinth, 2, 1);
      wallQ(acc(key), p, q, yp + plinth, yq + plinth, yp + plinth + h, yq + plinth + h, tu, h);
      if (postKey) cyl(gl(postKey), p[0], yp, p[1], plinth + h + 0.05, 0.035, 0.035, 5);
      seg(p, q, 0.08, yp - 0.5, yp + plinth + h, 'fence');
    }
  };
  // the stone-clad pillars and black bar panels on the works' side (photo 80)
  {
    const oF = (s) => ne(s) - KB.w - WALK - 0.2;
    for (let s = 52; s < 100; s += 3) {
      const [x, z] = W(s, oF(s)), y = Y(x, z), [ux, uz] = F.dir(s), rot = -Math.atan2(uz, ux);
      boxAt(gl('stone'), x, y + 0.95, z, 0.45, 1.9, 0.45, rot); boxAt(gl('cap'), x, y + 1.95, z, 0.55, 0.1, 0.55, rot);
      box(x, z, 0.23, 0.23, rot, y - 0.5, y + 1.9, 'pillar');
      if (s + 3 < 100) { const p = W(s + 0.23, oF(s)), q = W(s + 2.77, oF(s + 3)); wallQ(acc('barsBlack'), p, q, y + 0.25, Y(...q) + 0.25, y + 1.75, Y(...q) + 1.75, 2.54, 1.5); wallQ(acc('concrete'), p, q, y - 0.1, Y(...q) - 0.1, y + 0.25, Y(...q) + 0.25, 2, 1); seg(p, q, 0.06, y - 0.5, y + 1.75, 'fence'); }
    }
  }
  fenceLine(100, 132, (s) => ne(s) - KB.w - WALK - 0.2, 1.6, 'barsBlack', 2.5, 0.3, 'concrete', 'black');
  fenceLine(12, 50, (s) => ne(s) - KB.w - WALK - 0.2, 1.5, 'barsGalv', 2.5, 0.35, 'concrete', 'galv');
  // the red creeper over the works' fence by the office (photo 78)
  for (let s = 262; s < 277; s += 2.5) { const t = Math.min(277, s + 2.5), p = W(s, ne(s) - KB.w - WALK - 0.2), q = W(t, ne(t) - KB.w - WALK - 0.2), yp = Y(...p), yq = Y(...q); wallQ(acc('creeper'), p, q, yp - 0.05, yq - 0.05, yp + 2.1 + R() * 0.3, yq + 2.1, 3, 2.2); seg(p, q, 0.2, yp - 0.5, yp + 2.2, 'hedge'); }
  // the south-west: brown plank fences and concrete-framed panels by the houses (photo 81), the parking lot's
  // galvanised bars on a stone-clad plinth (photo 78), dark bar fences further down (photo 79)
  fenceLine(164, 202, 5.8, 1.75, 'planks', 2, 0, null, null);
  fenceLine(202, 230, 5.8, 1.5, 'barsBlack', 2.5, 0.4, 'concrete', 'black');
  fenceLine(152, 164, 5.8, 1.5, 'barsGalv', 2.5, 0.4, 'concrete', 'galv');
  fenceLine(260.5, 283.5, (s) => sw(s) + 1.1, 1.55, 'barsGalv', 2.5, 0.45, 'stone', 'galv');
  fenceLine(286, 318, (s) => sw(s) + 1.2, 1.45, 'barsBlack', 2.5, 0.35, 'concrete', 'black');
  fenceLine(SWFENCE.s0, SWFENCE.s1, SWFENCE.o, 1.35, 'barsGalv', 2.5, 0.5, 'stone', 'galv');
  

  // ================================================================ the buildings measured on the aerial
  // a box building: footprint corners C (4), walls between y0 and eave, a flat, gable or pyramid roof
  const building = (C, y0, eave, { wall = 'white', tu = 3, tv = 3, front = null, frontTu = tu, frontTv = tv, roof = 'flat', ridge = 0, ridgeAxis = 0, roofMat = 'roofGray', overhang = 0.35, tag = 'house', skylight = false } = {}) => {
    const cx = C.reduce((a, p) => a + p[0], 0) / 4, cz = C.reduce((a, p) => a + p[1], 0) / 4;
    for (let i = 0; i < 4; i++) {
      const p = C[i], q = C[(i + 1) % 4], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      let n = [q[1] - p[1], 0, -(q[0] - p[0])]; if (n[0] * (m[0] - cx) + n[2] * (m[1] - cz) < 0) n = [-n[0], 0, -n[2]];
      const isF = front && i === 0;
      wallQ(acc(isF ? front : wall), p, q, y0, y0, eave, eave, isF ? frontTu : tu, isF ? frontTv : tv, 0, n);
      seg(p, q, 0.25, y0 - 1, eave + (roof === 'flat' ? 0.4 : ridge), tag);
    }
    if (roof === 'flat') {
      const P = C.map(([x, z]) => [x, eave, z]);
      acc('flat').quad(P[0], P[1], P[2], P[3], UP, [0, 0, 1, 0, 1, 1, 0, 1]);
      for (let i = 0; i < 4; i++) { const p = C[i], q = C[(i + 1) % 4]; wallQ(acc('white'), p, q, eave, eave, eave + 0.45, eave + 0.45, 2, 1); }
      return;
    }
    // gable with the ridge along edge (ridgeAxis, ridgeAxis + 2), or a pyramid
    const e = (k) => C[k % 4], ov = (p, dx, dz, d) => [p[0] + dx * d, p[1] + dz * d];
    if (roof === 'pyramid') {
      const apex = [cx, eave + ridge, cz];
      for (let i = 0; i < 4; i++) {
        const p = e(i), q = e(i + 1), P = ov(p, p[0] - cx, p[1] - cz, overhang / Math.hypot(p[0] - cx, p[1] - cz)), Q = ov(q, q[0] - cx, q[1] - cz, overhang / Math.hypot(q[0] - cx, q[1] - cz));
        const yP = eave - overhang * ridge / Math.hypot(p[0] - cx, p[1] - cz);
        acc(roofMat).quad([P[0], yP, P[1]], [Q[0], yP, Q[1]], apex, apex, UP, [0, 0, 2, 0, 1, 2, 1, 2]);
      }
      return;
    }
    if (roof === 'shed') {                                                     // low along a0-a1, rising by `ridge` to b0-b1
      const a0 = e(ridgeAxis), a1 = e(ridgeAxis + 1), b1 = e(ridgeAxis + 2), b0 = e(ridgeAxis + 3), yh = eave + ridge;
      const L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), ux = (a1[0] - a0[0]) / L, uz = (a1[1] - a0[1]) / L, D = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), vx = (b0[0] - a0[0]) / D, vz = (b0[1] - a0[1]) / D;
      const ex = (p, du, dv) => [p[0] + ux * du + vx * dv, p[1] + uz * du + vz * dv];
      const P0 = ex(a0, -overhang, -overhang), P1 = ex(a1, overhang, -overhang), Q1 = ex(b1, overhang, overhang), Q0 = ex(b0, -overhang, overhang), sl = Math.hypot(D + 2 * overhang, ridge);
      const ye = eave - overhang * ridge / D, yt = yh + overhang * ridge / D;
      acc(roofMat).quad([P0[0], ye, P0[1]], [P1[0], ye, P1[1]], [Q1[0], yt, Q1[1]], [Q0[0], yt, Q0[1]], UP, [0, 0, (L + 2 * overhang) / 3, 0, (L + 2 * overhang) / 3, sl / 3, 0, sl / 3]);
      wallQ(acc(wall), b0, b1, eave, eave, yh, yh, tu, tv, 0, [vx, 0, vz]);
      for (const [p, q, sg] of [[a0, b0, -1], [a1, b1, 1]]) acc(wall).quad([p[0], eave, p[1]], [q[0], eave, q[1]], [q[0], yh, q[1]], [q[0], yh, q[1]], [ux * sg, 0, uz * sg], [0, 0, D / tu, 0, D / tu, ridge / tv, D / tu, ridge / tv]);
      if (skylight) {                                                          // the strip of skylights near the top (photo 81)
        const t0 = 0.45, t1 = 0.88, sh = 3, f = (p, t, d) => [p[0] + vx * D * t + ux * d, p[1] + vz * D * t + uz * d], yk = (t) => eave + ridge * t + 0.06;
        const A0 = f(a0, t0, sh), A1 = f(a1, t0, -sh), B1 = f(a1, t1, -sh), B0 = f(a0, t1, sh);
        acc('skylight').quad([A0[0], yk(t0), A0[1]], [A1[0], yk(t0), A1[1]], [B1[0], yk(t1), B1[1]], [B0[0], yk(t1), B0[1]], UP);
      }
      return;
    }
    const a0 = e(ridgeAxis), a1 = e(ridgeAxis + 1), b1 = e(ridgeAxis + 2), b0 = e(ridgeAxis + 3);   // eaves a0-a1 and b0-b1
    const r0 =[(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], r1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2], yr = eave + ridge;
    const half = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]) / 2, slope = ridge / half, L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    const ux = (a1[0] - a0[0]) / L, uz = (a1[1] - a0[1]) / L;
    for (const [p, q] of [[a0, a1], [b0, b1]]) {
      const dx = (p[0] - r0[0]) / half, dz = (p[1] - r0[1]) / half, P = [p[0] + dx * overhang - ux * overhang, p[1] + dz * overhang - uz * overhang], Q = [q[0] + dx * overhang + ux * overhang, q[1] + dz * overhang + uz * overhang];
      const R0 = [r0[0] - ux * overhang, r0[1] - uz * overhang], R1 = [r1[0] + ux * overhang, r1[1] + uz * overhang], ye = eave - overhang * slope, sl = Math.hypot(half + overhang, ridge + overhang * slope);
      acc(roofMat).quad([P[0], ye, P[1]], [Q[0], ye, Q[1]], [R1[0], yr, R1[1]], [R0[0], yr, R0[1]], UP, [0, 0, (L + 2 * overhang) / 3, 0, (L + 2 * overhang) / 3, sl / 3, 0, sl / 3]);
    }
    for (const [p, q, sg] of [[a0, b0, -1], [a1, b1, 1]]) { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; acc(wall).quad([p[0], eave, p[1]], [q[0], eave, q[1]], [m[0], yr, m[1]], [m[0], yr, m[1]], [ux * sg, 0, uz * sg], [0, 0, 2 * half / tu, 0, half / tu, ridge / tv, half / tu, ridge / tv]); }
    if (skylight) {                                                            // a strip of skylights on the far slope
      const t0 = 0.2, t1 = 0.75, f = (k) => [b0[0] + (r0[0] - b0[0]) * k, b0[1] + (r0[1] - b0[1]) * k], g = (k) => [b1[0] + (r1[0] - b1[0]) * k, b1[1] + (r1[1] - b1[1]) * k], yk = (k) => eave + ridge * k + 0.06;
      const p0 = f(t0), p1 = g(t0), q1 = g(t1), q0 = f(t1), sh = 3;
      const P0 = [p0[0] + ux * sh, p0[1] + uz * sh], P1 = [p1[0] - ux * sh, p1[1] - uz * sh], Q1 = [q1[0] - ux * sh, q1[1] - uz * sh], Q0 = [q0[0] + ux * sh, q0[1] + uz * sh];
      acc('skylight').quad([P0[0], yk(t0), P0[1]], [P1[0], yk(t0), P1[1]], [Q1[0], yk(t1), Q1[1]], [Q0[0], yk(t1), Q0[1]], UP);
    }
  };
  // the ground level under a footprint: its lowest corner (the works stand on the street's level)
  const low = (C) => Math.min(...C.map(([x, z]) => Y(x, z)));
  // the building with the tower above the retaining wall (photos 80, 81): two floors under a red roof, the tower
  {
    const Cb = rectP(W, TBODY), yb = Yu(TBODY.s1) + WALL.h;
    building(Cb, yb - 1.2, yb + TBODY.h, { wall: 'tower', tu: 3, tv: 3.2, roof: 'gable', ridge: 5.5, ridgeAxis: 1, roofMat: 'roofRed', overhang: 0.6 });
    // dormers along the roof (aerial): small gabled boxes
    for (const o of [15, 21, 27, 33]) for (const s of [TBODY.s0 + 0.3, TBODY.s1 - 0.3]) { const [x, z] = W(s, o), [ux, uz] = F.dir(s); boxAt(gl('red'), x - ux * (s < 40 ? -0.9 : 0.9), yb + TBODY.h + 1.6, z - uz * (s < 40 ? -0.9 : 0.9), 1.8, 1.4, 1.4, -Math.atan2(uz, ux)); }
    const Ct = rectP(W, TOWER), yt = yb - 1.2;
    building(Ct, yt, yb + TOWER.h, { wall: 'tower', tu: 3, tv: 3.2, roof: 'pyramid', ridge: TOWER.roof, roofMat: 'roofRed', overhang: 0.5 });
    // the round window high on the tower's street face (photo 80)
    { const [x, z] = W((TOWER.s0 + TOWER.s1) / 2, TOWER.o0 - 0.03), g = new THREE.TorusGeometry(0.7, 0.09, 6, 20), [ux, uz] = F.dir(43); g.rotateY(-Math.atan2(uz, ux)); g.translate(x, yb + TOWER.h - 1.8, z); gl('cream').push(g); }
    // the cross on the apex
    { const [x, z] = W((TOWER.s0 + TOWER.s1) / 2, (TOWER.o0 + TOWER.o1) / 2); cyl(gl('black'), x, yb + TOWER.h + TOWER.roof - 0.2, z, 1.1, 0.03, 0.03, 4); }
  }
  // the works of PetroUtilaj on the north-east side
  {
    // the halls stand in steps down the street (their floors level)
    const sm = HALL_A.s0 + (HALL_A.s1 - HALL_A.s0) / 2;
    for (const [a, b] of [[HALL_A.s0, sm], [sm, HALL_A.s1]]) { const C = rectP(W, { ...HALL_A, s0: a, s1: b }); building(C, low(C) - 0.3, Yu((a + b) / 2) + HALL_A.eave, { wall: 'hall', tu: 6, tv: 6, front: 'hall', roof: 'gable', ridge: HALL_A.ridge - HALL_A.eave, ridgeAxis: 0, roofMat: 'roofGray' }); }
    const CB = rectP(W, HALL_B);
    building(CB, low(CB) - 0.3, Yu((HALL_B.s0 + HALL_B.s1) / 2) + HALL_B.eave, { wall: 'hall', tu: 6, tv: 6, front: 'hall', roof: 'shed', ridge: HALL_B.rise, ridgeAxis: 0, roofMat: 'roofDark', skylight: true });
    const CF = rectP(W, FAR);
    building(CF, low(CF) - 0.3, Yu((FAR.s0 + FAR.s1) / 2) + FAR.h, { wall: 'office', tu: 3.2, tv: 3.4, roof: 'flat' });
    const CN = rectP(W, ANNEX);
    building(CN, low(CN) - 0.3, Yu(ANNEX.s1) + ANNEX.h, { wall: 'office', tu: 3.2, tv: 3.4, roof: 'flat' });
    { const [x, z] = W(ANNEX.s0 - 0.5, ANNEX.o0 + 0.9), [x2, z2] = W(ANNEX.s1, ANNEX.o0 + 0.9), y = Yu(ANNEX.s1) + 3.1;           // the flat canopy
      const [ux, uz] = F.dir(252); boxAt(gl('whiteBox'), (x + x2) / 2, y, (z + z2) / 2, Math.hypot(x2 - x, z2 - z), 0.25, 2.0, -Math.atan2(uz, ux)); }
    const CO = rectP(W, OFFICE);
    building(CO, low(CO) - 0.3, Yu(OFFICE.s0) + OFFICE.h, { wall: 'office', tu: 3.2, tv: 3.4, front: 'office', roof: 'flat' });
    // the logo plaque on the office's street face (photo 78)
    { const [x, z] = W(OFFICE.s0 + 5, OFFICE.o0 + 0.05), [ux, uz] = F.dir(265); boxAt(gl('cream'), x, Yu(OFFICE.s0) + 6.2, z, 1.2, 1.0, 0.08, -Math.atan2(uz, ux)); }
    // the steel chimney at its corner
    { const [x, z] = W(CHIMNEY.s, CHIMNEY.o), y = Y(x, z);
      cyl(gl('steel'), x, y - 0.3, z, CHIMNEY.h, CHIMNEY.r, CHIMNEY.r * 0.92, 12); cyl(gl('steel'), x, y + CHIMNEY.h - 0.4, z, 0.4, CHIMNEY.r * 1.15, CHIMNEY.r * 1.15, 12);
      for (const hh of [4, 8, 12]) { const [x2, z2] = W(CHIMNEY.s + 0.9, CHIMNEY.o - 0.5); tube(gl('steel'), [x, y + hh, z], [x2, y + hh, z2], 0.04, 4); }
      box(x, z, CHIMNEY.r, CHIMNEY.r, 0, y - 1, y + CHIMNEY.h, 'pole'); }
    // the long hall with the rusty roof behind the parking area (photo 79), a dark hall behind it
    const CD = diagP(W, 0), CD2 = diagP(W, 1), yD = low(CD);
    building(CD, yD - 0.3, yD + DIAG.eave, { wall: 'diag', tu: 6, tv: 7, front: 'diag', roof: 'gable', ridge: DIAG.ridge - DIAG.eave, ridgeAxis: 0, roofMat: 'roofRust' });
    building(CD2, yD - 0.3, yD + DIAG.eave + 1, { wall: 'hall', tu: 6, tv: 6, roof: 'gable', ridge: 2.5, ridgeAxis: 0, roofMat: 'roofDark' });
    // a lower shed across the parking area's far end
  }

  // the shop with the glazed first floor below the Primăria (photo 77), the gate with stone pillars beside it
  {
    const C = rectP(W, SHOP), y0 = low(C) - 0.3;
    building(C, y0, Yu((SHOP.s0 + SHOP.s1) / 2) + KB.h + SHOP.h, { wall: 'shop', tu: 3.3, tv: 6.6, roof: 'gable', ridge: 1.4, ridgeAxis: 0, roofMat: 'roofGray', overhang: 0.9 });
    const oG = SHOP.o0;
    for (const sp of [368.4, 371.2]) { const [x, z] = W(sp, oG), y = Y(x, z), [ux, uz] = F.dir(sp), rot = -Math.atan2(uz, ux); boxAt(gl('stone'), x, y + 0.95, z, 0.5, 1.9, 0.5, rot); boxAt(gl('cap'), x, y + 1.95, z, 0.6, 0.1, 0.6, rot); box(x, z, 0.25, 0.25, rot, y - 0.5, y + 1.9, 'pillar'); }
    { const p = W(368.7, oG), q = W(370.9, oG); wallQ(acc('barsBlack'), p, q, Y(...p) + 0.1, Y(...q) + 0.1, Y(...p) + 1.75, Y(...q) + 1.75, 2.2, 1.65); seg(p, q, 0.06, Y(...p) - 0.5, Y(...p) + 1.75, 'gate'); }
  }

  // ================================================================ poles, wires, lamps, signs
  const wiresBetween = (P) => { for (let i = 0; i < P.length - 1; i++) { const p = P[i], q = P[i + 1]; for (const [dh, lat] of [[8.5, 0.5], [8.5, -0.5], [8.0, 0.2], [7.4, 0], [6.9, 0.15]]) { const dx = q[0] - p[0], dz = q[2] - p[2], L = Math.hypot(dx, dz), nx = -dz / L * lat, nz = dx / L * lat; catenary(out.wires, [p[0] + nx, p[1] + dh, p[2] + nz], [q[0] + nx, q[1] + dh, q[2] + nz], 0.3 + L * 0.004, 10); } } };
  const pole = (Wf, s, o) => { const [x, z] = Wf(s, o), y = Y(x, z); boxAt(gl('pole'), x, y + 4.5, z, 0.3, 9.6, 0.22, 0); boxAt(gl('pole'), x, y + 9.35, z, 0.22, 0.1, 0.16, 0); tube(gl('black'), [x - 0.7, y + 8.7, z], [x + 0.7, y + 8.7, z], 0.04, 4); box(x, z, 0.16, 0.12, 0, y - 1, y + 9.5, 'pole'); return [x, y, z]; };
  // concrete poles on the south-west side below the halls, on the works' side above them (from their shadows)
  const PS = [[178, 7.0], [206, 5.6], [252, 3.8], [282, 3.4], [307, 3.2]].map(([s, o]) => pole(W, s, o));
  wiresBetween(PS);
  const PN = [[18, -8.0], [58, -8.4], [98, -8.4], [138, -8.3], [176, -8.0]].map(([s, o]) => pole(W, s, o));
  wiresBetween(PN);
  // street lamps: a steel mast and an arm over the carriageway (photos 78, 79, 81, 83)
  const lamp = (Wf, s, o, toO) => { const [x, z] = Wf(s, o), y = Y(x, z), [x2, z2] = Wf(s, o + Math.sign(toO) * 1.6);
    cyl(gl('lampPole'), x, y - 0.2, z, 9.2, 0.1, 0.06, 8); tube(gl('lampPole'), [x, y + 8.9, z], [x2, y + 9.15, z2], 0.04, 5);
    boxAt(gl('lampPole'), x2, y + 9.05, z2, 0.62, 0.12, 0.26, -Math.atan2(z2 - z, x2 - x)); box(x, z, 0.1, 0.1, 0, y - 1, y + 9, 'pole'); };
  for (const s of [9, 150, 196, 236, 294, 355.5]) lamp(W, s, ne(s) - KB.w - 0.35, 1);
  pole(W, 358, LANE + 0.5);                                                      // on the walk behind the island (photo 77)
  if (FB) for (const s of [40, 90]) lamp(WB, s, BIS_E + 0.5, -1);
  // signs on galvanised posts, facing the traffic coming up the street (+s towards the junction is -s travel)
  const signAt = (Wf, s, o, key, y0, size, facing, shape = 'round') => {
    const [x, z] = Wf(s, o), y = Y(x, z), [ux, uz] = (Wf === W ? F : FB).dir(s), fx = ux * facing, fz = uz * facing;
    cyl(gl('galv'), x, y - 0.2, z, y0 + size / 2 + 0.2, 0.03, 0.03, 6);
    const c = [x + fx * 0.05, y + y0, z + fz * 0.05], a = [-fz * size / 2, fx * size / 2];
    acc(key).quad([c[0] - a[0], c[1] - size / 2, c[2] - a[1]], [c[0] + a[0], c[1] - size / 2, c[2] + a[1]], [c[0] + a[0], c[1] + size / 2, c[2] + a[1]], [c[0] - a[0], c[1] + size / 2, c[2] - a[1]], [fx, 0, fz], [0, 0, 1, 0, 1, 1, 0, 1]);
    box(x, z, 0.04, 0.04, 0, y - 1, y + y0, 'pole');
  };
  signAt(W, 7.5, ne(7.5) - KB.w - 0.3, 'stop', 2.2, 0.75, 1);                  // the STOP for the street coming up (photo 83)
  signAt(W, 318, ne(318) - KB.w - 0.3, 'lim20', 2.3, 0.6, 1);                  // "20" on the works' side (photo 79)
  signAt(W, 330, sw(330) + 1.0, 'nostop', 2.4, 0.6, 1);                         // no stopping, on the south-west (photo 79)
  // the transformer on its pole at the junction's corner (photo 83)
  { const [x, z] = W(3.5, ne(3.5) - 3.4), y = Y(x, z);
    boxAt(gl('pole'), x, y + 5.5, z, 0.42, 11, 0.3, 0); boxAt(gl('pole'), x + 0.9, y + 5.5, z + 0.3, 0.3, 11, 0.22, 0);
    boxAt(gl('trafo'), x + 0.45, y + 6.3, z + 0.15, 1.1, 1.2, 0.8, 0); boxAt(gl('black'), x + 0.45, y + 5.6, z + 0.15, 1.6, 0.08, 1.2, 0);
    for (const dx of [-0.3, 0.45, 1.2]) cyl(gl('cream'), x + dx, y + 7.0, z + 0.15, 0.35, 0.06, 0.04, 6);
    box(x + 0.45, z + 0.15, 0.7, 0.35, 0, y - 1, y + 11, 'pole');
    wiresBetween([[x, y, z], PN[0]]); }

  // ================================================================ the cars (photos 78-81, 83)
  const car = (Wf, s, o, dir, model, paint) => { const [x, z] = Wf(s, o), [ux, uz] = (Wf === W ? F : FB).dir(s), fx = ux * dir, fz = uz * dir; out.cars.push({ model, paint, x, z, h: Math.atan2(-fx, -fz) }); };
  car(W, 270.5, ne(270.5) + 1.05, -1, 'bmw', 0x0c0d0f);                      // the black saloon (photo 78)
  car(W, 277.5, ne(277.5) + 1.05, -1, 'hatch', 0xb3161b);                    // the red hatchback beside the camera
  car(W, 256, ne(256) + 1.0, -1, 'hatch', 0xb9bcc0);
  car(W, 250.5, ne(250.5) + 1.2, -1, 'hatch', 0xc0141a);
  car(W, 232, ne(232) + 1.4, -1, 'sedan', 0x3a3d42);
  car(W, 300, ne(300) - 3.5, -1, 'hatch', 0xefefec);                          // the parking area (photo 79)
  car(W, 294, ne(294) - 4.0, -1, 'sedan', 0x55585c);
  car(W, 288.5, ne(288.5) - 4.5, -1, 'hatch', 0x2b2e33);
  car(W, 207.5, sw(207.5) - 1.0, -1, 'hatch', 0xb4b7ba);                     // the silver Peugeot on the south-west (photo 81)
  car(W, 70, ne(70) + 1.1, 1, 'van', 0xf2f2f0);                              // the white Transporter (photo 80)
  car(W, 272, sw(272) + 5.5, 1, 'hatch', 0xededeb);                          // in the parking lot behind the fence (photo 78)
  car(W, 277, sw(277) + 6.0, 1, 'sedan', 0xf0f0ee);
  if (FB) car(WB, 9.5, BIS_W + 1.2, -1, 'kangoo', 0xc0141c);                   // the red Kangoo at the junction (photo 83)

  // ---- flush
  const matOf = { shop: Mt.shop, asphalt: Mt.asphalt, marking: Mt.marking, kerbPaint: Mt.kerbPaint, kerb: Mt.kerb, walk: Mt.walk, walkAsph: Mt.walkAsph, concrete: Mt.concrete,
    hall: Mt.hall, office: Mt.office, diag: Mt.diag, tower: Mt.tower, white: Mt.white, roofDark: Mt.roofDark, roofGray: Mt.roofGray, roofRust: Mt.roofRust, roofRed: Mt.roofRed,
    skylight: Mt.skylight, flat: Mt.flat, barsBlack: Mt.barsBlack, barsGalv: Mt.barsGalv, palisade: Mt.palisade, planks: Mt.planks, creeper: Mt.creeper, vines: Mt.vines,
    stop: Mt.stop, lim20: Mt.lim20, nostop: Mt.nostop, stone: Mt.stone };
  const flat = new Set(['asphalt', 'marking', 'walk', 'walkAsph']);
  for (const [k, a] of Object.entries(A)) a.flush(B, matOf[k], null, flat.has(k) ? { noCast: true } : {});
  const gm = { rust: M.rustStrip ?? Mt.black, stone: Mt.stone, cap: Mt.concrete, black: Mt.black, galv: Mt.galv, galvWhite: Mt.white, pole: Mt.pole, lampPole: Mt.lamp, steel: Mt.steel, trafo: Mt.trafo, cream: Mt.white, whiteBox: Mt.white, red: Mt.roofRed };
  for (const [k, list] of Object.entries(G)) if (list.length) B.geo(gm[k], merged(list));

  // ---- the photo views (the car camera 2.5 m over the road; the screenshots' focal length ~870 px)
  const cam = (Wf, s, o, hx, hz, pitch, fov) => { const [x, z] = Wf(s, o); return { from: [x, z], to: [x + hx * 10, z + hz * 10], pitch, fov }; };
  const camUp = (s, o, pitch, fov) => { const [ux, uz] = F.dir(s); return cam(W, s, o, -ux, -uz, pitch, fov); };   // looking up the street
  out.views = [
    { n: 77, label: 'Poza 77 — Str. Uzinei sub Primărie: insula vopsită, magazinul cu etaj vitrat', ...camUp(378, -1.5, 0.05, 73.1) },
    { n: 78, label: 'Poza 78 — Str. Uzinei 217: biroul PetroUtilaj cu coșul, parcarea', ...cam(W, 280, -1.4, 0.966, -0.26, 0.11, 78.8) },
    { n: 79, label: 'Poza 79 — Str. Uzinei 222: hala lungă și parcarea uzinei', ...cam(W, 341.8, -0.6, 0.999, 0.034, 0.03, 78.8) },
    { n: 80, label: 'Poza 80 — Str. Uzinei: zidul de sprijin și clădirea cu turn', ...cam(W, 80, -1.2, 0.7872, -0.6157, 0.0, 78.8) },
    { n: 81, label: 'Poza 81 — Str. Uzinei 453: hala albă cu ferestre cu gratii', ...cam(W, 214.8, -0.8, 0.866, -0.501, 0.2, 78.8) },
    { n: 83, label: 'Poza 83 — Str. Uzinei 451: intersecția cu STOP și Strada Bisericii', ...cam(W, 19.5, -0.5, 0.7986, -0.6023, 0.1, 78.8) },
  ];
  if (FB) out.views.splice(4, 0, { n: 82, label: 'Poza 82 — Strada Bisericii 227, spre biserică', ...cam(WB, 17.5, 1.0, 0.72, 0.694, 0.1, 78.8) });
  out.surface = (x, z) => { for (const f of surfaces) { const y = f(x, z); if (y !== null && y !== undefined) return y; } return null; };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const grow = (Wf, s0, s1, o0, o1) => { for (let s = s0; s <= s1; s += 4) for (const o of [o0, o1]) { const [x, z] = Wf(s, o); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } };
  grow(W, 0, S_END, -12, 8); if (FB) grow(WB, 0, BIS_END, -4, 10);
  out.bbox = { x0, x1, z0, z1 };
  return out;
}
