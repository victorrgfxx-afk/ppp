import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt, addHole, addHolePoly } from './data.js';
import { Acc } from './bridge.js';
import { M } from '../materials.js';
import { heightToNormalCanvas } from '../textures.js';

// DN1 (E60) at the Cornu roundabout (junction with DJ101R), from the user's Street View screenshots (photos 36-37,
// 45.1398295 N 25.7098525 E); positions measured on aerial imagery (used only for measurements).
//  * OSM puts the south-east arm's carriageways too close together: the lanes towards the roundabout run ~4 m
//    south-west of the mapped line (which follows the lanes and the hatched strip together), the carriageway towards
//    Câmpina ~7 m further out. The road records are moved to the measured cross-section before the roads are built:
//      service road | hedge | red paver sidewalk | hatched strip | 2 lanes | 2.5 m red paver median | Câmpina-bound
//      carriageway | concrete barrier
//  * the roundabout: central island (grass, cobbled apron, chevron board, keep-right sign, striped posts), splitter
//    islands in red pavers with give-way and roundabout signs, lane arrows, give-way line, solar street lamps
//  * the Rompetrol station: the OSM "building" 260455039 there is the canopy (columns, fascia, pumps) + price totem
//  * the restaurant terrace with the DORNA beach flag and spruces, the blank billboard across the road (photo 36)
const ROADS = { a1: '1107093282', a2: '1114850063', merged: '303232143', exit: '1114850061', bypass: '222760564', nwIn: '1114850059', nwOut: '1114850062', neOut: '646363276', neIn: '161450641', slip: '1114850060' };
const CANOPY_ID = '260455039';
const LANES = 7.5;                       // the two lanes towards the roundabout
const CUT = { a: -3.95, merged: -14.45, exit: -12.2, bypass: -17.45 };   // measured offsets from the mapped approach line

const UP = [0, 1, 0];
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const ramp = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const pairs = (f) => { const o = []; for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
const road = (id) => (GEO.roads || []).find(r => r.id === id);
function ctex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// polyline helpers ---------------------------------------------------------------
function line(P) {
  const S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const at = (s) => {
    let i = 0;
    while (i < P.length - 2 && S[i + 1] < s) i++;
    const l = S[i + 1] - S[i] || 1, t = (s - S[i]) / l, ux = (P[i + 1][0] - P[i][0]) / l, uz = (P[i + 1][1] - P[i][1]) / l;
    return { x: P[i][0] + (P[i + 1][0] - P[i][0]) * t, z: P[i][1] + (P[i + 1][1] - P[i][1]) * t, ux, uz, nx: -uz, nz: ux };
  };
  const W = (s, o) => { const q = at(s); return [q.x + q.nx * o, q.z + q.nz * o]; };
  const local = (x, z) => {
    let best = null;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (l * l)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (!best || d < best.d) best = { d, s: S[i] + t * l, o: ((x - ax) * -dz + (z - az) * dx) / l };
    }
    return best;
  };
  return { P, S, L: S[S.length - 1], at, W, local };
}

// ------------------------------------------------------------------ before the roads are built
let REF = null;              // the mapped approach line (OSM), reference for the measured offsets
let REF_CANOPY = null;       // the OSM footprint of the fuel station canopy
export function prepareCornu() {
  const a1 = road(ROADS.a1), a2 = road(ROADS.a2);
  if (!a1 || !a2) return false;
  // the OSM "building" at the fuel station is its canopy: built here instead
  GEO.buildings = GEO.buildings.filter(b => String(b.id) !== CANOPY_ID || (REF_CANOPY = b, false));
  const ref = [...pairs(a1.p), ...pairs(a2.p).slice(1)];
  REF = line(ref);
  // offset (south-west positive = left of the heading towards the roundabout) of a point from the mapped line, along x
  const zRef = (x) => { for (let i = 0; i < ref.length - 1; i++) if (x >= ref[i][0] && x <= ref[i + 1][0]) { const t = (x - ref[i][0]) / (ref[i + 1][0] - ref[i][0]); return ref[i][1] + (ref[i + 1][1] - ref[i][1]) * t; } return x < ref[0][0] ? ref[0][1] : ref[ref.length - 1][1]; };
  // the heading is +x, its left normal is -z: an offset o (right positive) is a z shift of +o
  const move = (r, target, weight, w) => {
    if (!r) return;
    const p = r.p.slice();
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], o = p[i + 1] - zRef(x), k = weight(x);
      p[i + 1] = zRef(x) + o + (target(x) - o) * k;
    }
    r.p = p; if (w) r.w = w;
  };
  const inSE = (x) => ramp(340.4, 366, x);
  move(a1, () => CUT.a, (x) => inSE(x), LANES);
  move(a2, () => CUT.a, (x) => 1 - ramp(478, 512, x), LANES);
  move(road(ROADS.merged), () => CUT.merged, (x) => ramp(339.6, 366, x), 8.5);
  move(road(ROADS.exit), () => CUT.exit, (x) => 1 - ramp(470, 505, x), 4.0);
  move(road(ROADS.bypass), () => CUT.bypass, (x) => 1 - ramp(455, 478, x), 6.5);
  return true;
}

// ------------------------------------------------------------------ materials
let MT = null;
function mats() {
  if (MT) return MT;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const offset = (m, u) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: u });
  const arrow = (kind) => ctex(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#f4f4ef';
    // straight shaft with a head at the top, a curved branch to the left or right
    g.fillRect(w / 2 - 7, 150, 14, 350);
    g.beginPath(); g.moveTo(w / 2, 20); g.lineTo(w / 2 + 34, 150); g.lineTo(w / 2 - 34, 150); g.closePath(); g.fill();
    const s = kind === 'left' ? -1 : 1;
    g.lineWidth = 14; g.strokeStyle = '#f4f4ef';
    g.beginPath(); g.moveTo(w / 2, 380); g.quadraticCurveTo(w / 2 + s * 44, 360, w / 2 + s * 44, 280); g.stroke();
    g.beginPath(); g.moveTo(w / 2 + s * 44, 210); g.lineTo(w / 2 + s * 66, 290); g.lineTo(w / 2 + s * 22, 290); g.closePath(); g.fill();
  });
  const sign = (draw) => ctex(128, 128, draw);
  const yieldT = sign((g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#c8161d'; g.beginPath(); g.moveTo(4, 8); g.lineTo(124, 8); g.lineTo(64, 122); g.closePath(); g.fill();
    g.fillStyle = '#fbfbf8'; g.beginPath(); g.moveTo(24, 20); g.lineTo(104, 20); g.lineTo(64, 98); g.closePath(); g.fill();
  });
  const round = sign((g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#1d5fb4'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 9; g.fillStyle = '#fff';
    for (let k = 0; k < 3; k++) {
      const a = k * 2.094 - 1.2;
      g.beginPath(); g.arc(64, 64, 34, a, a + 1.25); g.stroke();
      const ex = 64 + 34 * Math.cos(a + 1.25), ey = 64 + 34 * Math.sin(a + 1.25), ta = a + 1.25 + Math.PI / 2;
      g.beginPath(); g.moveTo(ex + 14 * Math.cos(ta), ey + 14 * Math.sin(ta)); g.lineTo(ex + 11 * Math.cos(ta - 2.1), ey + 11 * Math.sin(ta - 2.1)); g.lineTo(ex + 11 * Math.cos(ta + 2.1), ey + 11 * Math.sin(ta + 2.1)); g.fill();
    }
  });
  const keepRight = sign((g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#1d5fb4'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 14; g.beginPath(); g.moveTo(40, 40); g.lineTo(80, 80); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(96, 96); g.lineTo(62, 90); g.lineTo(90, 62); g.closePath(); g.fill();
  });
  const chevron = ctex(256, 64, (g, w, h) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h); g.fillStyle = '#d0141c';
    for (let k = 0; k < 4; k++) { const x = 30 + k * 58; g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 26, 8); g.lineTo(x + 48, 32); g.lineTo(x + 26, 56); g.lineTo(x, 56); g.lineTo(x + 22, 32); g.closePath(); g.fill(); }
  });
  const stripes = ctex(16, 64, (g, w, h) => { for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#fbfbf8' : '#d0141c'; g.fillRect(0, k * h / 4, w, h / 4); } }, true);
  const fascia = ctex(1024, 64, (g, w, h) => {
    g.fillStyle = '#f0e6b8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d4262a'; g.fillRect(0, 0, w, 14);
    g.fillStyle = '#d4262a'; g.font = 'bold 34px Arial'; g.textBaseline = 'middle'; g.textAlign = 'center';
    for (const x of [w * 0.25, w * 0.75]) {
      g.beginPath(); g.arc(x - 92, 40, 15, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 92, 40, 7, 0, 7); g.fill(); g.fillStyle = '#d4262a';
      g.fillText('rompetrol', x + 10, 41);
    }
  });
  const totem = ctex(128, 512, (g, w, h) => {
    g.fillStyle = '#f6f6f3'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d4262a'; g.beginPath(); g.arc(64, 70, 42, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 70, 20, 0, 7); g.fill();
    g.fillStyle = '#d4262a'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('rompetrol', 64, 142);
    g.fillStyle = '#222'; g.fillRect(12, 170, 104, 300);
    // price rows (not readable on the screenshot: left without figures)
    for (let k = 0; k < 4; k++) { g.fillStyle = '#3a3a3a'; g.fillRect(20, 190 + k * 72, 88, 50); g.fillStyle = '#ff3b2f'; g.fillRect(58, 222 + k * 72, 44, 4); }
  });
  const dorna = ctex(64, 256, (g, w, h) => {
    g.fillStyle = '#fbfbfb'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2 + 8, h / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = '#2f5aa8'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('DORNA', 0, 0);
    g.restore();
  });
  const hatch = ctex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#f2f2ee'; g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(w * 0.62, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.06); g.lineTo(w * 0.06, h); g.lineTo(0, h); g.closePath(); g.fill(); }, true);
  const foliage = (() => {
    const S = 128, Hh = new Float32Array(S * S);
    let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 360; k++) {
      const cx = rnd() * S, cy = rnd() * S, r = 3 + rnd() * 6;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const d = (dx * dx + dy * dy) / (r * r); if (d > 1) continue;
        const X = ((Math.round(cx + dx) % S) + S) % S, Y = ((Math.round(cy + dy) % S) + S) % S;
        Hh[Y * S + X] = Math.max(Hh[Y * S + X], Math.sqrt(1 - d) * (0.6 + 0.4 * rnd()));
      }
    }
    const map = ctex(S, S, (g) => { const img = g.createImageData(S, S); for (let i = 0; i < S * S; i++) { const v = Hh[i]; img.data[i * 4] = 18 + 40 * v; img.data[i * 4 + 1] = 34 + 70 * v; img.data[i * 4 + 2] = 22 + 34 * v; img.data[i * 4 + 3] = 255; } g.putImageData(img, 0, 0); }, true);
    const nrm = new THREE.CanvasTexture(heightToNormalCanvas(Hh, S, S, 3)); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.colorSpace = THREE.NoColorSpace;
    return { map, nrm };
  })();
  MT = {
    pavers: offset(std({ map: M.pavers.map, normalMap: M.pavers.normalMap, color: 0xc57a68, roughness: 0.9 }), -5),
    cobble: offset(std({ map: M.pavers.map, normalMap: M.pavers.normalMap, color: 0x9d9790, roughness: 0.92 }), -5),
    grass: offset(std({ map: M.grassGround ? M.grassGround.map : null, color: 0x7c9a57, roughness: 1 }), -5),
    asphalt: offset(M.asphalt.clone(), -8),
    hatch: offset(std({ map: hatch, transparent: true, alphaTest: 0.4, roughness: 0.7 }), -10),
    white: offset(std({ color: 0xf2f2ee, roughness: 0.7 }), -10),
    arrowL: offset(std({ map: arrow('left'), transparent: true, alphaTest: 0.4, roughness: 0.7 }), -10),
    arrowR: offset(std({ map: arrow('right'), transparent: true, alphaTest: 0.4, roughness: 0.7 }), -10),
    kerb: M.concrete, concrete: M.concrete, galv: M.galv, black: M.blackMetal,
    yield: std({ map: yieldT, transparent: true, alphaTest: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
    round: std({ map: round, transparent: true, alphaTest: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
    keepRight: std({ map: keepRight, transparent: true, alphaTest: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
    chevron: std({ map: chevron, roughness: 0.5 }), stripes: std({ map: stripes, roughness: 0.5 }),
    panel: std({ color: 0x1b2742, roughness: 0.25, metalness: 0.4 }), led: std({ color: 0x2b2e33, roughness: 0.5, metalness: 0.4 }),
    fascia: std({ map: fascia, roughness: 0.5 }), soffit: std({ color: 0xf3efe2, roughness: 0.6, emissive: 0x302c20 }),
    red: std({ color: 0xd4262a, roughness: 0.5 }), pump: std({ color: 0xf2f2ee, roughness: 0.4, metalness: 0.2 }),
    totem: std({ map: totem, roughness: 0.5 }),
    dorna: std({ map: dorna, roughness: 0.8, side: THREE.DoubleSide }),
    timber: M.woodDark || M.wood, roofShingle: std({ color: 0x5b3b2a, roughness: 0.9 }),
    hedge: std({ map: foliage.map, normalMap: foliage.nrm, roughness: 1 }),
    spruce: std({ map: foliage.map, normalMap: foliage.nrm, color: 0xb8c8c0, roughness: 1 }),
    bark: M.bark,
    billboard: std({ color: 0xf1f1ef, roughness: 0.7 }), billboardBack: std({ color: 0x5a5d61, roughness: 0.6, metalness: 0.4 }),
  };
  MT.grass.color = new THREE.Color(0x86a35e);
  return MT;
}

function cyl(list, x, y0, z, h, r0, r1 = r0, seg = 8) { const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(x, y0 + h / 2, z); list.push(g); }
function tube(list, p, q, r, seg = 6) {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2); list.push(g);
}
function boxAt(list, cx, cy, cz, sx, sy, sz, rotY = 0) { const g = new THREE.BoxGeometry(sx, sy, sz); g.rotateY(rotY); g.translate(cx, cy, cz); list.push(g); }
// a flat sign facing (fx, fz): square plate of size s centred at (x, y, z)
function plate(list, x, y, z, s, fx, fz, h = s) {
  const g = new THREE.PlaneGeometry(s, h); g.rotateY(Math.atan2(fx, fz)); g.translate(x, y, z); list.push(g);
}
const merged = (list) => mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));

// ------------------------------------------------------------------ build
export function buildCornu(B, world) {
  if (!REF) return null;
  const Mt = mats();
  const A = { pav: new Acc(), cob: new Acc(), grass: new Acc(), kerb: new Acc(), asph: new Acc(), hatch: new Acc(), white: new Acc(), arrowL: new Acc(), arrowR: new Acc(), barrier: new Acc() };
  const G = { galv: [], black: [], yield: [], round: [], keepRight: [], chevron: [], stripes: [], panel: [], led: [], fascia: [], soffit: [], red: [], pump: [], totem: [], dorna: [], timber: [], roofShingle: [], hedge: [], spruce: [], bark: [], billboard: [], billboardBack: [], concrete: [] };
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const R = REF;
  const yAt = (x, z) => heightAt(x, z) + 0.035;

  // ---- ring: centre and radius from the roundabout ways
  const ringPts = [];
  for (const r of GEO.roads) if (r.c === 'trunk' && ['1114850058', '1115152819', '1173529473', '1173529474'].includes(r.id)) ringPts.push(...pairs(r.p));
  let cx = 0, cz = 0; for (const p of ringPts) { cx += p[0]; cz += p[1]; } cx /= ringPts.length; cz /= ringPts.length;
  let rr = 0; for (const p of ringPts) rr += Math.hypot(p[0] - cx, p[1] - cz); rr /= ringPts.length;
  const ring = { x: cx, z: cz, r: rr, inner: rr - 4.1, outer: rr + 4.1 };
  const yR = heightAt(cx + rr, cz);

  // strip along the reference line between offsets o0..o1 (right positive), s from sa to sb, at height lift over the road
  const strip = (acc, sa, sb, o0f, o1f, lift, tile = 2.2, step = 2) => {
    for (let s = sa; s < sb - 1e-6; s += step) {
      const s1 = Math.min(sb, s + step);
      const P = [[s, o0f(s)], [s1, o0f(s1)], [s1, o1f(s1)], [s, o1f(s)]].map(([ss, o]) => { const [x, z] = R.W(ss, o); return [x, yAt(x, z) + lift, z]; });
      acc.quad(P[0], P[1], P[2], P[3], UP, P.flatMap(p => [p[0] / tile, p[2] / tile]));
    }
  };
  // vertical kerb face along offset of(s) between heights lift0..lift1, facing side (+1 right / -1 left)
  const kerbFace = (sa, sb, of, lift1, side, step = 2) => {
    for (let s = sa; s < sb - 1e-6; s += step) {
      const s1 = Math.min(sb, s + step), [xa, za] = R.W(s, of(s)), [xb, zb] = R.W(s1, of(s1));
      const ya = yAt(xa, za), yb = yAt(xb, zb), q = R.at(s + step / 2);
      A.kerb.quad([xa, ya - 0.1, za], [xb, yb - 0.1, zb], [xb, yb + lift1, zb], [xa, ya + lift1, za], [q.nx * side, 0, q.nz * side]);
    }
  };
  const sAtX = (x) => { let best = 0, bd = Infinity; for (let s = 0; s <= R.L; s += 0.5) { const q = R.at(s), d = Math.abs(q.x - x); if (d < bd) { bd = d; best = s; } } return best; };
  const inRing = (s, o) => { const [x, z] = R.W(s, o); return Math.hypot(x - ring.x, z - ring.z) < ring.outer + 0.3; };

  // ---- south-east arm: median (red pavers), hatched strip, sidewalk, hedge
  const s366 = sAtX(366), s470 = sAtX(470), s352 = sAtX(352), s500 = sAtX(500), s430 = sAtX(430);
  const exitL = road(ROADS.exit) ? line(pairs(road(ROADS.exit).p)) : null;
  // median: from the nose at x = 366 to the roundabout; near the ring it follows the gap to the exit lane
  const medL = (s) => CUT.a - LANES / 2 - 0.05;              // left edge of the lanes (right edge of the median)
  const medR = (s) => {
    const q = R.at(s);
    if (!exitL || q.x < 470) return CUT.exit + 2.05;
    // gap to the exit lane: offset of the exit lane's inner edge
    const l = exitL.local(q.x, q.z);
    return Math.min(CUT.exit + 2.05, -(l.d - 2.05));
  };
  let sEnd = s366;
  for (let s = s366; s < R.L; s += 1) { if (inRing(s, (medL(s) + medR(s)) / 2)) break; sEnd = s; }
  // the lanes move back to the mapped line near the roundabout: the median's lane side follows them
  const laneShift = (s) => { const x = R.at(s).x; return CUT.a * ramp(340.4, 366, x) * (1 - ramp(478, 512, x)); };
  const mL = (s) => laneShift(s) - LANES / 2 - 0.05, mR = (s) => Math.min(medR(s), mL(s) - 0.6);
  strip(A.pav, s366, sEnd, mR, mL, 0.15);
  kerbFace(s366, sEnd, mL, 0.15, 1); kerbFace(s366, sEnd, mR, 0.15, -1);
  for (const s of [s366, sEnd]) {
    const a = R.W(s, mR(s)), b = R.W(s, mL(s)), q = R.at(s), sg = s === s366 ? -1 : 1;
    A.kerb.quad([a[0], yAt(...a) - 0.1, a[1]], [b[0], yAt(...b) - 0.1, b[1]], [b[0], yAt(...b) + 0.15, b[1]], [a[0], yAt(...a) + 0.15, a[1]], [q.ux * sg, 0, q.uz * sg]);
  }
  for (let s = s366; s < sEnd; s += 12) { const m = Math.min(sEnd, s + 12), [x, z] = R.W((s + m) / 2, (mL(s) + mR(s)) / 2), q = R.at((s + m) / 2); box(x, z, (m - s) / 2, Math.abs(mL(s) - mR(s)) / 2, Math.atan2(-q.uz, q.ux), yAt(x, z) - 1, yAt(x, z) + 0.16, 'kerb'); }
  addHole(R.W((s366 + sEnd) / 2, (mL(s366) + mR(s366)) / 2), (sEnd - s366) / 2 + 2, 4, R.at((s366 + sEnd) / 2).ux, R.at((s366 + sEnd) / 2).uz);
  // hatched strip right of the lanes, sidewalk with a kerb, hedge
  const hR0 = (s) => laneShift(s) + LANES / 2, hR1 = (s) => Math.max(hR0(s) + 0.3, 3.8);
  const sHatchEnd = sAtX(482);
  strip(A.asph, s352, sHatchEnd, hR0, hR1, 0.0, 3.2);
  strip(A.hatch, s352 + 2, sHatchEnd - 2, (s) => hR0(s) + 0.25, (s) => hR1(s) - 0.25, 0.012, 1.4);
  strip(A.white, s352, sHatchEnd, (s) => hR1(s) - 0.25, (s) => hR1(s) - 0.1, 0.014, 4);
  // sidewalk / right island: up to the roundabout, never onto the service road that joins it
  const serv = road('303204279'), SLr = serv ? line(pairs(serv.p)) : null;
  const servEdge = (s) => { if (!SLr) return 99; const [x, z] = R.W(s, 0), l = SLr.local(x, z); return l.d - serv.w / 2 - 0.1; };
  const sw0 = (s) => hR1(s), sw1 = (s) => Math.min(hR1(s) + 2.2, servEdge(s));
  let sIsl = s500;
  for (let s = s352; s < R.L; s += 0.5) { if (inRing(s, (sw0(s) + sw1(s)) / 2) || sw1(s) - sw0(s) < 0.8) break; sIsl = s; }
  strip(A.pav, s352, sIsl, sw0, sw1, 0.15);
  kerbFace(s352, sIsl, sw0, 0.15, -1);
  kerbFace(s352, sIsl, sw1, 0.15, 1);
  for (const s of [s352, sIsl]) {
    const a = R.W(s, sw0(s)), b = R.W(s, sw1(s)), q = R.at(s), sg = s === s352 ? -1 : 1;
    A.kerb.quad([a[0], yAt(...a) - 0.1, a[1]], [b[0], yAt(...b) - 0.1, b[1]], [b[0], yAt(...b) + 0.15, b[1]], [a[0], yAt(...a) + 0.15, a[1]], [q.ux * sg, 0, q.uz * sg]);
  }
  for (let s = s352 + 4, k = 0; s < s430; s += 1.4, k++) {
    const [x, z] = R.W(s, sw1(s) + 0.8), y = heightAt(x, z), q = R.at(s);
    boxAt(G.hedge, x, y + 0.55, z, 1.5, 1.1 + 0.1 * Math.sin(k), 1.1, -Math.atan2(q.uz, q.ux));
  }
  addHole(R.W((s352 + s500) / 2, 4.5), (s500 - s352) / 2 + 2, 4.5, R.at((s352 + s500) / 2).ux, R.at((s352 + s500) / 2).uz);

  // ---- concrete barrier (New Jersey profile) on the outer edge of the Câmpina-bound carriageway
  {
    const prof = [[-0.3, 0], [-0.26, 0.08], [-0.1, 0.33], [-0.08, 0.86], [0.08, 0.86], [0.1, 0.33], [0.26, 0.08], [0.3, 0]];
    const bo = (s) => { const x = R.at(s).x; return x < 393 ? CUT.merged - 4.25 - 0.35 : x < 410 ? CUT.merged - 4.6 + (CUT.exit - 2.0 - 0.35 - CUT.merged + 4.6) * (x - 393) / 17 : CUT.exit - 2.0 - 0.35; };
    const sb0 = sAtX(333), sb1 = sAtX(468);
    for (let s = sb0; s < sb1; s += 2) {
      const s1 = Math.min(sb1, s + 2), qa = R.at(s), qb = R.at(s1);
      for (let k = 0; k < prof.length - 1; k++) {
        const P = [[s, prof[k]], [s1, prof[k]], [s1, prof[k + 1]], [s, prof[k + 1]]].map(([ss, [dq, h]]) => { const [x, z] = R.W(ss, bo(ss) + dq); return [x, heightAt(x, z) + h, z]; });
        const mid = (prof[k][0] + prof[k + 1][0]) / 2, q = R.at(s + 1);
        A.barrier.quad(P[0], P[1], P[2], P[3], [q.nx * Math.sign(mid || 1) * 0.8, 0.5, q.nz * Math.sign(mid || 1) * 0.8], [s / 2.2, prof[k][1], s1 / 2.2, prof[k][1], s1 / 2.2, prof[k + 1][1], s / 2.2, prof[k + 1][1]]);
      }
      void qa; void qb;
    }
    for (let s = sb0; s < sb1; s += 10) { const m = Math.min(sb1, s + 10), [x, z] = R.W((s + m) / 2, bo((s + m) / 2)), q = R.at((s + m) / 2); box(x, z, (m - s) / 2 + 0.2, 0.32, Math.atan2(-q.uz, q.ux), heightAt(x, z) - 0.5, heightAt(x, z) + 0.86, 'barrier'); }
  }

  // ---- roundabout: central island (grass mound, cobbled apron), chevron board, keep-right sign, striped posts
  {
    const NT = 48, rG = ring.inner - 2.2;
    for (let k = 0; k < NT; k++) {
      const a0 = k / NT * Math.PI * 2, a1 = (k + 1) / NT * Math.PI * 2;
      const P = (r, a, lift) => { const x = ring.x + Math.cos(a) * r, z = ring.z + Math.sin(a) * r; return [x, yAt(x, z) + lift, z]; };
      A.cob.quad(P(rG, a0, 0.12), P(rG, a1, 0.12), P(ring.inner, a1, 0.12), P(ring.inner, a0, 0.12), UP);
      A.kerb.quad(P(ring.inner, a0, -0.1), P(ring.inner, a1, -0.1), P(ring.inner, a1, 0.12), P(ring.inner, a0, 0.12), [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
      A.kerb.quad(P(rG, a0, 0.1), P(rG, a1, 0.1), P(rG, a1, 0.32), P(rG, a0, 0.32), [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
      for (let ri = 0; ri < 4; ri++) {
        const r0 = rG * ri / 4, r1 = rG * (ri + 1) / 4, mound = (r) => 0.32 + 0.35 * (1 - (r / rG) ** 2);
        A.grass.quad(P(r0, a0, mound(r0)), P(r1, a0, mound(r1)), P(r1, a1, mound(r1)), P(r0, a1, mound(r0)), UP);
      }
    }
    addHole([ring.x, ring.z], ring.inner, ring.inner, 1, 0, { lawn: true });
    box(ring.x, ring.z, ring.inner * 0.7, ring.inner * 0.7, 0, yR - 1, yR + 1.2, 'island');
    box(ring.x, ring.z, ring.inner * 0.7, ring.inner * 0.7, Math.PI / 4, yR - 1, yR + 1.2, 'island');
    // facing the south-east approach
    const [ax, az] = R.W(sAtX(495), laneShift(sAtX(495)));
    let fx = ax - ring.x, fz = az - ring.z; const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
    const bx = ring.x + fx * (rG - 0.8), bz = ring.z + fz * (rG - 0.8), by = heightAt(bx, bz) + 0.5, rx = -fz, rz = fx;
    plate(G.chevron, bx, by + 0.75, bz, 2.2, fx, fz, 0.55);
    for (const e of [-0.8, 0.8]) cyl(G.galv, bx + rx * e - fx * 0.05, by - 0.3, bz + rz * e - fz * 0.05, 1.3, 0.035);
    plate(G.keepRight, bx + rx * 1.8, by + 1.05, bz + rz * 1.8, 0.6, fx, fz);
    cyl(G.galv, bx + rx * 1.8 - fx * 0.04, by - 0.3, bz + rz * 1.8 - fz * 0.04, 1.35, 0.03);
    for (const e of [-1.7, 1.2]) cyl(G.stripes, bx + rx * e + fx * 0.3, by - 0.3, bz + rz * e + fz * 0.3, 1.5, 0.07, 0.07, 10);
  }

  // ---- signs at the south-east entry: give way + roundabout ahead, on the median nose and on the right island
  const signPost = (x, z, fx, fz, extra) => {
    const y = heightAt(x, z) + 0.15;
    cyl(G.galv, x, y - 0.4, z, 2.95, 0.035);
    plate(G.yield, x + fx * 0.04, y + 2.5, z + fz * 0.04, 0.9, fx, fz);
    plate(G.round, x + fx * 0.04, y + 1.75, z + fz * 0.04, 0.6, fx, fz);
    if (extra) { plate(G.keepRight, x + fx * 0.04, y + 1.05, z + fz * 0.04, 0.5, fx, fz); cyl(G.stripes, x - fx * 0.6, y, z - fz * 0.6, 1.1, 0.06, 0.06, 10); }
    box(x, z, 0.1, 0.1, 0, y - 1, y + 3, 'sign');
  };
  {
    const q = R.at(sEnd - 1.5), f = [-q.ux, -q.uz];
    const [lx, lz] = R.W(sEnd - 1.5, (mL(sEnd - 1.5) + mR(sEnd - 1.5)) / 2);
    signPost(lx, lz, f[0], f[1], true);
    const [px, pz] = R.W(sIsl - 1.2, (sw0(sIsl - 1.2) + sw1(sIsl - 1.2)) / 2);
    signPost(px, pz, f[0], f[1], false);
  }

  // ---- lane arrows ~13 m before the ring (photo 37) and the give-way line
  {
    let sGive = sEnd;
    for (let s = sEnd; s < R.L; s += 0.25) if (inRing(s, laneShift(s) - 1.8)) { sGive = s; break; }
    const sa = sGive - 13, q = R.at(sa);
    for (const [acc, dq] of [[A.arrowL, -LANES / 4], [A.arrowR, LANES / 4]]) {
      const c = laneShift(sa) + dq, P = [[sa - 2.5, c - 0.6], [sa + 2.5, c - 0.6], [sa + 2.5, c + 0.6], [sa - 2.5, c + 0.6]].map(([s, o]) => { const [x, z] = R.W(s, o); return [x, yAt(x, z) + 0.02, z]; });
      acc.quad(P[0], P[1], P[2], P[3], UP, [0, 0, 0, 1, 1, 1, 1, 0]);
    }
    void q;
    for (let o = -LANES / 2 + 0.3; o < LANES / 2 - 0.3; o += 0.9) {
      const P = [[sGive - 0.5, laneShift(sGive) + o], [sGive, laneShift(sGive) + o], [sGive, laneShift(sGive) + o + 0.45], [sGive - 0.5, laneShift(sGive) + o + 0.45]].map(([s, oo]) => { const [x, z] = R.W(s, oo); return [x, yAt(x, z) + 0.02, z]; });
      A.white.quad(P[0], P[1], P[2], P[3], UP);
    }
  }

  // ---- other splitter islands (DJ101R, DN1 north-west): red pavers between the entry and the exit of each arm
  const island = (idA, idB, maxD) => {
    const ra = road(idA), rb = road(idB);
    if (!ra || !rb) return;
    const La = line(pairs(ra.p)), Lb = line(pairs(rb.p)), wa = ra.w / 2, wb = rb.w / 2;
    const rows = [];
    for (let s = 0; s <= La.L; s += 1) {
      const q = La.at(s);
      const dr = Math.hypot(q.x - ring.x, q.z - ring.z);
      if (dr > maxD || dr < ring.outer + 0.6) { rows.push(null); continue; }
      const l = Lb.local(q.x, q.z), side = Math.sign(l.o) || 1;
      // Lb.local gives the offset of q from Lb; the island lies between A's edge towards B and B's edge towards A
      const gap = l.d - wa - wb;
      if (gap < 0.6 || gap > 14) { rows.push(null); continue; }
      void side;
      // direction from q to B: nearest point on B
      const pb = (() => { let best = null; for (let i = 0; i < Lb.P.length - 1; i++) { const [ax, az] = Lb.P[i], [bx, bz] = Lb.P[i + 1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.z - az) * dz) / (dx * dx + dz * dz || 1))), x = ax + dx * t, z = az + dz * t, d = Math.hypot(q.x - x, q.z - z); if (!best || d < best[2]) best = [x, z, d]; } return best; })();
      const ux = (pb[0] - q.x) / pb[2], uz = (pb[1] - q.z) / pb[2];
      rows.push([[q.x + ux * (wa + 0.05), q.z + uz * (wa + 0.05)], [pb[0] - ux * (wb + 0.05), pb[1] - uz * (wb + 0.05)]]);
    }
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        for (let i = 0; i < run.length - 1; i++) {
          const [a0, a1] = run[i], [b0, b1] = run[i + 1];
          const P = [a0, b0, b1, a1].map(([x, z]) => [x, yAt(x, z) + 0.15, z]);
          A.pav.quad(P[0], P[1], P[2], P[3], UP, P.flatMap(p => [p[0] / 2.2, p[2] / 2.2]));
          for (const [p, q2] of [[a0, b0], [a1, b1]]) A.kerb.quad([p[0], yAt(...p) - 0.1, p[1]], [q2[0], yAt(...q2) - 0.1, q2[1]], [q2[0], yAt(...q2) + 0.15, q2[1]], [p[0], yAt(...p) + 0.15, p[1]], [p[0] - (a0[0] + a1[0]) / 2, 0, p[1] - (a0[1] + a1[1]) / 2]);
        }
        addHolePoly([...run.map(r => r[0]), ...run.slice().reverse().map(r => r[1])], {});
        // give-way + roundabout sign at the end nearest to the ring
        const end = run.reduce((b, r) => { const c = [(r[0][0] + r[1][0]) / 2, (r[0][1] + r[1][1]) / 2]; const d = Math.hypot(c[0] - ring.x, c[1] - ring.z); return !b || d < b[2] ? [c[0], c[1], d] : b; }, null);
        if (end) { const fx = (end[0] - ring.x) / end[2], fz = (end[1] - ring.z) / end[2]; signPost(end[0] + fx * 1.2, end[1] + fz * 1.2, fx, fz, true); }
      }
      run = [];
    };
    for (const r of rows) { if (r) run.push(r); else flush(); }
    flush();
  };
  island(ROADS.neOut, ROADS.neIn, 45);
  island(ROADS.nwOut, ROADS.nwIn, 60);

  // ---- solar street lamps (photo 37): on the median, the right island and around the ring
  const solar = (x, z, facing) => {
    const y = heightAt(x, z) + 0.15;
    cyl(G.galv, x, y, z, 7.6, 0.09, 0.055, 8);
    const g = new THREE.BoxGeometry(1.25, 0.05, 0.75); g.rotateX(-0.6); g.rotateY(Math.atan2(facing[0], facing[1])); g.translate(x, y + 7.95, z); G.panel.push(g);
    tube(G.galv, [x, y + 7.3, z], [x + facing[0] * 1.1, y + 7.45, z + facing[1] * 1.1], 0.035);
    const h = new THREE.BoxGeometry(0.55, 0.1, 0.25); h.rotateY(-Math.atan2(facing[1], facing[0])); h.translate(x + facing[0] * 1.3, y + 7.42, z + facing[1] * 1.3); G.led.push(h);
    box(x, z, 0.14, 0.14, 0, y - 1, y + 7.6, 'pole');
  };
  {
    for (const X of [452, 488]) { const s = sAtX(X), q = R.at(s), [x, z] = R.W(s, (mL(s) + mR(s)) / 2); solar(x, z, [q.nx, q.nz]); }
    for (const a of [0.9, 2.4, 3.6, 5.2]) {
      const x = ring.x + Math.cos(a) * (ring.outer + 1.8), z = ring.z + Math.sin(a) * (ring.outer + 1.8);
      solar(x, z, [-Math.cos(a), -Math.sin(a)]);
    }
  }

  // ---- Rompetrol: canopy on four columns over the mapped footprint, two pump islands, price totem
  let station = null;
  if (REF_CANOPY) {
    const p = pairs(REF_CANOPY.p);
    const ctr = p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
    // long axis
    let best = null;
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!best || l > best[2]) best = [(b[0] - a[0]) / l, (b[1] - a[1]) / l, l]; }
    const u = [best[0], best[1]], v = [-u[1], u[0]];
    let a = 0, b = 0; for (const q of p) { a = Math.max(a, Math.abs((q[0] - ctr[0]) * u[0] + (q[1] - ctr[1]) * u[1])); b = Math.max(b, Math.abs((q[0] - ctr[0]) * v[0] + (q[1] - ctr[1]) * v[1])); }
    a += 1.5; b += 1.5;
    const W = (lu, lv) => [ctr[0] + u[0] * lu + v[0] * lv, ctr[1] + u[1] * lu + v[1] * lv];
    const y0 = Math.min(...p.map(q => heightAt(q[0], q[1]))) + 0.05, top = y0 + 5.6, fh = 0.85;
    const C = [W(-a, -b), W(a, -b), W(a, b), W(-a, b)];
    const acc = { fascia: new Acc(), soffit: new Acc(), roof: new Acc() };
    for (let k = 0; k < 4; k++) {
      const [x0, z0] = C[k], [x1, z1] = C[(k + 1) % 4], nx = (x0 + x1) / 2 - ctr[0], nz = (z0 + z1) / 2 - ctr[1];
      // seen from outside the text runs along (nz, -nx): flip u when the side runs the other way
      const fwd = (x1 - x0) * nz - (z1 - z0) * nx > 0, u0 = fwd ? 0 : 1, u1 = 1 - u0;
      acc.fascia.quad([x0, top - fh, z0], [x1, top - fh, z1], [x1, top, z1], [x0, top, z0], [nx, 0, nz], [u0, 0, u1, 0, u1, 1, u0, 1]);
    }
    acc.soffit.quad([C[0][0], top - fh, C[0][1]], [C[1][0], top - fh, C[1][1]], [C[2][0], top - fh, C[2][1]], [C[3][0], top - fh, C[3][1]], [0, -1, 0]);
    acc.roof.quad([C[0][0], top, C[0][1]], [C[1][0], top, C[1][1]], [C[2][0], top, C[2][1]], [C[3][0], top, C[3][1]], UP);
    acc.fascia.flush(B, Mt.fascia); acc.soffit.flush(B, Mt.soffit); acc.roof.flush(B, Mt.pump);
    for (const [lu, lv] of [[-a + 2.2, -b + 2], [a - 2.2, -b + 2], [a - 2.2, b - 2], [-a + 2.2, b - 2]]) {
      const [x, z] = W(lu, lv); boxAt(G.red, x, (y0 + top - fh) / 2, z, 0.4, top - fh - y0, 0.4, -Math.atan2(u[1], u[0]));
      box(x, z, 0.25, 0.25, 0, y0 - 1, top, 'column');
    }
    for (const lu of [-a / 2.4, a / 2.4]) {
      const [x, z] = W(lu, 0), rot = -Math.atan2(u[1], u[0]);
      boxAt(G.concrete, x, y0 + 0.1, z, 1.2, 0.2, 4.2, rot);
      for (const lv of [-1.1, 1.1]) { const [px, pz] = W(lu, lv); boxAt(G.pump, px, y0 + 1.1, pz, 0.8, 1.8, 0.45, rot); boxAt(G.red, px, y0 + 1.75, pz, 0.82, 0.35, 0.47, rot); }
      box(x, z, 0.7, 2.2, Math.atan2(-u[1], u[0]), y0 - 1, y0 + 2, 'pump');
    }
    // totem at the corner nearest to the roundabout
    const corner = C.reduce((bst, q) => !bst || Math.hypot(q[0] - ring.x, q[1] - ring.z) < Math.hypot(bst[0] - ring.x, bst[1] - ring.z) ? q : bst, null);
    const tx = corner[0] + (corner[0] - ctr[0]) * 0.25, tz = corner[1] + (corner[1] - ctr[1]) * 0.25, ty = heightAt(tx, tz);
    const fx = ring.x - tx, fz = ring.z - tz, fl = Math.hypot(fx, fz);
    const tg = new THREE.BoxGeometry(1.5, 6.8, 0.4); tg.rotateY(Math.atan2(fx / fl, fz / fl)); tg.translate(tx, ty + 3.4, tz); G.totem.push(tg);
    box(tx, tz, 0.8, 0.8, 0, ty - 1, ty + 7, 'totem');
    addHolePoly(C, { noFences: true });
    station = { x: ctr[0], z: ctr[1] };
  }

  // ---- restaurant terrace with the DORNA flag and spruces by the service road (photo 36), billboard across the road
  {
    const s = sAtX(398);
    // flag behind the sidewalk
    const [fx, fz] = R.W(s, sw1(s) + 0.6), fy = heightAt(fx, fz);
    cyl(G.black, fx, fy, fz, 3.7, 0.025);
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(0, 3.0); shape.quadraticCurveTo(0.55, 3.35, 0.8, 2.6); shape.quadraticCurveTo(0.95, 1.2, 0.55, 0.35); shape.lineTo(0, 0);
    const fg = new THREE.ShapeGeometry(shape, 10); const q = R.at(s);
    // UVs over the flag's own box
    const uv = fg.attributes.uv, ps = fg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getX(i) / 0.95, ps.getY(i) / 3.35);
    fg.rotateY(Math.atan2(-q.ux, -q.uz) + 0.45); fg.translate(fx, fy + 0.6, fz); G.dorna.push(fg);       // turned to the oncoming traffic
    // small arrow sign at its foot
    plate(G.keepRight, fx + q.ux * 0.6, fy + 0.4, fz + q.uz * 0.6, 0.35, -q.ux, -q.uz);
    // terrace: timber pergola with a shingle roof, 12 x 5 m, across the service road
    const serv = road('303204279');
    if (serv) {
      const SL = line(pairs(serv.p));
      const l = SL.local(fx, fz);
      for (let k = 0; k < 5; k++) {
        const [px, pz] = SL.W(l.s - 6 + k * 3, 4.2), [qx, qz] = SL.W(l.s - 6 + k * 3, 9.2), py = heightAt(px, pz), qy = heightAt(qx, qz);
        boxAt(G.timber, px, py + 1.3, pz, 0.18, 2.6, 0.18); boxAt(G.timber, qx, qy + 1.3, qz, 0.18, 2.6, 0.18);
      }
      const T = [SL.W(l.s - 6.4, 3.9), SL.W(l.s + 6.4, 3.9), SL.W(l.s + 6.4, 9.5), SL.W(l.s - 6.4, 9.5)];
      const yT = heightAt(...T[0]) + 2.6;
      const roof = new Acc();
      roof.quad([T[0][0], yT, T[0][1]], [T[1][0], yT, T[1][1]], [T[2][0], yT + 0.6, T[2][1]], [T[3][0], yT + 0.6, T[3][1]], UP);
      roof.quad([T[0][0], yT, T[0][1]], [T[1][0], yT, T[1][1]], [T[2][0], yT + 0.6, T[2][1]], [T[3][0], yT + 0.6, T[3][1]], [0, -1, 0]);
      roof.flush(B, Mt.roofShingle);
      // tables and benches
      for (let k = 0; k < 3; k++) { const [x, z] = SL.W(l.s - 4 + k * 4, 6.7), y = heightAt(x, z); boxAt(G.timber, x, y + 0.72, z, 1.6, 0.06, 0.8); boxAt(G.timber, x, y + 0.36, z, 0.1, 0.72, 0.1); }
      // spruces behind
      for (let k = 0; k < 4; k++) {
        const [x, z] = SL.W(l.s - 8 + k * 5.5, 12.5 + 2 * (k % 2)), y = heightAt(x, z), H = 13 + 3 * (k % 3);
        cyl(G.bark, x, y, z, H * 0.3, 0.25, 0.18, 6);
        for (let t = 0; t < 6; t++) { const h0 = H * (0.18 + t * 0.13), r = 2.6 * (1 - t / 6.5); const c = new THREE.ConeGeometry(r, H * 0.28, 10); c.translate(x, y + h0 + H * 0.14, z); G.spruce.push(c); }
        box(x, z, 0.3, 0.3, 0, y - 1, y + 5, 'tree');
      }
      addHole(SL.W(l.s, 9), 12, 7, SL.at(l.s).ux, SL.at(l.s).uz, { scatter: true });
    }
    // billboard: single pole, blank panel facing the traffic towards the roundabout
    const sb = sAtX(412), [bx, bz] = R.W(sb, CUT.merged - 16), by = heightAt(bx, bz), qb = R.at(sb);
    cyl(G.billboardBack, bx, by - 0.5, bz, 10.5, 0.32, 0.26, 12);
    const panel = new THREE.BoxGeometry(7.5, 2.9, 0.35); panel.rotateY(Math.atan2(-qb.ux, -qb.uz) + 0.35); panel.translate(bx, by + 10.6, bz); G.billboard.push(panel);
    box(bx, bz, 0.4, 0.4, 0, by - 1, by + 12, 'billboard');
  }

  // ---- flush
  A.pav.flush(B, Mt.pavers, null, { noCast: true }); A.cob.flush(B, Mt.cobble, null, { noCast: true }); A.grass.flush(B, Mt.grass, null, { noCast: true });
  A.kerb.flush(B, Mt.kerb); A.asph.flush(B, Mt.asphalt, null, { noCast: true }); A.hatch.flush(B, Mt.hatch, null, { noCast: true }); A.white.flush(B, Mt.white, null, { noCast: true });
  A.arrowL.flush(B, Mt.arrowL, null, { noCast: true }); A.arrowR.flush(B, Mt.arrowR, null, { noCast: true }); A.barrier.flush(B, Mt.concrete);
  const put = (key, mat, opts) => { if (G[key].length) B.geo(mat, merged(G[key]), null, null, opts); };
  for (const [k, m] of [['galv', Mt.galv], ['black', Mt.black], ['yield', Mt.yield], ['round', Mt.round], ['keepRight', Mt.keepRight], ['chevron', Mt.chevron], ['stripes', Mt.stripes], ['panel', Mt.panel], ['led', Mt.led], ['red', Mt.red], ['pump', Mt.pump], ['totem', Mt.totem], ['dorna', Mt.dorna], ['timber', Mt.timber], ['hedge', Mt.hedge], ['spruce', Mt.spruce], ['bark', Mt.bark], ['billboard', Mt.billboard], ['billboardBack', Mt.billboardBack], ['concrete', Mt.concrete]]) put(k, m);

  // walkable raised surfaces: median and sidewalk (+0.15)
  const surface = (x, z) => {
    const l = R.local(x, z);
    if (!l || l.d > 30) return null;
    if (l.s >= s366 && l.s <= sEnd && l.o <= mL(l.s) && l.o >= mR(l.s)) return yAt(x, z) + 0.15;
    if (l.s >= s352 && l.s <= sIsl && l.o >= sw0(l.s) && l.o <= sw1(l.s)) return yAt(x, z) + 0.15;
    return null;
  };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of R.P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const lane = (s, o) => R.W(s, laneShift(s) + o);
  return { type: 'cornu', name: 'Sensul giratoriu Cornu (DN1)', ring, station, surface, bbox: { x0: x0 - 30, x1: x1 + 30, z0: z0 - 30, z1: z1 + 30 }, lane, sAtX, R };
}
