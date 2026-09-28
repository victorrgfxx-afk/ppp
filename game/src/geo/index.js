import * as THREE from 'three';
import { GEO, loadGeo, heightAt, GeoBuilder, profileAt, paintLawns } from './data.js';
import { genGeoTextures } from './geotex.js';
import { loadGeoTextures, buildTerrain, buildFarTerrain, buildWater } from './terrain.js';
import { makeBuildingMaterials, buildBuildings, footprintIndex } from './buildings.js';
import { makeRoadMaterials, buildRoads, buildRail, bridgeHeight } from './roads.js';
import { makePropMaterials, buildFences, buildPower, addWires } from './props.js';
import { buildTrees } from './trees.js';
import { buildLandmarks } from './landmarks.js';
import { buildCanopy } from './canopy.js';
import { prepareGrigorescu } from './grigorescu.js';
import { prepareCornu } from './cornu.js';
import { prepareEtu } from './etu.js';

export { GEO, heightAt, profileAt, bridgeHeight, footprintIndex };

export async function loadGeoAll(base) {
  await loadGeo(base);
  genGeoTextures();
  return loadGeoTextures(base);
}

// ground under (x, z) outside the hand-built street: bridge decks, else the terrain mesh
// ref: the height of whoever asks (feet, car): below a deck (driving under a bridge) the terrain counts
export function geoGround(x, z, ref) {
  const t = heightAt(x, z);
  const b = bridgeHeight(x, z);
  if (b === null || b <= t - 0.5 || (ref !== undefined && ref < b - 2.5)) return t;
  return Math.max(b, t);
}

export function buildGeoWorld(scene, world, quality, renderer, gt, log = () => {}) {
  const t0 = performance.now();
  // 750 m chunks around the street, 2 km beyond; merged meshes farther than 6.8 km are hidden (fog)
  const B = new GeoBuilder(750, 2000, GEO.ext, 6800);
  prepareGrigorescu();                                  // levels the sports ground's courts before the terrain is meshed
  prepareCornu();                                       // DN1 at the Cornu roundabout: carriageways to the measured cross-section
  prepareEtu();                                         // DN1 at the Etu station: 2 lanes per carriageway, canopy instead of a house
  const terrain = buildTerrain(scene, gt, quality);
  buildFarTerrain(scene, gt);
  const water = buildWater(scene);
  log('teren', performance.now() - t0);
  const { fronts, stats } = buildBuildings(B, world, makeBuildingMaterials());
  const landmarks = buildLandmarks(B, world);
  log('clădiri ' + stats.n, performance.now() - t0);
  paintLawns(gt.splat);
  const rm = makeRoadMaterials();
  buildRoads(B, world, rm);
  // walkable surfaces of the landmarks (courts, raised sidewalks) take part in the ground height like bridge decks
  for (const l of landmarks) if (l && l.surface && l.bbox) GEO.bridges.push({ fn: l.surface, ...l.bbox, P: [], y: [], w: 0 });
  const lines = [];
  for (const l of landmarks) if (l && l.wires) for (const v of l.wires) lines.push(v);
  buildRail(B, lines, rm);
  const pm = makePropMaterials();
  // small street furniture disappears sooner
  const small = [pm.pole, pm.lamp, pm.insulator, pm.metal, rm.marking, rm.shoulder];
  for (const f of pm.fences) for (const m of [f.m, f.base].flat()) if (m) small.push(m);
  for (const m of small) B.cullFor.set(m, m === rm.shoulder ? 3000 : 1600);
  const nFences = buildFences(B, world, pm);
  const pw = buildPower(B, world, pm, scene);
  for (const v of pw.wires) lines.push(v);
  addWires(scene, lines, pm);
  const meshes = B.build(scene);
  const culled = meshes.filter(m => m.userData.cull > 0).map(m => ({ m, c: m.geometry.boundingSphere.center, r: m.geometry.boundingSphere.radius, d: m.userData.cull }));
  log('drumuri, garduri, stâlpi', performance.now() - t0);
  const trees = buildTrees(scene, world, renderer, quality);
  const canopy = buildCanopy(scene, gt, trees.forest.Q);
  log('copaci ' + trees.count + ', pădure ' + trees.forest.count() + ', coronament ' + (canopy ? canopy.meshes.length : 0), performance.now() - t0);
  let cullI = 0;
  const info = { buildings: stats.n, roads: GEO.roads.length, rails: GEO.rails.length, fences: nFences, poles: pw.nPoles, towers: pw.nTowers, trees: trees.count, forestTrees: trees.forest.count(), water: water.length, meshes: meshes.length };
  return {
    fronts, info, terrain, landmarks, forest: trees.forest,
    update(camPos) {
      trees.update(camPos);
      // distance culling of the merged chunks (a few per frame is enough: they change slowly)
      for (let k = 0; k < 200 && culled.length; k++) {
        const e = culled[cullI = (cullI + 1) % culled.length];
        e.m.visible = Math.hypot(e.c.x - camPos.x, e.c.z - camPos.z) - e.r < e.d;
      }
    },
  };
}

// nearest named road (for the HUD)
export function roadNameAt(x, z) {
  let best = null, bd = 40;
  for (const r of GEO.roadNames || []) {
    const P = r.P;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      if (Math.min(ax, bx) - bd > x || Math.max(ax, bx) + bd < x || Math.min(az, bz) - bd > z || Math.max(az, bz) + bd < z) continue;
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
      if (d < bd) { bd = d; best = r.n; }
    }
  }
  return best;
}

// Sun position (NOAA approximation) for a date/time at the map origin, as a game-frame direction.
export function sunDirection(date) {
  const { lat, lon, bearing } = GEO.meta.origin;
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5, n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) % 360;
  const lam = L + 1.915 * Math.sin(g * rad) + 0.02 * Math.sin(2 * g * rad);
  const eps = 23.439 - 0.0000004 * n;
  const dec = Math.asin(Math.sin(eps * rad) * Math.sin(lam * rad));
  const ra = Math.atan2(Math.cos(eps * rad) * Math.sin(lam * rad), Math.cos(lam * rad));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const ha = ((gmst + lon) * rad - ra);
  const phi = lat * rad;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));  // from north, clockwise
  const e = Math.sin(az) * Math.cos(el), nn = Math.cos(az) * Math.cos(el), up = Math.sin(el);
  const th = bearing * rad;
  return { dir: new THREE.Vector3(-e * Math.cos(th) + nn * Math.sin(th), up, e * Math.sin(th) + nn * Math.cos(th)).normalize(), el: el / rad, az: ((az / rad) + 360) % 360 };
}
