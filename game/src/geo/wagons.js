import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, railHeightAt } from './data.js';
import { TEX } from '../textures.js';
import { rng } from '../util.js';
import { pairs, frame } from './pitigaia.js';

// Freight wagons standing on the station's sidings. The user's drone photos of the Câmpina yard (18 Oct 2026) show
// nearly every siding holding a rake: mostly four-axle tank wagons (the refineries' trade: grey, black, white, lime
// green, a few rust-red), high-sided open wagons in rust brown, now and then a covered wagon. Every OSM siding or
// yard track (not the main lines, not the crossovers, not the one where gara.js parks its locomotive) gets rakes of
// 3-14 wagons with gaps between them, clear of the switches at its ends. Sizes after the common types (UIC):
//  * tank wagon Zacns 88 m3: 15.5 m over buffers, barrel 3.0 m across on a 1.3 m high underframe, a dome on top
//  * open wagon Eaos: 14.0 m over buffers, a box 12.7 x 2.9 m with 2.0 m walls and stanchions along them
//  * covered wagon Hbbins: 15.5 m over buffers, 4.0 m high body under a shallow arched roof
const TANK = [[0.3, 0x9ca1a6], [0.25, 0x262626], [0.13, 0x55595e], [0.12, 0x7aa040], [0.1, 0xd9dbd6], [0.1, 0x7a3424]];
const OPEN = [[0.6, 0x6e3a24], [0.2, 0x5d3322], [0.12, 0x7d4a2e], [0.08, 0x3e4a38]];
const COVERED = [[0.6, 0x8a8f94], [0.4, 0x5a2e24]];
const SKIP = new Set(['183278860']);                    // gara.js: the locomotive's siding (photo 48)
const pick = (K, u) => { let a = 0; for (const [w, c] of K) { a += w; if (u < a) return c; } return K[K.length - 1][1]; };
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// the bogies, the underframe, the headstocks and the buffers (dark), for a wagon of length L over the headstocks
function gear(L, bogie) {
  const g = [];
  const add = (geo, x, y, z) => { geo.translate(x, y, z); g.push(geo); };
  for (const e of [-1, 1]) {
    add(new THREE.BoxGeometry(2.3, 0.42, 2.7), 0, 0.62, e * bogie);
    for (const a of [-0.9, 0.9]) for (const s of [-1, 1]) { const w = new THREE.CylinderGeometry(0.46, 0.46, 0.14, 14); w.rotateZ(Math.PI / 2); add(w, s * 0.75, 0.46, e * bogie + a); }
    add(new THREE.BoxGeometry(2.75, 0.4, 0.22), 0, 1.06, e * L / 2);
    for (const s of [-1, 1]) { const b = new THREE.CylinderGeometry(0.19, 0.19, 0.62, 10); b.rotateX(Math.PI / 2); add(b, s * 0.88, 1.06, e * (L / 2 + 0.3)); }
  }
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.22, 0.38, L), s * 1.2, 1.1, 0);
  return mergeGeometries(g.map(x => x.toNonIndexed()));
}

function tankBody() {
  const g = [];
  const barrel = new THREE.CylinderGeometry(1.5, 1.5, 12.4, 18, 1, true); barrel.rotateX(Math.PI / 2); barrel.translate(0, 2.85, 0); g.push(barrel);
  for (const e of [-1, 1]) {
    const cap = new THREE.SphereGeometry(1.5, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.32, 1); cap.rotateX(e * Math.PI / 2); cap.translate(0, 2.85, e * 6.2); g.push(cap);
  }
  const dome = new THREE.CylinderGeometry(0.36, 0.36, 0.4, 12); dome.translate(0, 4.45, 0); g.push(dome);
  const walk = new THREE.BoxGeometry(1.1, 0.05, 2.4); walk.translate(0, 4.36, 0); g.push(walk);
  const saddle = new THREE.BoxGeometry(2.4, 0.35, 0.5); for (const z of [-4.9, 4.9]) g.push(saddle.clone().translate(0, 1.45, z));
  return mergeGeometries(g.map(x => x.toNonIndexed()));
}

function openBody() {
  const g = [];
  for (const s of [-1, 1]) {
    g.push(new THREE.BoxGeometry(0.08, 2.0, 12.7).translate(s * 1.42, 2.3, 0));
    for (let k = -3; k <= 3; k++) g.push(new THREE.BoxGeometry(0.1, 2.0, 0.14).translate(s * 1.5, 2.3, k * 1.8));
    g.push(new THREE.BoxGeometry(2.92, 2.0, 0.08).translate(0, 2.3, s * 6.35));
  }
  return mergeGeometries(g.map(x => x.toNonIndexed()));
}

function coveredBody() {
  const g = [new THREE.BoxGeometry(2.9, 2.75, 14.6).translate(0, 2.68, 0)];
  // the roof: a shallow arc (the top of a 3.4 m cylinder, flattened) whose chord sits on the walls' top
  const roof = new THREE.CylinderGeometry(3.4, 3.4, 14.6, 18, 1, false, Math.PI - 0.44, 0.88); roof.rotateX(Math.PI / 2); roof.scale(1, 0.35, 1); roof.translate(0, 4.05 - 3.4 * 0.35 * Math.cos(0.44), 0);
  g.push(roof);
  return mergeGeometries(g.map(x => x.toNonIndexed()));
}

export function buildWagons(B, world) {
  const mats = {
    body: new THREE.MeshStandardMaterial({ map: TEX.concrete, roughness: 0.62, metalness: 0.25, vertexColors: true }),
    gear: new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.35, color: 0x2b2826 }),
    floor: new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.1, color: 0x3a2a20 }),
  };
  for (const m of Object.values(mats)) B.cullFor.set(m, 3500);
  const TYPES = {
    tank: { L: 14.3, bogie: 5.1, body: tankBody(), K: TANK },
    open: { L: 13.4, bogie: 4.6, body: openBody(), K: OPEN, floor: new THREE.BoxGeometry(2.84, 0.1, 12.6).translate(0, 1.35, 0).toNonIndexed() },
    covered: { L: 14.9, bogie: 5.4, body: coveredBody(), K: COVERED },
  };
  for (const t of Object.values(TYPES)) t.gear = gear(t.L, t.bogie);
  // what already stands on the other tracks (where two of them meet at a switch): sample points along each wagon,
  // hashed by 8 m cells (a wagon's own rake, coupled buffer to buffer on its track, does not count)
  const taken = new Map(), cellK = (x, z) => Math.floor(x / 8) + ',' + Math.floor(z / 8);
  const free = (pts, track) => pts.every(([x, z]) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = taken.get((Math.floor(x / 8) + i) + ',' + (Math.floor(z / 8) + j));
      if (l) for (const [px, pz, t] of l) if (t !== track && Math.hypot(px - x, pz - z) < 3.4) return false;
    }
    return true;
  });
  const take = (pts, track) => { for (const [x, z] of pts) { const k = cellK(x, z); if (!taken.has(k)) taken.set(k, []); taken.get(k).push([x, z, track]); } };
  let n = 0;
  for (const rl of GEO.rails) {
    if (rl.main || rl.br || SKIP.has(String(rl.id)) || (rl.svc !== 'siding' && rl.svc !== 'yard')) continue;
    const P = pairs(rl.p), F = frame(P);
    if (F.L < 90) continue;
    let h = 2166136261; for (const ch of String(rl.id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const R = rng(h >>> 0);
    let s = 22 + R() * 30;
    while (s < F.L - 22) {
      const type = R() < 0.72 ? 'tank' : R() < 0.8 ? 'open' : 'covered', T = TYPES[type];
      const main = pick(T.K, R()), count = 3 + Math.floor(R() * 12);
      for (let k = 0; k < count; k++) {
        const len = T.L + 1.2;                                      // (over the buffers)
        if (s + len > F.L - 22) break;
        const a = F.at(s + len / 2 - T.bogie), b = F.at(s + len / 2 + T.bogie);
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, dl = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / dl, uz = (b.z - a.z) / dl;
        const pts = [-0.45, -0.15, 0.15, 0.45].map(f => [cx + ux * f * len, cz + uz * f * len]);
        if (free(pts, rl.id)) {
          take(pts, rl.id);
          const y = (railHeightAt(a.x, a.z) + railHeightAt(b.x, b.z)) / 2 + 0.23;
          const Tm = new THREE.Matrix4().makeRotationY(Math.atan2(ux, uz)).setPosition(cx, y, cz);
          const c = col(R() < 0.7 ? main : pick(T.K, R())), v = 0.85 + R() * 0.3;
          B.geo(mats.body, T.body, Tm, c.map(x => x * v));
          B.geo(mats.gear, T.gear, Tm);
          if (T.floor) B.geo(mats.floor, T.floor, Tm);
          world.addStatic(new world.Box(cx, cz, len / 2, 1.5, Math.atan2(-uz, ux), y - 0.5, y + 4.4, 'train'));
          n++;
        }
        s += len + 0.05;
      }
      s += 12 + R() * 70;
    }
  }
  return n;
}
