import { sdfMesh } from './castgeo.js';
import { add, sub, scl, dot, norm, lerp, smin, cap, ell, oval, chain, lin } from './handgeo.js';

// Your arms at the wheel (V76): a muscular man's arms in a T-shirt, sculpted as the hands are (handgeo.js) and skinned
// to the arm's bones, so the elbow bends and the forearm turns as the arms reach the wheel (driver.js).
//  * The upper arm (0.31 m, shoulder to elbow; ~39 cm round the biceps, relaxed): the deltoid capping the shoulder and
//    running down to its V on the outside, the biceps' belly in front over the brachialis, its tendon into the elbow's
//    crease, the triceps' long and lateral heads behind (the horseshoe) flattening into its tendon over the elbow.
//  * The elbow: the olecranon behind, the two epicondyles.
//  * The forearm (0.29 m, elbow to wrist; ~32 cm round its thickest): the brachioradialis and the long wrist extensors
//    swelling on its thumb side below the elbow, the flexors on its inner front, the extensors behind, the ulna's crest;
//    from halfway down the tendons only, narrowing to the wrist's oval, which goes on into the hand's (hand.js).
//  * Veins standing a millimetre out of the skin over the forearm and the biceps.
//  * The T-shirt's short sleeve over the shoulder to halfway down the upper arm, with its hem.
// Sculpted for the right arm in the pose it holds the wheel in (the elbow at 135 degrees, the forearm turned palm up,
// as it hangs in anatomy's pose); the left is it mirrored. Its frame: the shoulder at 0, the upper arm along +x, the elbow
// bending toward +y (the arm's front), +z its outer side.
// No three.js here: it runs in the hands' worker (handworker.js).

export const UPPER = 0.31, FORE = 0.29, BEND = Math.PI / 4;     // (BEND: the elbow's flexion, 180 - 135 degrees)
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
export const ELBOW = [UPPER, 0, 0], F = [Math.cos(BEND), Math.sin(BEND), 0], F_FRONT = [-Math.sin(BEND), Math.cos(BEND), 0];
// a point of the upper arm (along it from the shoulder, toward its front, toward its outside) and of the forearm (from
// the elbow)
const Up = (s, a, z) => [s, a, z];
const Fp = (s, a, z) => add(add(add(ELBOW, F, s), F_FRONT, a), Z, z);
const SLEEVE = 0.13;                                                // (where the sleeve ends, from the shoulder)

function sculpt() {
  const AU = [X, Y, Z], AF = [F, F_FRONT, Z];
  const muscles = chain([
    // the upper arm: humerus, deltoid (cap and V), biceps (belly, tendon), brachialis, triceps (long and lateral heads,
    // tendon), the elbow's bones
    [cap(Up(0.02, 0, 0), Up(0.29, 0, 0), 0.032, 0.026), 0],
    [ell(Up(0.035, 0.0, 0.012), AU, [0.088, 0.065, 0.065]), 0.02],
    [cap(Up(0.02, 0.0, 0.03), Up(0.15, -0.002, 0.036), 0.04, 0.012), 0.015],
    [ell(Up(0.165, 0.032, -0.002), AU, [0.095, 0.039, 0.039]), 0.012],
    [cap(Up(0.24, 0.024, 0), Up(0.305, 0.016, 0.002), 0.016, 0.009), 0.01],
    [ell(Up(0.23, 0.012, 0.0), AU, [0.06, 0.03, 0.036]), 0.012],
    [ell(Up(0.13, -0.032, -0.01), AU, [0.11, 0.038, 0.036]), 0.012],
    [ell(Up(0.12, -0.023, 0.027), AU, [0.075, 0.03, 0.027]), 0.01],
    [cap(Up(0.22, -0.026, 0.0), Up(0.295, -0.027, 0.0), 0.022, 0.016), 0.012],
    [ell(Up(0.31, -0.026, 0), AU, [0.0125, 0.0125, 0.0125]), 0.008],
    [ell(Up(0.305, -0.002, -0.031), AU, [0.011, 0.011, 0.011]), 0.008],
    [ell(Up(0.305, 0.0, 0.026), AU, [0.009, 0.009, 0.009]), 0.008],
    // the forearm: its bones, then the wrist's oval (into the hand's), brachioradialis (from above the elbow), flexors,
    // extensors, the ulna's crest
    [cap(Fp(0.0, -0.01, 0), Fp(0.2, 0, 0), 0.024, 0.02), 0.01],
    [oval(Fp(0.15, 0, 0), Fp(0.315, 0, 0), 0.0282, 0.0298, F_FRONT, 1.46), 0.02],
    [cap(Up(0.25, 0.005, 0.03), Fp(0.05, 0.012, 0.03), 0.018, 0.02), 0.012],
    [ell(Fp(0.075, 0.013, 0.028), AF, [0.085, 0.029, 0.029]), 0.012],
    [ell(Fp(0.085, 0.022, -0.015), AF, [0.095, 0.031, 0.033]), 0.012],
    [ell(Fp(0.09, -0.02, 0.012), AF, [0.09, 0.025, 0.028]), 0.012],
    [cap(Fp(0.0, -0.028, -0.004), Fp(0.25, -0.02, -0.016), 0.008, 0.007), 0.01],
  ]);
  // the veins: a few strands laid along the skin (each point taken onto the surface, then 2.4 mm under it), 3.5 mm
  // thick: ~5 mm across where they stand out of it, ~1 mm high, their sides blended in
  const onSkin = (p) => {
    for (let i = 0; i < 4; i++) {
      const d = muscles.f(...p), e = 0.0008;
      const g = norm([muscles.f(p[0] + e, p[1], p[2]) - muscles.f(p[0] - e, p[1], p[2]), muscles.f(p[0], p[1] + e, p[2]) - muscles.f(p[0], p[1] - e, p[2]), muscles.f(p[0], p[1], p[2] + e) - muscles.f(p[0], p[1], p[2] - e)]);
      p = add(p, g, -d);
      if (i === 3) return add(p, g, -0.0024);                      // (its middle 2.4 mm under the skin)
    }
  };
  const veins = [];
  const strand = (pts, r) => {
    const q = pts.map(onSkin);
    for (let i = 0; i + 1 < q.length; i++) veins.push([cap(q[i], q[i + 1], r, r), 0.004]);
  };
  // (on the back of the forearm toward the thumb, the one up its front to the elbow's crease, the cephalic over the biceps)
  strand([Fp(0.27, -0.012, 0.024), Fp(0.21, -0.004, 0.033), Fp(0.14, 0.006, 0.04), Fp(0.07, 0.016, 0.042)], 0.0035);
  strand([Fp(0.26, 0.016, 0.012), Fp(0.18, 0.03, 0.004), Fp(0.1, 0.04, -0.004), Fp(0.02, 0.04, -0.004)], 0.0034);
  strand([Fp(0.23, -0.016, -0.02), Fp(0.15, -0.012, -0.03), Fp(0.08, -0.004, -0.036)], 0.0032);
  strand([Up(0.3, 0.03, 0.022), Up(0.24, 0.05, 0.03), Up(0.17, 0.058, 0.03)], 0.0034);
  const veinS = chain(veins);
  // the arm with its veins, the sleeve (the
  // arm 5 mm out, cut where it ends) and its hem; parts: the skin's and the shirt's distances apart
  const parts = (x, y, z) => {
    const m = muscles.f(x, y, z), a = smin(m, veinS.f(x, y, z), 0.003);
    const sleeve = Math.max(m - 0.005, x - SLEEVE), hem = Math.max(m - 0.0068, Math.abs(x - (SLEEVE - 0.006)) - 0.006);
    return [a, Math.min(sleeve, hem)];
  };
  const sdf = (x, y, z) => { const [a, c] = parts(x, y, z); return Math.min(a, c); };
  return { sdf, parts, muscles, veinS };
}

// skin weights: bones 0 the upper arm, 1-4 the forearm turned 0, 1/3, 2/3 and all the way to the wrist's turn
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const NB = norm(add(X, F));                                             // (the elbow's bisector)

// the right arm: positions, normals, triangles, colours (linear), cloth (the sleeve), skin indices and weights
export function* buildArm() {
  const s = sculpt(), sdf = s.sdf;
  const m = yield* sdfMesh(sdf, [-0.1, -0.095, -0.085, 0.6, 0.3, 0.095], 0.0028);
  const SKIN = lin(0xc99680), INNER = lin(0xd2a48f), KN = lin(0xb47665), FOLD = lin(0x8a4c40), VEIN = lin(0xa98a86), SHIRT = lin(0x2c3038);
  const n = m.nv, col = new Float32Array(n * 3), cloth = new Float32Array(n), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const hash = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return v - Math.floor(v); };
  for (let v = 0; v < n; v++) {
    if (v % 3000 === 0) yield;
    const p = [m.pos[3 * v], m.pos[3 * v + 1], m.pos[3 * v + 2]], nx = m.nrm[3 * v], ny = m.nrm[3 * v + 1], nz = m.nrm[3 * v + 2];
    let c;
    const [ds, dc] = s.parts(...p);
    if (Math.abs(dc) <= Math.abs(ds)) {
      // the T-shirt: a knit's faint unevenness
      c = scl(SHIRT, 0.92 + 0.12 * hash(Math.floor(p[0] * 300), Math.floor(p[1] * 300), Math.floor(p[2] * 300)));
      cloth[v] = 1;
    } else {
      // the skin: lighter on the arm's inner side (less sun), blotches, redder over the elbow, darker in the folds, the
      // veins a shade bluer
      const inner = Math.max(0, -nz) * 0.7 + Math.max(0, ny) * 0.3;
      c = lerp(SKIN, INNER, inner * 0.6);
      c = scl(c, 0.94 + 0.08 * hash(Math.floor(p[0] * 220), Math.floor(p[1] * 220), Math.floor(p[2] * 220)) + 0.03 * hash(Math.floor(p[0] * 800), Math.floor(p[1] * 800), Math.floor(p[2] * 800)));
      const ol = Math.hypot(p[0] - UPPER, p[1] + 0.026, p[2]);
      if (ol < 0.03) c = lerp(c, KN, (1 - ol / 0.03) * 0.6);
      const vn = s.veinS.f(...p);
      if (vn < 0.002) c = lerp(c, VEIN, ss(0.002, -0.001, vn) * 0.35);
    }
    // (folds: flesh within 9 mm in front of the surface; the veins' small ridges too low to count)
    const e = 0.009, occ = Math.max(0, Math.min(1, sdf(p[0] + nx * e, p[1] + ny * e, p[2] + nz * e) / e));
    c = lerp(c, cloth[v] ? scl(SHIRT, 0.4) : FOLD, (1 - occ) * 0.45);
    col[3 * v] = c[0]; col[3 * v + 1] = c[1]; col[3 * v + 2] = c[2];
    // the bones: the upper arm's and the forearm's across the elbow's bisector; along the forearm, its turn spread over
    // the four forearm bones (the radius turning round the ulna: little by the elbow, all of it at the wrist)
    const q = sub(p, ELBOW), wf = ss(-0.035, 0.035, dot(q, NB));
    const r = ss(0.08, 0.95, dot(q, F) / FORE) * 3, i = Math.min(2, Math.floor(r)), t = r - i;
    si.set([0, 1 + i, 2 + i, 0], 4 * v);
    sw.set([1 - wf, wf * (1 - t), wf * t, 0], 4 * v);
  }
  return { pos: m.pos, nrm: m.nrm, idx: m.idx, col, cloth, si, sw };
}
// the bones' frames in the sculpture (x along the bone, y its front, z its outside) and origins
export const REST = { upper: { o: [0, 0, 0], x: X, y: Y, z: Z }, fore: { o: ELBOW, x: F, y: F_FRONT, z: Z } };
