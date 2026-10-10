import * as THREE from 'three';
import { GEO, heightAt, gridHeight, addHole, addFineZone } from './data.js';
import { Acc } from './bridge.js';
import { M, addWind } from '../materials.js';
import { UNDER_SNOW } from '../rain.js';
import { normalFromCanvas } from '../textures.js';
import { rng } from '../util.js';
import { frame, canvas, tex, grain, blobs, crackSmall, boxAt, cyl, tube, drape, tuft, merged, pairs, road, hash, clamp01 } from './pitigaia.js';

// Strada Măgurii, from the user's Street View screenshots (September 2022 and the one at 45.1270483 N 25.7122588 E):
//  * photo 42: the junction of Strada Ion Mateescu (DJ100E) with Aleea Croitorului: the wayside shrine (troiță) on the
//    corner, the concrete pole with the convex traffic mirror, the street plate and the parking sign, the chevron
//    board, white-painted kerbs, manholes, the white slatted gate, green panels and the yellow gas riser opposite
//  * photos 43-45 (plus code 4PG7+624 = 45.12551 N 25.71258 E): Strada Măgurii at the mouth of Strada Tulburii. The aerial
//    imagery (measurements only) shows the carriageway ~2.3 m east of the OSM line: the stretch is moved there, with
//    the village poles and lot fences along it, and rebuilt: worn asphalt with sealed cracks and patches, kerbs
//    painted white and grey, narrow footways; north of the junction the concrete channel with water, rusty posts with
//    bent tops and chain-link along the meadow (west) and the green fence on a low wall (east); the culvert's railed
//    inlet, the gravel yard with stacked stones; south of it the kerbed footway, grey gate and green sheet fence (west),
//    the stone-kerbed ditch with a slab crossing and the brown trapezoidal sheet fence (east)
const ROAD = '15807638', TUL = '16947892', J = 12;
const S0 = -95, S1 = 90, SHIFT = -2.3, RAMP = 15;
const HW = 2.5;
// north of the junction (s < 0): channel on the west (o > 0), footway on the east; south of it the other way round
const N = { s0: -84, s1: -9 };
const SOUTH = { s0: 11, s1: 80 };
const WALK = { w: 1.3, h: 0.15, kerb: 0.14 };
const CH = { o0: HW + 0.7, w: 0.8, wall: 0.1, d: 0.42, s0: -84, s1: -15 };    // channel (photo 43): inner edge, width, walls, depth
const DITCH = { o0: HW + 0.26, w: 0.9, d: 0.5, s0: 12, s1: 80, slab: [38.5, 41.5] };
const INLET = { s: -15.5 };
const STYLE = {
  '265128515': { wall: 'stuccoWhite', roofMat: 'metalTile', roof: 'roofMetalRed' },   // 704 (photo 45)
  '265128561': { wall: 'stuccoWhite', roof: 'roofMetalGray' },                          // 753
  '265128818': { roofMat: 'tiles', roof: 'tileRed' },                                   // 752 (aerial)
  '264524097': { roof: 'roofMetalLight' },                                              // 754 (aerial)
  '264524071': { roof: 'roofMetalDark' }, '264524039': { roof: 'roofMetalDark' },       // 755, 756 (aerial)
  '304072033': { wall: 'stuccoCream', roof: 'roofMetalBrown', roofType: 'gable' },      // 31, behind the shrine (photo 42)
};
const UP = [0, 1, 0];

// ------------------------------------------------------------------ before the terrain, roads and buildings
const STORE = {};
export function prepareMagurii() {
  const r = road(ROAD), tr = road(TUL);
  if (!r || !tr || r.p.length < 2 * (J + 8)) return false;
  const F0 = frame(pairs(r.p)), sJ = F0.S[J], a = sJ + S0, b = sJ + S1;
  const sh = (s) => SHIFT * clamp01((s - a) / RAMP) * clamp01((b - s) / RAMP);
  const moved = (s, x, z) => { const [ux, uz] = F0.dir(s), k = sh(s); return [x - uz * k, z + ux * k]; };
  let Mp = [];
  for (let s = a; s < b - 1e-6; s += 2) { const q = F0.at(s); Mp.push(moved(s, q.x, q.z)); }
  { const q = F0.at(b); Mp.push([q.x, q.z]); }
  for (let pass = 0; pass < 3; pass++) Mp = Mp.map((p, i) => (i === 0 || i === Mp.length - 1) ? p : [(Mp[i - 1][0] + 2 * p[0] + Mp[i + 1][0]) / 4, (Mp[i - 1][1] + 2 * p[1] + Mp[i + 1][1]) / 4]);
  const P = F0.P, i0 = F0.S.findIndex(s => s > a), i1 = F0.S.length - 1 - [...F0.S].reverse().findIndex(s => s < b);
  const { p: _p, id: _id, ...rest } = r;
  const A = { ...rest, id: ROAD, p: [...P.slice(0, i0), Mp[0]].flat() };
  const Mid = { ...rest, id: ROAD + ':mag', p: Mp.flat(), w: 2 * HW, own: 'magurii' };
  const Bp = { ...rest, id: ROAD + ':b', p: [Mp[Mp.length - 1], ...P.slice(i1 + 1)].flat() };
  GEO.roads.splice(GEO.roads.indexOf(r), 1, A, Mid, Bp);
  // Strada Tulburii: its end follows the junction onto the moved carriageway (over its last 20 m)
  const TP = pairs(tr.p), FT = frame([...TP].reverse()), end = TP[TP.length - 1];
  const FM = frame(Mp), lj = FM.local(end[0], end[1]), jq = FM.at(lj.s), dj = [jq.x - end[0], jq.z - end[1]];
  const Tn = [];
  for (let t = 0; t < 20 - 1e-6; t += 2) { const q = FT.at(t), k = clamp01(1 - t / 20); Tn.push([q.x + dj[0] * k, q.z + dj[1] * k]); }
  const k0 = FT.S.findIndex(s => s > 20);
  tr.p = [...[...TP].reverse().slice(k0).reverse(), ...Tn.reverse()].flat();
  // village poles and lot fences along the stretch move with it; the photographed fronts are rebuilt
  const near = (x, z) => { const l = F0.local(x, z, Math.max(0, i0 - 2), Math.min(P.length - 1, i1 + 2)); return l && l.d < 14 && l.s > a && l.s < b ? l : null; };
  for (const run of GEO.poles || []) for (const p of run.p) {
    const l = near(p[0], p[1]);
    if (!l) continue;
    const [x, z] = moved(l.s, p[0], p[1]); p[0] = x; p[1] = z;
    // (offsets from the moved axis are kept) north of the junction the west poles stand behind the channel (photo 43),
    // the one in the junction goes to the corner by the green fence (photo 44)
    const sr = l.s - sJ, [ux, uz] = F0.dir(l.s);
    const to = sr < -9 && l.o > 0 ? CH.o0 + CH.w + 2 * CH.wall + 1.0 : Math.abs(sr) < 9 && l.o < 1.5 && l.o > -HW - 0.5 ? -HW - 0.9 : null;
    if (to !== null) { p[0] += -uz * (to - l.o); p[1] += ux * (to - l.o); }
  }
  GEO.fences = (GEO.fences || []).filter(f => {
    const l = near(f[1], f[2]);
    if (l && l.s - sJ > N.s0 - 4 && l.s - sJ < SOUTH.s1 + 4) return false;
    for (let i = 1; i < f.length; i += 2) { const m = near(f[i], f[i + 1]); if (m) { const [x, z] = moved(m.s, f[i], f[i + 1]); f[i] = x; f[i + 1] = z; } }
    return true;
  });
  for (const bd of GEO.buildings) { const st = STYLE[String(bd.id)]; if (st) bd.o = { ...(bd.o || {}), ...st }; }
  const FMs = frame(Mp), sJm = FMs.local(...moved(sJ, P[J][0], P[J][1])).s;
  STORE.M = Mp; STORE.sJ = sJm;
  // the channel (north, west side) and the ditch (south, east side): terrain rebuilt at 1 m, a trench under the
  // channel's concrete and the kerb/verge covers, an open earth ditch
  {
    const Wm = (s, o) => { const q = FMs.at(s + sJm), [ux, uz] = FMs.dir(s + sJm); return [q.x - uz * o, q.z + ux * o]; };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let s = CH.s0 - 8; s <= DITCH.s1 + 8; s += 2) for (const o of [-HW - 10, HW + 10]) { const [x, z] = Wm(s, o); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const lz = (x, z) => { const l = FMs.local(x, z); return l ? { s: l.s - sJm, o: l.o } : null; };
    addFineZone({ x0, x1, z0, z1,
      // (every 5 m terrain cell touching a cut must be rebuilt: the zone reaches ~6 m past it on each side)
      test: (x, z) => { const l = lz(x, z); return !!l && ((l.s > CH.s0 - 6 && l.s < CH.s1 + 6 && l.o > HW - 5 && l.o < HW + 9) || (l.s > DITCH.s0 - 6 && l.s < DITCH.s1 + 6 && l.o < -HW + 5 && l.o > -HW - 9)); },
      h: (x, z) => { const l = lz(x, z), g0 = gridHeight(GEO, x, z); return l ? g0 - trench(l.s, l.o) : g0; } });
  }
  return true;
}
// depth of the terrain cut: under the channel (flat, hidden by the kerb-side strip and the verge cover), the ditch
function trench(s, o) {
  if (s > CH.s0 && s < CH.s1 && o > HW + 0.15 && o < CH.o0 + CH.w + 2 * CH.wall + 1.2) {
    const e = clamp01(Math.min(s - CH.s0, CH.s1 - s) / 1.2), f = clamp01((o - HW - 0.15) / 0.4) * clamp01((CH.o0 + CH.w + 2 * CH.wall + 1.2 - o) / 0.5);
    return (CH.d + 0.1) * e * f;
  }
  if (s > DITCH.s0 && s < DITCH.s1 && o < -DITCH.o0 && o > -DITCH.o0 - DITCH.w - 0.9 && !(s > DITCH.slab[0] - 0.2 && s < DITCH.slab[1] + 0.2)) {
    const e = clamp01(Math.min((s - DITCH.s0) / 1.5, (DITCH.s1 - s) / 1.5, Math.abs(s - DITCH.slab[0] + 0.2) / 0.3, Math.abs(s - DITCH.slab[1] - 0.2) / 0.3));
    const c = -DITCH.o0 - DITCH.w * 0.45, t = (o - c) / (DITCH.w * 0.5 + 0.45);
    return Math.abs(t) >= 1 ? 0 : DITCH.d * e * (1 - t * t);
  }
  return 0;
}

// ------------------------------------------------------------------ textures and materials
let MT = null;
function mats() {
  if (MT) return MT;
  const R = rng(1938);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const off = (m, u) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: u });
  // decals on the worn asphalt: sealed cracks, a crack network, a patch, transverse cracks (4 tiles, alpha)
  const dec = canvas(1024, 256), dg = dec.getContext('2d');
  dg.clearRect(0, 0, 1024, 256);
  const wav = (x0, y0, x1, y1, amp, wdt, col) => { dg.strokeStyle = col; dg.lineWidth = wdt; dg.lineJoin = 'round'; dg.beginPath(); const n = 18; for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t + (R() - 0.5) * amp, y = y0 + (y1 - y0) * t + (R() - 0.5) * amp; if (i) dg.lineTo(x, y); else dg.moveTo(x, y); } dg.stroke(); };
  wav(20, 128, 236, 128, 14, 7, 'rgba(22,22,22,0.92)'); wav(40, 110, 200, 140, 10, 2, 'rgba(15,15,15,0.95)');
  for (let i = 0; i < 26; i++) { const x = 270 + R() * 220, y = 20 + R() * 216; wav(x, y, x + (R() - 0.5) * 60, y + (R() - 0.5) * 60, 8, 1.4, 'rgba(25,25,25,0.85)'); }
  dg.beginPath(); dg.moveTo(530, 40);
  for (let t = 0; t <= 1; t += 0.1) dg.lineTo(530 + 215 * t, 36 + (R() - 0.5) * 14);
  for (let t = 0; t <= 1; t += 0.1) dg.lineTo(748 + (R() - 0.5) * 14, 36 + 186 * t);
  for (let t = 1; t >= 0; t -= 0.1) dg.lineTo(530 + 215 * t, 222 + (R() - 0.5) * 14);
  dg.closePath(); dg.fillStyle = 'rgba(120,118,112,0.8)'; dg.fill(); dg.strokeStyle = 'rgba(40,40,40,0.55)'; dg.lineWidth = 2.5; dg.stroke();
  blobs(dg, 530, 30, 220, 200, 50, 4, 14, ['rgba(150,148,142,0.35)', 'rgba(80,80,80,0.25)'], R);
  wav(780, 128, 1010, 120, 12, 2, 'rgba(18,18,18,0.9)'); wav(800, 60, 990, 70, 10, 1.5, 'rgba(18,18,18,0.8)');
  // kerb painted in 0.5 m white and grey blocks (u along, one tile = 1 m), trapezoidal sheet, slat panel, grids
  const kerb = canvas(256, 64), kg = kerb.getContext('2d');
  kg.fillStyle = '#e9e8e2'; kg.fillRect(0, 0, 128, 64); kg.fillStyle = '#6c6c68'; kg.fillRect(128, 0, 128, 64);
  blobs(kg, 0, 0, 256, 64, 40, 4, 16, ['rgba(120,110,95,0.25)', 'rgba(60,60,55,0.2)'], R); kg.fillStyle = 'rgba(30,30,30,0.6)'; kg.fillRect(126, 0, 4, 64); kg.fillRect(0, 0, 3, 64);
  grain(kg, 256, 64, 14, R);
  const trap = canvas(256, 64), tg = trap.getContext('2d');
  for (let x = 0; x < 256; x++) { const ph = (x % 64) / 64, v = ph < 0.2 ? 235 : ph < 0.3 ? 170 : ph < 0.72 ? 205 : ph < 0.82 ? 245 : 215; tg.fillStyle = `rgb(${v},${v},${v})`; tg.fillRect(x, 0, 1, 64); }
  const slat = canvas(256, 256), sg = slat.getContext('2d');
  sg.fillStyle = '#c9ccce'; sg.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 32) { sg.fillStyle = 'rgba(40,44,48,0.55)'; sg.fillRect(x, 0, 3, 256); sg.fillStyle = 'rgba(255,255,255,0.35)'; sg.fillRect(x + 3, 0, 3, 256); }
  const bars = canvas(256, 128), bg = bars.getContext('2d');
  bg.clearRect(0, 0, 256, 128); bg.fillStyle = '#2f5a38'; for (let x = 4; x < 256; x += 25.6) bg.fillRect(x, 0, 5, 128); bg.fillRect(0, 0, 256, 7); bg.fillRect(0, 118, 256, 7);
  const panel = canvas(512, 320), pg = panel.getContext('2d');
  pg.clearRect(0, 0, 512, 320); pg.fillStyle = '#2d6a3e';
  for (let x = 2; x < 512; x += 10.24) pg.fillRect(x, 0, 2.5, 320); for (let y = 4; y < 320; y += 41) pg.fillRect(0, y, 512, 2.5); for (const y of [70, 76, 214, 220]) pg.fillRect(0, y, 512, 3);
  const water = canvas(64, 256), wg = water.getContext('2d');
  const gr = wg.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#28302c'); gr.addColorStop(0.5, '#3d4c48'); gr.addColorStop(1, '#28302c'); wg.fillStyle = gr; wg.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 60; i++) { wg.fillStyle = `rgba(190,200,205,${0.05 + R() * 0.12})`; wg.fillRect(R() * 64, R() * 256, 6 + R() * 20, 1.5); }
  // painted board: chevrons, parking sign, street plate, the icon of the wayside shrine
  const chev = canvas(256, 64), cg = chev.getContext('2d');
  cg.fillStyle = '#f2f2ee'; cg.fillRect(0, 0, 256, 64); cg.fillStyle = '#c8202a';
  for (const x of [30, 120]) { cg.beginPath(); cg.moveTo(x, 6); cg.lineTo(x + 40, 6); cg.lineTo(x + 76, 32); cg.lineTo(x + 40, 58); cg.lineTo(x, 58); cg.lineTo(x + 36, 32); cg.closePath(); cg.fill(); }
  cg.strokeStyle = '#c8202a'; cg.lineWidth = 4; cg.strokeRect(2, 2, 252, 60);
  const park = canvas(128, 192), qg = park.getContext('2d');
  qg.fillStyle = '#1d5fb0'; qg.fillRect(0, 0, 128, 192); qg.strokeStyle = '#fff'; qg.lineWidth = 5; qg.strokeRect(5, 5, 118, 128); qg.fillStyle = '#fff'; qg.font = 'bold 100px Arial'; qg.textAlign = 'center'; qg.textBaseline = 'middle'; qg.fillText('P', 64, 72);
  qg.fillStyle = '#f2f2ee'; qg.fillRect(8, 142, 112, 44);
  const plate = canvas(512, 96), lg = plate.getContext('2d');
  lg.fillStyle = '#1d4f9a'; lg.fillRect(0, 0, 512, 96); lg.strokeStyle = '#fff'; lg.lineWidth = 5; lg.strokeRect(6, 6, 500, 84);
  lg.fillStyle = '#fff'; lg.font = 'bold 44px Arial'; lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.fillText('Aleea Croitorului', 256, 50);
  const icon = canvas(256, 384), ig = icon.getContext('2d');
  ig.fillStyle = '#2c4f86'; ig.fillRect(0, 0, 256, 384);
  ig.fillStyle = '#e4d6a8'; ig.fillRect(14, 14, 228, 356);
  ig.fillStyle = '#7a1f1f'; ig.fillRect(24, 24, 208, 336);
  const rg = ig.createRadialGradient(128, 150, 10, 128, 150, 92); rg.addColorStop(0, '#f0d98a'); rg.addColorStop(1, '#b8872e'); ig.fillStyle = rg; ig.beginPath(); ig.arc(128, 150, 92, 0, 7); ig.fill();
  ig.fillStyle = '#5a3a20'; ig.fillRect(122, 72, 12, 170); ig.fillRect(80, 110, 96, 11);
  ig.fillStyle = '#e9d3b8'; ig.beginPath(); ig.ellipse(128, 128, 8, 10, 0, 0, 7); ig.fill(); ig.fillRect(123, 138, 10, 60);
  ig.fillStyle = '#d9c28a'; ig.font = 'bold 26px serif'; ig.textAlign = 'center'; ig.fillText('IC XC', 128, 300);
  const stones = canvas(256, 256), og = stones.getContext('2d');
  og.fillStyle = '#9a948a'; og.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) { const t = 120 + R() * 70; og.fillStyle = `rgb(${t},${t - 6},${t - 14})`; og.fillRect(R() * 256, R() * 256, 30 + R() * 60, 6 + R() * 10); }
  grain(og, 256, 256, 18, R);
  const weeds = canvas(256, 256), eg = weeds.getContext('2d');
  eg.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const x = 18 + R() * 220, h = 60 + R() * 170, lean = (R() - 0.5) * 90, w = 2 + R() * 3.5, dry = R();
    eg.fillStyle = dry < 0.3 ? `rgb(${150 + R() * 45},${140 + R() * 35},${82 + R() * 25})` : `rgb(${58 + R() * 45},${92 + R() * 50},${32 + R() * 25})`;
    const tx = x + lean, ty = 256 - h, cx = x + lean * 0.25, cy = 256 - h * 0.55;
    eg.beginPath(); eg.moveTo(x - w, 256); eg.quadraticCurveTo(cx - w * 0.6, cy, tx, ty); eg.quadraticCurveTo(cx + w * 0.6, cy, x + w, 256); eg.closePath(); eg.fill();
  }
  const gravel = M.gravel;
  const asph = M.asphalt;
  MT = {
    asphalt: off(std({ map: asph.map, normalMap: asph.normalMap, roughness: 0.95, color: 0xbfbdb6 }), -9),
    decal: off(std({ map: tex(dec), alphaTest: 0.35, roughness: 0.8, transparent: false }), -10),
    kerb: std({ map: tex(kerb, { repeat: true }), roughness: 0.85 }),
    walk: std({ map: asph.map, normalMap: asph.normalMap, roughness: 0.95, color: 0xa9a6a0 }),
    concrete: std({ map: M.concrete.map, normalMap: M.concrete.normalMap, roughness: 0.92, color: 0xc4c2bb }),
    cracked: off(std({ map: asph.map, normalMap: asph.normalMap, roughness: 0.95, color: 0xd6d3cb }), -6),
    water: std({ map: tex(water, { repeat: true }), roughness: 0.08, metalness: 0.2, color: 0xb9c4c2 }),
    rust: std({ color: 0x7b4a2d, roughness: 0.85, metalness: 0.35 }),
    chain: M.chain,
    greenBars: std({ map: tex(bars, { repeat: true }), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }),
    greenPanel: std({ map: tex(panel), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 }),
    sheetGreen: std({ map: tex(trap, { repeat: true }), normalMap: tex(normalFromCanvas(trap, 2.5, 256), { repeat: true, srgb: false }), roughness: 0.45, metalness: 0.45, color: 0x2e6b45, side: THREE.DoubleSide }),
    sheetBrown: std({ map: tex(trap, { repeat: true }), normalMap: tex(normalFromCanvas(trap, 2.5, 256), { repeat: true, srgb: false }), roughness: 0.45, metalness: 0.45, color: 0x5a3a2c, side: THREE.DoubleSide }),
    slatGray: std({ map: tex(slat, { repeat: true }), roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide }),
    slatWhite: std({ map: tex(slat, { repeat: true }), roughness: 0.45, metalness: 0.3, color: 0xffffff, side: THREE.DoubleSide }),
    stoneKerb: std({ map: M.concrete.map, normalMap: M.concrete.normalMap, roughness: 0.95, color: 0xb3b0a8 }),
    wall: std({ map: M.concrete.map, normalMap: M.concrete.normalMap, roughness: 0.9, color: 0x9d9b95 }),
    railing: std({ color: 0x2f7a4a, roughness: 0.5, metalness: 0.4 }),
    stones: std({ map: tex(stones, { repeat: true }), roughness: 0.95 }),
    gravel: off(std({ map: gravel.map, normalMap: gravel.normalMap, roughness: 1, color: 0xc2bcae }), -5),
    chev: std({ map: tex(chev), roughness: 0.5 }), park: std({ map: tex(park), roughness: 0.5 }), plate: std({ map: tex(plate), roughness: 0.5 }),
    icon: std({ map: tex(icon), roughness: 0.6 }),
    shrineWood: std({ map: M.wood.map, normalMap: M.wood.normalMap, roughness: 0.7, color: 0x6b3e22 }),
    shrineRoof: std({ map: M.roofMetalBrown.map, normalMap: M.roofMetalBrown.normalMap, roughness: 0.5, metalness: 0.4, color: 0x6e2a24, side: THREE.DoubleSide }),
    mirror: std({ color: 0xcfd6dc, roughness: 0.05, metalness: 1 }),
    mirrorRim: std({ color: 0xe0661e, roughness: 0.5 }),
    signBack: std({ color: 0x8d9296, roughness: 0.5, metalness: 0.6 }),
    leaves: addWind(std({ map: M.ivy?.map ?? null, roughness: 0.9, color: 0x6f8f55 }), 0.04, 1.2),
    weeds: addWind(std({ map: tex(weeds), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 }), 0.12, 1.6),
    grass: off(std({ map: M.grassGround.map, normalMap: M.grassGround.normalMap, roughness: 1, color: 0xd9e2b4 }), -4),
  };
  UNDER_SNOW.add(MT.weeds);
  return MT;
}

// ------------------------------------------------------------------ build
export function buildMagurii(B, world) {
  const Mt = mats();
  const A = { weeds: new Acc(), grass: new Acc(), asphalt: new Acc(), decal: new Acc(), kerb: new Acc(), walk: new Acc(), concrete: new Acc(), cracked: new Acc(), water: new Acc(), chain: new Acc(), greenBars: new Acc(), greenPanel: new Acc(), sheetGreen: new Acc(), sheetBrown: new Acc(), slatGray: new Acc(), slatWhite: new Acc(), stoneKerb: new Acc(), wall: new Acc(), gravel: new Acc(), chev: new Acc(), park: new Acc(), plate: new Acc(), icon: new Acc(), shrineRoof: new Acc(), manhole: new Acc() };
  const G = { rust: [], railing: [], galv: [], stones: [], shrineWood: [], concrete: [], mirror: [], mirrorRim: [], signBack: [], leaves: [], pole: [], gas: [], black: [] };
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const Y = (x, z) => heightAt(x, z);
  const R = rng(4084);
  const surfaces = [];
  const out = { type: 'magurii', name: 'Strada Măgurii', wires: [] };

  // ================================================================ Strada Măgurii at Strada Tulburii (photos 43-45)
  if (STORE.M) {
    const F = frame(STORE.M), sJ = STORE.sJ;
    const W = (s, o) => { const q = F.at(s + sJ), [ux, uz] = F.dir(s + sJ); return [q.x - uz * o, q.z + ux * o]; };
    const dirAt = (s) => F.dir(s + sJ);
    const loc = (x, z) => { const l = F.local(x, z); return l ? { s: l.s - sJ, o: l.o, d: l.d } : null; };
    const sMin = -sJ, sMax = F.L - sJ;
    const P3 = (s, o, lift = 0) => { const [x, z] = W(s, o); return [x, Y(x, z) + lift, z]; };
    const G0 = (s, o) => { const [x, z] = W(s, o); return gridHeight(GEO, x, z); };        // grade, ignoring the trenches
    const strip = (acc, s0, s1, o0, o1, y, uv, step = 1, hint = UP) => {
      for (let s = s0; s < s1 - 1e-6; s += step) {
        const t = Math.min(s1, s + step), a0 = W(s, o0), b0 = W(t, o0), a1 = W(s, o1), b1 = W(t, o1);
        acc.quad([a0[0], y(s, o0), a0[1]], [b0[0], y(t, o0), b0[1]], [b1[0], y(t, o1), b1[1]], [a1[0], y(s, o1), a1[1]], hint, uv(s, t));
      }
    };
    const wallStrip = (acc, s0, s1, o, yb, yt, hintSign, uv, step = 1) => {
      for (let s = s0; s < s1 - 1e-6; s += step) {
        const t = Math.min(s1, s + step), a = W(s, o), b = W(t, o), [ux, uz] = dirAt((s + t) / 2);
        acc.quad([a[0], yb(s), a[1]], [b[0], yb(t), b[1]], [b[0], yt(t), b[1]], [a[0], yt(s), a[1]], [-uz * hintSign, 0, ux * hintSign], uv(s, t));
      }
    };
    // no forest / scattered trees on the street and its verges; grass there
    for (let s = sMin; s < sMax; s += 8) { const [ux, uz] = dirAt(s + 4); addHole(W(s + 4, 0), 4.4, HW + 2.4, ux, uz, { lawn: true }); }

    // ---- carriageway: worn asphalt, sealed cracks, patches
    for (let c = 0; c < 5; c++) { const o0 = -HW + c, o1 = o0 + 1; strip(A.asphalt, sMin, sMax, o0, o1, (s, o) => Y(...W(s, o)) + 0.035, (s, t) => [o0 / 3.2, s / 3.2, o0 / 3.2, t / 3.2, o1 / 3.2, t / 3.2, o1 / 3.2, s / 3.2]); }
    for (let k = 0; k < 70; k++) {
      const s = sMin + 4 + R() * (sMax - sMin - 8), o = (R() - 0.5) * (2 * HW - 1.2), tile = Math.floor(R() * 4), L = tile === 2 ? 1.2 + R() * 1.6 : 1.5 + R() * 2.5, w = tile === 0 ? 0.5 : tile === 3 ? 1.6 + R() : 0.9 + R() * 0.8;
      const [ux, uz] = dirAt(s), rot = tile === 3 ? Math.PI / 2 : (R() - 0.5) * 0.4, cr = Math.cos(rot), sr = Math.sin(rot);
      const c = W(s, o), ax = ux * cr - uz * sr, az = uz * cr + ux * sr, nx = -az, nz = ax;
      const p = (a, b) => { const x = c[0] + ax * a + nx * b, z = c[1] + az * a + nz * b; return [x, Y(x, z) + 0.045, z]; };
      A.decal.quad(p(-L / 2, -w / 2), p(L / 2, -w / 2), p(L / 2, w / 2), p(-L / 2, w / 2), UP, [tile / 4, 0, (tile + 1) / 4, 0, (tile + 1) / 4, 1, tile / 4, 1]);
    }

    // ---- kerbs painted in white and grey blocks and the narrow footways (east north of the junction, west south of it)
    const footway = (s0, s1, side) => {
      const oK = side * HW, oW = side * (HW + WALK.kerb), oB = side * (HW + WALK.kerb + WALK.w);
      const yTop = (s) => Y(...W(s, oK)) + 0.035 + WALK.h;
      wallStrip(A.kerb, s0, s1, oK, (s) => Y(...W(s, oK)) - 0.05, yTop, -side, (s, t) => [s, 0, t, 0, t, 1, s, 1], 0.5);
      strip(A.kerb, s0, s1, oK, oW, (s) => yTop(s), (s, t) => [s, 0.2, t, 0.2, t, 0.8, s, 0.8], 0.5);
      strip(A.walk, s0, s1, oW, oB, (s) => yTop(s), (s, t) => [0, s / 3, 0, t / 3, 0.5, t / 3, 0.5, s / 3]);
      wallStrip(A.wall, s0, s1, oB, (s) => G0(s, oB) - 0.2, yTop, side, (s, t) => [s / 2, 0, t / 2, 0, t / 2, 0.1, s / 2, 0.1]);
      for (const s of [s0, s1]) { const a = W(s, oK), b = W(s, oB), y = yTop(s), [ux, uz] = dirAt(s), sg = s === s0 ? -1 : 1; A.walk.quad([a[0], y - 0.2, a[1]], [b[0], y - 0.2, b[1]], [b[0], y, b[1]], [a[0], y, a[1]], [ux * sg, 0, uz * sg]); }
      surfaces.push((x, z) => { const l = loc(x, z); return l && l.s > s0 && l.s < s1 && l.o * side >= HW && l.o * side <= HW + WALK.kerb + WALK.w ? Y(...W(l.s, oK)) + 0.035 + WALK.h : null; });
    };
    footway(N.s0, -7.5, -1);
    footway(SOUTH.s0, SOUTH.s1, 1);

    // ---- north, west side: cracked concrete strip, the channel with water, rusty posts with bent tops and chain-link
    {
      const oA = HW, oB = CH.o0, oC = CH.o0 + CH.wall, oD = oC + CH.w, oE = oD + CH.wall, oF = oE + 1.5;
      strip(A.cracked, CH.s0, CH.s1, oA, oB, (s, o) => G0(s, o) + 0.03, (s, t) => [oA / 3, s / 3, oA / 3, t / 3, oB / 3, t / 3, oB / 3, s / 3]);
      for (let s = CH.s0 + 1; s < CH.s1 - 1; s += 1.6 + R() * 1.4) {
        const [ux, uz] = dirAt(s), c = W(s, (oA + oB) / 2), L = 1.2 + R() * 1.2, w = 0.6, rot = (R() - 0.5) * 0.6, cr = Math.cos(rot), sr = Math.sin(rot), ax = ux * cr - uz * sr, az = uz * cr + ux * sr;
        const p = (a, b) => { const x = c[0] + ax * a - az * b, z = c[1] + az * a + ax * b; return [x, G0(s, oA) + 0.04, z]; }, tile = R() < 0.6 ? 1 : 0;
        A.decal.quad(p(-L / 2, -w / 2), p(L / 2, -w / 2), p(L / 2, w / 2), p(-L / 2, w / 2), UP, [tile / 4, 0, (tile + 1) / 4, 0, (tile + 1) / 4, 1, tile / 4, 1]);
      }
      strip(A.concrete, CH.s0, CH.s1, oB, oC, (s, o) => G0(s, o) + 0.05, (s, t) => [0, s / 2, 0.1, t / 2, 0.1, t / 2, 0, s / 2]);
      strip(A.concrete, CH.s0, CH.s1, oD, oE, (s, o) => G0(s, o) + 0.05, (s, t) => [0, s / 2, 0.1, t / 2, 0.1, t / 2, 0, s / 2]);
      const bottom = (s, o) => G0(s, o) + 0.05 - CH.d;
      wallStrip(A.concrete, CH.s0, CH.s1, oC, (s) => bottom(s, oC), (s) => G0(s, oC) + 0.05, 1, (s, t) => [s / 2, 0, t / 2, 0, t / 2, 0.3, s / 2, 0.3]);
      wallStrip(A.concrete, CH.s0, CH.s1, oD, (s) => bottom(s, oD), (s) => G0(s, oD) + 0.05, -1, (s, t) => [s / 2, 0, t / 2, 0, t / 2, 0.3, s / 2, 0.3]);
      strip(A.concrete, CH.s0, CH.s1, oC, oD, (s, o) => bottom(s, o), (s, t) => [0, s / 2, 0.3, t / 2, 0.3, t / 2, 0, s / 2]);
      strip(A.water, CH.s0, CH.s1, oC, oD, (s, o) => bottom(s, o) + 0.2, (s, t) => [0, s / 4, 1, t / 4, 1, t / 4, 0, s / 4]);
      // the grass verge beyond, level (the trench under it)
      strip(A.grass, CH.s0, CH.s1, oE, oF, (s, o) => G0(s, o) + 0.02, (s, t) => [0, s / 2, 0.75, t / 2, 0.75, t / 2, 0, s / 2]);
      { const a0 = W(CH.s0, CH.o0), a1 = W(CH.s0, oE), y = G0(CH.s0, CH.o0), [ux, uz] = dirAt(CH.s0); A.concrete.quad([a0[0], y - CH.d, a0[1]], [a1[0], y - CH.d, a1[1]], [a1[0], y + 0.05, a1[1]], [a0[0], y + 0.05, a0[1]], [ux, 0, uz]); }
      surfaces.push((x, z) => { const l = loc(x, z); if (!l || l.s < CH.s0 || l.s > CH.s1) return null; if ((l.o >= oA && l.o <= oC) || (l.o >= oD && l.o <= oF)) return G0(l.s, l.o) + 0.04; return null; });
      // weeds at the channel's edge
      for (let s = CH.s0 + 1; s < CH.s1; s += 0.8) { const [x, z] = W(s + R() * 0.4, oE + 0.12 + R() * 0.5); tuft(A.weeds, x, G0(s, oE) + 0.02, z, 0.5 + R() * 0.3, 0.25 + R() * 0.45, R() * 3); }
      // rusty posts, top 0.45 m bent over the channel, three wires and sagging chain-link
      const oP = oE + 0.55, posts = [];
      for (let s = CH.s0 + 1; s < CH.s1 - 0.5; s += 2.6 + R() * 0.3) {
        const [x, z] = W(s, oP), y = G0(s, oP), [ux, uz] = dirAt(s), lean = (R() - 0.5) * 0.06;
        tube(G.rust, [x, y - 0.2, z], [x - uz * lean, y + 1.5, z + ux * lean], 0.03, 6);
        const tx = x - uz * lean - (-uz) * 0.3, tz = z + ux * lean - ux * 0.3;           // bent towards the street (-o)
        tube(G.rust, [x - uz * lean, y + 1.5, z + ux * lean], [tx, y + 1.82, tz], 0.028, 6);
        posts.push({ s, x, z, y, top: [tx, y + 1.82, tz] });
        box(x, z, 0.05, 0.05, 0, y - 1, y + 1.8, 'post');
      }
      for (let k = 0; k < posts.length - 1; k++) {
        const p = posts[k], q = posts[k + 1];
        const Lc = Math.hypot(q.x - p.x, q.z - p.z) / 0.25;
        A.chain.quad([p.x, p.y + 0.05, p.z], [q.x, q.y + 0.05, q.z], [q.x, q.y + 1.28, q.z], [p.x, p.y + 1.35, p.z], [0, 0, 1], [0, 0, Lc, 0, Lc, 1.23 / 0.25, 0, 1.3 / 0.25]);
        for (const h of [0.35, 1.3]) out.wires.push(p.x, p.y + h, p.z, q.x, q.y + h - 0.04, q.z);
        out.wires.push(...p.top, ...q.top);
        box((p.x + q.x) / 2, (p.z + q.z) / 2, Math.hypot(q.x - p.x, q.z - p.z) / 2, 0.05, Math.atan2(-(q.z - p.z), q.x - p.x), p.y - 1, p.y + 1.4, 'fence');
      }
    }
    // ---- north, east side: low wall with green bar panels, then hedges with vines towards the junction (photos 43, 44)
    const fenceRun = (acc, s0, s1, o, y0, h, panel, uvW, postMat = null, postH = h, uvH = 1) => {
      for (let s = s0; s < s1 - 1e-6; s += panel) {
        const t = Math.min(s1, s + panel), a = W(s, o), b = W(t, o), ya = G0(s, o) + y0, yb = G0(t, o) + y0, [ux, uz] = dirAt((s + t) / 2);
        acc.quad([a[0], ya, a[1]], [b[0], yb, b[1]], [b[0], yb + h, b[1]], [a[0], ya + h, a[1]], [-uz, 0, ux], [0, 0, (t - s) / uvW, 0, (t - s) / uvW, uvH, 0, uvH]);
        if (postMat) boxAt(postMat, a[0], ya + postH / 2 - 0.1, a[1], 0.06, postH + 0.2, 0.06, -Math.atan2(uz, ux));
        box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (t - s) / 2, 0.08, Math.atan2(-(b[1] - a[1]), b[0] - a[0]), ya - 1, ya + h, 'fence');
      }
    };
    {
      const o = -(HW + WALK.kerb + WALK.w + 0.12);
      wallStrip(A.wall, N.s0, -34, o, (s) => G0(s, o) - 0.2, (s) => G0(s, o) + 0.45, 1, (s, t) => [s / 2, 0, t / 2, 0, t / 2, 0.3, s / 2, 0.3]);
      wallStrip(A.wall, N.s0, -34, o - 0.2, (s) => G0(s, o) - 0.2, (s) => G0(s, o) + 0.45, -1, (s, t) => [s / 2, 0, t / 2, 0, t / 2, 0.3, s / 2, 0.3]);
      strip(A.wall, N.s0, -34, o - 0.2, o, (s) => G0(s, o) + 0.45, (s, t) => [0, s / 2, 0.1, t / 2, 0.1, t / 2, 0, s / 2]);
      fenceRun(A.greenBars, N.s0, -34, o - 0.1, 0.45, 1.05, 2.0, 2.0, G.railing, 1.1);
      for (let s = -34; s < -9; s += 1.1 + R() * 0.8) { const [x, z] = W(s, o - 0.4 - R() * 0.6), r = 0.7 + R() * 0.6, g = new THREE.IcosahedronGeometry(r, 2); g.scale(1, 1.3, 1); g.translate(x, Y(x, z) + r * 1.1, z); G.leaves.push(g); }
      fenceRun(A.chain, -34, -9, o - 0.05, 0.05, 1.6, 2.5, 0.25, G.galv, 1.65, 1.6 / 0.25);
    }
    // ---- the culvert's inlet with the green pipe railing, the gravel yard with stacked stones (photo 44)
    {
      const s = INLET.s, o0 = CH.o0 - 0.2, o1 = CH.o0 + CH.w + 2 * CH.wall + 0.3, s0 = s - 1.2, s1 = s + 1.6;
      const corners = [W(s0, o0), W(s1, o0), W(s1, o1), W(s0, o1)];
      for (let k = 0; k < 4; k++) { const [x, z] = corners[k], y = G0(s, CH.o0); tube(G.railing, [x, y - 0.1, z], [x, y + 1.0, z], 0.03, 6); }
      for (let k = 0; k < 4; k++) { const a = corners[k], b = corners[(k + 1) % 4], ya = G0(s, CH.o0); for (const h of [0.5, 1.0]) tube(G.railing, [a[0], ya + h, a[1]], [b[0], ya + h, b[1]], 0.025, 6); }
      // head wall across the channel's end (the water drops into the pipe)
      const hw0 = W(CH.s1, CH.o0), hw1 = W(CH.s1, CH.o0 + CH.w + 2 * CH.wall), yh = G0(CH.s1, CH.o0);
      const [ux, uz] = dirAt(CH.s1);
      A.concrete.quad([hw0[0], yh - CH.d, hw0[1]], [hw1[0], yh - CH.d, hw1[1]], [hw1[0], yh + 0.05, hw1[1]], [hw0[0], yh + 0.05, hw0[1]], [-ux, 0, -uz]);
      const pc = W(CH.s1 - 0.02, CH.o0 + CH.wall + CH.w / 2), dk = new THREE.CircleGeometry(0.22, 12); dk.rotateY(Math.atan2(-ux, -uz)); dk.translate(pc[0], yh - CH.d + 0.26, pc[1]); G.black.push(dk);
      box(...W(s + 0.2, (o0 + o1) / 2), 1.5, (o1 - o0) / 2, Math.atan2(-uz, ux), yh - 1, yh + 1.1, 'railing');
      // gravel yard and the stacks of flat stones
      const yard = [W(-34, CH.o0 + CH.w + 0.9), W(-11, CH.o0 + CH.w + 0.9), W(-9, 13), W(-34, 14)];
      drape(A.gravel, yard, 0.03, 1.5, 2.5);
      for (const [ss, oo, n] of [[-19, 9.5, 7], [-16.5, 10.5, 5], [-27, 11, 4]]) {
        const [x, z] = W(ss, oo), y = Y(x, z), a = R() * 3;
        for (let k = 0; k < n; k++) { const w = 0.9 + R() * 0.5, d = 0.6 + R() * 0.4, h = 0.06 + R() * 0.05; boxAt(G.stones, x + (R() - 0.5) * 0.2, y + 0.04 + k * 0.1, z + (R() - 0.5) * 0.2, w, h, d, a + (R() - 0.5) * 0.4); }
        box(x, z, 0.7, 0.6, 0, y - 1, y + 0.1 * n, 'stones');
      }
      out.suv = { ...(() => { const [x, z] = W(-24, 8.2), [ux2, uz2] = dirAt(-24); return { x, z, h: Math.atan2(-(-uz2), -(ux2)) }; })() };
    }
    // ---- junction: green sheet fence on the corner south of Strada Tulburii (photo 44)
    fenceRun(A.sheetGreen, 5.5, 22, -(HW + 1.6), 0.02, 1.9, 2.0, 0.5, G.railing, 1.95);
    // ---- south, west side (photo 45): green sheet fence, the grey gate and slatted fence, behind the footway
    {
      const o = HW + WALK.kerb + WALK.w + 0.1;
      fenceRun(A.sheetGreen, SOUTH.s0 + 3, 31, o, 0.02, 1.85, 2.0, 0.5, G.railing, 1.9);
      fenceRun(A.slatGray, 31, 35.4, o, 0.05, 1.9, 2.2, 2.2, G.galv, 1.95);
      fenceRun(A.slatGray, 35.4, 48, o, 0.05, 1.7, 2.0, 2.2, G.galv, 1.75);
      fenceRun(A.sheetGreen, 48, SOUTH.s1, o, 0.02, 1.8, 2.0, 0.5, G.railing, 1.85);
    }
    // ---- south, east side (photo 45): stone kerb, the earth ditch with a slab crossing, brown trapezoidal sheet fence
    {
      const oK0 = -HW, oK1 = -DITCH.o0;
      for (let s = DITCH.s0; s < DITCH.s1 - 1e-6; s += 1.0) {
        if (s + 1 > DITCH.slab[0] && s < DITCH.slab[1]) continue;
        const t = s + 0.98, a = W(s, oK0), b = W(t, oK0), c2 = W(t, oK1), d2 = W(s, oK1), [ux, uz] = dirAt(s + 0.5), h = 0.32;
        const ya = Y(...a) + 0.035, yb = Y(...b) + 0.035, yl = Math.min(ya, yb) - 0.35;
        A.stoneKerb.quad([a[0], ya + 0.06, a[1]], [b[0], yb + 0.06, b[1]], [c2[0], yb + 0.06, c2[1]], [d2[0], ya + 0.06, d2[1]], UP, [0, 0, 1, 0, 1, 0.26, 0, 0.26]);
        A.stoneKerb.quad([d2[0], yl, d2[1]], [c2[0], yl, c2[1]], [c2[0], yb + 0.06, c2[1]], [d2[0], ya + 0.06, d2[1]], [uz, 0, -ux], [0, 0, 1, 0, 1, h, 0, h]);
        A.stoneKerb.quad([a[0], ya - 0.02, a[1]], [b[0], yb - 0.02, b[1]], [b[0], yb + 0.06, b[1]], [a[0], ya + 0.06, a[1]], [-uz, 0, ux], [0, 0, 1, 0, 1, 0.08, 0, 0.08]);
      }
      const sl = [W(DITCH.slab[0], -HW + 0.02), W(DITCH.slab[1], -HW + 0.02), W(DITCH.slab[1] + 0.3, -DITCH.o0 - DITCH.w - 0.7), W(DITCH.slab[0] - 0.3, -DITCH.o0 - DITCH.w - 0.7)];
      drape(A.concrete, sl, 0.1, 1, 2.2);
      const sl2 = [W(DITCH.slab[0] - 2.2, -HW + 0.02), W(DITCH.slab[0], -HW + 0.02), W(DITCH.slab[0] - 0.3, -DITCH.o0 + 0.05), W(DITCH.slab[0] - 2.4, -DITCH.o0 + 0.05)];
      drape(A.walk, sl2, 0.06, 1, 2.2);
      surfaces.push((x, z) => { const l = loc(x, z); if (!l) return null; if (l.s > DITCH.slab[0] && l.s < DITCH.slab[1] && l.o < -HW && l.o > -DITCH.o0 - DITCH.w - 0.6) return G0(l.s, l.o) + 0.1; if (l.s > DITCH.s0 && l.s < DITCH.s1 && l.o <= -HW && l.o >= -DITCH.o0) return Y(...W(l.s, -HW)) + 0.095; return null; });
      const oF = -(DITCH.o0 + DITCH.w + 0.75);
      fenceRun(A.sheetBrown, 24, 38.2, oF, 0.02, 1.9, 2.0, 0.5, G.galv, 1.95);
      fenceRun(A.sheetBrown, 41.8, 60, oF, 0.02, 1.9, 2.0, 0.5, G.galv, 1.95);
      // brown sheet gate leaves behind the slab
      fenceRun(A.sheetBrown, 38.2, 41.8, oF - 0.05, 0.05, 1.85, 1.8, 0.5);
      for (let s = DITCH.s0 + 1; s < DITCH.s1; s += 0.6) if (s < DITCH.slab[0] - 0.4 || s > DITCH.slab[1] + 0.4) { const [x, z] = W(s + R() * 0.3, -DITCH.o0 - 0.1 - R() * (DITCH.w + 0.6)); tuft(A.weeds, x, Y(x, z), z, 0.5 + R() * 0.4, 0.3 + R() * 0.6, R() * 3); }
    }
    out.W = W; out.dir = dirAt; out.bboxB = (() => { const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }; for (let s = N.s0 - 2; s <= SOUTH.s1 + 2; s += 4) for (const o of [-8, 16]) { const [x, z] = W(s, o); bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); } return bb; })();
    // parked cars (photo 43): a grey hatchback and a dark saloon by the east kerb, facing north
    out.cars = [-58, -52.6].map((s, i) => { const [x, z] = W(s, -HW + 1.05), [ux, uz] = dirAt(s); return { x, z, h: Math.atan2(ux, uz), model: i ? 'sedan' : 'hatch', paint: i ? 0x2c3035 : 0x5a554f }; });
  }

  // ================================================================ DJ100E x Aleea Croitorului (photo 42)
  const dj = road('34062271'), cr = road('231543097');
  if (dj && cr) {
    const CP = pairs(cr.p), jp = CP[CP.length - 1], e0 = CP[CP.length - 2], el = Math.hypot(e0[0] - jp[0], e0[1] - jp[1]);
    const e = [(e0[0] - jp[0]) / el, (e0[1] - jp[1]) / el];                       // along the lane, away from the road
    const FD = frame(pairs(dj.p)), lj = FD.local(...jp), m = FD.dir(lj.s);                // the road northwards (way order)
    // frames: Kp from the junction point (a along the lane = east, b along the road = north), Kc from the corner of
    // the road's east edge and the lane's north edge (the rendered ribbons' edges)
    const hD = dj.w / 2, hC = cr.w / 2;
    const Kp = (a, b) => [jp[0] + e[0] * a + m[0] * b, jp[1] + e[1] * a + m[1] * b];
    const Kc = (a, b) => Kp(hD + a, hC + b);
    const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);                        // rotY that turns +z towards (tx, tz)
    const cam = Kp(-2.2, -9.5);
    // white kerbs round the corner and along the lane's north edge
    // painted kerb along a polyline; side = +1 when the carriageway lies to the right of the direction of travel
    const kerbLine = (pts, side) => {
      let u = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz * side, nz = ux * side;
        const ya = Y(ax, az) + 0.035, yb = Y(bx, bz) + 0.035;
        A.kerb.quad([ax, ya - 0.05, az], [bx, yb - 0.05, bz], [bx, yb + 0.15, bz], [ax, ya + 0.15, az], [nx, 0, nz], [u, 0, u + L, 0, u + L, 1, u, 1]);
        A.kerb.quad([ax, ya + 0.15, az], [bx, yb + 0.15, bz], [bx - nx * 0.15, yb + 0.15, bz - nz * 0.15], [ax - nx * 0.15, ya + 0.15, az - nz * 0.15], UP, [u, 0.2, u + L, 0.2, u + L, 0.8, u, 0.8]);
        u += L;
      }
    };
    {
      const pts = [], r = 2.5;
      for (let b = 14; b > r + 1e-6; b -= 1.5) pts.push(Kc(0, b));
      for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI / 2; pts.push(Kc(r - r * Math.cos(a), r - r * Math.sin(a))); }
      for (let a = r + 1.5; a <= 24; a += 1.5) pts.push(Kc(a, 0));
      kerbLine(pts, 1);
      const pts2 = []; for (let b = 16; b >= -3; b -= 1.5) pts2.push(Kc(-2 * hD, b));
      kerbLine(pts2, -1);
      // asphalt into the rounded corner, between the two ribbons' square edges and the kerb
      const poly = [Kc(0, r + 0.2)];
      for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI / 2; poly.push(Kc(r - r * Math.cos(a), r - r * Math.sin(a))); }
      poly.push(Kc(r + 0.2, 0), Kc(-0.5, -0.5));
      drape(A.asphalt, poly, 0.03, 1, 3.2);
    }
    // wayside shrine: stone base, wooden posts, a painted icon under a small tin roof (the corner behind the kerb)
    {
      const [x, z] = Kc(2.4, 1.6), y = Y(x, z), rot = faceTo(x, z, cam[0], cam[1]);
      const T = (g) => { g.rotateY(rot); g.translate(x, y, z); return g; };
      G.concrete.push(T(Object.assign(new THREE.BoxGeometry(1.5, 0.35, 1.0), {}).translate(0, 0.17, 0)));
      for (const [px, pz] of [[-0.62, -0.38], [0.62, -0.38], [-0.62, 0.38], [0.62, 0.38]]) G.shrineWood.push(T(new THREE.BoxGeometry(0.1, 2.0, 0.1).translate(px, 1.35, pz)));
      G.shrineWood.push(T(new THREE.BoxGeometry(1.36, 1.3, 0.06).translate(0, 1.3, -0.36)));
      G.shrineWood.push(T(new THREE.BoxGeometry(1.4, 0.08, 0.9).translate(0, 0.66, 0)));
      G.shrineWood.push(T(new THREE.BoxGeometry(0.08, 1.1, 0.06).translate(-0.6, 1.3, 0.38)));
      G.shrineWood.push(T(new THREE.BoxGeometry(0.08, 1.1, 0.06).translate(0.6, 1.3, 0.38)));
      // the painted icon on the back board, facing the street (+z in the shrine's frame)
      const icon = new THREE.PlaneGeometry(1.0, 1.3); icon.translate(0, 1.3, -0.31); T(icon); B.geo(Mt.icon, icon, null, null, { noCast: true });
      // gabled tin roof with a small cross on the ridge
      const ridge = 2.9;
      const V = (p) => { const v = new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot); return [x + v.x, y + v.y, z + v.z]; };
      A.shrineRoof.quad(V([-0.95, 2.35, 0.7]), V([0.95, 2.35, 0.7]), V([0.95, ridge, 0]), V([-0.95, ridge, 0]), [Math.sin(rot) * 0.6, 0.8, Math.cos(rot) * 0.6], [0, 0, 2, 0, 2, 1, 0, 1]);
      A.shrineRoof.quad(V([0.95, 2.35, -0.7]), V([-0.95, 2.35, -0.7]), V([-0.95, ridge, 0]), V([0.95, ridge, 0]), [-Math.sin(rot) * 0.6, 0.8, -Math.cos(rot) * 0.6], [0, 0, 2, 0, 2, 1, 0, 1]);
      G.shrineWood.push(T(new THREE.BoxGeometry(0.05, 0.45, 0.05).translate(0, ridge + 0.2, 0)), T(new THREE.BoxGeometry(0.28, 0.05, 0.05).translate(0, ridge + 0.28, 0)));
      box(x, z, 0.75, 0.5, -rot, y - 1, y + 2.9, 'shrine');
      out.shrine = { x, z };
    }
    // the corner pole: convex mirror, street plate; the parking sign on its own post; chevron board
    {
      const [x, z] = Kc(0.55, 0.55), y = Y(x, z);
      cyl(G.pole, x, y - 0.4, z, 10.8, 0.17, 0.11, 8);
      box(x, z, 0.2, 0.2, 0, y - 1, y + 10, 'pole');
      const rot = faceTo(x, z, cam[0], cam[1]), fx = Math.sin(rot), fz = Math.cos(rot);
      const mc = [x + fx * 0.3, y + 3.5, z + fz * 0.3];
      const disk = new THREE.SphereGeometry(0.34, 18, 8, 0, Math.PI * 2, 0, 0.55); disk.rotateX(Math.PI / 2); disk.rotateY(rot); disk.translate(...mc); G.mirror.push(disk);
      const rim = new THREE.TorusGeometry(0.185, 0.035, 6, 20); rim.rotateY(rot); rim.translate(mc[0] + fx * 0.29, mc[1], mc[2] + fz * 0.29); G.mirrorRim.push(rim);
      tube(G.galv, [x, y + 3.5, z], [mc[0] + fx * 0.27, mc[1], mc[2] + fz * 0.27], 0.025, 6);
      // street plate
      const px = -Math.cos(rot) * 0.5, pz = Math.sin(rot) * 0.5;
      A.plate.quad([x + fx * 0.2 - px, y + 2.85, z + fz * 0.2 - pz], [x + fx * 0.2 + px, y + 2.85, z + fz * 0.2 + pz], [x + fx * 0.2 + px, y + 3.04, z + fz * 0.2 + pz], [x + fx * 0.2 - px, y + 3.04, z + fz * 0.2 - pz], [fx, 0, fz], [1, 0, 0, 0, 0, 1, 1, 1]);
      const [sx, sz] = Kc(1.5, 0.45), sy = Y(sx, sz);
      cyl(G.galv, sx, sy - 0.3, sz, 2.6, 0.03);
      const hx = -Math.cos(rot) * 0.2, hz = Math.sin(rot) * 0.2;
      A.park.quad([sx + fx * 0.04 - hx, sy + 1.55, sz + fz * 0.04 - hz], [sx + fx * 0.04 + hx, sy + 1.55, sz + fz * 0.04 + hz], [sx + fx * 0.04 + hx, sy + 2.15, sz + fz * 0.04 + hz], [sx + fx * 0.04 - hx, sy + 2.15, sz + fz * 0.04 - hz], [fx, 0, fz], [1, 0, 0, 0, 0, 1, 1, 1]);
      box(sx, sz, 0.05, 0.05, 0, sy - 1, sy + 2.2, 'sign');
      const [cx, cz] = Kc(7.5, 0.7), cy = Y(cx, cz), wx = -Math.cos(rot) * 0.6, wz = Math.sin(rot) * 0.6;
      for (const sg of [-1, 1]) { cyl(G.galv, cx + wx * sg * 0.8, cy - 0.3, cz + wz * sg * 0.8, 1.9, 0.03); }
      A.chev.quad([cx - wx + fx * 0.04, cy + 1.25, cz - wz + fz * 0.04], [cx + wx + fx * 0.04, cy + 1.25, cz + wz + fz * 0.04], [cx + wx + fx * 0.04, cy + 1.55, cz + wz + fz * 0.04], [cx - wx + fx * 0.04, cy + 1.55, cz - wz + fz * 0.04], [fx, 0, fz], [1, 0, 0, 0, 0, 1, 1, 1]);
      box(cx, cz, 0.6, 0.05, -rot, cy - 1, cy + 1.6, 'sign');
    }
    // green welded panels along the lane's north edge and the road's east edge, behind the kerbs
    const panelRun = (acc, p0, p1, h, pw, y0 = 0.03, postMat = G.railing) => {
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), n = Math.max(1, Math.round(L / pw)), ux = (p1[0] - p0[0]) / L, uz = (p1[1] - p0[1]) / L;
      for (let i = 0; i < n; i++) {
        const a = [p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n], b = [p0[0] + (p1[0] - p0[0]) * (i + 1) / n, p0[1] + (p1[1] - p0[1]) * (i + 1) / n];
        const ya = Y(...a) + y0, yb = Y(...b) + y0;
        acc.quad([a[0], ya, a[1]], [b[0], yb, b[1]], [b[0], yb + h, b[1]], [a[0], ya + h, a[1]], [-uz, 0, ux], [0, 0, 1, 0, 1, 1, 0, 1]);
        if (postMat) boxAt(postMat, a[0], ya + h / 2, a[1], 0.06, h + 0.25, 0.06, -Math.atan2(uz, ux));
        box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / n / 2, 0.06, Math.atan2(-uz, ux), ya - 1, ya + h, 'fence');
      }
    };
    panelRun(A.greenPanel, Kc(3.8, 2.9), Kc(24, 2.9), 1.53, 2.5);
    panelRun(A.greenPanel, Kc(1.2, 3.2), Kc(1.2, 15), 1.53, 2.5);
    // the west side opposite (photo 42, left): white slatted sliding gate, white panels, green panels, the gas riser
    {
      const o = -2 * hD - 1.6;
      panelRun(A.slatWhite, Kc(o, -2), Kc(o, 1.4), 1.6, 1.7, 0.05, G.galv);
      panelRun(A.slatWhite, Kc(o, 1.4), Kc(o, 5.6), 1.7, 4.2, 0.05, G.galv);
      panelRun(A.greenPanel, Kc(o, 5.6), Kc(o, 18), 1.53, 2.5);
      const [gx, gz] = Kc(o + 0.25, -2.6), gy = Y(gx, gz), [hx2, hz2] = Kc(o + 0.25, 0.5);
      tube(G.gas, [gx, gy - 0.3, gz], [gx, gy + 1.15, gz], 0.03, 8);
      tube(G.gas, [gx, gy + 1.15, gz], [hx2, Y(hx2, hz2) + 1.15, hz2], 0.025, 8);
      boxAt(G.gas, gx, gy + 0.9, gz, 0.12, 0.2, 0.12);
      box(gx, gz, 0.06, 0.06, 0, gy - 1, gy + 1.2, 'gas');
    }
    // manholes on the carriageway (photo 42)
    for (const [a, b] of [[-0.5, 7], [4.5, 0.2]]) {
      const [x, z] = Kp(a, b), y = Y(x, z) + 0.05, r = 0.35;
      A.manhole.quad([x - r, y, z - r], [x + r, y, z - r], [x + r, y, z + r], [x - r, y, z + r], UP, [0, 0, 1, 0, 1, 1, 0, 1]);
    }
    out.camA = { from: cam, to: Kc(-1.8, 3.2) };
    const bbA = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const [a, b] of [[-14, -16], [26, -16], [26, 18], [-14, 18]]) { const [x, z] = Kp(a, b); bbA.x0 = Math.min(bbA.x0, x); bbA.x1 = Math.max(bbA.x1, x); bbA.z0 = Math.min(bbA.z0, z); bbA.z1 = Math.max(bbA.z1, z); }
    out.bboxA = bbA;
  }

  // ---- flush
  const put = (acc, mat, opts) => acc.flush(B, mat, null, opts);
  put(A.weeds, Mt.weeds, { noCast: true, noAO: true }); put(A.grass, Mt.grass, { noCast: true }); put(A.asphalt, Mt.asphalt, { noCast: true }); put(A.decal, Mt.decal, { noCast: true }); put(A.kerb, Mt.kerb); put(A.walk, Mt.walk, { noCast: true });
  put(A.concrete, Mt.concrete); put(A.cracked, Mt.cracked, { noCast: true }); put(A.water, Mt.water, { noCast: true }); put(A.chain, Mt.chain, { noAO: true });
  put(A.greenBars, Mt.greenBars, { noAO: true }); put(A.greenPanel, Mt.greenPanel, { noAO: true }); put(A.sheetGreen, Mt.sheetGreen); put(A.sheetBrown, Mt.sheetBrown);
  put(A.slatGray, Mt.slatGray); put(A.slatWhite, Mt.slatWhite); put(A.stoneKerb, Mt.stoneKerb); put(A.wall, Mt.wall); put(A.gravel, Mt.gravel, { noCast: true });
  put(A.chev, Mt.chev); put(A.park, Mt.park); put(A.plate, Mt.plate); put(A.icon, Mt.icon); put(A.shrineRoof, Mt.shrineRoof); put(A.manhole, M.manhole, { noCast: true });
  const geo = (key, mat) => { if (G[key].length) B.geo(mat, merged(G[key])); };
  geo('rust', Mt.rust); geo('railing', Mt.railing); geo('galv', M.galv); geo('stones', Mt.stones); geo('shrineWood', Mt.shrineWood); geo('concrete', Mt.concrete);
  geo('mirror', Mt.mirror); geo('mirrorRim', Mt.mirrorRim); geo('signBack', Mt.signBack); geo('leaves', Mt.leaves); geo('pole', M.concretePole); geo('gas', M.gasPipe); geo('black', M.blackMetal);

  const bbs = [out.bboxA, out.bboxB].filter(Boolean);
  if (!bbs.length) return null;
  out.surface = (x, z) => { for (const f of surfaces) { const y = f(x, z); if (y !== null && y !== undefined) return y; } return null; };
  out.bbox = { x0: Math.min(...bbs.map(b => b.x0)), x1: Math.max(...bbs.map(b => b.x1)), z0: Math.min(...bbs.map(b => b.z0)), z1: Math.max(...bbs.map(b => b.z1)) };
  return out;
}
