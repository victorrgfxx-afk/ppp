import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO } from './data.js';
import { M } from '../materials.js';

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
