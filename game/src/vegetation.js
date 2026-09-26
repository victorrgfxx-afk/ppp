import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, addWind } from './materials.js';
import { rng, WIND } from './util.js';

// ---------- tree archetypes (local space, base at origin) ----------
function cardGeo(w, l, a, droop, twist, y, offset = 0) {
  const g = new THREE.PlaneGeometry(w, l);
  g.translate(0, l / 2 + offset, 0);
  g.rotateY(twist);
  g.rotateX(-(Math.PI / 2 + droop));
  g.rotateY(a);
  g.translate(0, y, 0);
  return g;
}

function taperedCyl(p0, p1, r0, r1, seg = 7) {
  const d = new THREE.Vector3().subVectors(p1, p0);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate(p0.x, p0.y, p0.z);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, r0 * 12), uv.getY(i) * len / 1.5);
  return g;
}

function strip(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}

export function spruceArchetype(seed, H = 13, Rmax = 2.6) {
  const r = rng(seed);
  const cards = [];
  const y0 = 1.0;
  for (let y = y0; y < H - 0.2; y += 0.3 + r() * 0.08) {
    const t = (y - y0) / (H - y0);
    const R = Rmax * Math.pow(1 - t, 0.92) + 0.25;
    const n = Math.max(4, Math.round(6 + 4 * (1 - t)));
    const a0 = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * Math.PI * 2 + (r() - 0.5) * 0.4;
      const L = R * (0.85 + r() * 0.3);
      const droop = 0.15 + 0.35 * (1 - t) + (r() - 0.5) * 0.15;
      const w = Math.min(1.3, L * 0.62);
      cards.push(cardGeo(w, L, a, droop, 0, y));
      cards.push(cardGeo(w * 0.8, L * 0.95, a, droop + 0.1, Math.PI / 2, y));
    }
  }
  // leader
  cards.push(cardGeo(0.35, 0.8, 0, -Math.PI / 2 + 0.05, 0, H - 0.3));
  const foliage = mergeGeometries(cards.map(strip));
  const trunk = mergeGeometries([strip(taperedCyl(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, H, 0), 0.28, 0.03, 9))]);
  // dark inner cone so the crown never looks see-through
  const core = new THREE.ConeGeometry(Rmax * 0.62, H - y0 - 0.2, 12, 8);
  core.translate(0, y0 + (H - y0) / 2 - 0.3, 0);
  const p = core.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = 1 + (r() - 0.5) * 0.25;
    p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s);
  }
  core.computeVertexNormals();
  return { parts: [[trunk, M.bark], [strip(core), M.firCore], [foliage, M.fir]] };
}

export function broadleafArchetype(seed, { H = 7, crown = 3, trunkR = 0.18, leafMat = 'leaves', density = 1, bush = false } = {}) {
  const r = rng(seed);
  const wood = [];
  const ends = [];
  const grow = (p, dir, len, rad, depth) => {
    const q = p.clone().addScaledVector(dir, len);
    wood.push(strip(taperedCyl(p, q, rad, rad * 0.7, depth > 2 ? 7 : depth > 1 ? 5 : 4)));
    if (depth === 0 || rad < 0.02) { ends.push(q); return; }
    const kids = depth > 2 ? 3 + Math.floor(r() * 2) : 2 + Math.floor(r() * 1.6);
    for (let i = 0; i < kids; i++) {
      const nd = dir.clone().add(new THREE.Vector3((r() - 0.5) * 1.6, (r() - 0.2) * 0.9, (r() - 0.5) * 1.6)).normalize();
      grow(q, nd, len * (0.62 + r() * 0.2), rad * 0.62, depth - 1);
    }
    if (depth <= 2) ends.push(q);
  };
  if (bush) {
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      grow(new THREE.Vector3(Math.cos(a) * 0.15 * Math.min(1, crown), 0, Math.sin(a) * 0.15 * Math.min(1, crown)), new THREE.Vector3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize(), H * 0.35, 0.04 * Math.min(1, H / 2), 2);
    }
  } else {
    const trunkTop = new THREE.Vector3((r() - 0.5) * 0.4, H * 0.42, (r() - 0.5) * 0.4);
    wood.push(strip(taperedCyl(new THREE.Vector3(0, -0.2, 0), trunkTop, trunkR, trunkR * 0.75, 9)));
    const nb = 4 + Math.floor(r() * 2);
    for (let i = 0; i < nb; i++) {
      const a = i / nb * Math.PI * 2 + r() * 0.5;
      const dir = new THREE.Vector3(Math.cos(a) * 0.75, 0.9 + r() * 0.4, Math.sin(a) * 0.75).normalize();
      grow(trunkTop, dir, H * 0.22, trunkR * 0.6, 3);
    }
  }
  // leaf cards around branch ends + filling the crown volume
  const cards = [];
  const center = new THREE.Vector3(0, bush ? H * 0.5 : H * 0.62, 0);
  const nCards = Math.round((bush ? 90 : 170) * density);
  for (let i = 0; i < nCards; i++) {
    let p;
    if (i % 3 !== 0 && ends.length) p = ends[Math.floor(r() * ends.length)].clone().add(new THREE.Vector3((r() - 0.5) * 1.2, (r() - 0.4) * 1.0, (r() - 0.5) * 1.2));
    else {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, rr = Math.cbrt(r());
      p = center.clone().add(new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th) * crown * rr, u * (bush ? H * 0.5 : H * 0.36) * rr, Math.sqrt(1 - u * u) * Math.sin(th) * crown * rr));
    }
    if (p.y < (bush ? 0.15 : H * 0.3)) p.y = bush ? 0.15 + r() * 0.3 : H * 0.3 + r();
    const s = (bush ? Math.min(0.75, crown * 0.75) : 1.25 * Math.min(1.2, crown / 3)) * (0.7 + r() * 0.6);
    const g = new THREE.PlaneGeometry(s, s);
    const out = p.clone().sub(center).setY(0).normalize();
    g.rotateX(-Math.PI / 2 + (r() - 0.5) * 1.6);
    g.rotateZ((r() - 0.5) * 1.2);
    g.rotateY(Math.atan2(out.x, out.z) + (r() - 0.5) * 1.5);
    g.translate(p.x, p.y, p.z);
    cards.push(strip(g));
  }
  return { parts: [[mergeGeometries(wood), M.bark], [mergeGeometries(cards), M[leafMat]]] };
}

// Tuft of flowering plants for window boxes, pots and hanging baskets.
export function flowerArchetype(seed, spread = 0.18, H = 0.16, n = 12) {
  const r = rng(seed);
  const cards = [];
  for (let i = 0; i < n; i++) {
    const s = 0.1 + r() * 0.08;
    const g = new THREE.PlaneGeometry(s, s);
    g.rotateX(-Math.PI / 2 + (r() - 0.5) * 1.3);
    g.rotateY(r() * Math.PI * 2);
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
    g.translate(Math.cos(a) * d, H * (0.3 + r() * 0.7), Math.sin(a) * d * 0.6);
    cards.push(strip(g));
  }
  return { parts: [[mergeGeometries(cards), M.flowers]] };
}

// Staghorn sumac (Rhus typhina): a few leaning stems with drooping pinnate fronds at the top.
export function sumacArchetype(seed, H = 4.2) {
  const r = rng(seed);
  const wood = [], fronds = [];
  const stems = 3 + Math.floor(r() * 2);
  for (let s = 0; s < stems; s++) {
    const a = r() * Math.PI * 2, lean = 0.15 + r() * 0.25;
    const top = new THREE.Vector3(Math.cos(a) * H * lean, H * (0.8 + r() * 0.25), Math.sin(a) * H * lean);
    const mid = top.clone().multiplyScalar(0.5).add(new THREE.Vector3((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3));
    wood.push(strip(taperedCyl(new THREE.Vector3(0, -0.1, 0), mid, 0.07, 0.055, 6)));
    wood.push(strip(taperedCyl(mid, top, 0.055, 0.03, 5)));
    const n = 11 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const fa = i / n * Math.PI * 2 + r() * 0.4;
      const L = 0.8 + r() * 0.4;
      const g = cardGeo(0.42, L, fa, -0.15 + r() * 0.55, 0, 0);
      g.translate(top.x, top.y - 0.05, top.z);
      fronds.push(strip(g));
    }
  }
  return { parts: [[mergeGeometries(wood), M.bark], [mergeGeometries(fronds), M.sumac]] };
}

// Yucca / agave rosette (the spiky plants in the flower strip, photo 6).
export function yuccaArchetype(seed, H = 0.8) {
  const r = rng(seed);
  const pos = [], col = [], idx = [];
  let base = 0;
  const blades = 34;
  for (let b = 0; b < blades; b++) {
    const a = b * 2.39996 + r() * 0.2;
    const up = 0.35 + r() * 0.9;                 // angle from horizontal
    const L = H * (0.6 + r() * 0.5);
    const w = 0.028 + r() * 0.018;
    const dx = Math.cos(a), dz = Math.sin(a);
    const segs = 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const ang = up - t * t * 0.35;
      const rr = L * t * Math.cos(ang), yy = L * t * Math.sin(up) - t * t * L * 0.12;
      const ww = w * (1 - t * 0.95) * (s === 0 ? 0.7 : 1);
      const cx = dx * rr, cz = dz * rr;
      pos.push(cx - dz * ww, yy, cz + dx * ww, cx + dz * ww, yy, cz - dx * ww);
      const g = 0.55 + 0.45 * t;
      const c = [0.13 * g + 0.05, 0.27 * g + 0.06, 0.12 * g + 0.03];
      col.push(...c, c[0] + 0.12 * t, c[1] + 0.1 * t, c[2]);
    }
    for (let s = 0; s < segs; s++) { const a0 = base + s * 2; idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
    base += (segs + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { parts: [[g, M.yucca]] };
}

// ---------- instanced placement ----------
export class Forest {
  constructor(scene) { this.scene = scene; this.types = new Map(); }
  add(type, archetypeFn, x, y, z, rotY = 0, scale = 1) {
    if (!this.types.has(type)) this.types.set(type, { make: archetypeFn, list: [] });
    this.types.get(type).list.push([x, y, z, rotY, scale]);
  }
  build() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [, t] of this.types) {
      const arch = t.make();
      for (const [geo, material] of arch.parts) {
        geo.computeBoundingSphere();
        const im = new THREE.InstancedMesh(geo, material, t.list.length);
        t.list.forEach(([x, y, z, ry, sc], i) => {
          q.setFromAxisAngle(up, ry); s.setScalar(sc); p.set(x, y, z);
          im.setMatrixAt(i, m4.compose(p, q, s));
        });
        im.castShadow = true;
        im.receiveShadow = material !== M.fir;
        im.userData.noAO = material.alphaTest > 0;
        im.computeBoundingSphere();
        this.scene.add(im);
      }
    }
  }
}

// ---------- grass (instanced clumps with wind) ----------
function clumpGeo(seed, blades = 9, h = 0.28) {
  const r = rng(seed);
  const pos = [], col = [], idx = [];
  let base = 0;
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2;
    const lean = 0.15 + r() * 0.5;
    const bh = h * (0.5 + r() * 0.8);
    const w = 0.005 + r() * 0.005;
    const ox = (r() - 0.5) * 0.14, oz = (r() - 0.5) * 0.14;
    const dx = Math.cos(a), dz = Math.sin(a);
    const segs = 2;
    const dry = r() < 0.25;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const bend = lean * t * t * bh;
      const cx = ox + dx * bend, cz = oz + dz * bend, cy = bh * t;
      const ww = w * (1 - t * 0.85);
      pos.push(cx - dz * ww, cy, cz + dx * ww, cx + dz * ww, cy, cz - dx * ww);
      const g = 0.25 + 0.55 * t;
      const c = dry ? [0.45 * g + 0.2, 0.42 * g + 0.18, 0.2 * g] : [0.18 * g + 0.04, 0.34 * g + 0.08, 0.08 * g + 0.02];
      col.push(...c, ...c);
    }
    for (let s = 0; s < segs; s++) {
      const a0 = base + s * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
    base += (segs + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // bias normals upward for softer grass shading
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) { n.setY(i, Math.abs(n.getY(i)) + 0.8); }
  n.needsUpdate = true;
  g.normalizeNormals();
  return g;
}

export function buildGrass(scene, areas, density = 1, groundFn) {
  const mat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), 0.35, 1.8);
  const geos = [clumpGeo(1, 12, 0.13), clumpGeo(2, 9, 0.24), clumpGeo(3, 14, 0.09)];
  const r = rng(99);
  const chunk = 16;
  const buckets = new Map();
  for (const a of areas) {
    const count = Math.round((a.x1 - a.x0) * (a.z1 - a.z0) * a.d * density);
    for (let i = 0; i < count; i++) {
      const x = a.x0 + r() * (a.x1 - a.x0), z = a.z0 + r() * (a.z1 - a.z0);
      const k = Math.floor(z / chunk) * 3 + (r() < 0.25 ? 1 : r() < 0.5 ? 2 : 0);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push([x, groundFn(x, z), z, r() * 6.28, (a.s ?? 1) * (0.6 + r() * 0.8)]);
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const out = [];
  for (const [k, list] of buckets) {
    const g = geos[((k % 3) + 3) % 3];
    const im = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach(([x, y, z, ry, sc], i) => {
      q.setFromAxisAngle(up, ry); s.set(sc, sc * (0.8 + 0.4 * ((i * 7919) % 10) / 10), sc); p.set(x, y - 0.01, z);
      im.setMatrixAt(i, m4.compose(p, q, s));
    });
    im.computeBoundingSphere();
    im.receiveShadow = true;
    im.castShadow = false;
    im.userData.noAO = true;
    im.userData.cz = (Math.floor(k / 3) + 0.5) * chunk;
    scene.add(im);
    out.push(im);
  }
  void WIND;
  return out;
}
