import { moonAltAz } from '../astro.js';
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
import { preparePitigaia } from './pitigaia.js';
import { prepareMagurii } from './magurii.js';
import { prepareGara } from './gara.js';
import { prepareCastel } from './castel.js';
import { prepareMonument } from './monument.js';
import { prepareCantacuzino } from './cantacuzino.js';
import { prepareHala } from './hala.js';
import { prepareTriaj } from './triaj.js';
import { prepareDrapel } from './drapel.js';
import { buildHillwood } from './hillwood.js';
import { prepareVad } from './vad.js';
import { prepareBreaza } from './breaza.js';
import { preparePastravaria } from './pastravaria.js';
import { preparePopas } from './popas.js';
import { preparePasarela } from './pasarela.js';
import { prepareViteazul } from './viteazul.js';
import { prepareUzinei } from './uzinei.js';
import { prepareBiserica } from './biserica.js';
import { prepareUrcus } from './urcus.js';

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
  preparePitigaia();                                    // Str. Pițigaia: the concrete stretch moved onto the aerial, its ditch
  prepareMagurii();                                     // Str. Măgurii at Str. Tulburii: moved onto the aerial, channel and ditch
  prepareGara();                                        // Strada Gării under the railway: the retaining wall's vertical step
  prepareCastel();                                      // Strada Gării by the water tower: no generated lot fences there
  prepareMonument();                                    // DJ100E at the monument: the carriageway clears the round island
  prepareCantacuzino();                                 // Str. Toma Cantacuzino's slope: continuous centre line, no lot fences
  prepareHala();                                        // the old yard below it: the hall's platform levelled into the slope
  prepareTriaj();                                       // its bottom and Strada Gării by the yard: the old building's style, no lot fences
  prepareDrapel();                                      // the hill of the cross: forests and scrub traced from the aerial, the dirt track
  prepareVad();                                         // the DJ101R bridge: Strada Gării onto the aerial, the deck, the embankment
  prepareBreaza();                                      // its fork onto DN1 at Breaza: the incoming branch onto the aerial, open ground
  preparePastravaria();                                 // DN1 north of the Etu station: 2 lanes a side, shoulders, open verges
  preparePopas();                                       // DN1 at the roadside restaurant: the long profile, the lot, no old houses
  preparePasarela();                                    // DN1 at the Breaza exit: the exit on its ledge, the ground by it, the marl scarps
  prepareViteazul();                                    // Str. Mihai Viteazul up from the exit: onto the aerial, its 1 m ground, no forest on the lots
  prepareUzinei();                                      // Str. Uzinei and Strada Bisericii by the STOP junction: onto the aerial, the works measured
  prepareBiserica();                                    // the painted church, its precinct and the cemetery: no forest there, the school's colours
  prepareUrcus();                                       // the lane up to the cross (the user's clip): its real width, the trees by its first bend
  const terrain = buildTerrain(scene, gt, quality);
  buildFarTerrain(scene, gt);
  const water = buildWater(scene);
  log('teren', performance.now() - t0);
  const { fronts, stats } = buildBuildings(B, world, makeBuildingMaterials());
  const landmarks = buildLandmarks(B, world);
  log('clădiri ' + stats.n, performance.now() - t0);
  paintLawns(gt.splat);
  if (GEO.W && gt.splatW) paintLawns(gt.splatW, GEO.W.ext);        // the lots in the world grid too (Strada Mihai Viteazul)
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
  const hill = buildHillwood(scene, world, quality);        // the hill of the cross up close: grass, litter, ferns, brambles
  log('copaci ' + trees.count + ', pădure ' + trees.forest.count() + ', coronament ' + (canopy ? canopy.meshes.length : 0), performance.now() - t0);
  let cullI = 0, lastCull = null;
  const info = { buildings: stats.n, roads: GEO.roads.length, rails: GEO.rails.length, fences: nFences, poles: pw.nPoles, towers: pw.nTowers, trees: trees.count, forestTrees: trees.forest.count(), water: water.length, meshes: meshes.length };
  return {
    fronts, info, terrain, landmarks, forest: trees.forest, trees,
    update(camPos) {
      trees.update(camPos);
      hill.update(camPos);
      // distance culling of the merged chunks (a few per frame is enough: they change slowly; all at once after a jump)
      const jumped = !lastCull || Math.hypot(camPos.x - lastCull.x, camPos.z - lastCull.z) > 150;
      lastCull = { x: camPos.x, z: camPos.z };
      for (let k = 0, n = jumped ? culled.length : 200; k < n && culled.length; k++) {
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
      const A = P[i], Bp = P[i + 1], ax = A[0], az = A[1], bx = Bp[0], bz = Bp[1];   // (no destructuring: no garbage)
      if (Math.min(ax, bx) - bd > x || Math.max(ax, bx) + bd < x || Math.min(az, bz) - bd > z || Math.max(az, bz) + bd < z) continue;
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
      if (d < bd) { bd = d; best = r.n; }
    }
  }
  return best;
}

// The full moon of 26 September 2026 (astro.js), as a game-frame direction like the sun's.
export function moonDirection(date) {
  const { lat, lon, bearing } = GEO.meta.origin, rad = Math.PI / 180;
  const m = moonAltAz(date, lat, lon), el = m.el * rad, az = m.az * rad;
  const e = Math.sin(az) * Math.cos(el), nn = Math.cos(az) * Math.cos(el), up = Math.sin(el), th = bearing * rad;
  return { dir: new THREE.Vector3(-e * Math.cos(th) + nn * Math.sin(th), up, e * Math.sin(th) + nn * Math.cos(th)).normalize(), el: m.el, az: m.az, illum: m.illum };
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
