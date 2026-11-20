import { GEO, heightAt, inPoly, polyDist } from './data.js';
import { footprintIndex } from './buildings.js';
import { onRoad } from './roadbed.js';

// The houses OSM lacks (V112). The user's drone photos (27 Sep 2026) show about three times the houses OSM maps along
// some streets (Strada Zarzărului: 11 mapped, 30-odd in photo 163818), with their sheds, garages and summer kitchens.
// Microsoft's Global ML Building Footprints (ODbL; traced by a neural network from Bing's aerial imagery) has them:
// geo/ml_footprints.py projects its tile like the map, moves it onto OSM by the two imageries' measured offset and
// keeps those OSM lacks (assets/geo/ml_buildings.json: ~2400 houses, ~2100 sheds and garages, a few works).
// Here, once the roads are planned (their ribbons fitted round the mapped buildings), each one is kept only clear of:
// the planned ribbons (0.3 m round them), the places built after the photos (every hole: squares, yards, verges,
// bridges), the hand-built street of the photos (its lots and verges), the water, the buildings already there and
// each other. Its ground is read off the terrain as the places left it; the map's trees inside it (and 1.5 m round)
// and the forest cells under it (4 m round) are taken away. conformTerrain then keeps the ground under it as under
// the mapped houses, anexe.js gives it a yard (trees, shrubs, a fence at the street) and buildings.js its walls and
// roof.
export function addFootprints() {
  const ML = GEO.mlBuildings, t0 = performance.now();
  const stats = { ml: ML?.length ?? 0, kept: 0, street: 0, road: 0, hole: 0, water: 0, built: 0, trees: 0, forest: 0, ms: 0 };
  if (!ML?.length) return stats;
  const inBld = footprintIndex();
  // the hand-built street of the photos (world.js): its photographed lots (their fences on to z 56) and the verges and
  // fences along it (x -3.3 to 3.7, from z -150); the mapped houses round them stay, behind its fences
  const street = GEO.meta.street, lots = GEO.meta.lots ?? [-35, 35, -60, 45];
  const handBuilt = (x, z) => (x > lots[0] - 3 && x < lots[1] + 3 && z > lots[2] - 3 && z < lots[3] + 13) || (x > -5 && x < 5.2 && z > street.z0 - 37 && z < street.z1 + 10);
  // the water's cells: the near grid's 5 m ones, the world grid's 10 m ones beyond it
  const water = new Set((GEO.water || []).map(([i, j]) => i + ',' + j)), water2 = new Set((GEO.water2 || []).map(([i, j]) => i + ',' + j)), W = GEO.W;
  const wet = (x, z) => Math.abs(x) < GEO.ext && Math.abs(z) < GEO.ext ? water.has(Math.floor((x + GEO.ext) / GEO.step) + ',' + Math.floor((z + GEO.ext) / GEO.step))
    : !!W && water2.has(Math.floor((x + W.ext) / W.step) + ',' + Math.floor((z + W.ext) / W.step));
  // the holes in 50 m cells (a house is tested against the few round it)
  const HC = 50, hcell = new Map();
  for (const h of GEO.holes || []) {
    for (let i = Math.floor(h.x0 / HC); i <= Math.floor(h.x1 / HC); i++) for (let j = Math.floor(h.z0 / HC); j <= Math.floor(h.z1 / HC); j++) {
      const k = i + ',' + j; if (!hcell.has(k)) hcell.set(k, []); hcell.get(k).push(h);
    }
  }
  // the map's trees in 10 m cells
  const T = GEO.trees, tcell = new Map();
  for (let i = 0; i < T.n; i++) { const k = Math.floor(T.x[i] / 10) + ',' + Math.floor(T.z[i] / 10); if (!tcell.has(k)) tcell.set(k, []); tcell.get(k).push(i); }
  const F = GEO.forest, FB = GEO.forestBits;
  // the footprints kept so far, in 20 m cells (no two of them through each other)
  const KC = 20, kcell = new Map();
  const inKept = (x, z, pad) => {
    for (const P of kcell.get(Math.floor(x / KC) + ',' + Math.floor(z / KC)) ?? []) if (inPoly(P, x, z) || polyDist(P, x, z) < pad) return true;
    return false;
  };
  const added = [];
  for (const b of ML) {
    const P = [];
    let cx = 0, cz = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < b.p.length; i += 2) {
      const x = b.p[i], z = b.p[i + 1];
      P.push([x, z]); cx += x; cz += z;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    cx /= P.length; cz /= P.length;
    // the probes: the centre and the sides every 2 m or less (from each corner)
    const probe = [[cx, cz]];
    for (let k = 0; k < P.length; k++) {
      const A = P[k], C = P[(k + 1) % P.length], m = Math.max(1, Math.ceil(Math.hypot(C[0] - A[0], C[1] - A[1]) / 2));
      for (let s = 0; s < m; s++) probe.push([A[0] + (C[0] - A[0]) * s / m, A[1] + (C[1] - A[1]) * s / m]);
    }
    if (probe.some(([x, z]) => handBuilt(x, z))) { stats.street++; continue; }
    if (probe.some(([x, z]) => onRoad(x, z, 0.3))) { stats.road++; continue; }
    const holes = new Set();
    for (let i = Math.floor(x0 / HC); i <= Math.floor(x1 / HC); i++) for (let j = Math.floor(z0 / HC); j <= Math.floor(z1 / HC); j++)
      for (const h of hcell.get(i + ',' + j) ?? []) if (h.x1 > x0 && h.x0 < x1 && h.z1 > z0 && h.z0 < z1) holes.add(h);
    if (holes.size && probe.some(([x, z]) => [...holes].some(h => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1 && h.test(x, z)))) { stats.hole++; continue; }
    if (probe.some(([x, z]) => wet(x, z))) { stats.water++; continue; }
    if (probe.some(([x, z]) => inBld(x, z, 0.2) || inKept(x, z, 0.2))) { stats.built++; continue; }
    // its ground as the terrain now is (the places level theirs before this)
    let y0 = Infinity, y1 = -Infinity;
    for (const [x, z] of probe) { const y = heightAt(x, z); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const rec = { ...b, y0: Math.round(y0 * 100) / 100, y1: Math.round(y1 * 100) / 100 };
    // a shed's walls: boards on two in five (as anexe.js's), sheet or render on the rest
    if (b.b === 'shed') { let h = 2166136261; for (const ch of String(b.id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); if ((h >>> 0) % 5 < 2) rec.o = { wall: 'woodDark' }; }
    added.push(rec);
    for (let i = Math.floor(x0 / KC); i <= Math.floor(x1 / KC); i++) for (let j = Math.floor(z0 / KC); j <= Math.floor(z1 / KC); j++) {
      const k = i + ',' + j; if (!kcell.has(k)) kcell.set(k, []); kcell.get(k).push(P);
    }
    // the map's trees standing in it or against its walls
    for (let i = Math.floor((x0 - 2) / 10); i <= Math.floor((x1 + 2) / 10); i++) for (let j = Math.floor((z0 - 2) / 10); j <= Math.floor((z1 + 2) / 10); j++)
      for (const t of tcell.get(i + ',' + j) ?? []) if (T.s[t] > 0 && (inPoly(P, T.x[t], T.z[t]) || polyDist(P, T.x[t], T.z[t]) < 1.5)) { T.s[t] = 0; stats.trees++; }
    // the forest cells under it
    if (FB) {
      const i0 = Math.max(0, Math.floor((x0 - 4 + F.ext) / F.step)), i1 = Math.min(F.n - 1, Math.ceil((x1 + 4 + F.ext) / F.step));
      const j0 = Math.max(0, Math.floor((z0 - 4 + F.ext) / F.step)), j1 = Math.min(F.n - 1, Math.ceil((z1 + 4 + F.ext) / F.step));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -F.ext + i * F.step, z = -F.ext + j * F.step, k = j * F.n + i;
        if (!((FB[k >> 2] >> ((k & 3) << 1)) & 3) || !(inPoly(P, x, z) || polyDist(P, x, z) <= 4)) continue;
        FB[k >> 2] &= ~(3 << ((k & 3) << 1)); stats.forest++;
      }
    }
  }
  GEO.buildings.push(...added);
  stats.kept = added.length;
  stats.ms = Math.round(performance.now() - t0);
  GEO.mlLog = stats;
  return stats;
}
