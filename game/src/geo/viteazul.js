import * as THREE from 'three';
import { GEO, heightAt, gridHeight, addHole, addHolePoly, addFineZone, inPoly } from './data.js';
import { M } from '../materials.js';
import { Acc } from './bridge.js';
import { rng } from '../util.js';
import { canvas, tex, grain, blobs, boxAt, cyl, tube, catenary, tuft, merged, frame, pairs, road, clamp01 } from './pitigaia.js';

// Photos 68-72 (the user's Street View screenshots, June and September 2022, "45.1726527 N 25.6893172 E"): Strada Mihai
// Viteazul (DC1), the street from the Breaza exit by the red footbridge (photo 67) up the hill into the town.
//  * photo 72 (June 2022): on the exit just before the junction, the footbridge's east tower on the left (pasarela.js)
//  * photos 69-71 (September 2022, the car coming down, the view turned back up the street): a continuous centre line
//    (double on the bends near the junction), edge lines 4.1 m apart below the houses (from the lines' vanishing point
//    and the 2.5 m camera); a concrete channel along the north edge with slab crossings at the drives; the south side a
//    kerb and lawns by the houses, then a steep bank with ivy and trees down to the junction
//  * photo 68: the gated house on the south side: stone-clad pillars 3.6 m apart, a golden double gate and a wicket,
//    the drive falling between white walls with rusty frames on the east one, the lawn with a manhole and the dark
//    picket fence by the old house with the rusty roof, a rose bush, pumpkins in the field, a dead tree, the wires
//  * the aerial imagery (measurements only): along the houses the edge lines 6.2 m apart, the centre line 0.95 m south
//    of the mapped line, the channel north of the north line, the drive to the gate 3.6 m wide with its white wall. The
//    screenshots' coordinate is photo 69's pano, ~4 m north of the carriageway (the GPS under the trees)
const STREET = '553461712';
const SA = 760;                                                      // mapped-way metres: the street is rebuilt from here down
// the asphalt's edges and the centre line, metres right (north) of the mapped line (it stays the axis)
const N_EDGE = [[SA, 3.75], [785, 2.55], [842, 2.55], [852, 2.35]];
const S_EDGE = [[SA, -3.75], [785, -4.2], [831, -4.2], [843, -2.6], [870, -2.45], [900, -2.4]];
const C_LINE = [[785, -0.95], [831, -0.95], [846, -0.1], [880, 0]];
const LW = 0.12, DOUBLE_FROM = 858;
const CH = { wall: 0.1, w: 0.7, d: 0.45, top: 0.3, s0: 786, s1: 888, slabs: [[800.5, 811.5], [826.5, 831]] };
const KERB = { h: 0.12, w: 0.15, s0: 786 };                              // along the south edge from here to the bank's foot
const GATE = { o: -5.1, pl: 812.0, dg: [812.23, 814.64], post: 814.68, wk: [814.72, 815.37], pr: 815.6, pw: 0.45, ph: 1.9 };
const DRIVE = { s0: 812.23, s1: 815.37, o1: -21, fall: 0.12 };
const WALLE = { s: 815.83, o0: -5.4, o1: -19.5, t: 0.25 };           // the white wall along the drive's east side
const LAWN = { s0: 796, s1: 811.8, o1: -21 };                     // the lawn by the old house, its picket fence along o1
const BANK = { s0: 846, s1: 900, h: 2.8, low: 886 };             // full height up the street, a 0.6 m stone wall by the junction
const ZONE = { s0: 772, s1: 900, o0: -30, o1: 16 };                  // 10 m cells whose centres fall here are rebuilt at 1 m
const STYLE = {
  '263337698': { wall: 'stuccoCream', roofMat: 'tiles', roof: 'tileRed', levels: 2, roofType: 'hip' },   // behind the gate (photo 68)
  '263337667': { wall: 'woodDark', roof: 'roofMetalRust', roofType: 'gable', chimney: true, eave: 2.5 }, // the old house, rusty roof
  '263337666': { roofMat: 'tiles', roof: 'tileRed' },                                                     // by the street (aerial)
  '263337712': { wall: 'stuccoWhite', roofMat: 'metalTile', roof: 'roofMetalRed' },                       // north, bright red (aerial)
  '1368046302': { roof: 'roofMetalBrown' }, '1368046303': { roof: 'roofMetalBrown' },                   // (aerial)
};
const UP = [0, 1, 0];

const smooth = (a, b, t) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u); };
const lin = (A, x) => { if (x <= A[0][0]) return A[0][1]; for (let i = 0; i < A.length - 1; i++) if (x <= A[i + 1][0]) return A[i][1] + (A[i + 1][1] - A[i][1]) * (x - A[i][0]) / (A[i + 1][0] - A[i][0]); return A[A.length - 1][1]; };
const nE = (s) => lin(N_EDGE, s), sE = (s) => lin(S_EDGE, s), cL = (s) => lin(C_LINE, s);

// ------------------------------------------------------------------ before the terrain, roads and trees
let ST = null;
export function prepareViteazul() {
  ST = null;
  const r = road(STREET);
  if (!r || !GEO.W) return false;
  const P0 = pairs(r.p), F0 = frame(P0);
  if (F0.L < 900) return false;
  // the lower street is a way of its own, drawn here (its asphalt widens along the houses, its lines are off-centre)
  const i0 = F0.S.findIndex(s => s > SA), q0 = F0.at(SA);
  const { p: _p, id: _id, ...rest } = r;
  const low = [[q0.x, q0.z], ...P0.slice(i0)];
  r.p = [...P0.slice(0, i0), [q0.x, q0.z]].flat();
  GEO.roads.splice(GEO.roads.indexOf(r) + 1, 0, { ...rest, id: STREET + ':jos', p: low.flat(), w: 4.8, noShoulder: true, own: 'viteazul' });
  const FM = frame(low);
  const W = (s, o) => { const q = FM.at(s - SA), [ux, uz] = FM.dir(s - SA); return [q.x - uz * o, q.z + ux * o]; };
  const loc = (x, z) => { const l = FM.local(x, z); return l ? { s: l.s + SA, o: l.o, d: l.d } : null; };
  // the street's long profile: the terrain along its middle, averaged over +-10 m
  const Wg = GEO.W, raw = [];
  for (let s = SA; s <= SA + FM.L + 1e-6; s += 2) raw.push([s, gridHeight(Wg, ...W(s, (nE(s) + sE(s)) / 2))]);
  const prof = raw.map(([s]) => { let a = 0, n = 0; for (const [t, y] of raw) if (Math.abs(t - s) <= 10) { a += y; n++; } return [s, a / n]; });
  const Yat = (s) => lin(prof, s);
  ST = { FM, W, loc, Yat, L: SA + FM.L };
  // the 1 m terrain: the carriageway level across, the channel's trench, the lawns, the falling drive, the bank
  {
    const { ext, step } = Wg;
    const cell = (v) => -ext + (Math.floor((v + ext) / step) + 0.5) * step;
    const inZone = (x, z) => { const l = loc(cell(x), cell(z)); return !!l && l.s > ZONE.s0 && l.s < ZONE.s1 && l.o > ZONE.o0 && l.o < ZONE.o1; };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let s = ZONE.s0 - 10; s <= ZONE.s1 + 10; s += 4) for (const o of [ZONE.o0 - 12, ZONE.o1 + 12]) { const [x, z] = W(s, o); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    addFineZone({ x0, x1, z0, z1, test: inZone, h: (x, z) => {
      const g = gridHeight(Wg, x, z), l = loc(x, z);
      if (!l) return g;
      const w = smooth(ZONE.s0, ZONE.s0 + 12, l.s) * (1 - smooth(ZONE.s1 - 10, ZONE.s1, l.s)) * smooth(ZONE.o0, ZONE.o0 + 8, l.o) * (1 - smooth(ZONE.o1 - 6, ZONE.o1, l.o));
      return w > 0 ? g + (ground(l.s, l.o, Yat(l.s), g) - g) * w : g;
    } });
  }
  // no forest on the lots along the street (houses, lawns, the field); grass under the verges
  for (let s = SA; s < ST.L - 4; s += 8) { const [ux, uz] = FM.dir(s + 4 - SA); addHole(W(s + 4, (nE(s) + sE(s)) / 2), 4.4, (nE(s) - sE(s)) / 2 + 1.8, ux, uz, { lawn: true, scatter: false }); }
  const LOTS = [[772, 26], [838, 26], [838, 3], [836, -3], [836, -34], [772, -44]].map(([s, o]) => W(s, o));
  const NLAWN = [[838, 12], [848, 9], [896, 6.5], [896, 3.2], [838, 3.2]].map(([s, o]) => W(s, o));
  addHolePoly(LOTS, { lawn: true, noFences: true, scatter: false });
  addHolePoly(NLAWN, { lawn: true, noFences: true, scatter: false });
  // the lots' trees (photos 68-71): the walnut by the channel, young trees along it, acacias on the field's edge and
  // on the bank, big trees by the junction; the mapped ones on the lots are dropped
  if (GEO.trees) {
    const T = GEO.trees, keep = [];
    const onRoad = (x, z) => { const l = loc(x, z); return !!l && l.s > SA && l.s < ST.L && l.o > sE(l.s) - 1.2 && l.o < nE(l.s) + 1.3; };
    for (let k = 0; k < T.n; k++) if (!inPoly(LOTS, T.x[k], T.z[k]) && !inPoly(NLAWN, T.x[k], T.z[k]) && !onRoad(T.x[k], T.z[k])) keep.push(k);
    let seed = 6869; const Rn = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const add = [[841.5, 5.6, 4, 1.05], [836.5, 6.2, 4, 0.8], [789, 6.5, 3, 0.7], [822, -23, 3, 0.75], [804, -24, 4, 0.9]];
    for (let s = 846; s < 890; s += 6 + Rn() * 2) add.push([s, nE(s) + 1.5 + Rn() * 0.8, Rn() < 0.5 ? 1 : 3, 0.55 + Rn() * 0.25]);
    for (let s = 844; s < 900; s += 3.5 + Rn() * 2) add.push([s, nE(s) + 6.5 + Rn() * 5, Rn() < 0.4 ? 0 : 12, 0.8 + Rn() * 0.4]);
    for (let s = 834.5; s < 848; s += 1.4 + Rn() * 0.7) add.push([s, sE(s) - 1.2 - Rn() * 3, Rn() < 0.6 ? 12 : 11, Rn() < 0.6 ? 0.95 + Rn() * 0.35 : 0.9 + Rn() * 0.4]);
    for (let s = 850; s < 890; s += 1.8 + Rn() * 1.2) add.push([s, nE(s) + 4.4 + Rn() * 1.2, 11, 0.8 + Rn() * 0.4]);   // hedges behind the lawns
    for (let s = 832; s < 850; s += 1.1 + Rn() * 0.5) add.push([s, nE(s) + 1.5 + Rn() * 1.0, 11, 1.0 + Rn() * 0.35]);   // the hedge by the channel (photo 69)
    for (let s = 826; s < 848; s += 0.9 + Rn() * 0.5) add.push([s, sE(s) - 0.9 - Rn() * 2.2, 11, 1.05 + Rn() * 0.35]);   // bushes on the south edge
    for (let s = 827; s < 848; s += 2.5 + Rn() * 1.5) add.push([s, sE(s) - 2.6 - Rn() * 2.5, 12, 1.05 + Rn() * 0.35]);
    for (let s = 846; s < 902; s += 2.8 + Rn() * 2) add.push([s, sE(s) - 4.2 - Rn() * 5, 12, 0.85 + Rn() * 0.45]);
    for (let s = 847; s < 902; s += 2 + Rn() * 1.5) add.push([s, sE(s) - 2.4 - Rn() * 1.5, 11, 0.5 + Rn() * 0.35]);
    for (const [s, o] of [[896, 6.8], [901, 8.8], [890, 12], [884, 10]]) add.push([s, o, 0, 1.05 + Rn() * 0.2]);
    const m = keep.length + add.length, x = new Float32Array(m), z = new Float32Array(m), t = new Uint8Array(m), sc = new Float32Array(m);
    keep.forEach((k, i) => { x[i] = T.x[k]; z[i] = T.z[k]; t[i] = T.t[k]; sc[i] = T.s[k]; });
    add.forEach(([as, ao, at, asc], i) => { const [ax, az] = W(as, ao); x[keep.length + i] = ax; z[keep.length + i] = az; t[keep.length + i] = at; sc[keep.length + i] = asc; });
    GEO.trees = { n: m, x, z, t, s: sc };
  }
  // the houses stand on the rebuilt ground; their colours from photo 68 and the aerial
  { const bd = GEO.buildings.find(b => String(b.id) === '263337667');
    if (bd) { const [cx, cz] = W(795.5, -28.5), [ux, uz] = FM.dir(795.5 - SA), hw = 5.0, hd = 3.6, P = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [cx + ux * a - uz * b, cz + uz * a + ux * b]);
      bd.p = P.flat(); bd.r = [[cx, cz, hw, hd, Math.atan2(uz, ux)]]; } }
  for (const bd of GEO.buildings) {
    const st = STYLE[String(bd.id)];
    if (st) bd.o = { ...(bd.o || {}), ...st };
    const l = loc(bd.p[0], bd.p[1]);
    if (!l || l.s < ZONE.s0 - 5 || l.s > ZONE.s1 + 5 || l.o < ZONE.o0 - 15 || l.o > ZONE.o1 + 15) continue;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < bd.p.length; i += 2) { const y = heightAt(bd.p[i], bd.p[i + 1]); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    bd.y0 = lo; bd.y1 = hi;
  }
  return true;
}

// the ground across the street at (s, o) (o > 0 north), y: the carriageway there, g: the terrain grid
function ground(s, o, y, g) {
  const n = nE(s), sb = sE(s);
  if (o >= sb - 0.3 && o <= n) return y;                                               // carriageway, kerb, channel foot
  if (o > 0) {
    const oE = n + 2 * CH.wall + CH.w, inCh = s > CH.s0 - 0.3 && s < CH.s1 + 0.3 && !CH.slabs.some(([a, b]) => s > a && s < b);
    if (o < oE + 0.25) return inCh ? y - CH.d - 0.12 : y + 0.02;                        // trench under the channel / slabs
    const lawn = y + (s > CH.s0 && s < CH.s1 ? CH.top : 0.1) + 0.04 * (o - oE);
    return Math.max(g, lawn - Math.max(0, o - 9) * 0.3);                              // a little over the channel wall
  }
  // south: the lawn, the gate's apron and the falling drive, the field; the bank down to the junction
  const oK = sb - 0.3;
  if (s < 846) {
    if (s > DRIVE.s0 - 0.1 && s < DRIVE.s1 + 0.1 && o < GATE.o + 0.25) return y + 0.02 - DRIVE.fall * Math.min(GATE.o - DRIVE.o1, Math.max(0, GATE.o - o));
    if (s > GATE.pl - 0.5 && s < GATE.pr + 0.5 && o >= GATE.o) return y + 0.02;       // the apron in front of the gate
    const lawn = y + KERB.h;
    if (s < GATE.pl) return o > LAWN.o1 - 1 ? lawn : g + (lawn - g) * clamp01((o - LAWN.o1 + 6) / 5);
    return Math.max(g, lawn - 0.08 * Math.max(0, oK - o));                              // the field east of the drive
  }
  const hB = BANK.h * smooth(BANK.s0 - 6, BANK.s0 + 6, s) * (1 - smooth(BANK.low - 12, BANK.low, s)) + 0.6 * smooth(BANK.low - 12, BANK.low, s) * (1 - smooth(BANK.s1 - 4, BANK.s1, s));
  const wallAt = s > BANK.low - 6, rise = smooth(oK - 0.2, oK - (wallAt ? 0.5 : 2.6), o), crest = Math.max(0, (oK - 5) - o) * 0.25;
  return Math.max(g, y + KERB.h + (hB - crest) * rise);
}

// ------------------------------------------------------------------ textures and materials
let MT = null;
function mats() {
  if (MT) return MT;
  const R = rng(6872);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const off = (m, u = -4) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: u });
  // ivy and bramble over the bank (photos 70, 71): dark glossy leaves, gaps of dark soil
  const ivy = canvas(512, 512), ig = ivy.getContext('2d');
  ig.fillStyle = '#1d2618'; ig.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const x = R() * 512, y = R() * 512, r = 5 + R() * 9, a = R() * 6.3, g = 38 + R() * 62;
    ig.fillStyle = `rgb(${Math.round(g * 0.45)},${Math.round(g * 0.95)},${Math.round(g * 0.34)})`;
    ig.beginPath(); ig.ellipse(x, y, r, r * 0.72, a, 0, Math.PI * 2); ig.fill();
    if (R() < 0.25) { ig.fillStyle = 'rgba(210,230,170,0.25)'; ig.beginPath(); ig.ellipse(x - r * 0.3, y - r * 0.3, r * 0.35, r * 0.2, a, 0, Math.PI * 2); ig.fill(); }
  }
  // the channel's floor: silt, dry leaves, concrete showing through
  const silt = canvas(256, 256), sg = silt.getContext('2d');
  sg.fillStyle = '#6f6555'; sg.fillRect(0, 0, 256, 256);
  blobs(sg, 0, 0, 256, 256, 90, 4, 18, ['rgba(120,112,98,0.6)', 'rgba(80,62,40,0.55)', 'rgba(140,110,70,0.5)', 'rgba(60,70,40,0.4)'], R); grain(sg, 256, 256, 22, R);
  // white plaster (the drive's walls), weathered at the foot
  const pl = canvas(256, 256), pg = pl.getContext('2d');
  pg.fillStyle = '#e9e7e1'; pg.fillRect(0, 0, 256, 256);
  blobs(pg, 0, 150, 256, 106, 40, 4, 16, ['rgba(120,118,105,0.22)', 'rgba(150,140,120,0.2)'], R); grain(pg, 256, 256, 10, R);
  // the dark weathered pickets (photo 68)
  const pk = canvas(256, 256), kg = pk.getContext('2d');
  for (let x = 0; x < 256; x += 32) {
    const v = 58 + R() * 18; kg.fillStyle = `rgb(${v + 10},${v},${v - 8})`; kg.fillRect(x, 0, 26, 256);
    kg.fillStyle = 'rgba(0,0,0,0)'; kg.clearRect(x + 26, 0, 6, 256);
    for (let k = 0; k < 14; k++) { kg.fillStyle = `rgba(${30 + R() * 30},${25 + R() * 20},${20 + R() * 15},0.35)`; kg.fillRect(x + R() * 22, R() * 256, 2 + R() * 3, 20 + R() * 70); }
    kg.beginPath(); kg.moveTo(x, 18); kg.lineTo(x + 13, 0); kg.lineTo(x + 26, 18); kg.lineTo(x + 26, 0); kg.lineTo(x, 0); kg.closePath(); kg.save(); kg.globalCompositeOperation = 'destination-out'; kg.fill(); kg.restore();
  }
  MT = {
    ivy: std({ map: tex(ivy, { repeat: true }), roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 }),
    silt: off(std({ map: tex(silt, { repeat: true }), roughness: 1 }), -2),
    concrete: std({ map: M.concrete.map, normalMap: M.concrete.normalMap, roughness: 0.9, color: 0xc9c6bd }),
    kerb: std({ map: M.concrete.map, roughness: 0.85, color: 0xd6d3ca }),
    apron: off(std({ map: M.concrete.map, roughness: 0.92, color: 0xb9b6ad }), -3),
    drive: off(std({ map: M.concrete.map, roughness: 0.95, color: 0x9d9a93 }), -2),
    plaster: std({ map: tex(pl, { repeat: true }), roughness: 0.9 }),
    picket: std({ map: tex(pk, { repeat: true }), alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide }),
    gold: std({ color: 0xa3813f, roughness: 0.42, metalness: 0.65 }),
    rust: std({ color: 0x7a4428, roughness: 0.85, metalness: 0.4 }),
    black: M.blackMetal,
    stone: M.stoneCladding,
    cap: std({ map: M.concrete.map, roughness: 0.8, color: 0xd9d6cf }),
    pumpkin: std({ color: 0xd98a3a, roughness: 0.6 }),
    stalk: std({ color: 0x5b6a3a, roughness: 0.9 }),
    rose: std({ color: 0x3f5a2c, roughness: 0.8 }), bloom: std({ color: 0xe7a1b8, roughness: 0.7 }),
    bark: std({ color: 0x8f8a82, roughness: 0.95 }),
    pole: M.concretePole,
    marking: Object.assign(M.marking.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -10 }),
    asphalt: Object.assign(M.asphalt.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -8 }),
    wood: std({ color: 0x4a3a2e, roughness: 0.9 }),
    manholeRing: std({ color: 0x7b7870, roughness: 0.9 }), lid: std({ color: 0x2a2a28, roughness: 0.6, metalness: 0.4 }),
    grass: off(std({ map: M.grassGround.map, normalMap: M.grassGround.normalMap, roughness: 0.98 }), -2),
  };
  return MT;
}

// ------------------------------------------------------------------ build
export function buildViteazul(B, world) {
  if (!ST) return null;
  const { W, loc, Yat, FM } = ST;
  const Mt = mats();
  const A = { stones: new Acc(), asphalt: new Acc(), ivy: new Acc(), silt: new Acc(), concrete: new Acc(), kerb: new Acc(), apron: new Acc(), drive: new Acc(), plaster: new Acc(), picket: new Acc(), marking: new Acc(), grass: new Acc() };
  const G = { gold: [], rust: [], black: [], stone: [], cap: [], pumpkin: [], stalk: [], rose: [], bloom: [], bark: [], pole: [], ring: [], lid: [], wood: [] };
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const R = rng(6873);
  const Y = (x, z) => heightAt(x, z);
  const dirAt = (s) => FM.dir(s - SA);
  const rotAt = (s) => { const [ux, uz] = dirAt(s); return -Math.atan2(uz, ux); };
  const surfaces = [];
  const out = { type: 'viteazul', name: 'Strada Mihai Viteazul', wires: [] };
  const L = ST.L;
  // a band between two offsets (numbers or functions of s), draped on y(s, o)
  const band = (acc, s0, s1, oa, ob, y, uv, step = 1) => {
    const fa = typeof oa === 'function' ? oa : () => oa, fb = typeof ob === 'function' ? ob : () => ob;
    for (let s = s0; s < s1 - 1e-6; s += step) {
      const t = Math.min(s1, s + step), a0 = W(s, fa(s)), b0 = W(t, fa(t)), a1 = W(s, fb(s)), b1 = W(t, fb(t));
      acc.quad([a0[0], y(s, fa(s)), a0[1]], [b0[0], y(t, fa(t)), b0[1]], [b1[0], y(t, fb(t)), b1[1]], [a1[0], y(s, fb(s)), a1[1]], UP, uv(s, t, fa, fb));
    }
  };
  // a vertical face along an offset (number or function), facing +o (sgn 1) or -o
  const face = (acc, s0, s1, oo, yb, yt, sgn, uv, step = 1) => {
    const f = typeof oo === 'function' ? oo : () => oo;
    for (let s = s0; s < s1 - 1e-6; s += step) {
      const t = Math.min(s1, s + step), a = W(s, f(s)), b = W(t, f(t)), [ux, uz] = dirAt((s + t) / 2);
      acc.quad([a[0], yb(s), a[1]], [b[0], yb(t), b[1]], [b[0], yt(t), b[1]], [a[0], yt(s), a[1]], [-uz * sgn, 0, ux * sgn], uv(s, t));
    }
  };
  const wuv = (tile) => (s, t, fa, fb) => { const p = [W(s, fa(s)), W(t, fa(t)), W(t, fb(t)), W(s, fb(s))]; return p.flatMap(([x, z]) => [x / tile, z / tile]); };

  // ---- the carriageway (its edges from the aerial and the screenshots) and its lines
  const yR = (s) => Yat(s) + 0.035;
  band(A.asphalt, SA, L, sE, nE, (s) => yR(s), wuv(1.3), 1);
  {
    const line = (s0, s1, of, w) => band(A.marking, s0, s1, (s) => of(s) - w / 2, (s) => of(s) + w / 2, (s) => yR(s) + 0.004, (s, t) => [0, s / 4, 1, t / 4, 1, t / 4, 0, s / 4], 1);
    line(SA + 6, L - 12, (s) => nE(s) - 0.27, LW);
    line(SA + 6, L - 12, (s) => sE(s) + 0.3, LW);
    line(SA + 6, DOUBLE_FROM, cL, LW);
    for (const d of [-0.1, 0.1]) line(DOUBLE_FROM, L - 12, (s) => cL(s) + d, 0.1);
  }

  // ---- north: the concrete channel along the edge, slab crossings at the drives, the lawns a little above it
  {
    const o0 = nE, o1 = (s) => nE(s) + CH.wall, o2 = (s) => nE(s) + CH.wall + CH.w, o3 = (s) => nE(s) + 2 * CH.wall + CH.w;
    const yT0 = (s) => Yat(s) + 0.05, yB = (s) => Yat(s) - CH.d, yT = (s) => Yat(s) + CH.top;
    const runs = []; let a = CH.s0;
    for (const [p, q] of CH.slabs) { runs.push([a, p]); a = q; }
    runs.push([a, CH.s1]);
    const cu = (s, t) => [s / 2, 0, t / 2, 0, t / 2, 0.25, s / 2, 0.25], su = (s, t) => [0, s / 2, 0.1, t / 2, 0.1, t / 2, 0, s / 2];
    for (const [s0, s1] of runs) {
      band(A.concrete, s0, s1, o0, o1, (s) => yT0(s), su);
      face(A.concrete, s0, s1, o1, yB, yT0, 1, cu);
      band(A.silt, s0, s1, o1, o2, (s) => yB(s) + 0.02, (s, t) => [0, s / 2, 0.35, t / 2, 0.35, t / 2, 0, s / 2]);
      face(A.concrete, s0, s1, o2, yB, yT, -1, cu);
      band(A.concrete, s0, s1, o2, o3, (s) => yT(s), su);
      for (const [ss, sg] of [[s0, 1], [s1, -1]]) {
        const p = W(ss, o1(ss)), q = W(ss, o2(ss)), [ux, uz] = dirAt(ss);
        A.concrete.quad([p[0], yB(ss), p[1]], [q[0], yB(ss), q[1]], [q[0], yT(ss), q[1]], [p[0], yT0(ss), p[1]], [ux * sg, 0, uz * sg]);
      }
      surfaces.push((x, z) => { const l = loc(x, z); if (!l || l.s < s0 || l.s > s1) return null; return l.o > o0(l.s) && l.o < o1(l.s) ? yT0(l.s) : l.o > o2(l.s) && l.o < o3(l.s) ? yT(l.s) : null; });
    }
    for (const [s0, s1] of CH.slabs) {
      const ys = (s, o) => Yat(s) + 0.04 + (CH.top + 0.01) * clamp01((o - nE(s)) / (o3(s) + 0.5 - nE(s)));
      band(A.apron, s0, s1, o0, (s) => o3(s) + 0.5, ys, (s, t) => [0, s / 2, 0.6, t / 2, 0.6, t / 2, 0, s / 2]);
      for (const [ss, sg] of [[s0, -1], [s1, 1]]) { const p = W(ss, o1(ss)), q = W(ss, o2(ss)), [ux, uz] = dirAt(ss); A.concrete.quad([p[0], yB(ss), p[1]], [q[0], yB(ss), q[1]], [q[0], ys(ss, o2(ss)), q[1]], [p[0], ys(ss, o1(ss)), p[1]], [ux * sg, 0, uz * sg]); }
      surfaces.push((x, z) => { const l = loc(x, z); return l && l.s > s0 && l.s < s1 && l.o > nE(l.s) && l.o < o3(l.s) + 0.5 ? ys(l.s, l.o) : null; });
    }
    // the black pipe railing on the channel's wall below the lower crossing (photo 69)
    { const sR = 836, s2 = sR + 4.5, p = W(sR + 0.2, o3(sR) - 0.05), q = W(s2, o3(s2) - 0.05), yp = yT(sR), yq = yT(s2);
      for (const [x, z, y] of [[p[0], p[1], yp], [q[0], q[1], yq]]) cyl(G.black, x, y, z, 0.85, 0.03);
      tube(G.black, [p[0], yp + 0.85, p[1]], [q[0], yq + 0.85, q[1]], 0.028); }
  }

  // ---- south: the kerb (none in front of the gate), the gate's apron and the drive falling between its walls
  {
    const oK = (s) => sE(s) - 0.02, oT = (s) => sE(s) - 0.02 - KERB.w, yK = (s) => Yat(s) + 0.035 + KERB.h;
    const gap = [GATE.pl - 0.5, GATE.pr + 0.5];
    for (const [s0, s1] of [[KERB.s0, gap[0]], [gap[1], BANK.s1 - 4]]) {
      face(A.kerb, s0, s1, oK, (s) => Yat(s) - 0.05, yK, 1, (s, t) => [s, 0, t, 0, t, 0.15, s, 0.15], 1);
      band(A.kerb, s0, s1, oT, oK, (s) => yK(s), (s, t) => [s, 0.2, t, 0.2, t, 0.35, s, 0.35], 1);
      surfaces.push((x, z) => { const l = loc(x, z); return l && l.s > s0 && l.s < s1 && l.o < oK(l.s) && l.o > oT(l.s) ? yK(l.s) : null; });
    }
    band(A.apron, gap[0], gap[1], GATE.o, (s) => sE(s) + 0.02, (s, o) => Y(...W(s, o)) + 0.025, (s, t) => [0, s / 2, 0.9, t / 2, 0.9, t / 2, 0, s / 2], 0.5);
    band(A.drive, DRIVE.s0, DRIVE.s1, DRIVE.o1, GATE.o, (s, o) => Y(...W(s, o)) + 0.02, (s, t) => [0, s / 2, 2.5, t / 2, 2.5, t / 2, 0, s / 2], 0.5);
    // the white wall along the drive's east side: its top at the field's level, the drive falling below it
    const sW = WALLE.s, yTop = (o) => Math.max(Y(...W(sW + WALLE.t + 0.3, o)), Y(...W(sW - 0.3, o))) + 0.25;
    for (let o = WALLE.o0; o > WALLE.o1 + 1e-6; o -= 1) {
      const t = Math.max(WALLE.o1, o - 1), yb0 = Y(...W(sW - 0.2, o)) - 0.1, yb1 = Y(...W(sW - 0.2, t)) - 0.1, [ux, uz] = dirAt(sW);
      for (const [sf, sg] of [[sW, -1], [sW + WALLE.t, 1]]) { const a = W(sf, o), b = W(sf, t); A.plaster.quad([a[0], yb0, a[1]], [b[0], yb1, b[1]], [b[0], yTop(t), b[1]], [a[0], yTop(o), a[1]], [ux * sg, 0, uz * sg], [o / 2, 0, t / 2, 0, t / 2, (yTop(t) - yb1) / 2, o / 2, (yTop(o) - yb0) / 2]); }
      { const a = W(sW, o), b = W(sW, t), c = W(sW + WALLE.t, t), d = W(sW + WALLE.t, o); A.plaster.quad([a[0], yTop(o), a[1]], [b[0], yTop(t), b[1]], [c[0], yTop(t), c[1]], [d[0], yTop(o), d[1]], UP, [0, 0, 0.1, 0, 0.1, 0.1, 0, 0.1]); }
      const m = W(sW + WALLE.t / 2, (o + t) / 2); box(m[0], m[1], WALLE.t / 2, 0.5, rotAt(sW) + Math.PI / 2, yb0 - 1, (yTop(o) + yTop(t)) / 2, 'wall');
    }
    // rusty frames on it (a fence whose mesh is gone): 2 m panels of angle iron, a diagonal in every other one
    for (let k = 0; k < 5; k++) {
      const oa = -9.0 - k * 2.05, ob = oa - 2.0, pa = W(sW + WALLE.t / 2, oa), pb = W(sW + WALLE.t / 2, ob), ya = yTop(oa), yb = yTop(ob), H = 1.85 + (R() - 0.5) * 0.1;
      tube(G.rust, [pa[0], ya, pa[1]], [pa[0], ya + H, pa[1]], 0.03, 4); tube(G.rust, [pb[0], yb, pb[1]], [pb[0], yb + H, pb[1]], 0.03, 4);
      tube(G.rust, [pa[0], ya + H, pa[1]], [pb[0], yb + H, pb[1]], 0.025, 4); tube(G.rust, [pa[0], ya + 0.08, pa[1]], [pb[0], yb + 0.08, pb[1]], 0.025, 4);
      if (k % 2 === 0) tube(G.rust, [pa[0], ya + 0.1, pa[1]], [pb[0], yb + H - 0.05, pb[1]], 0.018, 4);
    }
  }

  // ---- the gate (photo 68): stone-clad pillars with concrete caps, the golden double gate, a post and the wicket
  {
    const oG = GATE.o, yG = (s) => Y(...W(s, oG)) + 0.02, rot = rotAt((GATE.pl + GATE.pr) / 2);
    const pillar = (s) => {
      const [x, z] = W(s, oG), y = yG(s);
      boxAt(G.stone, x, y + GATE.ph / 2, z, GATE.pw, GATE.ph, GATE.pw, rot);
      boxAt(G.cap, x, y + GATE.ph + 0.05, z, GATE.pw + 0.1, 0.1, GATE.pw + 0.1, rot);
      boxAt(G.cap, x, y + GATE.ph + 0.13, z, GATE.pw - 0.06, 0.06, GATE.pw - 0.06, rot);
      box(x, z, GATE.pw / 2, GATE.pw / 2, rot, y - 0.5, y + GATE.ph, 'pillar');
    };
    pillar(GATE.pl); pillar(GATE.pr);
    { const [x, z] = W(GATE.pr, oG + GATE.pw / 2 + 0.07), y = yG(GATE.pr); boxAt(G.black, x, y + 1.32, z, 0.26, 0.34, 0.12, rot); }   // the mailbox
    { const [x, z] = W(GATE.post, oG); cyl(G.gold, x, yG(GATE.post) - 0.1, z, 1.85, 0.04, 0.04, 4); }
    // a leaf: frame, bars every 0.12 m, an arched top rail, a rail of scrolls under it
    const leaf = (s0, s1, hEnd, hMid) => {
      const n = Math.round((s1 - s0) / 0.12), y0 = yG(s0) + 0.06, top = (t) => hEnd + (hMid - hEnd) * Math.sin(Math.PI * t);
      const P = (t, h) => { const [x, z] = W(s0 + (s1 - s0) * t, oG); return [x, y0 + h, z]; };
      for (let i = 0; i <= n; i++) { const t = i / n; tube(G.gold, P(t, 0), P(t, top(t) + 0.06), i === 0 || i === n ? 0.022 : 0.009, 4); }
      for (const h of [0, 0.42]) tube(G.gold, P(0, h), P(1, h), 0.016, 4);
      for (let i = 0; i < 12; i++) { const t0 = i / 12, t1 = (i + 1) / 12; tube(G.gold, P(t0, top(t0)), P(t1, top(t1)), 0.018, 4); tube(G.gold, P(t0, top(t0) - 0.26), P(t1, top(t1) - 0.26), 0.012, 4); }
      for (let i = 0; i < n; i += 3) { const t = (i + 1.5) / n, c = P(t, top(t) - 0.13); const g = new THREE.TorusGeometry(0.075, 0.009, 4, 10); g.rotateY(rot + Math.PI / 2); g.translate(...c); G.gold.push(g); }
      const m = P(0.5, 0); box(m[0], m[2], (s1 - s0) / 2, 0.04, rot, m[1] - 0.2, m[1] + hEnd, 'gate');
    };
    const [d0, d1] = GATE.dg, dm = (d0 + d1) / 2;
    leaf(d0, dm, 1.5, 1.66); leaf(dm, d1, 1.5, 1.66);
    leaf(GATE.wk[0], GATE.wk[1], 1.5, 1.62);
  }

  // ---- the lawn by the old house: its dark picket fence, the manhole, the rose bush behind the pillar
  {
    const oF = LAWN.o1, yF = (s) => Y(...W(s, oF));
    const fence = (s0, s1, h, tag) => {
      for (let s = s0; s < s1 - 1e-6; s += 2.4) {
        const t = Math.min(s1, s + 2.4), a = W(s, oF), b = W(t, oF), ya = yF(s), yb = yF(t), [ux, uz] = dirAt(s);
        A.picket.quad([a[0], ya - 0.05, a[1]], [b[0], yb - 0.05, b[1]], [b[0], yb + h, b[1]], [a[0], ya + h, a[1]], [-uz, 0, ux], [0, 0, (t - s) / 0.25, 0, (t - s) / 0.25, 1, 0, 1]);
        for (const hh of [0.3, h - 0.3]) tube(G.wood, [a[0], ya + hh, a[1]], [b[0], yb + hh, b[1]], 0.035, 4);
        cyl(G.wood, a[0], ya - 0.1, a[1], h + 0.1, 0.06, 0.06, 5);
        const m = W((s + t) / 2, oF); box(m[0], m[1], (t - s) / 2, 0.05, rotAt(s), ya - 1, ya + h, tag);
      }
    };
    fence(LAWN.s0, 806.5, 1.85, 'fence'); fence(806.5, LAWN.s1, 1.35, 'fence');
    { const [x, z] = W(GATE.pl - 0.7, GATE.o - 2.2), y = Y(x, z);
      for (let i = 0; i < 22; i++) { const g = new THREE.IcosahedronGeometry(0.2 + R() * 0.14, 0); g.translate(x + (R() - 0.5) * 1.1, y + 0.3 + R() * 1.25, z + (R() - 0.5) * 1.1); G.rose.push(g); }
      for (let i = 0; i < 40; i++) { const g = new THREE.IcosahedronGeometry(0.05 + R() * 0.03, 0); g.translate(x + (R() - 0.5) * 1.3, y + 0.5 + R() * 1.2, z + (R() - 0.5) * 1.3); G.bloom.push(g); } }
    { const [x, z] = W(806.9, -6.65), y = Y(x, z); cyl(G.ring, x, y - 0.1, z, 0.22, 0.48, 0.48, 16); cyl(G.lid, x, y + 0.1, z, 0.03, 0.4, 0.4, 16); }
  }

  // ---- the field east of the drive: pumpkins in a row; a dead tree; poles and the wires along the street
  {
    for (let k = 0; k < 8; k++) {
      const [x, z] = W(818.4 + k * 0.75 + R() * 0.25, -20.2 + (R() - 0.5) * 0.4), y = Y(x, z), r = 0.2 + R() * 0.07;
      const g = new THREE.SphereGeometry(r, 12, 8); g.scale(1, 0.78, 1); g.translate(x, y + r * 0.7, z); G.pumpkin.push(g);
      cyl(G.stalk, x, y + r * 1.4, z, 0.07, 0.02, 0.015, 4);
    }
    { const [x, z] = W(818.5, -24.5), y = Y(x, z);
      const limb = (p, d, len, r, depth) => {
        const q = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
        tube(G.bark, p, q, r, 5);
        if (depth === 0) return;
        for (let k = 0; k < (depth > 2 ? 2 : 3); k++) {
          const a = R() * Math.PI * 2, t = 0.35 + R() * 0.35, nd = [d[0] + Math.cos(a) * t, d[1] + 0.1, d[2] + Math.sin(a) * t], l = Math.hypot(...nd);
          limb(q, nd.map(v => v / l), len * (0.62 + R() * 0.15), r * 0.62, depth - 1);
        }
      };
      limb([x, y - 0.2, z], [0.02, 1, 0.03], 3.6, 0.22, 4);
      box(x, z, 0.24, 0.24, 0, y - 1, y + 4, 'tree'); }
    // concrete poles on the south verge and by the house behind the gate, seven lines along the street (photo 68)
    const poles = [[778, -5.4], [815.2, -29], [846, -3.6], [878, -3.6]].map(([s, o]) => { const [x, z] = W(s, o), y = Y(x, z); return { x, z, y, s }; });
    for (const p of poles) { cyl(G.pole, p.x, p.y - 0.5, p.z, 9.8, 0.16, 0.1, 8); box(p.x, p.z, 0.16, 0.16, 0, p.y - 1, p.y + 9, 'pole');
      const [ux, uz] = dirAt(p.s); tube(G.black, [p.x + uz * 0.9, p.y + 8.6, p.z - ux * 0.9], [p.x - uz * 0.9, p.y + 8.6, p.z + ux * 0.9], 0.04, 4); }
    const lines = [[8.6, 0.8], [8.6, -0.8], [8.6, 0.3], [8.6, -0.3], [7.4, 0], [6.9, 0.1], [6.4, 0]];
    for (const [i, j] of [[0, 2], [2, 3]]) {
      const p = poles[i], q = poles[j], [ux, uz] = dirAt(p.s), [vx, vz] = dirAt(q.s);
      for (const [dh, lat] of lines) catenary(out.wires, [p.x - uz * lat, p.y + dh, p.z + ux * lat], [q.x - vz * lat, q.y + dh, q.z + vx * lat], 0.35 + Math.abs(lat) * 0.1, 10);
    }
    { const p = poles[0], q = poles[1]; for (const dh of [7.4, 6.9]) catenary(out.wires, [p.x, p.y + dh, p.z], [q.x, q.y + dh - 0.4, q.z], 0.4, 10); }
  }

  // ---- the bank: ivy and bramble over its face (photos 70, 71)
  {
    const oA = (s) => sE(s) - 0.2 - KERB.w, span = 3.6;
    for (let s = BANK.s0 - 2; s < BANK.low - 6; s += 1) for (let k = 0; k < 6; k++) {
      const t = Math.min(BANK.low - 6, s + 1), q = (ss, dd) => { const [x, z] = W(ss, oA(ss) - dd); return [x, Y(x, z) + 0.05, z]; }, d0 = k * span / 6, d1 = (k + 1) * span / 6;
      A.ivy.quad(q(s, d0), q(t, d0), q(t, d1), q(s, d1), UP, [s / 3, d0 / 3, t / 3, d0 / 3, t / 3, d1 / 3, s / 3, d1 / 3]);
    }
    for (let s = BANK.s0; s < BANK.s1 - 6; s += 0.9) { const [x, z] = W(s + R() * 0.5, oA(s) - 0.1 - R() * 0.5); tuft(A.grass, x, Y(x, z) + 0.02, z, 0.6, 0.3 + R() * 0.4, R() * 3); }
    // the low wall of rough stones by the junction (photo 71), its top level with the bank above it
    const oW = (s) => sE(s) - 0.02 - KERB.w - 0.05, s0 = BANK.low - 6, s1 = BANK.s1 - 2;
    face(A.stones, s0, s1, oW, (s) => Yat(s) + 0.1, (s) => Y(...W(s, oW(s) - 0.45)) + 0.05, 1, (s, t) => [s / 1.6, 0, t / 1.6, 0, t / 1.6, 0.45, s / 1.6, 0.45], 1);
  }

  // ---- flush
  const put = (acc, mat, opts) => acc.flush(B, mat, null, opts);
  put(A.asphalt, Mt.asphalt, { noCast: true }); put(A.stones, M.stoneWall); put(A.marking, Mt.marking, { noCast: true });
  put(A.ivy, Mt.ivy, { noCast: true }); put(A.silt, Mt.silt, { noCast: true }); put(A.concrete, Mt.concrete); put(A.kerb, Mt.kerb); put(A.apron, Mt.apron, { noCast: true });
  put(A.drive, Mt.drive, { noCast: true }); put(A.plaster, Mt.plaster); put(A.picket, Mt.picket); put(A.grass, Mt.grass, { noCast: true, noAO: true });
  const geo = (key, mat) => { if (G[key].length) B.geo(mat, merged(G[key])); };
  geo('gold', Mt.gold); geo('rust', Mt.rust); geo('black', Mt.black); geo('stone', Mt.stone); geo('cap', Mt.cap); geo('pumpkin', Mt.pumpkin); geo('stalk', Mt.stalk);
  geo('rose', Mt.rose); geo('bloom', Mt.bloom); geo('bark', Mt.bark); geo('pole', Mt.pole); geo('ring', Mt.manholeRing); geo('lid', Mt.lid); geo('wood', Mt.wood);

  // ---- the photo views (September 2022; the car camera 2.5 m over the road, the screenshots' focal length ~870 px)
  const cam = (s, o, sT, oT, pitch, fov) => { const [x, z] = W(s, o), [tx, tz] = W(sT, oT); return { from: [x, z], to: [tx, tz], pitch, fov }; };
  out.views = [
    { n: 68, label: 'Poza 68 — Strada Mihai Viteazul, poarta cu stâlpi de piatră', ...cam(812.6, 1.1, 811.0, -20, 0, 71.1) },
    { n: 69, label: 'Poza 69 — Strada Mihai Viteazul, spre casele de sus', ...cam(846.8, 0.6, 815, -3.6, -0.153, 69.6) },
    { n: 70, label: 'Poza 70 — Strada Mihai Viteazul, rigola și taluzul cu iederă', ...cam(872, 0.8, 850, 0.9, -0.14, 69.1) },
    { n: 71, label: 'Poza 71 — Strada Mihai Viteazul, curba de lângă intersecție', ...cam(902, 0.9, 880, 1.0, -0.085, 65.2) },
  ];
  out.surface = (x, z) => { for (const f of surfaces) { const y = f(x, z); if (y !== null && y !== undefined) return y; } return null; };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let s = ZONE.s0; s <= L; s += 4) for (const o of [-24, 8]) { const [x, z] = W(s, o); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  out.bbox = { x0, x1, z0, z1 };
  return out;
}
