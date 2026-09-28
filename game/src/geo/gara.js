import * as THREE from 'three';
import { GEO, heightAt, gridHeight, railHeightAt, addHole, addHolePoly, addFineZone } from './data.js';
import { Acc } from './bridge.js';
import { M, addWind } from '../materials.js';
import { normalFromCanvas } from '../textures.js';
import { rng } from '../util.js';
import { frame, canvas, tex, grain, blobs, boxAt, cyl, tube, drape, merged, pairs, road, clamp01 } from './pitigaia.js';

// Strada Gării (DJ100E) from the stadium to the station, from the user's photos 46-50, taken from a car:
//  * 46-47 (45.12911 N 25.71685 E): Parcul Triumf on the right with its sign, playground, globe lamps and mesh fence;
//    the building site on the left behind green mesh with the project board; the gate of Stadion Fortuna with its
//    four-pillar tower, the stone wall, the lime-washed trees and the paved mouth with its kerbed island
//  * 48 (45.12988 N 25.71492 E): the road under the railway: the stone retaining wall with graffiti and a locomotive on
//    the line above (terrain reshaped into a vertical step), lime-washed pines, the row of thujas, painted kerbs
//  * 49-50 (45.13241 N 25.71193 E): the square in front of Gara Câmpina: the kerbed island with the spruces (the OSM
//    trees), the no-entry signs, the lamp masts, the cars parked round it and along the streets, the station building
// Layout from OSM and aerial imagery (measurements only).
const RA = '325854129', RB = '12717442', LOOP = '303801956';
const P1 = [-702.1, -118.0], GATE = [-680.8, -105.3], BUS = [-660.4, -124.2];
const WALL = { s0: 322, s1: 468, o: 13.5 };      // retaining wall along Strada Gării (s on 12717442), photo 48
const LOCO = { rail: '183278860', x: -468.4, z: -172.9 };     // on the siding next to the wall, ~65 m ahead in photo 48
const STYLE = {
  '304012472': { wall: 'brickRed', levels: 2, roofMat: 'tiles', roof: 'tileRed' },        // Gara Câmpina (photo 49)
  '915376441': { wall: 'stuccoCream', roofMat: 'metalTile', roof: 'metalTileGreen' },    // stadium building (photo 47)
};
const UP = [0, 1, 0];

// ------------------------------------------------------------------ trees: replace the map's trees in some areas
function editTrees(remove, add) {
  const T = GEO.trees; if (!T) return;
  const keep = [];
  for (let i = 0; i < T.n; i++) if (!remove(T.x[i], T.z[i])) keep.push(i);
  const n = keep.length + add.length, x = new Float32Array(n), z = new Float32Array(n), t = new Uint8Array(n), s = new Float32Array(n);
  keep.forEach((i, k) => { x[k] = T.x[i]; z[k] = T.z[i]; t[k] = T.t[i]; s[k] = T.s[i]; });
  add.forEach(([ax, az, at, as], k) => { const j = keep.length + k; x[j] = ax; z[j] = az; t[j] = at; s[j] = as; });
  GEO.trees = { n, x, z, t, s };
}
const T_WALNUT = 4, T_SPRUCE = 2, T_HORNBEAM = 1, T_OAK = 0, T_LOMBARDY = 13, T_POPLAR = 14, T_YOUNGPINE = 15;   // trees.js TYPES

// ------------------------------------------------------------------ before the terrain
export function prepareGara() {
  const rb = road(RB);
  if (!rb) return false;
  for (const bd of GEO.buildings) { const st = STYLE[String(bd.id)]; if (st) bd.o = { ...(bd.o || {}), ...st }; }
  // the embankment of the railway ends in a vertical stone wall (photo 48): the terrain in front is kept at the
  // footway's level, behind it at the track bed's level (the 25 m DEM makes a slope of it)
  const F = frame(pairs(rb.p));
  const rs = railSide(F);
  // lower level: the DEM just off the footway; upper level: the DEM on the track bed (so the line keeps its height)
  const dem = (s, o) => gridHeight(GEO, ...Wf(F, s, rs * o));
  const lower = (s) => dem(s, 5);
  // the wall is at most ~3.2 m (photo 48); where the DEM's bed is higher, the top slopes up to the lines (which keep
  // the DEM's height: nothing is changed from 27 m out)
  const top = (s) => Math.min(Math.max((dem(s - 6, 28) + dem(s, 28) + dem(s + 6, 28)) / 3, lower(s) + 1.5), lower(s) + 3.2);
  const OW = WALL.o + 1.45, OR = 22, OX = 27;                                         // step just behind the face
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let s = WALL.s0 - 16; s <= WALL.s1 + 16; s += 2) for (const o of [2, OX + 6]) { const [x, z] = Wf(F, s, rs * o); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const k0 = F.S.findIndex(v => v > WALL.s0 - 40), k1 = F.S.findIndex(v => v > WALL.s1 + 40);   // -1: the road ends first
  const i0 = Math.max(0, k0 - 1), i1 = k1 < 0 ? F.P.length - 1 : Math.min(F.P.length - 1, k1 + 1);
  const lz = (x, z) => { const l = F.local(x, z, i0, i1); return l ? { s: l.s, o: l.o * rs } : null; };
  addFineZone({ x0, x1, z0, z1,
    test: (x, z) => { const l = lz(x, z); return !!l && l.s > WALL.s0 - 14 && l.s < WALL.s1 + 14 && l.o > 3 && l.o < OX + 1; },
    h: (x, z) => {
      const l = lz(x, z), g0 = gridHeight(GEO, x, z);
      if (!l) return g0;
      const e = clamp01(Math.min(l.s - WALL.s0 + 8, WALL.s1 + 8 - l.s) / 8);      // back to the DEM past the ends
      let h;
      if (l.o < OW) h = g0 + (lower(l.s) - g0) * clamp01((l.o - 5) / 2);
      else h = l.o < OR ? top(l.s) : top(l.s) + (g0 - top(l.s)) * clamp01((l.o - OR) / (OX - OR));
      return g0 + (h - g0) * e;
    } });
  STORE.lower = lower; STORE.top = top;
  STORE.rs = rs;
  // no generated lot fences / walls where the fronts are rebuilt from the photos (the park, the building site, the
  // stadium's mouth, the wall under the railway, the station square)
  const band = (Fr, s0, s1, oa, ob) => { const P = []; for (let t = s0; t <= s1; t += 5) P.push(Wf(Fr, t, oa)); for (let t = s1; t >= s0; t -= 5) P.push(Wf(Fr, t, ob)); return P; };
  const ra = road(RA);
  if (ra) addHolePoly(band(frame(pairs(ra.p)), 30, 195, -30, 12), { noFences: true, scatter: false });
  addHolePoly(band(F, WALL.s0 - 8, WALL.s1 + 8, -rs * 14, rs * 30), { noFences: true, scatter: false });
  addHolePoly(band(F, 0, 130, 28, -18), { noFences: true, scatter: false });
  return true;
}
const STORE = {};
const Wf = (F, s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
// the railway's side of Strada Gării at the wall (o sign)
function railSide(F) { return F.local(LOCO.x, LOCO.z).o >= 0 ? 1 : -1; }

// ------------------------------------------------------------------ materials
let MT = null;
function mats() {
  if (MT) return MT;
  const R = rng(4612);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const kerb = canvas(256, 64), kg = kerb.getContext('2d');
  kg.fillStyle = '#ecebe6'; kg.fillRect(0, 0, 128, 64); kg.fillStyle = '#2f3032'; kg.fillRect(128, 0, 128, 64);
  blobs(kg, 0, 0, 256, 64, 40, 4, 16, ['rgba(120,110,95,0.2)', 'rgba(60,60,55,0.2)'], R); grain(kg, 256, 64, 12, R);
  const grey = canvas(64, 64), gg = grey.getContext('2d'); gg.fillStyle = '#b9b7b1'; gg.fillRect(0, 0, 64, 64); grain(gg, 64, 64, 14, R);
  // stone retaining wall with graffiti (4 m x 3 m per tile)
  const wall = canvas(1024, 768), wg = wall.getContext('2d');
  // rough rubble masonry: irregular grey stones in dark joints, damp streaks down from the top
  wg.fillStyle = '#4f4e4a'; wg.fillRect(0, 0, 1024, 768);
  for (let row = 0, y = 0; y < 768; row++) {
    const h = 44 + R() * 36;
    for (let x = -R() * 60; x < 1024;) {
      const w = 60 + R() * 90, t = 118 + R() * 46, j = () => (R() - 0.5) * 10;
      wg.fillStyle = `rgb(${t},${t - 2},${t - 7})`; wg.beginPath();
      wg.moveTo(x + 4 + j(), y + 4 + j()); wg.lineTo(x + w - 4 + j(), y + 4 + j()); wg.lineTo(x + w - 3 + j(), y + h - 4 + j()); wg.lineTo(x + 5 + j(), y + h - 3 + j());
      wg.closePath(); wg.fill(); x += w;
    }
    y += h;
  }
  blobs(wg, 0, 0, 1024, 768, 110, 20, 130, ['rgba(55,57,50,0.16)', 'rgba(205,203,195,0.12)', 'rgba(70,80,58,0.14)'], R);
  for (let i = 0; i < 26; i++) { const x = R() * 1024, w = 8 + R() * 40, l = 150 + R() * 450, gr = wg.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(40,42,38,0.35)'); gr.addColorStop(1, 'rgba(40,42,38,0)'); wg.fillStyle = gr; wg.fillRect(x, 0, w, l); }
  grain(wg, 1024, 768, 14, R);
  // one graffiti piece (photo 48): outlined bubble letters, not a legible word
  const graf = canvas(1024, 384), fg = graf.getContext('2d');
  fg.clearRect(0, 0, 1024, 384); fg.lineJoin = 'round'; fg.lineCap = 'round';
  const blob = (cx, cy, rw, rh, a) => { fg.beginPath(); for (let k = 0; k <= 16; k++) { const t = k / 16 * Math.PI * 2, r = 1 + 0.18 * Math.sin(t * 3 + a); fg.lineTo(cx + Math.cos(t) * rw * r, cy + Math.sin(t) * rh * r); } fg.closePath(); };
  for (let k = 0; k < 4; k++) {
    const cx = 170 + k * 220 + (R() - 0.5) * 40, cy = 200 + (R() - 0.5) * 50, rw = 85 + R() * 25, rh = 120 + R() * 30;
    blob(cx, cy, rw, rh, k); fg.fillStyle = 'rgba(214,212,206,0.5)'; fg.fill(); fg.lineWidth = 14; fg.strokeStyle = 'rgba(30,31,34,0.85)'; fg.stroke();
    fg.lineWidth = 6; fg.strokeStyle = 'rgba(235,234,228,0.9)'; blob(cx, cy, rw * 0.55, rh * 0.5, k + 2); fg.stroke();
  }
  fg.lineWidth = 5; fg.strokeStyle = 'rgba(80,110,180,0.8)'; fg.beginPath(); fg.moveTo(80, 330); for (let x = 80; x < 950; x += 40) fg.quadraticCurveTo(x + 20, 300 + R() * 60, x + 40, 330); fg.stroke();
  const mesh = canvas(256, 256), mg = mesh.getContext('2d');
  mg.fillStyle = 'rgba(78,128,104,0.62)'; mg.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 4) { mg.fillStyle = 'rgba(30,50,40,0.3)'; mg.fillRect(x, 0, 1, 256); }
  for (let y = 0; y < 256; y += 4) { mg.fillStyle = 'rgba(30,50,40,0.3)'; mg.fillRect(0, y, 256, 1); }
  for (let i = 0; i < 30; i++) { mg.clearRect(R() * 256, R() * 256, 2 + R() * 6, 2 + R() * 6); }
  const wire = canvas(256, 128), rg = wire.getContext('2d');
  rg.clearRect(0, 0, 256, 128); rg.strokeStyle = '#8a8f93'; rg.lineWidth = 1.6;
  for (let x = -128; x < 256; x += 12) { rg.beginPath(); rg.moveTo(x, 0); rg.lineTo(x + 128, 128); rg.stroke(); rg.beginPath(); rg.moveTo(x + 128, 0); rg.lineTo(x, 128); rg.stroke(); }
  rg.fillStyle = '#8a8f93'; rg.fillRect(0, 0, 256, 3); rg.fillRect(0, 125, 256, 3);
  // signs and boards
  const parkSign = canvas(256, 384), pg = parkSign.getContext('2d');
  pg.fillStyle = '#f4f4f0'; pg.fillRect(0, 0, 256, 384); pg.strokeStyle = '#1e7a3c'; pg.lineWidth = 8; pg.strokeRect(6, 6, 244, 372);
  pg.fillStyle = '#1e7a3c'; pg.textAlign = 'center'; pg.textBaseline = 'middle';
  pg.font = 'bold 76px Arial'; pg.fillText('PARC', 128, 66); pg.font = 'bold 40px Arial'; pg.fillText('TRIUMF', 128, 128);
  pg.beginPath(); pg.arc(128, 200, 36, 0, 7); pg.fill(); pg.fillStyle = '#f4f4f0'; pg.beginPath(); pg.arc(128, 200, 24, 0, 7); pg.fill(); pg.fillStyle = '#1e7a3c'; pg.fillRect(122, 180, 12, 40);
  pg.font = 'bold 38px Arial'; pg.fillText('POIANA', 128, 272); pg.fillText('CÂMPINA', 128, 318);
  const board = canvas(512, 320), bg = board.getContext('2d');
  bg.fillStyle = '#f2f2f0'; bg.fillRect(0, 0, 512, 320); bg.fillStyle = '#123f8c'; bg.fillRect(0, 70, 512, 250);
  bg.fillStyle = '#123f8c'; bg.fillRect(12, 10, 80, 54); bg.fillStyle = '#f5cf1b'; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; bg.beginPath(); bg.arc(52 + Math.cos(a) * 18, 37 + Math.sin(a) * 18, 3, 0, 7); bg.fill(); }
  bg.fillStyle = '#9aa3ad'; for (let k = 0; k < 4; k++) bg.fillRect(110 + k * 95, 24, 80, 26);
  bg.fillStyle = '#e8ecf2'; for (let k = 0; k < 9; k++) bg.fillRect(30, 96 + k * 22, 300 + R() * 150, 8);
  const disc = canvas(256, 256), dg = disc.getContext('2d');
  dg.clearRect(0, 0, 256, 256); dg.fillStyle = '#f0f0ee'; dg.beginPath(); dg.arc(128, 128, 124, 0, 7); dg.fill();
  dg.fillStyle = '#56585c'; for (let k = 0; k < 40; k++) { const a = R() * 7, r = Math.sqrt(R()) * 100; dg.beginPath(); dg.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 5 + R() * 6, 0, 7); dg.fill(); }
  const noEntry = canvas(128, 128), ng = noEntry.getContext('2d');
  ng.clearRect(0, 0, 128, 128); ng.fillStyle = '#c8202a'; ng.beginPath(); ng.arc(64, 64, 62, 0, 7); ng.fill(); ng.fillStyle = '#fff'; ng.fillRect(18, 54, 92, 20);
  const noVeh = canvas(128, 128), vg = noVeh.getContext('2d');
  vg.clearRect(0, 0, 128, 128); vg.fillStyle = '#c8202a'; vg.beginPath(); vg.arc(64, 64, 62, 0, 7); vg.fill(); vg.fillStyle = '#fff'; vg.beginPath(); vg.arc(64, 64, 46, 0, 7); vg.fill();
  const sheet = canvas(128, 128), sg = sheet.getContext('2d');                    // corrugated grey sheet
  for (let x = 0; x < 128; x++) { const t = 150 + 38 * Math.sin(x / 128 * Math.PI * 16); sg.fillStyle = `rgb(${t},${t + 2},${t + 4})`; sg.fillRect(x, 0, 1, 128); }
  blobs(sg, 0, 0, 128, 128, 14, 6, 26, ['rgba(90,80,70,0.12)', 'rgba(230,230,230,0.1)'], R);
  const leaves = canvas(256, 256), lg = leaves.getContext('2d');
  lg.fillStyle = '#2f4a22'; lg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1000; i++) { const t = R(); lg.fillStyle = `rgb(${38 + t * 55},${66 + t * 66},${24 + t * 26})`; lg.beginPath(); lg.ellipse(R() * 256, R() * 256, 3 + R() * 5, 2 + R() * 3, R() * 3, 0, 7); lg.fill(); }
  const thujaT = canvas(128, 256), tg = thujaT.getContext('2d');
  tg.fillStyle = '#24401f'; tg.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 900; i++) { const t = R(); tg.fillStyle = `rgb(${30 + t * 45},${60 + t * 55},${26 + t * 22})`; tg.beginPath(); tg.ellipse(R() * 128, R() * 256, 2 + R() * 3, 4 + R() * 6, (R() - 0.5) * 0.6, 0, 7); tg.fill(); }
  const cut = (map, o = {}) => std({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, ...o });
  MT = {
    kerb: std({ map: tex(kerb, { repeat: true }), roughness: 0.85 }),
    kerbGrey: std({ map: tex(grey, { repeat: true }), roughness: 0.9 }),
    walk: std({ map: M.concrete.map, normalMap: M.concrete.normalMap, roughness: 0.92, color: 0xbdbbb4 }),
    asphalt: Object.assign(std({ map: M.asphalt.map, normalMap: M.asphalt.normalMap, roughness: 0.95, color: 0xc2c0b9 }), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -7 }),
    grass: Object.assign(std({ map: M.grassGround.map, normalMap: M.grassGround.normalMap, roughness: 1, color: 0xd6e0b4 }), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    rubber: Object.assign(std({ color: 0x3a3634, roughness: 1 }), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -5 }),
    retaining: std({ map: tex(wall, { repeat: true }), normalMap: tex(normalFromCanvas(wall, 2.0, 512), { repeat: true, srgb: false }), roughness: 0.95 }),
    graffiti: Object.assign(std({ map: tex(graf), transparent: true, depthWrite: false, roughness: 0.8 }), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }),
    stoneLight: null,
    tower: std({ map: M.concrete.map, normalMap: M.concrete.normalMap, roughness: 0.9, color: 0xc9bfae }),
    cap: std({ color: 0x9a5a48, roughness: 0.7 }),
    sheet: std({ map: tex(sheet, { repeat: true }), roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide }),
    buildMesh: cut(tex(mesh, { repeat: true }), { alphaTest: 0.3, roughness: 0.9, transparent: true, depthWrite: false }),
    wire: cut(tex(wire, { repeat: true }), { metalness: 0.6, roughness: 0.4 }),
    white: std({ color: 0xf1f1ee, roughness: 0.5, metalness: 0.2 }),
    lime: std({ color: 0xf1f0ea, roughness: 1 }),
    parkSign: std({ map: tex(parkSign), roughness: 0.5 }), board: std({ map: tex(board), roughness: 0.5 }),
    disc: cut(tex(disc), { roughness: 0.5 }), noEntry: cut(tex(noEntry), { roughness: 0.5 }), noVeh: cut(tex(noVeh), { roughness: 0.5 }),
    signBack: std({ color: 0x8d9296, roughness: 0.5, metalness: 0.6 }),
    leaves: addWind(std({ map: tex(leaves, { repeat: true }), roughness: 0.9 }), 0.05, 1.1),
    thuja: addWind(std({ map: tex(thujaT, { repeat: true }), roughness: 0.95 }), 0.03, 1.0),
    orange: std({ color: 0xe06a1e, roughness: 0.5 }), green: std({ color: 0x2f9a4a, roughness: 0.5 }), blue: std({ color: 0x2f7fd0, roughness: 0.5 }), red: std({ color: 0xc0302a, roughness: 0.5 }),
    wood: M.wood, dark: std({ color: 0x2a2c2f, roughness: 0.6, metalness: 0.5 }),
    locoBlue: std({ color: 0x1d4f9a, roughness: 0.45, metalness: 0.3 }), locoWhite: std({ color: 0xd9dcdd, roughness: 0.45, metalness: 0.3 }), locoGlass: std({ color: 0x1a2530, roughness: 0.1, metalness: 0.6 }),
  };
  MT.stoneLight = std({ map: MT.retaining.map, normalMap: MT.retaining.normalMap, roughness: 0.95, color: 0xdcd7cd });   // stadium wall (photo 47)
  return MT;
}

// columnar crown (thuja, Lombardy poplar): widest low, pointed top, bumpy outline
function column(list, x, y, z, H, Rr, seed, base = 0) {
  const pts = [], NV = 14;
  for (let k = 0; k <= NV; k++) { const t = k / NV, r = Rr * (0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.3))) * Math.pow(Math.max(0, 1 - Math.pow(t, 2.1)), 0.75); pts.push(new THREE.Vector2(Math.max(0.02, r), base + t * (H - base))); }
  const g = new THREE.LatheGeometry(pts, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), h = p.getY(i), f = 1 + 0.12 * Math.sin(seed * 3.1 + h * 2.1 + a * 3) + 0.07 * Math.sin(seed + h * 5.3 - a * 5); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
  g.computeVertexNormals();
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * H / 1.5);
  g.translate(x, y - 0.1, z); list.push(g);
}

// ------------------------------------------------------------------ build
export function buildGara(B, world) {
  const Mt = mats();
  const A = { kerb: new Acc(), kerbGrey: new Acc(), walk: new Acc(), asphalt: new Acc(), grass: new Acc(), rubber: new Acc(), retaining: new Acc(), stone: new Acc(), buildMesh: new Acc(), wire: new Acc(), parkSign: new Acc(), board: new Acc(), disc: new Acc(), noEntry: new Acc(), noVeh: new Acc(), signBack: new Acc(), sheet: new Acc(), graffiti: new Acc() };
  const G = { tower: [], cap: [], white: [], lime: [], leaves: [], thuja: [], orange: [], green: [], blue: [], red: [], wood: [], dark: [], galv: [], lamp: [], pole: [], locoBlue: [], locoWhite: [], locoGlass: [], stone: [], bark: [] };
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const Y = (x, z) => heightAt(x, z);
  const R = rng(9120);
  const surfaces = [], cars = [], treeAdd = [], treeDel = [];
  const out = { type: 'gara', name: 'Strada Gării — stadion, calea ferată, gara', wires: [] };
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  const grow = (x, z, r = 0) => { bb.x0 = Math.min(bb.x0, x - r); bb.x1 = Math.max(bb.x1, x + r); bb.z0 = Math.min(bb.z0, z - r); bb.z1 = Math.max(bb.z1, z + r); };
  // helpers on a road frame
  const frameOf = (id) => { const r = road(id); if (!r) return null; const F = frame(pairs(r.p)); return { r, F, W: (s, o) => Wf(F, s, o), dir: (s) => F.dir(s), loc: (x, z) => F.local(x, z) }; };
  const quadV = (acc, a, b, ya0, ya1, yb0, yb1, hint, uv) => acc.quad([a[0], ya0, a[1]], [b[0], yb0, b[1]], [b[0], yb1, b[1]], [a[0], ya1, a[1]], hint, uv);
  // footway with a kerb along a road frame, side = +1/-1 (o sign), painted or grey kerb
  const footway = (fr, s0, s1, side, hw, w, painted, h = 0.15) => {
    const oK = side * hw, oB = side * (hw + 0.15 + w), acc = painted ? A.kerb : A.kerbGrey;
    const yT = (s) => Y(...fr.W(s, oK)) + 0.035 + h;
    for (let s = s0; s < s1 - 1e-6; s += 0.5) {
      const t = Math.min(s1, s + 0.5), a = fr.W(s, oK), b = fr.W(t, oK), a1 = fr.W(s, side * (hw + 0.15)), b1 = fr.W(t, side * (hw + 0.15)), [ux, uz] = fr.dir(s);
      quadV(acc, a, b, Y(...a) - 0.05, yT(s), Y(...b) - 0.05, yT(t), [-uz * -side, 0, ux * -side], [s, 0, t, 0, t, 1, s, 1]);
      acc.quad([a[0], yT(s), a[1]], [b[0], yT(t), b[1]], [b1[0], yT(t), b1[1]], [a1[0], yT(s), a1[1]], UP, [s, 0.2, t, 0.2, t, 0.8, s, 0.8]);
    }
    for (let s = s0; s < s1 - 1e-6; s += 1) {
      const t = Math.min(s1, s + 1), a = fr.W(s, side * (hw + 0.15)), b = fr.W(t, side * (hw + 0.15)), a1 = fr.W(s, oB), b1 = fr.W(t, oB);
      A.walk.quad([a[0], yT(s), a[1]], [b[0], yT(t), b[1]], [b1[0], yT(t), b1[1]], [a1[0], yT(s), a1[1]], UP, [0, s / 2, w / 2, t / 2, w / 2, t / 2, 0, s / 2]);
      const [ux, uz] = fr.dir(s);
      quadV(A.walk, a1, b1, Y(...a1) - 0.2, yT(s), Y(...b1) - 0.2, yT(t), [-uz * side, 0, ux * side], [s / 2, 0, t / 2, 0, t / 2, 0.1, s / 2, 0.1]);
    }
    surfaces.push((x, z) => { const l = fr.loc(x, z); return l && l.s > s0 && l.s < s1 && l.o * side >= hw && l.o * side <= hw + 0.15 + w ? Y(...fr.W(l.s, oK)) + 0.035 + h : null; });
    for (let s = s0; s <= s1; s += 10) grow(...fr.W(s, oB), 2);
  };
  // fence panels along a polyline of points [x, z]
  const panelRun = (acc, pts, h, pw, uvW, y0 = 0.02, posts = null, postH = h, uvH = 1, tag = 'fence') => {
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), n = Math.max(1, Math.round(L / pw)), ux = (p1[0] - p0[0]) / L, uz = (p1[1] - p0[1]) / L;
      for (let k = 0; k < n; k++) {
        const a = [p0[0] + (p1[0] - p0[0]) * k / n, p0[1] + (p1[1] - p0[1]) * k / n], b = [p0[0] + (p1[0] - p0[0]) * (k + 1) / n, p0[1] + (p1[1] - p0[1]) * (k + 1) / n];
        const ya = Y(...a) + y0, yb = Y(...b) + y0, l = L / n;
        acc.quad([a[0], ya, a[1]], [b[0], yb, b[1]], [b[0], yb + h, b[1]], [a[0], ya + h, a[1]], [-uz, 0, ux], [0, 0, l / uvW, 0, l / uvW, uvH, 0, uvH]);
        if (posts) boxAt(posts, a[0], ya + postH / 2 - 0.2, a[1], 0.07, postH + 0.4, 0.07, -Math.atan2(uz, ux));
        box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, l / 2, 0.07, Math.atan2(-uz, ux), ya - 1, ya + h, tag);
        grow(a[0], a[1], 1);
      }
    }
  };
  const faceBoard = (acc, x, y, z, w, h, fx, fz, flip = false) => {
    const px = -fz * w / 2, pz = fx * w / 2;                         // along the board (to the viewer's left when facing it)
    const uv = flip ? [0, 0, 1, 0, 1, 1, 0, 1] : [1, 0, 0, 0, 0, 1, 1, 1];
    acc.quad([x + px, y, z + pz], [x - px, y, z - pz], [x - px, y + h, z - pz], [x + px, y + h, z + pz], [fx, 0, fz], flip ? [1, 0, 0, 0, 0, 1, 1, 1] : [0, 0, 1, 0, 1, 1, 0, 1]);
    void uv;
  };
  const limeTree = (x, z, type, scale, whiteH = 1.3, r = 0.2) => { treeAdd.push([x, z, type, scale]); cyl(G.lime, x, Y(x, z) - 0.1, z, whiteH, r + 0.02, r - 0.02, 10); };

  // ================================================================ Parcul Triumf and the stadium gate (photos 46-47)
  const A_ = frameOf(RA);
  if (A_) {
    const { W, dir, loc } = A_, hw = A_.r.w / 2;
    const s1 = loc(...P1).s, sg = loc(...GATE).s;
    // the park's side of the road (o sign)
    const pk = Math.sign(loc(...GATE).o) || -1;
    const so = -pk;
    const corner = loc(-699.2, -108.7).s;                                              // the park's west corner by the road
    // footway and low mesh fence with white posts along the park; the park sign at its corner (photo 46)
    footway(A_, corner - 4, corner + 72, pk, hw, 1.8, false);
    const fo = pk * (hw + 0.15 + 1.8 + 0.25);
    const fpts = []; for (let s = corner; s <= corner + 70; s += 2.5) fpts.push(W(s, fo));
    panelRun(A.wire, fpts, 1.05, 2.5, 2.5 / 2, 0.02, G.white, 1.15);
    {
      const [x, z] = W(corner - 1.2, fo + pk * 0.4), y = Y(x, z), [ux, uz] = dir(corner), fx = ux, fz = uz;   // faces the traffic from the south-east
      for (const e of [-0.55, 0.55]) cyl(G.galv, x - fz * e, y - 0.3, z + fx * e, 2.9, 0.04);
      faceBoard(A.parkSign, x + fx * 0.05, y + 1.2, z + fz * 0.05, 1.2, 1.8, fx, fz);
      A.signBack.quad([x - fx * 0.01 + fz * 0.6, y + 1.2, z - fz * 0.01 - fx * 0.6], [x - fx * 0.01 - fz * 0.6, y + 1.2, z - fz * 0.01 + fx * 0.6], [x - fx * 0.01 - fz * 0.6, y + 3.0, z - fz * 0.01 + fx * 0.6], [x - fx * 0.01 + fz * 0.6, y + 3.0, z - fz * 0.01 - fx * 0.6], [-fx, 0, -fz]);
      box(x, z, 0.65, 0.1, Math.atan2(-uz, ux), y - 1, y + 3, 'sign');
      // the tall poplar behind the sign, two young spruces
      treeAdd.push([...W(corner + 1.5, fo + pk * 3.0), T_POPLAR, 1.0], [...W(corner + 6, fo + pk * 5), T_SPRUCE, 0.45], [...W(corner + 11, fo + pk * 7.5), T_SPRUCE, 0.55]);
    }
    // playground: rubber mat, see-saws, spring riders, benches, a bin; white globe lamps (photo 46)
    {
      const c0 = corner + 1, c1 = corner + 15, o0 = fo + pk * 5, o1 = fo + pk * 15;   // photo 46: 15-30 m ahead, right
      drape(A.rubber, [W(c0, o0), W(c1, o0), W(c1, o1), W(c0, o1)], 0.03, 1.5, 2);
      const [ux, uz] = dir(c0);
      for (const [s, o, mat] of [[c0 + 4, o0 + pk * 3, 'orange'], [c0 + 11, o0 + pk * 6, 'orange']]) {
        const [x, z] = W(s, o), y = Y(x, z), a = Math.atan2(uz, ux) + 0.4;
        boxAt(G.dark, x, y + 0.3, z, 0.25, 0.6, 0.25, -a);
        const g = new THREE.BoxGeometry(3.2, 0.1, 0.22); g.rotateZ(0.14); g.rotateY(-a); g.translate(x, y + 0.62, z); G[mat].push(g);
        for (const e of [-1.4, 1.4]) { const h = new THREE.BoxGeometry(0.05, 0.3, 0.4); h.rotateY(-a); h.translate(x + Math.cos(a) * e, y + 0.62 + e * 0.1 + 0.2, z + Math.sin(a) * e); G.dark.push(h); }
        box(x, z, 1.6, 0.2, -a, y - 1, y + 0.9, 'playground');
      }
      for (const [s, o, mat] of [[c0 + 7, o0 + pk * 1.5, 'green'], [c0 + 9, o0 + pk * 2.2, 'blue'], [c0 + 14, o0 + pk * 2.0, 'green'], [c0 + 16, o0 + pk * 7, 'blue']]) {
        const [x, z] = W(s, o), y = Y(x, z);
        for (let k = 0; k < 6; k++) { const t = new THREE.TorusGeometry(0.1, 0.02, 4, 10); t.rotateX(Math.PI / 2); t.translate(x, y + 0.08 + k * 0.07, z); G.dark.push(t); }
        const b = new THREE.SphereGeometry(0.42, 12, 8); b.scale(1.4, 0.8, 0.9); b.translate(x, y + 0.75, z); G[mat].push(b);
        const hd = new THREE.SphereGeometry(0.2, 10, 8); hd.translate(x + 0.55, y + 1.0, z); G[mat].push(hd);
        box(x, z, 0.5, 0.35, 0, y - 1, y + 1, 'playground');
      }
      for (const [s, o] of [[c0 - 2, o0 + pk * 1.2], [c1 + 2, o0 + pk * 4]]) {
        const [x, z] = W(s, o), y = Y(x, z), a = Math.atan2(uz, ux);
        boxAt(G.wood, x, y + 0.45, z, 1.6, 0.05, 0.45, -a); boxAt(G.wood, x - Math.sin(a) * 0.22, y + 0.75, z + Math.cos(a) * 0.22, 1.6, 0.35, 0.05, -a);
        for (const e of [-0.7, 0.7]) boxAt(G.dark, x + Math.cos(a) * e, y + 0.22, z + Math.sin(a) * e, 0.06, 0.44, 0.45, -a);
        box(x, z, 0.8, 0.25, -a, y - 1, y + 0.9, 'bench');
      }
      { const [x, z] = W(c1 + 3.2, o0 + pk * 2.8), y = Y(x, z); cyl(G.red, x, y, z, 0.8, 0.22, 0.25, 12); box(x, z, 0.25, 0.25, 0, y - 1, y + 0.8, 'bin'); }
      for (const [s, o] of [[corner + 7, fo + pk * 2.2], [c0 + 6, o1 + pk * 2], [c1 + 1, o0 - pk * 0.8], [c1 + 12, o1 + pk * 1], [corner + 24, fo + pk * 3]]) {
        const [x, z] = W(s, o), y = Y(x, z);
        cyl(G.white, x, y - 0.2, z, 3.7, 0.07, 0.05, 10);
        const g = new THREE.SphereGeometry(0.2, 14, 10); g.translate(x, y + 3.75, z); G.lamp.push(g);
        box(x, z, 0.1, 0.1, 0, y - 1, y + 3.6, 'lamp');
      }
      treeDel.push((x, z) => { const l = loc(x, z); return l && l.s > corner - 2 && l.s < c1 + 14 && l.o * pk > hw && l.o * pk < fo * pk + 20; });
    }
    // building site across the road: green mesh on posts, the project board, the round white panel (photos 46-47)
    {
      const oF = so * (hw + 5), pts = []; for (let s = s1 - 70; s <= s1 + 48; s += 3) pts.push(W(s, oF));   // behind a weedy verge
      panelRun(A.buildMesh, pts, 2.0, 3, 3, 0.0, G.galv, 2.05, 1, 'fence');
      const bs = s1 - 8, [bx, bz] = W(bs, oF - so * 0.6), by = Y(bx, bz), [ux, uz] = dir(bs), nx = -uz * -so, nz = ux * -so;   // faces the road
      for (const e of [-1.3, 1.3]) cyl(G.galv, bx + ux * e, by - 0.3, bz + uz * e, 3.3, 0.05);
      faceBoard(A.board, bx + nx * 0.05, by + 1.3, bz + nz * 0.05, 3.0, 1.9, nx, nz);
      A.signBack.quad([bx - ux * 1.5, by + 1.3, bz - uz * 1.5], [bx + ux * 1.5, by + 1.3, bz + uz * 1.5], [bx + ux * 1.5, by + 3.2, bz + uz * 1.5], [bx - ux * 1.5, by + 3.2, bz - uz * 1.5], [-nx, 0, -nz]);
      box(bx, bz, 1.5, 0.1, Math.atan2(-uz, ux), by - 1, by + 3.2, 'sign');
      for (const [ds, round] of [[8, true], [-5, false]]) {
        const [x, z] = W(bs + ds, oF - so * 0.5), y = Y(x, z);
        cyl(G.galv, x, y - 0.3, z, round ? 1.6 : 1.3, 0.04);
        if (round) faceBoard(A.disc, x + nx * 0.03, y + 1.25, z + nz * 0.03, 1.0, 1.0, nx, nz);
        else faceBoard(A.signBack, x + nx * 0.03, y + 0.9, z + nz * 0.03, 0.8, 1.1, nx, nz);
      }
      // Lombardy poplars behind the site's fence opposite the stadium (photo 47)
      for (const [ds, sc] of [[-18, 1.0], [-25, 0.92], [-33, 1.05]]) treeAdd.push([...W(s1 + ds, oF + so * 3.5), T_LOMBARDY, sc]);
      treeDel.push((x, z) => { const l = loc(x, z); return l && l.s > s1 - 72 && l.s < s1 + 50 && l.o * so > hw && l.o * so < hw + 6; });
    }
    // the lopped poplar trunk by the bus stop (photo 47)
    { const [x, z] = W(loc(...BUS).s - 3, pk * (hw + 3.5)), y = Y(x, z); tube(G.bark, [x, y - 0.2, z], [x + 0.2, y + 8.5, z], 0.32, 9); tube(G.bark, [x + 0.15, y + 6.2, z], [x + 0.9, y + 8.0, z + 0.3], 0.13, 7); tube(G.bark, [x + 0.1, y + 4.8, z], [x - 0.6, y + 6.3, z - 0.2], 0.1, 7); box(x, z, 0.35, 0.35, 0, y - 1, y + 8, 'tree'); }
    // the stadium gate: four-pillar tower, white gate, stone wall with grilles, lime-washed trees, paved mouth
    {
      const oW = loc(...GATE).o, [ux, uz] = dir(sg), fx = -uz * -pk, fz = ux * -pk;                // (fx, fz) faces the road
      const at = (s, o) => W(s, o);
      // the stone wall runs north-west from the tower and closes in on the road (aerial: ~22 m of paving at the gate,
      // ~13 m at the far end; photo 47: the bus shelter at its end)
      const sa = sg - 48, sb = sg - 6.1, H = 1.9, wo = (s) => oW + pk * (14 - Math.abs(oW)) * clamp01((sb - s) / (sb - sa));
      // tower
      {
        // the pilastered face turned towards the street's approach from the south-east, as photo 47 sees it frontally
        const [x, z] = at(sg - 3.6, oW), y = Y(x, z), [cx, cz] = W(sg + 10, pk * 1.9), cl = Math.hypot(cx - x, cz - z), rot = Math.atan2((cx - x) / cl, (cz - z) / cl);
        const T = (g) => { g.rotateY(rot); g.translate(x, y, z); return g; };
        for (let k = 0; k < 4; k++) {
          const px = -2.1 + k * 1.4;
          G.tower.push(T(new THREE.BoxGeometry(0.62, 10.2, 0.8).translate(px, 5.1, 0)));
          G.cap.push(T(new THREE.BoxGeometry(0.8, 0.35, 1.0).translate(px, 10.35, 0)));
          G.dark.push(T(new THREE.BoxGeometry(0.14, 0.2, 0.18).translate(px, 7.6, 0.45)));
        }
        G.tower.push(T(new THREE.BoxGeometry(4.3, 9.4, 0.5).translate(0, 4.7, -0.12)));
        G.tower.push(T(new THREE.BoxGeometry(4.5, 0.25, 0.9).translate(0, 9.3, 0)));
        box(x, z, 2.3, 0.5, rot, y - 1, y + 10.5, 'tower');
        grow(x, z, 4);
      }
      // white bar gate across the service road
      {
        const a = at(sg - 1.4, oW), b = at(sg + 3.4, oW), ya = Y(...a), L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(L / 0.14);
        for (let i = 0; i <= n; i++) { const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; boxAt(G.white, x, ya + 1.05, z, 0.03, 1.9, 0.03); }
        for (const h of [0.2, 1.95]) tube(G.white, [a[0], ya + h, a[1]], [b[0], Y(...b) + h, b[1]], 0.03, 5);
        for (const p of [a, b]) boxAt(G.white, p[0], ya + 1.1, p[1], 0.12, 2.3, 0.12);
        box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / 2, 0.08, Math.atan2(-(b[1] - a[1]), b[0] - a[0]), ya - 1, ya + 2, 'gate');
      }
      // stone wall with small grilled openings, running west from the tower along the paved mouth
      {
        for (let s = sa; s < sb - 1e-6; s += 2) {
          const t = Math.min(sb, s + 2), a = at(s, wo(s)), b = at(t, wo(t)), a2 = at(s, wo(s) + pk * 0.45), b2 = at(t, wo(t) + pk * 0.45), ya = Y(...a), yb = Y(...b);
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, nx = -dz * -pk, nz = dx * -pk;
          quadV(A.stone, a, b, ya - 0.3, ya + H, yb - 0.3, yb + H, [nx, 0, nz], [s / 4, 0, t / 4, 0, t / 4, H / 3, s / 4, H / 3]);
          quadV(A.stone, b2, a2, yb - 0.3, yb + H, ya - 0.3, ya + H, [-nx, 0, -nz], [t / 4, 0, s / 4, 0, s / 4, H / 3, t / 4, H / 3]);
          A.kerbGrey.quad([a[0], ya + H, a[1]], [b[0], yb + H, b[1]], [b2[0], yb + H, b2[1]], [a2[0], ya + H, a2[1]], UP);
          box((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, L / 2, 0.25, Math.atan2(-dz, dx), ya - 1, ya + H, 'wall');
        }
        for (let s = sa + 2.5; s < sb - 1; s += 3.2) { const [x, z] = at(s, wo(s) - pk * 0.02), y = Y(x, z); for (let k = 0; k < 5; k++) boxAt(G.dark, x + ux * (k * 0.14 - 0.28), y + 1.35, z + uz * (k * 0.14 - 0.28), 0.02, 0.55, 0.03); }
        for (const ds of [-12, -19, -26, -33, -40]) { const [x, z] = at(sg + ds, wo(sg + ds) - pk * 1.6); limeTree(x, z, T_HORNBEAM, 0.72 + R() * 0.2, 1.3, 0.18); }
        for (const [ds, o, sc] of [[-8, 4, 1.0], [-15, 6, 0.9], [-22, 4.5, 1.1], [3, 9, 0.95]]) treeAdd.push([...at(sg + ds, wo(sg + ds) + pk * o), T_SPRUCE, sc]);   // behind the wall
        treeDel.push((x, z) => { const l = loc(x, z); return l && l.s > sa - 2 && l.s < corner + 4 && l.o * pk > hw && l.o * pk < oW * pk + 1; });
      }
      // the paved mouth and its long kerbed island (photo 47), the bus shelter
      {
        const poly = [at(sg - 46, pk * (hw - 0.2)), at(sg + 9, pk * (hw - 0.2)), at(sg + 4, oW - pk * 0.2)];
        for (let t = sb; t >= sg - 46; t -= 4) poly.push(at(t, wo(t) - pk * 0.2));
        drape(A.asphalt, poly, 0.03, 2, 3.2);
        // the long kerbed divider leaving the road's edge (photo 47)
        const i0 = at(sg + 8, pk * 4.8), i1 = at(sg - 22, pk * 8.6), L = Math.hypot(i1[0] - i0[0], i1[1] - i0[1]), iu = [(i1[0] - i0[0]) / L, (i1[1] - i0[1]) / L], inn = [-iu[1] * 0.45, iu[0] * 0.45];
        const q = [[i0[0] + inn[0], i0[1] + inn[1]], [i1[0] + inn[0], i1[1] + inn[1]], [i1[0] - inn[0], i1[1] - inn[1]], [i0[0] - inn[0], i0[1] - inn[1]]];
        for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4], ya = Y(...a) + 0.03, yb = Y(...b) + 0.03, mx = (a[0] + b[0]) / 2 - (i0[0] + i1[0]) / 2, mz = (a[1] + b[1]) / 2 - (i0[1] + i1[1]) / 2; quadV(A.kerbGrey, a, b, ya - 0.05, ya + 0.16, yb - 0.05, yb + 0.16, [mx, 0, mz], [0, 0, 1, 0, 1, 0.2, 0, 0.2]); }
        A.kerbGrey.quad([q[0][0], Y(...q[0]) + 0.19, q[0][1]], [q[1][0], Y(...q[1]) + 0.19, q[1][1]], [q[2][0], Y(...q[2]) + 0.19, q[2][1]], [q[3][0], Y(...q[3]) + 0.19, q[3][1]], UP);
        box((i0[0] + i1[0]) / 2, (i0[1] + i1[1]) / 2, L / 2, 0.45, Math.atan2(-iu[1], iu[0]), Y(...i0) - 1, Y(...i0) + 0.18, 'island');
        // the shelter stands against the wall's far end (photo 47), a few metres behind the stop's pole in OSM
        const [x, z] = at(sa + 4, wo(sa + 4) - pk * 1.1), y = Y(x, z), rot = Math.atan2(fx, fz), T = (g) => { g.rotateY(rot); g.translate(x, y, z); return g; };
        for (const [px, pz] of [[-1.5, -0.7], [1.5, -0.7], [-1.5, 0.6], [1.5, 0.6]]) G.dark.push(T(new THREE.BoxGeometry(0.08, 2.4, 0.08).translate(px, 1.2, pz)));
        G.dark.push(T(new THREE.BoxGeometry(3.3, 0.1, 1.7).translate(0, 2.45, 0)));
        G.locoGlass.push(T(new THREE.BoxGeometry(3.0, 1.6, 0.03).translate(0, 1.2, -0.7)));
        G.wood.push(T(new THREE.BoxGeometry(2.6, 0.06, 0.4).translate(0, 0.46, -0.45)));
        box(x, z, 1.6, 0.8, rot, y - 1, y + 2.5, 'shelter');
      }
    }
    for (let s = s1 - 70; s <= s1 + 55; s += 10) { const [ux, uz] = dir(s); addHole(W(s, pk * 8), 5, 5, ux, uz, { lawn: false, scatter: false }); grow(...W(s, pk * 24), 2); grow(...W(s, so * 8), 2); }
    out.A = { W, dir, s1, sg, pk, corner, hw };
  }

  // ================================================================ under the railway (photo 48)
  const B_ = frameOf(RB);
  if (B_) {
    const { W, dir, loc } = B_, hw = B_.r.w / 2, rs = STORE.rs ?? 1;
    footway(B_, WALL.s0, WALL.s1, rs, hw, 1.6, true);
    footway(B_, WALL.s0, WALL.s1, -rs, hw, 1.6, true);
    // the retaining wall: foot at the footway's level, top at the track bed, coping; graffiti. Behind the coping a
    // strip of grass hides the terrain's step (1 m grid) and carries walkers
    const top = STORE.top, CW = 0.6, GW = 3.0;
    for (let s = WALL.s0; s < WALL.s1 - 1e-6; s += 2) {
      const t = Math.min(WALL.s1, s + 2), a = W(s, rs * WALL.o), b = W(t, rs * WALL.o), a2 = W(s, rs * (WALL.o + CW)), b2 = W(t, rs * (WALL.o + CW)), a3 = W(s, rs * (WALL.o + GW)), b3 = W(t, rs * (WALL.o + GW));
      const ya = Y(...W(s, rs * (WALL.o - 0.4))) - 0.2, yb = Y(...W(t, rs * (WALL.o - 0.4))) - 0.2, ta = top(s) + 0.3, tb = top(t) + 0.3;
      const [ux, uz] = dir(s + 1), nx = -uz * -rs, nz = ux * -rs;
      quadV(A.retaining, a, b, ya, ta, yb, tb, [nx, 0, nz], [s / 4, ya / 3, t / 4, yb / 3, t / 4, ta / 3, s / 4, tb / 3]);
      A.kerbGrey.quad([a[0], ta, a[1]], [b[0], tb, b[1]], [b2[0], tb, b2[1]], [a2[0], ta, a2[1]], UP);
      quadV(A.kerbGrey, b2, a2, tb - 0.3, tb, ta - 0.3, ta, [-nx, 0, -nz], [0, 0, 1, 0, 1, 0.1, 0, 0.1]);
      A.grass.quad([a2[0], ta - 0.27, a2[1]], [b2[0], tb - 0.27, b2[1]], [b3[0], tb - 0.27, b3[1]], [a3[0], ta - 0.27, a3[1]], UP, [0, s / 3, 1, t / 3, 1, t / 3, 0, s / 3]);
      box((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, 1.0, CW / 2, Math.atan2(-uz, ux), ya - 1, ta, 'wall');
      grow(...a, 1); grow(...a3, 1);
    }
    {                                                                              // the graffiti, ~28 m ahead in photo 48
      const s0 = 379, s1 = 385.5, a = W(s0, rs * (WALL.o - 0.03)), b = W(s1, rs * (WALL.o - 0.03)), y0 = Y(...W(382, rs * (WALL.o - 0.4))) + 0.35, [ux, uz] = dir(382);
      quadV(A.graffiti, a, b, y0, y0 + 2.4, y0, y0 + 2.4, [uz * rs, 0, -ux * rs], [0, 0, 1, 0, 1, 1, 0, 1]);
    }
    for (const [se, sg] of [[WALL.s0, -1], [WALL.s1, 1]]) {                       // the wall's ends
      const a = W(se, rs * WALL.o), b = W(se, rs * (WALL.o + GW)), [ux, uz] = dir(se);
      quadV(A.retaining, sg * rs > 0 ? a : b, sg * rs > 0 ? b : a, Y(...a) - 0.2, top(se) + 0.3, Y(...b) - 0.2, top(se) + 0.3, [ux * sg, 0, uz * sg], [0, 0, 0.75, 0, 0.75, 1, 0, 1]);
    }
    surfaces.push((x, z) => { const l = loc(x, z); if (!l || l.s < WALL.s0 || l.s > WALL.s1) return null; const o = l.o * rs; return o >= WALL.o && o <= WALL.o + GW ? top(l.s) + (o < WALL.o + CW ? 0.3 : 0.03) : null; });
    // grass strip between the footway and the wall, lime-washed pines on it
    for (let s = WALL.s0; s < WALL.s1 - 1e-6; s += 1) {
      const t = Math.min(WALL.s1, s + 1), o0 = rs * (hw + 1.75), o1 = rs * (WALL.o - 0.02);
      const a = W(s, o0), b = W(t, o0), a1 = W(s, o1), b1 = W(t, o1);
      A.grass.quad([a[0], Y(...a) + 0.03, a[1]], [b[0], Y(...b) + 0.03, b[1]], [b1[0], Y(...b1) + 0.03, b1[1]], [a1[0], Y(...a1) + 0.03, a1[1]], UP, [0, s / 3, 2.5, t / 3, 2.5, t / 3, 0, s / 3]);
    }
    for (const s of [352, 369, 386, 401, 418, 436]) { const [x, z] = W(s + (R() - 0.5) * 3, rs * (9 + R() * 2)); limeTree(x, z, T_YOUNGPINE, 0.9 + R() * 0.2, 1.4, 0.16); }
    // thujas and big trees on the other side, tall street lights (photo 48)
    for (let s = WALL.s0 + 16; s < WALL.s1 - 4; s += 1.25) { const [x, z] = W(s, -rs * (hw + 1.75 + 0.9)); column(G.thuja, x, Y(x, z), z, 5.2 + R() * 1.2, 0.72, s); }
    box(...W((WALL.s0 + 16 + WALL.s1 - 4) / 2, -rs * (hw + 1.75 + 0.9)), (WALL.s1 - WALL.s0 - 20) / 2, 0.7, Math.atan2(-dir(400)[1], dir(400)[0]), Y(...W(400, -rs * 6.5)) - 1, Y(...W(400, -rs * 6.5)) + 5, 'hedge');
    for (const s of [350, 392, 431, 458]) treeAdd.push([...W(s, -rs * (hw + 7 + R() * 3)), R() < 0.5 ? T_WALNUT : T_OAK, 1.35 + R() * 0.25]);
    for (const s of [360, 396, 432, 466]) {
      const [x, z] = W(s, -rs * (hw + 1.1)), y = Y(x, z), [ux, uz] = dir(s), ax = -uz * rs, az = ux * rs;
      cyl(G.galv, x, y - 0.3, z, 10.3, 0.1, 0.06, 10);
      tube(G.galv, [x, y + 9.9, z], [x + ax * 1.6, y + 10.2, z + az * 1.6], 0.04, 6);
      const hd = new THREE.BoxGeometry(0.7, 0.12, 0.3); hd.rotateY(-Math.atan2(az, ax)); hd.translate(x + ax * 1.8, y + 10.2, z + az * 1.8); G.dark.push(hd);
      box(x, z, 0.12, 0.12, 0, y - 1, y + 10, 'pole');
    }
    treeDel.push((x, z) => { const l = loc(x, z); return l && l.s > WALL.s0 - 2 && l.s < WALL.s1 + 2 && Math.abs(l.o) < WALL.o + 1 && l.o * rs > -(hw + 5); });
    for (let s = WALL.s0; s < WALL.s1; s += 10) { const [ux, uz] = dir(s + 5); addHole(W(s + 5, rs * 9), 5.2, 5, ux, uz, { lawn: true, scatter: false }); }
    // a locomotive standing on the line above the wall (photo 48)
    {
      const rl = GEO.rails?.find(r => String(r.id) === LOCO.rail);
      if (rl) {
        const FR = frame(pairs(rl.p)), ls = FR.local(LOCO.x, LOCO.z).s, q = FR.at(ls), [ux, uz] = FR.dir(ls), y = railHeightAt(q.x, q.z) + 0.3, rot = Math.atan2(ux, uz);
        const T = (g) => { g.rotateY(rot); g.translate(q.x, y, q.z); return g; };
        const L = 19;
        G.locoBlue.push(T(new THREE.BoxGeometry(2.95, 1.25, L - 1.2).translate(0, 1.85, 0)));
        G.locoWhite.push(T(new THREE.BoxGeometry(2.9, 1.9, L - 1.8).translate(0, 3.4, 0)));
        for (const e of [-1, 1]) {
          const nose = new THREE.BoxGeometry(2.9, 1.9, 0.9); nose.translate(0, 3.4, e * (L / 2 - 1.35)); T(nose); G.locoWhite.push(nose);
          G.locoGlass.push(T(new THREE.BoxGeometry(2.5, 0.8, 0.05).translate(0, 3.75, e * (L / 2 - 0.88))));
          G.dark.push(T(new THREE.BoxGeometry(2.6, 0.9, 3.2).translate(0, 0.75, e * 5.2)));
          for (const w of [-1, 1]) for (const k of [-1, 1]) { const wh = new THREE.CylinderGeometry(0.62, 0.62, 0.15, 14); wh.rotateZ(Math.PI / 2); wh.translate(w * 0.8, 0.6, e * 5.2 + k * 1.1); T(wh); G.dark.push(wh); }
          const pan = new THREE.BoxGeometry(1.6, 0.06, 0.08); pan.translate(0, 4.95, e * 4.5); T(pan); G.dark.push(pan);
          tube(G.dark, (() => { const v = new THREE.Vector3(0, 4.4, e * 4.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot); return [q.x + v.x, y + v.y, q.z + v.z]; })(), (() => { const v = new THREE.Vector3(0, 4.95, e * 4.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot); return [q.x + v.x, y + v.y, q.z + v.z]; })(), 0.03, 4);
        }
        G.locoWhite.push(T(new THREE.BoxGeometry(2.4, 0.4, L - 5).translate(0, 4.5, 0)));
        box(q.x, q.z, L / 2, 1.5, Math.atan2(-uz, ux), y - 1, y + 4.6, 'train');
        grow(q.x, q.z, 10);
      }
    }
    out.B = { W, dir, rs, hw };
  }

  // ================================================================ the station square (photos 49-50)
  const C_ = frameOf(RB), LP = frameOf(LOOP);
  if (C_ && LP) {
    const { W, dir } = C_, hw = C_.r.w / 2;
    // island between Strada Gării and the maxi-taxi loop: offset polylines, kerb, grass, the spruces on the OSM trees
    const Pm = pairs(C_.r.p).slice(0, 4), Pl = pairs(LP.r.p);
    const cx = [...Pm, ...Pl].reduce((a, p) => a + p[0], 0) / (Pm.length + Pl.length), cz = [...Pm, ...Pl].reduce((a, p) => a + p[1], 0) / (Pm.length + Pl.length);
    const offIn = (P, d) => P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l; if ((cx - p[0]) * nx + (cz - p[1]) * nz < 0) { nx = -nx; nz = -nz; } return [p[0] + nx * d, p[1] + nz * d]; });
    const resamp = (P, step) => { const F = frame(P), o = []; for (let s = 0; s <= F.L; s += step) { const q = F.at(s); o.push([q.x, q.z]); } return o; };
    const mIn = offIn(resamp(Pm, 2), hw + 0.3).filter(p => Math.hypot(p[0] - Pm[0][0], p[1] - Pm[0][1]) > 7 && Math.hypot(p[0] - Pm[3][0], p[1] - Pm[3][1]) > 6);
    const lIn = offIn(resamp(Pl, 2), LP.r.w / 2 + 0.3).filter(p => Math.hypot(p[0] - Pl[0][0], p[1] - Pl[0][1]) > 7 && Math.hypot(p[0] - Pl[Pl.length - 1][0], p[1] - Pl[Pl.length - 1][1]) > 6);
    const island = [...mIn, ...lIn.reverse()];
    const ne = -Math.sign(C_.F.local(cx, cz).o) || -1;                                     // the car park's (north-east) side
    const inIsl = (x, z) => { let c = false; for (let i = 0, j = island.length - 1; i < island.length; j = i++) if ((island[i][1] > z) !== (island[j][1] > z) && x < (island[j][0] - island[i][0]) * (z - island[i][1]) / (island[j][1] - island[i][1]) + island[i][0]) c = !c; return c; };
    drape(A.grass, island, 0.17, 2, 2.5);
    for (let i = 0; i < island.length; i++) {
      const a = island[i], b = island[(i + 1) % island.length], ya = Y(...a) + 0.03, yb = Y(...b) + 0.03, mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
      quadV(A.kerbGrey, a, b, ya - 0.08, ya + 0.16, yb - 0.08, yb + 0.16, [-mx, 0, -mz], [0, 0, 1, 0, 1, 0.2, 0, 0.2]);
      grow(a[0], a[1], 2);
    }
    surfaces.push((x, z) => inIsl(x, z) ? Y(x, z) + 0.17 : null);
    treeDel.push(inIsl);
    const sc = [1.3, 1.05, 1.35, 0.9, 1.2];
    [[-144.0, -108.2], [-150.3, -108.0], [-157.0, -107.9], [-163.8, -108.0], [-170.6, -108.5]].forEach(([x, z], k) => { if (inIsl(x, z)) treeAdd.push([x, z, T_SPRUCE, sc[k]]); });
    // no-entry signs at the island's south-east nose, lamp posts on it
    {
      const nose = island.reduce((m, p) => (!m || p[0] < m[0] ? p : m), null);            // the most south-eastern point (smallest x)
      const [fx0, fz0] = [nose[0] - cx, nose[1] - cz], fl = Math.hypot(fx0, fz0), fx = fx0 / fl, fz = fz0 / fl;
      for (const [e, mat] of [[-1.6, 'noEntry'], [1.6, 'noVeh']]) {
        const x = nose[0] - fx * 1.2 - fz * e, z = nose[1] - fz * 1.2 + fx * e, y = Y(x, z) + 0.17;
        cyl(G.galv, x, y - 0.3, z, 2.4, 0.03);
        faceBoard(A[mat], x + fx * 0.03, y + 1.75, z + fz * 0.03, 0.6, 0.6, fx, fz);
        faceBoard(A.signBack, x - fx * 0.005, y + 1.75, z - fz * 0.005, 0.6, 0.6, -fx, -fz);
        box(x, z, 0.05, 0.05, 0, y - 1, y + 2.4, 'sign');
      }
      for (const t of [0.42, 0.52]) {
        const p = island[Math.floor(island.length * t)], x = p[0] + (cx - p[0]) * 0.45, z = p[1] + (cz - p[1]) * 0.45, y = Y(x, z) + 0.17;
        cyl(G.galv, x, y - 0.3, z, 8.8, 0.08, 0.05, 8);
        const hd = new THREE.BoxGeometry(0.5, 0.1, 0.22); hd.translate(x + 0.3, y + 8.6, z); G.dark.push(hd);
        box(x, z, 0.1, 0.1, 0, y - 1, y + 8, 'pole');
      }
    }
    // the car park on the north-east side between the island and the side street: painted kerb and footway, the
    // asphalt lot with cars nose-in, the tall double-arm LED mast by the kerb (photo 49: ~20 m to the right of the
    // camera, which stands ~10 m before the junction with the loop)
    {
      footway(C_, 40, 62, ne, hw, 2.0, true);
      footway(C_, 72, 104, ne, hw, 2.0, true);
      const oa = ne * (hw + 2.15), ob = ne * (hw + 2.15 + 5.6), lot = [];
      for (let t = 43; t <= 62; t += 1.5) lot.push(W(t, oa));
      for (let t = 62; t >= 43; t -= 1.5) lot.push(W(t, ob));
      drape(A.asphalt, lot, 0.04, 2, 3.2);
      const paints = [0x8d9095, 0x3f4247, 0xe9e9e7, 0x2d3237, 0x9aa0a5, 0xb3261f, 0x5b6066];
      const models = ['suv', 'sedan', 'hatch', 'p508', 'suv', 'hatch', 'sedan'];
      let k = 0;
      for (let t = 45; t <= 61 && k < paints.length; t += 2.7) {
        const [x, z] = W(t, ne * (hw + 2.15 + 2.7)), [ux, uz] = dir(t);
        cars.push({ x, z, h: Math.atan2(uz * ne, -ux * ne), model: models[k], paint: paints[k] });   // nose away from the street
        k++;
      }
      treeDel.push((x, z) => { const l = C_.F.local(x, z); return l.s > 38 && l.s < 106 && l.o * ne > hw && l.o * ne < hw + 10; });
      const s = 58, [x, z] = W(s, ne * (hw + 1.3)), y = Y(x, z), [ux, uz] = dir(s), ax = -uz, az = ux;   // arms across the street
      cyl(G.galv, x, y - 0.4, z, 12.4, 0.16, 0.08, 10);
      for (const e of [-1, 1]) {
        const ex = x + ax * e * 1.9, ez = z + az * e * 1.9;
        tube(G.galv, [x, y + 11.8, z], [ex, y + 12.1, ez], 0.045, 6);
        const hd = new THREE.BoxGeometry(0.75, 0.12, 0.32); hd.rotateY(-Math.atan2(az, ax)); hd.translate(ex + ax * e * 0.3, y + 12.05, ez + az * e * 0.3); G.dark.push(hd);
      }
      box(x, z, 0.18, 0.18, 0, y - 1, y + 12, 'pole');
    }
    // the south-west side before the square: grey sheet fence, a car parked along it; the big spruce in front of the
    // station (photo 49)
    {
      const o = -ne * (hw + 2.4), pts = [];
      for (let t = 71; t <= 104; t += 3) pts.push(W(t, o));
      panelRun(A.sheet, pts, 2.0, 3, 1.5, 0.0, G.galv, 2.0);
      treeDel.push((x, z) => { const l = C_.F.local(x, z); return l.s > 66 && l.s < 108 && l.o * -ne > hw && l.o * -ne < hw + 12; });
      treeDel.push((x, z) => Math.hypot(x + 178, z + 126) < 5);
      treeAdd.push([-178, -126, T_SPRUCE, 1.2]);
      const [x, z] = W(79, -ne * (hw + 1.2)), [ux, uz] = dir(79);
      cars.push({ x, z, h: Math.atan2(-ux, -uz), model: 'suv', paint: 0xb9ad93 });
    }
    // cars parked in front of the island on the loop (photo 49) and along the island's north edge (photo 50)
    {
      const LF = LP.F, L = LF.L, pal = [0xf0f0ee, 0xeeeeec, 0xb9bcc0];
      const inward = (s) => { const q = LF.at(s), [ux, uz] = LF.dir(s); let nx = -uz, nz = ux; if ((cx - q.x) * nx + (cz - q.z) * nz < 0) { nx = -nx; nz = -nz; } return [q, ux, uz, nx, nz]; };
      [L - 18, L - 12.5, L - 30].forEach((s, k) => { const [q, ux, uz, nx, nz] = inward(s); cars.push({ x: q.x - nx * 0.2, z: q.z - nz * 0.2, h: Math.atan2(-ux, -uz), model: ['sedan', 'p508', 'hatch'][k], paint: pal[k] }); });
      // photo 50: white hatchback, black Peugeot, white saloon along the island on the left, a beige estate and a dark
      // SUV on the right, all facing north-west
      [[40, -1, 'hatch', 0xf2f2f0], [35.4, -1, 'p508', 0x1f2226], [30.6, -1, 'sedan', 0xeeeeec], [29, 1, 'sedan', 0xb8ad90], [22.5, 1, 'suv', 0x2c3036]].forEach(([t, side, model, paint]) => {
        const [x, z] = W(t, side * ne * (hw - 1.05)), [ux, uz] = dir(t);
        cars.push({ x, z, h: Math.atan2(ux, uz), model, paint });
      });
    }
    for (const p of island) grow(p[0], p[1], 8);
    out.C = { island, cx, cz, W, dir, hw, ne };
  }

  // ---- trees: out where rebuilt, the new ones in
  editTrees((x, z) => x > bb.x0 - 20 && x < bb.x1 + 20 && z > bb.z0 - 20 && z < bb.z1 + 20 && treeDel.some(f => f(x, z)), treeAdd);

  // ---- flush
  const put = (acc, mat, opts) => acc.flush(B, mat, null, opts);
  put(A.kerb, Mt.kerb); put(A.kerbGrey, Mt.kerbGrey); put(A.walk, Mt.walk, { noCast: true }); put(A.asphalt, Mt.asphalt, { noCast: true }); put(A.grass, Mt.grass, { noCast: true });
  put(A.rubber, Mt.rubber, { noCast: true }); put(A.retaining, Mt.retaining); put(A.graffiti, Mt.graffiti, { noAO: true, noCast: true }); put(A.stone, Mt.stoneLight); put(A.buildMesh, Mt.buildMesh, { noAO: true }); put(A.wire, Mt.wire, { noAO: true, noCast: true });
  put(A.sheet, Mt.sheet); put(A.parkSign, Mt.parkSign); put(A.board, Mt.board); put(A.disc, Mt.disc, { noAO: true }); put(A.noEntry, Mt.noEntry, { noAO: true }); put(A.noVeh, Mt.noVeh, { noAO: true }); put(A.signBack, Mt.signBack);
  const geo = (key, mat) => { if (G[key].length) B.geo(mat, merged(G[key])); };
  geo('tower', Mt.tower); geo('cap', Mt.cap); geo('white', Mt.white); geo('lime', Mt.lime); geo('leaves', Mt.leaves); geo('thuja', Mt.thuja);
  geo('orange', Mt.orange); geo('green', Mt.green); geo('blue', Mt.blue); geo('red', Mt.red); geo('wood', Mt.wood); geo('dark', Mt.dark); geo('galv', M.galv);
  geo('lamp', M.lampGlass); geo('pole', M.concretePole); geo('locoBlue', Mt.locoBlue); geo('locoWhite', Mt.locoWhite); geo('locoGlass', Mt.locoGlass); geo('bark', M.bark);

  if (!Number.isFinite(bb.x0)) return null;
  out.surface = (x, z) => { for (const f of surfaces) { const y = f(x, z); if (y !== null && y !== undefined) return y; } return null; };
  out.bbox = bb;
  out.cars = cars;
  return out;
}
