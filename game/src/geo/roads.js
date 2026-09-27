import * as THREE from 'three';
import { GEO, heightAt, railHeightAt } from './data.js';
import { TEX } from '../textures.js';
import { M } from '../materials.js';
import { prahovaBridge } from './bridge.js';

// OSM roads as ribbons on the (cut & filled) terrain, bridges, lane markings, railway tracks with
// catenary, station platforms.

const pairs = (flat) => { const o = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };

function resample(P, maxSeg) {
  const out = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const [ax, az] = P[i - 1], [bx, bz] = P[i];
    const L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(L / maxSeg));
    for (let t = 1; t <= k; t++) out.push([ax + (bx - ax) * t / k, az + (bz - az) * t / k]);
  }
  return out;
}

// left normals with limited miter
function normals(P) {
  const N = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let m = 1;
    if (i > 0 && i < P.length - 1) {
      const d1 = [P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]], l1 = Math.hypot(...d1) || 1;
      const nx1 = -d1[1] / l1, nz1 = d1[0] / l1;
      m = 1 / Math.max(0.5, nx1 * -tz + nz1 * tx);
    }
    N.push([-tz * m, tx * m]);
  }
  return N;
}

function ribbon(B, material, P, N, off0, off1, yfn, tile, opts = {}) {
  const pos = [], nrm = [], uv = [];
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const q = [];
    for (const k of [i, i + 1]) {
      const [x, z] = P[k], [nx, nz] = N[k];
      const y = yfn(k);
      q.push([x + nx * off0, y, z + nz * off0], [x + nx * off1, y, z + nz * off1]);
    }
    const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    const [a0, a1, b0, b1] = q;             // a0/a1 at i (off0/off1), b0/b1 at i+1
    const tri = [a0, b0, a1, a1, b0, b1];
    // make it face up
    const ux = b0[0] - a0[0], uz = b0[2] - a0[2], vx = a1[0] - a0[0], vz = a1[2] - a0[2];
    const up = uz * vx - ux * vz > 0;
    const T = up ? tri : [a0, a1, b0, a1, b1, b0];
    for (const p of T) {
      pos.push(p[0], p[1], p[2]); nrm.push(0, 1, 0);
      if (opts.along) {
        const isB = p === b0 || p === b1, isOff1 = p === a1 || p === b1;
        uv.push(isOff1 ? 1 : 0, (acc + (isB ? L : 0)) / tile);
      } else uv.push(p[0] / tile, p[2] / tile);
    }
    acc += L;
  }
  B.tris(material, pos, nrm, uv, null, { noCast: true });
}

const offMat = (base, units, extra = {}) => {
  const m = base.clone();
  Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: units, ...extra });
  return m;
};

export function makeRoadMaterials() {
  return {
    asphalt: offMat(M.asphalt, -8), concrete: offMat(M.concrete, -7), paving: offMat(M.pavers, -7),
    cobble: offMat(M.pavers, -7, { color: new THREE.Color(0x9a948c) }), gravel: offMat(M.gravel, -5), dirt: offMat(M.soil, -4),
    shoulder: offMat(M.gravel, -3, { color: new THREE.Color(0xc9c2b4) }),
    marking: offMat(M.marking, -10),
    deck: M.concrete, rail: new THREE.MeshStandardMaterial({ color: 0x6d6560, roughness: 0.45, metalness: 0.75 }),
    track: offMat(new THREE.MeshStandardMaterial({ map: TEX.track, normalMap: TEX.trackN, roughness: 0.95 }), -6),
    ballast: offMat(M.gravel, -5, { color: new THREE.Color(0xa69d92) }),
    mast: M.galv,
  };
}
const TILE = { asphalt: 1.3, concrete: 2.2, paving: 1.0, cobble: 0.8, gravel: 1.2, dirt: 1.6 };

export function buildRoads(B, world, mats) {
  // junction points = vertices shared by several ways
  const count = new Map();
  const key = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
  for (const r of GEO.roads) for (let i = 0; i < r.p.length; i += 2) { const k = key(r.p[i], r.p[i + 1]); count.set(k, (count.get(k) || 0) + 1); }
  const junctions = [];
  for (const [k, c] of count) if (c > 1) { const [x, z] = k.split(',').map(Number); junctions.push([x / 10, z / 10]); }
  const nearJunction = (x, z, d) => junctions.some(j => Math.abs(j[0] - x) < d && Math.abs(j[1] - z) < d && Math.hypot(j[0] - x, j[1] - z) < d);
  const bridges = [];
  const names = [];
  for (const r of GEO.roads) {
    if (r.tu) continue;
    let P = pairs(r.p);
    if (r.hand) {
      // the photographed stretch of Strada Gării is modelled by hand; keep only the ends
      const parts = [P.filter(p => p[1] <= r.hand[0] + 1), P.filter(p => p[1] >= r.hand[1] - 1)];
      const lo = P.filter(p => p[1] < r.hand[0]); const hi = P.filter(p => p[1] > r.hand[1]);
      parts[0] = lo.length ? [...lo, [0, r.hand[0] + 0.5]] : [];
      parts[1] = hi.length ? [[0, r.hand[1] - 0.5], ...hi] : [];
      for (const part of parts) if (part.length > 1) roadRibbon(B, mats, { ...r, hand: null }, part, bridges, nearJunction, names);
      names.push({ n: r.n, P });
      continue;
    }
    roadRibbon(B, mats, r, P, bridges, nearJunction, names);
  }
  GEO.bridges = bridges;
  GEO.roadNames = names;
  void world;
}

function roadRibbon(B, mats, r, P0, bridges, nearJunction, names) {
  const w = r.w, surf = r.s;
  const P = resample(P0, r.br ? 5 : 3.5);
  const N = normals(P);
  const mat = mats[surf] ?? mats.asphalt;
  let yfn;
  const custom = r.br && r.id === prahovaBridge()?.r.id ? prahovaBridge() : null;
  if (custom) {
    // the Prahova bridge (bridge.js): its own deck profile, barriers, railings and piers
    yfn = (k) => custom.yAt(custom.local(P[k][0], P[k][1])[0]);
    bridges.push({ P, w: 0, y: [], fn: custom.surface, x0: custom.x0, x1: custom.x1, z0: custom.z0, z1: custom.z1 });
  } else if (r.br) {
    // bridge deck: straight line between the abutments with a slight camber
    const y0 = heightAt(P[0][0], P[0][1]) + 0.05, y1 = heightAt(P[P.length - 1][0], P[P.length - 1][1]) + 0.05;
    const L = []; let acc = 0; L.push(0);
    for (let i = 1; i < P.length; i++) { acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); L.push(acc); }
    yfn = (k) => { const t = L[k] / (acc || 1); return y0 + (y1 - y0) * t + Math.sin(Math.PI * t) * Math.min(0.8, acc * 0.004); };
    bridgeStructure(B, mats, P, N, w, yfn);
    bridges.push({ P, w: w / 2 + 0.5, y: P.map((_, k) => yfn(k)) });
  } else {
    const dy = 0.035;
    yfn = (k) => heightAt(P[k][0], P[k][1]) + dy;
  }
  ribbon(B, mat, P, N, -w / 2, w / 2, yfn, TILE[surf] ?? 1.3);
  const major = ['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary'].includes(r.c);
  if (surf === 'asphalt' && !r.br && ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential'].includes(r.c)) {
    const sw = major ? 0.9 : 0.45;
    ribbon(B, mats.shoulder, P, N, w / 2, w / 2 + sw, (k) => yfn(k) - 0.02, 1.2);
    ribbon(B, mats.shoulder, P, N, -w / 2 - sw, -w / 2, (k) => yfn(k) - 0.02, 1.2);
  }
  if (major && surf === 'asphalt' && w >= 5) markings(B, mats, P, N, w, yfn, r, nearJunction, custom ? { solid: true, edges: false } : {});
  if (r.n) names.push({ n: r.n, P: P0 });
}

function markings(B, mats, P, N, w, yfn, r, nearJunction, opt = {}) {
  const lw = 0.15, off = w / 2 - 0.35;
  const ok = P.map(p => !nearJunction(p[0], p[1], 9));
  // continuous edge lines
  for (const side of opt.edges === false ? [] : [-1, 1]) {
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const idx = run;
        ribbon(B, mats.marking, idx.map(k => P[k]), idx.map(k => N[k]), side * off - lw / 2, side * off + lw / 2, (i) => yfn(idx[i]) + 0.004, 4, { along: true });
      }
      run = [];
    };
    for (let k = 0; k < P.length; k++) { if (ok[k]) run.push(k); else flush(); }
    flush();
  }
  // centre line: dashed 3 m / 6 m (solid on the trunk road)
  const oneway = r.ow === 'yes';
  if (oneway && !(Number(r.lanes) >= 2)) return;
  const solid = opt.solid || (r.c === 'trunk' && !oneway);
  let acc = 0;
  for (let k = 0; k < P.length - 1; k++) {
    const L = Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]);
    const on = solid || (acc % 9) < 3;
    if (on && ok[k] && ok[k + 1]) ribbon(B, mats.marking, [P[k], P[k + 1]], [N[k], N[k + 1]], -lw / 2, lw / 2, (i) => yfn(k + i) + 0.004, 4, { along: true });
    acc += L;
  }
}

function bridgeStructure(B, mats, P, N, w, yfn) {
  const side = (s) => {
    // deck edge face + parapet wall
    const pos = [], nrm = [], uv = [];
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[i + 1];
      const e = w / 2 + 0.5;
      const ax = x0 + N[i][0] * e * s, az = z0 + N[i][1] * e * s, bx = x1 + N[i + 1][0] * e * s, bz = z1 + N[i + 1][1] * e * s;
      const ya = yfn(i), yb = yfn(i + 1);
      if (s > 0) B.quad(mats.deck, bx, bz, ax, az, ya - 0.9, ya + 0.95, yb - 0.9, yb + 0.95, 0, 1, 0, 1.8, 0, 1.8, null);
      else B.quad(mats.deck, ax, az, bx, bz, ya - 0.9, ya + 0.95, yb - 0.9, yb + 0.95, 0, 1, 0, 1.8, 0, 1.8, null);
      const ia = x0 + N[i][0] * (e - 0.25) * s, iaz = z0 + N[i][1] * (e - 0.25) * s, ib = x1 + N[i + 1][0] * (e - 0.25) * s, ibz = z1 + N[i + 1][1] * (e - 0.25) * s;
      if (s > 0) B.quad(mats.deck, ia, iaz, ib, ibz, ya, ya + 0.95, yb, yb + 0.95, 0, 1, 0, 1, 0, 1, null);
      else B.quad(mats.deck, ib, ibz, ia, iaz, yb, yb + 0.95, ya, ya + 0.95, 0, 1, 0, 1, 0, 1, null);
    }
    void pos; void nrm; void uv;
  };
  side(1); side(-1);
  // parapet tops + deck underside
  ribbon(B, mats.deck, P, N, w / 2 + 0.25, w / 2 + 0.5, (k) => yfn(k) + 0.95, 2);
  ribbon(B, mats.deck, P, N, -w / 2 - 0.5, -w / 2 - 0.25, (k) => yfn(k) + 0.95, 2);
  // pillars every ~24 m
  let acc = 0;
  for (let i = 1; i < P.length - 1; i++) {
    acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (acc < 24) continue;
    acc = 0;
    const g = heightAt(P[i][0], P[i][1]);
    const top = yfn(i) - 0.9;
    if (top - g < 1.5) continue;
    const box = new THREE.BoxGeometry(1.2, top - g + 1, w * 0.8);
    box.translate(0, (top + g - 1) / 2, 0);
    const T = new THREE.Matrix4().makeRotationY(Math.atan2(N[i][0], N[i][1]) + Math.PI / 2).setPosition(P[i][0], 0, P[i][1]);
    B.geo(mats.deck, box, T);
  }
}

// deck height for walking/driving over bridges (null if not on a bridge)
export function bridgeHeight(x, z) {
  const list = GEO.bridges;
  if (!list) return null;
  for (const b of list) {
    if (b.fn) {
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      const h = b.fn(x, z);
      if (h !== null) return h;
      continue;
    }
    const P = b.P;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      if (Math.max(ax, bx) + b.w < x || Math.min(ax, bx) - b.w > x || Math.max(az, bz) + b.w < z || Math.min(az, bz) - b.w > z) continue;
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      if (Math.hypot(x - ax - t * dx, z - az - t * dz) < b.w) return b.y[i] + (b.y[i + 1] - b.y[i]) * t;
    }
  }
  return null;
}

// ---------------- railway ----------------
export function buildRail(B, lines, mats) {
  const railPos = [];
  for (const r of GEO.rails) {
    const P = resample(pairs(r.p), 3);
    if (P.length < 2) continue;
    const N = normals(P);
    let yfn;
    if (r.up !== undefined) {
      yfn = (k) => railHeightAt(P[k][0], P[k][1]);            // custom underpass deck (landmarks.js)
    } else if (r.br) {
      const y0 = heightAt(P[0][0], P[0][1]), y1 = heightAt(P[P.length - 1][0], P[P.length - 1][1]);
      const L = [0]; let acc = 0;
      for (let i = 1; i < P.length; i++) { acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); L.push(acc); }
      yfn = (k) => y0 + (y1 - y0) * L[k] / (acc || 1);
      bridgeStructure(B, mats, P, N, 4.2, (k) => yfn(k) - 0.2);
    } else yfn = (k) => railHeightAt(P[k][0], P[k][1]);
    ribbon(B, mats.ballast, P, N, -2.1, 2.1, (k) => yfn(k) + 0.02, 1.2);
    ribbon(B, mats.track, P, N, -1.4, 1.4, (k) => yfn(k) + 0.07, 1.2, { along: true });
    // two rails (head 7 cm, 15 cm high)
    for (const s of [-0.7175, 0.7175]) {
      for (let i = 0; i < P.length - 1; i++) {
        const a = [P[i][0] + N[i][0] * s, P[i][1] + N[i][1] * s], b = [P[i + 1][0] + N[i + 1][0] * s, P[i + 1][1] + N[i + 1][1] * s];
        const ya = yfn(i) + 0.08, yb = yfn(i + 1) + 0.08;
        const h = 0.15, hw = 0.035;
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        const nx = -dz / L * hw, nz = dx / L * hw;
        B.quad(mats.rail, a[0] - nx, a[1] - nz, b[0] - nx, b[1] - nz, ya, ya + h, yb, yb + h, 0, 1, 0, 1, 0, 1, null, { noCast: true });
        B.quad(mats.rail, b[0] + nx, b[1] + nz, a[0] + nx, a[1] + nz, yb, yb + h, ya, ya + h, 0, 1, 0, 1, 0, 1, null, { noCast: true });
        const top = [a[0] + nx, ya + h, a[1] + nz, a[0] - nx, ya + h, a[1] - nz, b[0] - nx, yb + h, b[1] - nz, a[0] + nx, ya + h, a[1] + nz, b[0] - nx, yb + h, b[1] - nz, b[0] + nx, yb + h, b[1] + nz];
        const ux = top[3] - top[0], uz = top[5] - top[2], vx = top[6] - top[0], vz = top[8] - top[2];
        if (uz * vx - ux * vz < 0) { for (const o of [0, 9]) { for (let c = 0; c < 3; c++) { const t = top[o + 3 + c]; top[o + 3 + c] = top[o + 6 + c]; top[o + 6 + c] = t; } } }
        B.tris(mats.rail, top, [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], null, { noCast: true });
      }
    }
    // catenary on the electrified main tracks: masts every ~55 m, messenger + contact wire
    if (r.el && r.main) {
      let acc = 55, last = null;
      for (let i = 0; i < P.length; i++) {
        if (i > 0) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
        if (acc < 55 && i !== P.length - 1) continue;
        acc = 0;
        const [x, z] = P[i], [nx, nz] = N[i];
        const y = yfn(i);
        const mx = x + nx * 3.1, mz = z + nz * 3.1;
        const mast = new THREE.BoxGeometry(0.28, 8.4, 0.28); mast.translate(mx, y + 4.2, mz);
        B.geo(mats.mast, mast);
        const arm = new THREE.BoxGeometry(0.08, 0.08, 3.4); arm.translate(0, 0, 0);
        const T = new THREE.Matrix4().makeRotationY(Math.atan2(nx, nz)).setPosition((mx + x) / 2, y + 7.0, (mz + z) / 2);
        B.geo(mats.mast, arm, T);
        const cur = [x, y + 5.6, z, x, y + 6.9, z];
        if (last) {
          for (const [k, sag] of [[0, 0.05], [3, 0.35]]) {
            for (let t = 0; t < 6; t++) {
              const f0 = t / 6, f1 = (t + 1) / 6;
              const s0 = sag * 4 * f0 * (1 - f0), s1 = sag * 4 * f1 * (1 - f1);
              railPos.push(last[k] + (cur[k] - last[k]) * f0, last[k + 1] + (cur[k + 1] - last[k + 1]) * f0 - s0, last[k + 2] + (cur[k + 2] - last[k + 2]) * f0,
                last[k] + (cur[k] - last[k]) * f1, last[k + 1] + (cur[k + 1] - last[k + 1]) * f1 - s1, last[k + 2] + (cur[k + 2] - last[k + 2]) * f1);
            }
          }
        }
        last = cur;
      }
    }
  }
  for (const v of railPos) lines.push(v);
  // platforms
  for (const pl of GEO.platforms) {
    const P = pairs(pl.p);
    if (P.length < 3) continue;
    const ys = P.map(p => heightAt(p[0], p[1]));
    const y = Math.max(...ys) + 0.55;
    const shape = P.map(p => new THREE.Vector2(p[0], p[1]));
    const tri = THREE.ShapeUtils.triangulateShape(shape, []);
    const pos = [], nrm = [], uv = [];
    for (const t of tri) {
      const [a, b, c] = [P[t[0]], P[t[1]], P[t[2]]];
      const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
      for (const p of up ? [a, b, c] : [a, c, b]) { pos.push(p[0], y, p[1]); nrm.push(0, 1, 0); uv.push(p[0], p[1]); }
    }
    B.tris(M.pavers, pos, nrm, uv);
    for (let k = 0; k < P.length; k++) {
      const a = P[k], b = P[(k + 1) % P.length];
      B.quad(M.concrete, a[0], a[1], b[0], b[1], ys[k] - 0.3, y, ys[(k + 1) % P.length] - 0.3, y, 0, 1, 0, 1, 0, 1);
      B.quad(M.concrete, b[0], b[1], a[0], a[1], ys[(k + 1) % P.length] - 0.3, y, ys[k] - 0.3, y, 0, 1, 0, 1, 0, 1);
    }
  }
}
