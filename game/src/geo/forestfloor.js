import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt, forestCode, speciesAt, inHole } from './data.js';
import { M, addWind } from '../materials.js';
import { UNDER_SNOW } from '../rain.js';
import { valueNoise2, cleared } from './trees.js';
import { HILL_BOX } from './drapel.js';
import { litterTexture, fernTexture, grassTexture, brambleTexture, rockTexture, woodEndTexture, starGeo, fernGeo, branchGeo, rockShape, mossy } from './hillwood.js';

// The floor of every wood around the player (the hill of the cross has its own, hillwood.js): what lies and grows
// under the trees of each stand, and its deadwood.
//  * last year's leaves all over (beech and hornbeam: a brown carpet; under the spruces a darker needle litter),
//    twigs and fallen branches;
//  * the herb layer by the light the canopy lets through: next to nothing under beech, sedges and grasses under oak
//    and black locust, ferns in the shade and on the cooler slopes, blackberry thickets in the gaps and along the
//    edges, seedlings of the stand's trees;
//  * deadwood as in a managed Carpathian wood: cut stumps (flat, sawn tops) from the last thinnings, fallen trunks,
//    mossy on top, now and then a standing dead tree with its top snapped off and bracket fungi on it;
//  * sandstone boulders where the slope is steep.
// Streamed around the player in 32 m tiles from a hash of each tile (the same every time): the small things near,
// the litter, ferns and deadwood farther; logs, snags, big stumps and boulders are solid.

const TS = 32;
const Q_FLOOR = { 'Scăzută': { d: 0.35, rn: 24, rf: 48 }, 'Medie': { d: 0.6, rn: 34, rf: 66 }, 'Înaltă': { d: 1, rn: 40, rf: 82 }, 'Ultra': { d: 1.3, rn: 48, rf: 100 } };
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
function rng(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z), UP = V3(0, 1, 0);

// ---- the roads through the woods: nothing lies on them (a grid of their segments, built once)
let RIDX = null;
function roadIndex() {
  if (RIDX) return RIDX;
  const C = 40, cells = new Map();
  for (const r of GEO.roads || []) {
    if (r.tu) continue;
    const hw = (r.w ?? 4) / 2 + 1.2;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3];
      for (let cj = Math.floor((Math.min(az, bz) - hw) / C); cj <= Math.floor((Math.max(az, bz) + hw) / C); cj++)
        for (let ci = Math.floor((Math.min(ax, bx) - hw) / C); ci <= Math.floor((Math.max(ax, bx) + hw) / C); ci++) {
          const k = ci + ',' + cj; if (!cells.has(k)) cells.set(k, []); cells.get(k).push([ax, az, bx, bz, hw]);
        }
    }
  }
  return (RIDX = { C, cells });
}
function onRoad(x, z, pad = 0) {
  const { C, cells } = roadIndex(), l = cells.get(Math.floor(x / C) + ',' + Math.floor(z / C));
  if (!l) return false;
  for (const [ax, az, bx, bz, hw] of l) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) < hw + pad) return true;
  }
  return false;
}
const inHill = (x, z) => x > HILL_BOX.x0 - 4 && x < HILL_BOX.x1 + 4 && z > HILL_BOX.z0 - 4 && z < HILL_BOX.z1 + 4;
// what the ground is at (x, z): null outside the woods; the stand's genus, how near its edge, how steep
function siteAt(x, z) {
  if (!forestCode(x, z) || inHill(x, z) || inHole(x, z) || onRoad(x, z) || cleared(x, z)) return null;
  let edge = 0;
  for (const [d, w] of [[5, 1], [10, 0.5]]) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!forestCode(x + a * d, z + b * d)) edge = Math.max(edge, w);
  const gx = (heightAt(x + 1.5, z) - heightAt(x - 1.5, z)) / 3, gz = (heightAt(x, z + 1.5) - heightAt(x, z - 1.5)) / 3;
  const g = speciesAt(x, z) & 15;
  // how much light reaches the floor: beech deepest shade, oak and black locust and pine open
  const light = g === 1 ? 0.12 : g === 2 || g === 8 || g === 6 ? 0.65 : g === 4 || g === 5 ? 0.25 : g === 3 ? 0.3 : 0.4;
  return { g, conifer: g === 4 || g === 5 || g === 6, edge, slope: Math.hypot(gx, gz), gx, gz, light: Math.min(1, light + edge * 0.5) };
}

// ---- the deadwood models (shared)
function cylGeo(a, b, r0, r1, seg, open = true) {
  const d = b.clone().sub(a), L = d.length(), g = new THREE.CylinderGeometry(r1, r0, L, seg, Math.max(1, Math.round(L / 1.2)), open);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g.index ? g.toNonIndexed() : g;
}
const cleanG = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };
const BARK_C = [0.8, 0.77, 0.72], MOSS_C = [0.36, 0.5, 0.2];
function deadwoodModels() {
  const R = rng(5);
  // a fallen trunk along +x, 1 m radius at its base, lying with its axis at y = 0 (scaled per instance), its stubs
  const log = (L) => {
    const parts = [mossy(cylGeo(V3(-L / 2, 0, 0), V3(L / 2, 0, 0), 1, 0.62, 10), BARK_C, MOSS_C, 0.3, 7)];
    for (let k = 0; k < 3; k++) {
      const t = -L / 2 + L * (0.35 + 0.6 * R()), a = R() * Math.PI * 2, s = V3(0.35, Math.abs(Math.sin(a)) + 0.25, Math.cos(a)).normalize();
      parts.push(mossy(cylGeo(V3(t, 0, 0), V3(t, 0, 0).addScaledVector(s, 0.8 + R() * 2.4), 0.24, 0.1, 5), BARK_C, MOSS_C, 0.5, 9));
    }
    return mergeGeometries(parts.map(cleanG));
  };
  const logEnd = (L) => { const g = new THREE.CircleGeometry(0.62, 10); g.rotateY(Math.PI / 2); g.translate(L / 2, 0, 0); const h = new THREE.CircleGeometry(1, 10); h.rotateY(-Math.PI / 2); h.translate(-L / 2, 0, 0); return mergeGeometries([g, h].map(cleanG)); };
  // a cut stump: 1 m radius, 1 m tall (scaled), flared at the foot, the sawn top
  const stump = () => {
    const g = new THREE.CylinderGeometry(1, 1.25, 1, 12, 3, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.5, a = Math.atan2(p.getZ(i), p.getX(i)), f = 1 + 0.12 * Math.cos(5 * a) * (1 - y); p.setXYZ(i, p.getX(i) * f, y, p.getZ(i) * f); }
    g.computeVertexNormals();
    return mossy(cleanG(g), BARK_C, MOSS_C, 0.6, 3);
  };
  const stumpTop = () => { const g = new THREE.CircleGeometry(1, 12); g.rotateX(-Math.PI / 2); g.translate(0, 1, 0); return cleanG(g); };
  // a standing dead tree: the bole snapped at ~7 m (a jagged top), branch stubs, bracket fungi; radius 1 at the foot
  const snag = () => {
    const parts = [cleanG(cylGeo(V3(0, -0.3, 0), V3(0.08, 6.2, 0.05), 1, 0.66, 9))];
    const top = new THREE.ConeGeometry(0.66, 1.4, 9, 2, true), tp = top.attributes.position;
    for (let i = 0; i < tp.count; i++) if (tp.getY(i) > 0.2) tp.setY(i, tp.getY(i) + (R() - 0.3) * 0.9);
    top.computeVertexNormals(); top.translate(0.08, 6.9, 0.05); parts.push(cleanG(top));
    for (let k = 0; k < 4; k++) { const y = 2.5 + R() * 3.4, a = R() * 6.28; parts.push(cleanG(cylGeo(V3(0, y, 0), V3(Math.cos(a) * 1.6, y + 0.6, Math.sin(a) * 1.6), 0.18, 0.06, 5))); }
    return mergeGeometries(parts.map(g => { const c = new Float32Array(g.attributes.position.count * 3).fill(0.82); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; }));
  };
  const fungi = () => {
    const parts = [];
    for (let k = 0; k < 9; k++) {
      const y = 0.8 + k * 0.55 + R() * 0.2, a = R() * 6.28, g = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      const rr = 1 - 0.34 * y / 6.5 + 0.06;                                   // (on the bark: the bole tapers)
      g.scale(0.28 + R() * 0.12, 0.09, 0.2 + R() * 0.08); g.translate(Math.cos(a) * rr, y, Math.sin(a) * rr); parts.push(cleanG(g));
    }
    return mergeGeometries(parts);
  };
  return { log: [log(6), log(9)], logEnd: [logEnd(6), logEnd(9)], logL: [6, 9], stump: stump(), stumpTop: stumpTop(), snag: snag(), fungi: fungi() };
}

export function buildForestFloor(scene, world, quality) {
  if (!GEO.forestBits) return { update() {}, count: () => 0 };
  const Q = Q_FLOOR[quality.label] ?? Q_FLOOR['Înaltă'];
  const plant = (map, amp, freq, extra = {}) => addWind(new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, ...extra }), amp, freq);
  const logMat = M.bark.clone(); logMat.vertexColors = true; logMat.color = new THREE.Color(0xd2c8ba);
  const snagMat = M.barkBeech.clone(); snagMat.vertexColors = true; snagMat.color = new THREE.Color(0xb8b4ac);
  const Mt = {
    litter: new THREE.MeshStandardMaterial({ map: litterTexture(), alphaTest: 0.35, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    branch: M.bark, fern: plant(fernTexture(), 0.05, 1.1), herb: plant(grassTexture(), 0.12, 1.6), bramble: plant(brambleTexture(), 0.03, 1.2),
    seedB: M.leavesBeech, seedH: M.leavesHornbeam, seedO: M.leavesOak,
    log: logMat, end: new THREE.MeshStandardMaterial({ map: woodEndTexture(), roughness: 0.9 }), snag: snagMat,
    fungus: new THREE.MeshStandardMaterial({ color: 0xc9b48e, roughness: 0.8 }),
    rock: new THREE.MeshStandardMaterial({ map: rockTexture(), vertexColors: true, roughness: 0.93 }),
  };
  for (const k of ['litter', 'fern', 'herb']) UNDER_SNOW.add(Mt[k]);
  const DW = deadwoodModels();
  const rocks = [0, 1, 2, 3].map(k => mossy(rockShape(k, 1).clone(), [0.6, 0.57, 0.52], [0.28, 0.38, 0.17], 0.5, 13));
  const G = {
    litter: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), branch: branchGeo(), fern: fernGeo(), herb: starGeo(1), bramble: starGeo(1.4),
    seed: starGeo(0.8), log0: DW.log[0], log1: DW.log[1], end0: DW.logEnd[0], end1: DW.logEnd[1], stump: DW.stump, stumpTop: DW.stumpTop, snag: DW.snag, fungi: DW.fungi,
    rock0: rocks[0], rock1: rocks[1], rock2: rocks[2], rock3: rocks[3],
  };
  const MAT = { litter: 'litter', branch: 'branch', fern: 'fern', herb: 'herb', bramble: 'bramble', seedB: 'seedB', seedH: 'seedH', seedO: 'seedO', log0: 'log', log1: 'log', end0: 'end', end1: 'end', stump: 'log', stumpTop: 'end', snag: 'snag', fungi: 'fungus', rock0: 'rock', rock1: 'rock', rock2: 'rock', rock3: 'rock' };
  const GEOM = { seedB: 'seed', seedH: 'seed', seedO: 'seed' };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), p = new THREE.Vector3(), sv = new THREE.Vector3(), nv = new THREE.Vector3(), col = new THREE.Color();
  const tiles = new Map();
  let live = 0, last = null;
  const buildTile = (ti, tj, lv) => {
    const near = lv === 0, x0 = ti * TS, z0 = tj * TS, R = rng(Math.imul(ti, 73856093) ^ Math.imul(tj, 19349663) ^ 0x5f3759df);
    const L = {}, boxes = [];
    const put = (k, e) => { (L[k] ??= []).push(e); };
    // (the ground's facts change slowly: looked up once per 2 m cell of the tile)
    const memo = new Map(), site = (x, z) => { const key = Math.floor(x / 2) * 65536 + Math.floor(z / 2); let v = memo.get(key); if (v === undefined) { v = siteAt(x, z); memo.set(key, v); } return v; };
    // a coarse look first: any wood on this tile at all?
    let any = false;
    for (let a = 0; a < 4 && !any; a++) for (let b = 0; b < 4 && !any; b++) if (forestCode(x0 + 4 + a * 8, z0 + 4 + b * 8)) any = true;
    if (any) {
      const area = TS * TS, rnd = (n) => Math.round(n * area * Q.d);
      // leaf litter: overlapping patches all over (the terrain under it carries the same colour farther off)
      for (let k = 0, n = rnd(near ? 0.5 : 0.2); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R(), r2 = R();
        if (!s || r1 < s.edge * 0.4) continue;
        const sz = (near ? 2.6 : 3.6) + 1.6 * r2, v = 0.66 + 0.28 * r1;
        put('litter', { x, z, ry: r2 * 6.283, s: [sz, 1, sz], c: s.conifer ? [v * 0.95, v * 0.78, v * 0.62] : [v * 1.58, v * 1.36, v * 1.1], flat: true });
      }
      if (near) for (let k = 0, n = rnd(0.045); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R();
        if (!s) continue;
        const sc = 0.5 + 1.8 * r1 * r1; put('branch', { x, z, ry: R() * 6.283, s: [sc, sc, sc], c: [0.8, 0.78, 0.74], flat: true, lift: 0.01 });
      }
      // ferns: in patches, in the shade, more on the cool slopes
      for (let k = 0, n = rnd(near ? 0.12 : 0.06); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R();
        if (!s) continue;
        const patch = valueNoise2(x, z, 13, 19), want = clamp01((patch - 0.5) * 2.5) * (s.conifer ? 1 : 0.7) * (0.5 + 0.5 * clamp01(s.slope * 3)) * (1 - 0.5 * s.edge);
        if (r1 > want) continue;
        const sc = 0.7 + 0.6 * R(), g = 0.85 + 0.25 * R(); put('fern', { x, z, ry: R() * 6.283, s: [sc, sc, sc], c: [0.9 * g, g, 0.85 * g] });
      }
      // the herb layer (sedges, wood grasses) where the light gets through
      if (near) for (let k = 0, n = rnd(0.25); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R();
        if (!s || r1 > s.light * 0.7 * (0.3 + 0.7 * valueNoise2(x, z, 7, 23))) continue;
        const h = 0.25 + 0.3 * R(), w = 0.6 + 0.4 * R(); put('herb', { x, z, ry: R() * 6.283, s: [w, h, w], c: [0.46, 0.56, 0.36] });
      }
      // blackberry: thickets in the gaps and along the edges, where it is light
      for (let k = 0, n = rnd(near ? 0.06 : 0.035); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R();
        if (!s || s.conifer || r1 > (s.edge * 0.9 + 0.25 * s.light) * clamp01((valueNoise2(x, z, 9, 31) - 0.35) * 2.5)) continue;
        const h = 0.5 + 0.6 * R(), w = h * (1.2 + 0.5 * R()); put('bramble', { x, z, ry: R() * 6.283, s: [w, h, w], c: [1, 1, 1] });
      }
      // seedlings of the stand's trees
      if (near) for (let k = 0, n = rnd(0.05); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R();
        if (!s || s.conifer || r1 > 0.35 + s.light * 0.5) continue;
        const h = 0.25 + 0.55 * R();
        put(s.g === 2 ? 'seedO' : s.g === 3 ? 'seedH' : 'seedB', { x, z, ry: R() * 6.283, s: [h * 0.9, h, h * 0.9], c: [0.95, 1, 0.9] });
      }
      // deadwood: cut stumps, fallen trunks, a standing dead tree now and then
      for (let k = 0, n = Math.round(area / 170); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R(), rr = 0.18 + 0.2 * R(), h = 0.18 + 0.32 * R();
        if (!s || r1 < 0.35) continue;
        put('stump', { x, z, ry: R() * 6.283, s: [rr, h, rr], c: [1, 1, 1], lift: -0.06 }); put('stumpTop', { x, z, ry: 0, s: [rr, h, rr], c: [1, 1, 1], lift: -0.06 });
        if (h > 0.3) boxes.push([x, z, rr, rr, 0, heightAt(x, z) + h]);
      }
      for (let k = 0, n = R() < 0.6 ? 1 : 2; k < n; k++) {
        const x = x0 + 4 + R() * (TS - 8), z = z0 + 4 + R() * (TS - 8), s = site(x, z);
        if (!s || R() > 0.55 + 0.4 * clamp01(s.slope * 2)) continue;
        // along the slope's contour more often (trunks roll and come to rest across it)
        const a = R() < 0.6 && s.slope > 0.08 ? Math.atan2(s.gx, -s.gz) + (R() - 0.5) * 0.6 : R() * Math.PI, ux = Math.cos(a), uz = Math.sin(a);
        const v = R() < 0.5 ? 0 : 1, len = DW.logL[v], r = 0.16 + 0.16 * R();
        const ax = x - ux * len / 2, az = z - uz * len / 2, bx = x + ux * len / 2, bz = z + uz * len / 2;
        if (!site(ax, az) || !site(bx, bz)) continue;
        const ya = heightAt(ax, az), yb = heightAt(bx, bz);
        let lift = -1e9;
        for (let t = 0; t <= 1; t += 0.125) lift = Math.max(lift, heightAt(ax + (bx - ax) * t, az + (bz - az) * t) - (ya + (yb - ya) * t));
        const tilt = Math.atan2(yb - ya, len);
        put('log' + v, { x, z, y: (ya + yb) / 2 + lift + r * 0.55, ry: -a, rz: tilt, s: [1, r, r], c: [1, 1, 1], raw: true });
        put('end' + v, { x, z, y: (ya + yb) / 2 + lift + r * 0.55, ry: -a, rz: tilt, s: [1, r, r], c: [1, 1, 1], raw: true });
        boxes.push([x, z, len / 2, r, -a, Math.max(ya, yb) + lift + r * 1.5]);
      }
      if (R() < 0.3) {
        const x = x0 + 3 + R() * (TS - 6), z = z0 + 3 + R() * (TS - 6), s = site(x, z), rr = 0.17 + 0.12 * R(), sc = 0.8 + 0.4 * R();
        if (s && !s.conifer) {
          put('snag', { x, z, ry: R() * 6.283, s: [rr, sc, rr], c: [1, 1, 1], lift: -0.05 });
          if (R() < 0.7) put('fungi', { x, z, ry: R() * 6.283, s: [rr, sc, rr], c: [1, 1, 1], lift: -0.05 });
          boxes.push([x, z, rr * 1.1, rr * 1.1, 0, heightAt(x, z) + 7 * sc]);
        }
      }
      // sandstone boulders where it is steep
      for (let k = 0, n = Math.round(area / 90); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R();
        if (!s || r1 > clamp01((s.slope - 0.32) * 2.2) * 0.8) continue;
        const sz = 0.25 + 1.0 * R() * R(), sy = sz * (0.8 + 0.4 * R());
        put('rock' + Math.floor(R() * 4), { x, z, ry: R() * 6.283, s: [sz * (0.9 + 0.3 * R()), sy, sz * (0.8 + 0.4 * R())], c: [1, 1, 1], tiltG: s, lift: -sy * 0.2 });
        if (sz > 0.45) boxes.push([x, z, sz * 0.8, sz * 0.8, 0, heightAt(x, z) + sy * 0.5]);
      }
    }
    const grp = new THREE.Group();
    let n = 0;
    for (const key of Object.keys(L)) {
      const list = L[key];
      const im = new THREE.InstancedMesh(G[GEOM[key] ?? key], Mt[MAT[key]], list.length);
      list.forEach((e, i) => {
        if (e.raw) {                                                                  // (a log: yaw, then the slope along it)
          q.setFromEuler(new THREE.Euler(0, e.ry, e.rz, 'YXZ')); p.set(e.x, e.y, e.z);
        } else {
          const y = heightAt(e.x, e.z);
          qy.setFromAxisAngle(UP, e.ry);
          if (e.flat || e.tiltG) {                                                    // lying on the slope
            const gx = (heightAt(e.x + 1, e.z) - heightAt(e.x - 1, e.z)) / 2, gz = (heightAt(e.x, e.z + 1) - heightAt(e.x, e.z - 1)) / 2;
            nv.set(-gx * (e.tiltG ? 0.6 : 1), 1, -gz * (e.tiltG ? 0.6 : 1)).normalize(); q.setFromUnitVectors(UP, nv).multiply(qy);
            p.set(e.x, y + (e.lift ?? 0.02), e.z);
          } else { q.copy(qy); p.set(e.x, y + (e.lift ?? -0.02), e.z); }
        }
        im.setMatrixAt(i, m4.compose(p, q, sv.set(...e.s)));
        im.setColorAt(i, col.setRGB(e.c[0], e.c[1], e.c[2]));
      });
      im.computeBoundingSphere();
      im.receiveShadow = true;
      im.castShadow = !['litter', 'herb', 'fern', 'seedB', 'seedH', 'seedO'].includes(key);
      im.userData.noAO = ['litter', 'herb', 'fern', 'bramble', 'seedB', 'seedH', 'seedO'].includes(key);
      grp.add(im); n += list.length;
    }
    grp.userData.ueSkip = 'forestfloor';
    scene.add(grp);
    live += n;
    const B = boxes.map(([x, z, hw, hd, rot, top]) => new world.Box(x, z, hw, hd, rot, top - 8, top, 'deadwood'));
    return { grp, lv, n, cx: x0 + TS / 2, cz: z0 + TS / 2, boxes: B };
  };
  const drop = (t) => { scene.remove(t.grp); t.grp.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); live -= t.n; };
  // the solid deadwood and boulders of the tiles built
  world.addProvider((qx, qz, qr, out) => {
    for (const t of tiles.values()) {
      if (Math.abs(t.cx - qx) > TS / 2 + qr + 6 || Math.abs(t.cz - qz) > TS / 2 + qr + 6) continue;
      for (const b of t.boxes) if (Math.abs(b.x - qx) < qr + b.hw + b.hd && Math.abs(b.z - qz) < qr + b.hw + b.hd) out.push(b);
    }
  });
  return {
    count: () => live,
    update(cam) {
      const jump = !last || Math.hypot(cam.x - last.x, cam.z - last.z) > 40;
      last = { x: cam.x, z: cam.z };
      const t0 = performance.now(), budget = jump ? 1e9 : 6;
      const ci = Math.floor(cam.x / TS), cj = Math.floor(cam.z / TS), K = Math.ceil(Q.rf / TS) + 1;
      for (let dj = -K; dj <= K; dj++) for (let di = -K; di <= K; di++) {
        const ti = ci + di, tj = cj + dj, cx = (ti + 0.5) * TS, cz = (tj + 0.5) * TS, d = Math.hypot(cx - cam.x, cz - cam.z);
        if (d > Q.rf + TS * 0.7) continue;
        const lv = d < Q.rn + TS * 0.7 ? 0 : 1, key = ti + ',' + tj, old = tiles.get(key);
        if (old && old.lv === lv) continue;
        if (performance.now() - t0 > budget) continue;
        if (old) drop(old);
        tiles.set(key, buildTile(ti, tj, lv));
      }
      for (const [key, t] of tiles) if (Math.hypot(t.cx - cam.x, t.cz - cam.z) > Q.rf + TS * 1.5) { drop(t); tiles.delete(key); }
    },
  };
}
