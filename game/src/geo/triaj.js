import * as THREE from 'three';
import { GEO, heightAt, addHolePoly } from './data.js';
import { Acc } from './bridge.js';
import { M } from '../materials.js';
import { rng } from '../util.js';
import { canvas, tex, grain, blobs, boxAt, merged, frame, pairs, road, tube } from './pitigaia.js';
import { guardrail, guardrailMaterials } from './cantacuzino.js';
import { thuja, mast, grigorescuMats } from './grigorescu.js';

// The bottom of Strada Toma Cantacuzino where it bends into Strada Gării along the railway yard, from the user's photos
// 58-59 (45.13531 N 25.70545 E, from a car heading down to the station):
//  * 58: the bend to the left: the old utility building behind a weathered picket fence and a big tree on the inside of
//    the bend (OSM 1475571528: stained cream render, low dark metal roof with a louvred lantern), two guardrails and a
//    thicket on the outside, the yard's signals, masts and the houses across the tracks beyond
//  * 59: Strada Gării heading north-west along the tracks: a tall thuja hedge behind a fence and a gravel verge on the
//    left, a guardrail on a low stone wall on the right, the wooden A-pole carrying the line over the road, a
//    floodlight mast in the yard
// Positions from the Bing aerial (z19, measurements only) and the photos' perspective (main lens, 1x: the cars ahead
// give the distances). Both roads have worn asphalt without lines here.
const TC = '271472034', GARII = '14190389';
const BLD = '1475571528';                                // the old building on the inside of the bend (photo 58)
const CAM58 = 75;                                        // s on Toma Cantacuzino: the Logan ~20 m ahead, the bend ~35 m
const TREE58 = [433.8, -214.1];                         // the big tree in front of the building (its crown on the aerial)
const PICKET = { s0: 43, s1: 82 };                      // along the inside of the bend
const RAILS58 = [[64.5, 72], [47, 62.5]];               // the two guardrails on the outside (photo 58), s ranges
const G59 = { cam: 32, hedge: [4, 70], rail: [0, 110], apole: 47, flood: [100, -17] };   // on Strada Gării, metres from its end
const UP = [0, 1, 0];

function frames() {
  const t = road(TC), g = road(GARII);
  if (!t || !g) return null;
  const Ft = frame(pairs(t.p)), Fg = frame(pairs(g.p));
  const Wt = (s, o) => { const q = Ft.at(s), [ux, uz] = Ft.dir(s); return [q.x - uz * o, q.z + ux * o]; };
  // Strada Gării from its south-east end (the bend), running north-west: d metres from the end, o > 0 on the hedge's side
  const Wg = (d, o) => { const s = Fg.L - d, q = Fg.at(s), [ux, uz] = Fg.dir(Math.min(s, Fg.L - 4.01)); return [q.x - uz * o, q.z + ux * o]; };
  const dirG = (d) => { const [ux, uz] = Fg.dir(Math.min(Fg.L - d, Fg.L - 4.01)); return [-ux, -uz]; };      // heading north-west
  return { t, g, Ft, Fg, Wt, Wg, dirG, hwt: t.w / 2, hwg: g.w / 2 };
}

export function prepareTriaj() {
  const f = frames();
  if (!f) return false;
  const { g, Fg, Wt, Wg, hwt, hwg } = f;
  // worn asphalt without lines (photos 58-59); Toma Cantacuzino's lower part is set in hala.js
  g.noMarkAt = [Fg.L - 260, Fg.L + 1];
  // the old building: stained cream render, low dark metal roof, a tall single storey (photo 58)
  for (const b of GEO.buildings) if (b.id === BLD) { b.b = 'house'; b.o = { ...(b.o || {}), wall: 'sand', roof: 'roofMetalDark', roofMat: 'metal', pitch: 13, eave: 3.0, roofType: 'hip', chimney: false }; }
  // no generated lot fences, poles or clutter where the fronts are rebuilt: the inside and outside of the bend, both
  // sides of Strada Gării along the hedge and the guardrail
  const band = (W, a, b, o0, o1, st = 4) => { const P = []; for (let s = a; s <= b; s += st) P.push(W(s, o0)); for (let s = b; s >= a; s -= st) P.push(W(s, o1)); return P; };
  addHolePoly(band(Wt, -4, 86, hwt + 0.6, hwt + 9), { noFences: true, scatter: false });
  addHolePoly(band(Wt, -4, 86, -(hwt + 0.6), -(hwt + 14)), { noFences: true, scatter: false });
  addHolePoly(band(Wg, -2, 115, hwg + 0.6, hwg + 7), { noFences: true, scatter: false });
  addHolePoly(band(Wg, -2, 115, -(hwg + 0.6), -(hwg + 8)), { noFences: true, scatter: false });
  return true;
}

let MT = null;
function mats() {
  if (MT) return MT;
  const R = rng(3319);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // weathered picket fence: grey-brown slats 8-12 cm with 3-6 cm gaps, uneven tops (2 m x 2 m tile)
  const pick = canvas(256, 256), pg = pick.getContext('2d');
  pg.clearRect(0, 0, 256, 256);
  for (let x = 0; x < 256;) {
    const w = 10 + R() * 6, top = 4 + R() * 26, v = 85 + R() * 45;
    pg.fillStyle = `rgb(${v | 0},${(v * 0.93) | 0},${(v * 0.82) | 0})`; pg.fillRect(x, top, w, 256 - top);
    pg.fillStyle = 'rgba(40,35,30,0.35)'; pg.fillRect(x + w - 2, top, 2, 256 - top);
    x += w + 4 + R() * 5;
  }
  for (const y of [70, 200]) { pg.fillStyle = 'rgba(70,62,52,0.9)'; pg.fillRect(0, y, 256, 9); }        // the rails behind show through
  // the building's louvred roof lantern
  const louv = canvas(64, 64), lg = louv.getContext('2d');
  lg.fillStyle = '#7d766a'; lg.fillRect(0, 0, 64, 64);
  for (let y = 4; y < 64; y += 8) { lg.fillStyle = '#3a3630'; lg.fillRect(3, y, 58, 4); }
  grain(lg, 64, 64, 10, R);
  // rubble-stone wall under the guardrail on Strada Gării
  const stone = canvas(256, 128), sg = stone.getContext('2d');
  sg.fillStyle = '#6f6a61'; sg.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 90; i++) { const x = R() * 256, y = R() * 128, w = 14 + R() * 26, h = 9 + R() * 14, v = 110 + R() * 60; sg.fillStyle = `rgb(${v | 0},${(v * 0.96) | 0},${(v * 0.9) | 0})`; sg.beginPath(); sg.ellipse(x, y, w / 2, h / 2, R() - 0.5, 0, 7); sg.fill(); }
  blobs(sg, 0, 0, 256, 128, 25, 6, 30, ['rgba(40,45,30,0.3)', 'rgba(90,85,70,0.2)'], R);
  grain(sg, 256, 128, 14, R);
  // fence panels in front of the hedge: dark welded mesh, a pale base board
  const mesh = canvas(64, 128), mg = mesh.getContext('2d');
  mg.clearRect(0, 0, 64, 128); mg.strokeStyle = 'rgba(55,60,58,1)'; mg.lineWidth = 3;
  for (let x = 2; x < 64; x += 16) { mg.beginPath(); mg.moveTo(x, 0); mg.lineTo(x, 104); mg.stroke(); }
  for (let y = 4; y < 104; y += 26) { mg.beginPath(); mg.moveTo(0, y); mg.lineTo(64, y); mg.stroke(); }
  mg.fillStyle = '#c9c6bb'; mg.fillRect(0, 104, 64, 24);
  MT = {
    picket: std({ map: tex(pick, { repeat: true }), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 }),
    louvre: std({ map: tex(louv, { repeat: true }), roughness: 0.8 }),
    roof: std({ color: 0x45484d, roughness: 0.6, metalness: 0.35 }),
    stone: std({ map: tex(stone, { repeat: true }), roughness: 0.95, side: THREE.DoubleSide }),
    mesh: std({ map: tex(mesh, { repeat: true }), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.3 }),
    post: std({ map: M.concrete.map, color: 0xc9c6bd, roughness: 0.9 }),
    wood: std({ color: 0x4a3b2c, roughness: 0.9 }),
    gravel: Object.assign(std({ map: M.gravel.map, normalMap: M.gravel.normalMap, color: 0xa39c90, roughness: 1 }), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
  };
  return MT;
}

function vquad(acc, p, q, ya0, ya1, yb0, yb1, u0, u1, v0 = 0, v1 = 1) {
  const dx = q[0] - p[0], dz = q[1] - p[1];
  acc.quad([p[0], ya0, p[1]], [q[0], yb0, q[1]], [q[0], yb1, q[1]], [p[0], ya1, p[1]], [dz, 0, -dx], [u0, v0, u1, v0, u1, v1, u0, v1]);
}

export function buildTriaj(B, world) {
  const f = frames();
  if (!f) return null;
  const { Ft, Wt, Wg, dirG, hwt, hwg } = f;
  const Mt = mats(), G = guardrailMaterials(), GR = grigorescuMats();
  const Y = (x, z) => heightAt(x, z);
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const seg = (p, q, t, y0, y1, tag) => { const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz); box((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, L / 2, t, Math.atan2(-dz, dx), y0, y1, tag); };
  const R = rng(8821);
  const A = { picket: new Acc(), louvre: new Acc(), stone: new Acc(), mesh: new Acc(), beam: new Acc(), gravel: new Acc() };
  const posts = [], rails = [], wood = [], roofs = [], thujas = [], masts = [], heads = [], wires = [];
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  const grow = (x, z, rr = 0) => { bb.x0 = Math.min(bb.x0, x - rr); bb.x1 = Math.max(bb.x1, x + rr); bb.z0 = Math.min(bb.z0, z - rr); bb.z1 = Math.max(bb.z1, z + rr); };

  // ---- photo 58: the picket fence on the inside of the bend, 1.7 m, on posts every 2.4 m, a grass strip in front
  {
    const o = hwt + 1.6;
    let u = 0;
    for (let s = PICKET.s0; s < PICKET.s1 - 1e-6; s += 2.4) {
      const t = Math.min(PICKET.s1, s + 2.4), p = Wt(s, o), q = Wt(t, o), yp = Y(...p), yq = Y(...q), L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      vquad(A.picket, p, q, yp - 0.05, yp + 1.7, yq - 0.05, yq + 1.7, u / 2, (u + L) / 2);
      u += L;
      boxAt(wood, p[0], yp + 0.8, p[1], 0.1, 1.9, 0.1);
      seg(p, q, 0.06, Math.min(yp, yq) - 1, Math.max(yp, yq) + 1.7, 'fence');
      grow(p[0], p[1], 1);
    }
  }
  // ---- the louvred lantern on the old building's roof, at its south-west end (photo 58, left)
  {
    const b = GEO.buildings.find(x => x.id === BLD);
    if (b && b.r?.length) {
      const [cx, cz, hwb, hdb, a] = b.r[0];
      const along = hwb >= hdb ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)], Lh = Math.max(hwb, hdb), Wh = Math.min(hwb, hdb);
      // at its western end (left in the photo); west is (0.743, -0.669) in the game's frame
      const e = along[0] * 0.743 - along[1] * 0.669 > 0 ? 1 : -1;
      const lx = cx + along[0] * (Lh - 2.2) * e, lz = cz + along[1] * (Lh - 2.2) * e;
      const top = b.y1 + 3.0 + Math.tan(13 * Math.PI / 180) * Wh * 0.9;
      const ang = -Math.atan2(along[1], along[0]);
      boxAt(roofs, lx, top + 1.35, lz, 2.8, 0.14, 2.2, ang);
      const hw = 1.2, hd = 0.85, cA = Math.cos(-ang), sA = Math.sin(-ang);
      const corner = (i, j) => [lx + cA * hw * i - sA * hd * j, lz + sA * hw * i + cA * hd * j];
      const K = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      for (let k = 0; k < 4; k++) vquad(A.louvre, K[k], K[(k + 1) % 4], top - 0.4, top + 1.3, top - 0.4, top + 1.3, 0, 1);
    }
  }
  // ---- photo 58: two guardrails on the outside of the bend, a thicket behind them
  for (const [s0, s1] of RAILS58) guardrail(A.beam, rails, world, Ft, Wt, s0, s1, -(hwt + 0.6), grow);

  // ---- photo 59: Strada Gării: gravel verge, fence and tall thuja hedge on the left; guardrail on a stone wall on the right
  {
    const oF = hwg + 3.0;
    // gravel verge from the asphalt to the fence
    for (let d = G59.hedge[0] - 4; d < G59.hedge[1] + 6; d += 3) {
      const P = [Wg(d, hwg + 0.2), Wg(d + 3, hwg + 0.2), Wg(d + 3, oF), Wg(d, oF)].map(([x, z]) => [x, Y(x, z) + 0.04, z]);
      A.gravel.quad(P[0], P[1], P[2], P[3], UP, [d / 3, 0, (d + 3) / 3, 0, (d + 3) / 3, 1, d / 3, 1]);
    }
    // fence: concrete posts every 2.5 m, dark welded mesh panels with a pale base board, 1.6 m
    for (let d = G59.hedge[0] - 4; d < G59.hedge[1] + 6; d += 2.5) {
      const p = Wg(d, oF), q = Wg(d + 2.5, oF), yp = Y(...p), yq = Y(...q);
      boxAt(posts, p[0], yp + 0.7, p[1], 0.12, 1.8, 0.12);
      vquad(A.mesh, p, q, yp, yp + 1.6, yq, yq + 1.6, 0, 2.5 / 0.5);
      seg(p, q, 0.06, Math.min(yp, yq) - 1, Math.max(yp, yq) + 1.6, 'fence');
    }
    // the hedge: columnar thujas 8-10 m close together behind the fence
    for (let d = G59.hedge[0]; d < G59.hedge[1]; d += 1.5 + R() * 0.6) {
      const [x, z] = Wg(d, oF + 1.4 + R() * 0.8);
      thuja(thujas, x, Y(x, z), z, 8 + R() * 2.2, 1.15 + R() * 0.35, d);
      box(x, z, 0.5, 0.5, 0, Y(x, z) - 1, Y(x, z) + 8, 'tree');
      grow(x, z, 2);
    }
    // guardrail on the tracks' side, a low rubble-stone wall under it down to the yard
    guardrail(A.beam, rails, world, f.Fg, (s, o) => Wg(f.Fg.L - s, o), f.Fg.L - G59.rail[1], f.Fg.L - G59.rail[0], -(hwg + 0.5), grow);
    for (let d = G59.rail[0] + 2; d < G59.rail[1] - 2; d += 4) {
      const p = Wg(d, -(hwg + 0.75)), q = Wg(d + 4, -(hwg + 0.75)), yp = Y(...p), yq = Y(...q);
      vquad(A.stone, p, q, yp - 1.1, yp + 0.3, yq - 1.1, yq + 0.3, 0, 4 / 2.5, 0, 0.55);
    }
  }
  // ---- photo 59: the wooden A-pole right of the road carrying the line across it, the floodlight mast in the yard
  {
    const [px, pz] = Wg(G59.apole, -(hwg + 2.8)), py = Y(px, pz), [hx, hz] = dirG(G59.apole);
    const top = [px, py + 9.5, pz];
    tube(wood, [px, py - 0.5, pz], top, 0.14, 7);
    tube(wood, [px - hx * 1.9, py - 0.5, pz - hz * 1.9], [px - hx * 0.12, py + 7.2, pz - hz * 0.12], 0.12, 7);       // the strut, leaning in from behind
    boxAt(wood, px, py + 9.0, pz, 0.12, 0.12, 1.5, -Math.atan2(hz, hx) + Math.PI / 2);
    box(px, pz, 0.3, 0.3, 0, py - 1, py + 9.5, 'pole');
    // the line: across the road to the left side behind the camera, and on along the yard
    const back = Wg(G59.apole - 42, hwg + 5), fwd = Wg(G59.apole + 40, -(hwg + 2.8));
    for (const e of [-0.6, 0, 0.6]) {
      const nx = hz * e, nz = -hx * e;
      wires.push(px + nx, py + 9.05, pz + nz, back[0] + nx, Y(...back) + 8.6, back[1] + nz);
      wires.push(px + nx, py + 9.05, pz + nz, fwd[0] + nx, Y(...fwd) + 9.05, fwd[1] + nz);
    }
    const [mx, mz] = Wg(G59.flood[0], G59.flood[1]);
    mast(masts, heads, mx, Y(mx, mz), mz, 14, ...Wg(G59.flood[0] + 30, G59.flood[1] + 4));
    box(mx, mz, 0.4, 0.4, 0, Y(mx, mz) - 1, Y(mx, mz) + 14, 'mast');
    grow(px, pz, 3); grow(mx, mz, 2);
  }

  // ---- trees: the big one in front of the old building; thickets behind the guardrails; the map's trees make way
  const T = GEO.trees;
  if (T) {
    const add = [[TREE58[0], TREE58[1], 4, 1.3]];                                      // a walnut: low, wide, sparse crown (photo 58)
    for (let s = 44; s < 84; s += 2.6 + R() * 1.8) {
      const [x, z] = Wt(s, -(hwt + 2.2 + R() * 3)); add.push([x, z, 12, 0.4 + R() * 0.25]);
      if (R() < 0.5) { const [x2, z2] = Wt(s, -(hwt + 6 + R() * 5)); add.push([x2, z2, R() < 0.5 ? 1 : 4, 0.85 + R() * 0.3]); }
    }
    for (let d = G59.hedge[1] + 2; d < G59.hedge[1] + 40; d += 5 + R() * 3) { const [x, z] = Wg(d, hwg + 5 + R() * 3); add.push([x, z, R() < 0.5 ? 0 : 1, 0.9 + R() * 0.3]); }
    const del = (x, z) => {
      const l = Ft.local(x, z);
      if (l && l.s > 38 && l.s < 86 && Math.abs(l.o) < hwt + 14) return true;
      const lg = f.Fg.local(x, z);
      return !!(lg && f.Fg.L - lg.s > -3 && f.Fg.L - lg.s < G59.hedge[1] + 4 && Math.abs(lg.o) < hwg + 8);
    };
    const keep = []; for (let i = 0; i < T.n; i++) if (!(Math.abs(T.x[i] - 470) < 90 && Math.abs(T.z[i] + 200) < 60 && del(T.x[i], T.z[i]))) keep.push(i);
    const n = keep.length + add.length, x = new Float32Array(n), z = new Float32Array(n), t = new Uint8Array(n), s = new Float32Array(n);
    keep.forEach((i, k) => { x[k] = T.x[i]; z[k] = T.z[i]; t[k] = T.t[i]; s[k] = T.s[i]; });
    add.forEach(([ax, az, at, as], k) => { const j = keep.length + k; x[j] = ax; z[j] = az; t[j] = at; s[j] = as; });
    GEO.trees = { n, x, z, t, s };
  }

  A.picket.flush(B, Mt.picket, null, { noCast: true });
  A.louvre.flush(B, Mt.louvre, null, {});
  A.stone.flush(B, Mt.stone, null, {});
  A.mesh.flush(B, Mt.mesh, null, { noCast: true });
  A.gravel.flush(B, Mt.gravel, null, { noCast: true });
  A.beam.flush(B, G.beam, null, {});
  if (rails.length) B.geo(G.post, merged(rails));
  if (posts.length) B.geo(Mt.post, merged(posts));
  if (wood.length) B.geo(Mt.wood, merged(wood));
  if (roofs.length) B.geo(Mt.roof, merged(roofs));
  if (thujas.length) B.geo(GR.thuja, merged(thujas));
  if (masts.length) B.geo(GR.mast, merged(masts));
  if (heads.length) B.geo(GR.lamp, merged(heads));

  // photo 58: the Logan 20 m ahead sits ~7 deg right of the frame's centre; photo 59: along Strada Gării's right lane
  const c58 = Wt(CAM58, -1.6), l58 = Wt(CAM58 - 20, -1.6), dx = l58[0] - c58[0], dz = l58[1] - c58[1], L = Math.hypot(dx, dz), a = 7.4 * Math.PI / 180;
  const hx = (dx * Math.cos(a) + dz * Math.sin(a)) / L, hz = (dz * Math.cos(a) - dx * Math.sin(a)) / L;           // turned 7.4 deg left
  const c59 = Wg(G59.cam, -1.6), [gx, gz] = dirG(G59.cam);
  return {
    type: 'triaj', name: 'Strada Toma Cantacuzino și Strada Gării la triaj', bbox: bb, wires,
    views: { a: { from: c58, to: [c58[0] + hx * 40, c58[1] + hz * 40] }, b: { from: c59, to: [c59[0] + gx * 40, c59[1] + gz * 40] } },
  };
}
