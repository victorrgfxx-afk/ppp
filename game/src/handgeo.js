import { sdfMesh } from './castgeo.js';

// Your hands on the wheel (V75), sculpted as the cast is (castgeo.js): bones, joints and flesh as distances blended
// with a smooth minimum, meshed with surface nets. An adult man's hand (hand length ~19 cm, breadth ~8.8 cm; the
// fingers' bones in their usual proportions, proximal : middle : distal ~ 1 : 0.6 : 0.4) in a power grip:
//  * the palm against the rim's outer side, the bar across it obliquely (from the index's knuckle down to the heel of
//    the hand, as in any grip of a bar), the wrist below and behind;
//  * each finger bent at its three joints just as far as the rim lets it (each bone turned until it lies on the rim,
//    the flesh pressed in a millimetre and a half), so they wrap its front and their tips come round to its inner side,
//    the little finger's further than the index's; the knuckles stand out over the bent joints;
//  * the thumb along the rim's back, toward its top (the grip driving schools teach: not hooked inside the wheel);
//  * nails on the last bones, pads under them, the thenar's mass, the web of the thumb, the tendons on the back;
//  * the skin's colour from a fair adult's: redder over the knuckles and where flesh folds, the nails paler and glossy.
// Made for the right hand at 3 o'clock round a straight bar, then bent along the rim (hand.js mirrors it for the left).
// No three.js here: it runs in a worker (handworker.js), or a few milliseconds a frame where there is none.

export const GRIP = 0.3;                        // (rad above the level: the bar's point under the hand's middle)
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => scl(a, 1 / (len(a) || 1));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rot = (v, ax, a) => {                     // (Rodrigues)
  const c = Math.cos(a), s = Math.sin(a), k = dot(ax, v) * (1 - c), x = cross(ax, v);
  return [v[0] * c + x[0] * s + ax[0] * k, v[1] * c + x[1] * s + ax[1] * k, v[2] * c + x[2] * s + ax[2] * k];
};
// (the distances, with square roots: Math.hypot is several times slower)
function sdCap(px, py, pz, a, b, ra, rb) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const h = Math.max(0, Math.min(1, (qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz)));
  const dx = qx - bx * h, dy = qy - by * h, dz = qz - bz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}
function sdEll(x, y, z, r) {
  const a = x / r[0], b = y / r[1], c = z / r[2], d = a / r[0], e = b / r[1], f = c / r[2];
  const k0 = Math.sqrt(a * a + b * b + c * c), k1 = Math.sqrt(d * d + e * e + f * f);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// the shapes, each with a sphere round it (c, R: nothing of it is nearer than |p - c| - R)
function cap(a, b, ra, rb) {
  return { f: (x, y, z) => sdCap(x, y, z, a, b, ra, rb), c: lerp(a, b, 0.5), R: len(sub(b, a)) / 2 + Math.max(ra, rb) };
}
function ell(c, A, r) {
  const [u, v, w] = A, R = Math.max(r[0], r[1], r[2]);
  return { f: (x, y, z) => { const px = x - c[0], py = y - c[1], pz = z - c[2];
    return sdEll(px * u[0] + py * u[1] + pz * u[2], px * v[0] + py * v[1] + pz * v[2], px * w[0] + py * w[1] + pz * w[2], r); }, c, R };
}
// a capsule squashed k times across n (an oval section: the wrist, the forearm)
function oval(a, b, ra, rb, n, k) {
  return { f: (x, y, z) => { const t = (k - 1) * ((x - a[0]) * n[0] + (y - a[1]) * n[1] + (z - a[2]) * n[2]);
    return sdCap(x + n[0] * t, y + n[1] * t, z + n[2] * t, a, b, ra, rb) / k; }, c: lerp(a, b, 0.5), R: len(sub(b, a)) / 2 + Math.max(ra, rb) };
}
// shapes blended in turn (k: each one's blend); the ones too far to change anything are skipped
function chain(list) {
  const n = list.length, F = list.map(p => p[0].f), K = new Float64Array(list.map(p => p[1])), Rr = new Float64Array(list.map(p => p[0].R));
  const X = new Float64Array(list.map(p => p[0].c[0])), Y = new Float64Array(list.map(p => p[0].c[1])), Z = new Float64Array(list.map(p => p[0].c[2]));
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += X[i] / n; cy += Y[i] / n; cz += Z[i] / n; }
  let R = 0;
  for (let i = 0; i < n; i++) R = Math.max(R, Math.hypot(X[i] - cx, Y[i] - cy, Z[i] - cz) + Rr[i]);
  const f = (x, y, z) => {
    let d = 1e3;
    for (let i = 0; i < n; i++) {
      const dx = x - X[i], dy = y - Y[i], dz = z - Z[i], lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - Rr[i];
      if (lb >= d + K[i]) continue;
      const v = F[i](x, y, z);
      d = i === 0 || K[i] === 0 ? Math.min(d, v) : smin(d, v, K[i]);
    }
    return d;
  };
  return { f, c: [cx, cy, cz], R };
}
const far = (s, x, y, z) => { const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz) - s.R; };

// distance from the segment a-b to the bar's axis (y)
function toAxis(a, b) {
  const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz;
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, -(a[0] * dx + a[2] * dz) / l2)) : 0;
  return Math.hypot(a[0] + dx * t, a[2] + dz * t);
}
// how far a bone of length L from joint J along d bends about ax (positive: toward the bar) before it lies on the bar
function bend(J, d, ax, L, rr, lo, hi) {
  const dist = (a) => toAxis(J, add(J, rot(d, ax, a), L));
  if (dist(lo) <= rr) return lo;
  for (let a = lo + 0.02, p = lo; a <= hi; p = a, a += 0.02) {
    if (dist(a) > rr) continue;
    let x0 = p, x1 = a;
    for (let i = 0; i < 14; i++) { const m = (x0 + x1) / 2; if (dist(m) <= rr) x1 = m; else x0 = m; }
    return x1;
  }
  return hi;
}
// a nail: a thin shell 0.3 mm over the last bone's skin, cut to an oval on its back near the tip
function nail(b, ax, hl, hw) {
  const L = len(sub(b.b, b.a)), c = add(add(b.a, b.d, L * 0.62), b.dors, b.ra);
  const bone = cap(b.a, b.b, b.ra, b.rb).f, outline = ell(c, [b.d, ax, b.dors], [hl, hw, 0.0045]).f;
  const f = (x, y, z) => Math.max(Math.abs(bone(x, y, z) - 0.0003) - 0.0004, outline(x, y, z));
  return { f, c, R: Math.max(hl, hw) + 0.001, d: b.d, hl };
}

// the hand's frame round a bar of radius r along +y (x out from the wheel's middle, z toward the driver; the index up):
// D out of its back, U toward the knuckles, W toward the thumb; P(u, w, n) a point of it, the palm's middle 12.5 mm over
// the bar. Its turn and tilt are the ones that leave the wrist as a gripping wrist is (~20 degrees bent back, ~15 toward
// the little finger) with the forearm as the arms come to the wheel (driver.js: from shoulders over the seat, elbows
// down; FORE, elbow to wrist, the same within a few degrees in every car); the bar then crosses the palm diagonally,
// from the index's root to the heel of the hand, as a handle does.
const TP = 0.44, GAM = 0.62, FORE = norm([-0.022, 0.74, -0.672]);
function handFrame(r) {
  const D = [Math.cos(TP), 0, Math.sin(TP)], U = norm(add(scl([Math.sin(TP), 0, -Math.cos(TP)], Math.cos(GAM)), [0, Math.sin(GAM), 0]));
  const W = norm(cross(D, U)), h0 = r + 0.0125, P = (u, w, n) => add(add(scl(D, h0 + n), U, u), W, w);
  // the wrist's joint; the forearm from it, flat across D (its back)
  const J = P(-0.074, 0, 0.0005), Df = norm(add(D, FORE, -dot(D, FORE)));
  return { D, U, W, P, J, Df };
}
// a point of the bar's frame on the rim (the wheel's frame)
const toWheel = (R, x, y, z) => { const a = GRIP + y / R, c = Math.cos(a), s = Math.sin(a); return [(R + x) * c, (R + x) * s, z, c, s]; };
// where the right forearm meets the hand (inside the sleeve), and the forearm's direction there (elbow to wrist) the hand
// was made for, in the wheel's frame
export function gripWrist(R, tube) {
  const { J } = handFrame(tube), w = add(J, FORE, -0.035), q = add(w, FORE, 0.01);
  const a = toWheel(R, ...w), b = toWheel(R, ...q);
  return { at: a.slice(0, 3), dir: norm(sub(b.slice(0, 3), a.slice(0, 3))) };
}

// the right hand round the bar
function sculpt(r) {
  const COMP = 0.0015;                                                // (the flesh pressed in)
  const { D, U, W, P, J, Df } = handFrame(r), A3 = [U, W, D];
  const ball = (c, rr) => ({ f: (x, y, z) => { const dx = x - c[0], dy = y - c[1], dz = z - c[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz) - rr; }, c, R: rr });
  const knuckles = [], nails = [], fingers = [];
  const F = [
    // the knuckle (MCP: u, w, n), its metacarpal's base (w, n), [length, r0, r1] of the three bones, the splay (rad:
    // toward the little finger, so each bends round the bar about an axis near the bar's, the little finger's less)
    { mcp: [0.020, 0.024, 0.0], base: [0.016, -0.001], seg: [[0.040, 0.0097, 0.0089], [0.0245, 0.0087, 0.0079], [0.0165, 0.0077, 0.0066]], splay: -0.42 },
    { mcp: [0.019, 0.005, 0.0], base: [0.004, 0.0], seg: [[0.045, 0.0101, 0.0093], [0.0285, 0.0091, 0.0082], [0.0175, 0.008, 0.0069]], splay: -0.36 },
    { mcp: [0.013, -0.0135, -0.003], base: [-0.008, -0.001], seg: [[0.042, 0.0096, 0.0088], [0.0275, 0.0086, 0.0078], [0.017, 0.0076, 0.0066]], splay: -0.27 },
    { mcp: [0.005, -0.030, -0.008], base: [-0.018, -0.003], seg: [[0.033, 0.0086, 0.0079], [0.0195, 0.0077, 0.007], [0.015, 0.0068, 0.0059]], splay: -0.16 },
  ];
  // the palm: its flesh, the four metacarpals fanned from the wrist, the heel (hypothenar), the pad under the knuckles
  // (pressed round the rim), the wrist, the ulna's knob, the forearm to inside the sleeve, the tendons on the back
  const palm = [[ell(P(-0.024, -0.003, -0.002), A3, [0.046, 0.037, 0.0118]), 0]];
  for (const f of F) palm.push([cap(P(-0.052, f.base[0], f.base[1]), P(...f.mcp), 0.0082, 0.0102), 0.012]);
  palm.push([ell(P(-0.066, 0.0, 0.0), A3, [0.022, 0.0285, 0.0172]), 0.014]);
  palm.push([ell(P(-0.034, -0.026, -0.005), A3, [0.032, 0.011, 0.012]), 0.012]);
  palm.push([ell(P(0.006, -0.002, -0.0085), A3, [0.012, 0.036, 0.0075]), 0.008]);
  palm.push([ball(P(-0.066, -0.024, 0.010), 0.006), 0.006]);
  palm.push([oval(add(J, FORE, -0.045), add(J, FORE, -0.006), 0.0305, 0.0295, Df, 1.45), 0.014]);
  for (const f of F) palm.push([cap(P(-0.05, f.base[0] * 0.8, 0.0094), P(f.mcp[0] - 0.008, f.mcp[1], f.mcp[2] + 0.0096), 0.0014, 0.0016), 0.0065]);
  const palmS = chain(palm);
  // the fingers: each bone bent until it lies on the rim
  for (const f of F) {
    const J0 = P(...f.mcp), d0 = rot(U, D, f.splay), ax = norm(cross(D, d0));
    const lim = [[0.12, 1.65], [0.2, 1.9], [0.1, 1.35]];
    let J = J0, d = d0;
    const bones = [];
    f.seg.forEach(([L, ra, rb], k) => {
      d = rot(d, ax, bend(J, d, ax, L, r + Math.min(ra, rb) - COMP, ...lim[k]));
      const B = add(J, d, L);
      bones.push({ a: J, b: B, ra, rb, d, dors: norm(cross(d, ax)) });
      J = B;
    });
    const [b1, b2, b3] = bones;
    const kn = [add(J0, D, 0.0035), b1.ra + 0.0006], pip = [add(b2.a, norm(add(b1.dors, b2.dors)), 0.0024), b2.ra * 0.93];
    knuckles.push(kn, pip);
    const f1 = chain([[cap(b1.a, b1.b, b1.ra, b1.rb), 0], [ball(kn[0], kn[1]), 0.004]]);
    const pad = ell(add(add(b3.a, b3.d, 0.55 * f.seg[2][0]), b3.dors, -0.3 * b3.ra), [b3.d, ax, b3.dors], [0.0095, b3.ra * 0.95, b3.ra * 0.78]);
    const f23 = chain([[cap(b2.a, b2.b, b2.ra, b2.rb), 0], [cap(b3.a, b3.b, b3.ra, b3.rb), 0.0025], [ball(pip[0], pip[1]), 0.003], [pad, 0.003]]);
    nails.push(nail(b3, ax, 0.0058, 0.0047));
    fingers.push({ f1, f23, all: chain([[f1, 0], [f23, 0]]) });
  }
  // the thumb: its metacarpal from the wrist's thumb side to the rim's back, then along the rim toward its top
  const CMC = P(-0.05, 0.018, -0.006), th = 1.6, rt = r + 0.0108 + 0.0015, xz = [rt * Math.cos(th), 0, rt * Math.sin(th)];
  const dxz = Math.hypot(xz[0] - CMC[0], xz[2] - CMC[2]), tMCP = [xz[0], CMC[1] + Math.sqrt(Math.max(0, 0.046 * 0.046 - dxz * dxz)), xz[2]];
  const rad = norm([tMCP[0], 0, tMCP[2]]), tang = [-Math.sin(th), 0, Math.cos(th)];
  let td = norm(add(scl([0, 1, 0], Math.cos(0.6)), tang, Math.sin(0.6)));
  const tax = norm(cross(rad, td)), tb = [];
  let TJ = tMCP;
  [[0.030, 0.0112, 0.0102, -0.2, 0.5], [0.021, 0.01, 0.0086, 0.15, 0.9]].forEach(([L, ra, rb, lo, hi]) => {
    td = rot(td, tax, bend(TJ, td, tax, L, r + Math.min(ra, rb) - COMP, lo, hi));
    const B = add(TJ, td, L);
    tb.push({ a: TJ, b: B, ra, rb, d: td, dors: norm(cross(td, tax)) });
    TJ = B;
  });
  const ma = norm(sub(tMCP, CMC)), m1 = norm(cross(ma, D)), m2 = cross(m1, ma);
  const thenar = ell(add(add(lerp(CMC, tMCP, 0.4), D, -0.004), W, -0.003), [ma, m1, m2], [0.024, 0.0175, 0.0145]);
  const web = cap(lerp(CMC, tMCP, 0.85), P(0.008, 0.021, -0.001), 0.0062, 0.0062);
  const tk = [add(tMCP, tb[0].dors, 0.003), 0.0108];
  knuckles.push(tk, [add(tb[1].a, norm(add(tb[0].dors, tb[1].dors)), 0.002), 0.0094]);
  const tMeta = chain([[cap(CMC, tMCP, 0.0135, 0.0108), 0], [thenar, 0.01], [web, 0.008], [ball(tk[0], tk[1]), 0.004]]);
  const tpad = ell(add(add(tb[1].a, tb[1].d, 0.012), tb[1].dors, -0.3 * tb[1].ra), [tb[1].d, tax, tb[1].dors], [0.011, 0.0098, 0.0076]);
  const tRest = chain([[cap(tb[0].a, tb[0].b, tb[0].ra, tb[0].rb), 0], [cap(tb[1].a, tb[1].b, tb[1].ra, tb[1].rb), 0.003], [tpad, 0.003]]);
  nails.push(nail(tb[1], tax, 0.0064, 0.0056));
  // the whole: each finger blended into the palm (its web), the fingers only touching each other; the nails over
  const sdf = (x, y, z) => {
    const p0 = palmS.f(x, y, z);
    let d = p0;
    if (far(tMeta, x, y, z) < p0 + 0.012) d = smin(d, tMeta.f(x, y, z), 0.012);
    if (far(tRest, x, y, z) < d + 0.003) d = smin(d, tRest.f(x, y, z), 0.003);
    for (const f of fingers) {
      if (far(f.all, x, y, z) >= p0 + 0.009) continue;
      d = Math.min(d, smin(smin(p0, f.f1.f(x, y, z), 0.009), f.f23.f(x, y, z), 0.003));
    }
    for (const n of nails) if (far(n, x, y, z) < d + 0.0008) d = smin(d, n.f(x, y, z), 0.0008);
    return d;
  };
  return { sdf, nails, knuckles };
}

// sRGB hex -> linear, as three.js's Color.set(hex) does it
const lin1 = (c) => (c < 0.04045) ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
const lin = (h) => [lin1((h >> 16 & 255) / 255), lin1((h >> 8 & 255) / 255), lin1((h & 255) / 255)];

// the right hand round a straight bar of radius tube (the bar's frame): positions, normals, triangles, colours (linear),
// gloss (the nails); bendGrip lays it on a rim
export function* buildGrip(tube) {
  const s = sculpt(tube), sdf = s.sdf;
  const m = yield* sdfMesh(sdf, [-0.075, -0.09, -0.06, 0.09, 0.115, 0.17], 0.0019);
  // colour: the skin, redder over the knuckles, darker and redder in folds, the nails paler, their free edges whiter
  const SKIN = lin(0xc99680), KN = lin(0xb47665), FOLD = lin(0x8a4c40), NAIL = lin(0xd8a493), EDGE = lin(0xeadcd0);
  const n = m.nv, col = new Float32Array(n * 3), gloss = new Float32Array(n);
  const hash = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return v - Math.floor(v); };
  for (let v = 0; v < n; v++) {
    if (v % 3000 === 0) yield;
    const x = m.pos[3 * v], y = m.pos[3 * v + 1], z = m.pos[3 * v + 2], nx = m.nrm[3 * v], ny = m.nrm[3 * v + 1], nz = m.nrm[3 * v + 2];
    // (blotches, a few per cm, and finer)
    let c = scl(SKIN, 0.94 + 0.08 * hash(Math.floor(x * 260), Math.floor(y * 260), Math.floor(z * 260)) + 0.03 * hash(Math.floor(x * 900), Math.floor(y * 900), Math.floor(z * 900)));
    for (const [kc, kr] of s.knuckles) {
      const w = Math.max(0, Math.min(1, (kr + 0.007 - Math.hypot(x - kc[0], y - kc[1], z - kc[2])) / 0.007));
      if (w > 0) c = lerp(c, KN, w * w * 0.75);
    }
    // a fold: flesh close in front of the surface
    const e = 0.004, occ = Math.max(0, Math.min(1, sdf(x + nx * e, y + ny * e, z + nz * e) / e));
    c = lerp(c, FOLD, (1 - occ) * 0.7);
    for (const nl of s.nails) {
      if (far(nl, x, y, z) > 0.001 || nl.f(x, y, z) > 0.0004) continue;
      const along = ((x - nl.c[0]) * nl.d[0] + (y - nl.c[1]) * nl.d[1] + (z - nl.c[2]) * nl.d[2]) / nl.hl;
      const t = Math.max(0, Math.min(1, (along - 0.84) / 0.13));
      c = lerp(lerp(NAIL, SKIN, Math.max(0, -along - 0.6) * 0.8), EDGE, t * t * (3 - 2 * t));
      gloss[v] = 1;
    }
    col[3 * v] = c[0]; col[3 * v + 1] = c[1]; col[3 * v + 2] = c[2];
  }
  return { tube, pos: m.pos, nrm: m.nrm, idx: m.idx, col, gloss };
}
// the bar's hand on a rim of radius R (to its tube's middle): the bar's y round the wheel's middle, in the wheel's frame
// (the rim in its xy plane, +z toward the driver), unturned
export function bendGrip(b, R) {
  const n = b.pos.length / 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const [X, Y, Z, c, s] = toWheel(R, b.pos[3 * v], b.pos[3 * v + 1], b.pos[3 * v + 2]);
    const ax = b.nrm[3 * v], ay = b.nrm[3 * v + 1];
    pos[3 * v] = X; pos[3 * v + 1] = Y; pos[3 * v + 2] = Z;
    nrm[3 * v] = ax * c - ay * s; nrm[3 * v + 1] = ax * s + ay * c; nrm[3 * v + 2] = b.nrm[3 * v + 2];
  }
  return { pos, nrm };
}
