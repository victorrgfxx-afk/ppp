import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt, gridHeight, addHole, addFineZone } from './data.js';
import { Acc } from './bridge.js';
import { M, addWind } from '../materials.js';
import { normalFromCanvas } from '../textures.js';
import { rng } from '../util.js';

// Strada Pițigaia (DC117) at its junction with the lane to the east, from the user's two photos taken at
// 45.1229934 N 25.7157007 E (photos 40-41, both looking up the street towards the south-west); layout from OSM and
// aerial imagery (measurements only).
//  * the aerial imagery shows the concrete carriageway ~2 m south-east of the OSM line and ~5 m wide: the stretch is
//    moved there (with the lane's mouth, the village poles and the lot fences along it) and rebuilt as a concrete
//    road: two rows of cast slabs with tar-filled joints, cracks, patches and crumbled edges
//  * north-west side (photo 40, right): grass strip, concrete footpath, the iron spear fence of no. 857 (rusty roof)
//    with gates and the house number, the yellow gas regulator cabinet, the dark plank fence, bushes behind
//  * south-east side (photo 41, left): the weedy ditch with the concrete driveway over it, welded mesh panels and
//    gate, the overgrown lot with the old tiled house (no. 892) and its wooden shed, the electricity meter box
//  * roofs of the houses around from the aerial imagery
const ROAD = '34062249', SIDE_ROAD = '246994487', J = 50;
const S0 = -100, S1 = 55, SHIFT = 2.0, RAMP = 15;
const HW = 2.5, SIDE_HW = 1.9, SIDE_LEN = 24;
const PIN = [-1090.0, -683.5];                     // the photos' coordinate
const WALK = { s0: -78, s1: -4, o0: HW + 0.75, o1: HW + 1.75, h: 0.07 };
const NW_FENCE = -(HW + 1.9);
const DITCH = { s0: -62, s1: -7, o: HW + 1.45, hw: 0.75, d: 0.36 };
const SE_FENCE = HW + 2.7;
const DRIVE = { s0: -21.8, s1: -17.8 };             // driveway over the ditch, mesh gate behind (photo 41)
const IRON = { s0: -24, s1: -3.5, gate: [-14.7, -11.3], wicket: [-9.3, -8.2] };
const PLANK = { s0: -46, s1: -25.2 };
const MESH = { s0: -46, s1: -6.5 };
const APRONS = [[-14.9, -11.1], [-28.6, -26.4]];    // concrete over the grass strip at the gates (photo 40)
// roofs read on the aerial imagery; walls from the photos where seen
const STYLE = {
  '265195213': { wall: 'stuccoCream', roof: 'roofMetalRust' },                   // 857, rusty sheet (photo 40)
  '265194977': { roof: 'roofMetalDark' },                                          // 859
  '304586635': { roofMat: 'tiles', roof: 'tileRed' },                              // 859A
  '304586390': { roofMat: 'tiles', roof: 'tileRed' },                              // 858
  '265195224': { roofMat: 'tiles', roof: 'tileRed' },
  '265195222': { roofMat: 'tiles', roof: 'tileRed' },                              // 856
  '304586046': { roof: 'roofMetalGray' },                                          // 855
  '265195027': { wall: 'stuccoWhite', roofMat: 'tiles', roof: 'tileRed' },         // 892, old tiles (photo 41)
  '265195028': { wall: 'stuccoWhite', roofMat: 'metalTile', roof: 'metalTileBrown' }, // 893
  '265195182': { roof: 'roofMetalGray' },                                          // 897
  '265195180': { roofMat: 'tiles', roof: 'tileRed' },
  '265195106': { roofMat: 'tiles', roof: 'tileRed' },                              // 894
  '265195179': { roof: 'roofMetalDark' },                                          // 895
};

const UP = [0, 1, 0];
export const pairs = (f) => { const o = []; for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
export const road = (id) => (GEO.roads || []).find(r => r.id === id);
export const merged = (list) => mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
export const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ------------------------------------------------------------------ polyline frame
export function frame(P) {
  const S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const at = (s) => {
    let i = 0;
    while (i < P.length - 2 && S[i + 1] < s) i++;
    const l = S[i + 1] - S[i] || 1, t = (s - S[i]) / l;
    const ux = (P[i + 1][0] - P[i][0]) / l, uz = (P[i + 1][1] - P[i][1]) / l;
    return { x: P[i][0] + (P[i + 1][0] - P[i][0]) * t, z: P[i][1] + (P[i + 1][1] - P[i][1]) * t, ux, uz };
  };
  // smoothed tangent (+-4 m) and the normal to its right, (-uz, ux)
  const dir = (s) => { const a = at(s - 4), b = at(s + 4), l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return [(b.x - a.x) / l, (b.z - a.z) / l]; };
  const local = (x, z, i0 = 0, i1 = P.length - 1) => {
    let best = null;
    for (let i = i0; i < i1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (l * l)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (!best || d < best.d) best = { d, s: S[i] + t * l, o: ((x - ax) * -dz + (z - az) * dx) / l, i };
    }
    return best;
  };
  return { P, S, L: S[S.length - 1], at, dir, local };
}

// ------------------------------------------------------------------ before the terrain, roads and buildings
const STORE = {};
export function preparePitigaia() {
  const r = road(ROAD), sr = road(SIDE_ROAD);
  if (!r || !sr || r.p.length < 2 * (J + 4)) return false;
  const F0 = frame(pairs(r.p)), sJ = F0.S[J], a = sJ + S0, b = sJ + S1;
  const sh = (s) => SHIFT * clamp01((s - a) / RAMP) * clamp01((b - s) / RAMP);
  const moved = (s, x, z) => { const [ux, uz] = F0.dir(s), k = sh(s); return [x - uz * k, z + ux * k]; };
  // the stretch, resampled every 2 m, moved onto the concrete and lightly smoothed (ends fixed)
  let Mp = [];
  for (let s = a; s < b - 1e-6; s += 2) { const q = F0.at(s); Mp.push(moved(s, q.x, q.z)); }
  { const q = F0.at(b); Mp.push([q.x, q.z]); }
  for (let pass = 0; pass < 3; pass++) Mp = Mp.map((p, i) => (i === 0 || i === Mp.length - 1) ? p : [(Mp[i - 1][0] + 2 * p[0] + Mp[i + 1][0]) / 4, (Mp[i - 1][1] + 2 * p[1] + Mp[i + 1][1]) / 4]);
  const P = F0.P, i0 = F0.S.findIndex(s => s > a), i1 = F0.S.length - 1 - [...F0.S].reverse().findIndex(s => s < b);
  const { p: _p, id: _id, ...rest } = r;
  const A = { ...rest, id: ROAD, p: [...P.slice(0, i0), Mp[0]].flat() };
  const Mid = { ...rest, id: ROAD + ':pit', p: Mp.flat(), s: 'concrete', w: 2 * HW, own: 'pitigaia' };
  const Bp = { ...rest, id: ROAD + ':b', p: [Mp[Mp.length - 1], ...P.slice(i1 + 1)].flat() };
  // the lane: its mouth follows the junction onto the concrete, its first 24 m are rebuilt too
  const SP = pairs(sr.p), end = SP[SP.length - 1];
  const FM = frame(Mp), jl = FM.local(end[0], end[1]), jq = FM.at(jl.s), dj = [jq.x - end[0], jq.z - end[1]];
  const FS = frame([...SP].reverse());                        // from the junction outwards
  const Sp = [];
  for (let t = 0; t < SIDE_LEN - 1e-6; t += 2) { const q = FS.at(t), k = clamp01(1 - t / 16); Sp.push([q.x + dj[0] * k, q.z + dj[1] * k]); }
  { const q = FS.at(SIDE_LEN); Sp.push([q.x, q.z]); }
  const k0 = FS.S.findIndex(s => s > SIDE_LEN), farPart = [...SP].reverse().slice(k0).reverse();
  const { p: _sp, id: _sid, ...srest } = sr;
  const SA = { ...srest, id: SIDE_ROAD, p: [...farPart, Sp[Sp.length - 1]].flat() };
  const SM = { ...srest, id: SIDE_ROAD + ':pit', p: [...Sp].reverse().flat(), s: 'concrete', w: 2 * SIDE_HW, own: 'pitigaia' };
  GEO.roads.splice(GEO.roads.indexOf(r), 1, A, Mid, Bp);
  GEO.roads.splice(GEO.roads.indexOf(sr), 1, SA, SM);
  // village poles and lot fences along the stretch move with the carriageway; the photographed fronts are rebuilt
  const near = (x, z) => { const l = F0.local(x, z, Math.max(0, i0 - 2), Math.min(P.length - 1, i1 + 2)); return l && l.d < 14 && l.s > a && l.s < b ? l : null; };
  const sOf = (s) => s - sJ;
  for (const run of GEO.poles || []) for (const p of run.p) {
    const l = near(p[0], p[1]);
    if (!l) continue;
    const [x, z] = moved(l.s, p[0], p[1]); p[0] = x; p[1] = z;
    // on the photographed stretch the poles stand on the verge between the concrete and the ditch
    if (sOf(l.s) > DITCH.s0 - 2 && sOf(l.s) < DITCH.s1 + 4 && l.o > 0) {
      const [ux, uz] = F0.dir(l.s), o = l.o;                   // offset from the moved carriageway's axis
      p[0] += -uz * (HW + 0.45 - o); p[1] += ux * (HW + 0.45 - o);
    }
  }
  GEO.fences = (GEO.fences || []).filter(f => {
    const l = near(f[1], f[2]);
    if (l && sOf(l.s) > -48 && sOf(l.s) < 10) return false;
    for (let i = 1; i < f.length; i += 2) { const m = near(f[i], f[i + 1]); if (m) { const [x, z] = moved(m.s, f[i], f[i + 1]); f[i] = x; f[i + 1] = z; } }
    return true;
  });
  for (const bd of GEO.buildings) { const st = STYLE[String(bd.id)]; if (st) bd.o = { ...(bd.o || {}), ...st }; }
  STORE.M = Mp; STORE.side = Sp;
  const FMs = frame(Mp), lj = FMs.local(...moved(sJ, P[J][0], P[J][1])), sJm = lj.s;
  STORE.sJ = sJm;
  // the weedy ditch on the south-east side (photo 41): the terrain around it is rebuilt at 1 m
  {
    const Wm = (s, o) => { const q = FMs.at(s + sJm), [ux, uz] = FMs.dir(s + sJm); return [q.x - uz * o, q.z + ux * o]; };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let s = DITCH.s0 - 8; s <= DITCH.s1 + 8; s += 2) for (const o of [HW - 5, DITCH.o + DITCH.hw + 8]) { const [x, z] = Wm(s, o); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const i0m = Math.max(0, FMs.S.findIndex(v => v > sJm + DITCH.s0 - 12) - 1), i1m = Math.min(Mp.length - 1, FMs.S.findIndex(v => v > sJm + DITCH.s1 + 12) + 1);
    const lz = (x, z) => { const l = FMs.local(x, z, i0m, i1m); return l ? { s: l.s - sJm, o: l.o } : null; };
    addFineZone({ x0, x1, z0, z1,
      // (every 5 m terrain cell touching the ditch must be rebuilt: the zone reaches ~6 m past it)
      test: (x, z) => { const l = lz(x, z); return !!l && l.s > DITCH.s0 - 6 && l.s < DITCH.s1 + 6 && l.o > HW - 4 && l.o < DITCH.o + DITCH.hw + 6; },
      h: (x, z) => { const l = lz(x, z), g0 = gridHeight(GEO, x, z); return l ? g0 - ditchDepth(l.s, l.o) : g0; } });
  }
  return true;
}
// depth of the ditch below the ground (s, o in the stretch's frame); it ends at the driveway's culvert
function ditchDepth(s, o) {
  if (s < DITCH.s0 || s > DITCH.s1 || (s > DRIVE.s0 && s < DRIVE.s1)) return 0;
  const e = Math.min((s - DITCH.s0) / 1.5, (DITCH.s1 - s) / 1.5, Math.abs(s - DRIVE.s0) / 0.4, Math.abs(s - DRIVE.s1) / 0.4), taper = clamp01(e);
  const t = (o - DITCH.o) / DITCH.hw;
  return Math.abs(t) >= 1 ? 0 : DITCH.d * taper * (1 - t * t) * (1 - 0.35 * t * t);
}

// ------------------------------------------------------------------ textures and materials
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function tex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function grain(g, w, h, amp, R) {
  const d = g.getImageData(0, 0, w, h), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const n = (R() - 0.5) * amp; a[i] += n; a[i + 1] += n; a[i + 2] += n * 0.95; }
  g.putImageData(d, 0, 0);
}
export function blobs(g, x0, y0, w, h, n, rMin, rMax, cols, R) {
  for (let i = 0; i < n; i++) {
    const r = rMin + R() * (rMax - rMin), x = x0 + R() * w, y = y0 + R() * h;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); const c = cols[Math.floor(R() * cols.length)];
    gr.addColorStop(0, c); gr.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}
// random-walk crack: dark dirt halo and a thin core; the same path lowered on the height map
function crack(g, hg, x, y, ang, len, R, bounds) {
  const pts = [[x, y]];
  for (let l = 0; l < len; l += 7) {
    ang += (R() - 0.5) * 0.7; x += Math.cos(ang) * 7; y += Math.sin(ang) * 7;
    if (x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3]) break;
    pts.push([x, y]);
  }
  const path = (c) => { c.beginPath(); c.moveTo(...pts[0]); for (const p of pts) c.lineTo(...p); c.stroke(); };
  g.lineJoin = hg.lineJoin = 'round';
  g.strokeStyle = 'rgba(70,68,62,0.18)'; g.lineWidth = 7; path(g);
  g.strokeStyle = 'rgba(38,37,34,0.85)'; g.lineWidth = 1.6 + R(); path(g);
  hg.strokeStyle = '#555'; hg.lineWidth = 2.5; path(hg);
  // a branch now and then
  if (pts.length > 6 && R() < 0.6) { const p = pts[Math.floor(pts.length * (0.3 + R() * 0.4))]; crackSmall(g, hg, p[0], p[1], ang + (R() < 0.5 ? 1 : -1) * (0.6 + R() * 0.5), 25 + R() * 60, R, bounds); }
}
export function crackSmall(g, hg, x, y, ang, len, R, bounds) {
  const pts = [[x, y]];
  for (let l = 0; l < len; l += 6) { ang += (R() - 0.5) * 0.8; x += Math.cos(ang) * 6; y += Math.sin(ang) * 6; if (x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3]) break; pts.push([x, y]); }
  const path = (c) => { c.beginPath(); c.moveTo(...pts[0]); for (const p of pts) c.lineTo(...p); c.stroke(); };
  g.strokeStyle = 'rgba(40,39,35,0.75)'; g.lineWidth = 1.1; path(g);
  hg.strokeStyle = '#666'; hg.lineWidth = 1.8; path(hg);
}

let MT = null;
function mats() {
  if (MT) return MT;
  const R = rng(4021);
  // cast concrete slabs, one lane wide (2.5 m) and ~5 m long per tile: u = 0 at the centre joint, 1 at the outer edge
  // (crumbled), v = 0 at the transverse joint; four variants side by side (clean, longitudinal crack, cracked corner
  // and transverse crack, repaired with a bitumen patch)
  const TW = 512, TH = 1024, slab = canvas(4 * TW, TH), hmap = canvas(4 * TW, TH);
  const g = slab.getContext('2d'), hg = hmap.getContext('2d', { willReadFrequently: true });
  hg.fillStyle = '#c8c8c8'; hg.fillRect(0, 0, 4 * TW, TH);
  for (let k = 0; k < 4; k++) {
    const x0 = k * TW, v = (R() - 0.5) * 10;
    g.fillStyle = `rgb(${171 + v},${170 + v},${165 + v})`; g.fillRect(x0, 0, TW, TH);
    blobs(g, x0, 0, TW, TH, 260, 20, 110, ['rgba(120,118,110,0.07)', 'rgba(205,204,198,0.08)', 'rgba(140,132,118,0.06)', 'rgba(95,95,92,0.05)'], R);
    // wheel paths: polished lighter bands, oil drips darker in between
    for (const [u, a] of [[0.3, 0.05], [0.72, 0.05]]) { const gr = g.createLinearGradient(x0 + (u - 0.09) * TW, 0, x0 + (u + 0.09) * TW, 0); gr.addColorStop(0, 'rgba(210,210,205,0)'); gr.addColorStop(0.5, `rgba(214,213,208,${a})`); gr.addColorStop(1, 'rgba(210,210,205,0)'); g.fillStyle = gr; g.fillRect(x0, 0, TW, TH); }
    blobs(g, x0 + 0.42 * TW, 0, 0.16 * TW, TH, 18, 6, 22, ['rgba(60,58,52,0.12)'], R);
    // aggregate: small light and dark dots
    for (let i = 0; i < 2600; i++) { g.fillStyle = R() < 0.5 ? 'rgba(90,88,82,0.35)' : 'rgba(215,214,208,0.35)'; const s = 1 + R() * 2; g.fillRect(x0 + R() * TW, R() * TH, s, s); }
    // crumbled outer edge with soil and grass in the gaps
    for (let y = 0; y < TH; y += 3) {
      const e = 6 + 10 * Math.abs(Math.sin(y * 0.021 + k * 3)) + R() * 8;
      g.fillStyle = 'rgba(92,84,68,0.85)'; g.fillRect(x0 + TW - e, y, e, 3);
      if (R() < 0.3) { g.fillStyle = 'rgba(78,96,52,0.9)'; g.fillRect(x0 + TW - e * 0.7, y, e * 0.7, 3); }
      hg.fillStyle = '#7a7a7a'; hg.fillRect(x0 + TW - e, y, e, 3);
      g.fillStyle = 'rgba(120,118,110,0.35)'; g.fillRect(x0 + TW - e - 5, y, 5, 3);
    }
    const bounds = [x0 + 8, 8, x0 + TW - 14, TH - 4];
    if (k === 1) crack(g, hg, x0 + TW * (0.35 + R() * 0.3), 6, Math.PI / 2 + (R() - 0.5) * 0.3, TH * 0.9, R, bounds);
    if (k === 2) { crack(g, hg, x0 + 10, TH * (0.45 + R() * 0.2), (R() - 0.5) * 0.4, TW * 1.2, R, bounds); crack(g, hg, x0 + TW - 20, TH * 0.15, Math.PI * 0.8, 260, R, bounds); }
    if (k === 3) {
      crack(g, hg, x0 + TW * 0.1, TH * 0.3, 0.35, TW * 1.1, R, bounds);
      const px = x0 + TW * (0.35 + R() * 0.2), py = TH * (0.55 + R() * 0.15), pw = 90 + R() * 80, ph = 60 + R() * 70;
      // cement repair: a slightly darker, smoother irregular patch with a dark rim
      g.beginPath(); g.moveTo(px, py);
      for (let t = 0; t < 1; t += 0.1) g.lineTo(px + pw * t, py + (R() - 0.5) * 8);
      for (let t = 0; t < 1; t += 0.1) g.lineTo(px + pw + (R() - 0.5) * 8, py + ph * 2.2 * t);
      for (let t = 1; t > 0; t -= 0.1) g.lineTo(px + pw * t, py + ph * 2.2 + (R() - 0.5) * 8);
      g.closePath();
      g.fillStyle = 'rgba(150,149,143,0.7)'; g.fill(); g.strokeStyle = 'rgba(85,84,78,0.35)'; g.lineWidth = 1.5; g.stroke();
      blobs(g, px, py, pw, ph, 20, 4, 12, ['rgba(150,148,142,0.35)'], R);
    }
    // joints: transverse at v = 0, longitudinal at u = 0 (tar-filled, ~2 cm), grass in a few places
    for (let x = x0; x < x0 + TW; x += 4) { const j = 4 + R() * 2.5; g.fillStyle = 'rgba(34,33,30,0.95)'; g.fillRect(x, 0, 4, j); hg.fillStyle = '#303030'; hg.fillRect(x, 0, 4, j + 1); if (R() < 0.05) { g.fillStyle = 'rgba(70,92,45,0.9)'; g.fillRect(x, 0, 4, j + 2); } }
    for (let y = 0; y < TH; y += 4) { const j = 3 + R() * 2; g.fillStyle = 'rgba(34,33,30,0.95)'; g.fillRect(x0, y, j, 4); hg.fillStyle = '#303030'; hg.fillRect(x0, y, j + 1, 4); }
    g.fillStyle = 'rgba(140,138,132,0.25)'; g.fillRect(x0, 6, TW, 3); g.fillRect(x0 + 5, 0, 3, TH);   // chipped arrises
  }
  grain(g, 4 * TW, TH, 16, R);
  // plain concrete (junction, driveway, footpath) and the footpath slabs (1 m x 2 m, joint at v = 0)
  const plain = canvas(512, 512), pg = plain.getContext('2d');
  pg.fillStyle = 'rgb(168,167,162)'; pg.fillRect(0, 0, 512, 512);
  blobs(pg, 0, 0, 512, 512, 140, 20, 90, ['rgba(120,118,110,0.07)', 'rgba(205,204,198,0.08)', 'rgba(100,98,92,0.05)'], R);
  for (let i = 0; i < 1400; i++) { pg.fillStyle = R() < 0.5 ? 'rgba(90,88,82,0.35)' : 'rgba(215,214,208,0.35)'; pg.fillRect(R() * 512, R() * 512, 1.5, 1.5); }
  grain(pg, 512, 512, 14, R);
  const path = canvas(256, 512), wg = path.getContext('2d');
  wg.drawImage(plain, 0, 0, 256, 512, 0, 0, 256, 512);
  wg.fillStyle = 'rgba(38,36,32,0.9)'; wg.fillRect(0, 0, 256, 4);
  for (let y = 0; y < 512; y += 4) { const e = 3 + R() * 6; wg.fillStyle = 'rgba(96,88,70,0.7)'; wg.fillRect(0, y, e, 4); wg.fillRect(256 - e, y, e, 4); }
  crackSmall(wg, canvas(1, 1).getContext('2d'), 30 + R() * 190, 10, 1.4, 300, R, [0, 0, 256, 512]);
  // welded mesh panel, 2.5 m x 1.53 m: 5 cm x 20 cm wires, two V folds
  const mesh = canvas(512, 320), mg = mesh.getContext('2d');
  mg.clearRect(0, 0, 512, 320); mg.fillStyle = '#c7cbcd';
  for (let x = 2; x < 512; x += 10.24) mg.fillRect(x, 0, 2, 320);
  for (let y = 4; y < 320; y += 41) mg.fillRect(0, y, 512, 2);
  for (const y of [70, 76, 214, 220]) mg.fillRect(0, y, 512, 3);
  mg.fillRect(0, 0, 512, 3); mg.fillRect(0, 316, 512, 4);
  // weathered dark plank fence, 2.5 m x 1.8 m: 12 cm boards, 1.5 cm gaps
  const planks = canvas(512, 368), kg = planks.getContext('2d');
  kg.clearRect(0, 0, 512, 368);
  for (let x = 0, b = 0; x < 512; x += 27.6, b++) {
    const tone = 58 + R() * 18, w = 24.5, top = R() * 5;
    kg.fillStyle = `rgb(${tone + 8},${tone - 6},${tone - 18})`; kg.fillRect(x, top, w, 368 - top);
    for (let i = 0; i < 14; i++) { kg.strokeStyle = `rgba(${R() < 0.5 ? '25,18,12' : '120,100,80'},0.25)`; kg.lineWidth = 1; kg.beginPath(); const gx = x + 2 + R() * (w - 4); kg.moveTo(gx, top); kg.bezierCurveTo(gx + R() * 4 - 2, 120, gx + R() * 4 - 2, 250, gx + R() * 3 - 1.5, 368); kg.stroke(); }
    kg.fillStyle = 'rgba(160,150,135,0.18)'; kg.fillRect(x, top, w, 3);
    kg.fillStyle = 'rgba(40,30,20,0.6)'; for (const y of [60, 300]) { kg.beginPath(); kg.arc(x + w / 2, y, 2, 0, 7); kg.fill(); }
  }
  // tall grass and weeds (alpha), house number, foliage
  const weeds = canvas(256, 256), eg = weeds.getContext('2d');
  eg.clearRect(0, 0, 256, 256);
  // tapered blades rising from a loose base, a few seed heads; gaps everywhere so the cards never read as blocks
  for (let i = 0; i < 70; i++) {
    const x = 18 + R() * 220, h = 70 + R() * 180, lean = (R() - 0.5) * 90, w = 2 + R() * 3.5, dry = R();
    eg.fillStyle = dry < 0.3 ? `rgb(${150 + R() * 45},${140 + R() * 35},${82 + R() * 25})` : `rgb(${58 + R() * 45},${92 + R() * 50},${32 + R() * 25})`;
    const tx = x + lean, ty = 256 - h, cx = x + lean * 0.25, cy = 256 - h * 0.55;
    eg.beginPath(); eg.moveTo(x - w, 256); eg.quadraticCurveTo(cx - w * 0.6, cy, tx, ty); eg.quadraticCurveTo(cx + w * 0.6, cy, x + w, 256); eg.closePath(); eg.fill();
    if (R() < 0.15) { eg.fillStyle = 'rgba(186,170,118,0.95)'; eg.beginPath(); eg.ellipse(tx, ty + 6, 2.5, 8, lean * 0.008, 0, 7); eg.fill(); }
  }
  const plate = canvas(256, 104), ng = plate.getContext('2d');
  ng.fillStyle = '#f3f3f0'; ng.fillRect(0, 0, 256, 104); ng.strokeStyle = '#2b4f8c'; ng.lineWidth = 6; ng.strokeRect(6, 6, 244, 92);
  ng.fillStyle = '#1d1d1d'; ng.font = 'bold 72px Arial'; ng.textAlign = 'center'; ng.textBaseline = 'middle'; ng.fillText('857', 128, 56);
  const leaves = canvas(256, 256), lg = leaves.getContext('2d');
  lg.fillStyle = '#2f4a22'; lg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { const t = R(); lg.fillStyle = `rgb(${40 + t * 60},${70 + t * 70},${25 + t * 30})`; lg.beginPath(); lg.ellipse(R() * 256, R() * 256, 4 + R() * 5, 2 + R() * 3, R() * 3, 0, 7); lg.fill(); }
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const off = (m, u) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: u });
  const plainT = tex(plain, { repeat: true }), plainN = tex(normalFromCanvas(plain, 1.2, 512), { repeat: true, srgb: false });
  const weedMat = addWind(std({ map: tex(weeds), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 }), 0.12, 1.6);
  MT = {
    slab: off(std({ map: tex(slab), normalMap: tex(normalFromCanvas(hmap, 3.5, 2048), { srgb: false }), roughness: 0.9, color: 0xb9b8b3 }), -8),
    plain: off(std({ map: plainT, normalMap: plainN, roughness: 0.9, color: 0xb9b8b3 }), -7),
    walk: std({ map: tex(path, { repeat: true }), normalMap: plainN, roughness: 0.9, color: 0xc6c5c0 }),
    edge: std({ map: plainT, roughness: 0.92, color: 0xb9b8b2 }),
    soil: off(std({ map: M.soil.map, normalMap: M.soil.normalMap, roughness: 1, color: 0xb9ae96 }), -4),
    mesh: std({ map: tex(mesh), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6 }),
    planks: std({ map: tex(planks), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }),
    iron: std({ color: 0x3a3d41, roughness: 0.5, metalness: 0.5 }),
    tips: std({ color: 0xd8d8d2, roughness: 0.4, metalness: 0.6 }),
    base: std({ map: plainT, roughness: 0.95, color: 0xcfcdc6 }),
    plate: std({ map: tex(plate), roughness: 0.5 }),
    weeds: weedMat,
    leaves: addWind(std({ map: tex(leaves, { repeat: true }), roughness: 0.9 }), 0.05, 1.2),
    lime: std({ color: 0xf1f0ea, roughness: 1 }),
    shedWood: std({ map: tex(planks), roughness: 0.95, color: 0xb9a590 }),
    rustSheet: std({ map: M.roofMetalBrown?.map ?? null, roughness: 0.7, metalness: 0.3, color: 0x8a5a3e, side: THREE.DoubleSide }),
  };
  return MT;
}

// ------------------------------------------------------------------ geometry helpers
export function boxAt(list, cx, cy, cz, sx, sy, sz, rotY = 0) { const g = new THREE.BoxGeometry(sx, sy, sz); g.rotateY(rotY); g.translate(cx, cy, cz); list.push(g); }
export function cyl(list, x, y0, z, h, r0, r1 = r0, seg = 8) { const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(x, y0 + h / 2, z); list.push(g); }
export function tube(list, p, q, r, seg = 6) {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2); list.push(g);
}
export function catenary(out, p, q, sag, n = 8) {
  let prev = p;
  for (let k = 1; k <= n; k++) {
    const t = k / n, c = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - sag * 4 * t * (1 - t), p[2] + (q[2] - p[2]) * t];
    out.push(prev[0], prev[1], prev[2], c[0], c[1], c[2]); prev = c;
  }
}
// draped polygon (triangulated, split to < maxEdge), world-space UVs
export function drape(acc, P, lift, maxEdge = 2, tile = 3) {
  const faces = THREE.ShapeUtils.triangulateShape(P.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const emit = (a, b, c) => {
    const l = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
    if (l > maxEdge) {
      const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      emit(a, ab, ca); emit(ab, b, bc); emit(ca, bc, c); emit(ab, bc, ca); return;
    }
    const V = [a, b, c].map(([x, z]) => [x, heightAt(x, z) + lift, z]);
    acc.quad(V[0], V[1], V[2], V[0], UP, [a[0] / tile, a[1] / tile, b[0] / tile, b[1] / tile, c[0] / tile, c[1] / tile, a[0] / tile, a[1] / tile]);
  };
  for (const [i, j, k] of faces) emit(P[i], P[j], P[k]);
}
// crossed billboard quads (weeds)
export function tuft(acc, x, y, z, w, h, a) {
  for (const d of [0, Math.PI / 2]) {
    const cx = Math.cos(a + d) * w / 2, cz = Math.sin(a + d) * w / 2;
    acc.quad([x - cx, y - 0.05, z - cz], [x + cx, y - 0.05, z + cz], [x + cx, y + h, z + cz], [x - cx, y + h, z - cz], [-Math.sin(a + d), 0, Math.cos(a + d)], [0, 0, 1, 0, 1, 1, 0, 1]);
  }
}

// ------------------------------------------------------------------ build
export function buildPitigaia(B, world) {
  if (!STORE.M) return null;
  const Mt = mats(), F = frame(STORE.M), FSd = frame(STORE.side), sJ = STORE.sJ;
  // local frame: s from the OSM vertex nearest the photos (negative up the street to the south-west), o to the right
  // of the direction of increasing s (south-east positive)
  const at = (s) => F.at(s + sJ), W = (s, o) => { const q = F.at(s + sJ), [ux, uz] = F.dir(s + sJ); return [q.x - uz * o, q.z + ux * o]; };
  const dirAt = (s) => F.dir(s + sJ);
  const sMin = -sJ, sMax = F.L - sJ;
  const loc = (x, z) => { const l = F.local(x, z); return l ? { s: l.s - sJ, o: l.o, d: l.d } : null; };
  const A = { slab: new Acc(), plain: new Acc(), walk: new Acc(), edge: new Acc(), soil: new Acc(), mesh: new Acc(), planks: new Acc(), weeds: new Acc(), plate: new Acc(), shed: new Acc(), sheet: new Acc() };
  const G = { iron: [], tips: [], base: [], galv: [], gas: [], meter: [], wood: [], bark: [], lime: [], leaves: [], black: [] };
  const wires = [];
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const Y = (x, z) => heightAt(x, z);
  const R = rng(857);

  // ---- no forest or scattered trees on the carriageway, verges and footpath; grass on the verges
  for (let s = sMin; s < sMax; s += 8) {
    const [ux, uz] = dirAt(s + 4), c = W(s + 4, -0.9);
    addHole(c, 4.4, HW + 2.4, ux, uz, { lawn: true });
  }
  for (let t = 0; t < SIDE_LEN; t += 8) { const q = FSd.at(t + 4); addHole([q.x, q.z], 4.4, SIDE_HW + 0.8, q.ux, q.uz, { lawn: true }); }

  // ---- the concrete slabs: two rows, transverse joints every 4.3-5.7 m, 1 m strips following the ground
  const slabRow = (Fr, s0, s1, hw, seed, sOff = 0) => {
    let s = s0, k = 0;
    while (s < s1 - 0.3) {
      const L = Math.min(s1 - s, 4.3 + 1.4 * hash(k + seed, 3.7)), n = Math.max(1, Math.ceil(L / 1.0));
      for (const side of [-1, 1]) {
        const v = hash(k * 1.7 + seed, side), variant = v < 0.52 ? 0 : v < 0.7 ? 1 : v < 0.87 ? 2 : 3;
        const U = (u) => (variant + 0.004 + 0.992 * u) / 4;
        for (let i = 0; i < n; i++) {
          const sa = s + L * i / n, sb = s + L * (i + 1) / n;
          for (let j = 0; j < 2; j++) {
            const oa = side * hw * j / 2, ob = side * hw * (j + 1) / 2;
            const p = (ss, oo) => { const q = Fr.at(ss + sOff), [ux, uz] = Fr.dir(ss + sOff), x = q.x - uz * oo, z = q.z + ux * oo; return [x, Y(x, z) + 0.035, z]; };
            A.slab.quad(p(sa, oa), p(sb, oa), p(sb, ob), p(sa, ob), UP, [U(j / 2), i / n, U(j / 2), (i + 1) / n, U((j + 1) / 2), (i + 1) / n, U((j + 1) / 2), i / n]);
          }
        }
      }
      s += L; k++;
    }
  };
  slabRow(F, sMin, sMax, HW, 11, sJ);
  slabRow(FSd, HW - 0.4, SIDE_LEN, SIDE_HW, 29, 0);
  // soil at the crumbled edges
  const edgeStrip = (Fr, s0, s1, o0, o1, sOff = 0, skip = () => false) => {
    for (let s = s0; s < s1 - 1e-6; s += 1) {
      if (skip(s + 0.5)) continue;
      const p = (ss, oo) => { const q = Fr.at(ss + sOff), [ux, uz] = Fr.dir(ss + sOff), x = q.x - uz * oo, z = q.z + ux * oo; return [x, Y(x, z) + 0.02, z]; };
      A.soil.quad(p(s, o0), p(s + 1, o0), p(s + 1, o1), p(s, o1), UP, [0, s / 2, 0.3, (s + 1) / 2, 0.3, (s + 1) / 2, 0, s / 2]);
    }
  };
  const nearJ = (s) => Math.abs(s) < 9;
  // (south-east only: on the north-west side the grass reaches the concrete, photo 40)
  edgeStrip(F, sMin + 2, sMax - 2, HW - 0.03, HW + 0.14, sJ, (s) => nearJ(s) || (s > DRIVE.s0 && s < DRIVE.s1));
  edgeStrip(FSd, HW + 3, SIDE_LEN - 1, SIDE_HW - 0.03, SIDE_HW + 0.12);
  edgeStrip(FSd, HW + 3, SIDE_LEN - 1, -SIDE_HW + 0.03, -SIDE_HW - 0.12);

  // ---- the junction: the lane's mouth widened with curbless fillets (aerial imagery)
  {
    const E = [FSd.P[0][0], FSd.P[0][1]], sE = loc(...E).s;
    const q0 = FSd.at(0), q1 = FSd.at(9), sdir = [q1.x - q0.x, q1.z - q0.z], sl = Math.hypot(...sdir), su = [sdir[0] / sl, sdir[1] / sl], sn = [-su[1], su[0]];
    const sideEdge = (t, o) => { const q = FSd.at(t); return [q.x + sn[0] * o, q.z + sn[1] * o]; };
    for (const [sm, sgn] of [[sE - 8, 1], [sE + 8, -1]]) {
      // which lane edge faces this corner
      const pm = W(sm, HW), a1 = sideEdge(7, SIDE_HW), a2 = sideEdge(7, -SIDE_HW);
      const pe = Math.hypot(a1[0] - pm[0], a1[1] - pm[1]) < Math.hypot(a2[0] - pm[0], a2[1] - pm[1]) ? a1 : a2;
      const corner = W(sE + sgn * -1.5, HW + 1.2), curve = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8, m = (1 - t) * (1 - t), n2 = 2 * t * (1 - t), l = t * t; curve.push([m * pm[0] + n2 * corner[0] + l * pe[0], m * pm[1] + n2 * corner[1] + l * pe[1]]); }
      const poly = [W(sm, 0), ...curve, [FSd.at(7).x, FSd.at(7).z], E];
      drape(A.plain, poly, 0.03, 1.5, 3);
    }
  }

  // ---- north-west: grass strip, concrete footpath (1 m, raised 7 cm), aprons at the gates (photo 40)
  for (let s = WALK.s0; s < WALK.s1 - 1e-6; s += 1) {
    const s1 = Math.min(WALK.s1, s + 1), [ux, uz] = dirAt(s + 0.5);
    const a0 = W(s, -WALK.o0), b0 = W(s1, -WALK.o0), a1 = W(s, -WALK.o1), b1 = W(s1, -WALK.o1);
    const ya0 = Y(...a0) + WALK.h, yb0 = Y(...b0) + WALK.h, ya1 = Y(...a1) + WALK.h, yb1 = Y(...b1) + WALK.h;
    A.walk.quad([a0[0], ya0, a0[1]], [b0[0], yb0, b0[1]], [b1[0], yb1, b1[1]], [a1[0], ya1, a1[1]], UP, [0, s / 2, 0, s1 / 2, 1, s1 / 2, 1, s / 2]);
    A.edge.quad([a0[0], ya0 - 0.12, a0[1]], [b0[0], yb0 - 0.12, b0[1]], [b0[0], yb0, b0[1]], [a0[0], ya0, a0[1]], [-uz, 0, ux], [s / 2, 0, s1 / 2, 0, s1 / 2, 0.05, s / 2, 0.05]);
  }
  for (const [sa, sb] of APRONS) {
    const poly = [W(sa, -HW + 0.1), W(sb, -HW + 0.1), W(sb, -WALK.o0 - 0.05), W(sa, -WALK.o0 - 0.05)];
    drape(A.plain, poly, 0.045, 1, 2.5);
  }
  const walkAt = (x, z) => {
    const l = loc(x, z);
    if (!l) return null;
    if (l.s > WALK.s0 && l.s < WALK.s1 && -l.o >= WALK.o0 && -l.o <= WALK.o1) return Y(x, z) + WALK.h;
    return null;
  };

  // ---- north-west fences: iron spear fence of no. 857 with gate, wicket and number; gas cabinet; plank fence
  const fenceSeg = (s0, s1, o) => { const a = W(s0, o), b = W(s1, o); return { a, b, L: Math.hypot(b[0] - a[0], b[1] - a[1]), rot: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; };
  {
    const H = 1.55, baseH = 0.28;
    const spans = [[IRON.s0, IRON.gate[0]], [IRON.gate[1], IRON.wicket[0]], [IRON.wicket[1], IRON.s1]];
    // concrete base under the whole run (gates stand on it)
    for (let s = IRON.s0; s < IRON.s1 - 1e-6; s += 2) {
      const s1 = Math.min(IRON.s1, s + 2), f = fenceSeg(s, s1, NW_FENCE), y = Math.min(Y(...f.a), Y(...f.b));
      boxAt(G.base, (f.a[0] + f.b[0]) / 2, y + baseH / 2 - 0.1, (f.a[1] + f.b[1]) / 2, f.L + 0.02, baseH + 0.2, 0.22, -f.ang);
    }
    const bars = (s0, s1, y0f, h, withTips = true) => {
      const f = fenceSeg(s0, s1, NW_FENCE), n = Math.max(1, Math.round(f.L / 0.13));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = f.a[0] + (f.b[0] - f.a[0]) * t, z = f.a[1] + (f.b[1] - f.a[1]) * t, y = y0f(x, z);
        boxAt(G.iron, x, y + h / 2, z, 0.018, h, 0.018, -f.ang);
        if (withTips) { const c = new THREE.ConeGeometry(0.026, 0.09, 4); c.rotateY(Math.PI / 4 - f.ang); c.translate(x, y + h + 0.045, z); G.tips.push(c); }
      }
      for (const hr of [0.12, h - 0.14]) {
        const ya = y0f(...f.a) + hr, yb = y0f(...f.b) + hr;
        tube(G.iron, [f.a[0], ya, f.a[1]], [f.b[0], yb, f.b[1]], 0.018, 4);
      }
      return f;
    };
    const yb = (x, z) => Y(x, z) + baseH - 0.1;
    for (const [a, b] of spans) {
      const f = bars(a, b, yb, H);
      box((f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2, f.L / 2, 0.1, f.rot, Y(...f.a) - 1, Y(...f.a) + H + 0.3, 'fence');
    }
    // gate leaves and the wicket: same bars in a frame, a little lower
    for (const [a, b] of [[IRON.gate[0] + 0.05, (IRON.gate[0] + IRON.gate[1]) / 2 - 0.02], [(IRON.gate[0] + IRON.gate[1]) / 2 + 0.02, IRON.gate[1] - 0.05], [IRON.wicket[0] + 0.05, IRON.wicket[1] - 0.05]]) {
      const f = bars(a, b, yb, H - 0.05);
      for (const [p, q] of [[f.a, f.a], [f.b, f.b]]) tube(G.iron, [p[0], yb(...p), p[1]], [q[0], yb(...q) + H - 0.05, q[1]], 0.022, 4);
      box((f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2, f.L / 2, 0.08, f.rot, Y(...f.a) - 1, Y(...f.a) + H, 'gate');
    }
    // posts (80 mm) at the ends, the gates and every ~2.4 m, with caps
    const posts = new Set([IRON.s0, IRON.s1, ...IRON.gate, ...IRON.wicket]);
    for (const [a, b] of spans) { const n = Math.max(1, Math.round((b - a) / 2.4)); for (let i = 1; i < n; i++) posts.add(a + (b - a) * i / n); }
    for (const s of posts) {
      const [x, z] = W(s, NW_FENCE), y = Y(x, z), ang = Math.atan2(...dirAt(s).slice().reverse());
      boxAt(G.iron, x, y + (H + 0.25) / 2, z, 0.08, H + 0.25, 0.08, -ang);
      boxAt(G.tips, x, y + H + 0.27, z, 0.11, 0.04, 0.11, -ang);
    }
    // house number on the post right of the wicket (photo 40)
    {
      // facing the street (+o); seen from there +s runs to the right
      const s = IRON.wicket[1] + 0.02, [x, z] = W(s, NW_FENCE + 0.06), y = Y(x, z) + 1.25, [ux, uz] = dirAt(s);
      const w = 0.3, h = 0.12;
      A.plate.quad([x - ux * w / 2, y - h / 2, z - uz * w / 2], [x + ux * w / 2, y - h / 2, z + uz * w / 2], [x + ux * w / 2, y + h / 2, z + uz * w / 2], [x - ux * w / 2, y + h / 2, z - uz * w / 2], [-uz, 0, ux], [0, 0, 1, 0, 1, 1, 0, 1]);
    }
  }
  // yellow gas regulator cabinet at the lot boundary, riser into the ground and pipe into the yard
  {
    const s = -25.0, [x, z] = W(s, NW_FENCE + 0.22), y = Y(x, z), [ux, uz] = dirAt(s), ang = Math.atan2(uz, ux);
    boxAt(G.base, x, y + 0.1, z, 0.55, 0.3, 0.4, -ang);
    boxAt(G.gas, x, y + 0.25 + 0.5, z, 0.46, 1.0, 0.3, -ang);
    boxAt(G.black, x + uz * -0.151, y + 0.95, z - ux * -0.151, 0.1, 0.03, 0.01, -ang);
    const pb = W(s, NW_FENCE - 0.4);
    tube(G.gas, [x, y + 0.3, z], [x, y - 0.3, z], 0.03);
    tube(G.gas, [x, y + 1.05, z], [pb[0], Y(...pb) + 1.05, pb[1]], 0.025);
    tube(G.gas, [pb[0], Y(...pb) + 1.05, pb[1]], [pb[0], Y(...pb) + 0.2, pb[1]], 0.025);
    box(x, z, 0.28, 0.2, Math.atan2(-uz, ux), y - 1, y + 1.3, 'gas');
  }
  // dark plank fence on wooden posts
  {
    const H = 1.8;
    for (let s = PLANK.s0; s < PLANK.s1 - 1e-6; s += 2.5) {
      const s1 = Math.min(PLANK.s1, s + 2.5), f = fenceSeg(s, s1, NW_FENCE), ya = Y(...f.a), yb2 = Y(...f.b);
      A.planks.quad([f.a[0], ya - 0.05, f.a[1]], [f.b[0], yb2 - 0.05, f.b[1]], [f.b[0], yb2 + H, f.b[1]], [f.a[0], ya + H, f.a[1]], [Math.sin(f.ang), 0, -Math.cos(f.ang)], [0, 0, (s1 - s) / 2.5, 0, (s1 - s) / 2.5, 1, 0, 1]);
      const [px, pz] = W(s, NW_FENCE - 0.07); boxAt(G.wood, px, ya + 0.95, pz, 0.1, 2.0, 0.1, -f.ang);
      for (const hr of [0.35, 1.45]) tube(G.wood, [f.a[0] + Math.sin(f.ang) * 0.05, ya + hr, f.a[1] - Math.cos(f.ang) * 0.05], [f.b[0] + Math.sin(f.ang) * 0.05, yb2 + hr, f.b[1] - Math.cos(f.ang) * 0.05], 0.035, 4);
      box((f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2, f.L / 2, 0.08, f.rot, ya - 1, ya + H, 'fence');
    }
  }
  // bushes behind the fences and over them, a tree with a lime-washed trunk at the edge of the grass strip (photo 40)
  const bush = (x, y, z, r, sy = 0.8) => { const g = new THREE.IcosahedronGeometry(r, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const f = 1 + 0.12 * Math.sin(p.getX(i) * 7 + p.getY(i) * 5) + 0.08 * Math.sin(p.getZ(i) * 9); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * sy, p.getZ(i) * f); } g.computeVertexNormals(); g.translate(x, y + r * sy * 0.8, z); G.leaves.push(g); };
  for (let s = -45; s < -3; s += 2.2 + R() * 2.5) { const o = NW_FENCE - 0.9 - R() * 2.2, [x, z] = W(s, o); bush(x, Y(x, z), z, 0.8 + R() * 0.9); }
  for (const s of [-6.5, -33, -40.5]) { const [x, z] = W(s, NW_FENCE - 0.35); bush(x, Y(x, z) + 1.2, z, 0.75, 0.9); }
  {
    const s = -49, [x, z] = W(s, -HW - 0.45), y = Y(x, z);
    cyl(G.bark, x, y - 0.2, z, 4.2, 0.2, 0.15, 9);
    cyl(G.lime, x, y - 0.2, z, 1.35, 0.215, 0.2, 9);
    for (let k = 0; k < 7; k++) { const a = k * 0.9, r = 1.6 + R() * 0.8; bush(x + Math.cos(a) * 1.6, y + 3.4 + R() * 1.4, z + Math.sin(a) * 1.6, r, 0.75); }
    bush(x, y + 5.0, z, 2.2, 0.7);
    box(x, z, 0.22, 0.22, 0, y - 1, y + 4, 'tree');
  }

  // ---- south-east: weedy ditch (terrain rebuilt at 1 m), driveway over it, welded mesh panels with a gate
  {
    const poly = [W(DRIVE.s0, HW - 0.1), W(DRIVE.s1, HW - 0.1), W(DRIVE.s1 + 0.4, SE_FENCE - 0.05), W(DRIVE.s0 - 0.4, SE_FENCE - 0.05)];
    drape(A.plain, poly, 0.06, 1, 2.5);
    // the culvert pipe under the driveway, its mouths showing in the ditch's ends
    const a = W(DRIVE.s0 - 0.35, DITCH.o), b = W(DRIVE.s1 + 0.35, DITCH.o), ya = Y(...W(DRIVE.s0 + 0.5, DITCH.o)) - 0.22, yb2 = Y(...W(DRIVE.s1 - 0.5, DITCH.o)) - 0.22;
    tube(G.base, [a[0], ya, a[1]], [b[0], yb2, b[1]], 0.24, 12);
    const [ux, uz] = dirAt((DRIVE.s0 + DRIVE.s1) / 2);
    for (const [p, y, sg] of [[a, ya, -1], [b, yb2, 1]]) {
      const d = new THREE.CircleGeometry(0.2, 12); d.rotateY(Math.atan2(ux * sg, uz * sg)); d.translate(p[0] - ux * sg * 0.02, y, p[1] - uz * sg * 0.02); G.black.push(d);
    }
  }
  const driveAt = (x, z) => { const l = loc(x, z); return l && l.s > DRIVE.s0 && l.s < DRIVE.s1 && l.o > HW && l.o < SE_FENCE ? Y(x, z) + 0.06 : null; };
  {
    const H = 1.53, gate = [DRIVE.s0 - 0.3, DRIVE.s1 + 0.3];
    const runs = [[MESH.s0, gate[0]], [gate[1], MESH.s1]];
    for (const [ra, rb] of runs) {
      for (let s = ra; s < rb - 1e-6; s += 2.5) {
        const s1 = Math.min(rb, s + 2.5), f = fenceSeg(s, s1, SE_FENCE), ya = Y(...f.a), yb2 = Y(...f.b);
        A.mesh.quad([f.a[0], ya + 0.04, f.a[1]], [f.b[0], yb2 + 0.04, f.b[1]], [f.b[0], yb2 + 0.04 + H, f.b[1]], [f.a[0], ya + 0.04 + H, f.a[1]], [Math.sin(f.ang), 0, -Math.cos(f.ang)], [0, 0, (s1 - s) / 2.5, 0, (s1 - s) / 2.5, 1, 0, 1]);
        boxAt(G.galv, f.a[0], ya + 0.8, f.a[1], 0.06, 1.8, 0.04, -f.ang);
        box((f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2, f.L / 2, 0.06, f.rot, ya - 1, ya + H, 'fence');
      }
      const [ex, ez] = W(rb, SE_FENCE); boxAt(G.galv, ex, Y(ex, ez) + 0.8, ez, 0.06, 1.8, 0.04, -fenceSeg(ra, rb, SE_FENCE).ang);
    }
    // two mesh leaves in 40 mm frames
    for (const [a, b] of [[gate[0] + 0.05, (gate[0] + gate[1]) / 2 - 0.02], [(gate[0] + gate[1]) / 2 + 0.02, gate[1] - 0.05]]) {
      const f = fenceSeg(a, b, SE_FENCE), ya = Y(...f.a) + 0.08, yb2 = Y(...f.b) + 0.08;
      A.mesh.quad([f.a[0], ya, f.a[1]], [f.b[0], yb2, f.b[1]], [f.b[0], yb2 + H, f.b[1]], [f.a[0], ya + H, f.a[1]], [Math.sin(f.ang), 0, -Math.cos(f.ang)], [0, 0, f.L / 2.5, 0, f.L / 2.5, 1, 0, 1]);
      for (const hr of [0, H]) tube(G.galv, [f.a[0], ya + hr, f.a[1]], [f.b[0], yb2 + hr, f.b[1]], 0.02, 4);
      for (const p of [f.a, f.b]) tube(G.galv, [p[0], Y(...p) + 0.08, p[1]], [p[0], Y(...p) + 0.08 + H, p[1]], 0.02, 4);
      box((f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2, f.L / 2, 0.06, f.rot, Y(...f.a) - 1, Y(...f.a) + H, 'gate');
    }
  }
  // electricity meter box on a post by the corner (photo 41)
  {
    // (the box on the street side of its post: -o)
    const s = -7.2, [x, z] = W(s, SE_FENCE - 0.35), y = Y(x, z), [ux, uz] = dirAt(s), ang = Math.atan2(uz, ux);
    boxAt(G.galv, x, y + 0.7, z, 0.07, 1.6, 0.07, -ang);
    boxAt(G.meter, x + uz * 0.13, y + 1.25, z - ux * 0.13, 0.42, 0.62, 0.2, -ang);
    boxAt(G.black, x + uz * 0.235, y + 1.25, z - ux * 0.235, 0.18, 0.14, 0.01, -ang);
    tube(G.black, [x, y + 0.94, z], [x, y - 0.2, z], 0.02, 5);
    box(x, z, 0.25, 0.2, Math.atan2(-uz, ux), y - 1, y + 1.6, 'meter');
  }
  // the old house's wooden shed with a rusty corrugated roof (photo 41), in the yard of no. 892
  {
    const hb = GEO.buildings.find(b => String(b.id) === '265195027');
    if (hb) {
      const hp = pairs(hb.p), hc = [hp.reduce((a, p) => a + p[0], 0) / hp.length, hp.reduce((a, p) => a + p[1], 0) / hp.length], lh = loc(...hc);
      if (lh) {
        const s = lh.s + 5.8, o = Math.max(SE_FENCE + 2.0, lh.o - 1.0), [cx, cz] = W(s, o), y = Y(cx, cz), [ux, uz] = dirAt(s);
        const hx = 1.5, hz = 1.25, H0 = 2.2, H1 = 2.6;
        const C = (a, b) => [cx + ux * a - uz * b, cz + uz * a + ux * b];
        const c = [C(-hx, -hz), C(hx, -hz), C(hx, hz), C(-hx, hz)], hs = [H1, H1, H0, H0];
        for (let k = 0; k < 4; k++) {
          const p = c[k], q = c[(k + 1) % 4], mx = (p[0] + q[0]) / 2 - cx, mz = (p[1] + q[1]) / 2 - cz;
          A.shed.quad([p[0], y - 0.1, p[1]], [q[0], y - 0.1, q[1]], [q[0], y + hs[(k + 1) % 4], q[1]], [p[0], y + hs[k], p[1]], [mx, 0, mz], [0, 0, 1.2, 0, 1.2, hs[(k + 1) % 4] / 1.8, 0, hs[k] / 1.8]);
        }
        const r0 = C(-hx - 0.3, -hz - 0.35), r1 = C(hx + 0.3, -hz - 0.35), r2 = C(hx + 0.3, hz + 0.35), r3 = C(-hx - 0.3, hz + 0.35);
        A.sheet.quad([r0[0], y + H1 + 0.05, r0[1]], [r1[0], y + H1 + 0.05, r1[1]], [r2[0], y + H0 - 0.05, r2[1]], [r3[0], y + H0 - 0.05, r3[1]], UP, [0, 0, 3.6, 0, 3.6, 1.5, 0, 1.5]);
        box(cx, cz, hx, hz, Math.atan2(-uz, ux), y - 1, y + H1, 'shed');
      }
    }
  }

  // ---- weeds: in the ditch, along the fences and in the overgrown lot (photo 41)
  const weedAt = (s, o, h) => { const [x, z] = W(s, o); tuft(A.weeds, x, Y(x, z), z, 0.7 + R() * 0.6, h, R() * Math.PI); };
  for (let s = DITCH.s0 + 1; s < DITCH.s1 - 0.5; s += 0.55) if (s < DRIVE.s0 - 0.5 || s > DRIVE.s1 + 0.5) weedAt(s + R() * 0.3, DITCH.o + (R() - 0.5) * 1.3, 0.55 + R() * 0.7);
  for (let s = MESH.s0; s < MESH.s1; s += 0.8) if (s < DRIVE.s0 - 0.6 || s > DRIVE.s1 + 0.6) { weedAt(s, SE_FENCE - 0.25, 0.5 + R() * 0.6); weedAt(s + 0.3, SE_FENCE + 0.3, 0.7 + R() * 0.8); }
  {
    // the overgrown lot, minus the houses' footprints (and a margin)
    const [lx, lz] = W((MESH.s0 + MESH.s1) / 2, SE_FENCE + 8);
    const foot = GEO.buildings.map(b => pairs(b.p)).filter(q => q.some(p => Math.hypot(p[0] - lx, p[1] - lz) < 40));
    const inside = (x, z) => foot.some(q => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > z) !== (q[j][1] > z) && x < (q[j][0] - q[i][0]) * (z - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) c = !c; return c; });
    for (let k = 0; k < 420; k++) {
      const s = MESH.s0 + 2 + R() * (MESH.s1 - MESH.s0 - 3), o = SE_FENCE + 0.6 + R() * 13, [x, z] = W(s, o);
      if ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => inside(x + dx, z + dz))) continue;
      tuft(A.weeds, x, Y(x, z), z, 0.8 + R() * 0.7, 0.6 + R() * 0.9, R() * Math.PI);
    }
  }
  for (let s = WALK.s0; s < WALK.s1; s += 1.1) if (!APRONS.some(([a, b]) => s > a - 0.5 && s < b + 0.5)) weedAt(s, NW_FENCE + 0.12, 0.25 + R() * 0.35);
  for (let s = -60; s < -6; s += 1.4) if (!APRONS.some(([a, b]) => s > a - 0.5 && s < b + 0.5)) weedAt(s, -HW - 0.4, 0.18 + R() * 0.2);

  // ---- service drop: from the village pole across the street to a mast in the yard of no. 857 (photo 40)
  {
    let pole = null;
    for (const run of GEO.poles || []) for (const p of run.p) { const l = loc(p[0], p[1]); if (l && l.s > -30 && l.s < -8 && l.o > 0 && l.d < 8) pole = p; }
    const [mx, mz] = W(-18.5, NW_FENCE - 2.2), my = Y(mx, mz);
    cyl(G.galv, mx, my - 0.3, mz, 5.9, 0.045, 0.04, 8);
    boxAt(G.galv, mx, my + 5.55, mz, 0.3, 0.05, 0.05);
    if (pole) catenary(wires, [pole[0], Y(pole[0], pole[1]) + 8.3, pole[1]], [mx, my + 5.5, mz], 0.35, 10);
  }

  // ---- flush
  A.slab.flush(B, Mt.slab, null, { noCast: true }); A.plain.flush(B, Mt.plain, null, { noCast: true }); A.soil.flush(B, Mt.soil, null, { noCast: true });
  A.walk.flush(B, Mt.walk, null, { noCast: true }); A.edge.flush(B, Mt.edge, null, { noCast: true });
  // alpha-tested cards stay out of the AO pass (it would see the whole quads)
  A.mesh.flush(B, Mt.mesh, null, { noAO: true }); A.planks.flush(B, Mt.planks, null, { noAO: true }); A.plate.flush(B, Mt.plate, null, { noCast: true });
  A.weeds.flush(B, Mt.weeds, null, { noCast: true, noAO: true }); A.shed.flush(B, Mt.shedWood); A.sheet.flush(B, Mt.rustSheet);
  const put = (key, mat, opts) => { if (G[key].length) B.geo(mat, merged(G[key]), null, null, opts); };
  put('iron', Mt.iron); put('tips', Mt.tips); put('base', Mt.base); put('galv', M.galv); put('gas', M.gasPipe); put('meter', M.meterBox);
  put('wood', M.woodDark); put('bark', M.bark); put('lime', Mt.lime); put('leaves', Mt.leaves); put('black', M.blackMetal);

  const surface = (x, z) => walkAt(x, z) ?? driveAt(x, z);
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (let s = WALK.s0 - 2; s <= 2; s += 4) for (const o of [-WALK.o1 - 1, SE_FENCE + 1]) { const [x, z] = W(s, o); bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); }
  const pinL = loc(...PIN);
  return { type: 'pitigaia', name: 'Strada Pițigaia', W, at, dir: dirAt, pin: PIN, pinS: pinL.s, pinO: pinL.o, surface, bbox: bb, wires, ditch: DITCH, walk: WALK };
}
