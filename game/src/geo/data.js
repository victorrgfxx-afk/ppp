import * as THREE from 'three';

// Real-world dataset produced by geo/build_geo.py (OSM + DEM + Sentinel-2), in game metres:
// +x towards NW, +z along Strada Gării towards NE, y up (0 = street level in front of the house).
export const GEO = { ready: false };

export async function loadGeo(base) {
  const get = (f) => fetch(base + f).then(r => { if (!r.ok) throw new Error(f + ': ' + r.status); return r.json(); });
  // binary grids travel as base64 in JSON (static hosts may refuse .bin)
  const bin = (o) => { const s = atob(o.b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  const [json, h, far, trees] = await Promise.all([get('geo.json'), get('height.json').then(bin), get('far.json').then(bin), get('trees.json').then(bin)]);
  Object.assign(GEO, json);
  const g = json.meta.grid;
  GEO.n = g.n; GEO.ext = g.ext; GEO.step = g.step;
  const hi = new Int16Array(h);
  GEO.H = new Float32Array(hi.length);
  for (let i = 0; i < hi.length; i++) GEO.H[i] = hi[i] / 100;
  const fi = new Int16Array(far);
  GEO.farN = json.meta.far.n; GEO.farExt = json.meta.far.ext;
  GEO.F = new Float32Array(fi.length);
  for (let i = 0; i < fi.length; i++) GEO.F[i] = fi[i] / 10;
  const dv = new DataView(trees);
  const nt = trees.byteLength / 6;
  GEO.trees = { n: nt, x: new Float32Array(nt), z: new Float32Array(nt), t: new Uint8Array(nt), s: new Float32Array(nt) };
  for (let i = 0; i < nt; i++) {
    GEO.trees.x[i] = dv.getInt16(i * 6, true) / 10;
    GEO.trees.z[i] = dv.getInt16(i * 6 + 2, true) / 10;
    GEO.trees.t[i] = dv.getUint8(i * 6 + 4);
    GEO.trees.s[i] = dv.getUint8(i * 6 + 5) / 100;
  }
  GEO.ready = true;
  return GEO;
}

// Height of the terrain mesh at (x, z): same triangulation as the rendered grid (diagonal b-c).
export function heightAt(x, z) {
  const { n, ext, step, H } = GEO;
  let fx = (x + ext) / step, fz = (z + ext) / step;
  fx = Math.min(n - 1.0001, Math.max(0, fx)); fz = Math.min(n - 1.0001, Math.max(0, fz));
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
  if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
  return d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

// Terrain normal from central differences of the full-resolution grid (seamless across chunks/LODs).
export function normalAt(i, j, out) {
  const { n, step, H } = GEO;
  const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
  const dx = (H[j * n + i1] - H[j * n + i0]) / ((i1 - i0) * step);
  const dz = (H[j1 * n + i] - H[j0 * n + i]) / ((j1 - j0) * step);
  return out.set(-dx, 1, -dz).normalize();
}

export function farAt(x, z) {
  const { farN: n, farExt: ext, F } = GEO;
  const s = 2 * ext / (n - 1);
  const fx = Math.min(n - 1.0001, Math.max(0, (x + ext) / s)), fz = Math.min(n - 1.0001, Math.max(0, (z + ext) / s));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = F[j * n + i], b = F[j * n + i + 1], c = F[(j + 1) * n + i], d = F[(j + 1) * n + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// Street profile of the hand-built part of Strada Gării (used by config.baseHeight).
export function profileAt(z) {
  const p = GEO.profile;
  const f = Math.min(p.y.length - 1.0001, Math.max(0, (z - p.z0) / p.step));
  const i = Math.floor(f), t = f - i;
  return p.y[i] * (1 - t) + p.y[i + 1] * t;
}

// ---------- fast geometry builder: arrays per (material, chunk) -> merged meshes ----------
export class GeoBuilder {
  constructor(chunk = 250) { this.chunk = chunk; this.groups = new Map(); }
  _grp(material, cx, cz, opts) {
    const key = material.uuid + '|' + cx + '|' + cz + (opts.noCast ? 'n' : '');
    let g = this.groups.get(key);
    if (!g) { g = { material, opts, p: [], n: [], uv: [], c: [], hasColor: false }; this.groups.set(key, g); }
    return g;
  }
  // add a triangle list: pos [x,y,z,...], nrm [...], uv [...], color [r,g,b] optional for all verts
  tris(material, pos, nrm, uv, color = null, opts = {}) {
    if (!pos.length) return;
    const cx = Math.floor(pos[0] / this.chunk), cz = Math.floor(pos[2] / this.chunk);
    const g = this._grp(material, cx, cz, opts);
    for (let i = 0; i < pos.length; i++) g.p.push(pos[i]);
    for (let i = 0; i < nrm.length; i++) g.n.push(nrm[i]);
    for (let i = 0; i < uv.length; i++) g.uv.push(uv[i]);
    const nv = pos.length / 3;
    if (color) { g.hasColor = true; }
    const c = color || [1, 1, 1];
    for (let i = 0; i < nv; i++) g.c.push(c[0], c[1], c[2]);
  }
  // add a THREE.BufferGeometry (already in world space unless matrix given)
  geo(material, geometry, matrix = null, color = null, opts = {}) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (matrix) { g = g === geometry ? g.clone() : g; g.applyMatrix4(matrix); }
    if (!g.attributes.normal) g.computeVertexNormals();
    const uv = g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2);
    this.tris(material, g.attributes.position.array, g.attributes.normal.array, uv, color, opts);
  }
  // vertical quad a->b (xz), from y0a..y1a at a and y0b..y1b at b; normal to the right of a->b
  quad(material, ax, az, bx, bz, y0a, y1a, y0b, y1b, u0, u1, v0a, v1a, v0b, v1b, color = null, opts = {}) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    const pos = [ax, y0a, az, bx, y0b, bz, bx, y1b, bz, ax, y0a, az, bx, y1b, bz, ax, y1a, az];
    const nrm = [nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz];
    const uv = [u0, v0a, u1, v0b, u1, v1b, u0, v0a, u1, v1b, u0, v1a];
    this.tris(material, pos, nrm, uv, color, opts);
  }
  build(parent) {
    const meshes = [];
    for (const g of this.groups.values()) {
      if (!g.p.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      if (g.hasColor || g.material.vertexColors) geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c, 3));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, g.material);
      m.castShadow = !g.opts.noCast; m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      if (g.opts.noAO) m.userData.noAO = true;
      parent.add(m);
      meshes.push(m);
    }
    this.groups.clear();
    return meshes;
  }
}
