import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt, addHolePoly, inPoly } from './data.js';
import { Acc } from './bridge.js';
import { M } from '../materials.js';
import { heightToNormalCanvas } from '../textures.js';

// The Etu Oil & Gas station on DN1 (E60) at Cornu de Jos (plus code 4MXW+GH3, 45.14876 N 25.69642 E), from the user's
// Street View screenshots (photos 38-39, November 2023); layout from OSM and aerial imagery (measurements only).
//  * OSM tags each one-way carriageway of DN1 here with 4 lanes (15 m): they overlap. Each is 2 lanes (7.6 m) on the
//    screenshots, with a concrete New Jersey barrier with red reflectors between them.
//  * the grass island between the two entries, kerbed, with the price totem (the prices read on photo 38), clipped
//    shrubs and the mandatory-direction signs at its nose; the paved forecourt
//  * the canopy (the OSM "building" 431488192): white fascia with a red band and Etu boxes, columns, pump islands, the
//    shop under its far side; the round glass pavilion of ETU Pizza & Grill; the white office building with blue bands
//  * the asphalt deceleration lane along DN1 with its arrow, the forecourt entry branching off it (OSM starts both
//    entries on DN1's axis); the 80 km/h sign where photo 38 shows it (the OSM node sits on a joint of the ways)
//  * no forest on the compound traced on the aerial imagery; a row of spruces by the office (photos 38, 39)
const DN1 = { north: ['311809242', '1138002356'], south: ['1107424502'], narrow: ['311809242', '1138002356', '1107424502', '1107424500', '319009065'] };
const ENTRY = '210756586', INNER = '431488065', SOUTH_IN = '431488063', LOOP = '431488062', NORTH = '210756552';
const FORECOURT_DROP = ['431488064', '1087138104', '1087138105'];
const CANOPY_ID = '431488192', PAVILION_ID = '866898083', OFFICE_ID = '289350135';
const SIGN80 = [1942.5, 405.0];
const COMPOUND = [[2028.3, 481.5], [1971.8, 545.9], [1945.3, 573.2], [1911.3, 568.2], [1869.6, 523.7], [1843.3, 496.5], [1854.4, 472.3], [1855.7, 459.8], [1883.8, 423.1], [1916.2, 402.4], [1929.7, 401.6], [1969.7, 433.5], [2002.9, 454.6]];
const MEADOW = [[1923.9, 398.4], [1883.0, 422.2], [1853.8, 460.3], [1835.8, 457.9], [1805.1, 417.6], [1828.9, 362.2], [1848.0, 339.4], [1890.9, 374.3]];
const PRICES = [['DIESEL', '7.58', '#3a3a3a'], ['SUPER\nDIESEL', '8.09', '#3a3a3a'], ['Benzina\nStandard', '6.95', '#2c5fb8'], ['TOP\nPremium', '7.50', '#2c5fb8'], ['GPL Auto', '3.60', '#e9e9e4']];

const UP = [0, 1, 0];
const pairs = (f) => { const o = []; for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
const road = (id) => (GEO.roads || []).find(r => r.id === id);
function ctex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const merged = (list) => mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
function cyl(list, x, y0, z, h, r0, r1 = r0, seg = 8) { const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(x, y0 + h / 2, z); list.push(g); }
function boxAt(list, cx, cy, cz, sx, sy, sz, rotY = 0) { const g = new THREE.BoxGeometry(sx, sy, sz); g.rotateY(rotY); g.translate(cx, cy, cz); list.push(g); }
function plate(list, x, y, z, s, fx, fz, h = s) { const g = new THREE.PlaneGeometry(s, h); g.rotateY(Math.atan2(fx, fz)); g.translate(x, y, z); list.push(g); }
// polygon draped on the terrain (split until edges < maxEdge)
function drape(acc, P, lift, maxEdge = 3, tile = 2.2) {
  const faces = THREE.ShapeUtils.triangulateShape(P.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const emit = (a, b, c) => {
    const l = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
    if (l > maxEdge) { const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]; emit(a, ab, ca); emit(ab, b, bc); emit(ca, bc, c); emit(ab, bc, ca); return; }
    const V = [a, b, c].map(([x, z]) => [x, heightAt(x, z) + lift, z]);
    acc.quad(V[0], V[1], V[2], V[0], UP, [a[0] / tile, a[1] / tile, b[0] / tile, b[1] / tile, c[0] / tile, c[1] / tile, a[0] / tile, a[1] / tile]);
  };
  for (const [i, j, k] of faces) emit(P[i], P[j], P[k]);
}
// polyline offset towards a point (the side is chosen per vertex)
function offsetToward(P, d, cx, cz) {
  return P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
    if ((cx - p[0]) * nx + (cz - p[1]) * nz < 0) { nx = -nx; nz = -nz; }
    return [p[0] + nx * d, p[1] + nz * d];
  });
}

// ------------------------------------------------------------------ before the roads and buildings are built
const STORE = {};
export function prepareEtu() {
  if (!road(ENTRY)) return false;
  for (const id of DN1.narrow) { const r = road(id); if (r) r.w = 7.6; }
  GEO.roads = GEO.roads.filter(r => !FORECOURT_DROP.includes(r.id));
  // OSM draws both entries as service roads leaving DN1's axis (the northern one tagged concrete). In the photos one
  // asphalt deceleration lane runs along the carriageway's edge; the forecourt entry branches off it before the
  // island's nose. Frame: origin where the northern entry leaves DN1, u along DN1, r towards the station.
  const en = road(ENTRY), si = road(SOUTH_IN), dn = road(DN1.north[0]);
  if (en && dn) {
    const E0 = pairs(en.p), D = pairs(dn.p);
    let bi = 1, bd = Infinity; for (let i = 1; i < D.length; i++) { const d = Math.hypot(D[i][0] - E0[0][0], D[i][1] - E0[0][1]); if (d < bd) { bd = d; bi = i; } }
    const a2 = D[bi - 1], b2 = D[bi], l = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]), u = [(b2[0] - a2[0]) / l, (b2[1] - a2[1]) / l];
    let r = [-u[1], u[0]]; if ((E0[3][0] - E0[0][0]) * r[0] + (E0[3][1] - E0[0][1]) * r[1] < 0) r = [-r[0], -r[1]];
    const o = E0[0], F = (s0, t) => [o[0] + u[0] * s0 + r[0] * t, o[1] + u[1] * s0 + r[1] * t];
    const lat = dn.w / 2 + 1.6;                                     // lane centre: 3.6 m lane, 0.2 m under the edge line
    STORE.E0 = E0; STORE.frame = { o, u, r, lat };
    en.s = 'asphalt'; en.w = 3.6;
    en.p = [F(-44, lat), F(-28, lat), F(0, lat), F(12.6, lat), ...E0.slice(2)].flat();
    if (si) {
      const S0 = pairs(si.p);
      si.w = 3.6; si.p = [F(-18, lat), F(-11.5, lat + 2), ...S0.slice(3)].flat();
    }
  }
  GEO.buildings = GEO.buildings.filter(b => {
    const id = String(b.id);
    if (id === CANOPY_ID) { STORE.canopy = b; return false; }
    if (id === PAVILION_ID) { STORE.pavilion = b; return false; }
    if (id === OFFICE_ID) {
      // three storeys, white; the 25 m DEM puts an 8 m slope under the flat lot: the floor follows the low side
      b.o = { ...(b.o || {}), wall: 'stuccoWhite', levels: 3 };
      b.y1 = b.y0 + 0.6; b.lv = 3; STORE.office = b;
    }
    return true;
  });
  return true;
}

// ------------------------------------------------------------------ materials
let MT = null;
function mats() {
  if (MT) return MT;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const offset = (m, u) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: u });
  const logo = (g, x, y, s) => {
    g.fillStyle = '#c9312f'; g.fillRect(x, y, s, s);
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(s * 0.5)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Etu', x + s / 2, y + s * 0.44);
    g.font = `bold ${Math.round(s * 0.13)}px Arial`; g.fillText('Oil&Gas', x + s / 2, y + s * 0.8);
  };
  const totem = ctex(256, 1024, (g, w, h) => {
    g.fillStyle = '#f1f1ee'; g.fillRect(0, 0, w, h);
    logo(g, 18, 20, 220);
    PRICES.forEach(([name, price, colr], k) => {
      const y = 262 + k * 104;
      g.fillStyle = '#e8e8e4'; g.fillRect(14, y, 228, 92);
      g.fillStyle = colr; g.fillRect(22, y + 12, 120, 68);
      g.fillStyle = colr === '#e9e9e4' ? '#333' : '#fff'; g.font = 'bold 21px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const ls = name.split('\n'); ls.forEach((t, i) => g.fillText(t, 82, y + 46 + (i - (ls.length - 1) / 2) * 22));
      g.fillStyle = '#2a0c0c'; g.fillRect(146, y + 12, 90, 68);
      g.fillStyle = '#ff4a38'; g.font = 'bold 44px Courier New'; g.fillText(price, 191, y + 48);
    });
    const y = 262 + 5 * 104;
    g.fillStyle = '#e8e8e4'; g.fillRect(14, y, 228, 70); g.fillStyle = '#2c5fb8'; g.fillRect(22, y + 10, 212, 50);
    g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; ['P', '☕', '⛽', '🚿'].forEach((t, i) => { g.fillRect(28 + i * 52, y + 14, 44, 42); g.fillStyle = '#2c5fb8'; g.fillText(t, 50 + i * 52, y + 36); g.fillStyle = '#fff'; });
  });
  const fascia = ctex(1024, 64, (g, w, h) => {
    g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d02d2d'; g.fillRect(0, 26, w, 12);
    logo(g, w - 70, 4, 56); logo(g, 14, 4, 56);
  });
  const glass = ctex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6f8494'); gr.addColorStop(1, '#27323b');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d7d9da'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 5, h); g.fillRect(0, 0, w, 6); g.fillRect(0, h * 0.72, w, 4);
  }, true);
  const shopFront = ctex(512, 128, (g, w, h) => {
    g.fillStyle = '#e9e9e6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9312f'; g.fillRect(0, 10, w, 14);
    const gr = g.createLinearGradient(0, 30, 0, h); gr.addColorStop(0, '#5d6d78'); gr.addColorStop(1, '#232b31');
    g.fillStyle = gr; g.fillRect(0, 32, w, h - 32);
    g.fillStyle = '#c9312f'; for (let x = 0; x < w; x += 85) g.fillRect(x, 32, 6, h - 32);
    logo(g, w / 2 - 22, 36, 44);
  }, true);
  const arrowR = ctex(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#f4f4ef'; g.strokeStyle = '#f4f4ef'; g.lineWidth = 14;
    g.beginPath(); g.moveTo(w / 2 - 20, 500); g.lineTo(w / 2 - 20, 240); g.quadraticCurveTo(w / 2 - 20, 160, w / 2 + 20, 130); g.stroke();
    g.beginPath(); g.moveTo(w / 2 + 50, 100); g.lineTo(w / 2 + 6, 104); g.lineTo(w / 2 + 34, 156); g.closePath(); g.fill();
  });
  const sign = (draw) => ctex(128, 128, draw);
  const ahead = sign((g) => { g.clearRect(0, 0, 128, 128); g.fillStyle = '#1d5fb4'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(56, 44, 16, 56); g.beginPath(); g.moveTo(64, 18); g.lineTo(90, 50); g.lineTo(38, 50); g.closePath(); g.fill(); });
  const keepRight = sign((g) => { g.clearRect(0, 0, 128, 128); g.fillStyle = '#1d5fb4'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 14; g.beginPath(); g.moveTo(40, 40); g.lineTo(80, 80); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(96, 96); g.lineTo(62, 90); g.lineTo(90, 62); g.closePath(); g.fill(); });
  const limit80 = sign((g) => { g.clearRect(0, 0, 128, 128); g.fillStyle = '#c8161d'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#fbfbf8'; g.beginPath(); g.arc(64, 64, 48, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = 'bold 50px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('80', 64, 68); });
  const foliage = (() => {
    const S = 128, Hh = new Float32Array(S * S);
    let seed = 21; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 500; k++) { const cx = rnd() * S, cy = rnd() * S, r = 2 + rnd() * 5; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const d = (dx * dx + dy * dy) / (r * r); if (d > 1) continue; const X = ((Math.round(cx + dx) % S) + S) % S, Y = ((Math.round(cy + dy) % S) + S) % S; Hh[Y * S + X] = Math.max(Hh[Y * S + X], Math.sqrt(1 - d)); } }
    const map = ctex(S, S, (g) => { const img = g.createImageData(S, S); for (let i = 0; i < S * S; i++) { const v = Hh[i]; img.data[i * 4] = 30 + 48 * v; img.data[i * 4 + 1] = 58 + 80 * v; img.data[i * 4 + 2] = 26 + 34 * v; img.data[i * 4 + 3] = 255; } g.putImageData(img, 0, 0); }, true);
    const nrm = new THREE.CanvasTexture(heightToNormalCanvas(Hh, S, S, 3)); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.colorSpace = THREE.NoColorSpace;
    return { map, nrm };
  })();
  MT = {
    grass: offset(std({ map: M.grassGround ? M.grassGround.map : null, color: 0x86a35e, roughness: 1 }), -5),
    pavers: offset(std({ map: M.pavers.map, normalMap: M.pavers.normalMap, color: 0xb9b6b0, roughness: 0.9 }), -4),
    kerb: M.concrete, concrete: M.concrete, galv: M.galv, black: M.blackMetal,
    white: std({ color: 0xf2f2ef, roughness: 0.5 }), red: std({ color: 0xc9312f, roughness: 0.5 }),
    totem: std({ map: totem, roughness: 0.5 }), fascia: std({ map: fascia, roughness: 0.5 }),
    soffit: std({ color: 0xf4f3ee, roughness: 0.6, emissive: 0x2c2a24 }), panel: std({ color: 0x1b2742, roughness: 0.25, metalness: 0.4 }),
    pump: std({ color: 0xf2f2ee, roughness: 0.4, metalness: 0.2 }), shop: std({ map: shopFront, roughness: 0.3, metalness: 0.2 }),
    blueWall: std({ color: 0x2b4a86, roughness: 0.6 }),
    glass: std({ map: glass, roughness: 0.15, metalness: 0.5 }), dome: std({ color: 0x3c5a86, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide }),
    band: std({ color: 0x2f62b8, roughness: 0.5 }),
    shrub: std({ map: foliage.map, normalMap: foliage.nrm, roughness: 1 }), bark: M.bark,
    spruce: std({ map: foliage.map, normalMap: foliage.nrm, color: 0x8fa596, roughness: 1 }),
    arrowR: offset(std({ map: arrowR, transparent: true, alphaTest: 0.4, roughness: 0.7 }), -10),
    redPaint: offset(std({ color: 0xc23a33, roughness: 0.7 }), -8),
    ahead: std({ map: ahead, transparent: true, alphaTest: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
    keepRight: std({ map: keepRight, transparent: true, alphaTest: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
    limit80: std({ map: limit80, transparent: true, alphaTest: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
    reflector: std({ color: 0xd11a1a, roughness: 0.3, emissive: 0x300404 }),
  };
  return MT;
}

// ------------------------------------------------------------------ build
export function buildEtu(B, world) {
  const entry = road(ENTRY), inner = road(INNER), southIn = road(SOUTH_IN);
  if (!entry || !inner) return null;
  const Mt = mats();
  const A = { grass: new Acc(), pav: new Acc(), kerb: new Acc(), barrier: new Acc(), fascia: new Acc(), soffit: new Acc(), roof: new Acc(), shop: new Acc(), glass: new Acc(), dome: new Acc(), band: new Acc(), arrow: new Acc(), redPaint: new Acc() };
  const G = { white: [], red: [], totem: [], pump: [], shrub: [], bark: [], galv: [], black: [], ahead: [], keepRight: [], limit80: [], reflector: [], blueWall: [], panel: [], spruce: [] };
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));

  // ---- grass island between the northern entry, the inner forecourt lane and the southern entry
  const E = pairs(entry.p), I = pairs(inner.p), S = southIn ? pairs(southIn.p) : [];
  const all = [...E, ...I, ...S];
  const cx = all.reduce((a, p) => a + p[0], 0) / all.length, cz = all.reduce((a, p) => a + p[1], 0) / all.length;
  const eo = offsetToward(E, entry.w / 2 + 0.35, cx, cz), io = offsetToward(I, inner.w / 2 + 0.35, cx, cz), so = offsetToward(S, (southIn?.w ?? 3.2) / 2 + 0.35, cx, cz);
  // the island: north tip where the entry meets the inner lane, then down the inner lane, the southern entry, DN1
  // the northbound carriageway (two OSM ways joined end to end)
  const dn = road(DN1.north[0]), dnP = [];
  for (const id of DN1.north) { const r = road(id); if (r) for (const p of pairs(r.p)) { const q = dnP[dnP.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.01) dnP.push(p); } }
  const fr = STORE.frame;
  const dnEdge = (p) => {
    // point on the carriageway's edge facing the island, nearest to p
    let best = null;
    for (let i = 0; i < dnP.length - 1; i++) {
      const [ax, az] = dnP[i], [bx, bz] = dnP[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / (l * l)));
      const q = [ax + dx * t, az + dz * t], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.d) { let nx = -dz / l, nz = dx / l; if ((cx - q[0]) * nx + (cz - q[1]) * nz < 0) { nx = -nx; nz = -nz; } const o2 = fr ? fr.lat + entry.w / 2 + 0.35 : dn.w / 2 + 1.2; best = { d, p: [q[0] + nx * o2, q[1] + nz * o2] }; }
    }
    return best.p;
  };
  // entry lane from DN1 to the tip, inner lane from the tip to the southern junction, southern entry back to DN1
  const along = (p) => fr ? (p[0] - fr.o[0]) * fr.u[0] + (p[1] - fr.o[1]) * fr.u[1] : 0;
  const lateral = (p) => (p[0] - fr.o[0]) * fr.r[0] + (p[1] - fr.o[1]) * fr.r[1];
  // (the forecourt entry's first two vertices are its branch off the deceleration lane, south of the island)
  const sBack = (so.length ? so.slice(fr ? 2 : 1, -1).reverse() : []).filter(p => !fr || lateral(p) > fr.lat + entry.w / 2 + 0.3);
  const sMin = sBack.length ? Math.max(...sBack.map(along)) : -Infinity;
  const island = [...eo.slice(1, -1).filter(p => !fr || along(p) > sMin + 0.5), ...io.slice(1, -1), ...sBack];
  const c0 = dnEdge(island[island.length - 1]), c1 = dnEdge(island[0]);
  island.push(c0);
  if (Math.hypot(c1[0] - island[0][0], c1[1] - island[0][1]) > 0.5) island.push(c1);
  drape(A.grass, island, 0.15, 2.5, 2.4);
  for (let i = 0; i < island.length; i++) {
    const p = island[i], q = island[(i + 1) % island.length], mx = (p[0] + q[0]) / 2 - cx, mz = (p[1] + q[1]) / 2 - cz;
    const yp = heightAt(p[0], p[1]), yq = heightAt(q[0], q[1]);
    A.kerb.quad([p[0], yp - 0.1, p[1]], [q[0], yq - 0.1, q[1]], [q[0], yq + 0.16, q[1]], [p[0], yp + 0.16, p[1]], [mx, 0, mz], [0, 0, 1, 0, 1, 0.1, 0, 0.1]);
  }
  addHolePoly(island, { lawn: true, noFences: true });
  // open ground traced on the aerial imagery (Esri World Imagery z18): the fenced compound (forecourt, lawns, parking,
  // office yard) has no forest; the meadow south of it keeps its scattered trees
  addHolePoly(COMPOUND, { lawn: true, noFences: true });
  addHolePoly(MEADOW, { lawn: true, scatter: false });
  const isl = (x, z) => inPoly(island, x, z);

  // ---- price totem on the island by the entry lane, facing the traffic on DN1 (photo 38)
  let totem = null;
  {
    const E0 = STORE.E0 || E, eo0 = offsetToward(E0, entry.w / 2 + 0.35, cx, cz);
    const k = 2, p = eo0[k], [ux, uz] = [E0[k + 1][0] - E0[k - 1][0], E0[k + 1][1] - E0[k - 1][1]], ul = Math.hypot(ux, uz);
    let nx = cx - p[0], nz = cz - p[1]; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    const x = p[0] + nx * 2.2, z = p[1] + nz * 2.2, y = heightAt(x, z) + 0.15;
    const fx = -ux / ul, fz = -uz / ul;                              // towards the oncoming traffic (the entry runs away from DN1)
    const rot = Math.atan2(fx, fz);
    const wall = new THREE.BoxGeometry(2.2, 8.4, 0.5); wall.rotateY(rot); wall.translate(x - fx * 0.3, y + 4.2, z - fz * 0.3); G.white.push(wall);
    const pnl = new THREE.BoxGeometry(1.7, 6.8, 0.22); pnl.rotateY(rot); pnl.translate(x + fx * 0.05 - fz * 0.2, y + 4.6, z + fz * 0.05 + fx * 0.2); G.totem.push(pnl);
    box(x, z, 1.2, 0.4, Math.atan2(-fz, fx) + Math.PI / 2, y - 1, y + 8.5, 'totem');
    totem = { x, z };
  }
  // a row of spruces on the office side of the access road (photos 38, 39)
  {
    const N = road(NORTH), P = N ? pairs(N.p).filter(p => p[1] <= 484.5) : [];
    if (P.length >= 2) {
      P.sort((p, q) => p[1] - q[1]);
      const a = P[0], b = P[P.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
      const [ox, oz] = STORE.office ? pairs(STORE.office.p).reduce((m, p) => [m[0] + p[0], m[1] + p[1]], [0, 0]) : [0, 0];
      const sd = STORE.office && ((ox / pairs(STORE.office.p).length - a[0]) * uz - (oz / pairs(STORE.office.p).length - a[1]) * ux) > 0 ? 1 : -1;
      for (let k = 0; k < 5; k++) {
        const s0 = 10 + k * 6.5, off = 6 + (k % 2) * 1.5, x = a[0] + ux * s0 + uz * sd * off, z = a[1] + uz * s0 - ux * sd * off;
        const y = heightAt(x, z), H = 8 + 2.5 * ((k * 7) % 3);
        cyl(G.bark, x, y, z, H * 0.3, 0.2, 0.14, 6);
        for (let t = 0; t < 6; t++) { const h0 = H * (0.14 + t * 0.13), r = 1.9 * (1 - t / 6.5); const c = new THREE.ConeGeometry(r, H * 0.28, 10); c.translate(x, y + h0 + H * 0.14, z); G.spruce.push(c); }
        box(x, z, 0.25, 0.25, 0, y - 1, y + 4, 'tree');
      }
    }
  }
  // clipped shrubs: round bushes and two cloud-pruned pines
  {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let n = 0;
    for (let t = 0; t < 200 && n < 9; t++) {
      const i = Math.floor(rnd() * island.length), a = island[i], b = island[(i + 3) % island.length], f = 0.3 + rnd() * 0.4;
      const x = a[0] + (b[0] - a[0]) * f + (cx - a[0]) * 0.35, z = a[1] + (b[1] - a[1]) * f + (cz - a[1]) * 0.35;
      if (!isl(x, z) || (totem && Math.hypot(x - totem.x, z - totem.z) < 3)) continue;
      const y = heightAt(x, z) + 0.15;
      if (n % 4 === 3) {
        cyl(G.bark, x, y, z, 1.8, 0.09, 0.06, 6);
        for (const [h, r] of [[0.9, 0.55], [1.5, 0.45], [2.05, 0.32]]) { const g = new THREE.SphereGeometry(r, 10, 7); g.scale(1, 0.55, 1); g.translate(x + (h - 1.4) * 0.3, y + h, z); G.shrub.push(g); }
      } else { const r = 0.45 + rnd() * 0.35, g = new THREE.SphereGeometry(r, 12, 8); g.scale(1, 0.8, 1); g.translate(x, y + r * 0.7, z); G.shrub.push(g); }
      n++;
    }
  }
  // blue mandatory signs at the island's nose (photo 39)
  {
    // the nose is where the entry lane and the inner lane meet
    const tip = [(eo[eo.length - 2][0] + io[1][0]) / 2, (eo[eo.length - 2][1] + io[1][1]) / 2];
    const fx0 = tip[0] - cx, fz0 = tip[1] - cz, fl = Math.hypot(fx0, fz0), fx = fx0 / fl, fz = fz0 / fl;
    for (const [e, mat, hh] of [[-1.3, 'ahead', 2.1], [0.3, 'ahead', 2.1], [1.6, 'keepRight', 1.2]]) {
      const x = tip[0] - fx * 2.2 + (-fz) * e, z = tip[1] - fz * 2.2 + fx * e, y = heightAt(x, z) + 0.15;
      if (!isl(x, z)) continue;
      cyl(G.galv, x, y - 0.3, z, hh + 0.5, 0.035);
      plate(G[mat], x + fx * 0.04, y + hh, z + fz * 0.04, mat === 'ahead' ? 0.6 : 0.5, fx, fz);
      box(x, z, 0.1, 0.1, 0, y - 1, y + 2.5, 'sign');
    }
  }

  // ---- forecourt: pavers inside the loop lane, around the canopy
  const loop = road(LOOP), north = road(NORTH);
  if (loop && north) {
    const Lp = pairs(loop.p), Np = pairs(north.p);
    // loop from the inner lane's south end round to the north road, then back along the north road and the inner lane
    const k = Np.findIndex(p => Math.hypot(p[0] - Lp[Lp.length - 1][0], p[1] - Lp[Lp.length - 1][1]) < 0.5);
    const poly = [...Lp, ...(k >= 0 ? Np.slice(k + 1) : []), ...I.slice(1, -1)];
    const fc = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
    const inset = offsetToward(poly, 1.7, fc[0], fc[1]);
    drape(A.pav, inset, 0.04, 3, 1.6);
    addHolePoly(inset, { noFences: true });
  }

  // ---- canopy over the mapped footprint, pump islands, the shop under its far side
  let station = null;
  if (STORE.canopy) {
    const p = pairs(STORE.canopy.p);
    const ctr = p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
    let best = null;
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!best || l > best[2]) best = [(b[0] - a[0]) / l, (b[1] - a[1]) / l, l]; }
    const u = [best[0], best[1]], v = [-u[1], u[0]];
    let a = 0, b = 0; for (const q of p) { a = Math.max(a, Math.abs((q[0] - ctr[0]) * u[0] + (q[1] - ctr[1]) * u[1])); b = Math.max(b, Math.abs((q[0] - ctr[0]) * v[0] + (q[1] - ctr[1]) * v[1])); }
    const W = (lu, lv) => [ctr[0] + u[0] * lu + v[0] * lv, ctr[1] + u[1] * lu + v[1] * lv];
    // the side facing the entry is the front; the shop stands under the opposite long side
    const sgn = ((totem ? totem.x : cx) - ctr[0]) * v[0] + ((totem ? totem.z : cz) - ctr[1]) * v[1] > 0 ? 1 : -1;
    const y0 = Math.min(...p.map(q => heightAt(q[0], q[1]))) + 0.05, top = y0 + 5.8, fh = 1.1;
    const C = [W(-a, -b), W(a, -b), W(a, b), W(-a, b)];
    for (let k = 0; k < 4; k++) {
      const [x0, z0] = C[k], [x1, z1] = C[(k + 1) % 4], nx = (x0 + x1) / 2 - ctr[0], nz = (z0 + z1) / 2 - ctr[1];
      const fwd = (x1 - x0) * nz - (z1 - z0) * nx > 0, u0 = fwd ? 0 : 1, u1 = 1 - u0;
      A.fascia.quad([x0, top - fh, z0], [x1, top - fh, z1], [x1, top, z1], [x0, top, z0], [nx, 0, nz], [u0, 0, u1, 0, u1, 1, u0, 1]);
    }
    A.soffit.quad([C[0][0], top - fh, C[0][1]], [C[1][0], top - fh, C[1][1]], [C[2][0], top - fh, C[2][1]], [C[3][0], top - fh, C[3][1]], [0, -1, 0]);
    A.roof.quad([C[0][0], top, C[0][1]], [C[1][0], top, C[1][1]], [C[2][0], top, C[2][1]], [C[3][0], top, C[3][1]], UP);
    // solar panels on the roof (aerial imagery)
    for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) { const [x, z] = W(i * (a / 3.6), j * (b / 3)); boxAt(G.panel, x, top + 0.15, z, 1.7, 0.05, 1.0, -Math.atan2(u[1], u[0])); }
    // shop: under the far long side, glass front with red frames, blue wall at one end (photo 39)
    const sv0 = -sgn * (b - 6.5), sv1 = -sgn * b;
    const S0 = [W(-a + 1, sv0), W(a - 1, sv0), W(a - 1, sv1), W(-a + 1, sv1)];
    const yTop = top - fh;
    const [f0, f1] = [S0[0], S0[1]];
    A.shop.quad([f0[0], y0, f0[1]], [f1[0], y0, f1[1]], [f1[0], yTop, f1[1]], [f0[0], yTop, f0[1]], [v[0] * sgn, 0, v[1] * sgn], [0, 0, 2 * a / 8, 0, 2 * a / 8, 1, 0, 1]);
    for (const [pA, pB] of [[S0[1], S0[2]], [S0[3], S0[0]]]) {
      const n = [(pA[0] + pB[0]) / 2 - ctr[0], 0, (pA[1] + pB[1]) / 2 - ctr[1]];
      A.shop.quad([pA[0], y0, pA[1]], [pB[0], y0, pB[1]], [pB[0], yTop, pB[1]], [pA[0], yTop, pA[1]], n, [0, 0, 0.8, 0, 0.8, 1, 0, 1]);
    }
    { const [xb, zb] = W(a - 3, (sv0 + sv1) / 2); boxAt(G.blueWall, xb, (y0 + yTop) / 2, zb, 4, yTop - y0, 6.4, -Math.atan2(u[1], u[0])); }
    box(...W(0, (sv0 + sv1) / 2), a - 1, 3.25, Math.atan2(-u[1], u[0]), y0 - 1, yTop, 'shop');
    // columns and pumps: three islands across the front part
    for (const lu of [-a * 0.55, 0, a * 0.55]) {
      const rot = -Math.atan2(u[1], u[0]);
      const [ix, iz] = W(lu, sgn * 2.5);
      boxAt(G.white, ix, y0 + 0.1, iz, 1.1, 0.2, 7.5, rot + Math.PI / 2);
      for (const dv of [-2.6, 2.6]) {
        const [x, z] = W(lu, sgn * 2.5 + dv);
        boxAt(G.white, x, (y0 + top - fh) / 2, z, 0.45, top - fh - y0, 0.45, rot);
        boxAt(G.red, x, y0 + 2.2, z, 0.47, 0.35, 0.47, rot);
        box(x, z, 0.3, 0.3, 0, y0 - 1, top, 'column');
      }
      for (const dv of [-1.2, 1.2]) { const [x, z] = W(lu, sgn * 2.5 + dv); boxAt(G.pump, x, y0 + 1.05, z, 0.5, 1.7, 0.9, rot); boxAt(G.red, x, y0 + 1.7, z, 0.52, 0.3, 0.92, rot); }
      box(ix, iz, 0.6, 3.8, Math.atan2(-u[1], u[0]) + Math.PI / 2, y0 - 1, y0 + 2, 'pump');
    }
    // red painted arrows on the forecourt
    for (const lu of [-a * 0.8, a * 0.8]) {
      const [x, z] = W(lu, sgn * (b + 4)), y = heightAt(x, z) + 0.06, s = 1.2;
      A.redPaint.quad([x - u[0] * s, y, z - u[1] * s], [x + u[0] * s, y, z + u[1] * s], [x + u[0] * s + v[0] * 0.15, y, z + u[1] * s + v[1] * 0.15], [x - u[0] * s + v[0] * 0.15, y, z - u[1] * s + v[1] * 0.15], UP);
    }
    station = { x: ctr[0], z: ctr[1] };
  }

  // ---- round glass pavilion (ETU Pizza & Grill): glass walls, low blue dome
  if (STORE.pavilion) {
    const p = pairs(STORE.pavilion.p);
    const y0 = Math.min(...p.map(q => heightAt(q[0], q[1]))) + 0.1, h = 3.6;
    const c = p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
    let per = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      A.glass.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y0 + h, b[1]], [a[0], y0 + h, a[1]], [(a[0] + b[0]) / 2 - c[0], 0, (a[1] + b[1]) / 2 - c[1]], [per / 4, 0, (per + l) / 4, 0, (per + l) / 4, 1, per / 4, 1]);
      A.dome.quad([a[0], y0 + h, a[1]], [b[0], y0 + h, b[1]], [c[0], y0 + h + 2.2, c[1]], [c[0], y0 + h + 2.2, c[1]], UP);
      per += l;
    }
    const e = new THREE.Box3(); for (const q of p) e.expandByPoint(new THREE.Vector3(q[0], 0, q[1]));
    box((e.min.x + e.max.x) / 2, (e.min.z + e.max.z) / 2, (e.max.x - e.min.x) / 2, (e.max.z - e.min.z) / 2, 0, y0 - 1, y0 + h + 2, 'house');
  }

  // ---- office building: blue bands between the storeys
  if (STORE.office) {
    const b = STORE.office, p = pairs(b.p);
    let area = 0; for (let i = 0; i < p.length; i++) { const a = p[i], q = p[(i + 1) % p.length]; area += a[0] * q[1] - q[0] * a[1]; }
    const ccw = area > 0, floor0 = b.y1 + 0.45;
    for (const hh of [2.55, 5.45, 8.35]) {
      for (let i = 0; i < p.length; i++) {
        const a = p[i], q = p[(i + 1) % p.length], l = Math.hypot(q[0] - a[0], q[1] - a[1]);
        if (l < 0.5) continue;
        let nx = (q[1] - a[1]) / l, nz = -(q[0] - a[0]) / l; if (!ccw) { nx = -nx; nz = -nz; }
        const o = 0.06, A0 = [a[0] + nx * o, a[1] + nz * o], B0 = [q[0] + nx * o, q[1] + nz * o];
        A.band.quad([A0[0], floor0 + hh, A0[1]], [B0[0], floor0 + hh, B0[1]], [B0[0], floor0 + hh + 0.45, B0[1]], [A0[0], floor0 + hh + 0.45, A0[1]], [nx, 0, nz]);
      }
    }
  }

  // ---- DN1: New Jersey barrier with red reflectors between the carriageways (photo 38)
  {
    const nP = [], sR = road(DN1.south[0]);
    for (const id of DN1.north) { const r = road(id); if (r) nP.push(...pairs(r.p).slice(nP.length ? 1 : 0)); }
    const sP = sR ? pairs(sR.p) : [];
    const mid = [];
    const dense = []; for (let i = 0; i < nP.length - 1; i++) { const [ax, az] = nP[i], [bx, bz] = nP[i + 1], l = Math.hypot(bx - ax, bz - az), k = Math.ceil(l / 3); for (let j = 0; j < k; j++) dense.push([ax + (bx - ax) * j / k, az + (bz - az) * j / k]); }
    for (const q of dense) {
      if (Math.hypot(q[0] - 1945, q[1] - 420) > 150) continue;
      let best = null;
      for (let i = 0; i < sP.length - 1; i++) { const [ax, az] = sP[i], [bx, bz] = sP[i + 1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((q[0] - ax) * dx + (q[1] - az) * dz) / (dx * dx + dz * dz))), x = ax + dx * t, z = az + dz * t, d = Math.hypot(q[0] - x, q[1] - z); if (!best || d < best[2]) best = [x, z, d]; }
      if (best && best[2] < 16) mid.push([(q[0] + best[0]) / 2, (q[1] + best[1]) / 2]);
    }
    const prof = [[-0.3, 0], [-0.26, 0.08], [-0.1, 0.33], [-0.08, 0.86], [0.08, 0.86], [0.1, 0.33], [0.26, 0.08], [0.3, 0]];
    let acc = 0;
    for (let i = 0; i < mid.length - 1; i++) {
      const [ax, az] = mid[i], [bx, bz] = mid[i + 1], l = Math.hypot(bx - ax, bz - az); if (l < 0.2) continue;
      const nx = -(bz - az) / l, nz = (bx - ax) / l;
      for (let k = 0; k < prof.length - 1; k++) {
        const P = [[ax, az, prof[k]], [bx, bz, prof[k]], [bx, bz, prof[k + 1]], [ax, az, prof[k + 1]]].map(([x, z, [dq, h]]) => [x + nx * dq, heightAt(x, z) + h + 0.03, z + nz * dq]);
        const m = (prof[k][0] + prof[k + 1][0]) / 2;
        A.barrier.quad(P[0], P[1], P[2], P[3], [nx * Math.sign(m || 1) * 0.8, 0.5, nz * Math.sign(m || 1) * 0.8], [acc / 2.2, prof[k][1], (acc + l) / 2.2, prof[k][1], (acc + l) / 2.2, prof[k + 1][1], acc / 2.2, prof[k + 1][1]]);
      }
      // a red reflector on both faces every ~4 m
      if (Math.floor((acc + l) / 4) > Math.floor(acc / 4)) for (const sd of [-1, 1]) { const x = ax + nx * sd * 0.1, z = az + nz * sd * 0.1; boxAt(G.reflector, x, heightAt(ax, az) + 0.7, z, 0.12, 0.1, 0.03, -Math.atan2(bz - az, bx - ax)); }
      box((ax + bx) / 2, (az + bz) / 2, l / 2 + 0.1, 0.32, Math.atan2(-(bz - az), bx - ax), heightAt(ax, az) - 0.5, heightAt(ax, az) + 0.9, 'barrier');
      acc += l;
    }
  }

  // ---- 80 km/h sign at the OSM node, on the right of the northbound carriageway; arrow on the entry lane
  {
    // the OSM node sits on a joint of the carriageway's ways; photo 38 shows the sign ~40 m past the split, on the
    // verge beyond the deceleration lane
    const S80 = fr ? [fr.o[0] + fr.u[0] * 38, fr.o[1] + fr.u[1] * 38] : SIGN80;
    let best = null;
    for (let i = 0; i < dnP.length - 1; i++) { const [ax, az] = dnP[i], [bx, bz] = dnP[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((S80[0] - ax) * dx + (S80[1] - az) * dz) / (l * l))); const d = Math.hypot(S80[0] - ax - dx * t, S80[1] - az - dz * t); if (!best || d < best.d) best = { d, ux: dx / l, uz: dz / l, x: ax + dx * t, z: az + dz * t }; }
    if (best) {
      const rx = -best.uz, rz = best.ux;                             // right of the heading
      const side = (cx - best.x) * rx + (cz - best.z) * rz > 0 ? 1 : -1, off = fr ? fr.lat + entry.w / 2 + 1.4 : dn.w / 2 + 1.4;
      const x = best.x + rx * side * off, z = best.z + rz * side * off, y = heightAt(x, z);
      cyl(G.galv, x, y - 0.3, z, 2.9, 0.04);
      plate(G.limit80, x - best.ux * 0.05, y + 2.3, z - best.uz * 0.05, 0.7, -best.ux, -best.uz);
      plate(G.keepRight, x - best.ux * 0.05, y + 1.6, z - best.uz * 0.05, 0.45, -best.ux, -best.uz);
      box(x, z, 0.1, 0.1, 0, y - 1, y + 3, 'sign');
    }
    // right-turn arrow painted near the start of the entry lane
    const ux = fr ? fr.u[0] : 1, uz = fr ? fr.u[1] : 0, nx = -uz, nz = ux;
    const c = fr ? [fr.o[0] + ux * 6 + fr.r[0] * fr.lat, fr.o[1] + uz * 6 + fr.r[1] * fr.lat] : E[1], y = heightAt(c[0], c[1]) + 0.05;
    const P = [[-2.5, -0.6], [2.5, -0.6], [2.5, 0.6], [-2.5, 0.6]].map(([s, o]) => [c[0] + ux * s + nx * o, y, c[1] + uz * s + nz * o]);
    A.arrow.quad(P[0], P[1], P[2], P[3], UP, [0, 0, 0, 1, 1, 1, 1, 0]);
  }

  // ---- flush
  A.grass.flush(B, Mt.grass, null, { noCast: true }); A.pav.flush(B, Mt.pavers, null, { noCast: true }); A.kerb.flush(B, Mt.kerb);
  A.barrier.flush(B, Mt.concrete); A.fascia.flush(B, Mt.fascia); A.soffit.flush(B, Mt.soffit); A.roof.flush(B, Mt.pump);
  A.shop.flush(B, Mt.shop); A.glass.flush(B, Mt.glass); A.dome.flush(B, Mt.dome); A.band.flush(B, Mt.band);
  A.arrow.flush(B, Mt.arrowR, null, { noCast: true }); A.redPaint.flush(B, Mt.redPaint, null, { noCast: true });
  const put = (key, mat, opts) => { if (G[key].length) B.geo(mat, merged(G[key]), null, null, opts); };
  for (const [k, m] of [['white', Mt.white], ['red', Mt.red], ['totem', Mt.totem], ['pump', Mt.pump], ['shrub', Mt.shrub], ['bark', Mt.bark], ['galv', Mt.galv], ['black', Mt.black], ['ahead', Mt.ahead], ['keepRight', Mt.keepRight], ['limit80', Mt.limit80], ['reflector', Mt.reflector], ['blueWall', Mt.blueWall], ['panel', Mt.panel], ['spruce', Mt.spruce]]) put(k, m);

  // walkable: the raised island
  const surface = (x, z) => isl(x, z) ? heightAt(x, z) + 0.15 : null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of island) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { type: 'etu', name: 'Benzinăria Etu Oil & Gas (DN1, Cornu de Jos)', station, totem, island, surface, bbox: { x0, x1, z0, z1 }, entry: STORE.E0 || E, dn: dnP };
}
