import { moonAltAz } from '../astro.js';
import * as THREE from 'three';
import { GEO, loadGeo, heightAt, GeoBuilder, profileAt, paintLawns, farAt } from './data.js';
import { genGeoTextures } from './geotex.js';
import { loadGeoTextures, buildTerrain, buildFarTerrain, buildHorizon, FAR, terrainLevels } from './terrain.js';
import { buildWater, paintGravelBed } from './water.js';
import { makeBuildingMaterials, buildBuildings, footprintIndex } from './buildings.js';
import { makeRoadMaterials, buildRoads, buildRail, bridgeHeight, planRoads } from './roads.js';
import { prepareRoadbed, fitBuildings, indexPlans, snapJunctions, conformTerrain, roadSurfaceAt, buildBanks } from './roadbed.js';
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
import { buildForestFloor } from './forestfloor.js';
import { prepareVad } from './vad.js';
import { prepareBreaza } from './breaza.js';
import { preparePastravaria } from './pastravaria.js';
import { preparePopas } from './popas.js';
import { preparePasarela } from './pasarela.js';
import { prepareViteazul } from './viteazul.js';
import { prepareUzinei } from './uzinei.js';
import { prepareBiserica } from './biserica.js';
import { prepareUrcus } from './urcus.js';
import { prepareSonda } from './sonda.js';
import { buildWagons } from './wagons.js';
import { addOutbuildings } from './anexe.js';

export { GEO, heightAt, profileAt, bridgeHeight, footprintIndex, FAR };

export async function loadGeoAll(base) {
  await loadGeo(base);
  genGeoTextures();
  return loadGeoTextures(base);
}

// ground under (x, z) outside the hand-built street: bridge decks, else the roads' asphalt, else the terrain mesh
// ref: the height of whoever asks (feet, car): below a deck (driving under a bridge) the terrain or road under it counts
export function geoGround(x, z, ref) {
  let t = heightAt(x, z);
  // on a road its asphalt (roadbed.js keeps the ground a little under it)
  const r = roadSurfaceAt(x, z, ref);
  if (r !== null && r > t) t = r;
  const b = bridgeHeight(x, z);
  if (b === null || b <= t - 0.5 || (ref !== undefined && ref < b - 2.5)) return t;
  return Math.max(b, t);
}

export function buildGeoWorld(scene, world, quality, renderer, gt, log = () => {}) {
  const t0 = performance.now();
  // 750 m chunks around the street, 2 km beyond; the merged meshes are hidden only beyond what the haze lets one see
  // (update: the visibility), the whole map on a clear day
  const B = new GeoBuilder(750, 2000, GEO.ext, 24000);
  const asMapped = new Map(GEO.roads.map(r => [r, { p: r.p.slice(), w: r.w }]));   // (roadbed.js: what the landmarks below set by hand)
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
  prepareSonda();                                       // the oil wells in the wood (photos 84-86): the pad levelled, no forest on it
  // the roads (roadbed.js, V79): their data put right, every ribbon planned and kept clear of the buildings, the lesser
  // road meeting the greater at a junction, then the terrain made to lie under them, at every level of detail
  const tr = performance.now();
  prepareRoadbed(asMapped);
  const fit = fitBuildings();
  const plans = GEO.roadPlan = planRoads(fit);
  indexPlans(plans);
  snapJunctions(plans);
  const tp = performance.now(), L = terrainLevels(quality);
  const rb = conformTerrain(plans, { near: L.near.map(l => l[0]), world: L.world.map(l => l[0]) });
  snapJunctions(plans, GEO.roadsLifted);               // (again where the ground made a road come up: its junctions follow)
  log('drumuri: plan ' + plans.length + ' (' + Math.round(tp - tr) + ' ms), teren ' + rb.ms + ' ms, ' + JSON.stringify({ ...GEO.roadbedLog, ...fit.stats(), terrain: undefined }), performance.now() - t0);
  const terrain = buildTerrain(scene, gt, quality);
  // the far relief (to 20 km, then the horizon to 100 km): drawn in a pass of its own (post.js FarPass)
  const far = [buildFarTerrain(gt), buildHorizon(gt), buildHorizon(gt, true)].filter(Boolean);
  const water = buildWater(scene);
  log('teren', performance.now() - t0);
  const anexe = addOutbuildings();                      // the lots' sheds and summer kitchens behind the houses (the drone photos)
  const { fronts, stats } = buildBuildings(B, world, makeBuildingMaterials());
  const landmarks = buildLandmarks(B, world);
  // the landmarks' moving parts (the pumping units' beams and cranks): their own meshes, animated by tick()
  const moving = landmarks.filter(l => l && l.animate);
  for (const l of moving) for (const g of l.groups || []) scene.add(g);
  log('clădiri ' + stats.n, performance.now() - t0);
  paintLawns(gt.splat);
  paintGravelBed(gt.splat);                             // the Prahova's gravel bed (the drone photos: bare at low water)
  if (GEO.W && gt.splatW) paintLawns(gt.splatW, GEO.W.ext);        // the lots in the world grid too (Strada Mihai Viteazul)
  const rm = makeRoadMaterials();
  buildRoads(B, world, rm);
  buildBanks(B, GEO.roadPlan, terrain);                 // the ground's own surface down from a road's edge where it still falls away
  // walkable surfaces of the landmarks (courts, raised sidewalks) take part in the ground height like bridge decks
  for (const l of landmarks) if (l && l.surface && l.bbox) GEO.bridges.push({ fn: l.surface, ...l.bbox, P: [], y: [], w: 0 });
  const lines = [];
  for (const l of landmarks) if (l && l.wires) for (const v of l.wires) lines.push(v);
  buildRail(B, lines, rm);
  const wagons = buildWagons(B, world);                   // the freight wagons on the station's sidings (the drone photos)
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
  const floor = buildForestFloor(scene, world, quality);    // every other wood's floor: litter, ferns, brambles, deadwood, boulders
  log('copaci ' + trees.count + ', pădure ' + trees.forest.count() + ', coronament ' + (canopy ? canopy.meshes.length : 0), performance.now() - t0);
  let cullI = 0, lastCull = null;
  const info = { buildings: stats.n, roads: GEO.roads.length, rails: GEO.rails.length, wagons, anexe, fences: nFences, poles: pw.nPoles, towers: pw.nTowers, trees: trees.count, forestTrees: trees.forest.count(), water: water.meshes.length, meshes: meshes.length };
  return {
    fronts, info, terrain, landmarks, forest: trees.forest, trees, canopy, far,
    // the snow modes: bare broadleaves near and far (trees.js, canopy.js)
    setWinter(on) { trees.setWinter(on); canopy?.setWinter(on); },
    // every frame: the moving parts near the camera (t: seconds)
    tick(t, camPos) { for (const l of moving) l.animate(t, camPos); },
    // a still mirror near the camera (the wells' puddle): the screen-space reflections stay on in dry weather
    mirrorNear(camPos) { return moving.some(l => l.mirrorNear?.(camPos)) || water.near(camPos, 150); },
    water,
    // vis: how far one sees now (main.js: the weather's visibility, m): nothing is hidden before the haze has hidden it
    update(camPos, vis = Infinity) {
      trees.update(camPos);
      hill.update(camPos);
      floor.update(camPos);
      // distance culling of the merged chunks (a few per frame is enough: they change slowly; all at once after a jump
      // or when the visibility changes)
      const jumped = !lastCull || Math.hypot(camPos.x - lastCull.x, camPos.z - lastCull.z) > 150 || Math.abs(Math.log(vis / lastCull.vis)) > 0.15;
      lastCull = { x: camPos.x, z: camPos.z, vis };
      const reach = Math.max(1200, vis);
      for (let k = 0, n = jumped ? culled.length : 200; k < n && culled.length; k++) {
        const e = culled[cullI = (cullI + 1) % culled.length];
        e.m.visible = Math.hypot(e.c.x - camPos.x, e.c.z - camPos.z) - e.r < Math.min(e.d, reach);
      }
      // the far relief only when the haze lets it through (the horizon ring starts at 20 km)
      if (far[0]) far[0].visible = vis > 6000;
      if (far[1]) far[1].visible = vis > 14000;
      if (far[2]) far[2].visible = vis > 25000;
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

// The land's own horizon from (x, y, z) toward a direction (its level part), in degrees: the highest the terrain stands
// against the sky that way - the map's (heightAt), the far relief's to 20 km, the horizon ring's to 100 km - seen over
// the Earth's curve, which the air bends the light round a little (k = 0.13). From the street the hill to the west
// stands ~7 degrees high 1.5 km away: the sun goes behind it ~40 minutes before it sets.
const RE_K = 6371000 / (1 - 0.13);
function landAt(x, z) {
  if (Math.abs(x) < GEO.worldExt && Math.abs(z) < GEO.worldExt) return heightAt(x, z);
  if (Math.abs(x) < GEO.farExt * 0.995 && Math.abs(z) < GEO.farExt * 0.995) return farAt(x, z);
  const R = GEO.Hz;
  if (!R || Math.abs(x) > R.ext * 0.99 || Math.abs(z) > R.ext * 0.99) return null;
  const fx = (x + R.ext) / R.step, fz = (z + R.ext) / R.step, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, n = R.n, H = R.H;
  return (H[j * n + i] * (1 - u) + H[j * n + i + 1] * u) * (1 - v) + (H[(j + 1) * n + i] * (1 - u) + H[(j + 1) * n + i + 1] * u) * v;
}
export function landHorizon(x, y, z, dir) {
  const h = Math.hypot(dir.x, dir.z);
  if (h < 1e-6) return -90;
  const dx = dir.x / h, dz = dir.z / h;
  let best = -Math.PI / 2;
  for (let r = 20; r < 99000; r *= 1.035) {
    const t = landAt(x + dx * r, z + dz * r);
    if (t === null) break;
    best = Math.max(best, Math.atan2(t - y - r * r / (2 * RE_K), r));
  }
  return best * 180 / Math.PI;
}
// how high a body at true elevation el (degrees) looks, the air bending its light (Saemundsson: ~0.57 deg at the
// horizon, 0.13 at 7 degrees)
export const apparentEl = (el) => el + (el > -1.5 ? 1.02 / Math.tan((el + 10.3 / (el + 5.11)) * Math.PI / 180) / 60 : 0);

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
