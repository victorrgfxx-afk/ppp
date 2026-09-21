/**
 * Relieful si reteaua stradala. O singura functie de inaltime (`surfaceY`)
 * guverneaza deopotriva geometria vizibila si coliziunile/fizica masinii,
 * deci nu exista niciodata decalaj intre ce vezi si pe ce mergi.
 */
import * as THREE from '../vendor/three.module.min.js';
import { fbm, smoothstep, clamp, lerp } from './noise.js';

export const ROAD_HW = 3.0;          // semi-latime carosabil strada principala
export const KERB_H = 0.13;          // inaltime bordura
export const WALK_W = 1.25;          // latime trotuar
export const YARD_H = 0.20;          // curtile sunt cu 20 cm peste cota drumului

/** Segmentele de strada. axis 'z' = merge pe Z la x=c; axis 'x' = merge pe X la z=c. */
export const ROADS = [
  { id: 'main',  axis: 'z', c: 0,    a: 90,  b: -360, hw: ROAD_HW, walkL: true,  walkR: false },
  { id: 'cross1',axis: 'x', c: -104, a: 4,   b: -96,  hw: 2.6,     walkL: false, walkR: false },
  { id: 'cross2',axis: 'x', c: -252, a: 4,   b: -96,  hw: 2.6,     walkL: false, walkR: false },
  { id: 'back',  axis: 'z', c: -88,  a: -98, b: -258, hw: 2.6,     walkL: false, walkR: false },
  { id: 'alley', axis: 'x', c: -34,  a: 3,   b: -44,  hw: 2.2,     walkL: false, walkR: false },
];

/** Cota generala a terenului: usoara vale si o panta transversala lina. */
export function landY(x, z) {
  const dip = -0.95 * Math.exp(-Math.pow((z + 128) / 78, 2));
  const wave = 0.28 * Math.sin(z * 0.0062 + 0.6) + 0.16 * Math.sin(z * 0.017 - 1.2);
  const cross = 0.0045 * x;
  const rough = (fbm(x * 0.012 + 40, z * 0.012 + 40, { octaves: 3, period: 64, seed: 5 }) - 0.5) * 0.35;
  return dip + wave + cross + rough;
}

/** Distanta laterala pana la axul unui segment (cu capete rotunjite). */
function lateral(road, x, z) {
  if (road.axis === 'z') {
    const lo = Math.min(road.a, road.b), hi = Math.max(road.a, road.b);
    const dz = z < lo ? lo - z : z > hi ? z - hi : 0;
    return Math.hypot(x - road.c, dz);
  }
  const lo = Math.min(road.a, road.b), hi = Math.max(road.a, road.b);
  const dx = x < lo ? lo - x : x > hi ? x - hi : 0;
  return Math.hypot(z - road.c, dx);
}

/** Profilul transversal: carosabil bombat -> bordura -> trotuar -> curte. */
function crossProfile(road, d) {
  const hw = road.hw;
  if (d <= hw) return -0.026 * d;                                   // bombament 2.6%
  if (d <= hw + 0.16) {
    const t = smoothstep(hw, hw + 0.16, d);
    return lerp(-0.026 * hw, KERB_H, t);                            // fata bordurii
  }
  const t = smoothstep(hw + 0.16, hw + 0.16 + WALK_W, d);
  return lerp(KERB_H, YARD_H, t);
}

/** Inaltimea suprafetei pe care se calca / se ruleaza, in orice punct. */
export function surfaceY(x, z) {
  let off = YARD_H;
  for (let i = 0; i < ROADS.length; i++) {
    const d = lateral(ROADS[i], x, z);
    if (d > ROADS[i].hw + WALK_W + 1.2) continue;
    const p = crossProfile(ROADS[i], d);
    if (p < off) off = p;
  }
  return landY(x, z) + off;
}

/** true daca punctul e pe carosabil (util pentru sunete/pasi si IA). */
export function onRoad(x, z) {
  for (let i = 0; i < ROADS.length; i++) {
    if (lateral(ROADS[i], x, z) <= ROADS[i].hw) return ROADS[i];
  }
  return null;
}

/* ----------------------------- geometrie ------------------------------- */


/** Garanteaza ca fetele privesc in sus, indiferent de sensul segmentului. */
function ensureUp(g) {
  const pos = g.attributes.position, idx = g.index;
  if (!idx) return g;
  let sum = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    const e1x = pos.getX(b) - pos.getX(a), e1z = pos.getZ(b) - pos.getZ(a);
    const e2x = pos.getX(c) - pos.getX(a), e2z = pos.getZ(c) - pos.getZ(a);
    sum += e1z * e2x - e1x * e2z;
  }
  if (sum < 0) {
    const arr = idx.array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t;
    }
    idx.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

function ribbon(road, d0, d1, yOff0, yOff1, step, uScale, vScale) {
  const along = road.axis === 'z' ? 'z' : 'x';
  const a = road.a, b = road.b;
  const n = Math.max(2, Math.ceil(Math.abs(b - a) / step));
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = lerp(a, b, t);
    for (let k = 0; k < 2; k++) {
      const d = k === 0 ? d0 : d1;
      const yo = k === 0 ? yOff0 : yOff1;
      let x, z;
      if (along === 'z') { x = road.c + d; z = s; } else { x = s; z = road.c + d; }
      const y = landY(x, z) + yo;
      pos.push(x, y, z);
      nor.push(0, 1, 0);
      uv.push((d) * uScale, s * vScale);
    }
  }
  for (let i = 0; i < n; i++) {
    const o = i * 2;
    idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return ensureUp(g);
}

/** Banda de asfalt, cu bombament (mai multe fasii, ca sa apara creasta). */
export function asphaltGeo(road, step = 2.0, lift = 0) {
  const hw = road.hw;
  const s = 1 / 2.6;         // 1 dala de textura = 2.6 m
  const gs = [];
  const seg = 6;
  for (let k = 0; k < seg; k++) {
    const d0 = lerp(-hw, hw, k / seg), d1 = lerp(-hw, hw, (k + 1) / seg);
    gs.push(ribbon(road, d0, d1,
      -0.026 * Math.abs(d0) + lift, -0.026 * Math.abs(d1) + lift, step, s, s));
  }
  return gs;
}

/**
 * Rost transversal de bitum (imbinarea a doua covoare asfaltice) - linia
 * care traverseaza carosabilul in prim-planul primei fotografii.
 */
export function seamGeo(road, at, width = 0.09) {
  const sub = { axis: road.axis, c: road.c, a: at - width / 2, b: at + width / 2, hw: road.hw };
  return asphaltGeo(sub, width, 0.005);
}

/** Portiune de covor asfaltic mai nou, cu alta nuanta. */
export function overlayGeo(road, from, to, lift = 0.003) {
  const sub = { axis: road.axis, c: road.c, a: from, b: to, hw: road.hw };
  return asphaltGeo(sub, 3.0, lift);
}

/** Bordura: fata verticala + calota superioara. */
export function kerbGeo(road, side, step = 2.0) {
  const hw = road.hw * side;
  const sgn = side;
  const s = 1 / 1.2;
  const face = ribbon(road, hw, hw + 0.16 * sgn, -0.026 * road.hw, KERB_H, step, s, s);
  const top = ribbon(road, hw + 0.16 * sgn, hw + 0.30 * sgn, KERB_H, KERB_H + 0.004, step, s, s);
  return [face, top];
}

/** Trotuar / platbanda betonata. */
export function walkGeo(road, side, width = WALK_W, step = 2.0) {
  const sgn = side;
  const d0 = (road.hw + 0.30) * sgn;
  const d1 = (road.hw + 0.30 + width) * sgn;
  return ribbon(road, d0, d1, KERB_H + 0.004, KERB_H - 0.01, step, 1 / 1.0, 1 / 1.0);
}

/** Marcaj lateral discontinuu (cel din poze): linie 1.5 m, pauza 2.0 m. */
export function markingGeos(road, { dash = 1.5, gap = 2.0, width = 0.12, inset = 0.45 } = {}) {
  const out = [];
  const a = Math.min(road.a, road.b), b = Math.max(road.a, road.b);
  for (const side of [-1, 1]) {
    const d = (road.hw - inset) * side;
    for (let s = a + 3; s < b - 3; s += dash + gap) {
      const s1 = Math.min(s + dash, b - 3);
      const sub = { axis: road.axis, c: road.c, a: s, b: s1, hw: road.hw };
      out.push(ribbon(sub, d - width / 2, d + width / 2,
        -0.026 * Math.abs(d - width / 2) + 0.006, -0.026 * Math.abs(d + width / 2) + 0.006, Math.max(0.5, (s1 - s)), 4, 0.6));
    }
  }
  return out;
}

/** Plasa de teren (iarba/pamant) pe toata harta, cu 4 cm sub suprafata reala. */
export function terrainGeo(size = 520, cells = 190) {
  const g = new THREE.PlaneGeometry(size, size, cells, cells);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -130);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, surfaceY(x, z) - 0.045);
    uv.setXY(i, x / 3.2, z / 3.2);
  }
  pos.needsUpdate = true; uv.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Urme de pneuri lustruite pe cele doua fire de circulatie. */
export function tireTrackGeos(road, step = 3.0) {
  const out = [];
  for (const off of [-1.05, 1.05]) {
    out.push(ribbon(road, off - 0.42, off + 0.42,
      -0.026 * Math.abs(off - 0.42) + 0.004, -0.026 * Math.abs(off + 0.42) + 0.004, step, 1 / 0.84, 1 / 8));
  }
  return out;
}
