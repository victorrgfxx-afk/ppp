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
// a tube with flat ends and rounded edges (rr), its radius ra at a to rb at b, its section squashed k times across n (the
// glove's cuff: not a capsule, whose round end would stand out as a ball)
function tube(a, b, ra, rb, n, k, rr) {
  const L = len(sub(b, a)), ax = norm(sub(b, a)), c = lerp(a, b, 0.5);
  return { f: (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2], t = px * ax[0] + py * ax[1] + pz * ax[2];
    let qx = px - ax[0] * t, qy = py - ax[1] * t, qz = pz - ax[2] * t;
    const s = (k - 1) * (qx * n[0] + qy * n[1] + qz * n[2]);
    qx += n[0] * s; qy += n[1] * s; qz += n[2] * s;
    const r = ra + (rb - ra) * Math.max(0, Math.min(1, t / L + 0.5));
    const dr = (Math.sqrt(qx * qx + qy * qy + qz * qz) - r) / k + rr, da = Math.abs(t) - L / 2 + rr;
    return Math.min(Math.max(dr, da), 0) + Math.hypot(Math.max(dr, 0), Math.max(da, 0)) - rr;
  }, c, R: L / 2 + Math.max(ra, rb), ax, L };
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
// A pose (optional: a pistol's grip, weapon.js) changes the hold: gam (the hand's tilt up the bar: smaller, the fingers
// more square round it, as round a pistol's grip), fore (the forearm's direction), the index finger's bends at its three
// joints and its extra splay ({ bend: [a1, a2, a3], splay }: off the bar, onto a trigger) and the thumb's metacarpal's
// end and its direction from there in the bar's frame, its two joints' bends and the side they bend toward
// ({ mcp, dir, bend: [b1, b2], in }).
const TP = 0.44, GAM = 0.62, FORE = norm([-0.022, 0.74, -0.672]);
function handFrame(r, pose) {
  const gam = pose?.gam ?? GAM, fore = pose?.fore ? norm(pose.fore) : FORE;
  const D = [Math.cos(TP), 0, Math.sin(TP)], U = norm(add(scl([Math.sin(TP), 0, -Math.cos(TP)], Math.cos(gam)), [0, Math.sin(gam), 0]));
  const W = norm(cross(D, U)), h0 = r + 0.0125, P = (u, w, n) => add(add(scl(D, h0 + n), U, u), W, w);
  // the wrist's joint; the forearm from it, flat across D (its back)
  const J = P(-0.074, 0, 0.0005), Df = norm(add(D, fore, -dot(D, fore)));
  return { D, U, W, P, J, Df, fore };
}
// a point of the bar's frame on the rim (the wheel's frame)
const toWheel = (R, x, y, z) => { const a = GRIP + y / R, c = Math.cos(a), s = Math.sin(a); return [(R + x) * c, (R + x) * s, z, c, s]; };
// where the right forearm meets the hand (inside the sleeve), the forearm's direction there (elbow to wrist) the hand
// was made for, and the back of the wrist (its oval's flat side), in the wheel's frame
export function gripWrist(R, tube) {
  const { J, Df } = handFrame(tube), w = add(J, FORE, -0.035), q = add(w, FORE, 0.01);
  const a = toWheel(R, ...w), b = toWheel(R, ...q), c = a[3], s = a[4];
  return { at: a.slice(0, 3), dir: norm(sub(b.slice(0, 3), a.slice(0, 3))), back: [Df[0] * c - Df[1] * s, Df[0] * s + Df[1] * c, Df[2]] };
}

// a glove's cuff (sculpt's) on a straight bar: the wrist's joint, the forearm's direction, the cuff's back and the
// little finger's side across it (weapon.js hangs the D-ring on it)
export function gloveCuff(tube, pose) {
  const { J, fore, Df } = handFrame(tube, pose);
  return { J, fore, back: Df, little: norm(cross(fore, Df)) };
}
// the same on a straight bar (its own frame: the bar along +y, x out of the back of the hand's side, z toward the
// thumb's): a pistol's grip (glock.js)
export function gripWristBar(tube, pose) {
  const { J, Df, fore } = handFrame(tube, pose);
  return { at: add(J, fore, -0.035), dir: fore, back: Df };
}

// the knuckle (MCP: u, w, n), its metacarpal's base (w, n), [length, r0, r1] of the three bones, the splay (rad: toward
// the little finger, so each bends round the bar about an axis near the bar's, the little finger's less)
const F = [
  { mcp: [0.020, 0.024, 0.0], base: [0.016, -0.001], seg: [[0.040, 0.0097, 0.0089], [0.0245, 0.0087, 0.0079], [0.0165, 0.0077, 0.0066]], splay: -0.42 },
  { mcp: [0.019, 0.005, 0.0], base: [0.004, 0.0], seg: [[0.045, 0.0101, 0.0093], [0.0285, 0.0091, 0.0082], [0.0175, 0.008, 0.0069]], splay: -0.36 },
  { mcp: [0.013, -0.0135, -0.003], base: [-0.008, -0.001], seg: [[0.042, 0.0096, 0.0088], [0.0275, 0.0086, 0.0078], [0.017, 0.0076, 0.0066]], splay: -0.27 },
  { mcp: [0.005, -0.030, -0.008], base: [-0.018, -0.003], seg: [[0.033, 0.0086, 0.0079], [0.0195, 0.0077, 0.007], [0.015, 0.0068, 0.0059]], splay: -0.16 },
];
const COMP = 0.0015;                                                  // (the flesh pressed in)
// the hand's bones round the bar: each finger's three (each bent until it lies on the bar, or as the pose says), the
// thumb's metacarpal and two
function skeleton(r, pose) {
  const fr = handFrame(r, pose), { D, U, P } = fr;
  const fingers = F.map((f, fi) => {
    const own = fi === 0 && pose?.index;
    const J0 = P(...f.mcp), d0 = rot(U, D, f.splay + (own ? pose.index.splay ?? 0 : 0)), ax = norm(cross(D, d0));
    const lim = [[0.12, 1.65], [0.2, 1.9], [0.1, 1.35]];
    let J = J0, d = d0;
    const bones = f.seg.map(([L, ra, rb], k) => {
      d = rot(d, ax, own ? pose.index.bend[k] : bend(J, d, ax, L, r + Math.min(ra, rb) - COMP, ...lim[k]));
      const B = add(J, d, L), b = { a: J, b: B, ra, rb, d, dors: norm(cross(d, ax)) };
      J = B;
      return b;
    });
    return { J0, ax, bones };
  });
  // the thumb: its metacarpal from the wrist's thumb side to the rim's back, then along the rim toward its top (or where
  // the pose puts it)
  const CMC = P(-0.05, 0.018, -0.006), tp = pose?.thumb;
  let tMCP, td, tax;
  if (tp) {
    // (its joints bend toward \`in\`: the bar's axis unless the pose says; the nail on the other side)
    tMCP = tp.mcp; td = norm(tp.dir);
    tax = norm(cross(td, tp.in ? norm(tp.in) : norm([-tMCP[0], 0, -tMCP[2]])));
  } else {
    const th = 1.6, rt = r + 0.0108 + 0.0015, xz = [rt * Math.cos(th), 0, rt * Math.sin(th)];
    const dxz = Math.hypot(xz[0] - CMC[0], xz[2] - CMC[2]);
    tMCP = [xz[0], CMC[1] + Math.sqrt(Math.max(0, 0.046 * 0.046 - dxz * dxz)), xz[2]];
    const rad = norm([tMCP[0], 0, tMCP[2]]), tang = [-Math.sin(th), 0, Math.cos(th)];
    td = norm(add(scl([0, 1, 0], Math.cos(0.6)), tang, Math.sin(0.6)));
    tax = norm(cross(rad, td));
  }
  const tb = [];
  let TJ = tMCP;
  [[0.030, 0.0112, 0.0102, -0.2, 0.5], [0.021, 0.01, 0.0086, 0.15, 0.9]].forEach(([L, ra, rb, lo, hi], k) => {
    td = rot(td, tax, tp ? tp.bend[k] : bend(TJ, td, tax, L, r + Math.min(ra, rb) - COMP, lo, hi));
    const B = add(TJ, td, L);
    tb.push({ a: TJ, b: B, ra, rb, d: td, dors: norm(cross(td, tax)) });
    TJ = B;
  });
  return { ...fr, fingers, CMC, tMCP, tax, tb };
}
// the joints, for fitting a pose (weapon.js's tuning): the bar's frame
export function handSkeleton(r, pose) {
  const s = skeleton(r, pose);
  return { J: s.J, D: s.D, U: s.U, W: s.W, palm: s.P(0, 0, 0), web: s.P(0.008, 0.021, -0.001), fingers: s.fingers.map(f => [f.J0, ...f.bones.map(b => b.b)]), thumb: [s.CMC, s.tMCP, ...s.tb.map(b => b.b)],
    pads: s.fingers.map(f => { const b3 = f.bones[2], L = len(sub(b3.b, b3.a)); return add(add(b3.a, b3.d, 0.55 * L), b3.dors, -b3.ra); }) };
}

// the right hand round the bar; in a glove if the pose says (the pistol's hands, weapon.js)
const GT = 0.0017;                                                    // (the glove's suede over the flesh, lined)
function sculpt(r, pose) {
  const sk = skeleton(r, pose), { D, U, W, P, J, Df, fore } = sk, A3 = [U, W, D], glove = !!pose?.glove;
  const ball = (c, rr) => ({ f: (x, y, z) => { const dx = x - c[0], dy = y - c[1], dz = z - c[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz) - rr; }, c, R: rr });
  const knuckles = [], nails = [], fingers = [];
  // the palm: its flesh, the four metacarpals fanned from the wrist, the heel (hypothenar), the pad under the knuckles
  // (pressed round the rim), the wrist, the ulna's knob, the forearm to inside the sleeve, the tendons on the back
  const palm = [[ell(P(-0.024, -0.003, -0.002), A3, [0.046, 0.037, 0.0118]), 0]];
  for (const f of F) palm.push([cap(P(-0.052, f.base[0], f.base[1]), P(...f.mcp), 0.0082, 0.0102), 0.012]);
  palm.push([ell(P(-0.066, 0.0, 0.0), A3, [0.022, 0.0285, 0.0172]), 0.014]);
  palm.push([ell(P(-0.034, -0.026, -0.005), A3, [0.032, 0.011, 0.012]), 0.012]);
  palm.push([ell(P(0.006, -0.002, -0.0085), A3, [0.012, 0.036, 0.0075]), 0.008]);
  palm.push([ball(P(-0.066, -0.024, 0.010), 0.006), 0.006]);
  palm.push([oval(add(J, fore, -0.045), add(J, fore, -0.006), 0.0305, 0.0295, Df, 1.45), 0.014]);
  for (const f of F) palm.push([cap(P(-0.05, f.base[0] * 0.8, 0.0094), P(f.mcp[0] - 0.008, f.mcp[1], f.mcp[2] + 0.0096), 0.0014, 0.0016), 0.0065]);
  const palmS = chain(palm);
  // the fingers: each bone bent until it lies on the rim
  F.forEach((f, fi) => {
    const { J0, ax, bones } = sk.fingers[fi];
    const [b1, b2, b3] = bones;
    const kn = [add(J0, D, 0.0035), b1.ra + 0.0006], pip = [add(b2.a, norm(add(b1.dors, b2.dors)), 0.0024), b2.ra * 0.93];
    knuckles.push(kn, pip);
    const f1 = chain([[cap(b1.a, b1.b, b1.ra, b1.rb), 0], [ball(kn[0], kn[1]), 0.004]]);
    const pad = ell(add(add(b3.a, b3.d, 0.55 * f.seg[2][0]), b3.dors, -0.3 * b3.ra), [b3.d, ax, b3.dors], [0.0095, b3.ra * 0.95, b3.ra * 0.78]);
    const f23 = chain([[cap(b2.a, b2.b, b2.ra, b2.rb), 0], [cap(b3.a, b3.b, b3.ra, b3.rb), 0.0025], [ball(pip[0], pip[1]), 0.003], [pad, 0.003]]);
    if (!glove) nails.push(nail(b3, ax, 0.0058, 0.0047));
    fingers.push({ f1, f23, all: chain([[f1, 0], [f23, 0]]) });
  });
  // the thumb (skeleton)
  const { CMC, tMCP, tax, tb } = sk;
  const ma = norm(sub(tMCP, CMC)), m1 = norm(cross(ma, D)), m2 = cross(m1, ma);
  const thenar = ell(add(add(lerp(CMC, tMCP, 0.4), D, -0.004), W, -0.003), [ma, m1, m2], [0.024, 0.0175, 0.0145]);
  const web = cap(lerp(CMC, tMCP, 0.85), P(0.008, 0.021, -0.001), 0.0062, 0.0062);
  const tk = [add(tMCP, tb[0].dors, 0.003), 0.0108];
  knuckles.push(tk, [add(tb[1].a, norm(add(tb[0].dors, tb[1].dors)), 0.002), 0.0094]);
  const tMeta = chain([[cap(CMC, tMCP, 0.0135, 0.0108), 0], [thenar, 0.01], [web, 0.008], [ball(tk[0], tk[1]), 0.004]]);
  const tpad = ell(add(add(tb[1].a, tb[1].d, 0.012), tb[1].dors, -0.3 * tb[1].ra), [tb[1].d, tax, tb[1].dors], [0.011, 0.0098, 0.0076]);
  const tRest = chain([[cap(tb[0].a, tb[0].b, tb[0].ra, tb[0].rb), 0], [cap(tb[1].a, tb[1].b, tb[1].ra, tb[1].rb), 0.003], [tpad, 0.003]]);
  if (!glove) nails.push(nail(tb[1], tax, 0.0064, 0.0056));
  // the glove, as the tactical gloves of the user's clip: black synthetic suede over the whole hand; moulded rubber pads
  // on the backs of the fingers' first and second bones, a rubber band over the four knuckles; a padded cuff round the
  // wrist, a tube along the forearm with a flat end (the forearm comes out of it), a little wider toward its end, with
  // a hook-and-loop strap round its back
  let gl = null;
  if (glove) {
    const pads = [];
    for (const f of sk.fingers) for (const k of [0, 1]) {
      const b = f.bones[k], L = len(sub(b.b, b.a)), rm = (b.ra + b.rb) / 2;
      pads.push(ell(add(lerp(b.a, b.b, 0.52), b.dors, rm - 0.0008), [b.d, f.ax, b.dors], [0.38 * L + 0.002, 0.8 * rm, 0.0052]));
    }
    // (the band ~2 mm proud of the suede over the knuckles' tops: their balls' centres plus ~1.2 cm out)
    const kc = [0, 1, 2, 3].map(i => add(knuckles[2 * i][0], D, 0.0045));
    const band = chain([0, 1, 2].map(i => [cap(kc[i], kc[i + 1], 0.0096, 0.0096), 0.004]));
    // (the cuff: from the hand's heel to ~5 cm past the wrist's joint, as the clip's)
    const c0 = add(J, fore, 0.009), c1 = add(J, fore, -0.05);
    const cuff = tube(c0, c1, 0.0335, 0.0358, Df, 1.3, 0.0035);
    // (the strap: a flap 2.6 mm prouder than the cuff, 2.9 cm wide round its back and sides, ~3 cm from the wrist's joint)
    const sc = add(J, fore, -0.03), big = tube(c0, c1, 0.0361, 0.0384, Df, 1.3, 0.0012);
    const strap = { f: (x, y, z) => {
      const px = x - sc[0], py = y - sc[1], pz = z - sc[2], t = -(px * fore[0] + py * fore[1] + pz * fore[2]);
      const back = px * Df[0] + py * Df[1] + pz * Df[2];                     // (Df is across fore: the axis has none of it)
      return Math.max(big.f(x, y, z), Math.abs(t) - 0.0145, -back - 0.012);
    }, c: sc, R: 0.045 };
    gl = { pads, band, cuff, strap, sc };
  }
  // the whole: each finger blended into the palm (its web), the fingers only touching each other; the nails over (in a
  // glove: the suede over it all, then its pads, band and cuff)
  const hand = (x, y, z) => {
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
  const sdf = !gl ? hand : (x, y, z) => {
    let g = hand(x, y, z) - GT;
    for (const p of gl.pads) if (far(p, x, y, z) < g + 0.0011) g = smin(g, p.f(x, y, z), 0.0011);
    if (far(gl.band, x, y, z) < g + 0.002) g = smin(g, gl.band.f(x, y, z), 0.002);
    if (far(gl.cuff, x, y, z) < g + 0.007) g = smin(g, gl.cuff.f(x, y, z), 0.007);
    if (far(gl.strap, x, y, z) < g) g = Math.min(g, gl.strap.f(x, y, z));
    return g;
  };
  return { sdf, hand, nails, knuckles, gl, sk };
}

// sRGB hex -> linear, as three.js's Color.set(hex) does it
const lin1 = (c) => (c < 0.04045) ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
const lin = (h) => [lin1((h >> 16 & 255) / 255), lin1((h >> 8 & 255) / 255), lin1((h & 255) / 255)];

// the right hand round a straight bar of radius tube (the bar's frame): positions, normals, triangles, colours (linear),
// gloss (the nails); bendGrip lays it on a rim
export function* buildGrip(tube, pose) {
  const s = sculpt(tube, pose), sdf = s.sdf;
  // (the box it is meshed in: the wheel's, grown to hold a pose's fingers)
  const box = [-0.075, -0.09, -0.06, 0.09, 0.115, 0.17];
  if (pose) {
    const k = handSkeleton(tube, pose);
    for (const p of [...k.fingers.flat(), ...k.thumb]) for (let i = 0; i < 3; i++) { box[i] = Math.min(box[i], p[i] - 0.016); box[i + 3] = Math.max(box[i + 3], p[i] + 0.016); }
  }
  if (s.gl) { const { c, R } = s.gl.cuff; for (let i = 0; i < 3; i++) { box[i] = Math.min(box[i], c[i] - R - 0.004); box[i + 3] = Math.max(box[i + 3], c[i] + R + 0.004); } }
  const m = yield* sdfMesh(sdf, box, 0.0019);
  if (s.gl) return yield* gloveParts(s, m, tube);
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
// a glove's vertices (gloveMaterial, hand.js, shades them): col, the weights of its parts - the rubber pads, the knit
// (the thumb, the fingers' sides), the strap; glove: the fold (how open the surface is), a seam (where a pad, the band
// or the cuff is sewn on, the cuff's hem, the back's panels, the thumb's knit), the knit's rib coordinate (or round the
// strap, for its stitches' dashes), the knuckle band's weight; glove2: the side's mesh panel's weight and two
// coordinates across the hand's back for its weave; gloss: the strap's stitching line
function* gloveParts(s, m, tube) {
  const { gl, sk, sdf, hand } = s, n = m.nv, col = new Float32Array(n * 3), glv = new Float32Array(n * 4), gloss = new Float32Array(n), glv2 = new Float32Array(n * 4);
  const { U, W, D, P } = sk, dA = norm(add(U, W)), dB = norm(sub(U, W));
  // (the back's seam: from between the index's and the middle finger's knuckles down to the wrist's middle, across the
  // back (u toward the knuckles, w toward the thumb); the mesh panel: the back's little-finger side, from below its
  // knuckle to the cuff)
  const o = P(0, 0, 0), seam2 = (u, w) => { const ax0 = 0.006, aw0 = 0.014, bu = -0.062 - ax0, bw = 0.004 - aw0, t = Math.max(0, Math.min(1, ((u - ax0) * bu + (w - aw0) * bw) / (bu * bu + bw * bw))); return Math.hypot(u - ax0 - bu * t, w - aw0 - bw * t); };
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const seg = (p, a, b) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab))); return len(sub(p, add(a, ab, t))); };
  const { fore } = sk, ax = scl(fore, -1), cm = gl.cuff.c, L = gl.cuff.L, Df = norm(cross(cross(fore, sk.D), fore));
  for (let v = 0; v < n; v++) {
    if (v % 2000 === 0) yield;
    const p = [m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]], nn = [m.nrm[3 * v], m.nrm[3 * v + 1], m.nrm[3 * v + 2]];
    const [x, y, z] = p, shell = hand(x, y, z) - GT;
    let dp = 1;
    for (const q of gl.pads) if (far(q, x, y, z) < 0.004) dp = Math.min(dp, q.f(x, y, z));
    const db = far(gl.band, x, y, z) < 0.005 ? gl.band.f(x, y, z) : 1, dc = gl.cuff.f(x, y, z), ds = gl.strap.f(x, y, z);
    // (each part where its own surface is the glove's, to a fraction of a millimetre)
    const wStrap = 1 - ss(0.0002, 0.0007, ds);
    const wCuff = (1 - ss(0.0006, 0.0018, dc)) * (1 - wStrap);
    const wPad = (1 - ss(0.0004, 0.0012, dp)) * (1 - wCuff) * (1 - wStrap);
    const wBand = (1 - ss(0.0005, 0.0014, db)) * (1 - wPad) * (1 - wCuff) * (1 - wStrap);
    // (the knit: round the thumb's two bones, and the fingers' sides; its ribs across the bone)
    let wKnit = 0, rib = 0;
    let thumbEdge = 1;
    for (const b of sk.tb) {
      const e = seg(p, b.a, b.b) - (Math.max(b.ra, b.rb) + GT + 0.004);
      thumbEdge = Math.min(thumbEdge, Math.abs(e));
      if (e < 0) { wKnit = 1; rib = dot(p, sk.tb[0].d); }
    }
    for (const f of sk.fingers) for (const b of f.bones) {
      if (seg(p, b.a, b.b) > Math.max(b.ra, b.rb) + GT + 0.003) continue;
      const side = ss(0.6, 0.8, Math.abs(dot(nn, f.ax)));
      if (side > wKnit) { wKnit = side; rib = dot(p, b.d); }
    }
    wKnit *= (1 - wPad) * (1 - wBand) * (1 - wCuff) * (1 - wStrap);
    // (seams: where the pads, the band and the cuff meet the suede; the cuff's hem, its last 4 mm)
    const q = sub(p, cm), t = dot(q, ax);
    let seam = 0;
    if (dp < 0.004) seam = Math.max(seam, 1 - ss(0.0003, 0.0011, Math.abs(dp - shell)));
    if (db < 0.004) seam = Math.max(seam, 1 - ss(0.0003, 0.0011, Math.abs(db - shell)));
    if (dc < 0.006) seam = Math.max(seam, (1 - ss(0.0004, 0.0016, Math.abs(dc - shell))) * (1 - wStrap), 1 - ss(0.0025, 0.0045, L / 2 - t));
    const back = dot(nn, D), pu = dot(sub(p, o), U), pw = dot(sub(p, o), W);
    if (back > 0.3 && wCuff + wPad + wBand < 0.5) seam = Math.max(seam, 1 - ss(0.0003, 0.0009, seam2(pu, pw)));
    seam = Math.max(seam, (1 - ss(0.0003, 0.0009, thumbEdge)) * (1 - wCuff));
    // (the mesh panel, its weave across the back in two diagonals)
    const wMesh = back > 0.1 && wCuff + wPad + wBand + wStrap < 0.3 ? ss(-0.014, -0.02, pw) * ss(-0.075, -0.06, pu) * (1 - ss(-0.006, 0.004, pu)) : 0;
    if (wMesh > 0.02) seam = Math.max(seam, 1 - ss(0.0005, 0.0012, Math.abs(pw + 0.017)) * 1);
    glv2[4 * v] = wMesh; glv2[4 * v + 1] = dot(p, dA); glv2[4 * v + 2] = dot(p, dB);
    // (the strap's stitching, 2 mm in from its edges; the coordinate round it for the stitches)
    const ts = dot(sub(p, gl.sc), ax);
    if (wStrap > 0.5) { gloss[v] = 1 - ss(0.0003, 0.0007, Math.abs(Math.abs(ts) - 0.0125)); rib = Math.atan2(dot(q, cross(ax, Df)), dot(q, Df)) * 0.037; }
    // (the fold: how much of the glove is close in front of the surface)
    const e = 0.004, occ = Math.max(0, Math.min(1, sdf(x + nn[0] * e, y + nn[1] * e, z + nn[2] * e) / e));
    col[3 * v] = wPad; col[3 * v + 1] = wKnit; col[3 * v + 2] = wStrap;
    glv[4 * v] = occ; glv[4 * v + 1] = seam; glv[4 * v + 2] = rib; glv[4 * v + 3] = wBand;
  }
  return { tube, pos: m.pos, nrm: m.nrm, idx: m.idx, col, gloss, glove: glv, glove2: glv2 };
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
// (the shapes and their algebra, for the arms: armgeo.js)
export { add, sub, scl, dot, cross, norm, lerp, smin, cap, ell, oval, chain, far, lin };
