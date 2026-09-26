import { baseHeight, W } from './config.js';

// 2D (XZ) collision world with oriented boxes, plus an analytic ground-height function.
export class Box {
  constructor(x, z, hw, hd, rot = 0, y0 = -10, y1 = 10, tag = '') {
    this.x = x; this.z = z; this.hw = hw; this.hd = hd; this.rot = rot; this.y0 = y0; this.y1 = y1; this.tag = tag;
    this.update();
  }
  update() {
    this.c = Math.cos(this.rot); this.s = Math.sin(this.rot);
    // bounding radius for broad-phase
    this.r = Math.hypot(this.hw, this.hd);
  }
  // local axes: ax = (c, -s) along width (local X), az = (s, c) along depth (local Z)
}

const CELL = 8;
export class CollisionWorld {
  constructor() { this.grid = new Map(); this.dynamic = new Set(); this.regions = []; this.all = []; this.Box = Box; }
  _key(i, j) { return i * 100003 + j; }
  addStatic(b) {
    this.all.push(b);
    const i0 = Math.floor((b.x - b.r) / CELL), i1 = Math.floor((b.x + b.r) / CELL);
    const j0 = Math.floor((b.z - b.r) / CELL), j1 = Math.floor((b.z + b.r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this._key(i, j);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(b);
    }
    return b;
  }
  // axis-aligned helper: x0..x1, z0..z1
  addAABB(x0, x1, z0, z1, y0 = -10, y1 = 10, tag = '') {
    return this.addStatic(new Box((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, 0, y0, y1, tag));
  }
  addDynamic(b) { this.dynamic.add(b); return b; }
  removeDynamic(b) { this.dynamic.delete(b); }
  query(x, z, r, out = []) {
    out.length = 0;
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    const seen = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = this.grid.get(this._key(i, j));
      if (!list) continue;
      for (const b of list) if (!seen.has(b)) { seen.add(b); out.push(b); }
    }
    for (const b of this.dynamic) out.push(b);
    return out;
  }

  // Height regions (raised floors, ramps). fn(x,z) returns absolute height or null.
  addRegion(x0, x1, z0, z1, h, fn = null) { this.regions.push({ x0, x1, z0, z1, h, fn }); }

  groundHeight(x, z) {
    const b = baseHeight(z);
    for (const r of this.regions) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.fn ? r.fn(x, z, b) : b + r.h;
    }
    if (x > -W.ROAD_HALF && x < W.ROAD_HALF) return b;
    if (x >= W.ROAD_HALF && x < W.PAVER_X1) return b + 0.005;
    if (x >= W.PAVER_X1) return b + W.CURB_H;
    return b + 0.04;
  }
}

// circle (px,pz,r) vs oriented box -> push vector {x,z} or null
export function circleBox(px, pz, r, b) {
  const dx = px - b.x, dz = pz - b.z;
  // to local
  const lx = dx * b.c - dz * b.s;
  const lz = dx * b.s + dz * b.c;
  const cx = Math.max(-b.hw, Math.min(b.hw, lx));
  const cz = Math.max(-b.hd, Math.min(b.hd, lz));
  let ox = lx - cx, oz = lz - cz;
  const d2 = ox * ox + oz * oz;
  if (d2 > r * r) return null;
  let nx, nz, pen;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2); nx = ox / d; nz = oz / d; pen = r - d;
  } else {
    // center inside box: push along the smallest axis
    const px2 = b.hw - Math.abs(lx), pz2 = b.hd - Math.abs(lz);
    if (px2 < pz2) { nx = Math.sign(lx) || 1; nz = 0; pen = px2 + r; }
    else { nx = 0; nz = Math.sign(lz) || 1; pen = pz2 + r; }
  }
  // back to world (inverse rotation)
  const wx = nx * b.c + nz * b.s;
  const wz = -nx * b.s + nz * b.c;
  return { x: wx * pen, z: wz * pen, nx: wx, nz: wz };
}

// oriented box vs oriented box (SAT) -> minimal translation for A, or null
export function boxBox(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (dx * dx + dz * dz > (a.r + b.r) * (a.r + b.r)) return null;
  const axes = [[a.c, -a.s], [a.s, a.c], [b.c, -b.s], [b.s, b.c]];
  let minPen = Infinity, best = null;
  for (const [ax, az] of axes) {
    const ra = a.hw * Math.abs(ax * a.c - az * a.s) + a.hd * Math.abs(ax * a.s + az * a.c);
    const rb = b.hw * Math.abs(ax * b.c - az * b.s) + b.hd * Math.abs(ax * b.s + az * b.c);
    const d = dx * ax + dz * az;
    const pen = ra + rb - Math.abs(d);
    if (pen <= 0) return null;
    if (pen < minPen) { minPen = pen; const sg = d > 0 ? -1 : 1; best = { x: ax * sg * pen, z: az * sg * pen, nx: ax * sg, nz: az * sg, pen }; }
  }
  return best;
}
