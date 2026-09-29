import * as THREE from 'three';
import { GEO, heightAt, addHolePoly } from './data.js';
import { Acc } from './bridge.js';
import { M } from '../materials.js';
import { normalFromCanvas } from '../textures.js';
import { rng } from '../util.js';
import { canvas, tex, grain, blobs, boxAt, cyl, tube, drape, merged, frame, pairs } from './pitigaia.js';

// The junction of DJ100E (Strada Centru / Ion Mateescu) with Strada Dimitrie Gusti and the east arm of Strada Centru,
// with the monument (OSM node 'historic=monument'), from the user's photo 54 (45.12858 N 25.71276 E, from a car on
// Strada Centru coming from the south-east): the paved junction with the round kerbed island, its low black railing
// and the tall stone column, the east arm's split around it, the arched black fence on the left, the refuge with a
// sign, the street lights.
// OSM maps the junction as a triangle of one-way links with nothing inside; on the Bing aerial (z19, measurements
// only) the triangle is all asphalt with a round island of ~3.6 m radius around the monument, and DJ100E's carriageway
// passes north-west of it: its middle vertex is moved 1.6 m that way so the south-east lane clears the island.
const ISLAND = { x: -504.2, z: -377.3, r: 3.6 };
const MAIN = '14380878', EAST = '304013860';
const TRI = [[-499.3, -386.4], [-521.4, -369.3], [-500.3, -368.7]];     // inside the one-way links and DJ100E's centre line
const FENCE = [[-550.5, -365.4], [-531.4, -371.3]];                      // arched black fence on the south-west side
const REFUGE = { x: -525.2, z: -373.4 };                                  // the small kerbed refuge with the sign
const UP = [0, 1, 0];

export function prepareMonument() {
  const r = (GEO.roads || []).find(x => x.id === MAIN);
  if (r && Math.abs(r.p[2] + 498.4) < 0.3 && Math.abs(r.p[3] + 377.7) < 0.3) r.p[2] += 1.6;
  // the two 'retail' footprints behind the junction are low houses with grey metal hip roofs in the photo, not flat boxes
  for (const bd of GEO.buildings) if (bd.id === '265121259' || bd.id === '265121243') { bd.b = 'house'; bd.o = { ...(bd.o || {}), wall: 'stuccoWhite', roof: 'roofMetalGray', levels: 1 }; }
  // the houses on the left of the photo have grey metal roofs as well
  for (const bd of GEO.buildings) if ((bd.id === '231543049' || bd.id === '231543009') && !bd.o?.roof) bd.o = { ...(bd.o || {}), roof: 'roofMetalGray' };
  // the east arm is two full lanes with a centre line (photo 54), not OSM's default 5.6 m
  const e = (GEO.roads || []).find(x => x.id === EAST);
  if (e) e.w = Math.max(e.w, 7.0);
  addHolePoly([[-560, -360], [-490, -360], [-490, -392], [-560, -392]], { noFences: true, scatter: false });
  return true;
}

let MT = null;
function mats() {
  if (MT) return MT;
  const R = rng(7741);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // weathered grey-beige stone of the column
  const stone = canvas(256, 256), sg = stone.getContext('2d');
  sg.fillStyle = '#9c968b'; sg.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) { sg.fillStyle = 'rgba(60,58,52,0.5)'; sg.fillRect(0, y, 256, 2); }
  blobs(sg, 0, 0, 256, 256, 70, 6, 50, ['rgba(70,66,58,0.18)', 'rgba(200,195,185,0.14)', 'rgba(110,100,80,0.12)'], R);
  for (let i = 0; i < 12; i++) { const x = R() * 256, w = 3 + R() * 10, l = 60 + R() * 180, g = sg.createLinearGradient(0, 0, 0, l); g.addColorStop(0, 'rgba(45,43,40,0.35)'); g.addColorStop(1, 'rgba(45,43,40,0)'); sg.fillStyle = g; sg.fillRect(x, 0, w, l); }
  grain(sg, 256, 256, 16, R);
  const sign = canvas(64, 64), ig = sign.getContext('2d'); ig.fillStyle = '#2e3134'; ig.fillRect(0, 0, 64, 64); grain(ig, 64, 64, 8, R);
  MT = {
    asphalt: Object.assign(std({ map: M.asphalt.map, normalMap: M.asphalt.normalMap, roughness: 0.95, color: 0xbfbdb6 }), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -6 }),
    kerb: std({ map: M.concrete.map, roughness: 0.9, color: 0xc4c2bb }),
    walk: std({ map: M.asphalt.map, normalMap: M.asphalt.normalMap, roughness: 0.95, color: 0xa9a7a2 }),
    line: Object.assign(std({ color: 0xeeeeea, roughness: 0.7 }), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -10 }),
    grass: Object.assign(std({ map: M.grassGround.map, normalMap: M.grassGround.normalMap, roughness: 1, color: 0xc8d4a8 }), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    stone: std({ map: tex(stone, { repeat: true }), normalMap: tex(normalFromCanvas(stone, 2, 256), { repeat: true, srgb: false }), roughness: 0.92 }),
    black: std({ color: 0x18191b, roughness: 0.55, metalness: 0.6 }),
    bronze: std({ color: 0x3b3326, roughness: 0.5, metalness: 0.7 }),
    hedge: std({ color: 0x33502a, roughness: 1 }),
    signBack: std({ map: tex(sign), roughness: 0.6, metalness: 0.4 }),
  };
  return MT;
}

export function buildMonument(B, world) {
  const Mt = mats();
  const A = { asphalt: new Acc(), kerb: new Acc(), grass: new Acc(), stone: new Acc(), signBack: new Acc(), walk: new Acc(), line: new Acc() };
  const walks = [];
  const G = { black: [], bronze: [], hedge: [], galv: [], dark: [], stone: [] };
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const Y = (x, z) => heightAt(x, z);
  const R = rng(1177);
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  const grow = (x, z, r = 0) => { bb.x0 = Math.min(bb.x0, x - r); bb.x1 = Math.max(bb.x1, x + r); bb.z0 = Math.min(bb.z0, z - r); bb.z1 = Math.max(bb.z1, z + r); };

  // ---- the paved junction: asphalt over the triangle OSM leaves empty
  drape(A.asphalt, TRI, 0.025, 1.5, 3.2);
  for (const [x, z] of TRI) grow(x, z, 4);

  // ---- the round island: kerb, grass, low black railing, a few clipped shrubs, the column
  const { x: cx, z: cz, r: rr } = ISLAND, y0 = Y(cx, cz), N = 32, top = 0.17;
  const ring = [];
  for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2; ring.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]); }
  for (let k = 0; k < N; k++) {
    const p = ring[k], q = ring[(k + 1) % N], yp = Y(...p), yq = Y(...q), mx = (p[0] + q[0]) / 2 - cx, mz = (p[1] + q[1]) / 2 - cz;
    A.kerb.quad([p[0], yp - 0.05, p[1]], [q[0], yq - 0.05, q[1]], [q[0], y0 + top, q[1]], [p[0], y0 + top, p[1]], [mx, 0, mz], [0, 0, 1, 0, 1, 0.2, 0, 0.2]);
    const pi = [cx + (p[0] - cx) * 0.94, cz + (p[1] - cz) * 0.94], qi = [cx + (q[0] - cx) * 0.94, cz + (q[1] - cz) * 0.94];
    A.kerb.quad([p[0], y0 + top, p[1]], [q[0], y0 + top, q[1]], [qi[0], y0 + top, qi[1]], [pi[0], y0 + top, pi[1]], UP);
    A.grass.quad([pi[0], y0 + top - 0.005, pi[1]], [qi[0], y0 + top - 0.005, qi[1]], [cx, y0 + top - 0.005, cz], [cx, y0 + top - 0.005, cz], UP, [pi[0] / 2, pi[1] / 2, qi[0] / 2, qi[1] / 2, cx / 2, cz / 2, cx / 2, cz / 2]);
    // railing: posts every other segment, two rails, 0.75 m
    const rp = [cx + (p[0] - cx) * 0.88, cz + (p[1] - cz) * 0.88], rq = [cx + (q[0] - cx) * 0.88, cz + (q[1] - cz) * 0.88], yr = y0 + top;
    if (k % 2 === 0) boxAt(G.black, rp[0], yr + 0.38, rp[1], 0.05, 0.76, 0.05);
    for (const h of [0.18, 0.72]) tube(G.black, [rp[0], yr + h, rp[1]], [rq[0], yr + h, rq[1]], 0.018, 5);
    for (let t = 0.25; t < 1; t += 0.25) { const bx = rp[0] + (rq[0] - rp[0]) * t, bz = rp[1] + (rq[1] - rp[1]) * t; boxAt(G.black, bx, yr + 0.45, bz, 0.015, 0.54, 0.015); }
    box((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, Math.hypot(q[0] - p[0], q[1] - p[1]) / 2, 0.15, Math.atan2(-(q[1] - p[1]), q[0] - p[0]), yp - 1, y0 + top + 0.75, 'island');
  }
  for (let k = 0; k < 7; k++) {                                                         // clipped shrubs inside the railing
    const a = k / 7 * Math.PI * 2 + 0.3, d = rr * (0.55 + R() * 0.12), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, s = 0.35 + R() * 0.2;
    const g = new THREE.IcosahedronGeometry(1, 1); g.scale(s * 0.55, s * 0.4, s * 0.55); g.translate(x, y0 + top + s * 0.3, z); G.hedge.push(g);
  }
  // the column: two-step plinth, a square shaft of grey stone, a cornice, a dark bronze piece on top and a plaque
  {
    const yb = y0 + top, rot = Math.atan2(-0.3, 0.954);                                // faces along Strada Centru's east arm
    const T = (g) => { g.rotateY(rot); g.translate(cx, 0, cz); return g; };
    const stoneBox = (w, h, d, y) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y + h / 2, 0); G.stone.push(T(g)); };
    stoneBox(2.2, 0.3, 2.2, yb); stoneBox(1.7, 0.35, 1.7, yb + 0.3); stoneBox(1.05, 5.6, 1.05, yb + 0.65); stoneBox(1.3, 0.3, 1.3, yb + 6.25);
    stoneBox(0.8, 0.35, 0.8, yb + 6.55);
    const b = new THREE.BoxGeometry(0.45, 0.8, 0.45); b.translate(0, yb + 6.9 + 0.4, 0); G.bronze.push(T(b));
    const pl = new THREE.BoxGeometry(0.6, 0.8, 0.04); pl.translate(0, yb + 3.4, 0.545); G.bronze.push(T(pl));
    box(cx, cz, 1.1, 1.1, -rot, yb - 1, yb + 7.5, 'monument');
  }
  grow(cx, cz, rr + 2);

  // ---- the refuge on the left with a sign seen from the back (photo 54)
  {
    const { x, z } = REFUGE, y = Y(x, z), P = [[x - 1.6, z + 0.9], [x + 1.4, z - 1.2], [x + 1.8, z + 0.2]];
    for (let i = 0; i < 3; i++) {
      const a = P[i], b = P[(i + 1) % 3], ya = Y(...a), yb2 = Y(...b), mx = (a[0] + b[0]) / 2 - x, mz = (a[1] + b[1]) / 2 - z;
      A.kerb.quad([a[0], ya - 0.05, a[1]], [b[0], yb2 - 0.05, b[1]], [b[0], y + 0.16, b[1]], [a[0], y + 0.16, a[1]], [mx, 0, mz]);
    }
    A.grass.quad([P[0][0], y + 0.155, P[0][1]], [P[1][0], y + 0.155, P[1][1]], [P[2][0], y + 0.155, P[2][1]], [P[2][0], y + 0.155, P[2][1]], UP);
    cyl(G.galv, x + 0.4, y - 0.3, z - 0.1, 3.2, 0.04);
    const fx = 0.95, fz = -0.3, w = 0.45, px = -fz * w, pz = fx * w, sy = y + 2.1;               // the face looks north-west, the back at the camera
    A.signBack.quad([x + 0.4 - px, sy, z - 0.1 - pz], [x + 0.4 + px, sy, z - 0.1 + pz], [x + 0.4 + px, sy + 0.9, z - 0.1 + pz], [x + 0.4 - px, sy + 0.9, z - 0.1 - pz], [-fx, 0, -fz]);
    A.signBack.quad([x + 0.41 - px, sy, z - 0.1 - pz], [x + 0.41 + px, sy, z - 0.1 + pz], [x + 0.41 + px, sy + 0.9, z - 0.1 + pz], [x + 0.41 - px, sy + 0.9, z - 0.1 - pz], [fx, 0, fz]);
    box(x + 0.4, z - 0.1, 0.06, 0.06, 0, y - 1, y + 3, 'sign');
    grow(x, z, 3);
  }

  // ---- the arched black fence on the south-west side (photo 54): square posts, bars, each bay with an arched top
  {
    const [a, b] = FENCE, L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, n = Math.round(L / 2.4);
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ux * L * k / n, z = a[1] + uz * L * k / n, y = Y(x, z);
      boxAt(G.black, x, y + 0.85, z, 0.09, 1.7, 0.09);
      if (k === n) break;
      const bw = L / n, top2 = (t) => 1.25 + 0.3 * Math.sin(Math.PI * t);
      const nb = Math.round(bw / 0.13);
      for (let i = 1; i < nb; i++) { const t = i / nb, bx = x + ux * bw * t, bz = z + uz * bw * t, h = top2(t); boxAt(G.black, bx, y + 0.1 + h / 2, bz, 0.018, h, 0.018); }
      for (let i = 0; i < 8; i++) { const t0 = i / 8, t1 = (i + 1) / 8; tube(G.black, [x + ux * bw * t0, y + 0.1 + top2(t0), z + uz * bw * t0], [x + ux * bw * t1, y + 0.1 + top2(t1), z + uz * bw * t1], 0.02, 5); }
      tube(G.black, [x, y + 0.25, z], [x + ux * bw, y + 0.25, z + uz * bw], 0.02, 5);
      box(x + ux * bw / 2, z + uz * bw / 2, bw / 2, 0.06, Math.atan2(-uz, ux), y - 1, y + 1.6, 'fence');
      grow(x, z, 1);
    }
  }

  // ---- kerbed footways along the east arm towards the junction (photo 54): 1.3 m to the fence on the left, 1.8 m right
  {
    const er = (GEO.roads || []).find(x => x.id === EAST);
    if (er) {
      const F = frame(pairs(er.p)), hw = er.w / 2;
      const W = (t, o) => { const q = F.at(t), [ux, uz] = F.dir(t); return [q.x - uz * o, q.z + ux * o]; };
      const walk = (t0, t1, side, w) => {
        const oK = side * hw, oB = side * (hw + 0.15 + w);
        const yT = (t) => Y(...W(t, oK)) + 0.17;
        for (let t = t0; t < t1 - 1e-6; t += 1) {
          const u = Math.min(t1, t + 1), a = W(t, oK), b = W(u, oK), a1 = W(t, side * (hw + 0.15)), b1 = W(u, side * (hw + 0.15)), a2 = W(t, oB), b2 = W(u, oB), [ux, uz] = F.dir(t);
          A.kerb.quad([a[0], Y(...a) - 0.05, a[1]], [b[0], Y(...b) - 0.05, b[1]], [b[0], yT(u), b[1]], [a[0], yT(t), a[1]], [uz * side, 0, -ux * side]);
          A.kerb.quad([a[0], yT(t), a[1]], [b[0], yT(u), b[1]], [b1[0], yT(u), b1[1]], [a1[0], yT(t), a1[1]], UP);
          A.walk.quad([a1[0], yT(t) - 0.01, a1[1]], [b1[0], yT(u) - 0.01, b1[1]], [b2[0], yT(u) - 0.01, b2[1]], [a2[0], yT(t) - 0.01, a2[1]], UP, [0, t / 3, 0, u / 3, w / 3, u / 3, w / 3, t / 3]);
          grow(a2[0], a2[1], 1);
        }
        walks.push((x, z) => { const l = F.local(x, z); return l && l.s > t0 && l.s < t1 && l.o * side >= hw && l.o * side <= hw + 0.15 + w ? Y(...W(l.s, oK)) + 0.16 : null; });
      };
      walk(5.5, 32, 1, 1.3);          // south-west side, from the refuge back along the arched fence
      // dashed centre line towards the junction (3 m / 6 m, as roads.js draws it on the main roads)
      for (let t = 3; t < 40; t += 9) { const a = W(t, -0.06), b = W(t + 3, -0.06), a2 = W(t, 0.06), b2 = W(t + 3, 0.06); A.line.quad([a[0], Y(...a) + 0.035, a[1]], [b[0], Y(...b) + 0.035, b[1]], [b2[0], Y(...b2) + 0.035, b2[1]], [a2[0], Y(...a2) + 0.035, a2[1]], UP); }
      walk(3.0, 32, -1, 1.8);         // north-east side
    }
  }

  // ---- street lights: galvanised poles with a single arm and a flat LED head
  for (const [x, z, ax, az] of [[-526.5, -363.6, -0.3, -0.95], [-496.2, -363.8, -0.95, 0.3]]) {
    const y = Y(x, z);
    cyl(G.galv, x, y - 0.3, z, 9.3, 0.1, 0.06, 10);
    tube(G.galv, [x, y + 8.9, z], [x + ax * 1.8, y + 9.15, z + az * 1.8], 0.04, 6);
    const hd = new THREE.BoxGeometry(0.7, 0.12, 0.28); hd.rotateY(-Math.atan2(az, ax)); hd.translate(x + ax * 2.05, y + 9.15, z + az * 2.05); G.dark.push(hd);
    box(x, z, 0.12, 0.12, 0, y - 1, y + 9, 'pole');
    grow(x, z, 2);
  }

  // ---- flush
  const put = (acc, mat, opts) => acc.flush(B, mat, null, opts);
  put(A.asphalt, Mt.asphalt, { noCast: true }); put(A.kerb, Mt.kerb); put(A.walk, Mt.walk, { noCast: true }); put(A.line, Mt.line, { noCast: true, noAO: true }); put(A.grass, Mt.grass, { noCast: true }); put(A.signBack, Mt.signBack);
  const geo = (list, mat) => { if (list.length) B.geo(mat, merged(list)); };
  geo(G.black, Mt.black); geo(G.bronze, Mt.bronze); geo(G.hedge, Mt.hedge); geo(G.galv, M.galv); geo(G.dark, Mt.black); geo(G.stone, Mt.stone);

  const island = (x, z) => { if (Math.hypot(x - cx, z - cz) < rr) return y0 + top; for (const f of walks) { const y = f(x, z); if (y !== null) return y; } return null; };
  return {
    type: 'monument', name: 'Strada Centru — monumentul de la intersecție', bbox: bb, surface: island,
    cars: [{ x: -512, z: -365.4, h: -Math.PI / 2 - 0.02, model: 'hatch', paint: 0xeeeeea }],     // parked by the kerb on the right
    // photo 54: in the right lane of the east arm, ~33 m before the column, looking a little left of the road
    view: { from: [-535.6, -363.3], to: [-508.4, -375.9] },
  };
}
