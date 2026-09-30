import * as THREE from 'three';
import { GEO, heightAt, addHolePoly, inPoly } from './data.js';
import { M } from '../materials.js';
import { Acc } from './bridge.js';
import { rng } from '../util.js';
import { canvas, tex, grain, blobs, boxAt, cyl, tube, merged, drape } from './pitigaia.js';

// Photos 73-76 (the user's Street View screenshots, June 2022, "45.1313834 N 25.7076591 E"): the painted church of the
// parish "Adormirea Maicii Domnului" by the cemetery on Strada Bisericii, the school "Inv. Ion Mateescu" and its yard.
//  * 76: from the road over the school yard's fence: the bell tower over the precinct's gate (white, an arch, a painted
//    icon over it, the open belfry under a steep shingled roof), the church behind with its painted walls, shingled roof
//    and white tower, two spruces, the school on the right; 73: from the lane's entrance by the orange pillars
//  * 74, 75: across the cemetery from the roads west and north of it: the precinct's stone wall, the church and its
//    tower above it, the long parish building by the wall, the graves (white crosses and headstones, iron crosses)
//  * the aerial (measurements only): the precinct is a quadrilateral of stone walls (~47 x 70 m) with the gate tower on
//    its south-west side; the church (~26 m with its apses, the tower over the naos) and the long building inside; the
//    cemetery round it between the two roads and the precinct. The mapped church outline is ~8 m off the aerial.
// Game axes: x north-west, z north-east.
const PW = [93.4, -419.2], PN = [131.8, -392.8], PE = [102.0, -330.0], PS = [57.4, -350.0];   // the precinct's corners
const GATE = { c: [84.2, -400.4], w: 5.4, d: 4.4, arch: 2.9, archH: 3.9, h1: 5.8, bel: 9.4, apex: 14.4 };
const CH = { c: [93.2, -371.4], ax: [-0.58, 0.815], a0: -13, a1: 9, hw: 4.8, apse: 4.6, lat: 3.2, latAt: 4.8, eave: 6.2, ridge: 12.0 };
const WALL = { h: 2.8, t: 0.6 };
const LONGB = { a0: 7, a1: 40, b0: 3.8, b1: 12.6, eave: 3.0, rise: 1.7 };        // along / inside the west wall
// the cemetery: west and north of the precinct between the roads, and east of it
const CEM = [
  [[96.5, -432.5], [120, -429.5], [141.0, -424.5], [144, -398], [147.5, -371], [114.5, -326], PE, PN, PW],
  [[114.5, -326], [121, -296], [62, -290], PS, PE],
];
// the school yard: its fence along the road, the lane to the gate, the white house with the wooden gable (photo 73)
const YARD = { fence: [[86.5, -445.0], [60.0, -438.8], [37.5, -432.0]], lane: [[36.5, -430.5], [80.5, -404.5]], laneW: 5.0 };
const SHED = { c: [39.8, -420.4], w: 10.0, d: 8.0, h: 3.6, rise: 3.4 };      // right of the lane's entrance (photo 73)
const SPRUCE = [[96.3, -399.6], [86.1, -392.6]];                               // triangulated from photos 74 and 76
const UP = [0, 1, 0];

// ------------------------------------------------------------------ before the terrain, roads and trees
let READY = false;
export function prepareBiserica() {
  READY = false;
  if (!GEO.W) return false;
  // no forest, no lot fences over the precinct, the cemetery and the yard; the mapped trees there dropped, the spruces
  // and the yard's trees added
  const PREC = [PW, PN, PE, PS];
  addHolePoly(PREC, { lawn: true, noFences: true, scatter: false });
  for (const Z of CEM) addHolePoly(Z, { noFences: true, scatter: false });
  const YP = [[88, -447], [80.5, -404.5], [36.5, -430.5], [36, -433]];
  addHolePoly(YP, { noFences: true, scatter: false });
  if (GEO.trees) {
    const T = GEO.trees, keep = [];
    const inside = (x, z) => inPoly(PREC, x, z) || CEM.some(Z => inPoly(Z, x, z)) || inPoly(YP, x, z);
    for (let k = 0; k < T.n; k++) if (!inside(T.x[k], T.z[k])) keep.push(k);
    const add = [[...SPRUCE[0], 2, 1.55], [...SPRUCE[1], 2, 1.45], [92.5, -436.5, 12, 1.25], [95.5, -430.5, 1, 1.2], [88, -433, 12, 1.1],
      [118, -330, 0, 1.2], [70, -345, 12, 1.1], [127, -390, 12, 1.0], [104, -333, 2, 1.1]];
    const m = keep.length + add.length, x = new Float32Array(m), z = new Float32Array(m), t = new Uint8Array(m), s = new Float32Array(m);
    keep.forEach((k, i) => { x[i] = T.x[k]; z[i] = T.z[k]; t[i] = T.t[k]; s[i] = T.s[k]; });
    add.forEach(([ax, az, at, as], i) => { x[keep.length + i] = ax; z[keep.length + i] = az; t[keep.length + i] = at; s[keep.length + i] = as; });
    GEO.trees = { n: m, x, z, t, s };
  }
  // the church and the long building are built here; the school in the photos' colours: stone-like render, brown roof
  GEO.buildings = GEO.buildings.filter(b => String(b.id) !== '265187657');
  const sc = GEO.buildings.find(b => String(b.id) === '265187641');
  if (sc) { sc.roof = 'hip'; sc.o = { ...(sc.o || {}), wall: 'stampedGray', roof: 'roofMetalBrown', levels: 2, roofType: 'hip', pitch: 24 }; }
  READY = true;
  return true;
}

// ------------------------------------------------------------------ textures and materials
let MT = null;
function mats() {
  if (MT) return MT;
  const R = rng(7340);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // the frescoes on the church's walls: saints in arched frames on a deep blue ground, two rows (tile 3 x 3 m)
  const fr = canvas(256, 256), fg = fr.getContext('2d');
  fg.fillStyle = '#2f4f7e'; fg.fillRect(0, 0, 256, 256);
  const saint = (x, y, w, h) => {
    fg.fillStyle = '#c99a4a'; fg.fillRect(x - 3, y - 3, w + 6, h + 6);
    fg.fillStyle = '#35598c'; fg.beginPath(); fg.moveTo(x, y + h); fg.lineTo(x, y + w / 2); fg.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); fg.lineTo(x + w, y + h); fg.fill();
    const robe = ['#9b2f24', '#b86a2c', '#3f6b3a', '#7a2e4f', '#c9a14a'][Math.floor(R() * 5)];
    fg.fillStyle = '#e7c34f'; fg.beginPath(); fg.arc(x + w / 2, y + w * 0.62, w * 0.3, 0, 7); fg.fill();
    fg.fillStyle = '#e2c09a'; fg.beginPath(); fg.arc(x + w / 2, y + w * 0.62, w * 0.17, 0, 7); fg.fill();
    fg.fillStyle = robe; fg.beginPath(); fg.moveTo(x + w * 0.2, y + h - 4); fg.lineTo(x + w * 0.32, y + w * 0.85); fg.lineTo(x + w * 0.68, y + w * 0.85); fg.lineTo(x + w * 0.8, y + h - 4); fg.fill();
    fg.fillStyle = 'rgba(255,240,200,0.25)'; fg.fillRect(x + w * 0.45, y + w * 0.9, 3, h - w * 0.9 - 6);
  };
  for (let row = 0; row < 2; row++) for (let k = 0; k < 4; k++) saint(8 + k * 62, 18 + row * 116, 50, 96);
  fg.fillStyle = '#8f2c22'; fg.fillRect(0, 0, 256, 8); fg.fillRect(0, 124, 256, 6); fg.fillRect(0, 248, 256, 8);
  blobs(fg, 0, 0, 256, 256, 50, 6, 26, ['rgba(230,220,200,0.12)', 'rgba(40,30,20,0.12)'], R); grain(fg, 256, 256, 14, R);
  // wooden shingles, weathered grey-brown (tile 2 x 2 m)
  const sh = canvas(256, 256), sg = sh.getContext('2d');
  sg.fillStyle = '#6d6356'; sg.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) for (let x = (y / 16) % 2 ? -8 : 0; x < 256; x += 16) {
    const v = 90 + R() * 45; sg.fillStyle = `rgb(${v},${Math.round(v * 0.92)},${Math.round(v * 0.8)})`; sg.fillRect(x + 1, y, 14, 15);
    sg.fillStyle = 'rgba(20,15,10,0.45)'; sg.fillRect(x, y + 13, 16, 3);
  }
  grain(sg, 256, 256, 12, R);
  // the icon over the gate (photo 76): the Virgin with the Child in an arched gilded frame
  const ic = canvas(128, 96), ig = ic.getContext('2d');
  ig.fillStyle = '#e8e4da'; ig.fillRect(0, 0, 128, 96);
  ig.fillStyle = '#b8903e'; ig.beginPath(); ig.moveTo(10, 94); ig.lineTo(10, 40); ig.arc(64, 40, 54, Math.PI, 0); ig.lineTo(118, 94); ig.fill();
  ig.fillStyle = '#2e4f86'; ig.beginPath(); ig.moveTo(16, 90); ig.lineTo(16, 42); ig.arc(64, 42, 48, Math.PI, 0); ig.lineTo(112, 90); ig.fill();
  ig.fillStyle = '#e1b74b'; ig.beginPath(); ig.arc(64, 40, 17, 0, 7); ig.fill(); ig.fillStyle = '#d9b594'; ig.beginPath(); ig.arc(64, 42, 9, 0, 7); ig.fill();
  ig.fillStyle = '#8e2a22'; ig.beginPath(); ig.moveTo(40, 90); ig.lineTo(50, 54); ig.lineTo(78, 54); ig.lineTo(88, 90); ig.fill();
  ig.fillStyle = '#e1b74b'; ig.beginPath(); ig.arc(74, 62, 8, 0, 7); ig.fill(); ig.fillStyle = '#d9b594'; ig.beginPath(); ig.arc(74, 63, 4.5, 0, 7); ig.fill();
  for (const [x, c] of [[22, '#b3452c'], [98, '#3f7a4a']]) { ig.fillStyle = c; ig.fillRect(x - 6, 58, 12, 30); ig.fillStyle = '#e1b74b'; ig.beginPath(); ig.arc(x, 52, 6, 0, 7); ig.fill(); }
  // welded mesh panels (the yard's and the cemetery's fences)
  const ms = canvas(256, 128), mg = ms.getContext('2d');
  mg.clearRect(0, 0, 256, 128); mg.fillStyle = '#b5babd';
  for (let x = 0; x < 256; x += 8) mg.fillRect(x, 0, 2, 128);
  for (let y = 0; y < 128; y += 24) mg.fillRect(0, y, 256, 2);
  for (const y of [40, 88]) { mg.fillRect(0, y - 2, 256, 3); }
  // the blue "P PARCARE" sign (photo 76)
  const pk = canvas(128, 96), pg = pk.getContext('2d');
  pg.fillStyle = '#2458b0'; pg.fillRect(0, 0, 128, 96); pg.strokeStyle = '#fff'; pg.lineWidth = 3; pg.strokeRect(3, 3, 122, 90);
  pg.fillStyle = '#fff'; pg.font = 'bold 44px sans-serif'; pg.textAlign = 'center'; pg.fillText('P', 44, 48);
  pg.font = 'bold 20px sans-serif'; pg.fillText('PARCARE', 64, 76); pg.font = '9px sans-serif'; pg.fillText('ELEVI · PROFESORI', 64, 90);
  pg.beginPath(); pg.arc(92, 30, 12, 0, 7); pg.stroke();
  // the dark wooden gable of the white house by the lane (photo 73)
  const wd = canvas(128, 128), wg = wd.getContext('2d');
  for (let x = 0; x < 128; x += 12) { const v = 70 + R() * 20; wg.fillStyle = `rgb(${v + 22},${v},${v - 12})`; wg.fillRect(x, 0, 11, 128); wg.fillStyle = 'rgba(0,0,0,0.5)'; wg.fillRect(x + 11, 0, 1, 128); }
  grain(wg, 128, 128, 14, R);
  const cut = (c, o = {}) => std({ map: tex(c), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, ...o });
  MT = {
    fresco: std({ map: tex(fr, { repeat: true }), roughness: 0.85 }),
    shingle: std({ map: tex(sh, { repeat: true }), roughness: 0.9, side: THREE.DoubleSide }),
    plaster: std({ normalMap: M.wallPlaster.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92, color: 0xf1efe9 }),
    stone: M.stoneWall,
    coping: std({ map: M.concrete.map, roughness: 0.85, color: 0xb2aca0 }),
    plinth: std({ map: M.concrete.map, roughness: 0.9, color: 0xa39d92 }),
    icon: std({ map: tex(ic), roughness: 0.6 }),
    dark: std({ color: 0x1b1a19, roughness: 0.95 }),
    roofMetal: std({ map: M.roofMetalGray.map, normalMap: M.roofMetalGray.normalMap, roughness: 0.5, metalness: 0.5, color: 0x9ba0a4, side: THREE.DoubleSide }),
    planks: std({ map: tex(wd, { repeat: true }), roughness: 0.9 }),
    mesh: std({ map: tex(ms, { repeat: true }), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.5 }),
    parcare: cut(pk),
    marble: std({ color: 0xe9e7e2, roughness: 0.35 }),
    granite: std({ color: 0x3b3d40, roughness: 0.28, metalness: 0.1 }),
    frame: std({ map: M.concrete.map, roughness: 0.9, color: 0xc3bfb6 }),
    iron: M.blackMetal,
    gold: std({ color: 0xb8923c, roughness: 0.35, metalness: 0.8 }),
    orange: std({ map: M.concrete.map, roughness: 0.85, color: 0xc9824f }),
    marking: Object.assign(M.marking.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -10 }),
    asphalt: Object.assign(M.asphalt.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -6 }),
    gravel: Object.assign(M.gravel.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    galv: M.galv,
  };
  return MT;
}

// ------------------------------------------------------------------ build
export function buildBiserica(B, world) {
  if (!READY) return null;
  const Mt = mats();
  const A = {}; const acc = (k) => (A[k] ??= new Acc());
  const G = {}; const gl = (k) => (G[k] ??= []);
  const R = rng(7341);
  const Y = (x, z) => heightAt(x, z);
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const seg = (p, q, t, y0, y1, tag) => { const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz); box((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, L / 2, t, Math.atan2(-dz, dx), y0, y1, tag); };
  const out = { type: 'biserica', name: 'Biserica Adormirea Maicii Domnului' };
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], len = (v) => Math.hypot(v[0], v[1]), nrm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };
  // a vertical quad between two points with uv in metres
  const wallQ = (a, p, q, y0p, y0q, y1p, y1q, tu, tv, hint, u0 = 0) => {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const b = Math.min(y0p, y0q);
    a.quad([p[0], y0p, p[1]], [q[0], y0q, q[1]], [q[0], y1q, q[1]], [p[0], y1p, p[1]], hint, [u0 / tu, (y0p - b) / tv, (u0 + L) / tu, (y0q - b) / tv, (u0 + L) / tu, (y1q - b) / tv, u0 / tu, (y1p - b) / tv]);
  };
  const outward = (p, q, c) => { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; let n = [q[1] - p[1], 0, -(q[0] - p[0])]; if (n[0] * (m[0] - c[0]) + n[2] * (m[1] - c[1]) < 0) n = [-n[0], 0, -n[2]]; return n; };
  // a pyramid (or frustum when top > 0) over a square/rect given by its four corners at y0 up to y1
  const pyramid = (key, C, y0, y1, over, topScale = 0) => {
    const c = [(C[0][0] + C[2][0]) / 2, (C[0][1] + C[2][1]) / 2];
    const O = C.map(p => { const d = nrm(sub(p, c)); return [p[0] + d[0] * over * 1.41, p[1] + d[1] * over * 1.41]; });
    const T = C.map(p => [c[0] + (p[0] - c[0]) * topScale, c[1] + (p[1] - c[1]) * topScale]);
    for (let i = 0; i < 4; i++) { const a = O[i], b = O[(i + 1) % 4], ta = T[i], tb = T[(i + 1) % 4], ls = len(sub(a, b));
      acc(key).quad([a[0], y0, a[1]], [b[0], y0, b[1]], [tb[0], y1, tb[1]], [ta[0], y1, ta[1]], UP, [0, 0, ls / 2, 0, ls / 2 * (0.5 + topScale / 2), (y1 - y0 + over) / 2, ls / 2 * (0.5 - topScale / 2), (y1 - y0 + over) / 2]); }
  };
  const rect = (c, u, v, hu, hv) => [[c[0] - u[0] * hu - v[0] * hv, c[1] - u[1] * hu - v[1] * hv], [c[0] + u[0] * hu - v[0] * hv, c[1] + u[1] * hu - v[1] * hv], [c[0] + u[0] * hu + v[0] * hv, c[1] + u[1] * hu + v[1] * hv], [c[0] - u[0] * hu + v[0] * hv, c[1] - u[1] * hu + v[1] * hv]];

  // ================================================================ the precinct's stone wall
  const gU = nrm(sub(PS, PW)), gN = [-gU[1], gU[0]], cP = [(PW[0] + PN[0] + PE[0] + PS[0]) / 4, (PW[1] + PN[1] + PE[1] + PS[1]) / 4];
  const inward = (gN[0] * (cP[0] - GATE.c[0]) + gN[1] * (cP[1] - GATE.c[1])) > 0 ? gN : [-gN[0], -gN[1]];
  const gateA = [GATE.c[0] - gU[0] * GATE.w / 2, GATE.c[1] - gU[1] * GATE.w / 2], gateB = [GATE.c[0] + gU[0] * GATE.w / 2, GATE.c[1] + gU[1] * GATE.w / 2];
  const wallRun = (p, q) => {
    const L = len(sub(q, p)), n = Math.max(1, Math.ceil(L / 2));
    for (let i = 0; i < n; i++) {
      const a = [p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n], b = [p[0] + (q[0] - p[0]) * (i + 1) / n, p[1] + (q[1] - p[1]) * (i + 1) / n];
      const d = nrm(sub(b, a)), o = [-d[1] * WALL.t / 2, d[0] * WALL.t / 2], ya = Y(...a), yb = Y(...b), top = (Math.max(ya, yb) + WALL.h);
      for (const sg of [1, -1]) { const A2 = [a[0] + o[0] * sg, a[1] + o[1] * sg], B2 = [b[0] + o[0] * sg, b[1] + o[1] * sg]; wallQ(acc('stone'), A2, B2, ya - 0.3, yb - 0.3, top, top, 3, 3, [o[0] * sg, 0, o[1] * sg], i * L / n); }
      const A1 = [a[0] + o[0] * 1.3, a[1] + o[1] * 1.3], B1 = [b[0] + o[0] * 1.3, b[1] + o[1] * 1.3], A3 = [a[0] - o[0] * 1.3, a[1] - o[1] * 1.3], B3 = [b[0] - o[0] * 1.3, b[1] - o[1] * 1.3];
      acc('coping').quad([A1[0], top + 0.12, A1[1]], [B1[0], top + 0.12, B1[1]], [B3[0], top + 0.12, B3[1]], [A3[0], top + 0.12, A3[1]], UP);
      for (const [P1, P2] of [[A1, B1], [A3, B3]]) wallQ(acc('coping'), P1, P2, top - 0.02, top - 0.02, top + 0.12, top + 0.12, 1, 1, [P1[0] - a[0], 0, P1[1] - a[1]]);
      seg(a, b, WALL.t / 2, Math.min(ya, yb) - 1, top, 'wall');
    }
  };
  wallRun(PW, gateA); wallRun(gateB, PS); wallRun(PS, PE); wallRun(PE, PN); wallRun(PN, PW);
  // the small doorway in the west wall (photo 74)
  { const d = nrm(sub(PN, PW)), p = [PW[0] + d[0] * 25, PW[1] + d[1] * 25], q = [PW[0] + d[0] * 26.1, PW[1] + d[1] * 26.1], y = Y(...p);
    let n = [d[1], -d[0]]; if (n[0] * (cP[0] - p[0]) + n[1] * (cP[1] - p[1]) > 0) n = [-n[0], -n[1]];          // outwards, to the cemetery
    const off = (P) => [P[0] + n[0] * (WALL.t / 2 + 0.02), P[1] + n[1] * (WALL.t / 2 + 0.02)];
    wallQ(acc('dark'), off(p), off(q), y, y, y + 2.0, y + 2.0, 1, 1, [n[0], 0, n[1]]); }

  // ================================================================ the bell tower over the gate (photo 76)
  {
    const y0 = Math.min(Y(...gateA), Y(...gateB), Y(...GATE.c)) - 0.2, U = gU, N = inward, rot = -Math.atan2(U[1], U[0]);
    // the white gate block with its round-headed arch, extruded through the wall
    const s = new THREE.Shape(); const hw = GATE.w / 2, ah = GATE.arch / 2, ar = ah;         // the outline with the arch cut up from the ground
    s.moveTo(-hw, 0); s.lineTo(-ah, 0); s.lineTo(-ah, GATE.archH - ar); s.absarc(0, GATE.archH - ar, ar, Math.PI, 0, true); s.lineTo(ah, 0); s.lineTo(hw, 0); s.lineTo(hw, GATE.h1); s.lineTo(-hw, GATE.h1); s.lineTo(-hw, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: GATE.d, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -GATE.d / 2);
    const Mx = new THREE.Matrix4().makeBasis(new THREE.Vector3(U[0], 0, U[1]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-U[1], 0, U[0])).setPosition(GATE.c[0], y0, GATE.c[1]);   // right-handed
    g.applyMatrix4(Mx); gl('gateWhite').push(g);
    for (const sg of [-1, 1]) { const px = GATE.c[0] + U[0] * sg * (hw - (hw - ah) / 2), pz = GATE.c[1] + U[1] * sg * (hw - (hw - ah) / 2); box(px, pz, (hw - ah) / 2, GATE.d / 2, rot, y0 - 1, y0 + GATE.bel, 'house'); }
    box(GATE.c[0], GATE.c[1], hw, GATE.d / 2, rot, y0 + GATE.archH, y0 + GATE.bel, 'house');
    // the icon on the outer face, its small roof
    const oc = [GATE.c[0] - N[0] * (GATE.d / 2 + 0.03), GATE.c[1] - N[1] * (GATE.d / 2 + 0.03)], P = (u, y) => [oc[0] + U[0] * u, y0 + y, oc[1] + U[1] * u];
    acc('icon').quad(P(-1.5, 4.0), P(1.5, 4.0), P(1.5, 5.45), P(-1.5, 5.45), [-N[0], 0, -N[1]]);
    // the skirt roof, the open belfry (corner posts, a parapet, the dark inside), the steep roof and the cross
    const C0 = rect(GATE.c, U, N, hw, GATE.d / 2);
    pyramid('shingle', C0, y0 + GATE.h1 - 0.3, y0 + GATE.h1 + 0.55, 0.8, 0.82);
    const Cb = rect(GATE.c, U, N, hw - 0.3, GATE.d / 2 - 0.3);
    for (const p of Cb) boxAt(gl('gateWhite'), p[0], y0 + (GATE.h1 + GATE.bel) / 2, p[1], 0.62, GATE.bel - GATE.h1, 0.62, rot);
    for (let i = 0; i < 4; i++) { const p = Cb[i], q = Cb[(i + 1) % 4], n2 = outward(p, q, GATE.c); wallQ(acc('plaster'), p, q, y0 + GATE.h1, y0 + GATE.h1, y0 + GATE.h1 + 1.0, y0 + GATE.h1 + 1.0, 2, 2, n2);
      wallQ(acc('dark'), [p[0] * 0.9 + GATE.c[0] * 0.1, p[1] * 0.9 + GATE.c[1] * 0.1], [q[0] * 0.9 + GATE.c[0] * 0.1, q[1] * 0.9 + GATE.c[1] * 0.1], y0 + GATE.h1, y0 + GATE.h1, y0 + GATE.bel, y0 + GATE.bel, 2, 2, n2);
      // the arches between the posts: a white band under the eave
      wallQ(acc('plaster'), p, q, y0 + GATE.bel - 0.7, y0 + GATE.bel - 0.7, y0 + GATE.bel, y0 + GATE.bel, 2, 2, n2); }
    const Cr = rect(GATE.c, U, N, hw, GATE.d / 2);
    pyramid('shingle', Cr, y0 + GATE.bel - 0.25, y0 + GATE.apex, 1.3);
    const ax = GATE.c[0], az = GATE.c[1], yt = y0 + GATE.apex;
    cyl(gl('gold'), ax, yt - 0.2, az, 1.6, 0.05, 0.04, 6); boxAt(gl('gold'), ax, yt + 1.0, az, 0.8, 0.07, 0.07, rot);
    out.gate = { x: ax, z: az, y: yt };
  }

  // ================================================================ the church: painted walls, shingled roofs, the tower
  {
    const ax = CH.ax, px = [-ax[1], ax[0]], W = (a, b) => [CH.c[0] + ax[0] * a + px[0] * b, CH.c[1] + ax[1] * a + px[1] * b];
    // the outline: the nave, the lateral apses by the naos, the altar apse (a, b in metres along / across)
    const O = [];
    const arc = (ca, cb, r, t0, t1, n) => { for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; O.push([ca + Math.cos(t) * r, cb + Math.sin(t) * r]); } };
    O.push([CH.a0, -CH.hw]);
    arc(CH.latAt, -CH.hw, CH.lat, Math.PI, 2 * Math.PI, 8);                       // the south lateral apse (b < 0)
    arc(CH.a1, 0, CH.apse, -Math.PI / 2, Math.PI / 2, 10);                        // the altar apse to the east
    arc(CH.latAt, CH.hw, CH.lat, 0, Math.PI, 8);                                  // the north lateral apse
    O.push([CH.a0, CH.hw]);
    const P = O.map(([a, b]) => W(a, b));
    const y0 = Math.min(...P.map(p => Y(...p))) - 0.3, ye = y0 + 0.3 + CH.eave;
    let u = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length], L = len(sub(q, p)); if (L < 0.01) continue;
      const n = outward(p, q, CH.c);
      wallQ(acc('plinth'), p, q, y0, y0, y0 + 1.0, y0 + 1.0, 2, 2, n, u);
      wallQ(acc('fresco'), p, q, y0 + 1.0, y0 + 1.0, ye, ye, 3, 3, n, u);
      seg(p, q, 0.3, y0 - 1, ye + 3, 'house'); u += L;
    }
    // the main roof: a steep hip over the nave, a half-cone over the altar apse, smaller ones over the lateral apses
    const ov = 1.4, yr = y0 + CH.ridge, ew = CH.hw + ov, ya = ye - 0.6;
    const Rp = (a, b, y) => { const [x, z] = W(a, b); return [x, y, z]; };
    const aW = CH.a0 - ov, aR0 = CH.a0 - ov + ew * 0.55, aR1 = CH.a1;
    for (const sg of [-1, 1]) acc('shingle').quad(Rp(aW, sg * ew, ya), Rp(aR1, sg * ew, ya), Rp(aR1, 0, yr), Rp(aR0, 0, yr), UP, [0, 0, (aR1 - aW) / 2, 0, (aR1 - aR0) / 2, ew / 1.5, 0, ew / 1.5]);
    acc('shingle').quad(Rp(aW, -ew, ya), Rp(aW, ew, ya), Rp(aR0, 0, yr), Rp(aR0, 0, yr), UP, [0, 0, ew, 0, ew / 2, ew / 1.5, ew / 2, ew / 1.5]);
    const cone = (ca, cb, r, t0, t1, n, yTop, capA = null) => { for (let i = 0; i < n; i++) { const ta = t0 + (t1 - t0) * i / n, tb = t0 + (t1 - t0) * (i + 1) / n; const pa = Rp(ca + Math.cos(ta) * r, cb + Math.sin(ta) * r, ya), pb = Rp(ca + Math.cos(tb) * r, cb + Math.sin(tb) * r, ya), top = Rp(capA ?? ca, cb, yTop); acc('shingle').quad(pa, pb, top, top, UP, [i, 0, i + 1, 0, i + 0.5, r / 1.5, i + 0.5, r / 1.5]); } };
    cone(CH.a1, 0, CH.apse + ov, -Math.PI / 2, Math.PI / 2, 12, yr);
    const yLat = ya + (yr - ya) * (1 - CH.hw / ew) + 0.35;                      // the lateral apses' roofs meet the main one
    for (const sg of [-1, 1]) cone(CH.latAt, sg * CH.hw, CH.lat + ov, sg < 0 ? Math.PI : 0, sg < 0 ? 2 * Math.PI : Math.PI, 8, yLat, CH.latAt);
    // the tower over the naos: white, a skirt roof, the upper stage with its windows, the pyramid roof, the cross
    const tc = W(CH.latAt, 0), rot = -Math.atan2(ax[1], ax[0]), T = CH.ridge;
    const tw = (w, y1, y2, key = 'plaster') => { const C = rect(tc, ax, px, w / 2, w / 2); for (let i = 0; i < 4; i++) { const p = C[i], q = C[(i + 1) % 4]; wallQ(acc(key), p, q, y1, y1, y2, y2, 2, 2, outward(p, q, tc)); } return C; };
    tw(4.8, y0 + T - 2.5, y0 + T + 3.2);
    pyramid('shingle', rect(tc, ax, px, 2.4, 2.4), y0 + T + 3.0, y0 + T + 3.8, 0.9, 0.8);
    const Cu = tw(3.9, y0 + T + 3.6, y0 + T + 7.4);
    for (let i = 0; i < 4; i++) { const p = Cu[i], q = Cu[(i + 1) % 4], n = outward(p, q, tc), m = [(p[0] + q[0]) / 2 + n[0] * 0.01, (p[1] + q[1]) / 2 + n[2] * 0.01], d = nrm(sub(q, p));
      wallQ(acc('dark'), [m[0] - d[0] * 0.28, m[1] - d[1] * 0.28], [m[0] + d[0] * 0.28, m[1] + d[1] * 0.28], y0 + T + 5.0, y0 + T + 5.0, y0 + T + 6.6, y0 + T + 6.6, 1, 1, n); }
    pyramid('shingle', rect(tc, ax, px, 1.95, 1.95), y0 + T + 7.3, y0 + T + 10.6, 0.5);
    cyl(gl('gold'), tc[0], y0 + T + 10.4, tc[1], 1.5, 0.05, 0.04, 6); boxAt(gl('gold'), tc[0], y0 + T + 11.4, tc[1], 0.8, 0.07, 0.07, rot);
    box(tc[0], tc[1], 2.4, 2.4, rot, y0, y0 + T + 7.4, 'house');
    out.tower = { x: tc[0], z: tc[1], y: y0 + T + 11 };
  }

  // ================================================================ the long parish building inside the west wall
  {
    const d = nrm(sub(PN, PW)), n = (d[1] * (cP[0] - PW[0]) - d[0] * (cP[1] - PW[1])) > 0 ? [d[1], -d[0]] : [-d[1], d[0]];
    const Pt = (a, b) => [PW[0] + d[0] * a + n[0] * b, PW[1] + d[1] * a + n[1] * b];
    const C = [Pt(LONGB.a0, LONGB.b0), Pt(LONGB.a1, LONGB.b0), Pt(LONGB.a1, LONGB.b1), Pt(LONGB.a0, LONGB.b1)], cc = Pt((LONGB.a0 + LONGB.a1) / 2, (LONGB.b0 + LONGB.b1) / 2);
    const y0 = Math.min(...C.map(p => Y(...p))) - 0.3, ye = C.reduce((a, p) => a + Y(...p), 0) / 4 + LONGB.eave;
    for (let i = 0; i < 4; i++) { const p = C[i], q = C[(i + 1) % 4]; wallQ(acc(i === 1 ? 'planks' : 'plaster'), p, q, y0, y0, ye, ye, 2, 2, outward(p, q, cc)); seg(p, q, 0.25, y0 - 1, ye + 2, 'house'); }
    // hipped metal roof
    const hb = (LONGB.b1 - LONGB.b0) / 2 + 0.6, bm = (LONGB.b0 + LONGB.b1) / 2, yr = ye + LONGB.rise;
    const Rp = (a, b, y) => { const [x, z] = Pt(a, b); return [x, y, z]; };
    const a0 = LONGB.a0 - 0.6, a1 = LONGB.a1 + 0.6, r0 = a0 + hb, r1 = a1 - hb;
    acc('roofMetal').quad(Rp(a0, bm - hb, ye - 0.2), Rp(a1, bm - hb, ye - 0.2), Rp(r1, bm, yr), Rp(r0, bm, yr), UP, [0, 0, (a1 - a0) / 2, 0, (r1 - a0) / 2, 2, (r0 - a0) / 2, 2]);
    acc('roofMetal').quad(Rp(a0, bm + hb, ye - 0.2), Rp(a1, bm + hb, ye - 0.2), Rp(r1, bm, yr), Rp(r0, bm, yr), UP, [0, 0, (a1 - a0) / 2, 0, (r1 - a0) / 2, 2, (r0 - a0) / 2, 2]);
    acc('roofMetal').quad(Rp(a0, bm - hb, ye - 0.2), Rp(a0, bm + hb, ye - 0.2), Rp(r0, bm, yr), Rp(r0, bm, yr), UP);
    acc('roofMetal').quad(Rp(a1, bm - hb, ye - 0.2), Rp(a1, bm + hb, ye - 0.2), Rp(r1, bm, yr), Rp(r1, bm, yr), UP);
  }

  // ================================================================ the cemetery: rows of graves between the precinct and the roads
  {
    const u = nrm(sub(PN, PW)), v = [-u[1], u[0]];                           // rows along the west wall, graves across them
    const rotG = -Math.atan2(v[1], v[0]);
    const near = (x, z) => { for (const Q of [[PW, PN], [PN, PE], [PE, PS], [PS, PW]]) { const [a, b] = Q, d = sub(b, a), l2 = d[0] * d[0] + d[1] * d[1], t = Math.max(0, Math.min(1, ((x - a[0]) * d[0] + (z - a[1]) * d[1]) / l2)); if (Math.hypot(x - a[0] - d[0] * t, z - a[1] - d[1] * t) < 1.2) return true; } return false; };
    let n = 0;
    for (const Z of CEM) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of Z) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const c = [(x0 + x1) / 2, (z0 + z1) / 2], span = Math.hypot(x1 - x0, z1 - z0) / 2 + 2;
      for (let i = -span; i < span; i += 1.35) {
        if (R() < 0.04) continue;
        for (let j = -span; j < span; j += 2.75) {
          if (Math.abs(((j / 2.75) | 0) % 7) === 3) continue;                    // a path every seven rows
          const x = c[0] + u[0] * i + v[0] * j + (R() - 0.5) * 0.12, z = c[1] + u[1] * i + v[1] * j + (R() - 0.5) * 0.12;
          if (!inPoly(Z, x, z) || near(x, z)) continue;
          const y = Y(x, z), k = R();
          const at = (dv, h) => [x + v[0] * dv, y + h, z + v[1] * dv];
          if (k < 0.8) boxAt(gl(R() < 0.2 ? 'granite' : 'frame'), x, y + 0.08, z, 0.95, 0.3, 1.95, rotG);   // the grave's frame / slab
          const hx = at(-0.85, 0);
          if (k < 0.42) { boxAt(gl('marble'), hx[0], y + 0.6, hx[2], 0.6, 0.95, 0.13, rotG + Math.PI / 2); boxAt(gl('marble'), hx[0], y + 1.2, hx[2], 0.1, 0.35, 0.1, 0); boxAt(gl('marble'), hx[0], y + 1.25, hx[2], 0.3, 0.08, 0.08, rotG + Math.PI / 2); }
          else if (k < 0.62) { boxAt(gl('marble'), hx[0], y + 0.7, hx[2], 0.12, 1.4, 0.12, 0); boxAt(gl('marble'), hx[0], y + 1.08, hx[2], 0.62, 0.11, 0.11, rotG + Math.PI / 2); }
          else if (k < 0.8) { boxAt(gl('granite'), hx[0], y + 0.65, hx[2], 0.65, 1.1, 0.12, rotG + Math.PI / 2); }
          else if (k < 0.93) { boxAt(gl('iron'), hx[0], y + 0.6, hx[2], 0.06, 1.2, 0.06, 0); boxAt(gl('iron'), hx[0], y + 0.95, hx[2], 0.5, 0.06, 0.06, rotG + Math.PI / 2);
            for (const sgn of [-1, 1]) boxAt(gl('iron'), x + u[0] * 0.6 * sgn, y + 0.48, z + u[1] * 0.6 * sgn, 0.03, 0.03, 2.2, rotG); }
          n++;
        }
      }
    }
    out.graves = n;
    // the cemetery's mesh fence along both roads (photos 74, 75)
    const fence = (pts, h) => { for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1], L = len(sub(q, p)), k = Math.max(1, Math.round(L / 2.5));
      for (let j = 0; j < k; j++) { const a = [p[0] + (q[0] - p[0]) * j / k, p[1] + (q[1] - p[1]) * j / k], b = [p[0] + (q[0] - p[0]) * (j + 1) / k, p[1] + (q[1] - p[1]) * (j + 1) / k], ya = Y(...a), yb = Y(...b);
        wallQ(acc('frame'), a, b, ya - 0.1, yb - 0.1, ya + 0.3, yb + 0.3, 2, 1, [b[1] - a[1], 0, a[0] - b[0]]);
        wallQ(acc('mesh'), a, b, ya + 0.3, yb + 0.3, ya + 0.3 + h, yb + 0.3 + h, 2.5, h, [b[1] - a[1], 0, a[0] - b[0]]);
        boxAt(gl('galv'), a[0], ya + (h + 0.3) / 2, a[1], 0.06, h + 0.3, 0.06, 0); seg(a, b, 0.06, ya - 0.5, ya + h + 0.3, 'fence'); } } };
    fence(CEM[0].slice(0, 6), 1.2);
  }

  // ================================================================ the school yard: fence, sign, pillars, lane, the house with the gable
  {
    const F = YARD.fence;
    for (let i = 0; i < F.length - 1; i++) { const p = F[i], q = F[i + 1], L = len(sub(q, p)), k = Math.max(1, Math.round(L / 2.5));
      for (let j = 0; j < k; j++) { const a = [p[0] + (q[0] - p[0]) * j / k, p[1] + (q[1] - p[1]) * j / k], b = [p[0] + (q[0] - p[0]) * (j + 1) / k, p[1] + (q[1] - p[1]) * (j + 1) / k], ya = Y(...a), yb = Y(...b);
        wallQ(acc('coping'), a, b, ya - 0.1, yb - 0.1, ya + 0.35, yb + 0.35, 2, 1, [b[1] - a[1], 0, a[0] - b[0]]);
        wallQ(acc('mesh'), a, b, ya + 0.35, yb + 0.35, ya + 2.05, yb + 2.05, 2.5, 1.7, [b[1] - a[1], 0, a[0] - b[0]]);
        boxAt(gl('galv'), a[0], ya + 1.05, a[1], 0.07, 2.1, 0.07, 0); seg(a, b, 0.07, ya - 0.5, ya + 2.05, 'fence'); } }
    // the "P PARCARE" sign on the fence, and a notice board by the lane (photos 73, 76)
    { const p = F[1], q = F[2], d = nrm(sub(q, p)), m = [p[0] + (q[0] - p[0]) * 0.55, p[1] + (q[1] - p[1]) * 0.55], y = Y(...m) + 1.0, n = [d[1], -d[0]];
      const s0 = [m[0] - d[0] * 0.5 + n[0] * 0.05, m[1] - d[1] * 0.5 + n[1] * 0.05], s1 = [m[0] + d[0] * 0.5 + n[0] * 0.05, m[1] + d[1] * 0.5 + n[1] * 0.05];
      wallQ(acc('parcare'), s0, s1, y, y, y + 0.75, y + 0.75, 1, 0.75, [n[0], 0, n[1]]); }
    // the lane to the gate: its two orange pillars at the entrance
    const L0 = YARD.lane[0], L1 = YARD.lane[1], ld = nrm(sub(L1, L0)), ln = [-ld[1], ld[0]];
    for (const sg of [-1, 1]) { const x = L0[0] + ln[0] * sg * (YARD.laneW / 2 + 0.3), z = L0[1] + ln[1] * sg * (YARD.laneW / 2 + 0.3), y = Y(x, z); boxAt(gl('orange'), x, y + 1.1, z, 0.55, 2.2, 0.55, -Math.atan2(ld[1], ld[0])); boxAt(gl('orange'), x, y + 2.25, z, 0.65, 0.1, 0.65, -Math.atan2(ld[1], ld[0])); box(x, z, 0.28, 0.28, 0, y - 0.5, y + 2.2, 'pillar'); }
    // the lane's asphalt, the yard's asphalt with its painted bays
    const LP = [[L0[0] + ln[0] * YARD.laneW / 2, L0[1] + ln[1] * YARD.laneW / 2], [L1[0] + ln[0] * YARD.laneW / 2, L1[1] + ln[1] * YARD.laneW / 2], [L1[0] - ln[0] * YARD.laneW / 2, L1[1] - ln[1] * YARD.laneW / 2], [L0[0] - ln[0] * YARD.laneW / 2, L0[1] - ln[1] * YARD.laneW / 2]];
    drape(acc('asphalt'), LP, 0.04, 2, 1.3);
    drape(acc('asphalt'), [[86, -444.5], [80.5, -405.5], [L1[0] - ln[0] * 2.6, L1[1] - ln[1] * 2.6], [L0[0] - ln[0] * 2.6, L0[1] - ln[1] * 2.6], [38, -431.8], [60.2, -438.3]], 0.03, 2, 1.3);
    for (let k = 0; k < 9; k++) { const t = 0.12 + k * 0.085, p = [L0[0] + (L1[0] - L0[0]) * t - ln[0] * 2.8, L0[1] + (L1[1] - L0[1]) * t - ln[1] * 2.8], q = [p[0] - ln[0] * 4.8, p[1] - ln[1] * 4.8];
      const w = [ld[0] * 0.06, ld[1] * 0.06], yp = Y(...p) + 0.045, yq = Y(...q) + 0.045;
      acc('marking').quad([p[0] - w[0], yp, p[1] - w[1]], [p[0] + w[0], yp, p[1] + w[1]], [q[0] + w[0], yq, q[1] + w[1]], [q[0] - w[0], yq, q[1] - w[1]], UP); }
    for (const sg of [-1, 1]) for (let t = 0; t < 1; t += 0.035) { const p = [L0[0] + (L1[0] - L0[0]) * t + ln[0] * sg * 2.3, L0[1] + (L1[1] - L0[1]) * t + ln[1] * sg * 2.3], q = [p[0] + ld[0] * 0.6, p[1] + ld[1] * 0.6], w = [ln[0] * 0.07, ln[1] * 0.07], yp = Y(...p) + 0.05, yq = Y(...q) + 0.05;
      acc('marking').quad([p[0] - w[0], yp, p[1] - w[1]], [q[0] - w[0], yq, q[1] - w[1]], [q[0] + w[0], yq, q[1] + w[1]], [p[0] + w[0], yp, p[1] + w[1]], UP); }
    // the white house with the dark wooden gable by the lane (photo 73)
    { const u = ld, v = ln, C = rect(SHED.c, u, v, SHED.w / 2, SHED.d / 2), y0 = Math.min(...C.map(p => Y(...p))) - 0.3, ye = y0 + 0.3 + SHED.h;
      for (let i = 0; i < 4; i++) { const p = C[i], q = C[(i + 1) % 4]; wallQ(acc('plaster'), p, q, y0, y0, ye, ye, 2, 2, outward(p, q, SHED.c)); seg(p, q, 0.25, y0 - 1, ye + SHED.rise, 'house'); }
      // gable ends facing the lane's ends (along u), boarded; the roof ridge along u
      const yr = ye + SHED.rise, m0 = [(C[0][0] + C[3][0]) / 2, (C[0][1] + C[3][1]) / 2], m1 = [(C[1][0] + C[2][0]) / 2, (C[1][1] + C[2][1]) / 2];
      for (const [p, q, m, sg] of [[C[0], C[3], m0, -1], [C[1], C[2], m1, 1]]) acc('planks').quad([p[0], ye, p[1]], [q[0], ye, q[1]], [m[0], yr, m[1]], [m[0], yr, m[1]], [u[0] * sg, 0, u[1] * sg], [0, 0, SHED.d / 2, 0, SHED.d / 4, SHED.rise / 2, SHED.d / 4, SHED.rise / 2]);
      const ov = 0.6, E = (p, dirv) => [p[0] + dirv[0], p[1] + dirv[1]];
      for (const [p, q, sg] of [[C[0], C[1], -1], [C[3], C[2], 1]]) { const pa = E(E(p, [v[0] * sg * ov, v[1] * sg * ov]), [-u[0] * ov, -u[1] * ov]), qa = E(E(q, [v[0] * sg * ov, v[1] * sg * ov]), [u[0] * ov, u[1] * ov]), ma = E(m0, [-u[0] * ov, -u[1] * ov]), mb = E(m1, [u[0] * ov, u[1] * ov]);
        acc('roofMetal').quad([pa[0], ye - 0.3, pa[1]], [qa[0], ye - 0.3, qa[1]], [mb[0], yr, mb[1]], [ma[0], yr, ma[1]], UP); } }
  }

  // ---- flush
  const matOf = { fresco: Mt.fresco, shingle: Mt.shingle, plaster: Mt.plaster, stone: Mt.stone, coping: Mt.coping, plinth: Mt.plinth, icon: Mt.icon, dark: Mt.dark, roofMetal: Mt.roofMetal, planks: Mt.planks, mesh: Mt.mesh, parcare: Mt.parcare, frame: Mt.frame, marking: Mt.marking, asphalt: Mt.asphalt };
  for (const [k, a] of Object.entries(A)) a.flush(B, matOf[k], null, k === 'marking' || k === 'asphalt' ? { noCast: true } : {});
  const gm = { gateWhite: Mt.plaster, gold: Mt.gold, marble: Mt.marble, granite: Mt.granite, frame: Mt.frame, iron: Mt.iron, galv: Mt.galv, orange: Mt.orange };
  for (const [k, list] of Object.entries(G)) if (list.length) B.geo(gm[k], merged(list));

  // ---- the photo views (June 2022; the car camera 2.5 m over the road)
  const view = (from, to, pitch, fov) => ({ from, to, pitch, fov });
  out.views = [
    { n: 73, label: 'Poza 73 — Strada Bisericii: intrarea în curtea școlii, stâlpii portocalii', ...view([36.0, -442.0], [36.9, -432.0], 0.06, 71.4) },
    { n: 74, label: 'Poza 74 — cimitirul și biserica pictată, din Strada Bisericii', ...view([110.1, -434.3], [105.4, -425.4], 0.08, 71.4) },
    { n: 75, label: 'Poza 75 — biserica peste zidul incintei, dinspre drumul de nord', ...view([147.5, -402.2], [139.6, -396.0], 0.06, 71.4) },
    { n: 76, label: 'Poza 76 — clopotnița de la poartă și școala, peste gardul parcării', ...view([40.1, -439.3], [46.2, -431.4], 0.08, 71.4) },
  ];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of [PW, PN, PE, PS, ...YARD.fence]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  out.bbox = { x0, x1, z0, z1 };
  return out;
}
