import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- deterministic randomness ----------
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  return f;
}

// ---------- value noise (tileable) ----------
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function valueNoise(x, y, period = 1e9, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const p = (n) => ((n % period) + period) % period;
  const a = hash2(p(xi), p(yi), seed), b = hash2(p(xi + 1), p(yi), seed);
  const c = hash2(p(xi), p(yi + 1), seed), d = hash2(p(xi + 1), p(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 5, period = 1e9, seed = 0) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * valueNoise(x * f, y * f, period * f, seed + i * 17);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// ---------- geometry helpers ----------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Box whose UVs are in world units / tile (so textures tile at a physical size).
export function boxGeo(w, h, d, tile = 1, tileV = tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tileV);
    }
  }
  return g;
}

// Vertical quad in the local XY plane (normal +Z), with explicit UV rect.
export function quadGeo(w, h, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
  return g;
}

export function cylGeo(r0, r1, h, seg = 8, tile = 1, open = false) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * Math.max(r0, r1);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / tile, uv.getY(i) * h / tile);
  return g;
}

// Tube along a list of points (Vector3), constant radius.
export function tubeGeo(points, radius, radial = 6, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(2, points.length * 4), radius, radial, closed);
}

// Extruded polygon (profile in XY) along Z by depth.
export function prismGeo(pts, depth) {
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

// ---------- batching (merges static geometry per material => few draw calls) ----------
const KEEP = ['position', 'normal', 'uv', 'color'];
export class Batcher {
  constructor() { this.groups = new Map(); }
  add(material, geometry, matrix = null, opts = {}) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    const key = material.uuid + (opts.noShadow ? '_ns' : '') + (opts.noCast ? '_nc' : '');
    let grp = this.groups.get(key);
    if (!grp) { grp = { material, geos: [], opts }; this.groups.set(key, grp); }
    grp.geos.push(g);
    return g;
  }
  build(parent, chunk = 0) {
    const meshes = [];
    for (const grp of this.groups.values()) {
      const withColor = grp.geos.some(g => g.attributes.color);
      for (const g of grp.geos) {
        if (withColor && !g.attributes.color) {
          const c = new Float32Array(g.attributes.position.count * 3).fill(1);
          g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
        }
      }
      // Optionally split into spatial chunks along Z so frustum culling helps.
      let buckets = [grp.geos];
      if (chunk > 0 && grp.geos.length > 1) {
        const map = new Map();
        for (const g of grp.geos) {
          g.computeBoundingSphere();
          const k = Math.floor(g.boundingSphere.center.z / chunk);
          if (!map.has(k)) map.set(k, []);
          map.get(k).push(g);
        }
        buckets = [...map.values()];
      }
      for (const list of buckets) {
        const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
        if (!merged) { console.warn('merge failed', grp.material.name); continue; }
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        const mesh = new THREE.Mesh(merged, grp.material);
        mesh.castShadow = !grp.opts.noShadow && !grp.opts.noCast;
        mesh.receiveShadow = !grp.opts.noShadow;
        mesh.matrixAutoUpdate = false;
        if (grp.opts.noAO) mesh.userData.noAO = true;
        parent.add(mesh);
        meshes.push(mesh);
      }
    }
    this.groups.clear();
    return meshes;
  }
}

// Shared wind uniform used by foliage/grass shaders.
export const WIND = { time: { value: 0 }, strength: { value: 1 } };
