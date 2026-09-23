/**
 * Relieful si reteaua stradala, din date reale (vezi src/zona.js):
 *  - altitudinile vin din Copernicus GLO-30, cu albia Prahovei sapata dupa
 *    poligonul OSM si drumurile aplatizate pe profilul lor longitudinal;
 *  - strada-erou (Strada Garii, nr. 103-128) sta pe axa Z, la x = 0, cu
 *    capatul dinspre rau spre -Z.
 * O singura functie de inaltime (`surfaceY`) guverneaza geometria vizibila,
 * pasii jucatorului si asezarea obiectelor.
 */
import * as THREE from '../vendor/three.module.min.js';
import { ZONA } from './zona.js';
import { smoothstep, lerp, clamp } from './noise.js';

export const ROAD_HW = 3.0;
export const KERB_H = 0.13;
export const WALK_W = 1.25;
export const HERO = ZONA.hero;                     // z0 = capatul SV, z1 = capatul NE
export const BOUNDS = ZONA.bounds;                 // [x0, x1, z0, z1] unde se poate merge
export const DETAIL = ZONA.detail;

function grid(g) {
  const h = new Float32Array(g.cm.length);
  for (let i = 0; i < h.length; i++) h[i] = g.cm[i] / 100;
  return { x0: g.x0, z0: g.z0, step: g.step, nx: g.nx, nz: g.nz, h };
}
const DG = grid(ZONA.dem);
const BG = grid(ZONA.bg);

function sample(G, x, z) {
  let fi = (x - G.x0) / G.step, fj = (z - G.z0) / G.step;
  fi = clamp(fi, 0, G.nx - 1.001); fj = clamp(fj, 0, G.nz - 1.001);
  const i = Math.floor(fi), j = Math.floor(fj), fx = fi - i, fz = fj - j;
  const r0 = j * G.nx, r1 = r0 + G.nx;
  return (G.h[r0 + i] * (1 - fx) + G.h[r0 + i + 1] * fx) * (1 - fz)
       + (G.h[r1 + i] * (1 - fx) + G.h[r1 + i + 1] * fx) * fz;
}

/** Altitudinea terenului (m, relativ la 400 m). Grila fina + fundal larg. */
export function landY(x, z) {
  const e = Math.min(x - DETAIL[0], DETAIL[1] - x, z - DETAIL[2], DETAIL[3] - z);
  if (e >= 24) return sample(DG, x, z);
  const b = sample(BG, x, z) - 0.25;
  if (e <= 0) return b;
  return lerp(b, sample(DG, x, z), smoothstep(0, 24, e));
}

/* ---------------------- drumurile ca polilinii ------------------------ */

export const ROADS = ZONA.roads.map((r, k) => ({ ...r, id: k, pts: r.pts.map((p) => [p[0], p[1]]) }));

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L === 0 ? 0 : clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1);
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
export function polyDist(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Guri de strazi laterale pe strada-erou: fara bordura/gard acolo. */
export const JUNCTIONS = [];
for (const r of ROADS) {
  if (r.kind === 'path' || r.kind === 'footway') continue;
  for (const end of [r.pts[0], r.pts[r.pts.length - 1]]) {
    if (Math.abs(end[0]) < 6 && end[1] < HERO.z0 + 4 && end[1] > HERO.z1 - 4) {
      // directia in care pleaca strada laterala
      const other = end === r.pts[0] ? r.pts[1] : r.pts[r.pts.length - 2];
      const side = other[0] > end[0] ? 1 : -1;
      JUNCTIONS.push({ z: end[1], side, hw: r.hw + 2.2, name: r.name, kind: r.kind });
    }
  }
}
export function inJunction(side, z) {
  for (const j of JUNCTIONS) if (j.side === side && Math.abs(z - j.z) < j.hw) return true;
  return false;
}
const HERO_Z0 = HERO.z0 - 6.5;                     // bordura incepe dupa strada principala
const HERO_Z1 = HERO.z1 + 0.5;

/** Profilul transversal al strazii-erou: bombament -> bordura -> trotuar. */
function heroOffset(x, z) {
  if (z > HERO.z0 + 8 || z < HERO.z1 - 6) return 0;
  const d = Math.abs(x);
  if (d > 9.5) return 0;
  const side = x < 0 ? -1 : 1;
  // capetele strazii: bordura dispare lin
  const endFade = smoothstep(HERO_Z0 + 1, HERO_Z0 - 2, z) * smoothstep(HERO_Z1 - 1, HERO_Z1 + 2, z);
  const hasKerb = endFade > 0.01 && !inJunction(side, z);
  if (d <= ROAD_HW) return -0.026 * d;
  if (!hasKerb) return lerp(-0.026 * ROAD_HW, 0, smoothstep(ROAD_HW, 7, d));
  let k;
  if (d <= ROAD_HW + 0.16) k = lerp(-0.026 * ROAD_HW, KERB_H, smoothstep(ROAD_HW, ROAD_HW + 0.16, d));
  else if (d <= ROAD_HW + 0.16 + WALK_W + 0.14) k = lerp(KERB_H, 0.16, (d - ROAD_HW - 0.16) / (WALK_W + 0.14));
  else k = lerp(0.16, 0, smoothstep(ROAD_HW + 1.55, 9.5, d));
  return lerp(lerp(-0.026 * ROAD_HW, 0, smoothstep(ROAD_HW, 7, d)), k, endFade);
}

/** Inaltimea suprafetei pe care se calca, in orice punct. */
export function surfaceY(x, z) {
  return landY(x, z) + heroOffset(x, z);
}

/* ------------------------------ apa ---------------------------------- */

export const PRAHOVA = ZONA.rivers.find((r) => r.name === 'Prahova');
export const WATER_POLYS = ZONA.water;

function pip(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function inRiverBed(x, z) {
  for (const p of WATER_POLYS) if (pip(x, z, p)) return true;
  return false;
}

/** Nivelul apei, interpolat pe lungul cursului real (8 m/km la Campina). */
export function waterLevelAt(x, z) {
  const P = PRAHOVA.pts, W = PRAHOVA.wl;
  let best = Infinity, lvl = W[0];
  for (let i = 0; i < P.length - 1; i++) {
    const ax = P[i][0], az = P[i][1], bx = P[i + 1][0], bz = P[i + 1][1];
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L === 0 ? 0 : clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1);
    const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (d < best) { best = d; lvl = W[i] + (W[i + 1] - W[i]) * t; }
  }
  return lvl;
}
export function distToPrahova(x, z) { return polyDist(x, z, PRAHOVA.pts); }

/** Ce e sub picioare: pentru sunetul pasilor si pentru vad. */
export function surfaceKind(x, z) {
  const y = surfaceY(x, z);
  if (inRiverBed(x, z)) return y < waterLevelAt(x, z) - 0.04 ? 'water' : 'gravel';
  if (Math.abs(x) <= ROAD_HW + 0.2 && z < HERO.z0 + 6 && z > HERO.z1 - 1) return 'asphalt';
  if (Math.abs(x) <= ROAD_HW + 1.7 && x < 0 && z < HERO_Z0 && z > HERO_Z1) return 'asphalt';
  for (const r of ROADS) {
    if (polyDist(x, z, r.pts) <= r.hw + 0.2) return r.surface === 'asphalt' ? 'asphalt' : 'gravel';
  }
  return 'grass';
}

export function nearestRoadName(x, z, maxD = 14) {
  if (Math.abs(x) < 10 && z < HERO.z0 + 4 && z > HERO.z1 - 4) return HERO_NAME;
  let best = maxD, name = null;
  for (const r of ROADS) {
    if (!r.name) continue;
    const d = polyDist(x, z, r.pts);
    if (d < best) { best = d; name = r.name; }
  }
  return name;
}
const HERO_NAME = 'Strada Gării';

/* ----------------------------- geometrie ----------------------------- */

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
    for (let i = 0; i < arr.length; i += 3) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t; }
    idx.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

/** Banda de-a lungul strazii-erou (axa Z), intre offset-urile laterale d0..d1. */
function heroRibbon(za, zb, d0, d1, y0, y1, step, us, vs, base = landY) {
  const n = Math.max(2, Math.ceil(Math.abs(zb - za) / step));
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const z = lerp(za, zb, i / n);
    for (const [d, yo] of [[d0, y0], [d1, y1]]) {
      pos.push(d, base(d, z) + yo, z);
      uv.push(d * us, z * vs);
    }
  }
  for (let i = 0; i < n; i++) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return ensureUp(g);
}

/** Carosabilul strazii-erou, cu bombament real. */
export function heroAsphalt(lift = 0) {
  const gs = [], seg = 6, s = 1 / 2.6;
  for (let k = 0; k < seg; k++) {
    const d0 = lerp(-ROAD_HW, ROAD_HW, k / seg), d1 = lerp(-ROAD_HW, ROAD_HW, (k + 1) / seg);
    gs.push(heroRibbon(HERO.z0 + 6, HERO.z1, d0, d1, -0.026 * Math.abs(d0) + lift, -0.026 * Math.abs(d1) + lift, 2, s, s));
  }
  return gs;
}

/** Intervalele de pe o latura unde exista bordura (fara gurile de strada). */
export function kerbSpans(side, za = HERO_Z0, zb = HERO_Z1) {
  const cuts = JUNCTIONS.filter((j) => j.side === side).map((j) => [j.z + j.hw, j.z - j.hw]).sort((a, b) => b[0] - a[0]);
  const spans = [];
  let cur = za;
  for (const [hi, lo] of cuts) {
    if (hi < cur && hi > zb) spans.push([cur, hi]);
    cur = Math.min(cur, lo);
  }
  if (cur > zb) spans.push([cur, zb]);
  return spans.filter(([a, b]) => a - b > 1.0);
}

export function heroKerbs() {
  const out = [];
  for (const side of [-1, 1]) {
    for (const [za, zb] of kerbSpans(side)) {
      const h = ROAD_HW * side, s = 1 / 1.2;
      out.push(heroRibbon(za, zb, h, h + 0.16 * side, -0.026 * ROAD_HW, KERB_H, 2, s, s, landY));
      out.push(heroRibbon(za, zb, h + 0.16 * side, h + 0.30 * side, KERB_H, KERB_H + 0.004, 2, s, s, landY));
    }
  }
  return out;
}

export function heroWalk(side, width = WALK_W, spans = null) {
  const out = [];
  for (const [za, zb] of (spans || kerbSpans(side))) {
    const d0 = (ROAD_HW + 0.30) * side, d1 = (ROAD_HW + 0.30 + width) * side;
    out.push(heroRibbon(za, zb, d0, d1, KERB_H + 0.004, 0.155, 2.5, 1, 1, landY));
  }
  return out;
}

/** Marcaj lateral discontinuu (ca in poze): linie 1,5 m, pauza 2,0 m. */
export function heroMarkings({ dash = 1.5, gap = 2.0, width = 0.12, inset = 0.45 } = {}) {
  const out = [];
  for (const side of [-1, 1]) {
    const d = (ROAD_HW - inset) * side;
    for (let z = HERO_Z0 - 2; z > HERO_Z1 + 3; z -= dash + gap) {
      if (inJunction(side, z) || inJunction(side, z - dash)) continue;
      const lo = -0.026 * Math.abs(d - width / 2) + 0.006, hi = -0.026 * Math.abs(d + width / 2) + 0.006;
      out.push(heroRibbon(z, z - dash, d - width / 2, d + width / 2, lo, hi, dash, 4, 0.6));
    }
  }
  return out;
}

export function heroTireTracks() {
  const out = [];
  for (const off of [-1.05, 1.05]) {
    out.push(heroRibbon(HERO.z0 + 4, HERO.z1 + 2, off - 0.42, off + 0.42,
      -0.026 * Math.abs(off - 0.42) + 0.004, -0.026 * Math.abs(off + 0.42) + 0.004, 3, 1 / 0.84, 1 / 8));
  }
  return out;
}

/** Banda de-a lungul unei polilinii oarecare (drumuri, cale ferata, rau). */
export function polyRibbon(pts, hw, lift, { step = 2.5, uScale = 1 / 2.6, vScale = 1 / 2.6, yFn = null } = {}) {
  // reesantionare uniforma ca banda sa urmareasca relieful
  const P = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) P.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
  }
  P.push(pts[pts.length - 1]);
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const prev = P[Math.max(0, i - 1)], next = P[Math.min(P.length - 1, i + 1)];
    let tx = next[0] - prev[0], tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    if (i > 0) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    for (const side of [-1, 1]) {
      const x = P[i][0] + nx * hw * side, z = P[i][1] + nz * hw * side;
      const y = yFn ? yFn(x, z, P[i][0], P[i][1]) : landY(x, z);
      pos.push(x, y + lift, z);
      uv.push((side * hw) * uScale, s * vScale);
    }
  }
  for (let i = 0; i < P.length - 1; i++) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return ensureUp(g);
}

/** Decupeaza un poligon (oricat de concav) cu un dreptunghi - Sutherland-Hodgman. */
function clipRect(poly, x0, x1, z0, z1) {
  let p = poly;
  const edges = [
    [(q) => q[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]],
    [(q) => q[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [(q) => q[1] >= z0, (a, b) => [a[0] + (b[0] - a[0]) * (z0 - a[1]) / (b[1] - a[1]), z0]],
    [(q) => q[1] <= z1, (a, b) => [a[0] + (b[0] - a[0]) * (z1 - a[1]) / (b[1] - a[1]), z1]],
  ];
  for (const [inside, cut] of edges) {
    if (p.length === 0) break;
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i];
      const ia = inside(a), ib = inside(b);
      if (ib) { if (!ia) out.push(cut(a, b)); out.push(b); } else if (ia) out.push(cut(a, b));
    }
    p = out;
  }
  return p;
}

/**
 * Terenul: plasa pe grila detaliata (iarba), plus prundisul albiei construit
 * EXACT pe conturul OSM - celulele de la mal sunt decupate cu poligonul, deci
 * linia malului nu mai are trepte de grila. `stride` reduce densitatea pe telefon.
 */
export function terrainGeos(stride = 1) {
  const st = DG.step * stride;
  const nx = Math.floor((DG.nx - 1) / stride) + 1, nz = Math.floor((DG.nz - 1) / stride) + 1;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = DG.x0 + i * st, z = DG.z0 + j * st, k = j * nx + i;
    pos[k * 3] = x; pos[k * 3 + 1] = surfaceY(x, z) - 0.045; pos[k * 3 + 2] = z;
    uv[k * 2] = x / 3.2; uv[k * 2 + 1] = z / 3.2;
  }
  const grass = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    grass.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(grass);
  ensureUp(g);

  // prundisul: celulele din interior intregi, cele de la mal decupate
  const bp = [], bu = [], bi = [];
  const vert = (x, z) => {
    bp.push(x, surfaceY(x, z) - 0.015, z); bu.push(x / 3.2, z / 3.2);
    return bp.length / 3 - 1;
  };
  const bst = DG.step * Math.max(1, stride);
  for (const poly of WATER_POLYS) {
    const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]);
    const X0 = Math.min(...xs), X1 = Math.max(...xs), Z0 = Math.min(...zs), Z1 = Math.max(...zs);
    for (let x = Math.floor(X0 / bst) * bst; x < X1; x += bst) {
      for (let z = Math.floor(Z0 / bst) * bst; z < Z1; z += bst) {
        const inAll = pip(x, z, poly) && pip(x + bst, z, poly) && pip(x, z + bst, poly) && pip(x + bst, z + bst, poly)
          && !poly.some((q) => q[0] > x && q[0] < x + bst && q[1] > z && q[1] < z + bst);
        if (inAll) {
          const a = vert(x, z), b = vert(x + bst, z), c = vert(x, z + bst), d = vert(x + bst, z + bst);
          bi.push(a, c, b, b, c, d);
          continue;
        }
        const piece = clipRect(poly, x, x + bst, z, z + bst);
        if (piece.length < 3) continue;
        const v2 = piece.map((q) => new THREE.Vector2(q[0], q[1]));
        let tris;
        try { tris = THREE.ShapeUtils.triangulateShape(v2, []); } catch (e) { continue; }
        const base = piece.map((q) => vert(q[0], q[1]));
        for (const t of tris) bi.push(base[t[0]], base[t[1]], base[t[2]]);
      }
    }
  }
  const b = new THREE.BufferGeometry();
  b.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  b.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2));
  b.setIndex(bi);
  // triunghiurile decupate pot avea orice sens: le intoarcem individual in sus
  // si le aruncam pe cele degenerate (arie ~0, raman de la decuparea pe margine)
  const P = b.attributes.position, I = b.index.array, keep = [];
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k], c = I[k + 1], d = I[k + 2];
    const e1x = P.getX(c) - P.getX(a), e1z = P.getZ(c) - P.getZ(a);
    const e2x = P.getX(d) - P.getX(a), e2z = P.getZ(d) - P.getZ(a);
    const cr = e1z * e2x - e1x * e2z;
    if (Math.abs(cr) < 1e-5) continue;
    if (cr < 0) keep.push(a, d, c); else keep.push(a, c, d);
  }
  b.setIndex(keep);
  b.computeVertexNormals();
  // varfurile ramase fara triunghi valid primesc normala verticala
  const N = b.attributes.normal;
  for (let i = 0; i < N.count; i++) {
    if (!(N.getY(i) > 0.05)) N.setXYZ(i, 0, 1, 0);
  }
  return { grass: g, bed: b };
}

/** Relieful larg din jur (dealurile de peste rau), cu gaura sub zona fina. */
export function backdropGeo() {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < BG.nz; j++) for (let i = 0; i < BG.nx; i++) {
    const x = BG.x0 + i * BG.step, z = BG.z0 + j * BG.step;
    pos.push(x, BG.h[j * BG.nx + i] - 0.4, z);
    uv.push(x / 12, z / 12);
  }
  const inner = (x, z) => x > DETAIL[0] + 30 && x < DETAIL[1] - 30 && z > DETAIL[2] + 30 && z < DETAIL[3] - 30;
  for (let j = 0; j < BG.nz - 1; j++) for (let i = 0; i < BG.nx - 1; i++) {
    const x = BG.x0 + i * BG.step, z = BG.z0 + j * BG.step;
    if (inner(x, z) && inner(x + BG.step, z + BG.step)) continue;
    const a = j * BG.nx + i, b = a + 1, c = a + BG.nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return ensureUp(g);
}

/** Directia nordului adevarat in cadrul jocului (pentru busola hartii). */
export const NORTH = (() => {
  const a = ZONA.meta.azimuthDeg * Math.PI / 180;
  return { x: -Math.sin(a), z: -Math.cos(a) };
})();
