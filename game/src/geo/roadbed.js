import { GEO, heightAt, fineAt, underpassAt } from './data.js';
import { planY, planShoulderY } from './roads.js';

// The roads' bed (V79). Every road of the map was audited on its real geometry (tools/roads-audit.mjs) and the faults
// it found are put right here, before the terrain is meshed:
//  * the terrain's 5 m (10 m beyond 3 km) triangles poked through the asphalt where the road runs across a slope - grass
//    in saw-teeth over half a lane - and left the road's edge in the air on the downhill side: the grid's nodes around
//    every road are moved (lowered under it, raised by its outer edge) until the ground lies under the asphalt and
//    meets its edge, the farther levels of detail too (the grass took whole stretches of road seen from 300 m on);
//  * at a junction the lesser road's asphalt and shoulders stood up to half a metre over or under the greater one's:
//    they meet it at its level now;
//  * OSM's data: DN1's one-way carriageways overlapped (axes 6-7 m apart, each 8 m wide, some tagged with 4 lanes:
//    15 m), a residential street had 21 lanes (55 m), roads ran on past the map's edge;
//  * roads through houses (OSM's lines and footprints off by a metre or two): the road keeps clear of the walls,
//    shifted or narrowed;
//  * what stood on the carriageway: the street poles, power poles, trees and bushes of the woods.

const pairs = (flat) => { const o = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };
const vkey = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);

// ---------------- the data put right (after the landmarks' own steps, before the plan) ----------------
export function prepareRoadbed() {
  for (const r of GEO.roads) {
    // lane counts mistyped in OSM (a gravel residential street with 21 lanes: 55 m wide)
    if (r.w > 19 && r.c !== 'trunk' && r.c !== 'primary') r.w = r.c === 'secondary' || r.c === 'tertiary' ? 7.5 : 5.6;
    // DN1's one-way carriageways tagged with 4 lanes: 2 each way, as on the photos at Etu and Păstrăvăria (etu.js)
    if (r.c === 'trunk' && r.ow === 'yes' && Number(r.lanes) >= 4 && r.w > 8) r.w = 7.6;
  }
  separateCarriageways();
  clipToWorld();
}

// The two carriageways of a divided road, mapped as two one-way ways, kept their width plus a 0.6 m median apart: each
// moves away from the other by half of what is missing. The ends where they meet other ways stay put (the shift fades
// in over 25 m); a vertex shared with a slip road moves with it.
function separateCarriageways(median = 0.6) {
  const C = GEO.roads.filter(r => r.ow === 'yes' && (r.c === 'trunk' || r.c === 'primary') && !r.own && !r.tu && !r.br && r.p.length >= 4);
  const use = new Map();
  for (const r of GEO.roads) for (let i = 0; i < r.p.length; i += 2) { const k = vkey(r.p[i], r.p[i + 1]); use.set(k, (use.get(k) || 0) + 1); }
  const CELL = 25, grid = new Map(), gk = (i, j) => i * 100003 + j;
  C.forEach((r, ci) => {
    for (let i = 2; i < r.p.length; i += 2) {
      const x0 = Math.min(r.p[i - 2], r.p[i]), x1 = Math.max(r.p[i - 2], r.p[i]), z0 = Math.min(r.p[i - 1], r.p[i + 1]), z1 = Math.max(r.p[i - 1], r.p[i + 1]);
      for (let a = Math.floor(x0 / CELL); a <= Math.floor(x1 / CELL); a++) for (let b = Math.floor(z0 / CELL); b <= Math.floor(z1 / CELL); b++) {
        const k = gk(a, b); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(ci, i);
      }
    }
  });
  const shift = new Map();                                   // vertex key -> [dx, dz, count]
  C.forEach((r, ci) => {
    const P = pairs(r.p), m = P.map(() => [0, 0]);
    for (let k = 0; k < P.length; k++) {
      const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      const nx = -tz, nz = tx, [x, z] = P[k];
      let best = 0, side = 0;
      const seen = new Set();
      for (let A = Math.floor(x / CELL) - 1; A <= Math.floor(x / CELL) + 1; A++) for (let Bc = Math.floor(z / CELL) - 1; Bc <= Math.floor(z / CELL) + 1; Bc++) {
        const list = grid.get(gk(A, Bc));
        if (!list) continue;
        for (let q = 0; q < list.length; q += 2) {
          const cj = list[q], i = list[q + 1];
          if (cj === ci || seen.has(cj * 1e5 + i)) continue;
          seen.add(cj * 1e5 + i);
          const o = C[cj], ax = o.p[i - 2], az = o.p[i - 1], bx = o.p[i], bz = o.p[i + 1], dx = bx - ax, dz = bz - az, d2 = dx * dx + dz * dz || 1;
          if ((dx * tx + dz * tz) / Math.sqrt(d2) > -0.6) continue;              // not the other way
          const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / d2)), vx = ax + dx * u - x, vz = az + dz * u - z;
          const lat = vx * nx + vz * nz, lon = vx * tx + vz * tz;
          if (Math.abs(lon) > 4 || Math.abs(lat) < 0.5) continue;
          const need = (r.w + o.w) / 2 + median - Math.abs(lat);
          if (need > best) { best = need; side = Math.sign(lat); }
        }
      }
      if (best > 0.3) m[k] = [-side * nx * best / 2, -side * nz * best / 2];
    }
    // the fade from the ends that meet other ways
    const S = [0];
    for (let k = 1; k < P.length; k++) S.push(S[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const L = S[S.length - 1], j0 = (use.get(vkey(...P[0])) || 0) > 1, j1 = (use.get(vkey(...P[P.length - 1])) || 0) > 1;
    for (let k = 0; k < P.length; k++) {
      const f = Math.min(j0 ? S[k] / 25 : 1, j1 ? (L - S[k]) / 25 : 1, 1);
      if (!m[k][0] && !m[k][1]) continue;
      const key = vkey(...P[k]), e = shift.get(key) || [0, 0, 0];
      e[0] += m[k][0] * f; e[1] += m[k][1] * f; e[2]++; shift.set(key, e);
    }
  });
  if (!shift.size) return;
  let moved = 0;
  for (const r of GEO.roads) {
    let hit = false;
    const p = r.p.slice();
    for (let i = 0; i < p.length; i += 2) {
      const e = shift.get(vkey(p[i], p[i + 1]));
      if (e) { p[i] += e[0] / e[2]; p[i + 1] += e[1] / e[2]; hit = true; }
    }
    if (hit) { r.p = p; moved++; }
  }
  GEO.roadbedLog = { ...(GEO.roadbedLog || {}), carriagewaysMoved: moved };
}

// roads cut at the map's edge (beyond it the terrain is the far relief's, the grid's height there only its last row)
function clipToWorld() {
  const E = GEO.worldExt - 12, out = [];
  const clip = (a, b) => {                                     // Liang-Barsky: [t0, t1] of the segment inside the box
    let t0 = 0, t1 = 1;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] + E], [dx, E - a[0]], [-dz, a[1] + E], [dz, E - a[1]]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return [t0, t1];
  };
  let cut = 0;
  for (const r of GEO.roads) {
    const P = pairs(r.p);
    if (P.every(([x, z]) => Math.abs(x) <= E && Math.abs(z) <= E)) { out.push(r); continue; }
    cut++;
    const pieces = [];
    let cur = [];
    for (let i = 0; i + 1 < P.length; i++) {
      const c = clip(P[i], P[i + 1]);
      if (!c) { if (cur.length > 1) pieces.push(cur); cur = []; continue; }
      const at = (t) => [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t];
      if (c[0] > 0 || !cur.length) { if (cur.length > 1) pieces.push(cur); cur = [at(c[0])]; }
      cur.push(at(c[1]));
      if (c[1] < 1) { if (cur.length > 1) pieces.push(cur); cur = []; }
    }
    if (cur.length > 1) pieces.push(cur);
    pieces.forEach((q, i) => out.push(i ? { ...r, id: r.id + ':' + i, p: q.flat() } : Object.assign(r, { p: q.flat() })));
  }
  GEO.roads = out;
  GEO.roadbedLog = { ...(GEO.roadbedLog || {}), clippedAtEdge: cut };
}

// ---------------- the roads kept clear of the buildings ----------------
// fit(P, N, hl, hr): per cross-section the nearest wall on either side (the section's line cut with the footprints);
// where the road (hl / hr: its half-widths with the shoulders) would reach a wall it moves away from it, and narrows if
// the gap is narrower than the road (down to 55 %: a road through a house is left as mapped)
export function fitBuildings() {
  const CELL = 20, grid = new Map(), gk = (i, j) => i * 100003 + j;
  const B = [];
  for (const b of GEO.buildings) {
    if (!b.p || b.p.length < 6) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < b.p.length; i += 2) { x0 = Math.min(x0, b.p[i]); x1 = Math.max(x1, b.p[i]); z0 = Math.min(z0, b.p[i + 1]); z1 = Math.max(z1, b.p[i + 1]); }
    const id = B.push({ p: b.p, x0, x1, z0, z1 }) - 1;
    for (let a = Math.floor(x0 / CELL); a <= Math.floor(x1 / CELL); a++) for (let c = Math.floor(z0 / CELL); c <= Math.floor(z1 / CELL); c++) {
      const k = gk(a, c); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id);
    }
  }
  const os = [], stamp = new Int32Array(B.length), RES = { dl: 0, dr: 0, inside: false };
  let pass = 0;
  // the walls nearest a section through (x, z) along n (offsets in n's units): { dl, dr, inside } (one object, reused)
  const across = (x, z, nx, nz, reach) => {
    let dl = Infinity, dr = Infinity, inside = false;
    const ex = Math.abs(nx) * reach, ez = Math.abs(nz) * reach;
    pass++;
    for (let a = Math.floor((x - ex) / CELL); a <= Math.floor((x + ex) / CELL); a++) for (let c = Math.floor((z - ez) / CELL); c <= Math.floor((z + ez) / CELL); c++) {
      const list = grid.get(gk(a, c));
      if (!list) continue;
      for (const id of list) {
        if (stamp[id] === pass) continue;
        stamp[id] = pass;
        const b = B[id];
        if (b.x1 < x - ex || b.x0 > x + ex || b.z1 < z - ez || b.z0 > z + ez) continue;
        os.length = 0;
        const p = b.p, n = p.length / 2;
        for (let i = 0; i < n; i++) {
          const x1 = p[2 * i], z1 = p[2 * i + 1], x2 = p[(2 * i + 2) % p.length], z2 = p[(2 * i + 3) % p.length];
          const qx = x2 - x1, qz = z2 - z1, det = -nx * qz + qx * nz;
          if (Math.abs(det) < 1e-12) continue;
          const rx = x1 - x, rz = z1 - z, o = (-rx * qz + qx * rz) / det, s = (nx * rz - nz * rx) / det;
          if (s >= 0 && s < 1) os.push(o);
        }
        os.sort((u, v) => u - v);
        for (let q = 0; q + 1 < os.length; q += 2) {
          const lo = os[q], hi = os[q + 1];
          if (hi < 0) dl = Math.min(dl, -hi); else if (lo > 0) dr = Math.min(dr, lo); else inside = true;
        }
      }
    }
    RES.dl = dl; RES.dr = dr; RES.inside = inside;
    return RES;
  };
  let fitted = 0, through = 0;
  // is a building within r of (x, z)? (its bounding box)
  const near = (x, z, r) => {
    for (let a = Math.floor((x - r) / CELL); a <= Math.floor((x + r) / CELL); a++) for (let c = Math.floor((z - r) / CELL); c <= Math.floor((z + r) / CELL); c++) {
      const list = grid.get(gk(a, c));
      if (list) for (const id of list) { const b = B[id]; if (b.x0 - r <= x && x <= b.x1 + r && b.z0 - r <= z && z <= b.z1 + r) return true; }
    }
    return false;
  };
  const fit = (P, N, hl, hr) => {
    const n = P.length, c = new Float64Array(n), s = new Float64Array(n).fill(1);
    let any = false;
    const apply = (ks, f) => {
      if (f.inside) { through++; return; }
      const DL = f.dl - 0.2, DR = f.dr - 0.2;                 // 20 cm off the walls
      if (DL >= hl && DR >= hr) return;
      const sc = Math.min(1, (DL + DR) / (hl + hr));
      if (sc < 0.55) { through++; return; }
      const cc = Math.min(DR - hr * sc, Math.max(-DL + hl * sc, 0));
      for (const k of ks) { if (sc < s[k]) s[k] = sc; if (Math.abs(cc) > Math.abs(c[k])) c[k] = cc; }
      any = true;
    };
    const reach = Math.max(hl, hr) + 0.6;
    for (let k = 0; k < n; k++) apply([k], across(P[k][0], P[k][1], N[k][0], N[k][1], reach));
    for (let k = 0; k + 1 < n; k++) apply([k, k + 1], across((P[k][0] + P[k + 1][0]) / 2, (P[k][1] + P[k + 1][1]) / 2, (N[k][0] + N[k + 1][0]) / 2, (N[k][1] + N[k + 1][1]) / 2, reach));
    if (!any) return { P, N };
    fitted++;
    // the change eased along the road: a neighbour's narrowing and shift spread one vertex each way
    const c2 = Float64Array.from(c, (v, k) => [c[k - 1], v, c[k + 1]].reduce((m, u) => (u !== undefined && Math.abs(u) > Math.abs(m) ? u : m), v) * 0.5 + v * 0.5);
    const s2 = Float64Array.from(s, (v, k) => Math.min(v, ((s[k - 1] ?? 1) + 1) / 2, ((s[k + 1] ?? 1) + 1) / 2));
    return { P: P.map((p, k) => [p[0] + N[k][0] * c2[k], p[1] + N[k][1] * c2[k]]), N: N.map((v, k) => [v[0] * s2[k], v[1] * s2[k]]) };
  };
  fit.stats = () => ({ fitted, through });
  fit.near = near;
  return fit;
}

// ---------------- the plans' index: which road covers a point, its height there ----------------
const ICELL = 16, IORG = 9000, ISPAN = Math.ceil(2 * IORG / ICELL);
let IDX = null;
export function indexPlans(plans) {
  const cells = new Map();
  for (const pl of plans) {
    const { P, N, w } = pl, oL = -(w / 2 + pl.shL), oR = w / 2 + pl.shR;
    for (let k = 0; k + 1 < P.length; k++) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const q of [k, k + 1]) for (const o of [oL, oR]) {
        const x = P[q][0] + N[q][0] * o, z = P[q][1] + N[q][1] * o;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      for (let a = Math.floor((x0 - 1 + IORG) / ICELL); a <= Math.floor((x1 + 1 + IORG) / ICELL); a++) for (let b = Math.floor((z0 - 1 + IORG) / ICELL); b <= Math.floor((z1 + 1 + IORG) / ICELL); b++) {
        const key = b * ISPAN + a;
        let e = cells.get(key);
        if (!e) cells.set(key, e = []);
        e.push(pl.i, k);
      }
    }
  }
  IDX = { cells, plans };
  return IDX;
}
// the point's place in segment k of a plan: [t along, offset across] (the section's normals interpolated)
function local(pl, k, x, z) {
  const A = pl.P[k], B = pl.P[k + 1], NA = pl.N[k], NB = pl.N[k + 1];
  const dx = B[0] - A[0], dz = B[1] - A[1], L2 = dx * dx + dz * dz || 1e-9;
  let t = ((x - A[0]) * dx + (z - A[1]) * dz) / L2, o = 0;
  for (let it = 0; it < 3; it++) {
    const nx = NA[0] + (NB[0] - NA[0]) * t, nz = NA[1] + (NB[1] - NA[1]) * t, rx = x - A[0] - dx * t, rz = z - A[1] - dz * t;
    o = (rx * nx + rz * nz) / (nx * nx + nz * nz || 1e-9);
    t += ((rx - nx * o) * dx + (rz - nz * o) * dz) / L2;
  }
  LOC[0] = t; LOC[1] = o;
  return LOC;
}
const LOC = [0, 0];
// cb(plan, k, t, o, y) for every road (with its shoulders if sh) over (x, z); pad widens them (negative: deep inside)
export function roadsAt(x, z, cb, sh = true, pad = 0) {
  if (!IDX) return;
  const e = IDX.cells.get(Math.floor((z + IORG) / ICELL) * ISPAN + Math.floor((x + IORG) / ICELL));
  if (!e) return;
  for (let q = 0; q < e.length; q += 2) {
    const pl = IDX.plans[e[q]], k = e[q + 1];
    const [t, o] = local(pl, k, x, z);
    if (t < -1e-3 || t > 1.001) continue;
    const lo = -pl.w / 2 - (sh ? pl.shL : 0) - pad, hi = pl.w / 2 + (sh ? pl.shR : 0) + pad;
    if (o < lo || o > hi) continue;
    const oc = Math.max(-pl.w / 2 - pl.shL, Math.min(pl.w / 2 + pl.shR, o)), tc = Math.max(0, Math.min(1, t));
    const f = Math.abs(oc) <= pl.w / 2 ? planY : planShoulderY;
    if (cb(pl, k, tc, o, f(pl, k, oc) * (1 - tc) + f(pl, k + 1, oc) * tc) === true) return;
  }
}
// the drivable road surface at (x, z) (null off the roads; the bridges are bridgeHeight's): with ref (the height one
// comes from) the highest at most 0.6 m over it - a road under a bridge stays the road under it
export function roadSurfaceAt(x, z, ref) {
  let best = null;
  roadsAt(x, z, (pl, k, t, o, y) => { if (!pl.flat && (ref === undefined || y <= ref + 0.6) && (best === null || y > best)) best = y; });
  return best;
}
// is (x, z) on a road (pad metres round it; negative: that far inside)?
export function onRoad(x, z, pad = 0) {
  let hit = false;
  roadsAt(x, z, () => (hit = true), true, pad);
  return hit;
}
// may a tree or a bush grow at (x, z)? Not on a road, nor half a metre round a paved one (a forest track's own trees
// stand right at its edge)
export function treeOnRoad(x, z) {
  let hit = false;
  roadsAt(x, z, (pl, k, t, o) => {
    if (pl.surf !== 'gravel' && pl.surf !== 'dirt' || (o >= -pl.w / 2 - pl.shL && o <= pl.w / 2 + pl.shR)) return (hit = true);
  }, true, 0.5);
  return hit;
}
// a post standing on a road moved off it, square to the road, clear metres past its outer edge
export function offRoad(x, z, clear = 0.35) {
  for (let it = 0; it < 3; it++) {
    let mv = null;
    roadsAt(x, z, (pl, k, t, o) => {
      const NA = pl.N[k], NB = pl.N[k + 1], A = pl.P[k], B = pl.P[k + 1];
      const nx = NA[0] + (NB[0] - NA[0]) * t, nz = NA[1] + (NB[1] - NA[1]) * t, L = Math.hypot(nx, nz) || 1;
      const to = o < 0 ? -pl.w / 2 - pl.shL - clear / L : pl.w / 2 + pl.shR + clear / L;
      mv = [A[0] + (B[0] - A[0]) * t + nx * to, A[1] + (B[1] - A[1]) * t + nz * to];
      return true;
    }, true, clear - 0.05);
    if (!mv) return [x, z];
    [x, z] = mv;
  }
  return [x, z];
}

// ---------------- junctions: the lesser road meets the greater at its level ----------------
// (only: the plans to put right, by index; the others are met as they are)
export function snapJunctions(plans, only = null) {
  const order = plans.filter(p => !p.flat).sort((a, b) => b.rank - a.rank || a.i - b.i);
  const pos = new Int32Array(plans.length).fill(-1);
  order.forEach((p, i) => { pos[p.i] = i; });
  let snapped = 0;
  const alone = (pl, x, z) => { const e = IDX.cells.get(Math.floor((z + IORG) / ICELL) * ISPAN + Math.floor((x + IORG) / ICELL)); if (!e) return true; for (let q = 0; q < e.length; q += 2) if (e[q] !== pl.i) return false; return true; };
  for (const pl of order) {
    if (only && !only.has(pl.i)) continue;
    const me = pos[pl.i], { P, N, O, n, Y, S, w } = pl;
    const shift = new Float32Array(P.length), got = new Uint8Array(P.length);
    for (let k = 0; k < P.length; k++) {
      if (alone(pl, P[k][0], P[k][1]) && alone(pl, P[k][0] + N[k][0] * (w / 2 + 1), P[k][1] + N[k][1] * (w / 2 + 1)) && alone(pl, P[k][0] - N[k][0] * (w / 2 + 1), P[k][1] - N[k][1] * (w / 2 + 1))) continue;
      for (let j = 0; j <= n; j++) {
        const x = P[k][0] + N[k][0] * O[j], z = P[k][1] + N[k][1] * O[j], i = k * (n + 1) + j;
        let ys = -Infinity;
        roadsAt(x, z, (q, kk, t, o, y) => { if (q !== pl && !q.flat && pos[q.i] < me && Math.abs(y - Y[i]) < 0.6 && y > ys) ys = y; }, false);
        if (ys > -Infinity) { if (!got[k] || Math.abs(ys - 0.003 - Y[i]) > Math.abs(shift[k])) shift[k] = ys - 0.003 - Y[i]; got[k] = 1; Y[i] = ys - 0.003; snapped++; }
      }
      // the shoulders' outer edges: under any other road's asphalt
      for (const side of [0, 1]) {
        const i = 2 * k + side;
        if (Number.isNaN(S[i])) continue;
        const off = side ? w / 2 + pl.shR : -w / 2 - pl.shL, x = P[k][0] + N[k][0] * off, z = P[k][1] + N[k][1] * off;
        let ys = -Infinity;
        roadsAt(x, z, (q, kk, t, o, y) => { if (q !== pl && !q.flat && Math.abs(y - S[i]) < 0.6 && y > ys) ys = y; }, false);
        if (ys > -Infinity) S[i] = Math.min(S[i], ys - 0.03);
      }
    }
    // the rest of the road eased onto the junction's level over 10 m (no step where the snapping ends)
    if (!got.some(Boolean)) continue;
    const L = new Float64Array(P.length);
    for (let k = 1; k < P.length; k++) L[k] = L[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
    for (let k = 0; k < P.length; k++) {
      if (got[k]) continue;
      let best = 0, bd = 10;
      for (let q = k - 1; q >= 0 && L[k] - L[q] < 10; q--) if (got[q]) { if (L[k] - L[q] < bd) { bd = L[k] - L[q]; best = shift[q]; } break; }
      for (let q = k + 1; q < P.length && L[q] - L[k] < 10; q++) if (got[q]) { if (L[q] - L[k] < bd) { bd = L[q] - L[k]; best = shift[q]; } break; }
      if (!best) continue;
      const d = best * (1 - bd / 10);
      for (let j = 0; j <= n; j++) Y[k * (n + 1) + j] += d;
      S[2 * k] += d; S[2 * k + 1] += d; pl.Yc[k] += d;
    }
  }
  GEO.roadbedLog = { ...(GEO.roadbedLog || {}), junctionPoints: snapped };
}

// ---------------- the terrain under the roads ----------------
// Each road triangle against the grid it lies on (piecewise linear, the same diagonal as data.js gridHeight): their
// difference is extreme at the triangle's corners, where its edges cross the grid's lines (the cells' sides and
// diagonals) and at the grid's nodes inside it. In that order:
//  1. the nodes under a road are filled up to just under it (a road on a bank has its bank under it, not air);
//  2. along the outer edges the nodes off the roads come up to 6 cm under the edge (at most 1.2 m; a bigger gap is the
//     bank's: buildBanks);
//  3. at every point the ground stands over the asphalt (2 cm under it, 1 cm under a shoulder) the nodes over it are
//     lowered, by their weights (the least change; the nodes under it are left alone: no pit beside a node held up);
//  4. where the ground could not give way, the road comes up over it (at most 40 cm).
// Nodes under a building keep within its plinth (no house left floating or buried), the hand-built street, the fine
// zones and the underpasses are left alone, no node moves more than 3 m (8 m down under a bridge's deck). The farther
// levels of detail are lowered under each road's lowest line the same way.
const CP = { n: 0, x: new Float64Array(64), z: new Float64Array(64), y: new Float64Array(64), node: new Uint8Array(64) };
const cpush = (x, z, y, node) => { if (CP.n < 64) { CP.x[CP.n] = x; CP.z[CP.n] = z; CP.y[CP.n] = y; CP.node[CP.n] = node; CP.n++; } };
function lines(v0, v1, px, pz, py, qx, qz, qy) {
  if (v1 === v0) return;
  const lo = Math.ceil(Math.min(v0, v1)), hi = Math.max(v0, v1), inv = 1 / (v1 - v0);
  for (let L = lo; L <= hi; L++) { const t = (L - v0) * inv; if (t > 1e-6 && t < 1 - 1e-6) cpush(px + (qx - px) * t, pz + (qz - pz) * t, py + (qy - py) * t, 0); }
}
function edgeCross(ext, st, px, pz, py, qx, qz, qy) {
  const fx0 = (px + ext) / st, fz0 = (pz + ext) / st, fx1 = (qx + ext) / st, fz1 = (qz + ext) / st;
  lines(fx0, fx1, px, pz, py, qx, qz, qy); lines(fz0, fz1, px, pz, py, qx, qz, qy); lines(fx0 + fz0, fx1 + fz1, px, pz, py, qx, qz, qy);
}
// the critical points of a triangle (or of a segment: c = a) into CP
function crit(V, ax, az, ay, bx, bz, by, cx, cz, cy, seg = false) {
  const ext = V.ext, st = V.st;
  CP.n = 0;
  cpush(ax, az, ay, 0); cpush(bx, bz, by, 0);
  edgeCross(ext, st, ax, az, ay, bx, bz, by);
  if (seg) return;
  cpush(cx, cz, cy, 0);
  edgeCross(ext, st, bx, bz, by, cx, cz, cy); edgeCross(ext, st, cx, cz, cy, ax, az, ay);
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-12) return;
  const fa = (ax + ext) / st, fb = (bx + ext) / st, fc = (cx + ext) / st, ga = (az + ext) / st, gb = (bz + ext) / st, gc = (cz + ext) / st;
  for (let i = Math.ceil(Math.min(fa, fb, fc)); i <= Math.max(fa, fb, fc); i++) for (let j = Math.ceil(Math.min(ga, gb, gc)); j <= Math.max(ga, gb, gc); j++) {
    const x = i * st - ext, z = j * st - ext;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 >= 0 && l2 >= 0 && l3 >= 0) cpush(x, z, l1 * ay + l2 * by + l3 * cy, 1);
  }
}
// the grid's nodes and weights at (x, z) (as gridHeight): W = [i0, w0, i1, w1, i2, w2]
const W = new Float64Array(6);
function weights(V, x, z) {
  const m = V.m;
  let fx = (x + V.ext) / V.st, fz = (z + V.ext) / V.st;
  fx = Math.min(m - 1.0001, Math.max(0, fx)); fz = Math.min(m - 1.0001, Math.max(0, fz));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, a = j * m + i;
  if (u + v <= 1) { W[0] = a; W[1] = 1 - u - v; W[2] = a + 1; W[3] = u; W[4] = a + m; W[5] = v; }
  else { W[0] = a + m + 1; W[1] = u + v - 1; W[2] = a + m; W[3] = 1 - u; W[4] = a + 1; W[5] = 1 - v; }
}
// the ground at a point brought down to t: the nodes over t lowered (by their weights), within their bounds; strict:
// what one node's bounds keep back is taken from the other nodes over t (never from those under it: what a building's
// plinth holds up stays, rather than a pit dug beside it)
function lower(V, i0, w0, i1, w1, i2, w2, t, strict) {
  const h = V.h, lo = V.lo;
  for (let pass = 0; pass < (strict ? 3 : 1); pass++) {
    const e = h[i0] * w0 + h[i1] * w1 + h[i2] * w2 - t;
    if (e <= 1e-4) return 0;
    const f0 = h[i0] > t + 1e-4 && h[i0] > lo[i0] ? w0 : 0, f1 = h[i1] > t + 1e-4 && h[i1] > lo[i1] ? w1 : 0, f2 = h[i2] > t + 1e-4 && h[i2] > lo[i2] ? w2 : 0;
    const s2 = f0 * w0 + f1 * w1 + f2 * w2;
    if (s2 < 1e-6) return e;
    // (no node below the point's own target: a node barely over it does not make up for one a plinth holds up)
    const d = e / s2, floor = (i) => Math.max(lo[i], Math.min(h[i], t));
    h[i0] = Math.max(floor(i0), h[i0] - f0 * d); h[i1] = Math.max(floor(i1), h[i1] - f1 * d); h[i2] = Math.max(floor(i2), h[i2] - f2 * d);
  }
  return Math.max(0, h[i0] * w0 + h[i1] * w1 + h[i2] * w2 - t);
}
// every road triangle: cb(ax, az, ay, bx, bz, by, cx, cz, cy, shoulder, bridge, plan, k, strip j (-1 / n: the left /
// right shoulder), half); merged (a count of segments): one flat quad over that many segments at their lowest height,
// shoulders included (the farther levels: conservative, and far fewer)
function eachTri(plans, cb, merged = 0) {
  for (const pl of plans) {
    const { P, N, O, n, Y, S, w } = pl, nn = n + 1;
    for (let k = 0; k + 1 < P.length; k++) {
      const quad = (o0, o1, ya0, ya1, yb0, yb1, sh, j) => {
        const p0 = P[k], p1 = P[k + 1], n0 = N[k], n1 = N[k + 1];
        const ax0 = p0[0] + n0[0] * o0, az0 = p0[1] + n0[1] * o0, ax1 = p0[0] + n0[0] * o1, az1 = p0[1] + n0[1] * o1;
        const bx0 = p1[0] + n1[0] * o0, bz0 = p1[1] + n1[1] * o0, bx1 = p1[0] + n1[0] * o1, bz1 = p1[1] + n1[1] * o1;
        cb(ax0, az0, ya0, bx0, bz0, yb0, ax1, az1, ya1, sh, pl.flat, pl, k, j, 0);
        cb(ax1, az1, ya1, bx0, bz0, yb0, bx1, bz1, yb1, sh, pl.flat, pl, k, j, 1);
      };
      if (merged) {
        // (merged segments at a time, the lowest height over all their rows: a coarse cell is 25-100 m)
        if (k % merged) continue;
        const k1 = Math.min(P.length - 1, k + merged);
        let y = Infinity;
        for (let kk = k; kk <= k1; kk++) {
          for (let j = 0; j <= n; j++) y = Math.min(y, Y[kk * nn + j]);
          if (pl.shL) y = Math.min(y, S[2 * kk]);
          if (pl.shR) y = Math.min(y, S[2 * kk + 1]);
        }
        const o0 = -w / 2 - pl.shL, o1 = w / 2 + pl.shR, p0 = P[k], p1 = P[k1], n0 = N[k], n1 = N[k1];
        const ax0 = p0[0] + n0[0] * o0, az0 = p0[1] + n0[1] * o0, ax1 = p0[0] + n0[0] * o1, az1 = p0[1] + n0[1] * o1;
        const bx0 = p1[0] + n1[0] * o0, bz0 = p1[1] + n1[1] * o0, bx1 = p1[0] + n1[0] * o1, bz1 = p1[1] + n1[1] * o1;
        cb(ax0, az0, y, bx0, bz0, y, ax1, az1, y, false, pl.flat, pl, k, -2, 0);
        cb(ax1, az1, y, bx0, bz0, y, bx1, bz1, y, false, pl.flat, pl, k, -2, 1);
        continue;
      }
      for (let j = 0; j < n; j++) quad(O[j], O[j + 1], Y[k * nn + j], Y[k * nn + j + 1], Y[(k + 1) * nn + j], Y[(k + 1) * nn + j + 1], false, j);
      if (pl.shL) quad(-w / 2 - pl.shL, -w / 2, S[2 * k], Y[k * nn] - 0.02, S[2 * k + 2], Y[(k + 1) * nn] - 0.02, true, -1);
      if (pl.shR) quad(w / 2, w / 2 + pl.shR, Y[k * nn + n] - 0.02, S[2 * k + 1], Y[(k + 1) * nn + n] - 0.02, S[2 * k + 3], true, n);
    }
  }
}

// growable list of edge points: 3 nodes, 3 weights, the target, its kind (1: the ground up to it)
class Cons {
  constructor() { this.n = 0; this.cap = 1 << 16; this.i = new Int32Array(this.cap * 3); this.w = new Float32Array(this.cap * 3); this.t = new Float32Array(this.cap); this.k = new Uint8Array(this.cap); }
  push(kind, target) {
    if (this.n === this.cap) { this.cap *= 2; for (const [f, T, m] of [['i', Int32Array, 3], ['w', Float32Array, 3], ['t', Float32Array, 1], ['k', Uint8Array, 1]]) { const a = new T(this.cap * m); a.set(this[f]); this[f] = a; } }
    const n = this.n++;
    for (let q = 0; q < 3; q++) { this.i[n * 3 + q] = W[q * 2]; this.w[n * 3 + q] = W[q * 2 + 1]; }
    this.t[n] = target; this.k[n] = kind;
  }
}

// the views: a grid (near 5 m, world 10 m) at one of its levels of detail (stride s): heights h (the grid itself at
// s = 1, a copy of its every s-th node else), bounds lo / hi, mask (a road lies on the node)
function view(G, s, base = null) {
  const m = (G.n - 1) / s + 1, h = s === 1 ? G.H : new Float32Array(m * m);
  if (s > 1) for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) h[j * m + i] = G.H[(j * s) * G.n + i * s];
  const V = { G, s, m, ext: G.ext, st: G.step * s, h, lo: new Float32Array(m * m), hi: new Float32Array(m * m), mask: new Uint8Array(m * m), frozen: new Uint8Array(m * m) };
  for (let q = 0; q < m * m; q++) { V.lo[q] = h[q] - 3; V.hi[q] = h[q] + 3; }
  // (a farther level only goes down; what the full one keeps frozen it keeps too, a house's plinth it need not: a gap
  // under a house seen from 500 m is not seen)
  if (base) for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const q = j * m + i; if (base.frozen[(j * s) * base.m + i * s]) V.lo[q] = h[q]; V.hi[q] = h[q]; }
  return V;
}
// what must not move: the hand-built street and lots, the fine zones and underpasses (their own ground), and the
// buildings' plinths
function protect(V) {
  const { m, ext, st, lo, hi, h } = V;
  const box = (x0, x1, z0, z1, f) => {
    for (let j = Math.max(0, Math.floor((z0 + ext) / st)); j <= Math.min(m - 1, Math.ceil((z1 + ext) / st)); j++)
      for (let i = Math.max(0, Math.floor((x0 + ext) / st)); i <= Math.min(m - 1, Math.ceil((x1 + ext) / st)); i++) f(j * m + i);
  };
  const freeze = (q) => { lo[q] = hi[q] = h[q]; V.frozen[q] = 1; };
  box(-60, 60, -150, 170, freeze);
  for (const f of GEO.fine || []) box(f.x0 - st, f.x1 + st, f.z0 - st, f.z1 + st, freeze);
  for (const U of GEO.ups || []) box(U.bx0 - st, U.bx1 + st, U.bz0 - st, U.bz1 + st, freeze);
  for (const b of GEO.buildings) {
    if (!b.p || b.p.length < 6) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < b.p.length; i += 2) { x0 = Math.min(x0, b.p[i]); x1 = Math.max(x1, b.p[i]); z0 = Math.min(z0, b.p[i + 1]); z1 = Math.max(z1, b.p[i + 1]); }
    // a node whose cells reach under the building (one cell round it)
    box(x0 - st, x1 + st, z0 - st, z1 + st, (q) => {
      const y0 = (b.y0 ?? h[q]) - 0.25, y1 = (b.y1 ?? h[q]) + 0.35;
      lo[q] = Math.max(lo[q], Math.min(y0, h[q])); hi[q] = Math.min(hi[q], Math.max(y1, h[q]));
    });
  }
}

export function conformTerrain(plans, levels = { near: [], world: [] }) {
  const T0 = performance.now(), log = {}, ms = (k, t) => { log[k] = Math.round(performance.now() - t); };
  const Vn = view(GEO, 1), Vw = GEO.W ? view(GEO.W, 1) : null;
  protect(Vn); if (Vw) protect(Vw);
  const inNear = (x, z) => x >= -GEO.ext && x <= GEO.ext && z >= -GEO.ext && z <= GEO.ext;
  const skip = (x, z) => (GEO.fine && fineAt(x, z)) || (GEO.ups.length && underpassAt(x, z));
  const before = Vn.h.slice(), beforeW = Vw ? Vw.h.slice() : null;
  const views = Vw ? [Vn, Vw] : [Vn];
  const pick = (x, z) => (inNear(x, z) ? 0 : Vw ? 1 : -1);
  let t1 = performance.now();
  // 1. the nodes under the roads: marked, and filled up to just under the lowest road over them (a road on a bank has
  // its bank under it, not air); a bridge's deck leaves the ground under it alone
  const fill = views.map(V => new Float32Array(V.h.length).fill(Infinity));
  eachTri(plans, (ax, az, ay, bx, bz, by, cx, cz, cy, sh, flat) => {
    const v = pick((ax + bx + cx) / 3, (az + bz + cz) / 3);
    if (v < 0) return;
    const V = views[v], { ext, st, m } = V, eps = sh ? 0.01 : 0.02;
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) return;
    const fa = (ax + ext) / st, fb = (bx + ext) / st, fc = (cx + ext) / st, ga = (az + ext) / st, gb = (bz + ext) / st, gc = (cz + ext) / st;
    for (let i = Math.ceil(Math.min(fa, fb, fc)); i <= Math.max(fa, fb, fc); i++) for (let j = Math.ceil(Math.min(ga, gb, gc)); j <= Math.max(ga, gb, gc); j++) {
      if (i < 0 || j < 0 || i >= m || j >= m) continue;
      const x = i * st - ext, z = j * st - ext;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0 || pick(x, z) !== v) continue;
      const q = j * m + i;
      V.mask[q] = 1;
      if (!flat) fill[v][q] = Math.min(fill[v][q], l1 * ay + l2 * by + l3 * cy - eps - 0.01);
      // under a bridge's deck: what it spans (the elevation model smooths a valley up to the deck) may go 8 m down
      else if (V.lo[q] < V.h[q]) V.lo[q] = Math.min(V.lo[q], V.h[q] - 8);
    }
  });
  views.forEach((V, v) => {
    const F = fill[v], { h, hi } = V;
    for (let i = 0; i < h.length; i++) if (F[i] < Infinity && h[i] < F[i] && hi[i] > h[i]) h[i] = Math.min(hi[i], F[i]);
  });
  ms('fill', t1); t1 = performance.now();
  // 2. along the outer edges, where no other road lies: the ground brought up to them, by the nodes off the roads (at
  // most 1.2 m over where they were, never over the edge; a gap over 1.5 m is the bank's: buildBanks)
  const cons = views.map(() => new Cons());
  for (const pl of plans) {
    if (pl.flat) continue;
    const { P, N, Y, S, n, w } = pl, nn = n + 1;
    for (const side of [0, 1]) {
      const off = side ? w / 2 + pl.shR : -w / 2 - pl.shL, ys = (k) => (side ? (pl.shR ? S[2 * k + 1] : Y[k * nn + n]) : (pl.shL ? S[2 * k] : Y[k * nn]));
      for (let k = 0; k + 1 < P.length; k++) {
        const ax = P[k][0] + N[k][0] * off, az = P[k][1] + N[k][1] * off, bx = P[k + 1][0] + N[k + 1][0] * off, bz = P[k + 1][1] + N[k + 1][1] * off;
        const vi = pick((ax + bx) / 2, (az + bz) / 2);
        if (vi < 0) continue;
        crit(views[vi], ax, az, ys(k), bx, bz, ys(k + 1), 0, 0, 0, true);
        for (let q = 0; q < CP.n; q++) {
          const x = CP.x[q], z = CP.z[q], v = pick(x, z);
          if (v < 0 || skip(x, z)) continue;
          const V = views[v];
          weights(V, x, z);
          const T = V.h[W[0]] * W[1] + V.h[W[2]] * W[3] + V.h[W[4]] * W[5];
          if (T >= CP.y[q] - 0.08 || T < CP.y[q] - 1.5) continue;
          let other = false;
          roadsAt(x, z, (r) => { if (r !== pl) { other = true; return true; } }, true, 0.25);
          if (!other) { weights(V, x, z); cons[v].push(1, CP.y[q] - 0.06); }
        }
      }
    }
  }
  views.forEach((V, v) => {
    const C = cons[v], { h, hi, mask } = V, up = (v ? beforeW : before);
    const cap = (i, t) => Math.min(hi[i], up[i] + 1.2, t);
    for (let sweep = 0; sweep < 6; sweep++) for (let c = 0; c < C.n; c++) {
      const i0 = C.i[c * 3], i1 = C.i[c * 3 + 1], i2 = C.i[c * 3 + 2], w0 = C.w[c * 3], w1 = C.w[c * 3 + 1], w2 = C.w[c * 3 + 2], t = C.t[c];
      const e = t - (h[i0] * w0 + h[i1] * w1 + h[i2] * w2);
      if (e <= 1e-4) continue;
      const f0 = mask[i0] || h[i0] >= cap(i0, t) ? 0 : w0, f1 = mask[i1] || h[i1] >= cap(i1, t) ? 0 : w1, f2 = mask[i2] || h[i2] >= cap(i2, t) ? 0 : w2, s2 = f0 * w0 + f1 * w1 + f2 * w2;
      if (s2 < 1e-6) continue;
      const d = e / s2;
      if (f0) h[i0] = Math.min(cap(i0, t), h[i0] + f0 * d);
      if (f1) h[i1] = Math.min(cap(i1, t), h[i1] + f1 * d);
      if (f2) h[i2] = Math.min(cap(i2, t), h[i2] + f2 * d);
    }
    log['edges' + v] = C.n;
  });
  ms('edges', t1); t1 = performance.now();
  // 3. every road point over the ground (2 cm under the asphalt, 1 cm under a shoulder): put right at once (only
  // lowering from here on, so no point once right goes wrong again); a triangle whose cells' nodes all lie under it skipped
  let fixed = 0;
  const left = [];                                // the triangles the ground still stands over: [plan, k, j, half, by how much]
  eachTri(plans, (ax, az, ay, bx, bz, by, cx, cz, cy, sh, flat, pl, k, j, half) => {
    const vi = pick((ax + bx + cx) / 3, (az + bz + cz) / 3);
    if (vi < 0) return;
    const V = views[vi], eps = sh ? 0.01 : 0.02, { ext, st, m, h } = V;
    const ymin = Math.min(ay, by, cy) - eps;
    let top = -Infinity;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) + ext) / st)), i1 = Math.min(m - 1, Math.ceil((Math.max(ax, bx, cx) + ext) / st));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) + ext) / st)), j1 = Math.min(m - 1, Math.ceil((Math.max(az, bz, cz) + ext) / st));
    for (let j = j0; j <= j1 && top <= ymin; j++) for (let i = i0; i <= i1; i++) { const y = h[j * m + i]; if (y > top) top = y; }
    if (top <= ymin && pick(ax, az) === vi && pick(bx, bz) === vi && pick(cx, cz) === vi) return;
    crit(V, ax, az, ay, bx, bz, by, cx, cz, cy);
    let rest = 0;
    for (let q = 0; q < CP.n; q++) {
      const x = CP.x[q], z = CP.z[q], v = pick(x, z);
      if (v < 0 || skip(x, z)) continue;
      const U = views[v];
      weights(U, x, z);
      if (U.h[W[0]] * W[1] + U.h[W[2]] * W[3] + U.h[W[4]] * W[5] <= CP.y[q] - eps + 1e-4) continue;
      rest = Math.max(rest, lower(U, W[0], W[1], W[2], W[3], W[4], W[5], CP.y[q] - eps, true));
      fixed++;
    }
    if (rest > 0.003 && !flat) left.push([pl, k, j, half, rest]);
  });
  log.fixed = fixed;
  ms('cut', t1); t1 = performance.now();
  // 4. where the ground could not give way (a house's plinth, the hand-built ground) the road comes up over it: each
  // such triangle's corners lifted by what the ground still stands over it (at most 40 cm: more would be a hump; a
  // shoulder no more than 30 cm over its asphalt's edge)
  let lifted = 0;
  const lifts = new Map();
  for (const [pl, k, j, half, e] of left) {
    let L = lifts.get(pl);
    if (!L) lifts.set(pl, L = { Y: new Float32Array(pl.Y.length), S: new Float32Array(pl.S.length) });
    const nn = pl.n + 1, set = (arr, i) => { if (e > arr[i]) arr[i] = e; };
    // the quad's corners: (k, o0) (k, o1) (k+1, o0) (k+1, o1); half 0 = a0 b0 a1, half 1 = a1 b0 b1
    const corners = half ? [[k, 1], [k + 1, 0], [k + 1, 1]] : [[k, 0], [k + 1, 0], [k, 1]];
    for (const [kk, side] of corners) {
      if (j >= 0 && j < pl.n) set(L.Y, kk * nn + j + side);                              // asphalt strip j
      else if (j < 0) side ? set(L.Y, kk * nn) : set(L.S, 2 * kk);                       // left shoulder: outer, inner
      else side ? set(L.S, 2 * kk + 1) : set(L.Y, kk * nn + pl.n);                       // right shoulder: inner, outer
    }
  }
  for (const [pl, L] of lifts) {
    const { Y, S, P, n } = pl, nn = n + 1;
    for (let i = 0; i < Y.length; i++) if (L.Y[i] > 0) { Y[i] += Math.min(0.4, L.Y[i] + 0.005); lifted++; }
    for (let i = 0; i < S.length; i++) if (L.S[i] > 0) S[i] += Math.min(0.4, L.S[i] + 0.005);
    for (let k = 0; k < P.length; k++) { if (pl.shL) S[2 * k] = Math.min(S[2 * k], Y[k * nn] + 0.3); if (pl.shR) S[2 * k + 1] = Math.min(S[2 * k + 1], Y[k * nn + n] + 0.3); }
  }
  log.lifted = lifted;
  // the roads lifted and those they touch (their junctions are met again: geo/index.js)
  const touched = new Set();
  for (const pl of lifts.keys()) {
    touched.add(pl.i);
    for (let k = 0; k < pl.P.length; k++) {
      const e = IDX.cells.get(Math.floor((pl.P[k][1] + IORG) / ICELL) * ISPAN + Math.floor((pl.P[k][0] + IORG) / ICELL));
      if (e) for (let q = 0; q < e.length; q += 2) touched.add(e[q]);
    }
  }
  GEO.roadsLifted = touched;
  ms('lift', t1); t1 = performance.now();
  let moved = 0, maxDown = 0, maxUp = 0;
  for (const [V, B] of [[Vn, before], [Vw, beforeW]]) if (V) for (let q = 0; q < V.h.length; q++) { const d = V.h[q] - B[q]; if (Math.abs(d) > 0.005) moved++; maxDown = Math.min(maxDown, d); maxUp = Math.max(maxUp, d); }
  Object.assign(log, { moved, maxDown: +maxDown.toFixed(2), maxUp: +maxUp.toFixed(2) });
  // ---- the farther levels of detail (geo/terrain.js): every s-th node, lowered under the roads' lowest line
  const adj = new Map();
  for (const [G, list, base] of [[GEO, levels.near, Vn], [GEO.W, levels.world, Vw]]) {
    if (!G) continue;
    const mm = new Map();
    for (const s of list) {
      if (s <= 1) continue;
      const V = view(G, s, base), world = G !== GEO, { ext, st, m, h } = V;
      eachTri(plans, (ax, az, ay, bx, bz, by, cx, cz, cy) => {
        if (inNear((ax + bx + cx) / 3, (az + bz + cz) / 3) === world) return;
        const ymin = Math.min(ay, by, cy) - 0.03;
        let top = -Infinity;
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) + ext) / st)), i1 = Math.min(m - 1, Math.ceil((Math.max(ax, bx, cx) + ext) / st));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) + ext) / st)), j1 = Math.min(m - 1, Math.ceil((Math.max(az, bz, cz) + ext) / st));
        for (let j = j0; j <= j1 && top <= ymin; j++) for (let i = i0; i <= i1; i++) { const y = h[j * m + i]; if (y > top) top = y; }
        if (top <= ymin) return;
        crit(V, ax, az, ay, bx, bz, by, cx, cz, cy);
        for (let q = 0; q < CP.n; q++) {
          const x = CP.x[q], z = CP.z[q];
          if (inNear(x, z) === world) continue;
          weights(V, x, z);
          lower(V, W[0], W[1], W[2], W[3], W[4], W[5], CP.y[q] - 0.03, true);
        }
      }, Math.max(1, Math.min(4, Math.round(st / 12))));
      mm.set(s, V.h);
    }
    adj.set(G, mm);
  }
  GEO.lodAdj = adj;
  ms('lods', t1);
  log.ms = Math.round(performance.now() - T0);
  GEO.roadbedLog = { ...(GEO.roadbedLog || {}), terrain: log };
  return log;
}

// ---------------- banks ----------------
// Where the ground still falls away from a road's outer edge by over 10 cm (a road on a bank, a slope too steep for the
// 10 m cells to follow), a strip of the ground's own surface (the terrain's material: the same colours) runs down from the edge to the
// ground, 1 : 1.5 - not where the edge meets another road.
export function buildBanks(B, plans, terrain) {
  if (!terrain?.material) return 0;
  const inNear = (x, z) => x >= -GEO.ext && x <= GEO.ext && z >= -GEO.ext && z <= GEO.ext;
  let out = null, len = 0;
  const flush = () => {
    // (each road side's own strips: the builder files a call under its first vertex's chunk)
    for (const [o, mat] of [[out.near, terrain.material], [out.world, terrain.worldMaterial]]) if (o.p.length && mat) B.tris(mat, o.p, o.n, new Array(o.p.length / 3 * 2).fill(0), null, { noCast: true });
  };
  const tri = (a, b, c) => {
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
    const L = Math.hypot(nx, ny, nz) || 1, o = inNear((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3) ? out.near : out.world;
    for (const p of [a, b, c]) { o.p.push(p[0], p[1], p[2]); o.n.push(nx / L, ny / L, nz / L); }
  };
  for (const pl of plans) {
    if (pl.flat) continue;
    const { P, N, Y, S, n, w } = pl, nn = n + 1;
    for (const side of [-1, 1]) {
      out = { near: { p: [], n: [] }, world: { p: [], n: [] } };
      const off = side > 0 ? w / 2 + pl.shR : -w / 2 - pl.shL;
      const E = [], O = [], gap = [];
      for (let k = 0; k < P.length; k++) {
        const L = Math.hypot(N[k][0], N[k][1]) || 1, ux = N[k][0] / L * side, uz = N[k][1] / L * side;
        const ex = P[k][0] + N[k][0] * off, ez = P[k][1] + N[k][1] * off;
        const y = side > 0 ? (pl.shR ? S[2 * k + 1] : Y[k * nn + n]) : (pl.shL ? S[2 * k] : Y[k * nn]);
        const g = y - heightAt(ex + ux * 0.1, ez + uz * 0.1), d = Math.min(8, Math.max(0.4, g * 1.5));
        const ox = ex + ux * d, oz = ez + uz * d;
        let other = false;
        roadsAt(ex + ux * d * 0.5, ez + uz * d * 0.5, (q) => { if (q !== pl) { other = true; return true; } }, true, 0.2);
        E.push([ex, y - 0.004, ez]); O.push([ox, heightAt(ox, oz) - 0.12, oz]); gap.push(other ? 0 : g);
      }
      for (let k = 0; k + 1 < P.length; k++) {
        if (gap[k] < 0.1 && gap[k + 1] < 0.1) continue;                    // (a gap one sees: over 10 cm)
        tri(E[k], E[k + 1], O[k + 1]); tri(E[k], O[k + 1], O[k]);
        len += Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]);
      }
      flush();
    }
  }
  GEO.roadbedLog = { ...(GEO.roadbedLog || {}), banks: Math.round(len) };
  return len;
}
