import * as THREE from 'three';

// Real-world dataset produced by geo/build_geo.py (OSM + DEM + Sentinel-2), in game metres:
// +x towards NW, +z along Strada Gării towards NE, y up (0 = street level in front of the house).
export const GEO = { ready: false };

export async function loadGeo(base) {
  const get = (f) => fetch(base + f).then(r => { if (!r.ok) throw new Error(f + ': ' + r.status); return r.json(); });
  // binary grids travel as base64 in JSON (static hosts may refuse .bin)
  const bin = (o) => { const s = atob(o.b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  const [json, h, hw, far, trees, forest] = await Promise.all([get('geo.json'), get('height.json').then(bin), get('height_w.json').then(bin).catch(() => null), get('far.json').then(bin), get('trees.json').then(bin), get('forest.json').then(bin).catch(() => null)]);
  Object.assign(GEO, json);
  const g = json.meta.grid;
  // near grid (5 m, +-3 km around the street) and world grid (10 m, the whole playable map)
  GEO.n = g.n; GEO.ext = g.ext; GEO.step = g.step;
  const hi = new Int16Array(h);
  GEO.H = new Float32Array(hi.length);
  for (let i = 0; i < hi.length; i++) GEO.H[i] = hi[i] / 100;
  const w = json.meta.world;
  GEO.W = null;
  if (w && hw) {
    const a = new Int16Array(hw), H = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) H[i] = a[i] / w.scale;
    GEO.W = { n: w.n, ext: w.ext, step: w.step, H };
  }
  GEO.worldExt = GEO.W ? GEO.W.ext : GEO.ext;
  // railway underpasses rebuilt at 1 m (see geo/build_geo.py): oriented box, road level grid, embankment
  GEO.ups = (json.landmarks || []).filter(l => l.type === 'underpass');
  for (const U of GEO.ups) {
    const ext = Math.abs(U.ur[0]) * U.A + Math.abs(U.nr[0]) * U.L, ezt = Math.abs(U.ur[1]) * U.A + Math.abs(U.nr[1]) * U.L;
    Object.assign(U, { bx0: U.x - ext, bx1: U.x + ext, bz0: U.z - ezt, bz1: U.z + ezt, G: Float32Array.from(U.g.v) });
  }
  // forest stands, 2 bits per 5 m cell (0 none, 1 broadleaved, 2 mixed, 3 needleleaved)
  GEO.forestBits = forest && json.forest ? new Uint8Array(forest) : null;
  const fi = new Int16Array(far);
  GEO.farN = json.meta.far.n; GEO.farExt = json.meta.far.ext;
  GEO.F = new Float32Array(fi.length);
  for (let i = 0; i < fi.length; i++) GEO.F[i] = fi[i] / 10;
  const dv = new DataView(trees);
  const nt = trees.byteLength / 6, ts = json.meta.trees?.scale ?? 10;
  GEO.trees = { n: nt, x: new Float32Array(nt), z: new Float32Array(nt), t: new Uint8Array(nt), s: new Float32Array(nt) };
  for (let i = 0; i < nt; i++) {
    GEO.trees.x[i] = dv.getInt16(i * 6, true) / ts;
    GEO.trees.z[i] = dv.getInt16(i * 6 + 2, true) / ts;
    GEO.trees.t[i] = dv.getUint8(i * 6 + 4);
    GEO.trees.s[i] = dv.getUint8(i * 6 + 5) / 100;
  }
  GEO.ready = true;
  return GEO;
}

// Height of the terrain mesh at (x, z): same triangulation as the rendered grid (diagonal b-c).
// The near grid covers +-GEO.ext; beyond it the world grid (its edge values match the near grid's edge).
export function heightAt(x, z) {
  if (GEO.ups.length) { const u = underpassAt(x, z); if (u) return upHeight(u, x, z, true); }
  if (GEO.fine) { const f = fineAt(x, z); if (f) return f.h(x, z); }
  if (GEO.W && (x < -GEO.ext || x > GEO.ext || z < -GEO.ext || z > GEO.ext)) return gridHeight(GEO.W, x, z);
  return gridHeight(GEO, x, z);
}

// zones whose terrain is rebuilt at 1 m with their own height function (the terraces of the sports ground on
// Strada Nicolae Grigorescu): { x0, x1, z0, z1, test(x, z), h(x, z) }; h must not call heightAt
export function addFineZone(f) { (GEO.fine ??= []).push(f); }
export function fineAt(x, z) {
  for (const f of GEO.fine) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.test(x, z)) return f;
  return null;
}
// the underpass box containing (x, z), or null
export function underpassAt(x, z) {
  for (const U of GEO.ups) {
    if (x < U.bx0 || x > U.bx1 || z < U.bz0 || z > U.bz1) continue;
    const dx = x - U.x, dz = z - U.z;
    if (Math.abs(dx * U.ur[0] + dz * U.ur[1]) <= U.A && Math.abs(dx * U.nr[0] + dz * U.nr[1]) <= U.L) return U;
  }
  return null;
}
export function upRoad(U, a, l) {
  const g = U.g, fa = Math.min(g.na - 1.001, Math.max(0, (a - g.a0) / g.step)), fl = Math.min(g.nl - 1.001, Math.max(0, (l - g.l0) / g.step));
  const i = Math.floor(fa), j = Math.floor(fl), u = fa - i, v = fl - j, G = U.G, n = g.na;
  return (G[j * n + i] * (1 - u) + G[j * n + i + 1] * u) * (1 - v) + (G[(j + 1) * n + i] * (1 - u) + G[(j + 1) * n + i + 1] * u) * v;
}
// ground in the box: road level through the opening (1 m behind the wall planes), else the embankment
export function upHeight(U, x, z, opening = true) {
  const dx = x - U.x, dz = z - U.z;
  const a = dx * U.ur[0] + dz * U.ur[1], l = dx * U.nr[0] + dz * U.nr[1], at = dx * U.nt[0] + dz * U.nt[1];
  const g = upRoad(U, a, l), A = Math.abs(at);
  const embT = U.top - Math.max(0, A - U.wt) / 1.5;
  if (!opening) return Math.max(g, embT);
  // same profile as geo/build_geo.py: road level through the opening and 0.8 m behind the wall faces,
  // splayed wing walls with the grass slope above them, plain embankment slopes beyond the wings
  const e = l < U.l0 ? U.l0 - l : l > U.l1 ? l - U.l1 : -1;
  if (e < 0.8) return g;
  if (e <= U.Lw) {
    const f = e / U.Lw, atW = U.wt + (U.atEnd - U.wt) * f, wTop = U.top - (U.top - (U.g0 + U.wend)) * f;
    if (A > atW - 0.8) return g;
    return Math.max(g, Math.min(embT, wTop + (atW - A) / 1.5));
  }
  return Math.max(g, embT);
}
// rail bed: over an underpass the embankment top continues across the opening
export function railHeightAt(x, z) {
  const u = GEO.ups.length ? underpassAt(x, z) : null;
  return u ? upHeight(u, x, z, false) : heightAt(x, z);
}

export function gridHeight(G, x, z) {
  const { n, ext, step, H } = G;
  let fx = (x + ext) / step, fz = (z + ext) / step;
  fx = Math.min(n - 1.0001, Math.max(0, fx)); fz = Math.min(n - 1.0001, Math.max(0, fz));
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
  if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
  return d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

// Terrain normal from central differences of the full-resolution grid (seamless across chunks/LODs).
export function normalAt(i, j, out, G = GEO) {
  const { n, step, H } = G;
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

export function forestCode(x, z) {
  const F = GEO.forest, B = GEO.forestBits;
  if (!B) return 0;
  const i = Math.round((x + F.ext) / F.step), j = Math.round((z + F.ext) / F.step);
  if (i < 0 || j < 0 || i >= F.n || j >= F.n) return 0;
  const k = j * F.n + i;
  return (B[k >> 2] >> ((k & 3) << 1)) & 3;
}

// Areas kept free of trees (bridge decks, the canal, the sports ground and the parks on Strada Nicolae Grigorescu):
// oriented rectangles (centre c, half-length hl along (ux, uz), half-width hw across) or polygons. The forest raster
// is cleared under them; opt.scatter === false keeps the scattered single trees (park trees), opt.lawn paints the
// ground as grass (paintLawns).
export function addHole(c, hl, hw, ux, uz, opt = {}) {
  const r = Math.hypot(hl, hw);
  const test = (x, z, m = 0) => {
    const dx = x - c[0], dz = z - c[1];
    return Math.abs(dx * ux + dz * uz) <= hl + m && Math.abs(dz * ux - dx * uz) <= hw + m;
  };
  registerHole({ x0: c[0] - r, x1: c[0] + r, z0: c[1] - r, z1: c[1] + r, test, ...opt });
}
export function addHolePoly(P, opt = {}) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const test = (x, z, m = 0) => inPoly(P, x, z) || (m > 0 && polyDist(P, x, z) <= m);
  registerHole({ x0: x0 - 2, x1: x1 + 2, z0: z0 - 2, z1: z1 + 2, test, ...opt });
}
export function inPoly(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function polyDist(P, x, z) {
  let d = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return d;
}
function registerHole(h) {
  (GEO.holes ??= []).push(h);
  const F = GEO.forest, B = GEO.forestBits;
  if (!B) return;
  const i0 = Math.max(0, Math.floor((h.x0 + F.ext) / F.step)), i1 = Math.min(F.n - 1, Math.ceil((h.x1 + F.ext) / F.step));
  const j0 = Math.max(0, Math.floor((h.z0 + F.ext) / F.step)), j1 = Math.min(F.n - 1, Math.ceil((h.z1 + F.ext) / F.step));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (!h.test(-F.ext + i * F.step, -F.ext + j * F.step, 2)) continue;
    const k = j * F.n + i;
    B[k >> 2] &= ~(3 << ((k & 3) << 1));
  }
}
// scattered single trees inside a hole are dropped (unless it keeps them)
export function inHole(x, z) {
  for (const h of GEO.holes || []) if (h.scatter !== false && x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1 && h.test(x, z)) return true;
  return false;
}
// a flag of the holes at (x, z) (e.g. noFences: no generated lot fences / village poles there)
export function holeFlag(x, z, key) {
  for (const h of GEO.holes || []) if (h[key] && x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1 && h.test(x, z)) return true;
  return false;
}
// lawns: the terrain splat (forest floor / farmland / gravel weights) is cleared to plain grass under them
export function paintLawns(splat, E = GEO.ext) {
  const L = (GEO.holes || []).filter(h => h.lawn && h.x1 > -E && h.x0 < E && h.z1 > -E && h.z0 < E);
  const img = splat && splat.image;
  if (!L.length || !img || !img.width) return 0;
  const W = img.width, H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  let n = 0;
  for (const h of L) {
    const i0 = Math.max(0, Math.floor((h.x0 + E) / (2 * E) * W)), i1 = Math.min(W - 1, Math.ceil((h.x1 + E) / (2 * E) * W));
    const j0 = Math.max(0, Math.floor((h.z0 + E) / (2 * E) * H)), j1 = Math.min(H - 1, Math.ceil((h.z1 + E) / (2 * E) * H));
    if (i1 < i0 || j1 < j0) continue;
    const d = g.getImageData(i0, j0, i1 - i0 + 1, j1 - j0 + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!h.test(-E + (i + 0.5) * 2 * E / W, -E + (j + 0.5) * 2 * E / H)) continue;
      const k = ((j - j0) * (i1 - i0 + 1) + (i - i0)) * 4;
      d.data[k] = d.data[k + 1] = d.data[k + 2] = 0; n++;
    }
    g.putImageData(d, i0, j0);
  }
  splat.image = c; splat.needsUpdate = true;
  return n;
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
  // chunk: size of the merged meshes near the street (inside +-inner), farChunk beyond it (fewer draw calls);
  // cull: distance beyond which a merged mesh is hidden (per material via cullFor, else the default)
  constructor(chunk = 250, farChunk = chunk, inner = Infinity, cull = 0) {
    Object.assign(this, { chunk, farChunk, inner, cull }); this.groups = new Map(); this.cullFor = new Map();
  }
  _grp(material, cx, cz, opts, size) {
    const key = material.uuid + '|' + size + '|' + cx + '|' + cz + (opts.noCast ? 'n' : '');
    let g = this.groups.get(key);
    if (!g) { g = { material, opts, p: [], n: [], uv: [], c: [], hasColor: false }; this.groups.set(key, g); }
    return g;
  }
  // add a triangle list: pos [x,y,z,...], nrm [...], uv [...], color [r,g,b] optional for all verts
  tris(material, pos, nrm, uv, color = null, opts = {}) {
    if (!pos.length) return;
    const size = Math.max(Math.abs(pos[0]), Math.abs(pos[2])) < this.inner ? this.chunk : this.farChunk;
    const cx = Math.floor(pos[0] / size), cz = Math.floor(pos[2] / size);
    const g = this._grp(material, cx, cz, opts, size);
    for (let i = 0; i < pos.length; i++) g.p.push(pos[i]);
    for (let i = 0; i < nrm.length; i++) g.n.push(nrm[i]);
    for (let i = 0; i < uv.length; i++) g.uv.push(uv[i]);
    const nv = pos.length / 3;
    if (color) { g.hasColor = true; }
    if (color && color.length === pos.length) { for (let i = 0; i < color.length; i++) g.c.push(color[i]); return; }   // per vertex
    const c = color || [1, 1, 1];
    for (let i = 0; i < nv; i++) g.c.push(c[0], c[1], c[2]);
  }
  // add a THREE.BufferGeometry (already in world space unless matrix given)
  geo(material, geometry, matrix = null, color = null, opts = {}) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (matrix) { g = g === geometry ? g.clone() : g; g.applyMatrix4(matrix); }
    if (!g.attributes.normal) g.computeVertexNormals();
    const uv = g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2);
    // opts.vcol: keep the geometry's own vertex colours (rgb)
    const col = color ?? (opts.vcol && g.attributes.color?.itemSize === 3 ? g.attributes.color.array : null);
    this.tris(material, g.attributes.position.array, g.attributes.normal.array, uv, col, opts);
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
      m.userData.cull = this.cullFor.get(g.material) ?? this.cull;
      parent.add(m);
      meshes.push(m);
    }
    this.groups.clear();
    return meshes;
  }
}
