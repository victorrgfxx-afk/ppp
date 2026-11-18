import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// (V103) The details that make a body the real car's: lamps, grilles, intakes, badges, trims - each drawn as an outline
// traced from photos of the real car (front, side and rear views, in metres) and laid onto the lofted paint (cars.js)
// like a decal, following its curves, with a little relief where the real part stands proud of it.
//
// An outline's points are given as the photos give them: ['f', x, y] a point seen from the front (x across, to the
// car's right; y up from the ground), ['r', x, y] seen from the rear, ['s', s, y] seen from the right side (s back from
// the nose). The body is unrolled round its nose (or tail) at each height - from the middle of the nose across the
// front, round the corner, back along the side - and a point is placed by its length along that, so a headlamp that
// wraps round the wing onto the side is one piece, as the real one is, not stretched.

// ---- the body's surface: its sections at the loft's stations, straight between them, exactly as carBodyGeometry
// builds the paint
export function bodyOf(m, stations, sections) {
  const L = m.L, n = stations.length;
  const secAt = (s) => {
    s = Math.min(L, Math.max(0, s));
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (stations[mid] <= s) lo = mid; else hi = mid; }
    const t = (s - stations[lo]) / (stations[hi] - stations[lo] || 1), A = sections[lo], B = sections[hi];
    return A.map((p, i) => [p[0] + (B[i][0] - p[0]) * t, p[1] + (B[i][1] - p[1]) * t]);
  };
  // the half width of a section at height y (-1: above or below it)
  const halfW = (R, y) => {
    if (y < R[1][1] || y > R[9][1]) return -1;
    for (let i = 1; i < 9; i++) {
      const [x0, y0] = R[i], [x1, y1] = R[i + 1];
      if (y >= y0 && y <= y1) return y1 - y0 < 1e-7 ? Math.max(x0, x1) : x0 + (x1 - x0) * (y - y0) / (y1 - y0);
    }
    return -1;
  };
  const sideX = (s, y) => halfW(secAt(s), y);
  // the outline at height y seen from above, from the middle of the nose (end 'f') or of the tail ('r') across the end,
  // round the corner and back along the right side to the middle of the car: [x, s from that end, length along it]
  const cache = new Map();
  const outline = (y, end) => {
    const k = end + Math.round(y * 1e4);
    if (cache.has(k)) return cache.get(k);
    const at = (d) => sideX(end === 'f' ? d : L - d, y);
    let d0 = -1;
    for (let d = 0; d < L / 2; d += 0.004) if (at(d) >= 0) { d0 = d; break; }
    let out = null;
    if (d0 >= 0) {
      if (d0 > 0) { let a = d0 - 0.004, b = d0; for (let i = 0; i < 12; i++) { const c = (a + b) / 2; if (at(c) >= 0) b = c; else a = c; } d0 = b; }
      out = [[0, d0, 0]];
      let px = 0, pd = d0, len = 0;
      for (let d = d0; d <= L / 2 + 1e-6; d += 0.005) {
        const x = Math.max(0, at(d));
        len += Math.hypot(x - px, d - pd); out.push([x, d, len]); px = x; pd = d;
      }
    }
    cache.set(k, out);
    return out;
  };
  // a traced point -> [u (length along the unrolled outline: + to the right of the middle, - to the left), v (height)]
  const toUV = (p, end) => {
    const [kind, a, y] = p, o = outline(y, end);
    if (!o) return [a, y];
    if (kind !== 's' && a < 0) { const [u, v] = toUV([kind, -a, y], end); return [-u, v]; }
    if (kind === 's') {
      const d = end === 'f' ? a : L - a;
      for (let i = 1; i < o.length; i++) if (o[i][1] >= d) { const t = (d - o[i - 1][1]) / (o[i][1] - o[i - 1][1] || 1); return [o[i - 1][2] + (o[i][2] - o[i - 1][2]) * Math.max(0, t), y]; }
      return [o[o.length - 1][2], y];
    }
    const x = Math.abs(a);
    for (let i = 1; i < o.length; i++) if (o[i][0] >= x) { const t = (x - o[i - 1][0]) / (o[i][0] - o[i - 1][0] || 1); return [o[i - 1][2] + (o[i][2] - o[i - 1][2]) * Math.max(0, Math.min(1, t)), y]; }
    return [o[o.length - 1][2], y];
  };
  // [u, v] -> the point on the paint (right side; the car's frame: forward -z, s = z + L/2)
  const fromUV = (u, v, end) => {
    if (u < 0) { const p = fromUV(-u, v, end); return p && [-p[0], p[1], p[2]]; }
    const o = outline(v, end);
    if (!o) return null;
    let i = 1;
    while (i < o.length - 1 && o[i][2] < u) i++;
    const A = o[i - 1], B = o[i], t = Math.max(0, Math.min(1, (u - A[2]) / (B[2] - A[2] || 1)));
    const x = A[0] + (B[0] - A[0]) * t, d = A[1] + (B[1] - A[1]) * t;
    return [x, v, (end === 'f' ? d : L - d) - L / 2];
  };
  return { secAt, halfW, sideX, outline, toUV, fromUV };
}

// a polygon [[a, b]...] grown by d all round (each corner moved out along its two sides' normals)
export function grow(poly, d) {
  let ar = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; ar += x0 * y1 - x1 * y0; }
  const sg = ar > 0 ? 1 : -1, n = poly.length;
  return poly.map((p, i) => {
    const q0 = poly[(i - 1 + n) % n], q1 = poly[(i + 1) % n];
    const e0 = [p[0] - q0[0], p[1] - q0[1]], e1 = [q1[0] - p[0], q1[1] - p[1]];
    const l0 = Math.hypot(...e0) || 1, l1 = Math.hypot(...e1) || 1;
    const n0 = [e0[1] / l0 * sg, -e0[0] / l0 * sg], n1 = [e1[1] / l1 * sg, -e1[0] / l1 * sg];
    const m = [n0[0] + n1[0], n0[1] + n1[1]], lm = Math.hypot(...m) || 1, c = Math.max(0.4, (m[0] * n1[0] + m[1] * n1[1]) / lm);
    return [p[0] + m[0] / lm * d / c, p[1] + m[1] / lm * d / c];
  });
}

// ---- 2D meshes in the unrolled (u, v) plane
// a simple polygon [[u, v]...] cut on an h-grid, each cell clipped to it: small triangles, so the decal bends with the
// body (S-H clipping against each cell, which is convex; earcut for what is left in it)
export function tessellate(poly, h = 0.02) {
  const P = [], T = [], ids = new Map();
  const vid = (u, v) => { const k = Math.round(u * 1e5) + ',' + Math.round(v * 1e5); let i = ids.get(k); if (i === undefined) { i = P.push([u, v]) - 1; ids.set(k, i); } return i; };
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [u, v] of poly) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const nu = Math.max(1, Math.ceil((u1 - u0) / h - 1e-6)), nv = Math.max(1, Math.ceil((v1 - v0) / h - 1e-6));
  const hu = (u1 - u0) / nu, hv = (v1 - v0) / nv;
  const clip = (pts, ax, val, keepAbove) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length];
      const ina = keepAbove ? A[ax] >= val : A[ax] <= val, inb = keepAbove ? B[ax] >= val : B[ax] <= val;
      if (ina) out.push(A);
      if (ina !== inb) { const t = (val - A[ax]) / (B[ax] - A[ax]); out.push(ax === 0 ? [val, A[1] + (B[1] - A[1]) * t] : [A[0] + (B[0] - A[0]) * t, val]); }
    }
    return out;
  };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = u0 + i * hu, b = i === nu - 1 ? u1 : a + hu, c = v0 + j * hv, d = j === nv - 1 ? v1 : c + hv;
    let q = clip(poly, 0, a, true); if (q.length < 3) continue;
    q = clip(q, 0, b, false); if (q.length < 3) continue;
    q = clip(q, 1, c, true); if (q.length < 3) continue;
    q = clip(q, 1, d, false); if (q.length < 3) continue;
    const r = [];
    for (const p of q) { const l = r[r.length - 1]; if (!l || Math.abs(l[0] - p[0]) > 1e-7 || Math.abs(l[1] - p[1]) > 1e-7) r.push(p); }
    if (r.length > 1 && Math.abs(r[0][0] - r[r.length - 1][0]) < 1e-7 && Math.abs(r[0][1] - r[r.length - 1][1]) < 1e-7) r.pop();
    if (r.length < 3) continue;
    let area = 0;
    for (let k = 0; k < r.length; k++) { const A = r[k], B = r[(k + 1) % r.length]; area += A[0] * B[1] - B[0] * A[1]; }
    if (Math.abs(area) < 1e-10) continue;
    const tris = THREE.ShapeUtils.triangulateShape(r.map(p => new THREE.Vector2(p[0], p[1])), []);
    const id = r.map(p => vid(p[0], p[1]));
    for (const t of tris) T.push([id[t[0]], id[t[1]], id[t[2]]]);
  }
  return { P, T };
}
// a ring (r0 inside, r1 outside) or, r0 = 0, a disc, round (cu, cv)
export function ringUV(cu, cv, r0, r1, n = 32, sx = 1) {
  const P = [], T = [], rows = Math.max(1, Math.ceil((r1 - r0) / 0.02));
  if (r0 <= 0) P.push([cu, cv]);
  const first = r0 <= 0 ? 1 : 0;
  for (let j = first; j <= rows; j++) {
    const r = r0 + (r1 - r0) * j / rows;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; P.push([cu + Math.cos(a) * r * sx, cv + Math.sin(a) * r]); }
  }
  const at = (j, i) => (r0 <= 0 ? 1 + (j - 1) * n : j * n) + (i % n);
  if (r0 <= 0) for (let i = 0; i < n; i++) T.push([0, at(1, i), at(1, i + 1)]);
  for (let j = Math.max(first, 0) + (r0 <= 0 ? 1 : 0); j <= rows; j++) {
    if (r0 > 0 && j === 0) continue;
    for (let i = 0; i < n; i++) T.push([at(j - 1, i), at(j, i), at(j, i + 1)], [at(j - 1, i), at(j, i + 1), at(j - 1, i + 1)]);
  }
  return { P, T };
}
// shapes for outlines, in the photos' coordinates (a kind 'f' / 'r' / 's' and two numbers)
export const ellipse = (k, cx, cy, rx, ry, n = 28, a0 = 0, a1 = Math.PI * 2) => { const o = []; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([k, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
export const rrect = (k, cx, cy, w, h, r, n = 5) => {
  const o = [], c = [[cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2], [cx - w / 2 + r, cy - h / 2 + r, Math.PI], [cx + w / 2 - r, cy - h / 2 + r, Math.PI * 1.5]];
  for (const [x, y, a0] of c) for (let i = 0; i <= n; i++) { const a = a0 + Math.PI / 2 * i / n; o.push([k, x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return o;
};
// a smooth closed outline through a few traced points (Catmull-Rom), each point [kind, a, y]
export function smoothPoly(pts, per = 4) {
  const o = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      o.push([p1[0], f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  return o;
}

// ---- a 2D mesh laid on the paint: its vertices unrolled back onto the body at end 'f' / 'r' (or 's': u is s along the
// right side), moved out off the paint (m), with relief (m: the part's edge as a wall down to the paint); the left
// side's copy mirrored. Returns a BufferGeometry (non-indexed, normals, uv in units of 5 cm)
export function laidGeo(body, mesh, end, { off = 0.003, depth = 0, mirror = false, L } = {}) {
  const { P, T } = mesh, n = P.length;
  const V = P.map(([u, v]) => end === 's' ? (() => { const x = body.sideX(u, v); return x < 0 ? null : [x, v, u - L / 2]; })() : body.fromUV(u, v, end));
  // the normals of the laid mesh (outwards: away from the car's long axis)
  const N = Array.from({ length: n }, () => [0, 0, 0]);
  const tris = [];
  for (const t of T) {
    const [a, b, c] = t.map(i => V[i]);
    if (!a || !b || !c) continue;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const cz = (a[2] + b[2] + c[2]) / 3, hz = Math.max(-L / 2 + 0.9, Math.min(L / 2 - 0.9, cz));
    const ox = (a[0] + b[0] + c[0]) / 3, oy = (a[1] + b[1] + c[1]) / 3 - 0.55, oz = cz - hz;
    const flip = nx * ox + ny * oy + nz * oz < 0;
    const tri = flip ? [t[0], t[2], t[1]] : [t[0], t[1], t[2]];
    const s = flip ? -1 : 1;
    for (const i of t) { N[i][0] += nx * s; N[i][1] += ny * s; N[i][2] += nz * s; }
    tris.push(tri);
  }
  for (const v of N) { const l = Math.hypot(...v) || 1; v[0] /= l; v[1] /= l; v[2] /= l; }
  const top = V.map((p, i) => p && [p[0] + N[i][0] * (off + depth), p[1] + N[i][1] * (off + depth), p[2] + N[i][2] * (off + depth)]);
  const pos = [], uv = [];
  const push = (p, i) => { pos.push(p[0], p[1], p[2]); uv.push(P[i][0] / 0.05, P[i][1] / 0.05); };
  for (const t of tris) for (const i of t) push(top[i], i);
  if (depth > 0) {
    // the edge: every side used by one triangle only, a wall from the top down to the paint
    const base = V.map((p, i) => p && [p[0] + N[i][0] * off * 0.5, p[1] + N[i][1] * off * 0.5, p[2] + N[i][2] * off * 0.5]);
    const count = new Map();
    for (const t of tris) for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a; count.set(k, (count.get(k) ?? 0) + 1); }
    for (const t of tris) for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a;
      if (count.get(k) !== 1) continue;
      push(top[a], a); push(base[a], a); push(top[b], b);
      push(top[b], b); push(base[a], a); push(base[b], b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  if (!mirror) return g;
  const m = g.clone(), p = m.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  const a = p.array;
  for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  const u = m.attributes.uv.array;
  for (let i = 0; i < u.length; i += 6) for (let k = 0; k < 2; k++) { const t = u[i + 2 + k]; u[i + 2 + k] = u[i + 4 + k]; u[i + 4 + k] = t; }
  m.computeVertexNormals();
  return mergeGeometries([g, m]);
}

// a part of a model (MODELS[k].parts): { at: 'f' | 'r' | 's', mat, poly | ring: [kind, a, y, r0, r1] | disc: [kind, a,
// y, r] | line: [[kind, a, y]...] with w, off, depth, mirror, h (the grid) } -> its geometry
export function partGeo(body, part, L) {
  const end = part.at ?? 'f';
  let mesh;
  const uvOf = (p) => end === 's' ? [p[1], p[2]] : body.toUV(p, end);
  if (part.poly) { const uv = (part.smooth ? smoothPoly(part.poly, part.smooth) : part.poly).map(uvOf); mesh = tessellate(part.grow ? grow(uv, part.grow) : uv, part.h ?? 0.02); }
  else if (part.ring || part.disc) {
    const [k, a, y, r0, r1] = part.ring ?? [...part.disc.slice(0, 3), 0, part.disc[3]];
    const [cu, cv] = uvOf([k, a, y]);
    const g = part.grow ?? 0;                 // (a black rim under it: a ring grown both ways, a disc outwards)
    mesh = ringUV(cu, cv, r0 > 0 ? Math.max(0.001, r0 - g) : 0, r1 + g, part.n ?? 32, part.sx ?? 1);
  } else if (part.line) {
    // a stroke along a polyline, w wide (seams, strips, chrome lines)
    const pts = part.line.map(uvOf), w = part.w ?? 0.006, left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      left.push([pts[i][0] - dy / l * w / 2, pts[i][1] + dx / l * w / 2]); right.push([pts[i][0] + dy / l * w / 2, pts[i][1] - dx / l * w / 2]);
    }
    const P = [], T = [];
    for (let i = 0; i < pts.length; i++) P.push(left[i], right[i]);
    for (let i = 0; i < pts.length - 1; i++) T.push([2 * i, 2 * i + 1, 2 * i + 2], [2 * i + 1, 2 * i + 3, 2 * i + 2]);
    // (long strokes: more points along them, so they bend with the paint)
    mesh = subdivideStrip({ P, T }, part.h ?? 0.03);
  }
  return laidGeo(body, mesh, end, { off: part.off ?? 0.003, depth: part.depth ?? 0, mirror: part.mirror ?? false, L });
}
function subdivideStrip(mesh, h) {
  const { P } = mesh, n = P.length / 2, Q = [], T = [];
  for (let i = 0; i < n - 1; i++) {
    const a = P[2 * i], b = P[2 * i + 1], c = P[2 * i + 2], d = P[2 * i + 3];
    const k = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / h));
    for (let j = 0; j < k; j++) {
      const t0 = j / k, t1 = (j + 1) / k, L = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      const o = Q.length;
      Q.push(L(a, c, t0), L(b, d, t0), L(a, c, t1), L(b, d, t1));
      T.push([o, o + 1, o + 2], [o + 1, o + 3, o + 2]);
    }
  }
  return { P: Q, T };
}

// ---- wheels: a 3D rim (cars.js turns the tyre round it): the disc faces +z, coloured per part (vertex colours)
// style: { kind: 'spokes' | 'twin' | 'multi' | 'cover' | 'steel', n, w (spoke width, m), col, dark (the gaps behind),
// cap, dish (m) }
export function rimGeo(R, st) {
  const parts = [];
  const pose = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const put = (g, hex, m) => {
    g = g.index ? g.toNonIndexed() : g; if (m) g.applyMatrix4(m);
    if (g.attributes.uv) g.deleteAttribute('uv');
    const c = new THREE.Color(hex), n = g.attributes.position.count, C = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) C.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(C, 3)); parts.push(g);
  };
  const col = st.col ?? 0xc3c6ca, dark = st.dark ?? 0x2a2b2e, dish = st.dish ?? 0.03;
  // the lip and the barrel, the brake disc behind
  put(new THREE.RingGeometry(R - 0.018, R, 48), col, pose(0, 0, 0.004));
  put(new THREE.CylinderGeometry(R - 0.016, R - 0.016, 0.16, 40, 1, true), 0x6c6f74, pose(0, 0, -0.08, Math.PI / 2, 0, 0));
  put(new THREE.CircleGeometry(R - 0.016, 40), dark, pose(0, 0, -0.1));
  put(new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.012, 32), 0x55585c, pose(0, 0, -0.07, Math.PI / 2, 0, 0));
  const hubR = st.hub ?? 0.075;
  if (st.kind === 'cover' || st.kind === 'steel') {
    // a steel wheel: its pressed disc with the vent holes; (cover) a plastic trim over it, slots in a ring
    const n = st.n ?? 8, disc = new THREE.CircleGeometry(R - 0.017, 48);
    put(disc, st.kind === 'cover' ? col : 0x2b2c2e, pose(0, 0, -0.012));
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, rr = R * (st.kind === 'cover' ? 0.68 : 0.62);
      const slot = st.kind === 'cover' ? new THREE.PlaneGeometry(st.w ?? 0.05, R * 0.3) : new THREE.CircleGeometry(R * 0.11, 16);
      put(slot, dark, pose(Math.cos(a) * rr, Math.sin(a) * rr, -0.0105, 0, 0, a - Math.PI / 2));
    }
    put(new THREE.CylinderGeometry(R * 0.3, R * 0.34, 0.025, 32), st.kind === 'cover' ? col : 0x3a3b3d, pose(0, 0, 0.0, Math.PI / 2, 0, 0));
    put(new THREE.CircleGeometry(R * 0.12, 24), st.cap ?? 0x9a9da2, pose(0, 0, 0.0135));
  } else {
    // alloys: spokes from the hub to the rim, dished (the outer ends forward); twin = in pairs; multi = thin, many
    const n = st.n ?? 5, w = st.w ?? 0.05, r0 = hubR, r1 = R - 0.012, len = r1 - r0;
    const pairs = st.kind === 'twin' ? [-(st.gap ?? 0.13), st.gap ?? 0.13] : [0];
    for (let k = 0; k < n; k++) for (const o of pairs) {
      const a = k / n * Math.PI * 2 + o * (st.kind === 'twin' ? 0.5 : 1);
      const m = new THREE.Matrix4().makeRotationZ(a - Math.PI / 2).multiply(pose(0, r0 + len / 2, -0.012 - dish / 2, Math.atan2(dish, len), 0, 0));
      const sp = new THREE.CylinderGeometry(w * 0.5, w * 0.62, Math.hypot(len, dish), 6, 1);
      sp.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 0.55));
      put(sp, col, m);
    }
    put(new THREE.CylinderGeometry(hubR + 0.01, hubR + 0.018, 0.04, 32), col, pose(0, 0, -0.03, Math.PI / 2, 0, 0));
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; put(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8), 0x8d9095, pose(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.006, Math.PI / 2, 0, 0)); }
    put(new THREE.CircleGeometry(0.03, 24), st.cap ?? 0x25272b, pose(0, 0, -0.005));
  }
  return mergeGeometries(parts);
}
