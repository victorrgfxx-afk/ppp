import * as THREE from 'three';
import { QUALITY, defaultQuality, W, setProfile } from './config.js';
import { loadTextures, TEX } from './textures.js';
import { buildMaterials, M } from './materials.js';
import { createSky, createLights, buildEnvironment, setSkyWeather } from './sky.js';
import { installCascadedShadows, SunCascades, WEATHER, WEATHER_ORDER, sunlightAt, HOURS, hourLabel, shareInstancedDepth } from './lighting.js';
import { RAIN, wetScene, RainOcclusion, RainFX, Spray } from './rain.js';
import { MoonBeam, Flashlight, Lightning } from './night.js';
import { LAMPS } from './geo/props.js';
import { Bear } from './bear.js';
import { ForestScene } from './forest.js';
import { SCENE_SPOT } from './geo/hillwood.js';
import { CollisionWorld } from './collision.js';
import { buildWorld } from './world.js';
import { buildCar, paintMaterial } from './cars.js';
import { Vehicle } from './vehicle.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { createComposer } from './post.js';
import { PerfMeter } from './perf.js';
import { WIND, damp, clamp, rng } from './util.js';
import { boxBox } from './collision.js';
import { Walker } from './npc.js';
import { buildDogs } from './dogs.js';
import { loadGeoAll, buildGeoWorld, geoGround, GEO, footprintIndex, roadNameAt, sunDirection, moonDirection, profileAt, bridgeHeight } from './geo/index.js';

// Aerial perspective: exponential (not squared) haze, so the real valley sides stay visible for km.
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  '1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth )', '1.0 - exp( - fogDensity * vFogDepth )');
// one sun, several shadow maps (fine near, coarse far): patched into the light loop before any shader compiles
installCascadedShadows();
// Moment of the photos (late September, late morning): sun from the real SSE over Poiana Câmpina. The hour can be
// changed in the menu (O); local summer time is UTC+3.
const sunTime = (hour) => new Date(Date.UTC(2026, 8, 26) + (hour - 3) * 3600e3);

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('strada.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('strada.' + k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
};

// Camera poses matching the five reference photos (keys 1..5)
const PHOTO_VIEWS = [
  { x: 0.18, z: -1.14, yaw: 0.0, pitch: 0.04, label: 'Poza 1 — strada spre nord' },
  { x: 0.95, z: -1.6, yaw: -0.5, pitch: 0.18, label: 'Poza 2 — stâlpul și BMW-ul' },
  { x: 1.25, z: 1.9, yaw: -1.3, pitch: 0.12, label: 'Poza 3 — casa și tufa' },
  { x: 2.35, z: 3.0, yaw: -Math.PI / 2, pitch: 0.1, label: 'Poza 4 — fațada' },
  { x: 2.2, z: 3.9, yaw: -2.05, pitch: 0.06, label: 'Poza 5 — poarta' },
  { x: 2.35, z: 4.2, yaw: -2.8, pitch: 0.04, label: 'Poza 6 — straturile și Peugeot-ul' },
  { x: 0.3, z: 2.0, yaw: Math.PI, pitch: 0.02, label: 'Poza 7 — strada spre sud' },
  { x: 0.2, z: 2.6, yaw: 2.62, pitch: 0.03, label: 'Poza 8 — zidul gri de vizavi' },
  { x: -1.4, z: 1.2, yaw: -Math.PI / 2, pitch: 0.12, label: 'Poza 9 — toată fațada' },
  { x: 0.4, z: 0.8, yaw: -2.25, pitch: 0.08, label: 'Poza 10 — fațada și poarta' },
  { x: 4.3, z: 6.2, yaw: -1.27, pitch: 0.0, label: 'Poza 11 — intrarea în verandă' },
  { x: 5.15, z: 3.4, yaw: -Math.PI / 2, pitch: -0.14, label: 'Poza 12 — ușa și preșul' },
  { x: 5.2, z: 2.9, yaw: 0.06, pitch: 0.08, label: 'Poza 13 — prispa spre nord' },
  { x: 4.75, z: 5.9, yaw: -2.9, pitch: 0.04, label: 'Poza 14 — aleea spre grădină' },
  { x: 4.2, z: 13.6, yaw: -2.53, pitch: -0.42, label: 'Poza 15 — câinele negru în grădină' },
  { x: 4.15, z: 5.65, yaw: -0.82, pitch: -0.6, label: 'Poza 16 — câinele roșcat pe prispă' },
  // photos 17-19 were taken with the 2x lens: fov = its vertical field of view
  { x: 0.4, z: 17, yaw: Math.PI - 0.05, pitch: 0.14, fov: 40, label: 'Poza 17 — strada spre deal și râpa de lut' },
  { x: -0.2, z: -6.2, yaw: 0.36, pitch: 0.16, fov: 40, label: 'Poza 18 — stâlpul albastru și gardul verde' },
  { x: -1.0, z: -2.0, yaw: 0.0, pitch: 0.03, fov: 40, label: 'Poza 19 — spre intersecția cu STOP' },
  { x: -0.6, z: 2.6, yaw: 0.03, pitch: 0.05, label: 'Poza 20 — strada spre casa cu șindrilă' },
  { x: -2.0, z: 14.5, yaw: 0.3, pitch: 0.04, label: 'Poza 21 — poarta nr. 10' },
  { x: 2.3, z: 16.9, yaw: Math.PI / 2, pitch: 0.06, label: 'Poza 22 — casa nr. 111' },
  { x: 0.1, z: 11.2, yaw: Math.PI + 0.03, pitch: 0.05, label: 'Poza 23 — spre deal, garajul roșu' },
];

async function main() {
  const qKey = store.get('quality', defaultQuality());
  const Q = QUALITY[qKey] ?? QUALITY.medium;
  const sens = () => store.get('sens', 1) * 0.0022;

  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const perf = new PerfMeter(renderer, $('fps'));
  perf.set(store.get('perf', false));

  const progress = (p, label) => { $('bar').style.width = Math.round(p * 80) + '%'; $('loadText').textContent = label; };
  await loadTextures('assets/textures/', progress, renderer.capabilities.getMaxAnisotropy());
  buildMaterials();
  progress(0.8, 'Încarc harta reală: OSM, relief EU-DEM/Copernicus, Sentinel-2…');
  const gt = await loadGeoAll('assets/geo/');
  setProfile(profileAt);
  // playable area = the whole mapped square
  W.X_MIN = W.Z_MIN = -(GEO.worldExt - 60); W.X_MAX = W.Z_MAX = GEO.worldExt - 60;

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(0.56, 0.60, 0.65);
  scene.fog = new THREE.FogExp2(fogColor, 1 / 4000);
  scene.background = fogColor;
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 17000);

  const sky = createSky();
  scene.add(sky);
  const sunDir = sky.material.uniforms.uSunDir.value;
  let hour = HOURS.includes(store.get('hour', 11.5)) ? store.get('hour', 11.5) : 11.5;
  let sunInfo = sunDirection(sunTime(hour));
  sunDir.copy(sunInfo.dir);
  const { sun } = createLights(scene, sunDir);
  sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  sun.shadow.radius = Q.shadowRadius;
  Object.assign(sun.shadow.camera, { left: -Q.shadowBox, right: Q.shadowBox, top: Q.shadowBox, bottom: -Q.shadowBox });
  sun.shadow.camera.updateProjectionMatrix();
  const hemi = scene.children.find(o => o.isHemisphereLight);
  const cascades = new SunCascades(scene, sun, sunDir, Q);
  // weather and hour: sky, sun, sky light, reflections, haze and exposure together (T / O or the menu switch them)
  let weatherKey = WEATHER[store.get('weather', 'senin')] ? store.get('weather', 'senin') : 'senin';
  const mul = (a, b) => a.map((v, i) => v * b[i]);
  let rainTarget = 0, rainLight = 1, night = 0, horror = 0, moonInfo = null, baseHemi = 0, baseEnv = 0;
  let moonBeam = null, flashlight = null, bear = null, gradeU = null;         // (made once the map is built)
  const mixA = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  // night palettes: a clear moonlit sky, or the low deck of a night storm
  const NIGHT = {
    clear: { zenith: [0.004, 0.007, 0.018], horizon: [0.014, 0.02, 0.034], cloudLit: [0.05, 0.056, 0.07], cloudDark: [0.012, 0.013, 0.017], fog: [0.012, 0.015, 0.024] },
    deck: { zenith: [0.007, 0.008, 0.011], horizon: [0.011, 0.012, 0.016], cloudLit: [0.03, 0.032, 0.039], cloudDark: [0.01, 0.011, 0.013], fog: [0.013, 0.014, 0.018] },
  };
  const applyWeather = (key, h = hour) => {
    weatherKey = key; hour = h;
    const date = sunTime(hour);
    sunInfo = sunDirection(date); moonInfo = moonDirection(date);
    const w = WEATHER[key], L = sunlightAt(sunInfo.el), d = L.day, warm = L.color.map(c => THREE.MathUtils.lerp(c, 1, d));
    night = 1 - THREE.MathUtils.smoothstep(sunInfo.el, -12, -3);           // 0 by day, 1 after nautical dusk
    const moonUp = THREE.MathUtils.smoothstep(moonInfo.el, -1, 5) * moonInfo.illum, overcast = w.cover > 0.6;
    rainTarget = w.rain ?? 0;
    horror = night > 0.5 && rainTarget > 0 ? 1 : 0;                         // a night storm: the bear is out
    rainLight = (0.3 + 0.7 * d) * (1 - 0.75 * night);
    // the light (and its cascaded shadows) comes from the moon at night
    sunDir.copy(night > 0.5 ? moonInfo.dir : sunInfo.dir);
    const N = overcast ? NIGHT.deck : NIGHT.clear, sunVis = THREE.MathUtils.smoothstep(sunInfo.el, -3, 1);
    setSkyWeather(sky, { ...w, sunColor: mul(w.sunColor, L.color).map(v => v * sunVis),
      zenith: mixA(w.zenith, N.zenith, night), horizon: mixA(mul(w.horizon, warm), N.horizon, night),
      cloudLit: mixA(mul(w.cloudLit, warm), N.cloudLit, night), cloudDark: mixA(w.cloudDark, N.cloudDark, night),
      bright: THREE.MathUtils.lerp(w.bright * (0.3 + 0.7 * d), 1, night) });
    const su = sky.material.uniforms;
    su.uNight.value = night; su.uMoonDir.value.copy(moonInfo.dir); su.uMoonCol.value.set(0.9, 0.93, 1).multiplyScalar(moonUp);
    su.uHole.value = night * (overcast ? 1 : 0);                              // the moon looks through a gap above the hill
    if (night > 0.5) { sun.color.setRGB(0.6, 0.7, 1); sun.intensity = 0.05 * moonUp * (overcast ? 0.4 : 1); }   // moonlight elsewhere: barely
    else { sun.color.fromArray(mul(w.sunColor, L.color)); sun.intensity = w.sun * L.intensity; }
    sun.shadow.intensity = w.shadow;
    hemi.color.fromArray(mixA(w.hemiSky, [0.16, 0.2, 0.32], night)); hemi.groundColor.fromArray(mixA(w.hemiGround, [0.03, 0.03, 0.035], night));
    hemi.intensity = baseHemi = THREE.MathUtils.lerp(w.hemi * (0.35 + 0.65 * d), 0.25, night);
    fogColor.fromArray(mixA(mul(w.fog, warm).map(v => v * (0.45 + 0.55 * d)), N.fog, night)); scene.fog.color.copy(fogColor);   // (FogExp2 keeps its own copy)
    scene.fog.density = w.fogDensity * (horror ? 1.3 : 1);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(w.exposure * (1 + 0.7 * (1 - d)), 2.6, night);   // like a camera: it opens up when the light is low
    scene.environment?.dispose();
    scene.environment = buildEnvironment(renderer, sky);
    scene.environmentIntensity = baseEnv = w.env * (0.35 + 0.65 * d);
    // street lamps on at night; the moon's shaft on the hill of the cross; the bear's eyes catch the light
    M.lampGlass.emissive.setRGB(1, 0.78, 0.5); M.lampGlass.emissiveIntensity = 4 * (1 - THREE.MathUtils.smoothstep(sunInfo.el, -6, 1));
    moonBeam?.set(night > 0.5 && moonUp > 0.1, moonInfo.dir, 0.45 * moonUp, rainTarget > 0 ? 1 : overcast ? 0.6 : 0.3, scene.fog.density);
    if (bear) bear.eyeMat.emissiveIntensity = 3 * night;                     // eyeshine in the dark
    if (gradeU) { gradeU.uVig.value = horror ? 0.5 : 0.28; gradeU.uGrain.value = horror ? 0.075 : 0.035; }   // a darker, grainier frame in the storm
  };
  applyWeather(weatherKey);

  progress(0.85, 'Construiesc harta: relief, clădiri OSM, drumuri, Prahova, păduri…');
  await new Promise(r => setTimeout(r, 20));
  const world = new CollisionWorld();
  world.terrainFn = geoGround;
  world.streetZ = [GEO.meta.street.z0, GEO.meta.street.z1];
  const geoWorld = buildGeoWorld(scene, world, Q, renderer, gt, (label, ms) => console.log('[geo]', label, Math.round(ms), 'ms'));
  const built = buildWorld(scene, world, Q, { geo: true, street: world.streetZ, fronts: geoWorld.fronts, blocked: footprintIndex() });
  const dogs = buildDogs(scene, world);

  // ---------- parked cars exactly as in the photos ----------
  progress(0.93, 'Parchez mașinile…');
  await new Promise(r => setTimeout(r, 20));
  const vehicles = [];
  const park = (model, paint, plate, x, z, h, opts) => {
    const car = buildCar(model, paint, plate);
    scene.add(car.group);
    const v = new Vehicle(car, world, x, z, h, opts);
    if (opts?.name) v.name = opts.name;   // the photographed make when the body is a stand-in
    vehicles.push(v);
    return v;
  };
  park('bmw', paintMaterial(0x040405, { metallic: 0.0, rough: 0.25, dusty: 0.55 }), 'plateBMW', 2.32, -2.96, 0, { power: 1.25, vmax: 62 });
  // photos 17 and 23 (newer than 6-7): the Peugeot parked across the street by the maroon sheet fence,
  // and a silver hatchback with its door open where it used to stand
  // the user's Peugeot 508 at the gate (photos 6-7), tuned on request: 500 km/h (limiter), 0-100 in 2.0 s
  park('p508', paintMaterial(0x6a6f75, { metallic: 0.8, rough: 0.3, dusty: 0.1 }), 'plate508', 1.58, 13.7, Math.PI, { hyper: true, name: 'Peugeot 508 · 500 km/h' });
  park('hatch', paintMaterial(0xc4c7cb, { metallic: 0.85, rough: 0.28, dusty: 0.1 }), 'plateC', -1.9, 41.5, Math.PI, { name: 'Mercedes argintiu' });
  park('corsa', paintMaterial(0xa9adb1, { metallic: 0.85, rough: 0.35, dusty: 0.3 }), 'plateOpel', 1.55, -11.75, Math.PI, { power: 0.85, vmax: 48 });
  // photos 19-20 (newer than photo 1): the BMW 1 Series stands a few metres behind the Corsa, a silver sedan further on
  park('sedan', paintMaterial(0xbfc2c5, { metallic: 0.85, rough: 0.33 }), 'plateA', 1.75, -50, 0, {});
  park('hatch', paintMaterial(0xe9e9e7, { metallic: 0.15, rough: 0.28 }), 'plateB', -1.45, 58, 0, {});
  park('hatch', paintMaterial(0x6e1f1f, { metallic: 0.6, rough: 0.3 }), 'plateA', 1.72, 96, Math.PI, {});
  park('corsa', paintMaterial(0x2f4f7a, { metallic: 0.7, rough: 0.3 }), 'plateB', -1.35, -70, 0, {});
  // from the newer photos 17-19: Ford Focus + a dark hatch on the west side, BMW 1 Series facing north,
  // a dark-blue VW Golf IV by the brown board fence and a white Ford Kuga past the T junction
  // west side: parked half on the gravel shoulder, one behind the other (photos 18-20)
  park('hatch', paintMaterial(0xe6e7e6, { metallic: 0.25, rough: 0.3, dusty: 0.2 }), 'plateFocus', -2.15, -31.9, Math.PI, { name: 'Ford Focus' });
  park('hatch', paintMaterial(0x34373c, { metallic: 0.6, rough: 0.3 }), 'plateC', -2.15, -37.2, Math.PI, {});
  park('sedan', paintMaterial(0xdadcdd, { metallic: 0.3, rough: 0.3 }), 'plateB', -2.1, -42.6, Math.PI, {});
  park('hatch', paintMaterial(0x2a2d31, { metallic: 0.7, rough: 0.28, dusty: 0.15 }), 'plateBMW1', 1.72, -24.1, Math.PI, { power: 1.15, vmax: 58, name: 'BMW Seria 1' });
  park('hatch', paintMaterial(0x8e1c1f, { metallic: 0.5, rough: 0.3 }), 'plateA', 2.05, -109.5, Math.PI, {});   // red car by the STOP (photo 19)
  park('hatch', paintMaterial(0x16213d, { metallic: 0.55, rough: 0.3, dusty: 0.2 }), 'plateB', -1.6, 48.4, Math.PI, { name: 'VW Golf IV' });
  {
    const probe = new world.Box(0.9, -129.8, 1.05, 2.4, 0);
    if (!world.query(0.9, -129.8, 4, []).some(b => b.y1 > 0.45 && boxBox(probe, b))) park('suv', paintMaterial(0xf1f1ef, { metallic: 0.3, rough: 0.3 }), 'plateA', 0.9, -129.8, 0, { name: 'Ford Kuga' });
  }
  // photo 33: the silver hatchback parked along the white wall of the sports ground on Strada Nicolae Grigorescu
  const grLm = geoWorld.landmarks?.find(l => l.type === 'grigorescu');
  if (grLm && grLm.car) park('hatch', paintMaterial(0xb9bcc0, { metallic: 0.85, rough: 0.32, dusty: 0.25 }), 'plateB', grLm.car.x, grLm.car.z, grLm.car.h, {});
  // photos 43-44 (Strada Măgurii): the two cars by the east kerb and the silver SUV on the gravel yard
  const magLm = geoWorld.landmarks?.find(l => l.type === 'magurii');
  if (magLm) {
    for (const c of magLm.cars || []) park(c.model, paintMaterial(c.paint, { metallic: 0.6, rough: 0.35, dusty: 0.2 }), 'plateA', c.x, c.z, c.h, {});
    if (magLm.suv) park('suv', paintMaterial(0xb7babd, { metallic: 0.85, rough: 0.3, dusty: 0.3 }), 'plateC', magLm.suv.x, magLm.suv.z, magLm.suv.h, {});
  }
  // the cars round the station square and along the side street (photos 49-50)
  const garaLm = geoWorld.landmarks?.find(l => l.type === 'gara');
  if (garaLm) for (const [k, c] of (garaLm.cars || []).entries()) park(c.model, paintMaterial(c.paint, { metallic: 0.6, rough: 0.35, dusty: 0.2 }), ['plateA', 'plateB', 'plateC'][k % 3], c.x, c.z, c.h, {});
  // the cars along Strada Gării by the water tower and in its yard (photos 51-53)
  const castelLm = geoWorld.landmarks?.find(l => l.type === 'castel');
  if (castelLm) for (const [k, c] of (castelLm.cars || []).entries()) park(c.model, paintMaterial(c.paint, { metallic: 0.55, rough: 0.38, dusty: 0.25 }), ['plateA', 'plateB', 'plateC'][k % 3], c.x, c.z, c.h, {});
  // the car parked by the monument's junction (photo 54)
  const monLm = geoWorld.landmarks?.find(l => l.type === 'monument');
  if (monLm) for (const c of monLm.cars || []) park(c.model, paintMaterial(c.paint, { metallic: 0.5, rough: 0.35, dusty: 0.2 }), 'plateB', c.x, c.z, c.h, {});
  // the user's grey-green SUV parked by the flag on the hill (photo 60)
  const drLm = geoWorld.landmarks?.find(l => l.type === 'drapel');
  // the grey Opel Astra parked at the foot of the bridge's abutment on Strada Gării (photo 62)
  const vdLm = geoWorld.landmarks?.find(l => l.type === 'vad');
  if (vdLm) for (const c of vdLm.cars || []) park(c.model, paintMaterial(c.paint, { metallic: 0.6, rough: 0.35, dusty: 0.3 }), 'plateC', c.x, c.z, c.h, {});
  // the dark blue saloon on the restaurant's lot by DN1 (photo 66)
  const ppLm = geoWorld.landmarks?.find(l => l.type === 'popas');
  if (ppLm) for (const c of ppLm.cars || []) park(c.model, paintMaterial(c.paint, { metallic: 0.65, rough: 0.3, dusty: 0.2 }), 'plateB', c.x, c.z, c.h, {});
  // the cars along Str. Uzinei, in the works' parking area and the lot behind the fence, the red Kangoo (photos 78-83)
  const uzCarLm = geoWorld.landmarks?.find(l => l.type === 'uzinei');
  if (uzCarLm) for (const [k, c] of (uzCarLm.cars || []).entries()) park(c.model, paintMaterial(c.paint, { metallic: c.model === 'van' || c.model === 'kangoo' ? 0.2 : 0.6, rough: 0.33, dusty: 0.2 }), ['plateA', 'plateB', 'plateC'][k % 3], c.x, c.z, c.h, {});
  const hillEgg = geoWorld.landmarks?.find(l => l.type === 'hillwood')?.egg ?? null;
  let hillEggFound = false;
  if (drLm) for (const c of drLm.cars || []) park(c.model, paintMaterial(c.paint, { metallic: 0.7, rough: 0.3, dusty: 0.2 }), 'plateC', c.x, c.z, c.h, {});

  // more parked cars on the real streets around (right-hand side, never inside fences/buildings)
  {
    const rr = rng(77);
    const models = ['corsa', 'sedan', 'hatch', 'suv', 'p508', 'hatch', 'sedan'];
    const paints = [0xbfc2c5, 0x1d2024, 0xe9e9e7, 0x6e1f1f, 0x2f4f7a, 0x8a8f94, 0x3b4b3a, 0xd9d4c8];
    const plates = ['plateA', 'plateB', 'plateC'];
    const cand = GEO.roads.filter(r => ['residential', 'living_street', 'tertiary', 'unclassified'].includes(r.c) && r.s === 'asphalt' && !r.br && !r.hand && !r.own);
    // none within 60 m of a photo's camera (the photos show their own cars)
    const camPts = PHOTO_VIEWS.map(v => [v.x, v.z]);
    for (const l of geoWorld.landmarks || []) for (const val of Object.values(l)) for (const v of (Array.isArray(val) ? val : [val])) if (v && Array.isArray(v.from)) camPts.push(v.from);
    const nearView = (x, z) => camPts.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 60);
    let placed = 0;
    for (let tries = 0; tries < 2400 && placed < 56 && cand.length; tries++) {
      const r = cand[Math.floor(rr() * cand.length)];
      const k = Math.floor(rr() * (r.p.length / 2 - 1));
      const ax = r.p[2 * k], az = r.p[2 * k + 1], bx = r.p[2 * k + 2], bz = r.p[2 * k + 3];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 9) continue;
      const t = 0.2 + rr() * 0.6, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const d0 = Math.hypot(x, z);
      if ((placed < 24 ? d0 > 650 : d0 > GEO.worldExt - 300) || (Math.abs(x) < 8 && z > world.streetZ[0] - 10 && z < world.streetZ[1] + 10)) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, off = r.w / 2 - 1.0;
      const px = x + dz * off, pz = z - dx * off, h = Math.atan2(-dx, -dz);
      if (bridgeHeight(px, pz) !== null || nearView(px, pz)) continue;   // not on or under a bridge, not in a photo
      const probe = new world.Box(px, pz, 1.05, 2.4, h), gy = world.groundHeight(px, pz);
      if (world.query(px, pz, 4, []).some(b => b.y1 > gy + 0.45 && b.y0 < gy + 2.2 && boxBox(probe, b))) continue;
      const v = park(models[placed % models.length], paintMaterial(paints[Math.floor(rr() * paints.length)], { metallic: rr() * 0.8, rough: 0.3, dusty: rr() * 0.4 }), plates[placed % 3], px, pz, h, {});
      v.update(0.016, null);
      placed++;
    }
  }
  for (const v of vehicles) v.update(0.016, null);
  // the neighbour walking home with a yellow bag (photo 7)
  const walkers = [new Walker(scene, world, { x: -0.4, z0: 40, z1: 104 })];

  // ---------- player / input / audio / HUD ----------
  const player = new Player(camera, world);
  const input = new Input(canvas);
  const audio = new Audio();
  const hud = new HUD(world, built.houses, { geo: GEO, ortho: gt.ortho.image, orthoW: gt.orthoW?.image });
  const post = createComposer(renderer, scene, camera, Q);
  gradeU = post.grade.uniforms;
  // night: the moon's shaft on the hill of the cross, the torch, the storm's lightning and the bear of the hill
  const crossAt = geoWorld.landmarks?.find(l => l.type === 'cross');
  if (crossAt) moonBeam = new MoonBeam(scene, crossAt, TEX.noise);
  flashlight = new Flashlight(scene);
  // the forest scene of the user's two clips, live in the clearing of the wood by the cross (+z of its stage points back
  // towards the cross); its carpet of dry leaves is always there
  const forest = new ForestScene(scene, { x: SCENE_SPOT.x, z: SCENE_SPOT.z, y: geoGround(SCENE_SPOT.x, SCENE_SPOT.z), yaw: 1.178, ground: geoGround, world });
  const lightning = new Lightning((delay, km) => audio.thunder(delay, km));
  const hurt = document.createElement('div');
  hurt.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;background:radial-gradient(ellipse at center, rgba(110,0,0,0) 25%, rgba(150,0,0,0.88) 100%)';
  document.body.appendChild(hurt);
  const hurtFlash = () => { hurt.style.transition = 'none'; hurt.style.opacity = '1'; requestAnimationFrame(() => requestAnimationFrame(() => { hurt.style.transition = 'opacity 1.8s'; hurt.style.opacity = '0'; })); };
  if (crossAt) bear = new Bear(scene, world, crossAt, {
    roar: (d) => { audio.bear(true, d); if (d < 45) hud.toast('Un urs! Fugi — sau urcă într-o mașină!', 3); },
    growl: (d) => audio.bear(false, d),
    attack: (ux, uz) => {
      if (mode !== 'foot') return;
      player.pos.x += ux * 3.2; player.pos.z += uz * 3.2;               // thrown back
      shake = 0.7; hurtFlash(); audio.hit();
      hud.toast('Ursul te-a doborât! Ridică-te și fugi!', 3.5);
    },
  });
  applyWeather(weatherKey);

  let mode = 'foot';       // 'foot' | 'car'
  let active = null;       // vehicle being driven
  let camMode = store.get('camMode', 'chase');
  let photoFov = null;      // zoomed photo views keep the lens' field of view until you walk away
  const orbit = { yaw: 0, pitch: 0.18, idle: 0 };
  const cockpitLook = { yaw: 0, pitch: 0 };
  let paused = true, started = false, hornOn = false;
  let shake = 0;

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  resize();

  // precompile shaders to avoid hitches
  progress(0.97, 'Compilez shaderele…');
  await new Promise(r => setTimeout(r, 20));
  player.update(0, input, null, 0);
  // rain: every lit material learns to get wet (before compiling, so switching to rain recompiles nothing)
  wetScene(scene);
  const rainFX = new RainFX(scene), rainOcc = new RainOcclusion(), spray = new Spray(scene, TEX.noise);
  const allLamps = [...LAMPS, ...(built.lamps ?? [])];                 // street lamp heads (map + Strada Gării)
  shareInstancedDepth(scene);
  renderer.compile(scene, camera);
  post.composer.render(0);
  // from now on the scene's world matrices are updated once per frame, just before it is drawn (the passes that draw
  // it again in the same frame, like the ambient occlusion's, would only redo the same work)
  scene.matrixWorldAutoUpdate = false;
  $('loader').classList.add('done');
  $('start').classList.add('on');
  $('quality').value = qKey;
  $('sens').value = store.get('sens', 1);
  const torchForNight = () => {
    if (night > 0.5 && !flashlight.on && mode === 'foot') { flashlight.set(true); hud.toast('E noapte: lanterna e aprinsă (L o stinge)', 3); }
    if (night < 0.5 && flashlight.on) flashlight.set(false);
  };
  const setWeather = (key) => { applyWeather(key); store.set('weather', key); $('weather').value = key; $('weather2').value = key; torchForNight(); };
  const setHour = (h) => { applyWeather(weatherKey, h); store.set('hour', h); $('hour').value = h; $('hour2').value = h; torchForNight(); };
  torchForNight();                                              // (a game started at night)
  for (const id of ['weather', 'weather2']) {
    $(id).innerHTML = WEATHER_ORDER.map(k => `<option value="${k}">${WEATHER[k].label}</option>`).join('');
    $(id).value = weatherKey;
    $(id).addEventListener('change', (e) => setWeather(e.target.value));
  }
  for (const id of ['hour', 'hour2']) {
    $(id).innerHTML = HOURS.map(h => `<option value="${h}">${hourLabel(h)}</option>`).join('');
    $(id).value = hour;
    $(id).addEventListener('change', (e) => setHour(parseFloat(e.target.value)));
  }

  // ---------- UI wiring ----------
  const begin = () => {
    audio.start();
    input.enabled = true;
    input.requestLock();
    paused = false; started = true;
    $('start').classList.remove('on');
    $('pause').classList.remove('on');
    $('hud').classList.add('on');
  };
  $('play').addEventListener('click', begin);
  $('resume').addEventListener('click', begin);
  $('quality').addEventListener('change', (e) => { store.set('quality', e.target.value); location.reload(); });
  $('quality2').addEventListener('change', (e) => { store.set('quality', e.target.value); location.reload(); });
  $('sens').addEventListener('input', (e) => store.set('sens', parseFloat(e.target.value)));
  $('mute').addEventListener('click', () => { audio.setMuted(!audio.muted); $('mute').textContent = audio.muted ? 'Sunet: oprit' : 'Sunet: pornit'; });
  $('menuBtn').addEventListener('click', () => pause());
  const pause = () => {
    if (!started) return;
    paused = true; input.enabled = false;
    $('quality2').value = qKey;
    $('pause').classList.add('on');
    if (document.pointerLockElement) document.exitPointerLock();
  };
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && started && !paused && !matchMedia('(pointer: coarse)').matches && !input.mouse.dragging) pause();
  });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && started && !paused) pause(); });
  // photo 24: the cross on the hill, seen from ~11 m south-south-east, looking north-north-west (sun behind the camera),
  // ~20 deg off the arms' normal (the right arm looks 21% longer)
  const crossLm = geoWorld.landmarks?.find(l => l.type === 'cross');
  if (crossLm && !PHOTO_VIEWS.some(v => v.cross)) {
    const fx = Math.cos((-11.8 + 47.98) * Math.PI / 180), fz = Math.cos((-11.8 - 42.02) * Math.PI / 180);
    PHOTO_VIEWS.push({ cross: true, x: crossLm.x - fx * 11, z: crossLm.z - fz * 11, yaw: Math.atan2(-fx, -fz), pitch: 0.3, label: 'Poza 24 — crucea de pe deal' });
  }
  // photos 25-29 (the user's Street View screenshots): the railway underpass of DJ100E by Strada Gării
  const up = geoWorld.landmarks?.find(l => l.type === 'underpass');
  if (up && !PHOTO_VIEWS.some(v => v.up)) {
    const { U, W } = up;
    const look = (from, to, pitch, label) => {
      const dx = to[0] - from[0], dz = to[1] - from[1];
      PHOTO_VIEWS.push({ up: true, x: from[0], z: from[1], yaw: Math.atan2(-dx, -dz), pitch, label });
    };
    look([-594.5, -155.0], [-560, -155.6], 0.03, 'Poza 25 — Strada Gării de la pasaj');
    look(W(U.A + 8, -0.6), W(-4, 0.4), 0.06, 'Poza 26 — pasajul CF, intrarea dinspre Strada Gării');
    look(W(U.A + 4, -9), W(U.wt, U.l1 + 1.5), 0.1, 'Poza 27 — colțul pasajului și borna DJ 100E');
    const shop = GEO.buildings.find(b => b.o && b.o.shop === 'oana');
    if (shop) {
      let sx = 0, sz = 0; const n = shop.p.length / 2; for (let i = 0; i < shop.p.length; i += 2) { sx += shop.p[i] / n; sz += shop.p[i + 1] / n; }
      look([-565.5, -213.5], [sx, sz], 0.07, 'Poza 28 — magazinul SHOPPING Oana');
    }
    look([-567.0, -213.0], W(-U.wt, -2.5), 0.05, 'Poza 29 — DJ100E spre pasaj, după pod');
  }
  // photos 30-32 (the user's Street View screenshots at 45.12914 N 25.71874 E): the DJ100E bridge over the Prahova
  const brLm = geoWorld.landmarks?.find(l => l.type === 'bridge');
  if (brLm && !PHOTO_VIEWS.some(v => v.br)) {
    const view = (s, o, dir, pitch, label) => {
      const [x, z] = brLm.W(s, o), d = dir === 'east' ? brLm.W(s + 1, o) : dir === 'west' ? brLm.W(s - 1, o) : [x + dir[0], z + dir[1]];
      PHOTO_VIEWS.push({ br: true, x, z, yaw: Math.atan2(-(d[0] - x), -(d[1] - z)), pitch, fov: 75, label });
    };
    view(67, -1.9, 'east', -0.07, 'Poza 30 — podul peste Prahova, spre Câmpina');
    view(67, -1.9, 'west', -0.07, 'Poza 31 — podul peste Prahova, spre Poiana Câmpina');
    view(61, -5.3, [0.89, 0.46], -0.2, 'Poza 32 — Prahova în amonte de pod: canalul și pragul');
  }
  // photos 33-35 (Street View at 45.1293068 N 25.7207781 E): Strada Nicolae Grigorescu after the bridge
  if (grLm && !PHOTO_VIEWS.some(v => v.gr)) {
    // the screenshots are zoomed in: ~55 deg vertical field of view
    const view = (from, to, pitch, label) => PHOTO_VIEWS.push({ gr: true, x: from[0], z: from[1], yaw: Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])), pitch, fov: 55, label });
    const bh = grLm.backhoe;
    view(grLm.W(12, 1.9), bh ? [bh.x, bh.z] : [-955, 118], 0.02, 'Poza 33 — intersecția cu Strada Plevnei și baza sportivă');
    view(grLm.W(grLm.gateS - 13, 1.9), grLm.W(grLm.gateS + 24, 2.5), -0.02, 'Poza 34 — poarta Seva Parc');
    view(grLm.W(grLm.S[19] + 6, 1.9), grLm.W(grLm.S[19] + 75, 2.5), -0.03, 'Poza 35 — Parcul Curiacul');
  }
  // photos 36-37 (Street View at 45.1398295 N 25.7098525 E): DN1 (E60) at the Cornu roundabout
  const coLm = geoWorld.landmarks?.find(l => l.type === 'cornu');
  if (coLm && !PHOTO_VIEWS.some(v => v.co)) {
    const view = (from, to, pitch, label) => PHOTO_VIEWS.push({ co: true, x: from[0], z: from[1], yaw: Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])), pitch, fov: 58, label });
    const s36 = coLm.sAtX(368), s37 = coLm.sAtX(497);
    view(coLm.lane(s36, 1.9), coLm.lane(s36 + 90, 0.6), -0.02, 'Poza 36 — DN1 spre sensul giratoriu de la Cornu');
    view(coLm.lane(s37, 1.9), [coLm.ring.x + 4, coLm.ring.z - 3], -0.03, 'Poza 37 — intrarea în sensul giratoriu, benzinăria Rompetrol');
  }
  // photos 38-39 (Street View, November 2023, plus code 4MXW+GH3 Cornu de Jos): the Etu Oil & Gas station on DN1
  const etuLm = geoWorld.landmarks?.find(l => l.type === 'etu');
  if (etuLm && !PHOTO_VIEWS.some(v => v.etu)) {
    const view = (from, to, pitch, label) => PHOTO_VIEWS.push({ etu: true, x: from[0], z: from[1], yaw: Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])), pitch, fov: 58, label });
    // on the northbound carriageway, right lane, where the entry lane leaves it (photo 38: the totem ~20 m ahead)
    const d = etuLm.dn, e0 = etuLm.entry[0];
    let bi = 0, bd = Infinity; for (let i = 0; i < d.length; i++) { const dd = Math.hypot(d[i][0] - e0[0], d[i][1] - e0[1]); if (dd < bd) { bd = dd; bi = i; } }
    const a = d[Math.max(0, bi - 1)], b = d[bi], ul = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / ul, uz = (b[1] - a[1]) / ul;
    const side = ((etuLm.totem.x - e0[0]) * -uz + (etuLm.totem.z - e0[1]) * ux) > 0 ? 1 : -1;
    const cam = [e0[0] - ux * 2 - uz * side * 1.9, e0[1] - uz * 2 + ux * side * 1.9];
    view(cam, [cam[0] + ux * 80 - uz * side * 0.5, cam[1] + uz * 80 + ux * side * 0.5], -0.12, 'Poza 38 — DN1 la benzinăria Etu (Cornu de Jos)');
    // on the deceleration lane south of the island's nose: totem on the left, canopy on the right (photo 39)
    const lat = 7.6 / 2 + 1.6, c39 = [e0[0] - ux * 12 - uz * side * lat, e0[1] - uz * 12 + ux * side * lat];
    const st = etuLm.station || { x: etuLm.entry[etuLm.entry.length - 1][0], z: etuLm.entry[etuLm.entry.length - 1][1] };
    view(c39, [(etuLm.totem.x + st.x) / 2, (etuLm.totem.z + st.z) / 2], -0.06, 'Poza 39 — benzinăria Etu: insula cu totemul și copertina');
  }
  // photos 40-41 (45.1229934 N, 25.7157007 E): Strada Pițigaia at the lane's mouth, both looking up the street
  const pitLm = geoWorld.landmarks?.find(l => l.type === 'pitigaia');
  if (pitLm && !PHOTO_VIEWS.some(v => v.pit)) {
    const view = (from, to, pitch, fov, label) => PHOTO_VIEWS.push({ pit: true, x: from[0], z: from[1], yaw: Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])), pitch, fov, label });
    // in the middle of the concrete, the iron fence of no. 857 on the right (photo 40)
    view(pitLm.W(-1, -0.4), pitLm.W(-75, -0.2), 0.12, 42, 'Poza 40 — Strada Pițigaia: spre deal, gardul de fier de la nr. 857');
    // at the photos' coordinate (GPS, +-5 m), on the concrete by the lane's mouth: ditch, mesh fence and the old house
    // on the left (photo 41)
    view(pitLm.W(pitLm.pinS, Math.min(pitLm.pinO, 1.4)), pitLm.W(-60, 6.5), 0.06, 50, 'Poza 41 — Strada Pițigaia: șanțul, gardul de plasă și casa veche');
  }
  // photos 42-45: the wayside shrine at Aleea Croitorului, Strada Măgurii at the mouth of Strada Tulburii
  if (magLm && !PHOTO_VIEWS.some(v => v.mag)) {
    const view = (from, to, pitch, fov, label) => PHOTO_VIEWS.push({ mag: true, x: from[0], z: from[1], yaw: Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])), pitch, fov, label });
    if (magLm.camA) view(magLm.camA.from, magLm.camA.to, -0.03, 55, 'Poza 42 — DJ100E la Aleea Croitorului: troița, oglinda');
    if (magLm.W) {
      // the Street View car on the west half going south-west (43, 44) and on the east half going north-east (45)
      view(magLm.W(-80, 1.2), magLm.W(-30, 0.6), -0.03, 55, 'Poza 43 — Strada Măgurii: canalul și mașinile parcate');
      view(magLm.W(-40, 1.2), magLm.W(3, -1.5), -0.03, 55, 'Poza 44 — Strada Măgurii spre Strada Tulburii');
      view(magLm.W(49, -1.2), magLm.W(8, 0), -0.05, 55, 'Poza 45 — Strada Măgurii la vale, gardul maro');
    }
  }
  // photos 46-50: Strada Gării by Parcul Triumf and the stadium gate, under the railway, the station square
  if (garaLm && !PHOTO_VIEWS.some(v => v.gara)) {
    const view = (from, to, pitch, fov, label) => PHOTO_VIEWS.push({ gara: true, x: from[0], z: from[1], yaw: Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])), pitch, fov, label });
    const { A, B, C } = garaLm;
    // the five photos are taken with the phone's ultra-wide lens (~90 deg across, fov 59 on a 16:9 screen); the
    // camera positions come from the distances and bearings of known objects in the frames
    // heading north-west in the right lane (the park's side)
    if (A) {
      // 27 m before the park's sign; at the photos' coordinate, turning right into the stadium's paved mouth
      view(A.W(A.corner + 26, A.pk * 1.9), A.W(A.corner - 30, A.pk * 1.2), 0.02, 59, 'Poza 46 — Strada Gării: Parcul Triumf, locul de joacă');
      view(A.W(A.sg + 10, A.pk * 1.9), A.W(A.sg - 30, A.pk * 19.5), 0.0, 59, 'Poza 47 — Strada Gării: poarta Stadionului Fortuna');
    }
    // at the photo's coordinate, in the right lane
    if (B) view(B.W(414, -B.rs * 1.9), B.W(330, -B.rs * 1.9), 0.03, 59, 'Poza 48 — Strada Gării sub calea ferată: zidul și locomotiva');
    if (C) {
      // ~10 m before the junction with the loop, towards the island's big spruce
      view(C.W(77, C.ne * 1.2), [-157, -106.5], 0.03, 59, 'Poza 49 — Gara Câmpina: scuarul cu brazi');
      // at the photos' coordinate: beside the island, cars parked on both sides
      view(C.W(46, C.ne * 0.4), C.W(8, 0), 0.03, 59, 'Poza 50 — Gara Câmpina: pe lângă insula cu brazi, mașini parcate');
    }
  }
  // photos 51-53: Strada Gării by the station's water tower (ultra-wide lens, fov 59): along the street, then turning
  // left into the yard
  if (castelLm?.views && !PHOTO_VIEWS.some(v => v.castel)) {
    const view = (v, pitch, label) => PHOTO_VIEWS.push({ castel: true, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch, fov: 59, label });
    view(castelLm.views.a, 0.06, 'Poza 51 — Strada Gării: castelul de apă al gării');
    view(castelLm.views.b, 0.08, 'Poza 52 — Strada Gării: postul de transformare și castelul de apă');
    view(castelLm.views.c, 0.05, 'Poza 53 — Strada Gării: curtea și clădirea în dungi');
  }
  // photo 54: the monument at the DJ100E junction, from the east arm of Strada Centru (ultra-wide lens, fov 59)
  if (monLm?.view && !PHOTO_VIEWS.some(v => v.mon)) {
    const v = monLm.view;
    PHOTO_VIEWS.push({ mon: true, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch: 0.06, fov: 59, label: 'Poza 54 — Strada Centru: monumentul de la intersecție' });
  }
  // photo 55: down Strada Toma Cantacuzino between the guardrails (ultra-wide lens, fov 59)
  const tcLm = geoWorld.landmarks?.find(l => l.type === 'cantacuzino');
  if (tcLm?.view && !PHOTO_VIEWS.some(v => v.tc)) {
    const v = tcLm.view;
    PHOTO_VIEWS.push({ tc: true, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch: -0.07, fov: 59, label: 'Poza 55 — Strada Toma Cantacuzino: coborârea cu parapete' });
  }
  // photos 56-57: the old yard with the stripped hall, then the fork with the concrete tank (main lens, fov 32)
  const haLm = geoWorld.landmarks?.find(l => l.type === 'hala');
  if (haLm?.views && !PHOTO_VIEWS.some(v => v.hala)) {
    const view = (v, pitch, label) => PHOTO_VIEWS.push({ hala: true, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch, fov: 32, label });
    view(haLm.views.a, 0.04, 'Poza 56 — Strada Toma Cantacuzino: poarta curții și hala dezafectată');
    view(haLm.views.b, 0.0, 'Poza 57 — Strada Toma Cantacuzino: bifurcația de lângă rezervor');
  }
  // photos 58-59: the bend into Strada Gării, then along the railway yard (main lens, fov 32)
  const trLm = geoWorld.landmarks?.find(l => l.type === 'triaj');
  if (trLm?.views && !PHOTO_VIEWS.some(v => v.triaj)) {
    const view = (v, pitch, label) => PHOTO_VIEWS.push({ triaj: true, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch, fov: 32, label });
    view(trLm.views.a, 0.02, 'Poza 58 — Strada Toma Cantacuzino: cotul spre calea ferată');
    view(trLm.views.b, 0.0, 'Poza 59 — Strada Gării: de-a lungul triajului');
  }
  // photo 60: the flag by the cross, the cross edge-on beyond it (pose resected on the hill's skyline: 15.3 deg up, 49 deg fov)
  if (drLm?.view && !PHOTO_VIEWS.some(v => v.drapel)) {
    const v = drLm.view;
    PHOTO_VIEWS.push({ drapel: true, x: v.from[0], z: v.from[1], yaw: v.yaw, pitch: v.pitch, fov: v.fov, label: 'Poza 60 — drapelul de lângă crucea de pe deal' });
  }
  // photos 61-62 (Street View at 45.1425988 N 25.6948875 E): the DJ101R bridge, on its approach and from Strada Gării
  // under it (photo 62 resected on the abutment; photo 61 matched on where the railings start; ~7° down both)
  if (vdLm?.views && !PHOTO_VIEWS.some(v => v.vad)) {
    const view = (v, pitch, fov, label) => PHOTO_VIEWS.push({ vad: true, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch, fov, label });
    view(vdLm.views.a, -0.13, 69.6, 'Poza 61 — pe Podul Vadului (DJ101R), spre Prahova');
    if (vdLm.views.b) view(vdLm.views.b, -0.13, 72.8, 'Poza 62 — Strada Gării pe sub Podul Vadului');
  }
  // photo 63 (phone photo from a car, 45.1435469 N 25.6988803 E): the fork off Podul Vadului onto DN1 at Breaza
  const bzLm = geoWorld.landmarks?.find(l => l.type === 'breaza');
  if (bzLm?.view && !PHOTO_VIEWS.some(v => v.breaza)) {
    const v = bzLm.view;
    PHOTO_VIEWS.push({ breaza: true, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch: -0.02, fov: 67.3, label: 'Poza 63 — ieșirea de pe Podul Vadului în DN1, la Breaza' });
  }
  // photo 64 (Street View, 2024, 45.1516650 N 25.6953293 E): DN1 northbound at the Păstrăvăria Cornu welcome sign
  const psLm = geoWorld.landmarks?.find(l => l.type === 'pastravaria');
  if (psLm?.view && !PHOTO_VIEWS.some(v => v.pastravaria)) {
    const v = psLm.view;
    PHOTO_VIEWS.push({ pastravaria: true, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch: v.pitch, fov: v.fov, label: 'Poza 64 — DN1 la Păstrăvăria Cornu' });
    // photo 65 (Street View, November 2023): further on towards Cornu de Sus, through the wood
    const w = psLm.view65;
    if (w) PHOTO_VIEWS.push({ x: w.from[0], z: w.from[1], yaw: Math.atan2(-(w.to[0] - w.from[0]), -(w.to[1] - w.from[1])), pitch: w.pitch, fov: w.fov, label: 'Poza 65 — DN1 prin pădure, spre Cornu de Sus' });
  }
  // photo 66 (Street View, November 2023): DN1 northbound at the roadside restaurant, ~1.3 km past the sign
  const ppView = geoWorld.landmarks?.find(l => l.type === 'popas')?.view;
  if (ppView && !PHOTO_VIEWS.some(v => v.popas)) {
    const v = ppView;
    PHOTO_VIEWS.push({ popas: true, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch: v.pitch, fov: v.fov, label: 'Poza 66 — DN1 la restaurantul de lângă drum' });
  }
  // photo 67 (Street View, 2021, zoomed in): DN1 northbound at the red footbridge by the exit to Breaza
  const paView = geoWorld.landmarks?.find(l => l.type === 'pasarela')?.view;
  if (paView && !PHOTO_VIEWS.some(v => v.pasarela)) {
    const v = paView;
    PHOTO_VIEWS.push({ pasarela: true, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch: v.pitch, fov: v.fov, label: 'Poza 67 — DN1 la pasarela de la ieșirea spre Breaza' });
  }
  // photos 68-71 (Street View, September 2022): Strada Mihai Viteazul, from the gated house down to the junction by the footbridge
  const mvLm = geoWorld.landmarks?.find(l => l.type === 'viteazul');
  if (mvLm?.views && !PHOTO_VIEWS.some(v => v.viteazul)) {
    for (const v of mvLm.views) PHOTO_VIEWS.push({ viteazul: v.n, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch: v.pitch, fov: v.fov, label: v.label });
  }
  // photo 72 (Street View, June 2022): the exit's last metres before the junction, the footbridge's east flight
  const v72 = geoWorld.landmarks?.find(l => l.type === 'pasarela')?.view72;
  if (v72 && !PHOTO_VIEWS.some(v => v.pasarela72)) PHOTO_VIEWS.push({ pasarela72: true, x: v72.from[0], z: v72.from[1], yaw: Math.atan2(-(v72.to[0] - v72.from[0]), -(v72.to[1] - v72.from[1])), pitch: v72.pitch, fov: v72.fov, label: 'Poza 72 — ieșirea spre Breaza, scara pasarelei' });
  // photos 73-76 (Street View, June 2022): the painted church by the cemetery, its gate tower, the school yard
  const biLm = geoWorld.landmarks?.find(l => l.type === 'biserica');
  if (biLm?.views && !PHOTO_VIEWS.some(v => v.biserica)) {
    for (const v of biLm.views) PHOTO_VIEWS.push({ biserica: v.n, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch: v.pitch, fov: v.fov, label: v.label });
  }
  // photos 78-83 (Street View, October 2024 / June 2022): Str. Uzinei from the Primăria up to the STOP junction, Strada Bisericii
  const uzLm = geoWorld.landmarks?.find(l => l.type === 'uzinei');
  if (uzLm?.views && !PHOTO_VIEWS.some(v => v.uzinei)) {
    for (const v of uzLm.views) PHOTO_VIEWS.push({ uzinei: v.n, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch: v.pitch, fov: v.fov, label: v.label });
  }
  $('views').innerHTML = PHOTO_VIEWS.map((v, i) => `<button data-view="${i}">${i + 1}. ${v.label.split('—')[1]}</button>`).join('');
  $('views').addEventListener('click', (e) => {
    const i = e.target.dataset.view; if (i === undefined) return;
    gotoView(+i); begin();
  });

  const gotoView = (i) => {
    const v = PHOTO_VIEWS[i];
    if (mode === 'car') exitCar(true);
    player.setPose(v.x, v.z, v.yaw, v.pitch);
    photoFov = v.fov ? { fov: v.fov, x: v.x, z: v.z } : null;
    camera.fov = v.fov ?? 70; camera.updateProjectionMatrix();
    hud.toast(v.label);
  };

  const nearestCar = () => {
    let best = null, bd = 2.6;
    for (const v of vehicles) {
      for (const side of [-1, 1]) {
        const d = v.doorPos(side);
        const dist = Math.hypot(d.x - player.pos.x, d.z - player.pos.z);
        if (dist < bd) { bd = dist; best = v; }
      }
    }
    return best;
  };
  const enterCar = (v) => {
    mode = 'car'; active = v;
    audio.door();
    orbit.yaw = 0; orbit.pitch = 0.18;
    cockpitLook.yaw = 0; cockpitLook.pitch = 0;
    hud.toast(v.name + ' — W/S accelerație/frână, A/D volan, Space frână de mână, V cameră, F coboară');
  };
  const exitCar = (force = false) => {
    if (!active) return;
    if (!force && Math.abs(active.speed) > 3) { hud.toast('Oprește mașina ca să cobori'); return; }
    for (const side of [-1, 1]) {
      const d = active.doorPos(side);
      player.setPose(d.x, d.z, active.h, 0);
      player.collide();
      if (Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < 0.3) break;
    }
    player.pos.y = world.groundHeight(player.pos.x, player.pos.z);
    audio.door();
    active.vx *= 0.2; active.vz *= 0.2;
    active.car.glass.opacity = 0.86;
    mode = 'foot'; active = null;
  };

  // ---------- the forest scene ----------
  // It happens only at 23:30 under an overcast sky, live in the clearing by the cross (forest.js): you walk up to it.
  // K (or the menu's button) takes you to the edge of the clearing, then too.
  const SCENE_HOUR = 23.5, SCENE_WEATHER = 'innorat';
  const sceneTime = () => hour === SCENE_HOUR && weatherKey === SCENE_WEATHER;
  const forestSound = (n, d) => {
    const k = Math.min(1, Math.max(0.04, 5 / Math.max(d, 1)));            // fainter with the distance
    if (n === 'shriek') audio.shriek(k); else if (n === 'thud') audio.thud(k); else if (n === 'growl') audio.bear(false, d); else audio.rustle(n === 'rustle-big' ? 9 : 4, k);
  };
  const goToForest = () => {
    if (!sceneTime()) { hud.toast('Scena din pădure are loc doar la ora 23:30, pe vreme înnorată (O schimbă ora, T vremea)', 4.5); return; }
    if (!forest.arm()) { hud.toast('Scena din pădure se pregătește (câteva secunde)…', 3); return; }
    if (mode === 'car') exitCar(true);
    if (player.noclip) player.setNoclip(false);
    const v = forest.viewpoint();
    player.setPose(v.x, v.z, v.yaw, -0.05);
    if (!flashlight.on) flashlight.set(true);
    hud.toast('Luminișul din pădurea de lângă cruce, 23:30. Apropie-te…', 4);
  };
  for (const id of ['cineBtn', 'cineBtn2']) $(id).addEventListener('click', () => { begin(); goToForest(); });

  // ---------- main loop ----------
  const clock = new THREE.Timer();
  let roadName = null;
  const pos0 = () => (mode === 'car' && active ? active.car.group.position : player.pos);
  geoWorld.update(camera.position);
  let t = 0, frameNo = 0;
  const focus = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    perf.begin();
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    WIND.time.value = t;
    sky.material.uniforms.uTime.value = t;

    let prompt = '';
    if (!paused) {
      if (input.hit('KeyK')) goToForest();
      if (input.hit('KeyP')) screenshot();
      if (input.hit('KeyG')) { perf.set(!perf.on); store.set('perf', perf.on); hud.toast(perf.on ? 'Contor de performanță: FPS, timpul CPU și GPU al unui cadru, desenări (G îl ascunde)' : 'Contor de performanță ascuns', 3); }
      if (input.hit('KeyT')) { setWeather(WEATHER_ORDER[(WEATHER_ORDER.indexOf(weatherKey) + 1) % WEATHER_ORDER.length]); hud.toast('Vremea: ' + WEATHER[weatherKey].label); }
      if (input.hit('KeyO')) {
        setHour(HOURS[(HOURS.indexOf(hour) + 1) % HOURS.length]);
        hud.toast(night > 0.5 ? `Ora ${hourLabel(hour)} · noapte, lună plină la ${Math.round(moonInfo.el)}°${horror ? ' · furtună: ursul a ieșit pe dealul crucii' : ''}` : `Ora ${hourLabel(hour)} · soarele la ${Math.round(sunInfo.el)}° deasupra orizontului`, 3.5);
      }
      // N: noclip, free flight to look around the map quickly (from a car too: you step out first)
      if (input.hit('KeyN')) {
        if (mode === 'car') exitCar(true);
        if (mode === 'foot') {
          player.setNoclip(!player.noclip);
          hud.toast(player.noclip ? 'Noclip pornit — zbori liber: Space sus, C jos, Shift rapid (N oprește)' : 'Noclip oprit');
        }
      }
      if (mode === 'foot') {
        for (let i = 0; i < PHOTO_VIEWS.length; i++) if (input.hit('Digit' + ((i + 1) % 10))) gotoView(i);
        if (input.hit('KeyL')) { flashlight.set(!flashlight.on); hud.toast(flashlight.on ? 'Lanterna aprinsă' : 'Lanterna stinsă'); }
        player.update(dt, input, audio, sens());
        // a dog right next to you wins over a car parked beyond the fence (nothing to use while flying)
        const dog = player.noclip ? null : dogs.nearest(player.pos.x, player.pos.z);
        const near = dog || player.noclip ? null : nearestCar();
        if (dog) {
          prompt = 'E — mângâie câinele';
          if (input.hit('KeyE') || input.hit('KeyF')) { dogs.pet(dog); hud.toast('Câinele dă fericit din coadă'); }
        } else if (near) {
          prompt = 'F — urcă în ' + near.name;
          if (input.hit('KeyF') || input.hit('KeyE')) enterCar(near);
        }
      } else {
        const ax = input.axis();
        const ctl = { throttle: -ax.y, steer: ax.x, handbrake: input.down('Space') };
        if (input.hit('KeyF') || input.hit('KeyE')) exitCar();
        if (input.hit('KeyL')) active?.setLights(!active.lightsOn);
        if (input.hit('KeyV')) { camMode = camMode === 'chase' ? 'cockpit' : 'chase'; store.set('camMode', camMode); }
        hornOn = input.down('KeyH');
        active?.update(dt, ctl);
        if (active && active.impact > 2.5) { audio.crash(active.impact); shake = Math.min(0.35, active.impact * 0.03); }
      }
      // parked cars (and cars pushed by collisions) settle
      for (const v of vehicles) if (v !== active) v.update(dt, null);
      for (const w of walkers) w.update(dt);
    }
    dogs.update(dt, t, camera.position);

    // camera for driving
    let fov = 70;
    if (mode === 'car' && active) {
      const m = input.consumeMouse();
      const sp = Math.abs(active.speed);
      if (camMode === 'chase') {
        if (m.x || m.y) { orbit.yaw -= m.x * sens(); orbit.pitch = clamp(orbit.pitch + m.y * sens(), -0.1, 0.9); orbit.idle = 0; }
        else { orbit.idle += dt; if (orbit.idle > 1.5) { orbit.yaw = damp(orbit.yaw, 0, 2, dt); orbit.pitch = damp(orbit.pitch, 0.18, 2, dt); } }
        const cy = active.h + orbit.yaw;
        const dist = 6.3 + sp * 0.03;
        const g = active.car.group.position;
        const want = tmpV.set(g.x + Math.sin(cy) * dist * Math.cos(orbit.pitch), g.y + 1.3 + Math.sin(orbit.pitch) * dist, g.z + Math.cos(cy) * dist * Math.cos(orbit.pitch));
        const minY = world.groundHeight(want.x, want.z, g.y) + 0.4;
        want.y = Math.max(want.y, minY);
        const ck = 10 + sp * 0.25;                      // stiffer follow at speed: no 15 m lag at 500 km/h
        camera.position.x = damp(camera.position.x, want.x, ck, dt);
        camera.position.y = damp(camera.position.y, want.y, ck, dt);
        camera.position.z = damp(camera.position.z, want.z, ck, dt);
        focus.set(g.x - Math.sin(active.h) * 1.5, g.y + 1.05, g.z - Math.cos(active.h) * 1.5);
        camera.lookAt(focus);
        fov = 62 + Math.min(14, sp * 0.3) + Math.max(0, Math.min(14, (sp - 50) * 0.16));
        active.car.glass.opacity = 0.86;
      } else {
        cockpitLook.yaw = clamp(cockpitLook.yaw - m.x * sens(), -2.2, 2.2);
        cockpitLook.pitch = clamp(cockpitLook.pitch - m.y * sens(), -0.8, 0.6);
        if (!m.x && !m.y) cockpitLook.yaw = damp(cockpitLook.yaw, 0, 0.8, dt);
        camera.position.copy(active.headPos());
        active.car.glass.opacity = 0.12;
        camera.rotation.set(cockpitLook.pitch - 0.06 + active.pitch + active.car.group.rotation.x, active.h + cockpitLook.yaw, -active.roll * 0.6, 'YXZ');
        fov = 72;
      }
    } else {
      if (photoFov && Math.hypot(player.pos.x - photoFov.x, player.pos.z - photoFov.z) > 0.25) photoFov = null;
      fov = (photoFov ? photoFov.fov : 70) + player.fovKick;
    }
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.2;
      camera.position.y += (Math.random() - 0.5) * shake * 0.2;
      shake = damp(shake, 0, 5, dt);
    }
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = damp(camera.fov, fov, 6, dt); camera.updateProjectionMatrix(); }

    if (!paused) forest.update(dt, { ok: sceneTime(), px: pos0().x, pz: pos0().z, camera, sound: forestSound });
    sky.position.copy(camera.position);
    // grass only near the camera (distance culling per 16 m chunk)
    if ((frameNo & 127) === 0) wetScene(scene);            // materials streamed in since
    // the 8 nearest street lamps, for their reflections in a wet road
    if (post.ssr && (frameNo & 7) === 4) {
      const cp = camera.position, near = [];
      for (const l of allLamps) { const d = (l.x - cp.x) ** 2 + (l.z - cp.z) ** 2; if (d < 150 * 150) near.push([d, l]); }
      near.sort((a, b) => a[0] - b[0]);
      post.ssr.setLamps(near.slice(0, 8).map(e => e[1]), M.lampGlass.emissiveIntensity);
    }
    if ((frameNo++ & 7) === 0) {
      for (const gm of built.grass) gm.visible = Math.abs(gm.userData.cz - camera.position.z) < 56 && Math.abs(camera.position.x) < 60;
      geoWorld.update(camera.position);
      shareInstancedDepth(scene);                         // (the trees and ground cover streamed in since)
      forest.near(camera.position);
      roadName = roadNameAt(pos0().x, pos0().z);
      // the easter egg in the wood of the hill of the cross
      const egg = hillEgg && !hillEggFound ? hillEgg : null;
      if (egg && Math.hypot(pos0().x - egg.x, pos0().z - egg.z) < egg.r) { hillEggFound = true; hud.toast('Easter egg: ai găsit scheletul din pădurea de pe dealul crucii!', 6); }
      for (const v of vehicles) v.car.group.visible = v === active || Math.hypot(v.x - camera.position.x, v.z - camera.position.z) < 320;
    }

    // HUD
    const pos = mode === 'car' && active ? active.car.group.position : player.pos;
    const yaw = mode === 'car' && active ? (camMode === 'chase' ? active.h + orbit.yaw : active.h + cockpitLook.yaw) : player.yaw;
    const dHome = Math.hypot(pos.x - 6, pos.z - 0);
    hud.update(dt, {
      prompt, driving: mode === 'car', kmh: active ? active.speed * 3.6 : 0, gear: active?.gear ?? 1, carName: active?.name ?? '',
      x: pos.x, z: pos.z, yaw,
      cars: vehicles.map(v => ({ x: v.x, z: v.z, h: v.h, active: v === active })),
      location: (crossLm && Math.hypot(pos.x - crossLm.x, pos.z - crossLm.z) < 45 ? 'Crucea de pe deal · ' : brLm && brLm.surface(pos.x, pos.z) !== null && pos.y > brLm.surface(pos.x, pos.z) - 2.5 ? 'Podul peste Prahova · ' : roadName ? roadName + ' · ' : '') + (dHome < 14 ? 'Acasă · nr. 123H' : `acasă ${dHome < 1000 ? Math.round(dHome) + ' m' : (dHome / 1000).toFixed(1) + ' km'}`),
    });
    audio.update(dt, { rain: RAIN.uRain.value, night, horror, driving: mode === 'car', rpm: active?.rpm ?? 0, throttle: active?.throttle ?? 0, slip: active?.lastLat ?? 0, horn: hornOn, speed: active ? Math.abs(active.speed) : 0 });
    // free camera for automated tests / screenshots (window.__game.cam = {x, y, z, yaw, pitch})
    const fc = window.__game?.cam;
    if (fc) { camera.position.set(fc.x, fc.y, fc.z); camera.rotation.set(fc.pitch, fc.yaw, 0, 'YXZ'); sky.position.copy(camera.position); geoWorld.update(camera.position); }
    // the sun's shadow cascades follow the view, ahead of the camera, texel-snapped
    const camGround = world.groundHeight(camera.position.x, camera.position.z);
    cascades.update(camera, camGround);
    // rain: it starts / stops in ~2 s, the surfaces soak in ~10 s and dry in ~1 min; where it lands comes from the
    // height map seen from above (crowns, roofs, car roofs), refreshed as you move
    RAIN.uRain.value = damp(RAIN.uRain.value, rainTarget, 1.2, dt);
    RAIN.uWet.value = RAIN.uWet.value < rainTarget ? Math.min(rainTarget, RAIN.uWet.value + dt / 10) : Math.max(rainTarget, RAIN.uWet.value - dt / 60);
    RAIN.uRainTime.value = t;
    if (RAIN.uWet.value > 0.001 || RAIN.uRain.value > 0.002) rainOcc.update(renderer, scene, camera.position, camGround, [sky, rainFX.group]);
    // night: lightning in the storm, the moon's shaft, the torch, the bear on the hill
    const flash = lightning.update(dt, horror === 1 && !paused);
    sky.material.uniforms.uFlash.value = flash;
    hemi.intensity = baseHemi + flash * 2.2; scene.environmentIntensity = baseEnv + flash * 1.4;
    moonBeam?.update(t, camera);
    if (forest.live && moonBeam?.on && (frameNo & 1)) moonBeam.light.shadow.needsUpdate = true;   // (they move in the moonlight)
    if (mode === 'car' && flashlight.on) flashlight.set(false);
    flashlight.update(camera);
    rainFX.update(camera, rainLight + flash * 0.6, flashlight.info, moonBeam?.info);
    spray.update(dt, mode === 'car' && active ? active : null, mode === 'car' && active ? active.car.group.position.y : 0, RAIN.uWet.value, rainLight + flash * 0.6, camera.position);
    if (post.ssr) post.ssr.enabled = RAIN.uWet.value > 0.01 && !window.__game?.noSSR;   // reflections in wet ground only when there is any
    if (!paused) {
      const pp = mode === 'car' && active ? active.car.group.position : player.pos;
      bear?.update(dt, t, { active: horror === 1, px: pp.x, pz: pp.z, inCar: mode === 'car', torch: flashlight.on, camX: camera.position.x, camZ: camera.position.z });
    }
    post.grade.uniforms.uTime.value = t;
    scene.updateMatrixWorld();
    post.composer.render(dt);
    perf.end();
    input.endFrame();
  });

  function screenshot() {
    if (window.top !== window) { hud.toast('Captura de ecran (P) merge când rulezi jocul local'); return; }
    scene.updateMatrixWorld();
    post.composer.render(0);
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = 'strada-' + Date.now() + '.png';
    a.click();
    hud.toast('Captură salvată');
  }

  // automated test hooks (used by tools/test.mjs)
  window.__game = { geo: geoWorld.info, geoWorld, get sun() { return sunInfo; }, get moon() { return moonInfo; }, get night() { return night; }, get horror() { return horror; }, bear, moonBeam, flashlight, cascades, forest, sceneTime, goToForest, RAIN, rainOcc, setWeather, setHour, get weather() { return weatherKey; }, get hour() { return hour; }, post, dogs, walkers, player, vehicles, camera, renderer, scene, views: PHOTO_VIEWS, gotoView, enterCar, exitCar: () => exitCar(true), begin, get mode() { return mode; }, input, world, TEX, M };
}

main().catch((e) => {
  console.error(e);
  $('loadText').textContent = 'Eroare: ' + e.message;
  $('loader').classList.add('err');
});
