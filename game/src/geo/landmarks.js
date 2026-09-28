import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt, upRoad, upHeight } from './data.js';
import { M } from '../materials.js';
import { buildPrahovaBridge } from './bridge.js';
import { buildGrigorescu } from './grigorescu.js';
import { buildCornu } from './cornu.js';
import { buildEtu } from './etu.js';
import { buildPitigaia } from './pitigaia.js';

// Landmarks built from the user's photos (positions from the coordinates they sent, see build_geo.py).

// Photo 24: white-painted lattice steel cross on a concrete slab, on the hill above Strada Măgurii.
// Proportions measured on the photo: ~10 m above the slab, arms ~6.2 m wide at ~2/3 of the height,
// 0.8 m square trusses (corner chords, battens every panel, X bracing on every face),
// four inclined legs, rust-stained tension rods between arms and column, 6.2 m square slab.
const DIM = { a: 0.8, H: 10.0, armY: 6.6, armL: 3.1, arm: 0.76, panel: 0.8, slab: 6.2, slabTop: 0.35 };

function bar(list, p, q, w = 0.05, d = w) {
  const dir = new THREE.Vector3().subVectors(q, p), len = dir.length();
  const g = new THREE.BoxGeometry(w, len, d);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
  list.push(g);
}

// truss along an axis: u = unit vector of the axis, v/w = the two cross directions (half size s),
// from o over length L, split into panels with battens and X bracing on the 4 faces
function truss(list, o, u, v, w, s, L, panel, chord = 0.08, lace = 0.045, capStart = true, capEnd = true) {
  const P = (t, a, b) => o.clone().addScaledVector(u, t).addScaledVector(v, a * s).addScaledVector(w, b * s);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [a, b] of corners) bar(list, P(0, a, b), P(L, a, b), chord);
  const n = Math.max(1, Math.round(L / panel)), step = L / n;
  for (let k = 0; k <= n; k++) {
    const t = k * step;
    if ((k === 0 && !capStart) || (k === n && !capEnd)) continue;
    for (let c = 0; c < 4; c++) { const [a, b] = corners[c], [a2, b2] = corners[(c + 1) % 4]; bar(list, P(t, a, b), P(t, a2, b2), lace); }
  }
  for (let k = 0; k < n; k++) {
    const t0 = k * step, t1 = t0 + step;
    for (let c = 0; c < 4; c++) {
      const [a, b] = corners[c], [a2, b2] = corners[(c + 1) % 4];
      bar(list, P(t0, a, b), P(t1, a2, b2), lace * 0.9);
      bar(list, P(t0, a2, b2), P(t1, a, b), lace * 0.9);
    }
  }
}

function crossGeometry() {
  const { a, H, armY, armL, arm, panel, slab, slabTop } = DIM;
  const white = [], rust = [], concrete = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  const y0 = slabTop, s = a / 2;
  // column (arms level: the column's own panels continue through)
  truss(white, V(0, y0, 0), Y, X, Z, s, H, panel, 0.09, 0.05);
  // arms, from the column faces outwards
  for (const sg of [-1, 1]) truss(white, V(sg * s, y0 + armY, 0), V(sg, 0, 0), Y, Z, arm / 2, armL - s, arm, 0.08, 0.045, false, true);
  // four inclined legs from the slab to the column faces, with base plates
  const legTop = y0 + 2.4, legOut = 1.55;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    bar(white, V(dx * legOut, y0 + 0.02, dz * legOut), V(dx * s, legTop, dz * s), 0.13, 0.13);
    const pl = new THREE.BoxGeometry(0.36, 0.02, 0.36); pl.translate(dx * legOut, y0 + 0.01, dz * legOut); white.push(pl);
  }
  const bp = new THREE.BoxGeometry(a + 0.3, 0.025, a + 0.3); bp.translate(0, y0 + 0.012, 0); white.push(bp);
  // rust-stained tension rods between the arms and the column (front and back faces), bolted plates at the joints
  for (const sg of [-1, 1]) for (const zz of [-s, s]) {
    bar(rust, V(sg * s, y0 + armY + arm / 2 + 0.6, zz), V(sg * (s + 0.55), y0 + armY + arm / 2, zz), 0.04);
    bar(rust, V(sg * s, y0 + armY - arm / 2 - 0.6, zz), V(sg * (s + 0.55), y0 + armY - arm / 2, zz), 0.04);
    for (const yy of [armY + arm / 2, armY - arm / 2]) {
      const pl = new THREE.BoxGeometry(0.1, 0.1, 0.012); pl.translate(sg * (s + 0.01), y0 + yy, zz + Math.sign(zz) * 0.05); rust.push(pl);
    }
  }
  // concrete slab (sunk into the slope)
  const sb = new THREE.BoxGeometry(slab, slabTop + 0.6, slab); sb.translate(0, (slabTop - 0.6) / 2, 0); concrete.push(sb);
  return { white: mergeGeometries(white), rust: mergeGeometries(rust), concrete: mergeGeometries(concrete) };
}

export function buildLandmarks(B, world) {
  const out = [];
  const lms = GEO.landmarks || [];
  for (const U of GEO.ups || []) out.push(buildUnderpass(B, world, U));
  buildStreetDetails(B, world);
  const br = buildPrahovaBridge(B, world);
  if (br) out.push(br);
  const gr = buildGrigorescu(B, world);
  if (gr) out.push(gr);
  const co = buildCornu(B, world);
  if (co) out.push(co);
  const etu = buildEtu(B, world);
  if (etu) out.push(etu);
  const pit = buildPitigaia(B, world);
  if (pit) out.push(pit);
  if (!lms.length) return out;
  const mats = {
    white: new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.42, metalness: 0.25 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x7b4a2f, roughness: 0.8, metalness: 0.35 }),
  };
  for (const lm of lms) {
    if (lm.type !== 'cross') continue;
    const g = crossGeometry();
    const T = new THREE.Matrix4().makeRotationY(lm.rot).setPosition(lm.x, lm.y, lm.z);
    B.geo(mats.white, g.white, T);
    B.geo(mats.rust, g.rust, T, null, { noCast: true });
    B.geo(M.concrete, g.concrete, T);
    // walkable slab (a height region) and solid column / legs
    const { slab, slabTop, a } = DIM, h = slab / 2, c = Math.cos(lm.rot), s = Math.sin(lm.rot);
    const R = h * (Math.abs(c) + Math.abs(s));
    world.addRegion(lm.x - R, lm.x + R, lm.z - R, lm.z + R, 0, (x, z) => {
      const dx = x - lm.x, dz = z - lm.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
      return Math.abs(lx) <= h && Math.abs(lz) <= h ? lm.y + slabTop : world.terrainFn(x, z);
    });
    world.addStatic(new world.Box(lm.x, lm.z, a / 2 + 0.1, a / 2 + 0.1, lm.rot, lm.y - 1, lm.y + DIM.H + 1, 'cross'));
    out.push({ ...lm, height: DIM.H });
  }
  return out;
}

// ------------------------------------------------------------------ railway underpass (photos 25-29)
// DJ100E under the CF 300 line by Strada Gării: stone masonry abutments whose tops follow the embankment,
// a concrete deck with yellow stiffeners, black-and-white striped edge beam, '3 m' height-limit signs,
// galvanised railing on top, sidewalk with a yellow railing and a white-painted wall band on the north-west side.
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
let UPM = null;
function upMats() {
  if (UPM) return UPM;
  const stripes = canvasTex(128, 16, (g, w, h) => { for (let i = 0; i < 2; i++) { g.fillStyle = i ? '#f2f2ee' : '#141414'; g.fillRect(i * w / 2, 0, w / 2, h); } }, true);
  const sign = canvasTex(128, 128, (g) => {
    g.fillStyle = '#fbfbf8'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.fillStyle = '#c4161c'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.arc(64, 64, 48, 0, 7, true); g.fill();
    g.fillStyle = '#111'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('3m', 64, 66);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(52, 64 + s * 38); g.lineTo(76, 64 + s * 38); g.lineTo(64, 64 + s * 26); g.fill(); }
  });
  const km = canvasTex(64, 96, (g) => {
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 64, 96);
    g.fillStyle = '#2b5fa8'; g.fillRect(0, 0, 64, 34);
    g.fillStyle = '#fff'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('21', 32, 18);
    g.fillStyle = '#111'; g.font = 'bold 13px Arial'; g.fillText('DJ 100E', 32, 58);
  });
  UPM = {
    stone: M.stoneWall, concrete: M.concrete, galv: M.galv,
    under: new THREE.MeshStandardMaterial({ color: 0x55534f, roughness: 0.95 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xe0b81c, roughness: 0.45, metalness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.85 }),
    stripes: new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, roughness: 0.4 }),
    km: new THREE.MeshStandardMaterial({ map: km, roughness: 0.6 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xa4553a, roughness: 0.8 }),
  };
  return UPM;
}

// vertical quad between ground points e1, e2 (xz), facing n (xz); u runs left->right as seen from outside
function wallQuad(B, mat, e1, e2, yb1, yt1, yb2, yt2, n, uv = [0, 1, 0, 1], opts = { noCast: true }) {
  const rx = n[1], rz = -n[0];
  if ((e2[0] - e1[0]) * rx + (e2[1] - e1[1]) * rz < 0) { [e1, e2] = [e2, e1]; [yb1, yb2] = [yb2, yb1]; [yt1, yt2] = [yt2, yt1]; }
  const [u0, u1, v0, v1] = uv, N = [n[0], 0, n[1]];
  B.tris(mat, [e1[0], yb1, e1[1], e2[0], yb2, e2[1], e2[0], yt2, e2[1], e1[0], yb1, e1[1], e2[0], yt2, e2[1], e1[0], yt1, e1[1]],
    [...N, ...N, ...N, ...N, ...N, ...N], [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], null, opts);
}
// any planar quad p1..p4 (3D), wound so that its normal points along `out`
function faceOut(B, mat, p1, p2, p3, p4, out, uv = [0, 0, 1, 0, 1, 1, 0, 1], opts = {}) {
  const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2], vx = p4[0] - p1[0], vy = p4[1] - p1[1], vz = p4[2] - p1[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  let P = [p1, p2, p3, p4], T = [[uv[0], uv[1]], [uv[2], uv[3]], [uv[4], uv[5]], [uv[6], uv[7]]];
  if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { P = [p1, p4, p3, p2]; T = [T[0], T[3], T[2], T[1]]; nx = -nx; ny = -ny; nz = -nz; }
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  const idx = [0, 1, 2, 0, 2, 3], pos = [], nrm = [], tuv = [];
  for (const k of idx) { pos.push(...P[k]); nrm.push(nx, ny, nz); tuv.push(...T[k]); }
  B.tris(mat, pos, nrm, tuv, null, opts);
}

function flowerTuft(list, x, y, z, s = 0.35) {
  for (const a of [0, Math.PI / 3, 2 * Math.PI / 3]) {
    const g = new THREE.PlaneGeometry(s * 1.4, s);
    g.rotateY(a); g.translate(x, y + s / 2, z);
    list.push(g);
  }
}

function buildUnderpass(B, world, U) {
  const Mt = upMats();
  const W = (a, l) => [U.x + a * U.ur[0] + l * U.nr[0], U.z + a * U.ur[1] + l * U.nr[1]];
  const urnt = U.ur[0] * U.nt[0] + U.ur[1] * U.nt[1], nrnt = U.nr[0] * U.nt[0] + U.nr[1] * U.nt[1];
  const AL = (l, at) => (at - l * nrnt) / urnt;                  // a on the line of constant rail offset `at`
  const road = (a, l) => upRoad(U, a, l);
  const emb = (a, l) => { const [x, z] = W(a, l); return upHeight(U, x, z, false); };
  const box = (mat, a, l, y, la, ll, h, opts) => {                // box aligned to the road frame
    const g = new THREE.BoxGeometry(ll, h, la);
    const [x, z] = W(a, l);
    const T = new THREE.Matrix4().makeRotationY(Math.atan2(U.ur[0], U.ur[1])).setPosition(x, y + h / 2, z);
    B.geo(mat, g, T, null, opts);
  };
  // --- abutments (faces of the opening, under the deck) and splayed wing walls facing the approaches
  const atPt = (l, at) => W(AL(l, at), l);
  const rot = (nx, nz) => Math.atan2(-nz, nx);
  for (const [edge, sl] of [[U.l0, -1], [U.l1, 1]]) {
    // abutment face at l = edge, spanning the embankment top, facing the opening (-sl * nr)
    const nA = [-sl * U.nr[0], -sl * U.nr[1]];
    for (let at = -U.wt; at < U.wt - 1e-6; at += 0.9) {
      const at2 = Math.min(at + 0.9, U.wt);
      const p1 = atPt(edge, at), p2 = atPt(edge, at2);
      const g1 = road(AL(edge, at), edge) - 0.35, g2 = road(AL(edge, at2), edge) - 0.35;
      wallQuad(B, Mt.stone, p1, p2, g1, U.top, g2, U.top, nA, [at / 1.6, at2 / 1.6, g1 / 1.6, U.top / 1.6], {});
    }
    { const [cx, cz] = atPt(edge + sl * 0.45, 0); world.addStatic(new world.Box(cx, cz, 0.45, U.wt / Math.abs(urnt) + 0.2, rot(U.nr[0], U.nr[1]), U.g0 - 1, U.top - 0.35, 'wall')); }
    // wing walls: from the abutment corner, splaying out from the tracks while their top steps down
    for (const sa of [-1, 1]) {
      const N = 16, pts = [];
      for (let k = 0; k <= N; k++) {
        const e = k / N * U.Lw, f = e / U.Lw, l = edge + sl * e, at = sa * (U.wt + (U.atEnd - U.wt) * f);
        const [x, z] = atPt(l, at);
        pts.push({ x, z, top: U.top - (U.top - (U.g0 + U.wend)) * f, g: road(AL(l, at), l) - 0.35 });
      }
      for (let k = 0; k < N; k++) {
        const p = pts[k], q = pts[k + 1], dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz);
        let nx = -dz / L, nz = dx / L;                                         // outward: away from the tracks
        if (nx * U.nt[0] * sa + nz * U.nt[1] * sa < 0) { nx = -nx; nz = -nz; }
        wallQuad(B, Mt.stone, [p.x, p.z], [q.x, q.z], p.g, p.top, q.g, q.top, [nx, nz], [k * L / 1.6, (k + 1) * L / 1.6, p.g / 1.6, p.top / 1.6], {});
        // concrete coping, 0.45 m deep
        faceOut(B, Mt.concrete, [p.x, p.top + 0.06, p.z], [q.x, q.top + 0.06, q.z], [q.x - nx * 0.45, q.top + 0.06, q.z - nz * 0.45], [p.x - nx * 0.45, p.top + 0.06, p.z - nz * 0.45], [0, 1, 0], [0, 0, 1, 0, 1, 0.3, 0, 0.3], { noCast: true });
        wallQuad(B, Mt.concrete, [p.x, p.z], [q.x, q.z], p.top, p.top + 0.07, q.top, q.top + 0.07, [nx, nz], [0, 1, 0, 0.05]);
        if (k % 2 === 0) world.addStatic(new world.Box((p.x + q.x) / 2 - nx * 0.3, (p.z + q.z) / 2 - nz * 0.3, L, 0.3, Math.atan2(-dz, dx), Math.min(p.g, q.g) - 0.5, Math.max(p.top, q.top) - 0.35, 'wall'));
      }
    }
  }
  // --- deck: parallelogram between the two rail-parallel faces, spanning the opening onto the abutments
  const dw = U.wt - 0.04, lA = U.l0 - 0.75, lB = U.l1 + 0.75;
  const yT = U.top - 0.03, yB = U.g0 + U.clear;
  const C = (l, at, y) => { const a = AL(l, at); const [x, z] = W(a, l); return [x, y, z]; };
  const span = lB - lA;
  const xz = (p) => [p[0], p[2]];
  for (const sg of [-1, 1]) {
    const at = sg * dw, n = [sg * U.nt[0], sg * U.nt[1]];
    // front face of the deck (outward normal = sg * nt)
    const p1 = C(lA, at, 0), p2 = C(lB, at, 0);
    wallQuad(B, Mt.concrete, xz(p1), xz(p2), yB, yT, yB, yT, n, [0, span / 2, 0, 0.5], {});
    const o = sg * 0.05;
    // striped edge beam along the bottom of the face
    const q1 = C(U.l0, at + o, 0), q2 = C(U.l1, at + o, 0);
    wallQuad(B, Mt.stripes, xz(q1), xz(q2), yB - 0.02, yB + 0.3, yB - 0.02, yB + 0.3, n, [0, U.l1 - U.l0, 0, 1]);
    // yellow stiffeners
    for (let k = 0; k <= 6; k++) {
      const l = lA + 0.4 + k * (span - 0.8) / 6;
      wallQuad(B, Mt.yellow, xz(C(l - 0.06, at + o * 0.6, 0)), xz(C(l + 0.06, at + o * 0.6, 0)), yB + 0.3, yT - 0.08, yB + 0.3, yT - 0.08, n);
    }
    // '3 m' height limit sign in the middle of the face
    const lm = (U.l0 + U.l1) / 2, ym = (yB + yT) / 2 + 0.05, rS = 0.32;
    wallQuad(B, Mt.sign, xz(C(lm - rS, at + sg * 0.09, 0)), xz(C(lm + rS, at + sg * 0.09, 0)), ym - rS, ym + rS, ym - rS, ym + rS, n);
    // galvanised railing along the top edge, running onto the embankment
    const posts = [], rails = [];
    for (let l = U.l0 - 3; l <= U.l1 + 3 + 1e-6; l += 1.5) {
      const [x, y, z] = C(l, at - sg * 0.12, yT);
      const g = new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6); g.translate(x, y + 0.55, z); posts.push(g);
    }
    for (const h of [0.55, 1.08]) {
      const a1 = C(U.l0 - 3, at - sg * 0.12, yT + h), a2 = C(U.l1 + 3, at - sg * 0.12, yT + h);
      const d = new THREE.Vector3(a2[0] - a1[0], 0, a2[2] - a1[2]), L = d.length();
      const g = new THREE.CylinderGeometry(0.025, 0.025, L, 6); g.rotateZ(Math.PI / 2); g.rotateY(-Math.atan2(d.z, d.x));
      g.translate((a1[0] + a2[0]) / 2, a1[1], (a1[2] + a2[2]) / 2); rails.push(g);
    }
    B.geo(Mt.galv, mergeGeometries([...posts, ...rails]), null, null, { noCast: false });
  }
  // underside and top of the deck
  faceOut(B, Mt.under, C(lA, -dw, yB), C(lA, dw, yB), C(lB, dw, yB), C(lB, -dw, yB), [0, -1, 0]);
  faceOut(B, Mt.concrete, C(lA, -dw, yT), C(lB, -dw, yT), C(lB, dw, yT), C(lA, dw, yT), [0, 1, 0]);
  // --- sidewalk on the north-west side, striped curb, yellow railing, white wall band, flower pots
  const sw = [], railY = [], flowers = [], pots = [];
  for (let a = -U.A + 1; a < U.A - 1 - 1e-6; a += 1) {
    const g1 = road(a, U.curb), g2 = road(a + 1, U.curb);
    const [x1, z1] = W(a, U.curb), [x2, z2] = W(a + 1, U.curb), [x3, z3] = W(a + 1, U.l1), [x4, z4] = W(a, U.l1);
    faceOut(B, Mt.concrete, [x1, g1 + 0.18, z1], [x4, g1 + 0.18, z4], [x3, g2 + 0.18, z3], [x2, g2 + 0.18, z2], [0, 1, 0]);
    wallQuad(B, Mt.stripes, [x1, z1], [x2, z2], g1 - 0.05, g1 + 0.18, g2 - 0.05, g2 + 0.18, [-U.nr[0], -U.nr[1]], [a, a + 1, 0, 1]);
  }
  for (let a = -U.A + 1.5; a <= U.A - 1.5 + 1e-6; a += 1.6) {
    const [x, z] = W(a, U.curb + 0.12), y = road(a, U.curb) + 0.18;
    const g = new THREE.CylinderGeometry(0.035, 0.035, 0.95, 6); g.translate(x, y + 0.47, z); railY.push(g);
    if (a < -U.wt - 1) {                                        // flower pots on the south side (photo 29)
      const pg = new THREE.BoxGeometry(0.5, 0.18, 0.2); pg.rotateY(Math.atan2(U.ur[0], U.ur[1]) + Math.PI / 2); pg.translate(x, y + 0.78, z); pots.push(pg);
      flowerTuft(flowers, x, y + 0.86, z, 0.42);
    }
  }
  for (const h of [0.5, 0.93]) {
    for (let a = -U.A + 1.5; a < U.A - 1.5 - 1e-6; a += 1.6) {
      const a2 = Math.min(a + 1.6, U.A - 1.5);
      const [x1, z1] = W(a, U.curb + 0.12), [x2, z2] = W(a2, U.curb + 0.12);
      const y1 = road(a, U.curb) + 0.18 + h, y2 = road(a2, U.curb) + 0.18 + h;
      const d = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1), L = d.length();
      const g = new THREE.CylinderGeometry(0.03, 0.03, L, 6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      g.translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); railY.push(g);
    }
  }
  B.geo(Mt.yellow, mergeGeometries(railY));
  if (pots.length) B.geo(Mt.pot, mergeGeometries(pots));
  if (flowers.length) B.geo(M.flowers, mergeGeometries(flowers.map(g => g.toNonIndexed())), null, null, { noCast: true });
  for (let a = -U.wt - 0.5; a < U.wt + 0.5 - 1e-6; a += 1) {
    const [x1, z1] = W(a, U.l1 - 0.02), [x2, z2] = W(a + 1, U.l1 - 0.02), y1 = road(a, U.l1) + 0.18, y2 = road(a + 1, U.l1) + 0.18;
    wallQuad(B, Mt.white, [x1, z1], [x2, z2], y1, y1 + 1.05, y2, y2 + 1.05, [-U.nr[0], -U.nr[1]]);
  }
  // --- low stone wall rounding the corner at the north entrance (photo 27) and the km stone of DJ 100E
  const wallPts = [];
  for (let a = AL(U.l1 + 0.2, U.wt) + 0.3; a <= U.A; a += 1) wallPts.push([a, U.l1 + 0.2]);
  for (let k = 1; k <= 6; k++) { const t = k / 6 * Math.PI / 2; wallPts.push([U.A + 3 * Math.sin(t), U.l1 + 0.2 + 3 * (1 - Math.cos(t))]); }
  for (let k = 0; k < wallPts.length - 1; k++) {
    const [a1, l1] = wallPts[k], [a2, l2] = wallPts[k + 1];
    const [x1, z1] = W(a1, l1), [x2, z2] = W(a2, l2);
    const g = new THREE.BoxGeometry(0.35, 0.95, Math.hypot(x2 - x1, z2 - z1) + 0.05);
    const y = Math.min(road(a1, l1), road(a2, l2));
    g.rotateY(Math.atan2(x2 - x1, z2 - z1)); g.translate((x1 + x2) / 2, y + 0.4, (z1 + z2) / 2);
    B.geo(Mt.stone, g);
  }
  {
    const a = U.A - 1.2, l = U.l1 - 0.35, [x, z] = W(a, l), y = road(a, l) + 0.18;
    const g = new THREE.BoxGeometry(0.34, 0.62, 0.2); g.rotateY(Math.atan2(U.nr[0], U.nr[1])); g.translate(x, y + 0.31, z);
    B.geo(Mt.km, g);
  }
  return { type: 'underpass', x: U.x, z: U.z, W, U };
}

// ------------------------------------------------------------------ street details from the Street View screenshots
// photo 25: tall galvanised street lamps with geranium pots along Strada Gării east of the junction, zebra crossings;
// photo 28: the shop 'SHOPPING Oana' (sign, glass door, red tiled awning over the display)
function roadById(id) { return (GEO.roads || []).find(r => r.id === id); }
function walkAlong(r, from, d) {
  const P = []; for (let i = 0; i < r.p.length; i += 2) P.push([r.p[i], r.p[i + 1]]);
  if (Math.hypot(P[0][0] - from[0], P[0][1] - from[1]) > Math.hypot(P[P.length - 1][0] - from[0], P[P.length - 1][1] - from[1])) P.reverse();
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    if (acc + L >= d) { const t = (d - acc) / L, dx = (P[i + 1][0] - P[i][0]) / L, dz = (P[i + 1][1] - P[i][1]) / L; return { x: P[i][0] + dx * (d - acc), z: P[i][1] + dz * (d - acc), dx, dz }; }
    acc += L;
  }
  return null;
}
let ZM = null;
const zebraMat = () => ZM ??= new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -12 });
// nearest point of a road's axis to (x, z), with the segment direction
function nearestOn(r, x, z) {
  let best = null;
  for (let i = 0; i + 3 < r.p.length; i += 2) {
    const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L))), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { x: px, z: pz, dx: dx / L, dz: dz / L, d };
  }
  return best;
}
function zebra(B, r, from, d) {
  const q = typeof d === 'number' ? walkAlong(r, from, d) : nearestOn(r, from[0], from[1]); if (!q) return;
  const nx = -q.dz, nz = q.dx, half = r.w / 2 - 0.3, pos = [], nrm = [], uv = [];
  for (let s = -half; s + 0.5 <= half + 1e-6; s += 1.0) {
    const c = [[s, -1.5], [s + 0.5, -1.5], [s + 0.5, 1.5], [s, 1.5]].map(([o, t]) => { const x = q.x + nx * o + q.dx * t, z = q.z + nz * o + q.dz * t; return [x, heightAt(x, z) + 0.075, z]; });
    for (const k of [0, 2, 1, 0, 3, 2]) { pos.push(...c[k]); nrm.push(0, 1, 0); }
    uv.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1);
  }
  B.tris(zebraMat(), pos, nrm, uv, null, { noCast: true });
}
function buildStreetDetails(B, world) {
  const gar = roadById('12717442'), dj = roadById('14380878');
  const Mt = upMats();
  if (gar) {
    const from = [-593.3, -156.8];
    zebra(B, gar, from, 9.5);
    // lamps on the side away from the railway
    const parts = [], heads = [], flow = [], pots = [];
    for (let d = 16; d < 270; d += 33) {
      const q = walkAlong(gar, from, d); if (!q) break;
      let nx = -q.dz, nz = q.dx;                               // pick the normal pointing away from the tracks (+z here)
      if (nz < 0) { nx = -nx; nz = -nz; }
      const off = gar.w / 2 + 2.3, x = q.x + nx * off, z = q.z + nz * off, y = heightAt(x, z);
      const pole = new THREE.CylinderGeometry(0.07, 0.12, 9.0, 8); pole.translate(x, y + 4.5, z); parts.push(pole);
      const arm = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6); arm.rotateZ(Math.PI / 2 - 0.12); arm.rotateY(-Math.atan2(-nz, -nx));
      arm.translate(x - nx * 0.75, y + 8.95, z - nz * 0.75); parts.push(arm);
      const head = new THREE.BoxGeometry(0.62, 0.1, 0.26); head.rotateY(-Math.atan2(-nz, -nx)); head.translate(x - nx * 1.55, y + 9.0, z - nz * 1.55); heads.push(head);
      // geranium column on the pole (photo 25)
      const pot = new THREE.CylinderGeometry(0.2, 0.16, 0.22, 10); pot.translate(x, y + 1.9, z); pots.push(pot);
      flowerTuft(flow, x, y + 1.95, z, 0.55); flowerTuft(flow, x, y + 1.45, z, 0.45);
      world.addStatic(new world.Box(x, z, 0.15, 0.15, 0, y - 1, y + 9, 'pole'));
    }
    B.geo(M.galv, mergeGeometries(parts));
    B.geo(Mt.white, mergeGeometries(heads));
    B.geo(Mt.pot, mergeGeometries(pots));
    B.geo(M.flowers, mergeGeometries(flow.map(g => g.toNonIndexed())), null, null, { noCast: true });
  }
  if (dj) {
    zebra(B, dj, [-548.8, -227.4]);
    // photo 29: raised sidewalk along DJ100E towards the underpass, stone-faced, yellow/black railing with geraniums
    const a = nearestOn(dj, -554.5, -221.2), b = nearestOn(dj, -571.5, -211.6);
    const n = 12, pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, q = nearestOn(dj, x, z);
      let nx = -q.dz, nz = q.dx;
      if (nx * (-583.9 - x) + nz * (-191.4 - z) < 0 && nz * 0 === 0) { /* keep the side toward the tracks */ }
      if ((nx * 0.5 + nz * 0.86) < 0) { nx = -nx; nz = -nz; }
      pts.push({ x: q.x + nx * (dj.w / 2 + 0.3), z: q.z + nz * (dj.w / 2 + 0.3), nx, nz });
    }
    const rails = [], blacks = [], fl = [], pots = [];
    for (let k = 0; k < n; k++) {
      const p = pts[k], q = pts[k + 1], y1 = heightAt(p.x, p.z), y2 = heightAt(q.x, q.z);
      wallQuad(B, M.stoneWall, [p.x, p.z], [q.x, q.z], y1 - 0.1, y1 + 0.55, y2 - 0.1, y2 + 0.55, [-p.nx, -p.nz], [k * 1.3, (k + 1) * 1.3, 0, 0.45], {});
      faceOut(B, M.concrete, [p.x, y1 + 0.55, p.z], [q.x, y2 + 0.55, q.z], [q.x + q.nx * 1.6, y2 + 0.55, q.z + q.nz * 1.6], [p.x + p.nx * 1.6, y1 + 0.55, p.z + p.nz * 1.6], [0, 1, 0]);
      const px = p.x + p.nx * 0.15, pz = p.z + p.nz * 0.15;
      const post = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6); post.translate(px, y1 + 1.05, pz); blacks.push(post);
      const qx = q.x + q.nx * 0.15, qz = q.z + q.nz * 0.15;
      for (const h of [0.5, 0.95]) {
        const d = new THREE.Vector3(qx - px, y2 - y1, qz - pz), L = d.length();
        const g = new THREE.CylinderGeometry(0.025, 0.025, L, 6);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
        g.translate((px + qx) / 2, (y1 + y2) / 2 + 0.55 + h, (pz + qz) / 2); rails.push(g);
      }
      if (k % 2 === 0) {
        const pg = new THREE.BoxGeometry(0.45, 0.17, 0.18); pg.rotateY(Math.atan2(p.nx, p.nz)); pg.translate(px, y1 + 1.36, pz); pots.push(pg);
        flowerTuft(fl, px, y1 + 1.42, pz, 0.45);
      }
    }
    B.geo(M.blackMetal ?? M.galv, mergeGeometries(blacks));
    B.geo(upMats().yellow, mergeGeometries(rails));
    B.geo(upMats().pot, mergeGeometries(pots));
    B.geo(M.flowers, mergeGeometries(fl.map(g => g.toNonIndexed())), null, null, { noCast: true });
  }
  // the shop at the junction south of the underpass
  const shop = (GEO.buildings || []).find(b => b.o && b.o.shop === 'oana');
  if (shop) {
    const P = []; for (let i = 0; i < shop.p.length; i += 2) P.push([shop.p[i], shop.p[i + 1]]);
    const J = [-579.0, -209.6];
    let best = null;
    for (let i = 0; i < P.length; i++) {
      const A = P[i], C = P[(i + 1) % P.length], m = [(A[0] + C[0]) / 2, (A[1] + C[1]) / 2], d = Math.hypot(m[0] - J[0], m[1] - J[1]);
      if (Math.hypot(C[0] - A[0], C[1] - A[1]) > 6 && (!best || d < best.d)) best = { A, C, m, d };
    }
    if (best) {
      const { A, C } = best, L = Math.hypot(C[0] - A[0], C[1] - A[1]), ux = (C[0] - A[0]) / L, uz = (C[1] - A[1]) / L;
      // outward normal: away from the footprint centre
      const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cz = P.reduce((s, p) => s + p[1], 0) / P.length;
      let nx = -uz, nz = ux; if ((best.m[0] - cx) * nx + (best.m[1] - cz) * nz < 0) { nx = -nx; nz = -nz; }
      const y0 = shop.y1 + (shop.o.eave !== undefined ? 0.1 : 0.45);
      const sign = canvasTex(512, 96, (g, w, h) => {
        g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2f9e3c'; g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SHOPPING Oana', w / 2, 38);
        g.font = 'bold 22px Arial'; g.fillText('Haine        Jucării        Detergenți', w / 2, 80);
      });
      const at = (s, y, o = 0.08) => [best.m[0] + ux * s + nx * o, y, best.m[1] + uz * s + nz * o];
      const quad = (mat, s0, s1, ya, yb, o) => {
        const p1 = at(s0, 0, o), p2 = at(s1, 0, o);
        wallQuad(B, mat, [p1[0], p1[2]], [p2[0], p2[2]], ya, yb, ya, yb, [nx, nz]);
      };
      quad(new THREE.MeshStandardMaterial({ map: sign, roughness: 0.5 }), -2.3, 2.3, y0 + 2.45, y0 + 3.25, 0.1);
      quad(M.windowDark, -1.9, -0.2, y0, y0 + 2.3, 0.04);           // glass door
      quad(M.windowDark, 0.2, 2.6, y0 + 0.5, y0 + 2.3, 0.04);        // display window
      quad(M.galv, -2.0, -0.1, y0 + 2.3, y0 + 2.4, 0.05);
      for (const s0 of [-1.9, 0.7]) quad(M.windowCurtain, s0, s0 + 1.2, y0 + 3.9, y0 + 5.0, 0.06);   // attic windows in the gable
    }
    const wing = (GEO.buildings || []).find(b => b.id === shop.id.slice(0, -1) + 'b');
    if (wing && best) {
      // red tiled awning over the display along the lane, starting at the corner shared with the shop
      const Q = []; for (let i = 0; i < wing.p.length; i += 2) Q.push([wing.p[i], wing.p[i + 1]]);
      let e = null;
      for (let i = 0; i < Q.length; i++) {
        const A = Q[i], C = Q[(i + 1) % Q.length];
        const touches = P.some(p => Math.hypot(p[0] - A[0], p[1] - A[1]) < 0.3) || P.some(p => Math.hypot(p[0] - C[0], p[1] - C[1]) < 0.3);
        const L = Math.hypot(C[0] - A[0], C[1] - A[1]);
        if (touches && L > 8 && (!e || L > e.L)) e = { A, C, L };
      }
      if (e) {
        const { A, C, L } = e, ux = (C[0] - A[0]) / L, uz = (C[1] - A[1]) / L;
        const cx = Q.reduce((s, p) => s + p[0], 0) / Q.length, cz = Q.reduce((s, p) => s + p[1], 0) / Q.length;
        let nx = -uz, nz = ux; if (((A[0] + C[0]) / 2 - cx) * nx + ((A[1] + C[1]) / 2 - cz) * nz < 0) { nx = -nx; nz = -nz; }
        const start = P.some(p => Math.hypot(p[0] - A[0], p[1] - A[1]) < 0.3) ? 0 : L - 9, len = Math.min(9, L);
        const y = wing.y1 + 0.3, sx = A[0] + ux * start, sz = A[1] + uz * start;
        const g = new THREE.BoxGeometry(len, 0.08, 2.4);
        g.rotateX(0.12);
        g.rotateY(-Math.atan2(uz, ux));
        g.translate(sx + ux * len / 2 + nx * 1.2, y + 2.55, sz + uz * len / 2 + nz * 1.2);
        B.geo(M.roofTiles, g);
        for (let k = 0; k <= 3; k++) {
          const px = sx + ux * (0.3 + k * (len - 0.6) / 3) + nx * 2.3, pz = sz + uz * (0.3 + k * (len - 0.6) / 3) + nz * 2.3;
          const pg = new THREE.CylinderGeometry(0.04, 0.04, 2.45, 6); pg.translate(px, y + 1.22, pz); B.geo(M.galv, pg);
        }
      }
    }
  }
}
