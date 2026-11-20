import { GEO, heightAt, inHole, holeFlag, forestCode } from './data.js';
import { footprintIndex } from './buildings.js';
import { rng } from '../util.js';

// The lots' outbuildings. In the user's drone photos of the streets by the Prahova (18 Oct 2026) every house has a
// shed, a summer kitchen or a garage behind it (often two), with a sheet roof, bare or rusty: about as many again as the
// houses, and OSM maps few of them. So behind a mapped house (away from its street), clear of the other buildings,
// the roads, the rails, the water, the woods and the places built after photos, stand 1-2 of them: 2.5-4.5 x 3-6 m, a
// single storey with a flat sheet roof (buildings.js: walls of the sheds' kind, the sheet bare, rusty or painted).
// The mapped yard trees standing where one goes are taken away.
const HOUSE = new Set(['house', 'yes', 'residential', 'detached', 'semidetached_house', 'bungalow']);

function area(p) { let a = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i] * p[j + 1] - p[j] * p[i + 1]; } return Math.abs(a) / 2; }

export function addOutbuildings() {
  const inBld = footprintIndex();
  // road and rail segments in 40 m cells: [ax, az, bx, bz, half width, a street?]
  const C = 40, segs = new Map();
  const addSeg = (ax, az, bx, bz, hw, st) => {
    for (let i = Math.floor((Math.min(ax, bx) - hw) / C); i <= Math.floor((Math.max(ax, bx) + hw) / C); i++)
      for (let j = Math.floor((Math.min(az, bz) - hw) / C); j <= Math.floor((Math.max(az, bz) + hw) / C); j++) {
        const k = i + ',' + j; if (!segs.has(k)) segs.set(k, []); segs.get(k).push([ax, az, bx, bz, hw, st]);
      }
  };
  // (V112) the streets a house fronts and a lot's fence follows: not the footpaths, the steps or the rails
  const STREET = new Set(['residential', 'living_street', 'service', 'unclassified', 'track', 'tertiary', 'secondary', 'primary', 'trunk', 'tertiary_link', 'secondary_link', 'primary_link', 'trunk_link']);
  for (const r of GEO.roads) for (let i = 0; i + 3 < r.p.length; i += 2) addSeg(r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3], (r.w ?? 4) / 2, STREET.has(r.c));
  for (const r of GEO.rails) for (let i = 0; i + 3 < r.p.length; i += 2) addSeg(r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3], 3, false);
  // the nearest road or rail edge (streets: the nearest street's): [distance beyond its edge, the nearest point]
  const nearest = (x, z, R, streets = false) => {
    let best = [Infinity, null];
    for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++) for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++) {
      for (const [ax, az, bx, bz, hw, st] of segs.get(i + ',' + j) ?? []) {
        if (streets && !st) continue;
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz) - hw;
        if (d < best[0]) best = [d, [px, pz]];
      }
    }
    return best;
  };
  // the water's cells: the near grid's 5 m ones, the world grid's 10 m ones beyond it (V112: the yards reach there)
  const water = new Set((GEO.water || []).map(([i, j]) => i + ',' + j)), water2 = new Set((GEO.water2 || []).map(([i, j]) => i + ',' + j)), W = GEO.W;
  const nearGrid = (x, z) => Math.abs(x) < GEO.ext && Math.abs(z) < GEO.ext;
  const wet = (x, z) => nearGrid(x, z) ? water.has(Math.floor((x + GEO.ext) / GEO.step) + ',' + Math.floor((z + GEO.ext) / GEO.step))
    : !!W && water2.has(Math.floor((x + W.ext) / W.step) + ',' + Math.floor((z + W.ext) / W.step));
  // the mapped trees in 10 m cells (to take away the ones a shed stands on)
  const T = GEO.trees, tcell = new Map();
  for (let i = 0; i < T.n; i++) { const k = Math.floor(T.x[i] / 10) + ',' + Math.floor(T.z[i] / 10); if (!tcell.has(k)) tcell.set(k, []); tcell.get(k).push(i); }
  // the sheds placed, in 10 m cells (V112: tens of thousands of yards ask): is (x, z) more than gap beyond each one's
  // reach (half its diagonal, 3.75 m at most)?
  const placed = new Map(), street = GEO.meta.street, added = [], lots = GEO.meta.lots ?? [-35, 35, -60, 45];
  // the hand-built street of the photos (world.js): its photographed lots (their fences on to z 56), its verges and fences
  const handBuilt = (x, z) => (x > lots[0] - 3 && x < lots[1] + 3 && z > lots[2] - 3 && z < lots[3] + 13) || (x > -5 && x < 5.2 && z > street.z0 - 37 && z < street.z1 + 10);
  const place = (x, z, r) => { const k = Math.floor(x / 10) + ',' + Math.floor(z / 10); if (!placed.has(k)) placed.set(k, []); placed.get(k).push([x, z, r]); };
  const clearOf = (x, z, gap = 1.2) => {
    for (let i = Math.floor((x - 3.8 - gap) / 10); i <= Math.floor((x + 3.8 + gap) / 10); i++) for (let j = Math.floor((z - 3.8 - gap) / 10); j <= Math.floor((z + 3.8 + gap) / 10); j++)
      for (const [px, pz, pr] of placed.get(i + ',' + j) ?? []) if (Math.hypot(px - x, pz - z) <= pr + gap) return false;
    return true;
  };
  // (V112) the buildings of the aerial footprints (amprente.js) in 20 m cells, by their centres: where one stands behind
  // a house its yard has its real shed or summer kitchen, and gets no generated one
  const mcell = new Map();
  for (const b of GEO.buildings) {
    if (!String(b.id).startsWith('ml')) continue;
    let x = 0, z = 0; for (let i = 0; i < b.p.length; i += 2) { x += b.p[i]; z += b.p[i + 1]; }
    x /= b.p.length / 2; z /= b.p.length / 2;
    const k = Math.floor(x / 20) + ',' + Math.floor(z / 20); if (!mcell.has(k)) mcell.set(k, []); mcell.get(k).push([x, z, b]);
  }
  const realBehind = (b, cx, cz, bx, bz, back, side) => {
    for (let i = Math.floor((cx - 32) / 20); i <= Math.floor((cx + 32) / 20); i++) for (let j = Math.floor((cz - 32) / 20); j <= Math.floor((cz + 32) / 20); j++)
      for (const [x, z, m] of mcell.get(i + ',' + j) ?? []) {
        if (m === b) continue;
        const v = (x - cx) * bx + (z - cz) * bz, u = -(x - cx) * bz + (z - cz) * bx;
        if (v > back - 1 && v < back + 26 && Math.abs(u) < side + 6) return true;
      }
    return false;
  };
  for (const b of GEO.buildings) {
    if (!HOUSE.has(b.b) || b.o || (b.lv ?? 1) > 3 || !b.r?.length) continue;
    const A = area(b.p);
    if (A < 50 || A > 300) continue;
    let cx = 0, cz = 0; const n = b.p.length / 2;
    for (let i = 0; i < b.p.length; i += 2) { cx += b.p[i]; cz += b.p[i + 1]; }
    cx /= n; cz /= n;
    if (handBuilt(cx, cz)) continue;
    if (inHole(cx, cz) || holeFlag(cx, cz, 'noFences')) continue;
    let h = 2166136261; for (const ch of String(b.id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const R = rng(h >>> 0);
    // the back of the lot: away from the nearest road (a house with none near looks any way)
    const [dr, q] = nearest(cx, cz, 45, true);
    let bx, bz;
    if (q && dr < 40) { const l = Math.hypot(cx - q[0], cz - q[1]) || 1; bx = (cx - q[0]) / l; bz = (cz - q[1]) / l; }
    else { const a = R() * Math.PI * 2; bx = Math.cos(a); bz = Math.sin(a); }
    // the house's reach along the back and across
    let back = 0, side = 0;
    for (let i = 0; i < b.p.length; i += 2) { const dx = b.p[i] - cx, dz = b.p[i + 1] - cz; back = Math.max(back, dx * bx + dz * bz); side = Math.max(side, Math.abs(-dx * bz + dz * bx)); }
    const count = R() < 0.72 ? (R() < 0.3 ? 2 : 1) : 0;
    if (count && realBehind(b, cx, cz, bx, bz, back, side)) continue;
    for (let k = 0; k < count; k++) {
      const w = 2.5 + R() * 2, d = 3 + R() * 3, gap = 1.5 + R() * 5 + k * 6.5, off = (R() - 0.5) * 2 * side;
      const sx = cx + bx * (back + gap + d / 2) - bz * off, sz = cz + bz * (back + gap + d / 2) + bx * off;
      // the corners (the shed stands square to the house's back; wound as OSM's footprints), its centre and the
      // midpoints of its sides
      const P = [[-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2]].map(([u, v]) => [sx - bz * u + bx * v, sz + bx * u + bz * v]);
      const probe = [...P, [sx, sz], ...P.map((p, i) => [(p[0] + P[(i + 1) % 4][0]) / 2, (p[1] + P[(i + 1) % 4][1]) / 2])];
      if (probe.some(([x, z]) => inBld(x, z, 1.0) || inHole(x, z) || wet(x, z) || forestCode(x, z) || nearest(x, z, 12)[0] < 2.5 || handBuilt(x, z))) continue;
      if (!clearOf(sx, sz)) continue;
      const ys = P.map(([x, z]) => heightAt(x, z)), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (y1 - y0 > 1.2) continue;                                                          // (too steep a spot)
      place(sx, sz, Math.hypot(w, d) / 2);
      added.push({ id: b.id + 'a' + k, p: P.flat().map(v => Math.round(v * 100) / 100), y0, y1, b: 'shed', lv: 1, r: [[sx, sz, w / 2, d / 2, Math.atan2(bx, -bz)]], roof: 'shed', o: R() < 0.4 ? { wall: 'woodDark' } : undefined });
      for (let i = Math.floor((sx - 6) / 10); i <= Math.floor((sx + 6) / 10); i++) for (let j = Math.floor((sz - 6) / 10); j <= Math.floor((sz + 6) / 10); j++)
        for (const t of tcell.get(i + ',' + j) ?? []) {
          const dx = T.x[t] - sx, dz = T.z[t] - sz, u = -dx * bz + dz * bx, v = dx * bx + dz * bz;
          if (Math.abs(u) < w / 2 + 0.8 && Math.abs(v) < d / 2 + 0.8) T.s[t] = 0;
        }
    }
  }
  GEO.buildings.push(...added);

  // The yards' trees and shrubs round the station and the streets of the user's drone photos (27 Sep 2026): every yard
  // there has two or three fruit trees, now and then a walnut or a young spruce, shrubs and a hedge by the house, where
  // the map's trees (from the satellite's 10 m pixels) give a yard one tree at most. Behind and beside each house (away
  // from its road), clear of it, of the sheds just placed, of the roads and rails, of the trees already there; the
  // places built from photos (the holes) keep theirs.
  // (V112) every house of the map, the aerial footprints' among them, not only those round the station; beyond the near
  // grid (3 km), where one comes by car, 2-3 plants a yard
  const YE = GEO.worldExt - 30, inYards = (x, z) => Math.abs(x) < YE && Math.abs(z) < YE;
  const yard = [], ycell = new Map();
  const KINDS = [[3, 0.8, 1.25, 3.2], [3, 0.8, 1.25, 3.2], [11, 0.8, 1.3, 1.6], [3, 0.75, 1.15, 3.2], [11, 0.7, 1.2, 1.6], [4, 0.7, 1.0, 5.0], [2, 0.38, 0.62, 3.0]];
  const crowded = (x, z, sp) => {
    for (let i = Math.floor((x - 6) / 10); i <= Math.floor((x + 6) / 10); i++) for (let j = Math.floor((z - 6) / 10); j <= Math.floor((z + 6) / 10); j++) {
      for (const t of tcell.get(i + ',' + j) ?? []) if (T.s[t] > 0 && Math.hypot(T.x[t] - x, T.z[t] - z) < sp) return true;
      for (const [yx, yz, ys] of ycell.get(i + ',' + j) ?? []) if (Math.hypot(yx - x, yz - z) < Math.max(sp, ys)) return true;
    }
    return false;
  };
  for (const b of GEO.buildings) {
    if (!HOUSE.has(b.b) || b.o || (b.lv ?? 1) > 3 || !b.r?.length) continue;
    const A = area(b.p);
    if (A < 50 || A > 300) continue;
    let cx = 0, cz = 0; const n = b.p.length / 2;
    for (let i = 0; i < b.p.length; i += 2) { cx += b.p[i]; cz += b.p[i + 1]; }
    cx /= n; cz /= n;
    if (!inYards(cx, cz)) continue;
    if (handBuilt(cx, cz)) continue;                                                        // (the lots of the street of the photos)
    if (inHole(cx, cz) || holeFlag(cx, cz, 'noFences')) continue;
    let h = 2166136261; for (const ch of String(b.id) + 'y') h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const R = rng(h >>> 0);
    const [dr, q] = nearest(cx, cz, 45, true);
    let bx, bz;
    if (q && dr < 40) { const l = Math.hypot(cx - q[0], cz - q[1]) || 1; bx = (cx - q[0]) / l; bz = (cz - q[1]) / l; }
    else { const a = R() * Math.PI * 2; bx = Math.cos(a); bz = Math.sin(a); }
    let back = 0, front = 0, side = 0;
    for (let i = 0; i < b.p.length; i += 2) { const dx = b.p[i] - cx, dz = b.p[i + 1] - cz, v = dx * bx + dz * bz; back = Math.max(back, v); front = Math.max(front, -v); side = Math.max(side, Math.abs(-dx * bz + dz * bx)); }
    const count = nearGrid(cx, cz) ? 4 + (R() < 0.6 ? 1 : 0) + (R() < 0.35 ? 1 : 0) : 2 + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const [type, s0, s1, sp] = KINDS[k < 2 ? k : Math.floor(R() * KINDS.length)];
      for (let tr = 0; tr < 8; tr++) {
        // a shrub goes by the house now and then (the hedge, the lilac by the porch); the rest behind it and to its sides
        const byHouse = type === 11 && R() < 0.35;
        const v = byHouse ? (R() < 0.5 ? back + 1.2 + R() * 1.5 : -(front + 1.2 + R() * 2)) : back + 1.8 + R() * 14;
        const u = (R() - 0.5) * 2 * (side + (byHouse ? 1.5 : 5));
        const x = cx + bx * v - bz * u, z = cz + bz * v + bx * u;
        const clearance = type === 11 ? 1.3 : type === 4 ? 3.5 : 2.4;
        if (inBld(x, z, type === 11 ? 0.8 : 1.6) || inHole(x, z) || holeFlag(x, z, 'noFences') || wet(x, z) || forestCode(x, z) || handBuilt(x, z)) continue;
        if (nearest(x, z, 10)[0] < clearance || !clearOf(x, z, clearance * 0.6) || crowded(x, z, sp)) continue;
        const sc = s0 + R() * (s1 - s0);
        yard.push([x, z, type, sc]);
        const key = Math.floor(x / 10) + ',' + Math.floor(z / 10);
        if (!ycell.has(key)) ycell.set(key, []);
        ycell.get(key).push([x, z, sp]);
        break;
      }
    }
  }
  if (yard.length) {
    const m = T.n + yard.length, x = new Float32Array(m), z = new Float32Array(m), t = new Uint8Array(m), s = new Float32Array(m);
    x.set(T.x.subarray(0, T.n)); z.set(T.z.subarray(0, T.n)); t.set(T.t.subarray(0, T.n)); s.set(T.s.subarray(0, T.n));
    yard.forEach(([ax, az, at, as], k) => { x[T.n + k] = ax; z[T.n + k] = az; t[T.n + k] = at; s[T.n + k] = as; });
    GEO.trees = { n: m, x, z, t, s };
    if (T.keep) { GEO.trees.keep = new Uint8Array(m); GEO.trees.keep.set(T.keep.subarray(0, T.n)); }
  }
  GEO.yardTrees = yard.length;

  // The fences along the streets there: in the drone photos every house has one at the street's edge - painted sheet,
  // old boards, pickets, wrought iron on a rendered base, wire mesh, now and then a rendered wall - with the gate in
  // front of the house; the map has almost none of them. Along the nearest street (V112: not a footpath or the rails),
  // 0.6-1.2 m in from its edge, over the lot's whole front (to halfway to the next house along the street; without one,
  // 2-5 m past the house), the gate's 3.2 m left open in front of the house; not across another fence, a house or a
  // road.
  const FSTYLE = [[2, 0.35], [5, 0.2], [0, 0.15], [4, 0.15], [1, 0.1], [3, 0.05]];
  const fcell = new Map(), fput = (x, z) => { const k = Math.floor(x / 8) + ',' + Math.floor(z / 8); if (!fcell.has(k)) fcell.set(k, []); fcell.get(k).push([x, z]); };
  for (const f of GEO.fences) for (let i = 1; i < f.length; i += 2) fput(f[i], f[i + 1]);
  const fenced = (x, z, r) => {
    for (let i = Math.floor((x - r) / 8); i <= Math.floor((x + r) / 8); i++) for (let j = Math.floor((z - r) / 8); j <= Math.floor((z + r) / 8); j++)
      for (const [fx, fz] of fcell.get(i + ',' + j) ?? []) if (Math.hypot(fx - x, fz - z) < r) return true;
    return false;
  };
  // (V112) the houses in 50 m cells: a fence runs along its lot's whole front, on to halfway to the next house along the
  // street, as in the drone photos (one fence after another, the gates in front of the houses)
  const hcell = new Map();
  for (const b of GEO.buildings) {
    if (!HOUSE.has(b.b) || String(b.id).includes('a') || area(b.p) < 40) continue;
    let x = 0, z = 0; for (let i = 0; i < b.p.length; i += 2) { x += b.p[i]; z += b.p[i + 1]; }
    x /= b.p.length / 2; z /= b.p.length / 2;
    const k = Math.floor(x / 50) + ',' + Math.floor(z / 50); if (!hcell.has(k)) hcell.set(k, []); hcell.get(k).push([x, z, b]);
  }
  let nf = 0, ng = 0;
  for (const b of GEO.buildings) {
    if (!HOUSE.has(b.b) || b.o || (b.lv ?? 1) > 3 || !b.r?.length || String(b.id).includes('a')) continue;
    const A = area(b.p);
    if (A < 50 || A > 300) continue;
    let cx = 0, cz = 0; const n = b.p.length / 2;
    for (let i = 0; i < b.p.length; i += 2) { cx += b.p[i]; cz += b.p[i + 1]; }
    cx /= n; cz /= n;
    if (!inYards(cx, cz)) continue;
    if (handBuilt(cx, cz)) continue;
    if (inHole(cx, cz) || holeFlag(cx, cz, 'noFences')) continue;
    const [dr, q] = nearest(cx, cz, 30, true);
    if (!q || dr > 22) continue;
    let h = 2166136261; for (const ch of String(b.id) + 'f') h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const R = rng(h >>> 0);
    // the road's way here (along it) and the way to the house (across it)
    const l = Math.hypot(cx - q[0], cz - q[1]) || 1, nx = (cx - q[0]) / l, nz = (cz - q[1]) / l, ux = -nz, uz = nx;
    const roadHalf = l - dr;                                  // (nearest gives the distance beyond the road's edge)
    let s0 = Infinity, s1 = -Infinity;
    for (let i = 0; i < b.p.length; i += 2) { const s = (b.p[i] - q[0]) * ux + (b.p[i + 1] - q[1]) * uz; s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
    const hs0 = s0, hs1 = s1;
    s0 -= 2 + R() * 3; s1 += 2 + R() * 3;
    const off = roadHalf + 0.6 + R() * 0.6, gate = (s0 + s1) / 2 + (R() - 0.5) * (s1 - s0) * 0.4;
    // the lot's ends: halfway to the next house each way along the street (one on this side, fronting it), 12 m at most
    let lo = -Infinity, hi = Infinity;
    for (let i = Math.floor((cx - 45) / 50); i <= Math.floor((cx + 45) / 50); i++) for (let j = Math.floor((cz - 45) / 50); j <= Math.floor((cz + 45) / 50); j++)
      for (const [mx, mz, m] of hcell.get(i + ',' + j) ?? []) {
        if (m === b || Math.hypot(mx - cx, mz - cz) > 45) continue;
        let m0 = Infinity, m1 = -Infinity, v0 = Infinity;
        for (let k = 0; k < m.p.length; k += 2) {
          const dx = m.p[k] - q[0], dz = m.p[k + 1] - q[1], su = dx * ux + dz * uz;
          m0 = Math.min(m0, su); m1 = Math.max(m1, su); v0 = Math.min(v0, dx * nx + dz * nz);
        }
        if (v0 < 0 || v0 > 25) continue;
        if (m1 <= hs0) lo = Math.max(lo, (m1 + hs0) / 2);
        else if (m0 >= hs1) hi = Math.min(hi, (hs1 + m0) / 2);
      }
    if (lo > -Infinity) s0 = Math.max(hs0 - 12, lo + 0.3);
    if (hi < Infinity) s1 = Math.min(hs1 + 12, hi - 0.3);
    let u = R(), style = 2; for (const [st, w] of FSTYLE) { if (u < w) { style = st; break; } u -= w; }
    const at = (s) => [q[0] + ux * s + nx * off, q[1] + uz * s + nz * off];
    // the run in 1 m steps, cut where it would cross a house, a road, another fence or a hole
    let run = [], gpts = null, gput = [];
    // (a run is straight: its two ends; buildFences cuts it into pieces of 4 m or less that follow the ground; the
    // gate's points are put down with the run after it, which goes on from the gate's last post)
    const ends = (P) => [P[0], P[P.length - 1]].flat().map(v => Math.round(v * 100) / 100);
    const flush = () => { if (run.length >= 3) { GEO.fences.push([style, ...ends(run)]); nf++; for (const p of run) fput(...p); } run = []; for (const p of gput) fput(...p); gput = []; };
    for (let s = s0; s <= s1 + 1e-6; s += 1) {
      const [x, z] = at(s);
      const bad = inBld(x, z, 0.6) || nearest(x, z, 8)[0] < 0.3 || inHole(x, z) || holeFlag(x, z, 'noFences') || wet(x, z) || fenced(x, z, 1.5) || handBuilt(x, z);
      if (bad) { flush(); gpts = null; continue; }
      // (V112) the gate: from the fence's last post before it to its first after it (the photos: painted sheet, the
      // wrought iron of an iron fence, the boards of a board fence), in place of the 3.2 m left open
      if (Math.abs(s - gate) < 1.6) {
        if (!gpts) { gpts = run.length ? [run[run.length - 1]] : []; flush(); }
        gpts.push([x, z]);
        continue;
      }
      if (gpts) {
        gpts.push([x, z]);
        if (gpts.length >= 4) { GEO.fences.push([style === 4 || style === 5 ? style : 2, ...ends(gpts)]); ng++; gput = gpts; }
        gpts = null;
      }
      run.push([x, z]);
    }
    flush();
  }
  GEO.yardFences = nf; GEO.yardGates = ng;
  return added.length;
}
