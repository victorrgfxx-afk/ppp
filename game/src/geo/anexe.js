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
  // road and rail segments in 40 m cells: [ax, az, bx, bz, half width]
  const C = 40, segs = new Map();
  const addSeg = (ax, az, bx, bz, hw) => {
    for (let i = Math.floor((Math.min(ax, bx) - hw) / C); i <= Math.floor((Math.max(ax, bx) + hw) / C); i++)
      for (let j = Math.floor((Math.min(az, bz) - hw) / C); j <= Math.floor((Math.max(az, bz) + hw) / C); j++) {
        const k = i + ',' + j; if (!segs.has(k)) segs.set(k, []); segs.get(k).push([ax, az, bx, bz, hw]);
      }
  };
  for (const r of GEO.roads) for (let i = 0; i + 3 < r.p.length; i += 2) addSeg(r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3], (r.w ?? 4) / 2);
  for (const r of GEO.rails) for (let i = 0; i + 3 < r.p.length; i += 2) addSeg(r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3], 3);
  // the nearest road or rail edge: [distance beyond its edge, the nearest point]
  const nearest = (x, z, R) => {
    let best = [Infinity, null];
    for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++) for (let j = Math.floor((z - R) / C); j <= Math.floor((z + R) / C); j++) {
      for (const [ax, az, bx, bz, hw] of segs.get(i + ',' + j) ?? []) {
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz) - hw;
        if (d < best[0]) best = [d, [px, pz]];
      }
    }
    return best;
  };
  const water = new Set((GEO.water || []).map(([i, j]) => i + ',' + j));
  const wet = (x, z) => water.has(Math.floor((x + GEO.ext) / GEO.step) + ',' + Math.floor((z + GEO.ext) / GEO.step));
  // the mapped trees in 10 m cells (to take away the ones a shed stands on)
  const T = GEO.trees, tcell = new Map();
  for (let i = 0; i < T.n; i++) { const k = Math.floor(T.x[i] / 10) + ',' + Math.floor(T.z[i] / 10); if (!tcell.has(k)) tcell.set(k, []); tcell.get(k).push(i); }
  const placed = [], street = GEO.meta.street, added = [];
  const clearOf = (x, z) => placed.every(([px, pz, pr]) => Math.hypot(px - x, pz - z) > pr + 1.2);
  for (const b of GEO.buildings) {
    if (!HOUSE.has(b.b) || b.o || (b.lv ?? 1) > 3 || !b.r?.length) continue;
    const A = area(b.p);
    if (A < 50 || A > 300) continue;
    let cx = 0, cz = 0; const n = b.p.length / 2;
    for (let i = 0; i < b.p.length; i += 2) { cx += b.p[i]; cz += b.p[i + 1]; }
    cx /= n; cz /= n;
    if (Math.abs(cx) < 60 && cz > street.z0 - 30 && cz < street.z1 + 30) continue;     // (the street of the photos)
    if (inHole(cx, cz) || holeFlag(cx, cz, 'noFences')) continue;
    let h = 2166136261; for (const ch of String(b.id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const R = rng(h >>> 0);
    // the back of the lot: away from the nearest road (a house with none near looks any way)
    const [dr, q] = nearest(cx, cz, 45);
    let bx, bz;
    if (q && dr < 40) { const l = Math.hypot(cx - q[0], cz - q[1]) || 1; bx = (cx - q[0]) / l; bz = (cz - q[1]) / l; }
    else { const a = R() * Math.PI * 2; bx = Math.cos(a); bz = Math.sin(a); }
    // the house's reach along the back and across
    let back = 0, side = 0;
    for (let i = 0; i < b.p.length; i += 2) { const dx = b.p[i] - cx, dz = b.p[i + 1] - cz; back = Math.max(back, dx * bx + dz * bz); side = Math.max(side, Math.abs(-dx * bz + dz * bx)); }
    const count = R() < 0.72 ? (R() < 0.3 ? 2 : 1) : 0;
    for (let k = 0; k < count; k++) {
      const w = 2.5 + R() * 2, d = 3 + R() * 3, gap = 1.5 + R() * 5 + k * 6.5, off = (R() - 0.5) * 2 * side;
      const sx = cx + bx * (back + gap + d / 2) - bz * off, sz = cz + bz * (back + gap + d / 2) + bx * off;
      // the corners (the shed stands square to the house's back; wound as OSM's footprints), its centre and the
      // midpoints of its sides
      const P = [[-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2]].map(([u, v]) => [sx - bz * u + bx * v, sz + bx * u + bz * v]);
      const probe = [...P, [sx, sz], ...P.map((p, i) => [(p[0] + P[(i + 1) % 4][0]) / 2, (p[1] + P[(i + 1) % 4][1]) / 2])];
      if (probe.some(([x, z]) => inBld(x, z, 1.0) || inHole(x, z) || wet(x, z) || forestCode(x, z) || nearest(x, z, 12)[0] < 2.5)) continue;
      if (!clearOf(sx, sz)) continue;
      const ys = P.map(([x, z]) => heightAt(x, z)), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (y1 - y0 > 1.2) continue;                                                          // (too steep a spot)
      placed.push([sx, sz, Math.hypot(w, d) / 2]);
      added.push({ id: b.id + 'a' + k, p: P.flat().map(v => Math.round(v * 100) / 100), y0, y1, b: 'shed', lv: 1, r: [[sx, sz, w / 2, d / 2, Math.atan2(bx, -bz)]], roof: 'shed', o: R() < 0.4 ? { wall: 'woodDark' } : undefined });
      for (let i = Math.floor((sx - 6) / 10); i <= Math.floor((sx + 6) / 10); i++) for (let j = Math.floor((sz - 6) / 10); j <= Math.floor((sz + 6) / 10); j++)
        for (const t of tcell.get(i + ',' + j) ?? []) {
          const dx = T.x[t] - sx, dz = T.z[t] - sz, u = -dx * bz + dz * bx, v = dx * bx + dz * bz;
          if (Math.abs(u) < w / 2 + 0.8 && Math.abs(v) < d / 2 + 0.8) T.s[t] = 0;
        }
    }
  }
  GEO.buildings.push(...added);
  return added.length;
}
