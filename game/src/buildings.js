import * as THREE from 'three';
import { M } from './materials.js';
import { boxGeo, mat, rng, cylGeo, quadGeo } from './util.js';
import { baseHeight } from './config.js';

// ---------- planar polygon with metric UVs ----------
const _v = new THREE.Vector3();
export function polyGeo(pts0, uAxis, vAxis, tileU = 1, tileV = tileU, origin = pts0[0]) {
  const pos = [], uv = [];
  const pts = pts0.filter((p, i) => p.distanceToSquared(pts0[(i + 1) % pts0.length]) > 1e-10);
  const n = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y);
  }
  n.normalize();
  if (pts.length < 3 || n.lengthSq() < 0.5) return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3)).setAttribute('normal', new THREE.Float32BufferAttribute([], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
  for (let i = 1; i < pts.length - 1; i++) {
    for (const p of [pts[0], pts[i], pts[i + 1]]) {
      pos.push(p.x, p.y, p.z);
      _v.subVectors(p, origin);
      uv.push(_v.dot(uAxis) / tileU, _v.dot(vAxis) / tileV);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const nrm = [];
  for (let i = 0; i < pos.length / 3; i++) nrm.push(n.x, n.y, n.z);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// Order polygon points so the face normal points up (roof top) or down (soffit).
export function orient(pts, wantUp = true) {
  let ny = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; ny += (a.z - b.z) * (a.x + b.x); }
  return (ny > 0) === wantUp ? pts : [...pts].reverse();
}

// Wall transform: origin = bottom-left corner in world, ry so local +X runs along the wall and +Z is outward.
export function wallMatrix(x, y, z, ry) { return mat(x, y, z, 0, ry, 0); }
export const FACE = { W: -Math.PI / 2, E: Math.PI / 2, S: 0, N: Math.PI };

// Wall rectangle L x H minus rectangular openings [u0,u1,v0,v1] (local coords, meters).
export function wallGeos(L, H, openings = [], tile = 1, uOff = 0) {
  const vs = new Set([0, H]);
  for (const o of openings) { vs.add(o[2]); vs.add(o[3]); }
  const vList = [...vs].filter(v => v >= 0 && v <= H).sort((a, b) => a - b);
  const geos = [];
  for (let i = 0; i < vList.length - 1; i++) {
    const va = vList[i], vb = vList[i + 1];
    if (vb - va < 1e-4) continue;
    const vm = (va + vb) / 2;
    const cuts = openings.filter(o => o[2] <= vm && o[3] >= vm).map(o => [o[0], o[1]]).sort((a, b) => a[0] - b[0]);
    let u = 0;
    const segs = [];
    for (const [a, b] of cuts) { if (a > u) segs.push([u, a]); u = Math.max(u, b); }
    if (u < L) segs.push([u, L]);
    for (const [a, b] of segs) {
      if (b - a < 1e-4) continue;
      const g = quadGeo(b - a, vb - va, (a + uOff) / tile, va / tile, (b + uOff) / tile, vb / tile);
      g.translate((a + b) / 2, (va + vb) / 2, 0);
      geos.push(g);
    }
  }
  return geos;
}

// Window/door inserted in an opening (local wall coords), with reveals, frame, sill, glass.
export function addWindow(batch, T, o, opts = {}) {
  const [u0, u1, v0, v1] = o;
  const w = u1 - u0, h = v1 - v0;
  const cx = (u0 + u1) / 2, cy = (v0 + v1) / 2;
  const depth = opts.depth ?? 0.14;
  const frameMat = opts.frame ?? M.whitePVC;
  const glassMat = opts.glass ?? M.windowCurtain;
  const revealMat = opts.reveal ?? M.stuccoWhite;
  const m = (x, y, z, rx = 0, ry = 0) => new THREE.Matrix4().multiplyMatrices(T, mat(x, y, z, rx, ry));
  // reveals
  batch.add(revealMat, boxGeo(w, 0.02, depth, 0.5), m(cx, v1 - 0.01, -depth / 2), { noCast: true });
  batch.add(revealMat, boxGeo(0.02, h, depth, 0.5), m(u0 + 0.01, cy, -depth / 2), { noCast: true });
  batch.add(revealMat, boxGeo(0.02, h, depth, 0.5), m(u1 - 0.01, cy, -depth / 2), { noCast: true });
  // frame
  const ft = 0.07, fd = 0.07, zf = -depth + fd / 2 + 0.01;
  batch.add(frameMat, boxGeo(w, ft, fd, 0.5), m(cx, v1 - ft / 2, zf));
  batch.add(frameMat, boxGeo(w, ft, fd, 0.5), m(cx, v0 + ft / 2, zf));
  batch.add(frameMat, boxGeo(ft, h, fd, 0.5), m(u0 + ft / 2, cy, zf));
  batch.add(frameMat, boxGeo(ft, h, fd, 0.5), m(u1 - ft / 2, cy, zf));
  const parts = opts.door ? 1 : w > 1.9 ? 3 : w > 0.95 ? 2 : 1;
  for (let i = 1; i < parts; i++) {
    const x = u0 + w * i / parts;
    batch.add(frameMat, boxGeo(ft * 0.9, h, fd, 0.5), m(x, cy, zf));
  }
  if (opts.transom && !opts.door) batch.add(frameMat, boxGeo(w, ft * 0.8, fd, 0.5), m(cx, v1 - h * 0.28, zf));
  // glass / door leaf
  const gz = -depth + 0.03;
  if (opts.door) {
    const dm = opts.doorMat ?? M.woodDark;
    batch.add(dm, boxGeo(w - ft * 2, h - ft, 0.05, 1), m(cx, cy - ft / 2, gz + 0.02));
    batch.add(M.galv, boxGeo(0.14, 0.03, 0.04), m(u1 - 0.18, v0 + 1.02, gz + 0.07));
  } else {
    const g = quadGeo(w - ft, h - ft, 0, 0, 1, 1);
    batch.add(glassMat, g, m(cx, cy, gz), { noCast: true });
  }
  // sill
  if (!opts.door && opts.sill !== false) {
    batch.add(opts.sillMat ?? M.ceramicWhite, boxGeo(w + 0.08, 0.035, 0.12), m(cx, v0 - 0.02, 0.03));
  }
  // roller shutter box (very common on Romanian houses)
  if (opts.shutterBox) batch.add(frameMat, boxGeo(w, 0.17, 0.2), m(cx, v1 + 0.02, -0.02), {});
}

// Gable roof with ridge along local Z. Footprint x0..x1 (depth), z0..z1 (along ridge).
// Returns top height function for colliders if needed.
export function gableRoof(batch, T, { x0, x1, z0, z1, eave, ridge, ov = 0.5, ovEnd = 0.4, mat: rm, soffit = M.wood, fascia = M.woodDark, gableWall = null, gutters = true, frontSlopeOnly = false, gy = null }) {
  const xm = (x0 + x1) / 2;
  const run = xm - x0;
  const slope = (ridge - eave) / run;
  const ya = eave - ov * slope;
  const za = z0 - ovEnd, zb = z1 + ovEnd;
  const P = (x, y, z) => V(x, y, z).applyMatrix4(T);
  const up = new THREE.Vector3();
  const addPlane = (pA, pB, pC, pD, mtl, tileU, tileV, wantUp = true) => {
    const uA = new THREE.Vector3().subVectors(pB, pA).normalize();
    // slope direction (in-plane, perpendicular to the eave)
    const nrm = new THREE.Vector3().subVectors(pB, pA).cross(new THREE.Vector3().subVectors(pD, pA)).normalize();
    if (nrm.y < 0) nrm.negate();
    up.crossVectors(nrm, uA).normalize();
    batch.add(mtl, polyGeo(orient([pA, pB, pC, pD], wantUp), uA, up, tileU, tileV, pA));
  };
  // front slope (toward -x local)
  addPlane(P(x0 - ov, ya, zb), P(x0 - ov, ya, za), P(xm, ridge, za), P(xm, ridge, zb), rm, rm === M.roofPhoto ? 7.8 : 1, rm === M.roofPhoto ? 2.3 : 1);
  if (!frontSlopeOnly) addPlane(P(x1 + ov, ya, za), P(x1 + ov, ya, zb), P(xm, ridge, zb), P(xm, ridge, za), rm, rm === M.roofPhoto ? 7.8 : 1, rm === M.roofPhoto ? 2.3 : 1);
  // undersides (soffits) slightly below
  const t = 0.14;
  addPlane(P(x0 - ov, ya - t, za), P(x0 - ov, ya - t, zb), P(xm, ridge - t, zb), P(xm, ridge - t, za), soffit, 0.9, 3, false);
  if (!frontSlopeOnly) addPlane(P(x1 + ov, ya - t, zb), P(x1 + ov, ya - t, za), P(xm, ridge - t, za), P(xm, ridge - t, zb), soffit, 0.9, 3, false);
  // fascia boards along eaves
  const L = zb - za;
  const mm = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().multiplyMatrices(T, mat(x, y, z, rx, ry, rz));
  batch.add(fascia, boxGeo(0.03, 0.18, L, 1), mm(x0 - ov, ya - 0.07, (za + zb) / 2));
  if (!frontSlopeOnly) batch.add(fascia, boxGeo(0.03, 0.18, L, 1), mm(x1 + ov, ya - 0.07, (za + zb) / 2));
  // verge boards on gable ends
  const rakeLen = Math.hypot(run + ov, ridge - ya);
  const ang = Math.atan2(ridge - ya, run + ov);
  for (const zz of [za, zb]) {
    batch.add(fascia, boxGeo(rakeLen, 0.18, 0.03, 1), mm((x0 - ov + xm) / 2, (ya + ridge) / 2 - 0.07, zz, 0, 0, ang));
    if (!frontSlopeOnly) batch.add(fascia, boxGeo(rakeLen, 0.18, 0.03, 1), mm((x1 + ov + xm) / 2, (ya + ridge) / 2 - 0.07, zz, 0, 0, -ang));
  }
  // ridge cap
  batch.add(M.galv, boxGeo(0.22, 0.06, L, 1), mm(xm, ridge + 0.02, (za + zb) / 2, 0, 0, 0));
  // gable end triangles
  if (gableWall) {
    for (const [zz, flip] of [[z0, 1], [z1, -1]]) {
      const pts = flip > 0 ? [P(x1, eave, zz), P(x0, eave, zz), P(xm, ridge, zz)] : [P(x0, eave, zz), P(x1, eave, zz), P(xm, ridge, zz)];
      const uA = new THREE.Vector3().subVectors(pts[1], pts[0]).normalize();
      batch.add(gableWall, polyGeo(pts, uA, V(0, 1, 0), 1, 1));
    }
  }
  if (gutters) {
    addGutter(batch, T, x0 - ov - 0.05, ya - 0.1, za, zb, gy, x0);
    if (!frontSlopeOnly) addGutter(batch, T, x1 + ov + 0.05, ya - 0.1, za, zb, gy, x1);
  }
}

export function addGutter(batch, T, x, y, za, zb, gy = null, wallX = null, downspouts = [0, 1]) {
  const L = zb - za;
  const g = new THREE.CylinderGeometry(0.065, 0.065, L, 10, 1, true, -Math.PI / 2, Math.PI);
  batch.add(M.galv, g, new THREE.Matrix4().multiplyMatrices(T, mat(x, y, (za + zb) / 2, Math.PI / 2, 0, 0)));
  if (gy === null) return;
  const wx = wallX ?? x;
  const sg = Math.sign(wx - x) || 1;
  const px = wx - sg * 0.08;
  const dxp = px - x;
  for (const t of downspouts) {
    const zz = za + 0.25 + t * (L - 0.5);
    const top = y - 0.35;
    const h = top - gy;
    if (h <= 0.2) continue;
    batch.add(M.galv, cylGeo(0.045, 0.045, h, 8), new THREE.Matrix4().multiplyMatrices(T, mat(px, gy + h / 2, zz)));
    const len = Math.hypot(dxp, 0.3);
    batch.add(M.galv, cylGeo(0.045, 0.045, len, 8), new THREE.Matrix4().multiplyMatrices(T, mat(x + dxp / 2, y - 0.2, zz, 0, 0, Math.atan2(dxp, 0.3))));
  }
}

// Hip roof over rectangle (x0..x1, z0..z1), ridge along the longer axis (local Z assumed longer).
export function hipRoof(batch, T, { x0, x1, z0, z1, eave, ridge, ov = 0.55, mat: rm, soffit = M.wood, fascia = M.woodDark, gy = null }) {
  const xm = (x0 + x1) / 2, run = xm - x0;
  const slope = (ridge - eave) / run;
  const ya = eave - ov * slope;
  const X0 = x0 - ov, X1 = x1 + ov, Z0 = z0 - ov, Z1 = z1 + ov;
  const rz0 = Z0 + (run + ov), rz1 = Z1 - (run + ov);
  const P = (x, y, z) => V(x, y, z).applyMatrix4(T);
  const faces = [
    [P(X0, ya, Z1), P(X0, ya, Z0), P(xm, ridge, Math.min(rz0, (Z0 + Z1) / 2)), P(xm, ridge, Math.max(rz1, (Z0 + Z1) / 2))],
    [P(X1, ya, Z0), P(X1, ya, Z1), P(xm, ridge, Math.max(rz1, (Z0 + Z1) / 2)), P(xm, ridge, Math.min(rz0, (Z0 + Z1) / 2))],
    [P(X0, ya, Z0), P(X1, ya, Z0), P(xm, ridge, Math.min(rz0, (Z0 + Z1) / 2))],
    [P(X1, ya, Z1), P(X0, ya, Z1), P(xm, ridge, Math.max(rz1, (Z0 + Z1) / 2))],
  ];
  const up = new THREE.Vector3();
  for (const f of faces) {
    const uA = new THREE.Vector3().subVectors(f[1], f[0]).normalize();
    const nrm = new THREE.Vector3().subVectors(f[1], f[0]).cross(new THREE.Vector3().subVectors(f[2], f[0])).normalize();
    up.crossVectors(nrm, uA).normalize();
    if (nrm.y < 0) up.negate();
    batch.add(rm, polyGeo(orient(f, true), uA, up, 1, 1, f[0]));
    // soffit (underside)
    const fu = f.map(p => p.clone().add(new THREE.Vector3(0, -0.12, 0)));
    batch.add(soffit, polyGeo(orient(fu, false), uA, up, 0.9, 3, fu[0]));
  }
  const mm = (x, y, z, ry = 0) => new THREE.Matrix4().multiplyMatrices(T, mat(x, y, z, 0, ry, 0));
  batch.add(fascia, boxGeo(0.03, 0.17, Z1 - Z0), mm(X0, ya - 0.07, (Z0 + Z1) / 2));
  batch.add(fascia, boxGeo(0.03, 0.17, Z1 - Z0), mm(X1, ya - 0.07, (Z0 + Z1) / 2));
  batch.add(fascia, boxGeo(X1 - X0, 0.17, 0.03), mm((X0 + X1) / 2, ya - 0.07, Z0));
  batch.add(fascia, boxGeo(X1 - X0, 0.17, 0.03), mm((X0 + X1) / 2, ya - 0.07, Z1));
  addGutter(batch, T, X0 - 0.05, ya - 0.1, Z0, Z1, gy, x0);
  if (rz1 > rz0) batch.add(M.galv, boxGeo(0.2, 0.06, rz1 - rz0), mm(xm, ridge + 0.02, (rz0 + rz1) / 2));
}

// ---------- generic village house (built as if on the EAST side, street at -X) ----------
const WALLS = ['stuccoWhite', 'stuccoCream', 'stuccoPeach', 'stuccoYellow', 'stuccoGreen', 'stuccoPink', 'stuccoBeige', 'stuccoWhite', 'stuccoCream'];
const ROOFS = ['roofMetalGray', 'roofMetalGray', 'roofMetalGray', 'roofPhoto', 'roofMetalBrown', 'roofMetalGray', 'roofTiles', 'roofMetalGray', 'roofMetalRed'];

export function genericHouse(batch, world, T, p) {
  const r = rng(p.seed);
  const width = p.width ?? r.range(8, 12);       // along street (local Z)
  const depth = p.depth ?? r.range(7, 10);       // local X
  const floors = p.floors ?? (r() < 0.45 ? 2 : 1);
  const fx = p.fx;                               // front wall local x
  const zc = p.zc;
  const z0 = zc - width / 2, z1 = zc + width / 2;
  const x0 = fx, x1 = fx + depth;
  const floorH = 2.85;
  const b = p.baseY;                             // ground level at this lot
  const plinthH = 0.45;
  const wallM = M[p.wall ?? r.pick(WALLS)];
  const roofM = M[p.roof ?? r.pick(ROOFS)];
  const eave = b + plinthH + floorH * floors - 0.1;
  const H = eave - b;
  const woodWin = r() < 0.4;
  const frame = woodWin ? M.woodLight : M.whitePVC;
  const glass = r() < 0.5 ? M.windowCurtain : M.windowBlinds;
  const winOpts = { frame, glass, reveal: wallM, shutterBox: !woodWin && r() < 0.5, transom: r() < 0.5 };

  const mk = (x, y, z, ry) => new THREE.Matrix4().multiplyMatrices(T, wallMatrix(x, y, z, ry));
  // front wall (faces -X local): u runs +Z
  const winW = r.range(1.1, 1.5), winH = 1.35, sill = plinthH + 0.85;
  const openings = [];
  const nWin = Math.max(2, Math.floor(width / 3.2));
  for (let i = 0; i < nWin; i++) {
    const u = width * (i + 0.5) / nWin;
    for (let f = 0; f < floors; f++) openings.push([u - winW / 2, u + winW / 2, sill + f * floorH, sill + f * floorH + winH]);
  }
  const walls = [
    { T: mk(x0, b, z0, FACE.W), L: width, ops: openings },
    { T: mk(x1, b, z1, FACE.E), L: width, ops: [[width / 2 - 0.6, width / 2 + 0.6, sill, sill + 1.2]] },
    { T: mk(x0, b, z1, FACE.S), L: depth, ops: [[depth * 0.3 - 0.5, depth * 0.3 + 0.5, sill, sill + 1.2], [depth * 0.72 - 0.45, depth * 0.72 + 0.45, 0.45, 2.55]] },
    { T: mk(x1, b, z0, FACE.N), L: depth, ops: [[depth * 0.5 - 0.5, depth * 0.5 + 0.5, sill, sill + 1.2]] },
  ];
  walls.forEach((w, wi) => {
    for (const g of wallGeos(w.L, H, w.ops, 1.5)) batch.add(wallM, g, w.T);
    // plinth band
    for (const g of wallGeos(w.L, plinthH, w.ops.filter(o => o[2] < plinthH), 1.2)) {
      g.translate(0, 0, 0.03);
      batch.add(p.plinth ? M[p.plinth] : M.stuccoGray, g, w.T);
    }
    w.ops.forEach((o, oi) => {
      const isDoor = wi === 2 && oi === 1;
      addWindow(batch, w.T, o, isDoor ? { door: true, frame: M.woodDark, doorMat: M.woodDark, reveal: wallM } : winOpts);
    });
  });
  // roof
  const ridge = eave + (depth / 2) * r.range(0.55, 0.75);
  if (p.roofType === 'hip' || (!p.roofType && r() < 0.55)) {
    hipRoof(batch, T, { x0, x1, z0, z1, eave, ridge, mat: roofM, gy: b });
  } else {
    gableRoof(batch, T, { x0, x1, z0, z1, eave, ridge, mat: roofM, gableWall: wallM, ovEnd: 0.45, gy: b });
  }
  // chimney
  if (r() < 0.7) {
    const cz = zc + r.range(-width / 4, width / 4);
    const ch = new THREE.Matrix4().multiplyMatrices(T, mat(x0 + depth * 0.6, ridge - 0.2, cz));
    batch.add(r() < 0.5 ? M.brick : wallM, boxGeo(0.5, 1.8, 0.5, 0.6), ch);
    batch.add(M.galv, boxGeo(0.62, 0.05, 0.62), new THREE.Matrix4().multiplyMatrices(T, mat(x0 + depth * 0.6, ridge + 0.72, cz)));
  }
  // entry steps + small porch roof on the side door
  const doorZ = z1 + 0.6;
  batch.add(M.concrete, boxGeo(1.4, 0.3, 1.1, 1), new THREE.Matrix4().multiplyMatrices(T, mat(x0 + depth * 0.72, b + 0.15, doorZ)));

  // collider (house body)
  const c0 = new THREE.Vector3(x0, 0, z0).applyMatrix4(T), c1 = new THREE.Vector3(x1, 0, z1).applyMatrix4(T);
  world.addAABB(Math.min(c0.x, c1.x), Math.max(c0.x, c1.x), Math.min(c0.z, c1.z), Math.max(c0.z, c1.z), -5, 20, 'house');
  return { eave, ridge, x0, x1, z0, z1 };
}
