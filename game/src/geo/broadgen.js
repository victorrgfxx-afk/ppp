import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../util.js';

// Broadleaved trees grown from a branching skeleton instead of a pole under a ball of leaves (geo/trees.js uses them
// for every broadleaf type, three variants each).
//
// The stem: tapered, a little crooked (oak more than beech), flared into buttresses at the foot (beech: lobed root
// collar), the hornbeam's fluted. Excurrent species (beech, hornbeam, forest-grown) carry the stem up through the crown;
// the oak's and the black locust's split at the crown base into a few heavy limbs. Primary branches come off in a
// spiral (137.5 deg), longer where the crown is widest, at the habit's angle, bending up towards the light at their
// tips; secondary branches fork off them. The foliage is the habit's spray (alpha cards ~1-1.5 m, textures.js
// genLeafSprays) clustered round the branch tips and along their outer half, so the crown shows its limbs, gaps and
// sky holes; flat sprays for beech and hornbeam (their leaves spread in horizontal layers), clumps for oak and black
// locust. Forest-grown trees keep the stubs of their shed lower branches.

// the habits: el branch angle from the vertical (low .. high in the crown), up how strongly the tips turn up, sinu the
// stem's crookedness (x H), flare the root collar (x radius), lobes its buttresses, leader how far up the stem runs
// (x H, 0: it splits into `limbs`), shape of the crown, flat sprays or clumps, flute (the hornbeam's fluting)
export const HABIT = {
  beech: { el: [1.15, 0.55], up: 0.55, sinu: 0.012, flare: 0.6, lobes: 5, leader: 0.9, limbs: 0, shape: 'ovoid', flat: true, kink: 0.12 },
  oak: { el: [1.35, 0.85], up: 0.35, sinu: 0.018, flare: 0.45, lobes: 4, leader: 0, limbs: 3, shape: 'broad', flat: false, kink: 0.4 },
  hornbeam: { el: [1.05, 0.5], up: 0.5, sinu: 0.022, flare: 0.4, lobes: 6, leader: 0.78, limbs: 0, shape: 'ovoid', flat: true, kink: 0.22, flute: 0.14 },
  robinia: { el: [1.1, 0.6], up: 0.4, sinu: 0.03, flare: 0.3, lobes: 3, leader: 0.45, limbs: 2, shape: 'open', flat: false, kink: 0.5 },
  edge: { el: [1.5, 0.75], up: 0.45, sinu: 0.018, flare: 0.45, lobes: 5, leader: 0.7, limbs: 0, shape: 'edge', flat: false, kink: 0.25, low: 1.5 },
  birch: { el: [0.9, 0.45], up: 0.2, sinu: 0.02, flare: 0.25, lobes: 3, leader: 0.92, limbs: 0, shape: 'narrow', flat: false, kink: 0.2, droop: 0.5 },
  generic: { el: [1.2, 0.65], up: 0.45, sinu: 0.03, flare: 0.4, lobes: 4, leader: 0.6, limbs: 0, shape: 'ovoid', flat: false, kink: 0.3 },
  // understory bushes (hazel, hawthorn, dogwood): a short stem soon splitting into rods, a rounded mass of leaves
  shrub: { el: [1.0, 0.45], up: 0.6, sinu: 0.05, flare: 0.15, lobes: 3, leader: 0, limbs: 4, shape: 'ovoid', flat: false, kink: 0.45 },
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// a tube through points P (radii R), `sides` round; rad(i, a) may shape the section (buttresses, fluting); the bark
// texture keeps its scale: uRep wraps across the stem, v runs 1 per 1.2 m
function tube(out, P, R, sides, { rad = null, uRep = 1, v0 = 0 } = {}) {
  const pos = [], nrm = [], uv = [], idx = [];
  const T = V(0, 0, 0), N = V(0, 0, 0), B = V(0, 0, 0), d = V(0, 0, 0);
  let len = v0;
  let prevN = null;
  for (let i = 0; i < P.length; i++) {
    T.subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
    // (parallel transport of the frame: no twist along a bending branch)
    if (prevN) N.copy(prevN).addScaledVector(T, -prevN.dot(T)).normalize();
    else N.crossVectors(T, Math.abs(T.y) > 0.9 ? V(1, 0, 0) : UP).normalize();
    B.crossVectors(T, N);
    prevN = N.clone();
    if (i) len += P[i].distanceTo(P[i - 1]);
    for (let s = 0; s <= sides; s++) {
      const a = s / sides * Math.PI * 2;
      d.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      const r = R[i] * (rad ? rad(i, a) : 1);
      pos.push(P[i].x + d.x * r, P[i].y + d.y * r, P[i].z + d.z * r);
      nrm.push(d.x, d.y, d.z);
      uv.push(s / sides * uRep, len / 1.2);
    }
  }
  for (let i = 0; i < P.length - 1; i++) for (let s = 0; s < sides; s++) {
    const a = i * (sides + 1) + s, b = a + 1, c = a + sides + 1, e = c + 1;
    idx.push(a, b, c, b, e, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  out.push(g.toNonIndexed());
}

// the crown's half-width at relative height u (0 its base, 1 its top)
function envelope(shape, u) {
  if (u < 0 || u > 1) return 0;
  switch (shape) {
    case 'broad': return Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.1)), 0.55);
    case 'open': return 0.75 * Math.pow(Math.sin(Math.PI * u), 0.6) + 0.25 * Math.sin(Math.PI * u * 2.3) * (1 - u);
    case 'narrow': return Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 1.1) * 0.9;
    case 'edge': return Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.6);
    default: return Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.75);
  }
}

// t: the type (geo/trees.js TYPES: H, crown, trunkR, bole, cards, droop), form: a HABIT key, seed: the variant
// detail 0: the instanced model near you; -1: lighter (seen from 75 m on: fewer limbs drawn, the same crown); 1: richer
export function broadTree(t, form, seed, detail = 0) {
  const h = HABIT[form] ?? HABIT.generic, r = rng(seed * 7919 + 13);
  const H = t.H, R0 = t.trunkR, bole = t.bole ?? 0.4, crownR = t.crown;
  const yb = H * bole, wood = [], cards = [];
  const lite = detail < 0, sides = detail > 0 ? 10 : lite ? 5 : 7;
  // ---- the stem: its axis gently wandering, leaning a little
  const lean = V((r() - 0.5) * 2, 0, (r() - 0.5) * 2).multiplyScalar(0.012 * H * (0.5 + r()));
  const ph1 = r() * 6.28, ph2 = r() * 6.28;
  const top = h.leader > 0 ? H * h.leader : yb + (H - yb) * 0.18;
  const nS = detail > 0 ? 12 : lite ? 5 : 7, stem = [], stemR = [];
  const axis = (y) => V(lean.x * y / H + Math.sin(y / H * 5.1 + ph1) * h.sinu * H * Math.min(1, y / 3),
    y, lean.z * y / H + Math.sin(y / H * 4.3 + ph2) * h.sinu * H * Math.min(1, y / 3));
  const radius = (y) => {
    const k = Math.max(0, y) / Math.max(top, 1);
    return R0 * (1 - 0.6 * Math.pow(k, 1.2)) * (1 + h.flare * Math.exp(-Math.max(0, y) / (0.35 + R0)));
  };
  for (let i = 0; i <= nS; i++) {
    const y = -0.4 + (top + 0.4) * Math.pow(i / nS, 1.25);          // (closer rings at the flared foot)
    stem.push(axis(y)); stemR.push(radius(y));
  }
  const lob = h.lobes, lph = r() * 6.28, flute = h.flute ?? 0;
  tube(wood, stem, stemR, sides, {
    uRep: Math.max(1, Math.round(2 * Math.PI * R0 / 0.55)),
    rad: (i, a) => {
      const y = stem[i].y;
      return 1 + 0.22 * h.flare * Math.cos(lob * a + lph) * Math.exp(-Math.max(0, y) / 0.6) + flute * Math.cos(7 * a + lph) * Math.min(1, y / 1.5);
    },
  });
  // ---- the heavy limbs of a decurrent crown (oak, black locust): they fork from the stem's top
  const leaders = [];
  if (h.limbs > 0) {
    const base = axis(top), rT = radius(top);
    for (let k = 0; k < h.limbs; k++) {
      const a = k / h.limbs * Math.PI * 2 + r() * 0.8, el = 0.35 + r() * 0.35, L = (H - top) * (0.7 + 0.25 * r());
      const dir = V(Math.cos(a) * Math.sin(el), Math.cos(el), Math.sin(a) * Math.sin(el));
      const P = [base.clone()], Rr = [rT * 0.92];
      for (let s = 1; s <= 4; s++) {
        dir.x += (r() - 0.5) * h.kink * 0.6; dir.z += (r() - 0.5) * h.kink * 0.6; dir.y += 0.05; dir.normalize();
        P.push(P[s - 1].clone().addScaledVector(dir, L / 4)); Rr.push(rT * 0.75 * (1 - 0.7 * s / 4));
      }
      tube(wood, P, Rr, Math.max(5, sides - 2), { uRep: Math.max(1, Math.round(2 * Math.PI * rT * 0.75 / 0.55)) });
      leaders.push({ P, R: Rr });
    }
  } else leaders.push({ P: stem, R: stemR });
  // where a branch can start: on the stem (or the limbs) in the crown, at height y
  const attach = (y) => {
    if (h.limbs > 0 && y > top) {
      const L = leaders[Math.floor(r() * leaders.length)], P = L.P;
      for (let i = 1; i < P.length; i++) if (P[i].y >= y || i === P.length - 1) {
        const f = Math.min(1, Math.max(0, (y - P[i - 1].y) / Math.max(0.01, P[i].y - P[i - 1].y)));
        return { p: P[i - 1].clone().lerp(P[i], f), r: L.R[i - 1] + (L.R[i] - L.R[i - 1]) * f };
      }
    }
    return { p: axis(Math.min(y, top)), r: radius(Math.min(y, top)) };
  };
  // ---- primary branches, in a spiral up the crown; secondary ones off them; the foliage's anchors
  const nP = Math.round((detail > 0 ? 22 : 14) * (0.85 + 0.3 * r()) * Math.min(1.3, Math.max(0.6, crownR / 4)));
  const anchors = [];                                              // [point, outward direction, weight]
  const c0 = V(0, yb + (H - yb) * 0.55, 0);
  let az = r() * 6.28;
  for (let k = 0; k < nP; k++) {
    const u = Math.pow((k + 0.3 + 0.5 * r()) / nP, h.low ?? 1);   // relative height in the crown (an edge tree: more of its limbs low)
    const y = yb + (H - yb) * (0.04 + 0.86 * u);
    az += 2.39996 + (r() - 0.5) * 0.5;
    const { p, r: rr } = attach(y);
    const env = envelope(h.shape, (y - yb) / (H - yb)) * crownR;
    const el = h.el[0] + (h.el[1] - h.el[0]) * u + (r() - 0.5) * 0.25;
    const dir = V(Math.cos(az) * Math.sin(el), Math.cos(el), Math.sin(az) * Math.sin(el));
    // reach the envelope: horizontally out to ~its radius
    const L = Math.max(0.8, (env * (0.8 + 0.3 * r()) - Math.hypot(p.x, p.z) * 0.5) / Math.max(0.35, Math.sin(el)));
    const n = detail > 0 ? 5 : 3, P = [p.clone()], Rb = [Math.min(rr * 0.62, 0.05 + 0.055 * L)];
    for (let s = 1; s <= n; s++) {
      dir.y += h.up * 0.9 / n; dir.x += (r() - 0.5) * h.kink / n * 2; dir.z += (r() - 0.5) * h.kink / n * 2;
      if (h.droop) dir.y -= h.droop * s / n * 0.8;
      dir.normalize();
      P.push(P[s - 1].clone().addScaledVector(dir, L / n));
      Rb.push(Rb[0] * Math.pow(1 - s / (n + 0.6), 1.15) + 0.008);
    }
    if (!lite) tube(wood, P, Rb, detail > 0 ? 6 : 4);
    else if (k % 2 === 0) tube(wood, [P[0], P[2], P[3]], [Rb[0], Rb[2], Rb[3]], 3);
    const tip = P[n];
    anchors.push([tip, tip.clone().sub(c0).setY(0).normalize(), 3]);
    anchors.push([P[Math.ceil(n * 0.6)], P[Math.ceil(n * 0.6)].clone().sub(c0).setY(0).normalize(), 1.4]);
    if (h.low) anchors.push([P[1], P[1].clone().sub(c0).setY(0).normalize(), 1.2]);   // (leafy along the whole limb, down low)
    // secondaries: off the outer part, to either side and up
    const nSec = detail > 0 ? 3 : (L > 2.2 ? 2 : 1);
    for (let q = 0; q < nSec; q++) {
      const f = 0.35 + 0.5 * (q + r() * 0.8) / nSec, i = Math.min(n - 1, Math.floor(f * n)), fr = f * n - i;
      const sp = P[i].clone().lerp(P[i + 1], fr);
      const side = V().crossVectors(dir, UP).normalize().multiplyScalar(q % 2 ? 1 : -1);
      const sd = dir.clone().multiplyScalar(0.55).add(side.multiplyScalar(0.7)).add(V(0, 0.35 * h.up + 0.1, 0)).normalize();
      const sl = L * (1 - f) * (0.55 + 0.35 * r()) + 0.4;
      const S = [sp, sp.clone().addScaledVector(sd, sl * 0.55), null];
      sd.y += 0.15 * h.up - (h.droop ?? 0) * 0.4; sd.normalize();
      S[2] = S[1].clone().addScaledVector(sd, sl * 0.45);
      if (!lite) tube(wood, S, [Rb[i] * 0.55, Rb[i] * 0.32, 0.008], detail > 0 ? 5 : 3);
      anchors.push([S[2], S[2].clone().sub(c0).setY(0).normalize(), 2]);
    }
  }
  // the top: the leader's end in the crown, a few short shoots
  if (h.leader > 0) { const tp = axis(top); for (let k = 0; k < 3; k++) anchors.push([V(tp.x + (r() - 0.5) * crownR * 0.4, H * (0.93 + 0.06 * r()), tp.z + (r() - 0.5) * crownR * 0.4), V(r() - 0.5, 0, r() - 0.5).normalize(), 2]); }
  // the stubs of shed lower branches on a forest-grown bole
  if (bole > 0.3) for (let k = 0, n = detail > 0 ? 7 : 3; k < n; k++) {
    const y = yb * (0.35 + 0.6 * r()), a = r() * 6.28, p = axis(y), rr = radius(y);
    const dir = V(Math.cos(a) * 0.85, 0.5, Math.sin(a) * 0.85).normalize();
    const sl = 0.12 + r() * 0.25, sr = 0.035 + 0.03 * r();
    if (!lite) tube(wood, [p, p.clone().addScaledVector(dir, rr + sl)], [sr, 0.012], 4);
  }
  // ---- the foliage: sprays round the anchors, weighted to the tips
  const tot = anchors.reduce((a, b) => a + b[2], 0);
  const nC = Math.round(t.cards * 1.7 * (detail > 0 ? 1.5 : 1));
  const cs = Math.min(2.3, Math.max(1.2, crownR * 0.46)) * (t.cardScale ?? 1);
  const cc = V(0, yb + (H - yb) * 0.5, 0);
  for (let i = 0; i < nC; i++) {
    let a = r() * tot, an = anchors[0];
    for (const x of anchors) { a -= x[2]; if (a <= 0) { an = x; break; } }
    const [p0, out] = an, rad = cs * (0.4 + 0.9 * r());
    const p = p0.clone().add(V((r() - 0.5) * 2 * rad, (r() - 0.35) * rad * (h.flat ? 0.6 : 1.1), (r() - 0.5) * 2 * rad)).addScaledVector(out, rad * 0.35);
    if (t.droop || h.droop) p.y -= Math.max(0, p.y - yb) * 0.04 * (t.droop ? 3 : 1);
    if (p.y < yb * 0.9) p.y = yb * 0.9 + r() * 0.5;
    const s = cs * (0.75 + 0.5 * r());
    const g = new THREE.PlaneGeometry(s, s * (t.droop ? 1.35 : 1));
    if (h.flat) g.rotateX(-Math.PI / 2 + (r() - 0.5) * 0.9);
    else g.rotateX(-Math.PI / 2 + (r() - 0.5) * 1.7 + (t.droop ? 1.0 : 0));
    g.rotateY(Math.atan2(out.x, out.z) + (r() - 0.5) * 1.6);
    g.translate(p.x, p.y, p.z);
    // normals out of the crown and up: the soft, volumetric light of a real crown
    const nrm = g.attributes.normal, pos = g.attributes.position;
    for (let k = 0; k < nrm.count; k++) {
      const v = V(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(cc).normalize();
      v.y = v.y * 0.7 + 0.4; v.normalize();
      nrm.setXYZ(k, v.x, v.y, v.z);
    }
    cards.push(g.toNonIndexed());
  }
  // a dark, lumpy inner volume for the far billboards only (the crown reads as a mass from afar)
  const core = new THREE.IcosahedronGeometry(1, 1);                     // (non-indexed already)
  const cp = core.attributes.position, cn = core.attributes.normal;
  const vr = (H - yb) * 0.5;
  for (let k = 0; k < cp.count; k++) {
    const x = cp.getX(k), y = cp.getY(k), z = cp.getZ(k);
    const f = 0.8 + 0.2 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + y * 1.3);
    cp.setXYZ(k, x * crownR * 0.55 * f, y * vr * 0.7 * f + cc.y, z * crownR * 0.55 * f);
    const v = V(x, y * 0.7 + 0.35, z).normalize(); cn.setXYZ(k, v.x, v.y, v.z);
  }
  const clean = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; };
  return { wood: mergeGeometries(wood.map(clean)), leaves: mergeGeometries(cards.map(clean)), core: clean(core) };
}
