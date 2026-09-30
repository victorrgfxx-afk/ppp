import * as THREE from 'three';
import { GEO, heightAt, addHolePoly, inPoly, polyDist } from './data.js';
import { M } from '../materials.js';
import { Acc } from './bridge.js';
import { canvas, tex, grain, boxAt, cyl, tube, merged, frame, pairs, road, drape } from './pitigaia.js';
import { chainNB } from './pastravaria.js';
import { thuja, grigorescuMats } from './grigorescu.js';

// Photo 66 (Street View, November 2023, "45.1657080 N 25.6905560 E"): DN1 northbound ~1.3 km past the Păstrăvăria
// sign, at a roadside restaurant on the right. The coordinate falls on our lane at the restaurant's south end; the
// screenshot is taken ~50 m before it (the restaurant is 45 m ahead), so the camera is put where the photo puts it.
// Measured on the screenshot (the Street View camera 2.5 m up, its view 54° high; the lane lines' vanishing point
// gives the heading, 13° right of the road, and the lane divider 1.4 m left of the camera) and on the aerials:
//  * the same cross-section as photos 64-65 (7.4 m between the edge lines, the barrier 4.5 m left of the lane divider,
//    Esri's aerial has both on the mapped lines here); the right edge line is broken (1 m dashes, 0.85 m gaps) along
//    the restaurant's gravel lot, which runs from the asphalt up to a low grey stone wall 17-27 m out
//  * the aerials (older) still have two houses where the lot is now; the restaurant's mapped outline runs 40 m along
//    the road, but the screenshot shows only its south end by the road: a white two-storey house (eaves at 4.85 m, a
//    brown metal gable roof across, ridge at 7.15 m) with a narrower wing on the road side under its own lower roof,
//    a covered terrace along the front on dark posts, a white market umbrella, a closed blue one, red feather flags,
//    a white two-globe lamp, a red menu board on a post by the road and a tall white concrete pole beyond it
//  * a dark blue saloon parked nose-in at the wall; a row of thujas behind the wall and east of the terrace, two small
//    red huts among them, a big spruce, the wood behind
//  * DN1 here: the model's heights follow the wood's canopy (a 9 m hump behind the camera, 4 m ahead of it where the
//    screenshot has the road level along the valley floor): as in photo 65 the long profile becomes the lower convex
//    hull of the model's heights (in the 10 m world grid, from the end of photo 65's stretch to the end of the next
//    ways), pinned level for 165 m past the lot at the model's height there (open ground); the ground around moves
//    with the road and blends back into the model, the lot is levelled
//  * lettering that can't be read on the screenshot (the menu board's lines) is generic
const NB = '1107424498';
const CAM = { s: 1307.5, o: 1.4, yaw: 13.2, pitch: -0.05, fov: 54.1 };
const LEVEL = { s0: 1000, end: 25 };                 // chain metres (from the way by the sign): photo 65's stretch ends at 998
const PIN = [1280, 1445];                            // the level stretch past the lot (along our way)
const LOT = [[1292, 4.05], [1300, 12.5], [1314, 27.3], [1331, 21.6], [1343.8, 17.8], [1350.8, 24], [1392, 24], [1400, 27], [1430, 26], [1438, 4.05]];
const FLAT = [[1284, 4.5], [1296, 16], [1310, 33], [1395, 33], [1405, 30], [1434, 29], [1446, 4.5]];
const WALL = [[1313.2, 27.6], [1331, 21.6], [1343.8, 17.8], [1350.8, 24]];
const EDGE = [1292, 1438];                           // the broken edge line along the lot
const MAIN = { s0: 1355.5, s1: 1367.5, o0: 13.4, o1: 22.5, eave: 4.85, ridge: 7.15 };
const EAST = { s0: 1360, s1: 1367.5, o0: 22.5, o1: 29, eave: 3.6, ridge: 5.2 };      // set back behind the thujas
const WING = { s0: 1353.8, s1: 1367.5, o0: 10.8, o1: 13.4, eave: 4.85, ridge: 5.95 };
const REAR = { s0: 1367.5, s1: 1391, o0: 14, o1: 29, eave: 3.4, ridge: 6.1 };
const TERR = { s0: 1352.3, o0: 8.4, o1: 20.3, yFront: 2.45, yBack: 2.95 };
const UMB = { s: 1350.9, o: 17.7 }, UMB2 = { s: 1351.8, o: 13.3 }, FLAGS = [{ s: 1352.1, o: 8.0 }, { s: 1351.4, o: 15.3 }];
const LAMP = { s: 1353.2, o: 9.0 }, MENU = { s: 1369.9, o: 8.6 }, POLE = { s: 1383.1, o: 7.1 };
const HUTS = [{ s: 1353.5, o: 29.5 }, { s: 1347.5, o: 31.2 }];
// the thujas (s, o, height): east of the terrace and along the wall, as their silhouettes fall on the screenshot
const THUJAS = [[1353.2, 21.2, 7.8], [1351.5, 22.9, 8.1], [1349.5, 24.0, 7.6], [1345.0, 26.1, 8.6], [1341.2, 25.3, 8.0], [1333.0, 28.5, 8.5], [1328.0, 29.3, 9.0], [1322.5, 30.5, 8.7], [1317.0, 31.5, 9.0], [1355.4, 30.4, 8.2]];
const CAR = { s: 1343.0, o: 15.9 };
const UP = [0, 1, 0];

const Wf = (F, s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
const smooth = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
const nodesIn = (G, P, pad) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const { n, ext, step } = G;
  return { i0: Math.max(0, Math.floor((x0 - pad + ext) / step)), i1: Math.min(n - 1, Math.ceil((x1 + pad + ext) / step)), j0: Math.max(0, Math.floor((z0 - pad + ext) / step)), j1: Math.min(n - 1, Math.ceil((z1 + pad + ext) / step)) };
};

// ------------------------------------------------------------------ before the terrain, roads, buildings and trees
export function preparePopas() {
  const nb = road(NB);
  if (!nb || !GEO.W) return false;
  const F = frame(pairs(nb.p));
  // ---- DN1's long profile in the world grid: lower convex hull of the axis heights (moving average +-30 m)
  const FC = frame(chainNB()), s0 = LEVEL.s0, s1 = FC.L - LEVEL.end;
  const pts = [];
  for (let s = s0; ; s += 10) { const ss = Math.min(s, s1), q = FC.at(ss); pts.push([ss, heightAt(q.x, q.z)]); if (ss >= s1) break; }
  // the hull is pinned level through the lot at the model's height there (open ground: no canopy in it; the
  // screenshot has the road level up to the restaurant), so it can't cut the valley floor to one straight line
  const q0 = F.at(MAIN.s0), h0 = heightAt(q0.x, q0.z), pa = F.at(PIN[0]), pb = F.at(PIN[1]);
  const pins = [[FC.local(pa.x, pa.z).s, h0], [FC.local(pb.x, pb.z).s, h0]], hull = [];
  for (const p of [...pts.filter(p => p[0] < pins[0][0]), ...pins, ...pts.filter(p => p[0] > pins[1][0])]) {
    while (hull.length >= 2 && !pins.includes(hull[hull.length - 1])) { const [o, a] = [hull[hull.length - 2], hull[hull.length - 1]]; if ((a[0] - o[0]) * (p[1] - o[1]) - (a[1] - o[1]) * (p[0] - o[0]) <= 0) hull.pop(); else break; }
    hull.push(p);
  }
  const lin = (A, s) => { for (let i = 0; i < A.length - 1; i++) if (s <= A[i + 1][0]) return A[i][1] + (A[i + 1][1] - A[i][1]) * (s - A[i][0]) / (A[i + 1][0] - A[i][0] || 1); return A[A.length - 1][1]; };
  const avg = (A, s) => { let a = 0, k = 0; for (let d = -30; d <= 30; d += 5) { a += lin(A, Math.max(s0, Math.min(s1, s + d))); k++; } return a / k; };
  const W = GEO.W, { n, ext, step, H } = W, H0 = Float32Array.from(H), E = GEO.ext;
  {
    const P = []; for (let s = s0; s <= s1; s += 20) { const q = FC.at(s); P.push([q.x, q.z]); }
    const { i0, i1, j0, j1 } = nodesIn(W, P, 90);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -ext + i * step, z = -ext + j * step;
      if (Math.abs(x) <= E && Math.abs(z) <= E) continue;                    // the near grid's (the seam stays as it is)
      const q = FC.local(x, z);
      if (!q || q.s <= s0 || q.s >= s1 || q.d > 90) continue;
      const o = q.o, p = avg(hull, q.s), g = H0[j * n + i];
      // flat across both carriageways and the median (a 10 m cell touching their verges reaches 10 m beyond them)
      const wCore = o >= 0 ? 1 - smooth(14, 22, o) : 1 - smooth(22, 28, -o);
      const wMove = o >= 0 ? 1 - smooth(40, 75, o) : 1 - smooth(22, 32, -o);  // the ground beside moves with the road
      const moved = g + (p - avg(pts, q.s)) * wMove, tgt = moved + (p - moved) * wCore;
      const wS = smooth(s0, s0 + 60, q.s) * (1 - smooth(s1 - 60, s1, q.s));
      H[j * n + i] = g + (tgt - g) * wS;
    }
  }
  // ---- the model's river cells within 30 m of our line along the stretch: the aerial has no water that close (the
  //      Prahova runs 35-80 m west), and they would float over the lowered ground
  if (GEO.water2) GEO.water2 = GEO.water2.filter(([i, j]) => { const q = FC.local(-ext + (i + 0.5) * step, -ext + (j + 0.5) * step); return !q || q.s <= s0 || q.s >= s1 || q.d > 30; });
  // ---- the lot, the house and the ground behind the wall: level with the road, rising 1 % away from it
  const FL = FLAT.map(([s, o]) => Wf(F, s, o));
  {
    const { i0, i1, j0, j1 } = nodesIn(W, FL, 16);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -ext + i * step, z = -ext + j * step, q = F.local(x, z);
      if (!q || q.o < 5.5) continue;
      const d = inPoly(FL, x, z) ? 0 : polyDist(FL, x, z);
      if (d > 15) continue;
      const qa = F.at(q.s), c = FC.local(qa.x, qa.z);
      const tgt = avg(hull, c.s) + 0.03 + 0.012 * (q.o - 4.95), w = 1 - smooth(0, 15, d);
      H[j * n + i] += (tgt - H[j * n + i]) * w;
    }
  }
  // ---- the houses the aerials still have on the lot are gone; the restaurant is built here (buildPopas)
  const GONE = new Set(['392721042', '392721048', '392721050']);
  GEO.buildings = GEO.buildings.filter(b => !GONE.has(String(b.id)));
  // ---- no wood on the lot; a big spruce by the wall and broadleaves behind (the thujas are built in buildPopas)
  addHolePoly(FL, { noFences: true, scatter: false });
  // ---- the wood round it is broadleaved (the screenshot: yellowing crowns on both sides; the aerial: bare ones in
  //      spring): the mixed stands there become broadleaved, the mapped conifers edge broadleaves
  const RG = [[1240, -90], [1240, 130], [1580, 130], [1580, -90]].map(([s, o]) => Wf(F, s, o)), CONIFER = new Set([2, 9, 10, 15]);
  if (GEO.forestBits) {
    const Fo = GEO.forest, FB = GEO.forestBits, { i0, i1, j0, j1 } = nodesIn(Fo, RG, 0);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!inPoly(RG, -Fo.ext + i * Fo.step, -Fo.ext + j * Fo.step)) continue;
      const k = j * Fo.n + i, sh = (k & 3) << 1;
      if (((FB[k >> 2] >> sh) & 3) >= 2) FB[k >> 2] = (FB[k >> 2] & ~(3 << sh)) | (1 << sh);
    }
  }
  const T = GEO.trees;
  if (T) {
    const keep = [];
    for (let k = 0; k < T.n; k++) if (!inPoly(FL, T.x[k], T.z[k])) { keep.push(k); if (CONIFER.has(T.t[k]) && inPoly(RG, T.x[k], T.z[k])) T.t[k] = 12; }
    const add = [[1337.5, 26.3, 2, 0.9], [1337.2, 33.5, 12, 1.1], [1326.0, 35.5, 12, 1.2], [1350.0, 36.0, 12, 1.25], [1316.5, 37.0, 1, 1.2], [1360.5, 34.0, 12, 1.15]].map(([s, o, t, sc]) => [...Wf(F, s, o), t, sc]);
    const m = keep.length + add.length, x = new Float32Array(m), z = new Float32Array(m), t = new Uint8Array(m), sc = new Float32Array(m);
    keep.forEach((k, i) => { x[i] = T.x[k]; z[i] = T.z[k]; t[i] = T.t[k]; sc[i] = T.s[k]; });
    add.forEach(([ax, az, at, as], i) => { x[keep.length + i] = ax; z[keep.length + i] = az; t[keep.length + i] = at; sc[keep.length + i] = as; });
    GEO.trees = { n: m, x, z, t, s: sc };
  }
  // ---- the broken edge line along the lot (drawn in buildPopas), none of the continuous one there
  nb.noEdgeAt = EDGE; nb.noEdgeSide = 1;
  return true;
}

// ------------------------------------------------------------------ materials
let MT = null;
function mats() {
  if (MT) return MT;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const R = (() => { let s = 66; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967296; })();
  const script = (g, txt, x, y, px, col) => { g.save(); g.fillStyle = col; g.font = `italic bold ${px}px "Brush Script MT", "Segoe Script", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y); g.restore(); };
  // the menu board by the road (1.7 x 2.3 m): red, two lines of white lettering (not legible), the soft drink's band
  const mb = canvas(170, 230), b = mb.getContext('2d');
  b.fillStyle = '#c42a2c'; b.fillRect(0, 0, 170, 230);
  b.fillStyle = '#f3efe9';
  for (const [y, w] of [[34, 128], [58, 100], [96, 118], [118, 86]]) b.fillRect(85 - w / 2, y - 7, w, 12);
  b.fillStyle = '#e8e2dc'; b.fillRect(8, 146, 154, 3); b.fillRect(8, 78, 154, 3);
  script(b, 'Coca-Cola', 85, 188, 34, '#f6f2ee');
  b.strokeStyle = '#efe9e2'; b.lineWidth = 4; b.strokeRect(3, 3, 164, 224);
  grain(b, 170, 230, 10, R);
  // the sign on the wing's upper floor (2.3 x 0.75 m): white, red rim and lettering
  const ws = canvas(230, 75), w = ws.getContext('2d');
  w.fillStyle = '#f2eeea'; w.fillRect(0, 0, 230, 75);
  w.fillStyle = '#c42a2c'; w.fillRect(0, 0, 230, 12); w.fillRect(0, 63, 230, 12);
  script(w, 'Coca-Cola', 115, 38, 36, '#c42a2c');
  grain(w, 230, 75, 8, R);
  // a feather flag (0.65 x 2.6 m): red, rounded top, white lettering down its length
  const ff = canvas(65, 260), f = ff.getContext('2d');
  f.clearRect(0, 0, 65, 260); f.fillStyle = '#d0282c';
  f.beginPath(); f.moveTo(0, 260); f.lineTo(0, 30); f.quadraticCurveTo(4, 0, 60, 6); f.quadraticCurveTo(66, 130, 50, 260); f.closePath(); f.fill();
  f.save(); f.translate(30, 150); f.rotate(-Math.PI / 2); script(f, 'Coca-Cola', 0, 0, 26, '#f6f2ee'); f.restore();
  // the closed parasol: blue with a white print
  const pb = canvas(64, 128), p = pb.getContext('2d');
  p.fillStyle = '#2d63b8'; p.fillRect(0, 0, 64, 128);
  p.fillStyle = '#e9eef4'; for (let k = 0; k < 7; k++) { p.beginPath(); p.arc(10 + R() * 44, 14 + k * 17, 4 + R() * 4, 0, 7); p.fill(); }
  const face = (c, o = {}) => std({ map: tex(c), roughness: 0.6, transparent: false, alphaTest: o.alpha ? 0.5 : 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
  MT = {
    gravel: Object.assign(M.gravel.clone(), { color: new THREE.Color(0xf0ece6), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    marking: M.marking, stucco: M.stuccoWhite, stone: Object.assign(M.stoneWall.clone(), { color: new THREE.Color(0x8a8b90) }), wood: M.woodDark, glass: M.windowDark, pole: M.concretePole,
    roof: Object.assign(M.roofMetalBrown.clone(), { color: new THREE.Color(0x9a7a6c), side: THREE.DoubleSide }),
    roofT: Object.assign(M.roofMetalBrown.clone(), { color: new THREE.Color(0x6f5a52), side: THREE.DoubleSide }),
    menu: face(mb), sign: face(ws), flag: face(ff, { alpha: true, double: true }), blue: face(pb),
    white: std({ color: 0xf2f1ec, roughness: 0.55 }), fabric: std({ color: 0xf4f3ef, roughness: 0.85, side: THREE.DoubleSide }),
    red: std({ color: 0x8a2a26, roughness: 0.8 }), redRoof: std({ color: 0x7e2620, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
    dark: std({ color: 0x2a2624, roughness: 0.7 }), galv: M.galv, globe: M.lampGlass, pot: std({ color: 0x9c5b3a, roughness: 0.8 }),
    flowers: std({ color: 0xe0a326, roughness: 0.8 }), ac: std({ color: 0xe4e4e0, roughness: 0.5 }), thuja: grigorescuMats().thuja,
  };
  return MT;
}

// ------------------------------------------------------------------ build
export function buildPopas(B, world) {
  const nb = road(NB);
  if (!nb || !GEO.W) return null;
  const Mt = mats(), F = frame(pairs(nb.p));
  const A = { gravel: new Acc(), marking: new Acc(), stucco: new Acc(), roof: new Acc(), roofT: new Acc(), stone: new Acc(), red: new Acc(), redRoof: new Acc(), menu: new Acc(), sign: new Acc(), flag: new Acc(), fabric: new Acc() };
  const G = { wood: [], glass: [], white: [], dark: [], galv: [], globe: [], pole: [], blue: [], pot: [], flowers: [], ac: [], red: [], thuja: [] };
  const box = (x, z, hx, hz, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hx, hz, rot, y0, y1, tag));
  const [ux, uz] = F.dir(1360), rx = -uz, rz = ux, ROT = -Math.atan2(uz, ux);   // along the road, to its right
  const P2 = (s, o) => Wf(F, s, o), P3 = (s, o, y) => { const [x, z] = P2(s, o); return [x, y, z]; };
  const gy = (s, o) => { const [x, z] = P2(s, o); return heightAt(x, z); };
  const yAx = (s) => { const q = F.at(s); return heightAt(q.x, q.z); };

  // ---- the gravel lot, from the road's gravel strip to the wall and round the house
  drape(A.gravel, LOT.map(([s, o]) => P2(s, o)), 0.03, 2, 1.6);
  // ---- the broken edge line: 1 m dashes, 0.85 m gaps, 0.16 m wide, on the carriageway (flat across at the axis level)
  for (let s = EDGE[0]; s + 1 <= EDGE[1]; s += 1.85) {
    const ya = yAx(s) + 0.035 + 0.004, yb = yAx(s + 1) + 0.035 + 0.004, o0 = 4.05 - 0.35 - 0.08, o1 = o0 + 0.16;
    A.marking.quad(P3(s, o0, ya), P3(s + 1, o0, yb), P3(s + 1, o1, yb), P3(s, o1, ya), UP, [0, 0, 0.25, 0, 0.25, 1, 0, 1]);
  }
  // ---- the low wall of grey stones along the back of the lot (0.6 m over the gravel, the ground behind it higher)
  for (let i = 0; i < WALL.length - 1; i++) {
    const [s0, o0] = WALL[i], [s1, o1] = WALL[i + 1], L = Math.hypot(s1 - s0, o1 - o0), k = Math.ceil(L / 2);
    for (let j = 0; j < k; j++) {
      const a = P2(s0 + (s1 - s0) * j / k, o0 + (o1 - o0) * j / k), b = P2(s0 + (s1 - s0) * (j + 1) / k, o0 + (o1 - o0) * (j + 1) / k);
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, l = Math.hypot(b[0] - a[0], b[1] - a[1]), ax = (b[0] - a[0]) / l, az = (b[1] - a[1]) / l;
      const y0 = Math.min(heightAt(a[0], a[1]), heightAt(b[0], b[1])) - 0.25, y1 = Math.max(heightAt(a[0], a[1]), heightAt(b[0], b[1])) + 0.6;
      slab(A.stone, cx, cz, ax, az, l / 2 + 0.02, 0.22, y0, y1, 1.6);
      box(cx, cz, l / 2, 0.24, Math.atan2(-az, ax), y0, y1, 'wall');
    }
  }

  // ---- the restaurant: ground level at its front; walls, roofs, windows
  const yG = Math.max(gy(MAIN.s0, MAIN.o0), gy(WING.s0, WING.o0), gy(TERR.s0, TERR.o0), gy(TERR.s0, TERR.o1)) + 0.02, yF = yG + 0.15;
  const base = Math.min(gy(REAR.s1, REAR.o0), gy(TERR.s0, TERR.o0), gy(MAIN.s0, MAIN.o0)) - 0.4;
  const block = (b, eave) => {
    const c = [[b.s0, b.o0], [b.s1, b.o0], [b.s1, b.o1], [b.s0, b.o1]];
    // faces: west (o0), north (s1), east (o1), south (s0): outward normals
    const out = [[-rx, 0, -rz], [ux, 0, uz], [rx, 0, rz], [-ux, 0, -uz]];
    for (let k = 0; k < 4; k++) {
      const [sa, oa] = c[k], [sb, ob] = c[(k + 1) % 4], L = Math.hypot(sb - sa, ob - oa);
      A.stucco.quad(P3(sa, oa, base), P3(sb, ob, base), P3(sb, ob, yG + eave), P3(sa, oa, yG + eave), out[k], [0, base / 2.5, L / 2.5, base / 2.5, L / 2.5, (yG + eave) / 2.5, 0, (yG + eave) / 2.5]);
    }
    const [cx, cz] = P2((b.s0 + b.s1) / 2, (b.o0 + b.o1) / 2);
    box(cx, cz, (b.s1 - b.s0) / 2, (b.o1 - b.o0) / 2, Math.atan2(-uz, ux), base, yG + eave + 1.5, 'house');
  };
  block(MAIN, MAIN.eave); block(WING, WING.eave); block(EAST, EAST.eave); block(REAR, REAR.eave);
  // roofs: the main block's gable across (its west end under the wing's roof), hipped wing and back part
  const ov = 0.5;
  {
    const b = MAIN, sm = (b.s0 + b.s1) / 2, t = (b.ridge - b.eave) / (sm - b.s0), yE = yG + b.eave - ov * t, yR = yG + b.ridge;
    for (const [se, sgn] of [[b.s0 - ov, -1], [b.s1 + ov, 1]]) {
      const l = Math.hypot(sm - se, yR - yE);
      A.roof.quad(P3(se, b.o0 - ov, yE), P3(se, b.o1 + ov, yE), P3(sm, b.o1 + ov, yR), P3(sm, b.o0 - ov, yR), [ux * sgn * 0.4, 1, uz * sgn * 0.4], [0, 0, (b.o1 - b.o0 + 2 * ov) / 1.2, 0, (b.o1 - b.o0 + 2 * ov) / 1.2, l / 1.2, 0, l / 1.2]);
    }
    for (const [o, sgn] of [[b.o0, -1], [b.o1, 1]]) {
      const a = P3(b.s0, o, yG + b.eave), c = P3(b.s1, o, yG + b.eave), r = P3(sm, o, yR);
      A.stucco.quad(a, c, r, r, [rx * sgn, 0, rz * sgn], [0, 0, (b.s1 - b.s0) / 2.5, 0, (b.s1 - b.s0) / 5, (b.ridge - b.eave) / 2.5, (b.s1 - b.s0) / 5, (b.ridge - b.eave) / 2.5]);
    }
  }
  const hip = (acc, b, ovh) => {   // ridge along the road
    const om = (b.o0 + b.o1) / 2, hw = (b.o1 - b.o0) / 2, t = (b.ridge - b.eave) / hw, yE = yG + b.eave - ovh * t, yR = yG + b.ridge;
    const r0 = Math.min(b.s0 + hw, (b.s0 + b.s1) / 2), r1 = Math.max(b.s1 - hw, (b.s0 + b.s1) / 2);
    const c1 = P3(b.s0 - ovh, b.o0 - ovh, yE), c2 = P3(b.s1 + ovh, b.o0 - ovh, yE), c3 = P3(b.s1 + ovh, b.o1 + ovh, yE), c4 = P3(b.s0 - ovh, b.o1 + ovh, yE);
    const k1 = P3(r0, om, yR), k2 = P3(r1, om, yR), L = b.s1 - b.s0 + 2 * ovh, sl = Math.hypot(hw + ovh, b.ridge - b.eave + ovh * t);
    acc.quad(c1, c2, k2, k1, [-rx * 0.5, 1, -rz * 0.5], [0, 0, L / 1.2, 0, L / 1.2, sl / 1.2, 0, sl / 1.2]);
    acc.quad(c3, c4, k1, k2, [rx * 0.5, 1, rz * 0.5], [0, 0, L / 1.2, 0, L / 1.2, sl / 1.2, 0, sl / 1.2]);
    acc.quad(c4, c1, k1, k1, [-ux * 0.5, 1, -uz * 0.5], [0, 0, (hw + ovh) * 2 / 1.2, 0, (hw + ovh) / 1.2, sl / 1.2, (hw + ovh) / 1.2, sl / 1.2]);
    acc.quad(c2, c3, k2, k2, [ux * 0.5, 1, uz * 0.5], [0, 0, (hw + ovh) * 2 / 1.2, 0, (hw + ovh) / 1.2, sl / 1.2, (hw + ovh) / 1.2, sl / 1.2]);
  };
  hip(A.roof, WING, 0.45); hip(A.roof, EAST, 0.45); hip(A.roof, REAR, 0.45);
  // windows: dark glass in a white frame, on the wall's outer face (n: outward normal as [nx, nz])
  const win = (s, o, n, y0, w, h) => {
    const [x, z] = P2(s, o), t = [-n[1], n[0]], rot = -Math.atan2(t[1], t[0]), yc = yG + y0 + h / 2;
    boxAt(G.white, x + n[0] * 0.03, yc, z + n[1] * 0.03, w + 0.14, h + 0.14, 0.06, rot);
    boxAt(G.glass, x + n[0] * 0.05, yc, z + n[1] * 0.05, w, h, 0.06, rot);
  };
  const S = [-ux, -uz], Wd = [-rx, -rz], E2 = [rx, rz], N2 = [ux, uz];
  for (const o of [15.4, 17.3, 19.4]) win(MAIN.s0, o, S, 3.75, 0.9, 0.8);                       // upper floor, south
  win(EAST.s0, 25.8, S, 0.9, 1.4, 1.2);
  // the ground floor under the terrace: glazed fronts in dark frames (in the terrace's shade on the screenshot)
  for (const [s0, o0, o1] of [[MAIN.s0, 13.6, 20.3], [WING.s0, 11.0, 13.2]]) {
    const [x, z] = P2(s0 - 0.03, (o0 + o1) / 2);
    boxAt(G.glass, x, yF + 1.3, z, o1 - o0, 2.6, 0.06, ROT + Math.PI / 2);
    for (let o = o0 + 0.05; o <= o1; o += (o1 - o0) / Math.max(1, Math.round((o1 - o0) / 1.4))) { const [mx, mz] = P2(s0 - 0.07, o); boxAt(G.wood, mx, yF + 1.3, mz, 0.1, 2.6, 0.06, ROT); }
    const [tx, tz] = P2(s0 - 0.07, (o0 + o1) / 2); boxAt(G.wood, tx, yF + 2.62, tz, o1 - o0, 0.1, 0.06, ROT + Math.PI / 2);
  }
  for (const s of [1357.6, 1363.4]) { win(s, WING.o0, Wd, 3.5, 0.6, 0.9); win(s, WING.o0, Wd, 0.9, 0.9, 1.2); }
  win(1357.8, MAIN.o1, E2, 3.6, 1.0, 1.0); win(1357.8, MAIN.o1, E2, 0.9, 1.2, 1.2); win(1364, EAST.o1, E2, 0.9, 1.2, 1.2);
  for (const s of [1371, 1376, 1381, 1386]) { win(s, REAR.o0, Wd, 0.9, 1.2, 1.2); win(s, REAR.o1, E2, 0.9, 1.2, 1.2); }
  for (const o of [17, 21, 25]) win(REAR.s1, o, N2, 0.9, 1.2, 1.2);
  // the air conditioners under the upper windows, the sign on the wing's upper floor
  for (const o of [16.0, 19.9]) { const [x, z] = P2(MAIN.s0 - 0.17, o); boxAt(G.ac, x, yG + 3.25, z, 0.8, 0.55, 0.3, ROT + Math.PI / 2); }
  {
    const s = WING.s0 - 0.04, o0 = WING.o0 + 0.1, o1 = WING.o1 - 0.1, y0 = yG + 3.8, y1 = yG + 4.55;
    A.sign.quad(P3(s, o0, y0), P3(s, o1, y0), P3(s, o1, y1), P3(s, o0, y1), [-ux, 0, -uz], [0, 0, 1, 0, 1, 1, 0, 1]);
  }

  // ---- the covered terrace: a floor slab, dark posts, a lean-to roof with a fascia
  {
    const t = TERR, s1 = MAIN.s0, yb = yG + t.yBack, yf = yG + t.yFront;
    slab(A.stucco, ...P2(t.s0 + (s1 - t.s0) / 2, (t.o0 + t.o1) / 2), rx, rz, (t.o1 - t.o0) / 2, (s1 - t.s0) / 2, base, yF, 2.5);
    for (const o of [8.55, 10.9, 13.3, 15.8, 18.1, 20.15]) { const [x, z] = P2(t.s0 + 0.15, o); boxAt(G.wood, x, (yF + yf) / 2, z, 0.12, yf - yF, 0.12, ROT); box(x, z, 0.07, 0.07, 0, yF, yf, 'post'); }
    { const [x, z] = P2(1353.9, 8.55); boxAt(G.wood, x, (yF + yb) / 2, z, 0.12, yb - yF, 0.12, ROT); }
    const L = t.o1 - t.o0 + 0.2, D = Math.hypot(s1 - t.s0 + 0.2, yb - yf);
    A.roofT.quad(P3(t.s0 - 0.2, t.o0 - 0.1, yf - 0.02), P3(t.s0 - 0.2, t.o1 + 0.1, yf - 0.02), P3(s1, t.o1 + 0.1, yb), P3(s1, t.o0 - 0.1, yb), [-ux * 0.2, 1, -uz * 0.2], [0, 0, L / 1.2, 0, L / 1.2, D / 1.2, 0, D / 1.2]);
    const [fx, fz] = P2(t.s0 - 0.2, (t.o0 + t.o1) / 2); boxAt(G.wood, fx, yf - 0.1, fz, t.o1 - t.o0 + 0.2, 0.2, 0.05, ROT + Math.PI / 2);
    const [lx, lz] = P2((t.s0 + s1) / 2 - 0.1, t.o0 - 0.1); boxAt(G.wood, lx, (yf + yb) / 2 - 0.1, lz, s1 - t.s0 + 0.2, 0.2, 0.05, ROT);
    box(...P2((t.s0 + s1) / 2, (t.o0 + t.o1) / 2), (t.o1 - t.o0) / 2, (s1 - t.s0) / 2, Math.atan2(-rz, rx), base, yF, 'terrace');
    // under it: a white chest freezer with flowers on it, a white A-board, flower pots
    let [x, z] = P2(1352.9, 9.4); boxAt(G.white, x, yF + 0.45, z, 1.1, 0.9, 0.7, ROT); boxAt(G.flowers, x, yF + 1.0, z, 0.5, 0.2, 0.3, ROT);
    [x, z] = P2(1351.7, 9.3); boxAt(G.white, x, gy(1351.7, 9.3) + 0.5, z, 0.6, 1.0, 0.25, ROT + Math.PI / 2 + 0.3);
    for (const [s, o] of [[1352.7, 11.6], [1352.5, 14.2], [1352.6, 22.0]]) { [x, z] = P2(s, o); cyl(G.pot, x, yF, z, 0.45, 0.2, 0.26, 10); cyl(G.flowers, x, yF + 0.45, z, 0.25, 0.3, 0.2, 10); }
  }
  // ---- the white market umbrella, the closed blue one, the feather flags, the two-globe lamp
  {
    const [x, z] = P2(UMB.s, UMB.o), y = gy(UMB.s, UMB.o);
    cyl(G.white, x, y, z, 2.95, 0.03); boxAt(G.dark, x, y + 0.05, z, 0.5, 0.1, 0.5, ROT);
    const c = new THREE.ConeGeometry(2.0 * Math.SQRT2, 0.8, 4, 1, true); c.rotateY(Math.PI / 4 + ROT); c.translate(x, y + 2.15 + 0.4, z);
    const v = new THREE.CylinderGeometry(2.0 * Math.SQRT2, 2.0 * Math.SQRT2, 0.22, 4, 1, true); v.rotateY(Math.PI / 4 + ROT); v.translate(x, y + 2.04, z);
    B.geo(Mt.fabric, merged([c, v]));
    box(x, z, 0.1, 0.1, 0, y, y + 2.9, 'post');
  }
  {
    const [x, z] = P2(UMB2.s, UMB2.o), y = gy(UMB2.s, UMB2.o);
    cyl(G.white, x, y, z, 3.6, 0.025); boxAt(G.dark, x, y + 0.05, z, 0.45, 0.1, 0.45, ROT);
    const c = new THREE.CylinderGeometry(0.05, 0.24, 2.2, 10); c.translate(x, y + 2.4, z); G.blue.push(c);
  }
  for (const fl of FLAGS) {
    const [x, z] = P2(fl.s, fl.o), y = gy(fl.s, fl.o), a = 0.7, dx = -ux * Math.sin(a) + rx * Math.cos(a), dz = -uz * Math.sin(a) + rz * Math.cos(a);   // the banner's width faces the road
    cyl(G.dark, x, y, z, 3.3, 0.02, 0.015, 6); boxAt(G.dark, x, y + 0.04, z, 0.4, 0.08, 0.4, ROT);
    const P = (u, h) => [x + dx * u, y + h, z + dz * u], nx = -dz, nz = dx;
    A.flag.quad(P(0.02, 0.7), P(0.67, 0.7), P(0.67, 3.3), P(0.02, 3.3), [nx, 0, nz], [0, 0, 1, 0, 1, 1, 0, 1]);
  }
  {
    const [x, z] = P2(LAMP.s, LAMP.o), y = gy(LAMP.s, LAMP.o);
    cyl(G.white, x, y, z, 4.35, 0.07, 0.05, 10);
    const g1 = new THREE.SphereGeometry(0.24, 14, 10); g1.translate(x, y + 4.58, z); G.globe.push(g1);
    const [ax, az] = [x - ux * 0.35, z - uz * 0.35]; tube(G.white, [x, y + 3.35, z], [ax, y + 3.45, az], 0.025, 5);
    const g2 = new THREE.SphereGeometry(0.22, 14, 10); g2.translate(ax, y + 3.62, az); G.globe.push(g2);
    box(x, z, 0.08, 0.08, 0, y, y + 4.4, 'lamp');
  }
  // ---- the red menu board on its post by the road, and the tall white concrete pole beyond it
  {
    const [x, z] = P2(MENU.s, MENU.o), y = gy(MENU.s, MENU.o), a = 0.17, fx = -ux * Math.cos(a) - rx * Math.sin(a), fz = -uz * Math.cos(a) - rz * Math.sin(a);   // faces the traffic
    const nx = fz, nz = -fx, rot = -Math.atan2(nz, nx), w = 1.7, h = 2.3, y0 = y + 1.2;
    boxAt(G.dark, x, y + 0.6, z, 0.4, 1.2, 0.3, rot);
    boxAt(G.red, x - fx * 0.06, y0 + h / 2, z - fz * 0.06, w + 0.06, h + 0.06, 0.12, rot);
    A.menu.quad([x - nx * w / 2 + fx * 0.005, y0, z - nz * w / 2 + fz * 0.005], [x + nx * w / 2 + fx * 0.005, y0, z + nz * w / 2 + fz * 0.005], [x + nx * w / 2 + fx * 0.005, y0 + h, z + nz * w / 2 + fz * 0.005], [x - nx * w / 2 + fx * 0.005, y0 + h, z - nz * w / 2 + fz * 0.005], [fx, 0, fz], [0, 0, 1, 0, 1, 1, 0, 1]);
    box(x, z, w / 2, 0.2, Math.atan2(-nz, nx), y, y0 + h, 'sign');
  }
  {
    const [x, z] = P2(POLE.s, POLE.o), y = gy(POLE.s, POLE.o);
    cyl(G.pole, x, y - 0.3, z, 9.8, 0.16, 0.1, 10);
    const [bx, bz] = [x - rx * 0.25, z - rz * 0.25]; boxAt(G.pole, bx, y + 5.2, bz, 0.12, 0.3, 0.5, ROT);
    box(x, z, 0.16, 0.16, 0, y, y + 9.5, 'pole');
  }
  // ---- the thujas: columns ~0.75 m in radius, 7.6-9 m tall
  THUJAS.forEach(([s, o, h], k) => { const [x, z] = P2(s, o), y = gy(s, o); thuja(G.thuja, x, y, z, h, 0.78, 66 + k * 1.7); box(x, z, 0.45, 0.45, 0, y, y + h * 0.8, 'tree'); });
  // ---- the two small red huts among the thujas (red boarding, white windows, red gable roofs)
  for (const h of HUTS) {
    const y = gy(h.s, h.o) - 0.1, hs = 1.1, ho = 1.1, eave = 3.6, rise = 1.6;
    const [cx, cz] = P2(h.s, h.o);
    slab(A.red, cx, cz, ux, uz, hs, ho, y - 0.2, y + eave, 1.2);
    for (const sg of [-1, 1]) {
      const e = P3(h.s - hs - 0.3, h.o + sg * (ho + 0.3), y + eave - 0.2), f = P3(h.s + hs + 0.3, h.o + sg * (ho + 0.3), y + eave - 0.2), r1 = P3(h.s + hs + 0.3, h.o, y + eave + rise), r0 = P3(h.s - hs - 0.3, h.o, y + eave + rise);
      A.redRoof.quad(e, f, r1, r0, [rx * sg * 0.6, 1, rz * sg * 0.6], [0, 0, 1, 0, 1, 1, 0, 1]);
      const g0 = P3(h.s + sg * hs, h.o - ho, y + eave), g1 = P3(h.s + sg * hs, h.o + ho, y + eave), g2 = P3(h.s + sg * hs, h.o, y + eave + rise);
      A.red.quad(g0, g1, g2, g2, [ux * sg, 0, uz * sg], [0, 0, 1, 0, 0.5, 1, 0.5, 1]);
    }
    for (const sg of [-1, 1]) { const [x, z] = P2(h.s - hs - 0.02, h.o + sg * 0.46); boxAt(G.white, x, y + 1.9, z, 0.84, 1.3, 0.06, ROT + Math.PI / 2); boxAt(G.dark, x - ux * 0.02, y + 1.9, z - uz * 0.02, 0.66, 1.1, 0.06, ROT + Math.PI / 2); }
    box(cx, cz, hs, ho, Math.atan2(-uz, ux), y - 0.2, y + eave + rise, 'hut');
  }

  // ---- flush
  A.gravel.flush(B, Mt.gravel, null, { noCast: true }); A.marking.flush(B, Mt.marking, null, { noCast: true });
  A.stucco.flush(B, Mt.stucco); A.roof.flush(B, Mt.roof); A.roofT.flush(B, Mt.roofT); A.stone.flush(B, Mt.stone);
  A.red.flush(B, Mt.red); A.redRoof.flush(B, Mt.redRoof); A.menu.flush(B, Mt.menu); A.sign.flush(B, Mt.sign); A.flag.flush(B, Mt.flag, null, { noCast: true });
  for (const k of Object.keys(G)) if (G[k].length) B.geo(Mt[k], merged(G[k]));

  // photo 66's view: the Street View camera in our right lane, turned 13° to the right
  const [cx, cz] = Wf(F, CAM.s, CAM.o), [vx, vz] = F.dir(CAM.s), a = CAM.yaw * Math.PI / 180;
  const dx = vx * Math.cos(a) - vz * Math.sin(a), dz = vz * Math.cos(a) + vx * Math.sin(a);
  const [kx, kz] = P2(CAR.s, CAR.o);
  return { type: 'popas', name: 'DN1 · restaurantul de la drum', view: { from: [cx, cz], to: [cx + dx * 60, cz + dz * 60], pitch: CAM.pitch, fov: CAM.fov },
    cars: [{ x: kx, z: kz, h: Math.atan2(-rx, -rz), model: 'sedan', paint: 0x1f2c47 }] };   // nose to the wall
}

// an upright box (a wall, a slab) with its UVs in metres / tile: centre (x, z), half-length hl along (ax, az), half-thickness ht
function slab(acc, x, z, ax, az, hl, ht, y0, y1, tile = 2.5) {
  const nx = -az, nz = ax, C = (a, b, y) => [x + ax * a + nx * b, y, z + az * a + nz * b];
  const L = hl * 2 / tile, T = ht * 2 / tile, v0 = y0 / tile, v1 = y1 / tile;
  acc.quad(C(-hl, ht, y0), C(hl, ht, y0), C(hl, ht, y1), C(-hl, ht, y1), [nx, 0, nz], [0, v0, L, v0, L, v1, 0, v1]);
  acc.quad(C(hl, -ht, y0), C(-hl, -ht, y0), C(-hl, -ht, y1), C(hl, -ht, y1), [-nx, 0, -nz], [0, v0, L, v0, L, v1, 0, v1]);
  acc.quad(C(hl, ht, y0), C(hl, -ht, y0), C(hl, -ht, y1), C(hl, ht, y1), [ax, 0, az], [0, v0, T, v0, T, v1, 0, v1]);
  acc.quad(C(-hl, -ht, y0), C(-hl, ht, y0), C(-hl, ht, y1), C(-hl, -ht, y1), [-ax, 0, -az], [0, v0, T, v0, T, v1, 0, v1]);
  acc.quad(C(-hl, -ht, y1), C(hl, -ht, y1), C(hl, ht, y1), C(-hl, ht, y1), UP, [0, 0, L, 0, L, T, 0, T]);
}
