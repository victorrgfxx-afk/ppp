import * as THREE from 'three';
import { QUALITY, defaultQuality, W, setProfile } from './config.js';
import { loadTextures, TEX } from './textures.js';
import { buildMaterials, M } from './materials.js';
import { createSky, createLights, buildEnvironment, setSkyWeather } from './sky.js';
import { installCascadedShadows, SunCascades, WEATHER, WEATHER_ORDER, sunlightAt, HOURS, hourLabel, shareInstancedDepth } from './lighting.js';
import { RAIN, SNOW, STORM, UNDER_SNOW, wetScene, RainOcclusion, RainFX, SnowFX, SnowBlanket, SnowLee, snowRoads, Spray } from './rain.js';
import { Runoff, EaveStreams } from './runoff.js';
import { SnowTrail } from './snowtrail.js';
import { MoonBeam, Flashlight, Headlights, Lightning } from './night.js';
import { LAMPS } from './geo/props.js';
import { Bear } from './bear.js';
import { Wildlife } from './wildlife.js';
import { Birds } from './birds.js';
import { ForestScene } from './forest.js';
import { Hikers } from './hikers.js';
import { laneAt, laneLength, CLIP } from './geo/urcus.js';
import { HILL_BOX } from './geo/drapel.js';
import { SCENE_SPOT } from './geo/hillwood.js';
import { CollisionWorld } from './collision.js';
import { buildWorld } from './world.js';
import { buildCar, paintMaterial, DAYLIGHT } from './cars.js';
import { buildATV } from './atv.js';
import { buildMaybach, MAYBACH_TUNE } from './maybach.js';
import { DOBLO_OPTS } from './doblo.js';
import { keepClear } from './geo/trees.js';
import { Vehicle, TRACTION } from './vehicle.js';
import { FirDetail } from './geo/firs.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { createComposer } from './post.js';
import { Net, clean } from './net.js';
import { RemotePlayers, seatPos } from './remote.js';
import { Share } from './share.js';
import { PerfMeter } from './perf.js';
import { WIND, damp, clamp, rng } from './util.js';
import { boxBox } from './collision.js';
import { Walker } from './npc.js';
import { buildDogs } from './dogs.js';
import { AIR_GLSL, AIR_H0, HAZE_H, hazeFor, visibilityOf } from './air.js';
import { SEASON, FOLIAGE, dormant } from './season.js';
import { loadGeoAll, buildGeoWorld, geoGround, GEO, footprintIndex, roadNameAt, sunDirection, moonDirection, profileAt, bridgeHeight, FAR } from './geo/index.js';

// The air between the eye and every point (air.js): molecules and haze, each with its own fall-off with height, per
// colour channel, integrated along the line of sight. scene.fog is a THREE.Fog used as the carrier of the haze's two
// numbers (near: its extinction at the street's level, 1/m; far: its scale height, m). Opaque surfaces put 1 + the
// haze's share into the alpha of the frame for the distance blur (post.js); wet ground writes its own value below 1.
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogW;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogW = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );\n#endif';
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogW;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
${AIR_GLSL}
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
	{
		#ifdef FOG_EXP2
			float airB = fogDensity, airH = ${HAZE_H.toFixed(1)};
		#else
			float airB = fogNear, airH = fogFar;
		#endif
		vec3 airT, airL; float airTau;
		airPath( cameraPosition, vFogW, airB, airH, fogColor, airT, airL, airTau );
		gl_FragColor.rgb = gl_FragColor.rgb * airT + airL;
		#ifdef OPAQUE
			gl_FragColor.a = 2.0 - exp( - airTau );
		#endif
	}
#endif`;
// one sun, several shadow maps (fine near, coarse far): patched into the light loop before any shader compiles
installCascadedShadows();
// Moment of the photos (late September, late morning): sun from the real SSE over Poiana Câmpina. The hour can be
// changed in the menu (O); local summer time is UTC+3. The snow modes are on 1 February 2026 (UTC+2): a low sun, 26 deg
// at 11:30, up from ~7:40 to 17:25, and that night's full moon (the "snow moon", 22:09 UTC) high over the snow.
const sunTime = (hour, winter) => winter ? new Date(Date.UTC(2026, 1, 1) + (hour - 2) * 3600e3) : new Date(Date.UTC(2026, 8, 26) + (hour - 3) * 3600e3);

// smooth 1-D value noise (0..1): the gusts of the wind
const vn1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), h = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }; return h(i) * (1 - u) + h(i + 1) * u; };

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
  scene.fog = new THREE.Fog(fogColor, hazeFor(32000), HAZE_H);             // (near: the haze's extinction, far: its scale height: air.js)
  // the sky and the far relief (to 100 km) are drawn first, in a pass of their own (post.js FarPass), the map over them:
  // no background colour here (three.js would clear the frame with it)
  const farScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 26000);   // (the map's far corner)

  const sky = createSky();
  farScene.add(sky);
  const sunDir = sky.material.uniforms.uSunDir.value;
  let hour = HOURS.includes(store.get('hour', 11.5)) ? store.get('hour', 11.5) : 11.5;
  let sunInfo = sunDirection(sunTime(hour, WEATHER[store.get('weather', 'senin')]?.winter));
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
  let snowFall = 0, snowCover = 0, winter = false, setWinter = null;          // (setWinter: once the map is built)
  // the leaves: autumn colours (mid-October, as in the user's drone photos) or the summer's green (season.js; menu)
  let foliage = FOLIAGE[store.get('foliage', 'toamna')] !== undefined ? store.get('foliage', 'toamna') : 'toamna';
  // the camera's motion blur in play (post.js CinePass: the shutter of a film camera, 0.5 = 180 degrees); on Ultra a
  // light one by default
  let mblur = +store.get('mblur', qKey === 'ultra' ? 0.3 : 0) || 0;
  // the edges and the distance: smoothed over time (TAA, taa.js) or within the frame (SMAA); TAA but on the lowest setting
  let aa = store.get('aa', 'taa') === 'smaa' ? 'smaa' : 'taa';
  // the tone curve (the colours): ACES, the game's own (its light was tuned under it), AgX (a film's softer roll-off,
  // less saturated) or Khronos PBR Neutral (the hues kept); each with the exposure that keeps a scene's mean the same
  // (measured on the street at a low sun: ACES 64.6, AgX 71.4, Neutral 54.9 out of 255 at one exposure)
  const TONEMAPS = { aces: [THREE.ACESFilmicToneMapping, 1], agx: [THREE.AgXToneMapping, 0.9], neutral: [THREE.NeutralToneMapping, 1.18] };
  let tonemap = TONEMAPS[store.get('tonemap', 'aces')] ? store.get('tonemap', 'aces') : 'aces', baseExposure = 0.92;
  const exposeTo = (e) => { baseExposure = e; renderer.toneMapping = TONEMAPS[tonemap][0]; renderer.toneMappingExposure = e * TONEMAPS[tonemap][1]; };
  const lastCam = new THREE.Vector3(), lastQ = new THREE.Quaternion(), _kv = new THREE.Vector3(), _kb = new THREE.Vector4();
  let storm = 0, stormTarget = 0, baseFog = 0, gust = 1, windSpeed = 0;       // (a gale: the blizzard or the squall)
  // the gale's mean speed (m/s) and where it blows to (world angle); a squall's gusts come in bursts (rafale); blizzard:
  // the gale with the snow flying in it (STORM.uStorm: the flakes, the drift, the plastered snow)
  let galeBase = 15, galeAng = Math.atan2(-0.9986, 0.052), squall = false, blizzard = 0;
  // shelter from the wind where you are (0 in the open .. 0.9 right behind a wall): what stands upwind within a few of
  // its heights takes most of the wind off (behind a wall or a house ~10 % of it gets through close by, about half ~4
  // heights back, all of it ~6 heights back); a trunk or a pole only by how wide it is across the wind; among the
  // trees of a forest it drops by up to ~60 %
  let shelter = 0;
  const shQ = [], shWind = new THREE.Vector2();
  const shelterAt = (x, y, z, wx, wz) => {
    const L = 16;
    world.query(x - wx * L / 2, z - wz * L / 2, L / 2 + 0.5, shQ);
    let best = 0, trees = 0;
    for (let i = 0; i < shQ.length; i++) {
      const b = shQ[i];
      if (b.y1 < y + 0.7 || b.y0 > y + 1.4 || b.tag === 'npc' || b === active?.box) continue;
      // the ray from (x, z) upwind, in the box's frame: where it enters the box
      const dx = x - b.x, dz = z - b.z, ox = dx * b.c - dz * b.s, oz = dx * b.s + dz * b.c;
      const rx = -wx * b.c + wz * b.s, rz = -wx * b.s - wz * b.c;
      let t0 = 0, t1 = L;
      for (const [o, r, h] of [[ox, rx, b.hw], [oz, rz, b.hd]]) {
        if (Math.abs(r) < 1e-6) { if (Math.abs(o) > h) { t0 = 1e9; break; } continue; }
        const ta = (-h - o) / r, tb = (h - o) / r;
        t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
      }
      if (b.tag === 'tree' && Math.hypot(b.x - x, b.z - z) < 9) trees++;
      if (t0 > t1) continue;
      const H = Math.min(6, b.y1 - y), across = b.hw * Math.abs(-wz * b.c - wx * b.s) + b.hd * Math.abs(-wz * b.s + wx * b.c);
      const reach = Math.max(2, 6 * H);
      best = Math.max(best, (1 - THREE.MathUtils.smoothstep(t0, 0.3 * reach, reach)) * THREE.MathUtils.smoothstep(across, 0.1, 0.9));
    }
    return Math.max(0.9 * best, Math.min(0.6, trees * 0.05));
  };
  let moonBeam = null, flashlight = null, headlights = null, bear = null, gradeU = null, vision = null;   // (made once the map is built)
  const mixA = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  // night palettes: a clear moonlit sky, or the low deck of a night storm
  const NIGHT = {
    clear: { zenith: [0.004, 0.007, 0.018], horizon: [0.014, 0.02, 0.034], cloudLit: [0.05, 0.056, 0.07], cloudDark: [0.012, 0.013, 0.017], fog: [0.012, 0.015, 0.024] },
    deck: { zenith: [0.007, 0.008, 0.011], horizon: [0.011, 0.012, 0.016], cloudLit: [0.03, 0.032, 0.039], cloudDark: [0.01, 0.011, 0.013], fog: [0.013, 0.014, 0.018] },
  };
  const applyWeather = (key, h = hour) => {
    weatherKey = key; hour = h;
    const date = sunTime(hour, WEATHER[key].winter);
    sunInfo = sunDirection(date); moonInfo = moonDirection(date);
    const w = WEATHER[key], L = sunlightAt(sunInfo.el), d = L.day, warm = L.color.map(c => THREE.MathUtils.lerp(c, 1, d));
    night = 1 - THREE.MathUtils.smoothstep(sunInfo.el, -12, -3);           // 0 by day, 1 after nautical dusk
    const moonUp = THREE.MathUtils.smoothstep(moonInfo.el, -1, 5) * moonInfo.illum, overcast = w.cover > 0.6;
    rainTarget = w.rain ?? 0;
    snowFall = w.snow ?? 0; snowCover = w.snowCover ?? 0;
    if (!!w.winter !== winter) { winter = !!w.winter; setWinter?.(winter); }
    SEASON.uAutumn.value = winter ? 0 : FOLIAGE[foliage];                       // (bare in the snow)
    horror = night > 0.5 && rainTarget > 0 ? 1 : 0;                         // a night storm: the bear is out
    rainLight = (0.3 + 0.7 * d) * (1 - 0.75 * night);
    // the light (and its cascaded shadows) comes from the moon at night
    sunDir.copy(night > 0.5 ? moonInfo.dir : sunInfo.dir);
    const N = overcast ? NIGHT.deck : NIGHT.clear, sunVis = THREE.MathUtils.smoothstep(sunInfo.el, -3, 1);
    // Night light, in the ratios of the real one (the frame's exposure stays where the lamps, the torch and the sky
    // were set). The full moon gives ~0.25 lux; here 0.48 on a surface facing it (moonlit grass ~20/255 on the screen,
    // a moonlit wall or snow ~100, the moon's shadows near black). The sky around it adds a fifth to a
    // quarter of that, as the daytime sky does to the sun (the same air scattering the same light): the moon's
    // shadows are deep. Under an overcast deck no direct light, the deck's diffuse glow only. The ground's light
    // bounced back into the image-based light was a fixed daytime 0.33 (5x the moon: the night's grass and leaves
    // glowed in colour, its shadows washed out): it is the ground's albedo (~0.2) times the light that reaches it.
    const moonSin = Math.max(0, Math.sin(moonInfo.el * Math.PI / 180)), moonKey = 0.48 * moonUp;
    const moonDir = moonKey * (overcast ? 0.06 : 1), skyAmb = moonKey * (overcast ? 0.3 : 0.22) * Math.max(moonSin, 0.3) + 0.004;
    const dayGround = 0.35 + 0.65 * d, nightGround = 0.2 * (moonDir * moonSin + skyAmb) / Math.PI / 0.32;
    const gk = THREE.MathUtils.lerp(dayGround, nightGround, night);
    setSkyWeather(sky, { ...w, envGround: (w.envGround ?? [0.33, 0.33, 0.31]).map(v => v * gk), sunColor: mul(w.sunColor, L.color).map(v => v * sunVis),
      zenith: mixA(w.zenith, N.zenith, night), horizon: mixA(mul(w.horizon, warm), N.horizon, night),
      cloudLit: mixA(mul(w.cloudLit, warm), N.cloudLit, night), cloudDark: mixA(w.cloudDark, N.cloudDark, night),
      bright: THREE.MathUtils.lerp(w.bright * (0.3 + 0.7 * d), 1, night) });
    const su = sky.material.uniforms;
    su.uNight.value = night; su.uMoonDir.value.copy(moonInfo.dir); su.uMoonCol.value.set(0.9, 0.93, 1).multiplyScalar(moonUp);
    su.uHole.value = night * (overcast ? 1 : 0);                              // the moon looks through a gap above the hill
    if (night > 0.5) { sun.color.setRGB(1, 0.94, 0.86); sun.intensity = moonDir; }   // (sunlight off the moon, a little redder, ~4100 K: the blue of a moonlit night is the eye's - vision.js)
    else { sun.color.fromArray(mul(w.sunColor, L.color)); sun.intensity = w.sun * L.intensity; }
    sun.shadow.intensity = w.shadow;
    hemi.color.fromArray(mixA(w.hemiSky, [0.16, 0.2, 0.32], night)); hemi.groundColor.fromArray(mixA(w.hemiGround, [0.03, 0.03, 0.035], night));
    hemi.intensity = baseHemi = THREE.MathUtils.lerp(w.hemi * (0.35 + 0.65 * d), skyAmb * 0.55 / 0.2, night);   // (the image-based light gives the rest)
    fogColor.fromArray(mixA(mul(w.fog, warm).map(v => v * (0.45 + 0.55 * d)), N.fog, night)); scene.fog.color.copy(fogColor);   // (FogExp2 keeps its own copy)
    scene.fog.near = baseFog = hazeFor(w.vis) * (horror ? 1.3 : 1);
    scene.fog.far = w.hazeH ?? HAZE_H;
    stormTarget = w.storm ?? 0;
    galeBase = w.gale ?? 15; squall = !!w.squall;
    if (w.galeFrom !== undefined) {                                           // (a compass bearing: where it comes from)
      const b = (w.galeFrom + 180) * Math.PI / 180, th = GEO.meta.origin.bearing * Math.PI / 180, e = Math.sin(b), nn = Math.cos(b);
      galeAng = Math.atan2(e * Math.sin(th) + nn * Math.cos(th), -e * Math.cos(th) + nn * Math.sin(th));
    } else galeAng = Math.atan2(-0.9986, 0.052);
    exposeTo(THREE.MathUtils.lerp(w.exposure * (1 + 0.7 * (1 - d)), 2.6, night));   // like a camera: it opens up when the light is low
    scene.environment?.dispose();
    scene.environment = buildEnvironment(renderer, sky);
    scene.environmentIntensity = baseEnv = w.env * (0.35 + 0.65 * d);
    FAR.uAmb.value.fromArray(mixA(w.zenith, w.horizon, 0.6)).multiplyScalar(baseEnv * 1.6 * (1 - 0.85 * night)); FAR.uWinter.value = w.winter ? 1 : 0;
    // street lamps on at night; the moon's shaft on the hill of the cross; the bear's eyes catch the light
    M.lampGlass.emissive.setRGB(1, 0.78, 0.5); M.lampGlass.emissiveIntensity = 4 * (1 - THREE.MathUtils.smoothstep(sunInfo.el, -6, 1));
    // (the hill of the cross under a night deck gets the moon through its gap, as it would under a clear sky: no more;
    // with no deck the whole land has it and there is no shaft to see)
    moonBeam?.set(night > 0.5 && moonUp > 0.1 && overcast, moonInfo.dir, moonKey - moonDir, rainTarget > 0 ? 1 : 0.6, scene.fog.near);
    // what stands for daylight in an unlit tail lens and in the photo facades' own baked light: gone at night
    const dayK = (1 - night) * (0.35 + 0.65 * d);
    DAYLIGHT.k = dayK; for (const m of DAYLIGHT.tails) m.emissiveIntensity = 0.15 * dayK;
    M.facadePorch.emissiveIntensity = 0.42 * dayK; M.facadeVeranda.emissiveIntensity = 0.38 * dayK; M.kneeWall.emissiveIntensity = 0.18 * dayK;
    // the eye: cd/m2 per unit of the scene's light (the sun's ~3.8 is ~100 000 lux, the moon's 0.48 ~0.25 lux)
    if (vision) { vision.abs = Math.exp(THREE.MathUtils.lerp(Math.log(26000), Math.log(0.25 / 0.48), night)); vision.enabled = night > 0.02; }
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
  for (const m of geoWorld.far) farScene.add(m);
  FAR.uH0.value = GEO.meta.origin.h0;
  const built = buildWorld(scene, world, Q, { geo: true, street: world.streetZ, fronts: geoWorld.fronts, blocked: footprintIndex() });
  const dogs = buildDogs(scene, world);

  // ---------- parked cars exactly as in the photos ----------
  progress(0.93, 'Parchez mașinile…');
  await new Promise(r => setTimeout(r, 20));
  const tCars = performance.now();
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
  // photo 85: the red Fiat Doblò Cargo on the oil wells' pad (doblo.js)
  const soLm = geoWorld.landmarks?.find(l => l.type === 'sonda');
  if (soLm) for (const c of soLm.cars || []) park(c.model, paintMaterial(c.paint, { metallic: 0.2, rough: 0.33, dusty: c.dusty ?? 0.35 }), 'plateB', c.x, c.z, c.h, c.model === 'doblo' ? { ...DOBLO_OPTS } : {});
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
  console.log('[geo]', 'mașini ' + vehicles.length, Math.round(performance.now() - tCars), 'ms');
  // the neighbour walking home with a yellow bag (photo 7)
  const walkers = [new Walker(scene, world, { x: -0.4, z0: 40, z1: 104 })];

  // ---------- player / input / audio / HUD ----------
  const player = new Player(camera, world);
  const input = new Input(canvas);
  const audio = new Audio();
  const hud = new HUD(world, built.houses, { geo: GEO, ortho: gt.ortho.image, orthoW: gt.orthoW?.image });
  const post = createComposer(renderer, scene, camera, Q, farScene);
  const taaMover = { obj: null, min: new THREE.Vector3(), max: new THREE.Vector3() };
  vision = post.vision;
  gradeU = post.grade.uniforms;
  // night: the moon's shaft on the hill of the cross, the torch, the storm's lightning and the bear of the hill
  const crossAt = geoWorld.landmarks?.find(l => l.type === 'cross');
  if (crossAt) moonBeam = new MoonBeam(scene, crossAt, TEX.noise);
  // no GPS signal on the hill of the cross: the hill (its meadows and wood, geo/drapel.js) and the whole lane over it
  // (urcus.js: the walkers' clip, the Maybach), wherever it is more than 150 m from a house (the last houses of Strada
  // Măgurii stand ~280 m below the cross); a 10 m raster. Driving in, the navigation - the car's, your phone's, the
  // minimap - loses it after ~1 s; driving out, it finds it again after ~3 s
  const noSignalZone = (() => {
    const H = HILL_BOX, R = 60, NEAR = 150, S = 10, pts = [];
    for (let s = 0, n = laneLength(); s <= n; s += 5) { const p = laneAt(s); pts.push([p.x, p.z]); }
    let x0 = H.x0, x1 = H.x1, z0 = H.z0, z1 = H.z1;
    for (const [x, z] of pts) { x0 = Math.min(x0, x - R); x1 = Math.max(x1, x + R); z0 = Math.min(z0, z - R); z1 = Math.max(z1, z + R); }
    const nx = Math.ceil((x1 - x0) / S) + 1, nz = Math.ceil((z1 - z0) / S) + 1, M = new Uint8Array(nx * nz);
    const stamp = (x, z, r, v) => {
      for (let j = Math.max(0, Math.floor((z - r - z0) / S)); j <= Math.min(nz - 1, Math.ceil((z + r - z0) / S)); j++)
        for (let i = Math.max(0, Math.floor((x - r - x0) / S)); i <= Math.min(nx - 1, Math.ceil((x + r - x0) / S)); i++)
          if (Math.hypot(x0 + i * S - x, z0 + j * S - z) < r) M[j * nx + i] = v;
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * S, z = z0 + j * S; if (x >= H.x0 && x <= H.x1 && z >= H.z0 && z <= H.z1) M[j * nx + i] = 1; }
    for (const [x, z] of pts) stamp(x, z, R, 1);
    for (const b of GEO.buildings) {
      let bx = 0, bz = 0; for (let i = 0; i < b.p.length; i += 2) { bx += b.p[i]; bz += b.p[i + 1]; }
      bx /= b.p.length / 2; bz /= b.p.length / 2;
      if (bx > x0 - NEAR && bx < x1 + NEAR && bz > z0 - NEAR && bz < z1 + NEAR) stamp(bx, bz, NEAR, 0);
    }
    // (only the ground joined to the cross: no stray corner of the hill's box beyond the houses)
    if (crossAt) {
      const q = [Math.round((crossAt.z - z0) / S) * nx + Math.round((crossAt.x - x0) / S)];
      for (let k = 0; k < q.length; k++) {
        const c = q[k]; if (M[c] !== 1) continue; M[c] = 2;
        const i = c % nx; if (i > 0) q.push(c - 1); if (i < nx - 1) q.push(c + 1); if (c >= nx) q.push(c - nx); if (c < nx * (nz - 1)) q.push(c + nx);
      }
    }
    return (x, z) => { const i = Math.round((x - x0) / S), j = Math.round((z - z0) / S); return i >= 0 && j >= 0 && i < nx && j < nz && M[j * nx + i] === 2; };
  })();
  let noSignal = false, signalT = 0;
  // the ATV of the hill of the cross (atv.js): on open, nearly level ground a few metres from the cross's slab, its
  // nose away from it; built for the snow (knobby tyres, 4x4), the blizzard's ride
  let atv = null;
  if (crossAt) {
    const q = [];
    let best = null;
    for (let k = 0; k < 64 && !best; k++) {
      const r = 8 + (k >> 4) * 3, a = (k % 16) / 16 * Math.PI * 2 + (k >> 4) * 0.2;
      const x = crossAt.x + Math.cos(a) * r, z = crossAt.z + Math.sin(a) * r, y = world.groundHeight(x, z);
      const slope = Math.max(...[[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]].map(([dx, dz]) => Math.abs(world.groundHeight(x + dx, z + dz) - y) / 1.4));
      if (slope > 0.18) continue;
      if (world.query(x, z, 3, q).some(b => b.y1 > y + 0.3 && b.y0 < y + 2 && Math.hypot(b.x - x, b.z - z) < 2.3 + Math.max(b.hw, b.hd))) continue;
      best = { x, z, a };
    }
    if (best) {
      const car = buildATV(0xa3201a);
      scene.add(car.group);
      atv = new Vehicle(car, world, best.x, best.z, Math.atan2(-Math.cos(best.a), -Math.sin(best.a)), { power: 1.25, vmax: 22 });
      atv.name = car.model.name;
      vehicles.push(atv);
      atv.update(0.016, null);
    }
  }
  // the black Mercedes-Maybach GLS 600 (maybach.js), past the scene of the clip IMG_0725 on the lane over the hill of the
  // cross: where the walkers' climb ends (they stop at s 907-918 m at the top of the rise), a little way down the other
  // side towards the cross, parked at the right-hand edge of the asphalt (the verge drops away steeply to the meadow
  // there; the narrow lane leaves 2.5 m to pass), facing on down towards the cross. The spot: level across (the lane's
  // own grade is fine), the fewest trunks near; then kept clear of the wood's trees, bushes and deadwood
  let maybach = null;
  {
    const q = [];
    let best = null;
    for (let s = 890; s >= 852; s -= 1.5) for (const o of [-1.2, -1.35, -1.5]) {
      const p = laneAt(s, o), h = Math.atan2(p.hx, p.hz), c = Math.cos(h), sn = Math.sin(h);
      // the ground under the four wheels: left and right, behind and ahead
      const [lb, rb, la, ra] = [[-0.86, -1.6], [0.86, -1.6], [-0.86, 1.6], [0.86, 1.6]].map(([a, b]) => world.groundHeight(p.x + c * a - sn * b, p.z - sn * a - c * b));
      const roll = Math.abs(lb + la - rb - ra) / 2 / 1.72, pitch = Math.abs(lb + rb - la - ra) / 2 / 3.2, twist = Math.abs(lb - rb - la + ra);
      if (roll > 0.06 || pitch > 0.16 || twist > 0.12) continue;
      const gy = world.groundHeight(p.x, p.z), probe = new world.Box(p.x, p.z, 1.15, 2.75, h);
      const hits = world.query(p.x, p.z, 5, q).filter(b => b.y1 > gy + 0.3 && b.y0 < gy + 2.2 && !b.vehicle && boxBox(probe, b));
      if (hits.some(b => b.tag !== 'tree')) continue;                          // (walls, fences, poles, rocks: never)
      const score = roll * 3 + pitch + twist + hits.length * 0.15 + Math.abs(s - 876) * 0.004;
      if (!best || score < best.score) best = { x: p.x, z: p.z, h, s, o, score };
    }
    if (best) {
      keepClear(best.x, best.z, 3.6);
      const car = buildMaybach();
      scene.add(car.group);
      maybach = new Vehicle(car, world, best.x, best.z, best.h, { tune: MAYBACH_TUNE });
      maybach.name = 'Mercedes-Maybach GLS 600'; maybach._spot = { s: best.s, o: best.o };
      vehicles.push(maybach);
      maybach.update(0.016, null);
    }
  }
  // multiplayer (alpha): the friend in this world (net.js: the room; remote.js: their figure, their car, their name)
  const mp = new Net(), others = new RemotePlayers(scene, vehicles);
  flashlight = new Flashlight(scene);
  headlights = new Headlights(scene);
  // the forest scene of the user's two clips, live in the clearing of the wood by the cross (+z of its stage points back
  // towards the cross); its carpet of dry leaves is always there
  const forest = new ForestScene(scene, { x: SCENE_SPOT.x, z: SCENE_SPOT.z, y: geoGround(SCENE_SPOT.x, SCENE_SPOT.z), yaw: 1.178, ground: geoGround, world });
  // the user's clip IMG_0725 on the lane up to the cross: the barefoot man and the three walkers ahead of him (16:11, clear)
  const hikers = new Hikers(scene, (x, z) => world.groundHeight(x, z), world, renderer);
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
  // the animals of the woods and the birds (wildlife.js, birds.js)
  const wildlife = new Wildlife(scene, world, { audio, quality: Q.label });
  const birds = new Birds(scene, world, { audio });
  // multiplayer: one game runs all of these for both of you, the other draws them as they are there (share.js)
  const share = new Share({ wildlife, birds, bear, walkers, lightning, forest, hikers, dogs });
  walkers.forEach((w, i) => { w.onHit = (car, push) => share.knocked(mp, i, car, push); });
  applyWeather(weatherKey);

  let mode = 'foot';       // 'foot' | 'car'
  let active = null;       // vehicle being driven
  let camMode = store.get('camMode', 'chase');
  let photoFov = null;      // zoomed photo views keep the lens' field of view until you walk away
  const orbit = { yaw: 0, pitch: 0.18, idle: 0 };
  const cockpitLook = { yaw: 0, pitch: 0 };
  let paused = true, started = false, hornOn = false;
  let riding = null;       // a friend's car you ride in as the passenger (multiplayer)
  const rideLook = { yaw: 0, pitch: 0 };
  let shake = 0;
  let riverT = 0, riverK = 0;                // the river's rush where you are (geo/water.js), looked up twice a second

  // The field of view (V62). 'natural' (the default): the angle the picture really takes up in your own field of view,
  // the screen's height seen from where your eyes are, so everything shows at its true angular size, as through a
  // window (the way simulators work it out: 2 atan(height / 2 distance)). A flat screen fills only part of the eye's
  // ~200 deg (~135 deg high); the rest is seen by turning the head - the mouse. 'binocular': the ~120 deg both eyes see
  // at once, squeezed onto the screen (everything looks smaller and farther). 'joc': the former 70 deg (vertical).
  const screenGuess = () => {
    const coarse = matchMedia('(pointer: coarse)').matches, w = screen.width, h = screen.height, small = Math.min(w, h) < 600;
    const mm = coarse ? (small ? 0.165 : 0.2) : 0.265;      // a CSS pixel (mm): phones, tablets, computers at their usual scaling
    const diag = Math.hypot(w, h) * mm / 25.4;
    return { diag: Math.round(diag * 2) / 2, dist: coarse ? (small ? 32 : 40) : diag < 17 ? 50 : 65 };
  };
  let fovMode = store.get('fov', 'natural'), scr = { ...screenGuess(), ...store.get('screen', {}) };
  const baseFov = () => {
    if (fovMode === 'joc') return 70;
    if (fovMode === 'binocular') return 2 * Math.atan(Math.tan(60 * Math.PI / 180) / (innerWidth / innerHeight)) * 180 / Math.PI;
    const mm = scr.diag * 25.4 / Math.hypot(screen.width, screen.height);                 // (one CSS pixel on this screen)
    return Math.min(100, 2 * Math.atan(innerHeight * mm / 2 / (scr.dist * 10)) * 180 / Math.PI);
  };
  const fovLabel = () => {
    const v = baseFov(), hz = 2 * Math.atan(Math.tan(v * Math.PI / 360) * innerWidth / innerHeight) * 180 / Math.PI;
    return `${Math.round(hz)}° × ${Math.round(v)}°`;
  };
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
  const rainFX = new RainFX(scene), rainOcc = new RainOcclusion(), spray = new Spray(scene, TEX.noise), snowFX = new SnowFX(scene);
  // left out of the rain's height map: the sky, the falling rain and snow, and the far forests' canopy shell (a lid at
  // crown height over the whole stand, roads through the wood included; near the camera the real trees stand in for it)
  // the lying snow: a blanket over the ground near the camera, shaped from the height maps and the roads (rain.js)
  const lowQ = qKey === 'low' || qKey === 'medium';
  const blanket = new SnowBlanket(scene, lowQ ? 192 : 384);
  rainOcc.roads = snowRoads(GEO.roads);
  const runoff = new Runoff(rainOcc), eaves = new EaveStreams(scene, runoff);
  // your footprints and the tyre tracks in it (snowtrail.js), and the snow's flight seen from upwind: nothing it
  // cannot blow through lets it pass (rain.js)
  const trail = new SnowTrail(lowQ ? 1024 : 2048, 24), snowLee = new SnowLee(lowQ ? 512 : 1024, lowQ ? 256 : 512);
  player.onStep = (foot, hs) => { if (SNOW.uSnow.value > 0.05) trail.step(player.pos, player.yaw, foot, hs > 4, SNOW.uSnowDepth.value); };
  player.onLand = () => { if (SNOW.uSnow.value > 0.05) trail.land(player.pos, player.yaw); };
  // the spruces near you in detail: the branches you push through, the snow that falls off them (geo/firs.js)
  const firs = new FirDetail(scene, { cap: { 'Scăzută': 12, 'Medie': 24, 'Înaltă': 40 }[Q.label] ?? 56, audio });
  firs.addSource(geoWorld.trees.firSource);
  if (built.forest) {
    const yard = [...built.forest.firRecords('spruce', { key: 'yard14', H: 14, crown: 2.9, low: 1.0, seed: 11 }),
      ...built.forest.firRecords('spruceB', { key: 'yard10', H: 10, crown: 2.2, low: 1.0, seed: 12 })];
    firs.addSource((x, z, Rr, out) => { for (const r of yard) if (Math.abs(r.x - x) < Rr && Math.abs(r.z - z) < Rr) out.push(r); });
  }
  const occHide = [sky, rainFX.group, eaves.group, snowFX.group, blanket.mesh, blanket.fine, firs.fall.clumps, firs.fall.powder, ...(geoWorld.canopy?.meshes ?? [])];
  // what falls or flies too fast for the anti-aliasing to follow: drawn after it (taa.js)
  post.taa?.setFX(scene, [rainFX.group, snowFX.group, spray.mesh, eaves.group, firs.fall.powder, others.tags]);
  // ...and every light effect that writes no depth (the moon's shaft over the hill, glows, the tyre spray): none of
  // them keeps the rain or the snow off the ground under it; in winter the bare broadleaf crowns neither (leafTex below)
  const occSkip = (o) => { const m = o.material; return !!m && !Array.isArray(m) && (m.depthWrite === false || m.userData.rainThrough || (winter && leafTex.includes(m.map))); };
  // the flying snow blows through leaves, needles, a crown's dense core, the snow on the branches, chain-link and
  // lattice (all cut out of cards), and through lines and glows; it does not through the rest. (The ground and the
  // water are left out too: the map keeps nothing that low anyway.)
  const softMat = (m) => m.depthWrite === false || m.alphaTest > 0 || m.userData.core || m.userData.leeSkip || (winter && leafTex.includes(m.map));
  const leeMatSkip = (m) => softMat(m) || m.userData.ue?.kind === 'terrain' || m.userData.ue?.kind === 'water';
  const leeSkip = (o) => o.isLine || o.isPoints || o.isSprite || o.userData.ue?.kind === 'far' ||
    (o.isMesh && !!o.material && (Array.isArray(o.material) ? o.material.every(leeMatSkip) : leeMatSkip(o.material)));
  // ...and the lying snow neither lies on them in a layer nor piles up against them (rain.js RainOcclusion: the shape
  // is baked from what is solid: never a sapling's or a shrub's branches)
  const softSkip = (o) => o.isLine || o.isPoints || o.isSprite || (o.isMesh && !!o.material && (Array.isArray(o.material) ? o.material.every(softMat) : softMat(o.material)));
  // winter (the snow modes): the broadleaves stand bare - every leaf texture shows twigs (one image swap reaches every
  // material and clone that uses it), and the far billboards and forest roof go bare too (geo/trees.js, canopy.js)
  const leafTex = [TEX.leaves, TEX.leavesSmall, TEX.leavesDense, TEX.leavesPinnate, TEX.leavesAutumn, TEX.leavesBeech, TEX.leavesHornbeam, TEX.leavesOak].filter(Boolean);
  const summerImg = new Map(leafTex.map(t => [t, t.image])), flowersImg = TEX.flowers.image;
  // (each texture's GPU copy is let go first: one already uploaded kept drawing its leaves after the image swap -
  // measured in the snow modes, the near broadleaves stayed green - while a fresh upload takes the new image)
  // (the twigs bring their own mip chain, which keeps the fine shoots from ~10 m on - textures.js coverageMips; the
  // window boxes' and the flower strip's plants are dried up, the staghorn sumacs' fronds gone)
  setWinter = (on) => {
    for (const t of leafTex) {
      t.image = on ? TEX.twigs.image : summerImg.get(t); t.mipmaps = on ? TEX.twigs.mipmaps : []; t.generateMipmaps = !on;
      t.dispose(); t.needsUpdate = true;
    }
    TEX.flowers.image = on ? TEX.flowersDry : flowersImg; TEX.flowers.dispose(); TEX.flowers.needsUpdate = true;
    M.sumac.visible = !on;
    SEASON.uDormant.value = on ? 1 : 0;
    geoWorld.setWinter(on);
  };
  // the grass and the low plants turn dormant in winter where the snow leaves them showing (season.js)
  for (const m of UNDER_SNOW) dormant(m);
  for (const gm of built.grass) dormant(gm.material);
  if (winter) setWinter(true);
  // a game started in the snow finds it already lying (a few cm while it snows, 25 cm the clear day after) and falling
  if (snowCover > 0 || snowFall > 0) SNOW.uSnow.value = 1;
  SNOW.uSnowDepth.value = snowCover > 0 ? 0.25 : snowFall > 0 ? 0.05 : 0;
  SNOW.uSnowFall.value = snowFall;
  storm = stormTarget; blizzard = snowFall > 0 ? storm : 0;
  if (blizzard > 0) { SNOW.uSnowDepth.value = 0.2; SNOW.uSnowPlaster.value = 0.7; }                     // (and a blizzard already blowing)
  else if (snowCover > 0) SNOW.uSnowPlaster.value = 0.5;                                               // (the trunks white on one side)
  let offRoad = false;                                                  // (in deep snow off the roads: slower going)
  const allLamps = [...LAMPS, ...(built.lamps ?? [])];                 // street lamp heads (map + Strada Gării)
  let snowLamps = [];                                                   // (the 6 nearest, for the snow swirling in their light)
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
  const setWeather = (key) => { applyWeather(key); store.set('weather', key); $('weather').value = key; $('weather2').value = key; torchForNight(); mp.worldChanged(weatherKey, hour); };
  const setHour = (h) => { applyWeather(weatherKey, h); store.set('hour', h); $('hour').value = h; $('hour2').value = h; torchForNight(); mp.worldChanged(weatherKey, hour); };
  // (the friend's, when they set it later than you: net.js)
  mp.world.k = weatherKey; mp.world.h = hour;
  mp.onWorld = (k, h) => {
    const was = weatherKey + hour;
    if (WEATHER[k] && k !== weatherKey) setWeather(k);
    if (typeof h === 'number' && h >= 0 && h < 24 && h !== hour) setHour(h);
    if (weatherKey + hour !== was) hud.toast('Vremea și ora comune cu prietenul: ' + WEATHER[weatherKey].label + ', ' + hourLabel(hour), 3);
  };
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
    if (!mp.room && mp.status === 'oprit') mp.start(mpCode, mpNick);     // (the room asks for nothing before the first join)
    $('start').classList.remove('on');
    $('pause').classList.remove('on');
    $('hud').classList.add('on');
  };
  $('play').addEventListener('click', begin);
  $('resume').addEventListener('click', begin);
  $('quality').addEventListener('change', (e) => { store.set('quality', e.target.value); location.reload(); });
  $('quality2').addEventListener('change', (e) => { store.set('quality', e.target.value); location.reload(); });
  $('sens').addEventListener('input', (e) => store.set('sens', parseFloat(e.target.value)));
  // the field of view: the mode, and for 'natural' the screen's diagonal and how far your eyes are from it
  const fovUi = () => {
    for (const id of ['fovMode', 'fovMode2']) {
      const el = $(id); if (!el) continue;
      el.querySelector('option[value="natural"]').textContent = `Natural, ca ochiul (${fovLabel()})`;
      el.value = fovMode;
    }
    for (const sfx of ['', '2']) { if ($('scrDiag' + sfx)) { $('scrDiag' + sfx).value = scr.diag; $('scrDist' + sfx).value = scr.dist; $('scrRow' + sfx).style.display = fovMode === 'natural' ? '' : 'none'; } }
  };
  for (const sfx of ['', '2']) {
    $('fovMode' + sfx)?.addEventListener('change', (e) => { fovMode = e.target.value; store.set('fov', fovMode); fovUi(); });
    for (const k of ['Diag', 'Dist']) $('scr' + k + sfx)?.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value); if (!(v > 0)) return;
      scr = { ...scr, [k === 'Diag' ? 'diag' : 'dist']: v }; store.set('screen', { diag: scr.diag, dist: scr.dist }); fovUi();
    });
  }
  addEventListener('resize', fovUi);
  fovUi();
  for (const sfx of ['', '2']) {
    const el = $('foliage' + sfx); if (!el) continue;
    el.value = foliage;
    el.addEventListener('change', (e) => {
      foliage = e.target.value; store.set('foliage', foliage); SEASON.uAutumn.value = winter ? 0 : FOLIAGE[foliage];
      for (const s2 of ['', '2']) if ($('foliage' + s2)) $('foliage' + s2).value = foliage;
    });
  }
  for (const sfx of ['', '2']) {
    const el = $('tonemap' + sfx); if (!el) continue;
    el.value = tonemap;
    el.addEventListener('change', (e) => {
      tonemap = TONEMAPS[e.target.value] ? e.target.value : 'aces'; store.set('tonemap', tonemap); exposeTo(baseExposure);
      for (const s2 of ['', '2']) if ($('tonemap' + s2)) $('tonemap' + s2).value = tonemap;
    });
  }
  // multiplayer: the room's code (the same for both of you) and, outside claude.ai, your name
  let mpCode = store.get('mpCode', 'prieteni'), mpNick = store.get('mpNick', '');
  for (const sfx of ['', '2']) {
    const c = $('mpCode' + sfx), n = $('mpNick' + sfx); if (!c) continue;
    c.value = mpCode; n.value = mpNick;
    c.addEventListener('change', (e) => {
      mpCode = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32) || 'prieteni'; store.set('mpCode', mpCode);
      for (const s2 of ['', '2']) if ($('mpCode' + s2)) $('mpCode' + s2).value = mpCode;
      if (started) mp.start(mpCode, mpNick);
    });
    n.addEventListener('change', (e) => {
      mpNick = e.target.value.trim().slice(0, 24); store.set('mpNick', mpNick);
      for (const s2 of ['', '2']) if ($('mpNick' + s2)) $('mpNick' + s2).value = mpNick;
      mp.publish({ n: clean(mpNick, 24) });
    });
    for (const el of [c, n]) el.addEventListener('keydown', (e) => e.stopPropagation());
  }
  post.setTAA(aa === 'taa');
  for (const sfx of ['', '2']) {
    const el = $('aa' + sfx); if (!el) continue;
    el.value = aa; el.disabled = !post.taa;
    el.addEventListener('change', (e) => {
      aa = e.target.value === 'smaa' ? 'smaa' : 'taa'; store.set('aa', aa); post.setTAA(aa === 'taa');
      for (const s2 of ['', '2']) if ($('aa' + s2)) $('aa' + s2).value = aa;
    });
  }
  for (const sfx of ['', '2']) {
    const el = $('mblur' + sfx); if (!el) continue;
    el.value = String(mblur);
    el.addEventListener('change', (e) => {
      mblur = +e.target.value || 0; store.set('mblur', mblur);
      for (const s2 of ['', '2']) if ($('mblur' + s2)) $('mblur' + s2).value = String(mblur);
    });
  }
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
    const fx = Math.cos((-8.37 + 47.98) * Math.PI / 180), fz = Math.cos((-8.37 - 42.02) * Math.PI / 180);   // bearing -8.4 deg
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
  // photo 60: the flag by the cross, the cross edge-on beyond it (pose resected on the hill's skyline: 15.8 deg up, 54.4 deg fov)
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
  // photos 84-86 (the user's, summer morning): the oil wells in the wood (ultra-wide lens, fov 59), the gravel road to
  // them (main lens, from the car)
  if (soLm?.views && !PHOTO_VIEWS.some(v => v.sonda)) {
    for (const v of soLm.views) PHOTO_VIEWS.push({ sonda: v.n, x: v.from[0], z: v.from[1], yaw: Math.atan2(-(v.to[0] - v.from[0]), -(v.to[1] - v.from[1])), pitch: v.pitch, fov: v.fov, label: v.label });
  }
  // the user's clip IMG_0725 (an iPhone's 3x lens, 27.5 deg on its long side): the lane through the wood above the meadow,
  // 1 km from Strada Măgurii, the man 15 m ahead, the three ~80 m on (fitted to their places in its first frame,
  // geo/urcus.js); it also sets the clip's hour and sky and its moment (hikers.js)
  if (!PHOTO_VIEWS.some(v => v.clip)) {
    const c = laneAt(...CLIP.cam), m = laneAt(...CLIP.man), y = world.groundHeight(c.x, c.z) + CLIP.eye, ym = world.groundHeight(m.x, m.z);
    PHOTO_VIEWS.push({ clip: true, x: c.x, z: c.z, yaw: Math.atan2(-(m.x - c.x), -(m.z - c.z)) - 0.003, pitch: Math.atan2(ym - y, Math.hypot(m.x - c.x, m.z - c.z)) + 4.15 * Math.PI / 180, fov: 27.5, label: 'Clipul IMG_0725 — ulița prin pădure, 16:11' });
  }
  // the ATV of the hill of the cross: standing beside it (F to get on)
  if (atv && !PHOTO_VIEWS.some(v => v.atv)) {
    const d = atv.doorPos(-1), bx = d.x + Math.sin(atv.h) * 2.2, bz = d.z + Math.cos(atv.h) * 2.2;
    PHOTO_VIEWS.push({ atv: true, x: bx, z: bz, yaw: Math.atan2(-(atv.x - bx), -(atv.z - bz)), pitch: -0.12, fov: 70, label: 'ATV — ATV-ul de pe dealul crucii (F: urcă)' });
  }
  // the Maybach past the clip's scene: seen from the lane ahead of it, three-quarters from the front (F to get in)
  if (maybach && !PHOTO_VIEWS.some(v => v.maybach)) {
    const fx = -Math.sin(maybach.h), fz = -Math.cos(maybach.h), lx = -Math.cos(maybach.h), lz = Math.sin(maybach.h);
    const bx = maybach.x + fx * 7 + lx * 3.2, bz = maybach.z + fz * 7 + lz * 3.2, by = world.groundHeight(bx, bz) + 1.6;
    PHOTO_VIEWS.push({ maybach: true, x: bx, z: bz, yaw: Math.atan2(-(maybach.x - bx), -(maybach.z - bz)), pitch: Math.atan2(world.groundHeight(maybach.x, maybach.z) + 0.8 - by, Math.hypot(maybach.x - bx, maybach.z - bz)), fov: 60, label: 'Maybach — Mercedes-Maybach GLS 600 negru, după scena drumeților (F: urcă)' });
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
    camera.fov = v.fov ?? baseFov(); camera.updateProjectionMatrix();
    hud.toast(v.label);
    if (v.clip) { setHour(CLIP_HOUR); setWeather('senin'); hikers.atClip(); }
  };

  const nearestCar = () => {
    let best = null, bd = 2.6;
    for (const v of vehicles) {
      if (v.remote) continue;                               // (a friend drives it: J rides along)
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
    noSignal = noSignalZone(v.x, v.z); signalT = 0;                      // (the navigation starts up where you are)
    if ((night > 0.5 || storm > 0.3) && !v.lightsOn) v.setLights(true);   // (headlights on at night and in a gale)
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
    active.car.cabin?.update(active, false);
    if (active.car.rider) active.car.rider.visible = false;
    mode = 'foot'; active = null;
  };

  // ---------- the forest scene ----------
  // It happens only at 23:30 under an overcast sky, live in the clearing by the cross (forest.js): you walk up to it.
  // K (or the menu's button) takes you to the edge of the clearing, then too.
  const SCENE_HOUR = 23.5, SCENE_WEATHER = 'innorat';
  const sceneTime = () => hour === SCENE_HOUR && weatherKey === SCENE_WEATHER;
  // the clip on the lane up to the cross: at its hour, on a clear afternoon
  const CLIP_HOUR = 16 + 11 / 60;
  const clipTime = () => hour === CLIP_HOUR && weatherKey === 'senin';
  const forestSound = (n, d) => {
    const k = Math.min(1, Math.max(0.04, 5 / Math.max(d, 1)));            // fainter with the distance
    if (n === 'shriek') audio.shriek(k); else if (n === 'thud') audio.thud(k); else if (n === 'growl') audio.bear(false, d); else audio.rustle(n === 'rustle-big' ? 9 : 4, k);
  };
  // ---------- multiplayer: riding along, going to the friend ----------
  const ride = (car, who) => {
    if (mode === 'car') exitCar(true);
    if (player.noclip) player.setNoclip(false);
    riding = car; rideLook.yaw = 0; rideLook.pitch = 0;
    car.car.glass.opacity = 0.12;
    audio.door();
    hud.toast(`Ești pasager lângă ${who} — mouse: privești, F: cobori`, 4);
  };
  const unride = (msg) => {
    const car = riding; if (!car) return;
    riding = null;
    car.car.glass.opacity = 0.86;
    const d = car.doorPos(1);
    player.setPose(d.x, d.z, car.h, 0); player.collide();
    player.pos.y = world.groundHeight(player.pos.x, player.pos.z);
    audio.door();
    if (msg) hud.toast(msg, 3);
  };
  // J: to the nearest friend - into their car beside them if they drive, else next to them, facing them
  const joinFriend = () => {
    const fr = others.list(mp, pos0())[0];
    if (!fr) { hud.toast(mp.room ? 'Niciun prieten în joc acum (camera „' + mp.code + '”)' : 'Multiplayer oprit (Meniu)', 3); return; }
    const st = fr.r.now, car = st.v ? others.byKey.get(st.v) : null;
    if (st.f === 1 && car && car.remote === fr.r.peer) { if (riding !== car) ride(car, fr.name); return; }
    if (riding) unride(null);
    if (mode === 'car') exitCar(true);
    if (player.noclip) player.setNoclip(false);
    let x = st.p[0] - Math.sin(st.a[0]) * 2, z = st.p[2] - Math.cos(st.a[0]) * 2, yaw = st.a[0] + Math.PI;
    if (car) { const d = car.doorPos(-1); x = d.x - Math.sin(car.h + Math.PI / 2) * 1.2; z = d.z - Math.cos(car.h + Math.PI / 2) * 1.2; yaw = Math.atan2(-(car.x - x), -(car.z - z)); }
    player.setPose(x, z, yaw, 0); player.collide();
    hud.toast('Lângă ' + fr.name, 2);
  };
  // who came, who left (a line in the corner)
  const mpSeen = new Map();
  let mpStatusT = 0;

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
  // how far one sees (Koschmieder: 2 % contrast) in the weather's haze, without its gusts
  const visibility = () => visibilityOf(baseFog);
  geoWorld.update(camera.position, visibility());
  let t = 0, frameNo = 0;
  const focus = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    perf.begin();
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    WIND.time.value = t;
    geoWorld.tick(t, camera.position);                     // the landmarks' moving parts (the oil wells' pumping units)
    // the far relief (terrain.js FAR) in the map's light and haze
    FAR.uSunDir.value.copy(sunDir); FAR.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
    FAR.uSky.value.copy(hemi.color).multiplyScalar(hemi.intensity); FAR.uGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity);
    FAR.uFogCol.value.copy(scene.fog.color); FAR.uFogDensity.value = scene.fog.near; FAR.uFogH.value = scene.fog.far; FAR.uSnow.value = SNOW.uSnow.value;
    // the wind: a breeze, or in a blizzard the crivăț from the north-east, ~15 m/s gusting between ~8 and ~22 m/s (to
    // ~80 km/h) and veering a little; in a squall (rafale) ~6-9 m/s between bursts that come every half minute or so,
    // rise in a couple of seconds to ~20-23 m/s (~80 km/h) and blow for 5-10 s, veering with them, the heaviest rain
    // riding in on them. The air's travel is summed up frame by frame (the flakes and the drops ride it, rain.js)
    storm = damp(storm, stormTarget, 0.5, dt);
    blizzard = damp(blizzard, snowFall > 0 ? stormTarget : 0, 0.5, dt);
    let burst = 0;
    if (squall) {
      burst = THREE.MathUtils.smoothstep(vn1(t * 0.085 + 9), 0.42, 0.8);
      gust = 0.55 + 1.25 * burst + 0.2 * vn1(t * 1.2 + 7) + 0.12 * vn1(t * 3.1 + 2);
    } else gust = 0.55 + 0.6 * vn1(t * 0.35) + 0.3 * vn1(t * 1.4 + 17);
    {
      const ang = galeAng + (vn1(t * 0.12 + 5) - 0.5) * 0.5 * storm + (squall ? (vn1(t * 0.3 + 11) - 0.5) * 0.5 * burst : 0);   // (blizzard: world -z = south-west)
      windSpeed = (1 - storm) * 0.55 * (0.6 + 0.8 * vn1(t * 0.2 + 3)) + storm * galeBase * gust;
      STORM.uWind.value.set(Math.cos(ang) * windSpeed, Math.sin(ang) * windSpeed);
      STORM.uWindOff.value.addScaledVector(STORM.uWind.value, dt);
      STORM.uStorm.value = blizzard; STORM.gust = storm > 0.01 ? gust : 1; STORM.gale = squall ? storm : 0; STORM.burst = burst;
      WIND.strength.value = 1 + storm * 1.3 * Math.min(gust, 1.7);      // (the trees sway harder)
      if (baseFog) scene.fog.near = baseFog * (1 + storm * (gust - 1) * 0.6);   // (white curtains with every gust)
    }
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
      // J: to the friend (multiplayer)
      if (input.hit('KeyJ')) joinFriend();
      // N: noclip, free flight to look around the map quickly (from a car too: you step out first)
      if (input.hit('KeyN')) {
        if (riding) unride(null);
        if (mode === 'car') exitCar(true);
        if (mode === 'foot') {
          player.setNoclip(!player.noclip);
          hud.toast(player.noclip ? 'Noclip pornit — zbori liber: Space sus, C jos, Shift rapid (N oprește)' : 'Noclip oprit');
        }
      }
      if (mode === 'foot' && riding) {
        // a passenger in the friend's car: the view from the seat beside them (set once their car has moved, below)
        prompt = 'F — coboară';
        if (input.hit('KeyF') || input.hit('KeyE')) unride(null);
        else if (riding.remote === null || riding.remote === undefined) unride('Prietenul a coborât din mașină');
      } else if (mode === 'foot') {
        for (let i = 0; i < PHOTO_VIEWS.length; i++) if (input.hit('Digit' + ((i + 1) % 10))) { if (riding) unride(null); gotoView(i); }
        if (input.hit('KeyL')) { flashlight.set(!flashlight.on); hud.toast(flashlight.on ? 'Lanterna aprinsă' : 'Lanterna stinsă'); }
        player.update(dt, input, audio, sens());
        // a dog right next to you wins over a car parked beyond the fence (nothing to use while flying)
        const dog = player.noclip ? null : dogs.nearest(player.pos.x, player.pos.z);
        const near = dog || player.noclip ? null : nearestCar();
        if (dog) {
          prompt = 'E — mângâie câinele';
          if (input.hit('KeyE') || input.hit('KeyF')) { dogs.pet(dog); share.petted(mp, dogs.dogs.indexOf(dog)); hud.toast('Câinele dă fericit din coadă'); }
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
        // the instruments: the needles follow the speed and the revs; the dials lit with the headlights, or at night
        if (active) {
          const lost = noSignalZone(active.x, active.z);
          if (lost !== noSignal) { signalT += dt; if (signalT > (lost ? 1 : 3)) { noSignal = lost; signalT = 0; } } else signalT = 0;
        }
        active?.car.cabin?.update(active, true, active.lightsOn || night > 0.5 ? 1 : 0, noSignal);
        if (active && active.impact > 2.5) { audio.crash(active.impact); shake = Math.min(0.35, active.impact * 0.03); }
      }
      // parked cars (and cars pushed by collisions) settle
      for (const v of vehicles) if (v !== active && !v.remote) v.update(dt, null);   // (a friend's car moves as they drive it: remote.js)
    }
    // the villager: walked here, unless a friend's game runs the world (share.js); hosting it, even with the menu open
    if ((!paused || share.role === 'host') && share.role !== 'guest') for (const w of walkers) w.update(dt);
    dogs.update(dt, t, camera.position, share.heads());

    // camera for driving
    const fov0 = baseFov();
    let fov = fov0;
    if (mode === 'car' && active) {
      const m = input.consumeMouse();
      const sp = Math.abs(active.speed);
      if (camMode === 'chase') {
        if (m.x || m.y) { orbit.yaw -= m.x * sens(); orbit.pitch = clamp(orbit.pitch + m.y * sens(), -0.1, 0.9); orbit.idle = 0; }
        else { orbit.idle += dt; if (orbit.idle > 1.5) { orbit.yaw = damp(orbit.yaw, 0, 2, dt); orbit.pitch = damp(orbit.pitch, 0.18, 2, dt); } }
        const cy = active.h + orbit.yaw;
        const [cd, ch] = active.m.chase ?? [6.3, 1.3];        // (an ATV: closer, lower)
        const dist = cd + sp * 0.03;
        const g = active.car.group.position;
        const want = tmpV.set(g.x + Math.sin(cy) * dist * Math.cos(orbit.pitch), g.y + ch + Math.sin(orbit.pitch) * dist, g.z + Math.cos(cy) * dist * Math.cos(orbit.pitch));
        const minY = world.groundHeight(want.x, want.z, g.y) + 0.4;
        want.y = Math.max(want.y, minY);
        const ck = 10 + sp * 0.25;                      // stiffer follow at speed: no 15 m lag at 500 km/h
        camera.position.x = damp(camera.position.x, want.x, ck, dt);
        camera.position.y = damp(camera.position.y, want.y, ck, dt);
        camera.position.z = damp(camera.position.z, want.z, ck, dt);
        focus.set(g.x - Math.sin(active.h) * 1.5, g.y + (active.m.atv ? 0.95 : 1.05), g.z - Math.cos(active.h) * 1.5);
        if (active.car.rider) active.car.rider.visible = true;
        camera.lookAt(focus);
        fov = fov0 / 70 * (62 + Math.min(14, sp * 0.3) + Math.max(0, Math.min(14, (sp - 50) * 0.16)));   // (the chase camera widens with speed)
        active.car.glass.opacity = 0.86;
      } else {
        cockpitLook.yaw = clamp(cockpitLook.yaw - m.x * sens(), -2.2, 2.2);
        cockpitLook.pitch = clamp(cockpitLook.pitch - m.y * sens(), -0.8, 0.6);
        if (!m.x && !m.y) cockpitLook.yaw = damp(cockpitLook.yaw, 0, 0.8, dt);
        camera.position.copy(active.headPos());
        active.car.glass.opacity = 0.12;
        if (active.car.rider) active.car.rider.visible = false;
        // (on an ATV the rider watches the trail just ahead: the bars in the lower edge of the view)
        camera.rotation.set(cockpitLook.pitch - (active.m.atv ? 0.28 : 0.06) + active.pitch + active.car.group.rotation.x, active.h + cockpitLook.yaw, -active.roll * 0.6, 'YXZ');
        fov = fov0;                                              // (the driver's own eyes)
      }
    } else {
      if (photoFov && Math.hypot(player.pos.x - photoFov.x, player.pos.z - photoFov.z) > 0.25) photoFov = null;
      fov = photoFov ? photoFov.fov + player.fovKick : fov0 * (1 + player.fovKick / 70);
    }
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.2;
      camera.position.y += (Math.random() - 0.5) * shake * 0.2;
      shake = damp(shake, 0, 5, dt);
    }
    // a gale buffets you: the view shudders with the gusts (on foot more than behind the wheel)
    if (storm > 0.05) {
      const k = storm * gust * (mode === 'car' ? 0.4 : 1) * (1 - 0.85 * shelter);
      camera.rotation.z += (vn1(t * 6.1) - 0.5) * 0.012 * k; camera.rotation.x += (vn1(t * 4.7 + 9) - 0.5) * 0.008 * k;
    }
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = damp(camera.fov, fov, 6, dt); camera.updateProjectionMatrix(); }

    // who the world minds: you and the friends in the room (share.js); the world runs here (alone, or for them too: even
    // with your menu open), or comes from the friend's game that runs it
    const camYaw = mode === 'car' && active ? (camMode === 'chase' ? active.h + orbit.yaw : active.h + cockpitLook.yaw) : riding ? riding.h + rideLook.yaw : player.yaw;
    const people = share.people({ x: pos0().x, y: pos0().y, z: pos0().z, yaw: camYaw, car: mode === 'car' || !!riding, run: mode === 'foot' && !riding && (input.down('ShiftLeft') || input.down('ShiftRight') || !!input.touchRun),
      torch: flashlight.on, me: true, peer: mp.myPeer }, mp);
    share.setRole(mp.role, mp);
    const worldRuns = share.role !== 'guest' && (!paused || share.role === 'host');
    const forestCtx = { ok: sceneTime(), px: pos0().x, pz: pos0().z, people, camera, sound: forestSound }, hikersCtx = { ok: clipTime(), px: pos0().x, pz: pos0().z, people, camera };
    if (share.role === 'guest') share.scenes(dt, forestCtx, hikersCtx, mp);
    else if (worldRuns) { forest.update(dt, forestCtx); hikers.update(dt, hikersCtx); }
    sky.position.copy(camera.position);
    sky.material.uniforms.uDip.value = Math.sqrt(2 * Math.max(0, camera.position.y + AIR_H0) / FAR.uREff.value);
    // grass only near the camera (distance culling per 16 m chunk)
    // the 8 nearest street lamps, for their reflections in a wet road
    if (post.ssr && (frameNo & 7) === 4) {
      const cp = camera.position, near = [];
      for (const l of allLamps) { const d = (l.x - cp.x) ** 2 + (l.z - cp.z) ** 2; if (d < 150 * 150) near.push([d, l]); }
      near.sort((a, b) => a[0] - b[0]);
      post.ssr.setLamps(near.slice(0, 8).map(e => e[1]), M.lampGlass.emissiveIntensity);
    }
    if ((frameNo++ & 7) === 0) {
      const buried = SNOW.uSnow.value >= 0.45;          // the grass under the snow
      for (const gm of built.grass) gm.visible = Math.abs(gm.userData.cz - camera.position.z) < 56 && Math.abs(camera.position.x) < 60 && !buried;
      for (const m of UNDER_SNOW) m.visible = !buried;
      geoWorld.update(camera.position, visibility());
      shareInstancedDepth(scene);                         // (the trees and ground cover streamed in since)
      forest.near(camera.position);
      wetScene(scene);                                    // the materials streamed in since: rain and snow on them too
      roadName = roadNameAt(pos0().x, pos0().z);
      offRoad = SNOW.uSnowDepth.value > 0.03 && !rainOcc.onRoad(pos0().x, pos0().z);
      if ((SNOW.uSnowFall.value > 0.01 || RAIN.uRain.value > 0.01) && M.lampGlass.emissiveIntensity > 0.2) {
        const cp = camera.position;
        snowLamps = allLamps.filter(l => Math.abs(l.x - cp.x) < 45 && Math.abs(l.z - cp.z) < 45).sort((a, b) => ((a.x - cp.x) ** 2 + (a.z - cp.z) ** 2) - ((b.x - cp.x) ** 2 + (b.z - cp.z) ** 2)).slice(0, 6);
      } else snowLamps = [];
      // the easter egg in the wood of the hill of the cross
      const egg = hillEgg && !hillEggFound ? hillEgg : null;
      if (egg && Math.hypot(pos0().x - egg.x, pos0().z - egg.z) < egg.r) { hillEggFound = true; hud.toast('Easter egg: ai găsit scheletul din pădurea de pe dealul crucii!', 6); }
      for (const v of vehicles) {
        const d = Math.hypot(v.x - camera.position.x, v.z - camera.position.z);
        v.car.group.visible = v === active || d < 320;
        if (v.car.cabin) v.car.cabin.group.visible = v === active || d < 16;    // (a cabin shows only through the glass of a car close by)
      }
    }

    // multiplayer: this player to the friend (net.js), the friend into this world (remote.js)
    {
      const g = active?.car.group.position;
      const meNow = mode === 'car' && active ? { f: 1, p: [g.x, g.y, g.z], a: [active.h, 0], v: active.mpKey,
        c: [active.x, active.z, active.h, active.pitch, active.roll, active.steer, active.spin % (2 * Math.PI), active.speed, active.lightsOn ? 1 : 0, active.brake ? 1 : 0, active.rpm || 0, active.throttle || 0, hornOn ? 1 : 0] }
        : riding ? { f: 2, p: [riding.x, riding.car.group.position.y, riding.z], a: [riding.h + rideLook.yaw, rideLook.pitch], v: riding.mpKey }
          : { f: 0, p: [player.pos.x, player.pos.y, player.pos.z], a: [player.yaw, player.pitch] };
      if (flashlight.on) meNow.o = 1;
      mp.update(dt, started ? meNow : null, (budget) => share.encode(budget));
      share.events(mp);
      // (both got in at the wheel of the same car at once: it goes to the one whose label sorts first)
      for (const c of others.update(dt, mp, { active, riding, fov: camera.fov })) if (mp.myPeer && c.peer < mp.myPeer && c.car === active) { exitCar(true); hud.toast('Prietenul tău a urcat primul la volan', 3); }
      const movedCars = others.moved(active);
      if (movedCars) mp.carsMoved(movedCars);
      if (riding) {
        const m = paused ? { x: 0, y: 0 } : input.consumeMouse();
        rideLook.yaw = clamp(rideLook.yaw - m.x * sens(), -2.4, 2.4); rideLook.pitch = clamp(rideLook.pitch - m.y * sens(), -0.8, 0.6);
        seatPos(riding, camera.position);
        camera.rotation.set(rideLook.pitch - 0.06 + riding.pitch + riding.car.group.rotation.x, riding.h + rideLook.yaw, -riding.roll * 0.6, 'YXZ');
        player.pos.set(riding.x, riding.car.group.position.y, riding.z);
        if (riding.car.cabin) riding.car.cabin.group.visible = true;
      }
      // who came and who left
      for (const r of mp.remotes.values()) if (r.now && !mpSeen.has(r.peer)) { mpSeen.set(r.peer, mp.nameOf(r)); hud.toast(mp.nameOf(r) + ' a intrat în joc — J te duce la el', 4); }
      for (const [peer, name] of mpSeen) if (!mp.remotes.has(peer)) { mpSeen.delete(peer); hud.toast(name + ' a ieșit din joc', 3); }
      if ((mpStatusT -= dt) <= 0) {
        mpStatusT = 0.5;
        const fr = others.list(mp, pos0());
        const txt = !mp.room ? (mp.status === 'oprit' ? 'pornește la „Joacă”' : mp.status)
          : mp.status.startsWith('întrerupt') ? mp.status
          : (mp.room.connected && !mp.room.connected() ? 'se conectează… · ' : '') + (mp.kind === 'local' ? (mp.note ? mp.note + ' · doar filele acestui browser · ' : 'local (doar filele acestui browser) · ') : '') + (fr.length ? fr.map(f => `${f.name} la ${f.d < 1000 ? Math.round(f.d) + ' m' : (f.d / 1000).toFixed(1) + ' km'}`).join(', ') : 'singur în camera „' + mp.code + '”');
        for (const sfx of ['', '2']) { const el = $('mpStatus' + sfx); if (el && el.textContent !== txt) el.textContent = txt; }
      }
    }

    // HUD
    const pos = mode === 'car' && active ? active.car.group.position : player.pos;
    const yaw = mode === 'car' && active ? (camMode === 'chase' ? active.h + orbit.yaw : active.h + cockpitLook.yaw) : player.yaw;
    const dHome = Math.hypot(pos.x - 6, pos.z - 0);
    hud.update(dt, {
      prompt, driving: mode === 'car', noSignal: mode === 'car' && noSignal, kmh: active ? active.speed * 3.6 : 0, gear: active?.gear ?? 1, carName: active?.name ?? '',
      x: pos.x, z: pos.z, yaw,
      cars: vehicles.map(v => ({ x: v.x, z: v.z, h: v.h, active: v === active || v === riding })),
      friends: others.list(mp, pos),
      location: (crossLm && Math.hypot(pos.x - crossLm.x, pos.z - crossLm.z) < 45 ? 'Crucea de pe deal · ' : brLm && brLm.surface(pos.x, pos.z) !== null && pos.y > brLm.surface(pos.x, pos.z) - 2.5 ? 'Podul peste Prahova · ' : roadName ? roadName + ' · ' : '') + (dHome < 14 ? 'Acasă · nr. 123H' : `acasă ${dHome < 1000 ? Math.round(dHome) + ' m' : (dHome / 1000).toFixed(1) + ' km'}`) +
        (SNOW.uSnowDepth.value >= 0.01 ? ` · zăpadă ${Math.round(SNOW.uSnowDepth.value * 100)} cm` : '') + (storm > 0.3 ? ` · vânt ${Math.round(windSpeed * (1 - shelter) * 3.6)} km/h` + (shelter > 0.4 ? ' (la adăpost)' : '') : ''),
    });
    if ((riverT -= dt) <= 0) {
      riverT = 0.5; riverK = geoWorld.water?.sound(camera.position) ?? 0;
      geoWorld.water?.setSun(Math.min(1, sun.intensity / 3.8) * sun.shadow.intensity * (1 - night));   // (the caustics: only in sunshine)
    }
    audio.update(dt, { river: riverK, rain: RAIN.uRain.value, storm, gust, shelter, brook: eaves.brook, pour: eaves.pour, snow: SNOW.uSnowFall.value, snowCover: SNOW.uSnow.value, night, horror, driving: mode === 'car', rpm: active?.rpm ?? 0, throttle: active?.throttle ?? 0, slip: active?.lastLat ?? 0, horn: hornOn, speed: active ? Math.abs(active.speed) : 0, friend: others.engine(camera.position) });
    // free camera for automated tests / screenshots (window.__game.cam = {x, y, z, yaw, pitch, fov?})
    const fc = window.__game?.cam;
    if (fc) {
      camera.position.set(fc.x, fc.y, fc.z); camera.rotation.set(fc.pitch, fc.yaw, 0, 'YXZ'); sky.position.copy(camera.position); geoWorld.update(camera.position, visibility());
      if (fc.fov && camera.fov !== fc.fov) { camera.fov = fc.fov; camera.updateProjectionMatrix(); }   // (a lens of its own)
    }
    // the sun's shadow cascades follow the view, ahead of the camera, texel-snapped
    const camGround = world.groundHeight(camera.position.x, camera.position.z);
    cascades.update(camera, camGround);
    // rain: it starts / stops in ~2 s, the surfaces soak in ~10 s and dry in ~1 min; where it lands comes from the
    // height map seen from above (crowns, roofs, car roofs), refreshed as you move
    RAIN.uRain.value = damp(RAIN.uRain.value, rainTarget * (squall ? 0.6 + 0.4 * STORM.burst : 1), 1.2, dt);   // (a squall's rain: heaviest in the bursts)
    RAIN.uWet.value = RAIN.uWet.value < rainTarget ? Math.min(rainTarget, RAIN.uWet.value + dt / 10) : Math.max(rainTarget, RAIN.uWet.value - dt / 60);
    RAIN.uRainTime.value = t;
    // snow: it starts / stops in ~3 s; while it snows the cover builds up in ~1 min and then gets deeper by ~8 cm a
    // minute, up to 60 cm (a time-lapse: a heavy snowfall brings 2-8 cm an hour); the clear day after keeps at least
    // 25 cm; any other weather melts it, ~1 cm/s (a downpour 2.5 cm/s), then the last of the cover in ~40 s (~15 s).
    // The wheels and feet feel it.
    SNOW.uSnowFall.value = damp(SNOW.uSnowFall.value, snowFall, 0.8, dt);
    const sc = SNOW.uSnow.value, dep = SNOW.uSnowDepth;
    if (snowFall > 0) dep.value = Math.min(0.6, dep.value + dt * SNOW.uSnowFall.value * sc * 0.08 / 60 * (1 + 0.5 * storm));
    else if (snowCover > 0) dep.value = Math.min(Math.max(dep.value, 0.25), dep.value + dt * 0.1);
    else dep.value = Math.max(0, dep.value - dt * (rainTarget > 0 ? 0.025 : 0.01));
    // the snow sticks to the windward faces (trunks, poles, walls): a blizzard plasters them in ~1.5 min, a snowfall
    // with its breeze streaks them, and the clear day after finds the trunks of a wood white on one side; it stays
    // until the snow melts
    const plTo = blizzard > 0.3 ? 1 : snowFall > 0 ? 0.35 : snowCover > 0 ? 0.5 : 0;
    SNOW.uSnowPlaster.value = SNOW.uSnow.value < 0.3 ? Math.max(0, SNOW.uSnowPlaster.value - dt / 40) : Math.max(SNOW.uSnowPlaster.value, Math.min(plTo, SNOW.uSnowPlaster.value + dt / 90));
    SNOW.uSnow.value = snowCover > 0 ? Math.min(1, sc + dt / 4) : snowFall > 0 ? Math.min(1, sc + dt * SNOW.uSnowFall.value / 60) : dep.value > 0.03 ? sc : Math.max(0, sc - dt / (rainTarget > 0 ? 15 : 40));
    SNOW.uSnowLight.value = rainLight;
    TRACTION.mu = 1 - 0.68 * Math.min(1, SNOW.uSnow.value * 1.4);   // ~0.3 on snow (packed snow 0.2-0.3, dry asphalt 0.8-1)
    TRACTION.sink = offRoad ? dep.value : 0;                            // (deep snow off the roads holds the wheels back)
    // a gale pushes the car and you, less in the lee of what stands upwind (shelter, above)
    if (storm > 0.05) {
      if ((frameNo % 3) === 0) {
        const w = STORM.uWind.value, wl = Math.hypot(w.x, w.y) || 1, p = mode === 'car' && active ? { x: active.x, y: active.car.group.position.y, z: active.z } : pos0();
        shelter = damp(shelter, shelterAt(p.x, p.y ?? player.pos.y, p.z, w.x / wl, w.y / wl), 6, dt * 3);
      }
    } else shelter = 0;
    shWind.copy(STORM.uWind.value).multiplyScalar(1 - shelter);
    TRACTION.wind = storm > 0.05 ? shWind : null;
    player.wind = storm > 0.05 ? { x: shWind.x, z: shWind.y } : null;
    player.slow = offRoad ? 1 - 0.5 * Math.min(1, dep.value / 0.5) : 1;   // (wading: knee-deep snow halves the pace)
    const wetNow = RAIN.uWet.value > 0.001 || RAIN.uRain.value > 0.002;
    let occNew = false;
    if (wetNow || SNOW.uSnow.value > 0.001 || SNOW.uSnowFall.value > 0.002) occNew = rainOcc.update(renderer, scene, camera.position, camGround, occHide, occSkip, SNOW.uSnowDepth.value > 0.005 || snowFall > 0, softSkip, wetNow);
    // the water running off everything (runoff.js): ~100 mm/h in a downpour, ~250 mm/h in a squall's bursts (a summer
    // thunderstorm's), its catchment taken ~3x the box around you (what runs in from further up the street); the
    // hollows fill as the ground soaks
    if (wetNow && SNOW.uSnow.value < 0.3) {
      if (occNew) runoff.refresh(renderer);
      const mmh = squall ? 250 : 100;
      if (!lowQ || (frameNo & 1) === 0 || occNew) runoff.step(renderer, RAIN.uRain.value * mmh / 3.6e6 * 3, RAIN.uWet.value);   // (every other frame on the low settings)
    } else runoff.off();
    // what keeps the flying snow off, or in a squall the driven rain
    const driven = STORM.gale > 0.05 && RAIN.uRain.value > 0.002;
    if ((SNOW.uSnowFall.value > 0.002 || STORM.uStorm.value > 0.002 || driven) && rainOcc.snow) snowLee.update(renderer, scene, camera.position, occHide, leeSkip, rainOcc.snow.low.texture, dt, driven && SNOW.uSnowFall.value < 0.002 ? 7 : 1);
    else snowLee.off();
    // night: lightning in the storm, the moon's shaft, the torch, the bear on the hill
    // (and in a squall by day: a flash under the deck, less to it in the daylight)
    const flash = lightning.update(dt, (horror === 1 || squall) && (!paused || share.role !== 'solo')) * (horror === 1 ? 1 : 0.3 + 0.7 * night);
    sky.material.uniforms.uFlash.value = flash;
    hemi.intensity = baseHemi + flash * 2.2; scene.environmentIntensity = baseEnv + flash * 1.4;
    moonBeam?.update(t, camera);
    if (forest.live && moonBeam?.on && (frameNo & 1)) moonBeam.light.shadow.needsUpdate = true;   // (they move in the moonlight)
    if (mode === 'car' && flashlight.on) flashlight.set(false);
    flashlight.update(camera);
    rainFX.update(camera, rainLight + flash * 0.6, flashlight.info, moonBeam?.info, headlights.info, snowLamps, M.lampGlass.emissiveIntensity / 4,
      weatherKey === 'rafale' ? 60 : 40, night);   // (a downpour ~40 mm/h, a squall's ~60: the drops' sizes, so their speeds, fixed per weather - how many fall goes with the rain)
    eaves.update(renderer, camera, dt, t, rainFX.wind.value, rainLight + flash * 0.6);
    headlights.set(mode === 'car' && !!active?.lightsOn); headlights.update(active);
    snowFX.update(camera, rainLight, flashlight.info, headlights.info, snowLamps, M.lampGlass.emissiveIntensity / 4);
    if (mode === 'car' && active) {
      SNOW.uSnowCar.value.set(active.x, active.z, active.h, 1); SNOW.uSnowCarSize.value.set(active.car.half.w, active.car.half.l);
      SNOW.uSnowCarY.value.set(active.car.group.position.y, active.m.roofH ??= Math.max(...active.m.roof.map(p => p[1])));
    } else SNOW.uSnowCar.value.w = 0;
    // the prints: the car's tyres (yours on foot come with each step: player.onStep), the villager's steps; they fill in
    // while it snows (in ~2.5 min, a blizzard's drift in ~1)
    if (SNOW.uSnow.value > 0.05) {
      if (mode === 'car' && active) trail.car(active, SNOW.uSnowDepth.value);
      others.prints(trail, SNOW.uSnowDepth.value);                      // (a friend's steps and tyres: remote.js)
      for (const w of walkers) {
        const k = Math.floor(w.phase / Math.PI);
        if (w.down <= 0 && k !== w.stepK) { if (w.stepK !== undefined) trail.step({ x: w.x, z: w.z }, w.h + Math.PI, k & 1 ? 1 : -1, false, SNOW.uSnowDepth.value, w.feet ??= {}); w.stepK = k; }
      }
    }
    trail.update(renderer, camera.position, dt, SNOW.uSnowFall.value * (1 + 1.5 * storm) / 150);
    blanket.update(camera);
    // who pushes through the spruces: you on foot (a 1.75 m capsule) or the car you drive (its front and back)
    const firBodies = [];
    if (mode === 'car' && active) {
      const fx = -Math.sin(active.h), fz = -Math.cos(active.h), gy = active.car.group.position.y, r = active.car.half.w + 0.25;
      for (const k of [1.3, -1.3]) firBodies.push({ id: k, x: active.x + fx * k, z: active.z + fz * k, y0: gy, y1: gy + 1.5, r, speed: Math.abs(active.speed), car: true, impact: active.impact });
    } else firBodies.push({ id: 0, x: player.pos.x, z: player.pos.z, y0: player.pos.y, y1: player.pos.y + 1.75, r: 0.3, speed: Math.hypot(player.vel.x, player.vel.z) });
    firs.update(dt, camera.position, firBodies);
    // the wheels throw up spray on a wet road, powder off a snowy one
    spray.update(dt, mode === 'car' && active ? active : null, mode === 'car' && active ? active.car.group.position.y : 0, Math.max(RAIN.uWet.value, SNOW.uSnow.value > 0.4 ? 0.85 : 0), rainLight + flash * 0.6, camera.position);
    // reflections in wet ground only when there is any (or a still puddle near: the oil wells' pad)
    if (post.ssr) post.ssr.enabled = (RAIN.uWet.value > 0.01 || geoWorld.mirrorNear(camera.position)) && !window.__game?.noSSR;
    {
      const pp = pos0(), cx = camera.position.x, cz = camera.position.z;
      const st = { people, px: pp.x, pz: pp.z, camX: cx, camZ: cz, camera, night, winter, horror: horror > 0.5, day: 1 - night, rain: RAIN.uRain.value, snow: SNOW.uSnowFall.value };
      if (share.role === 'guest') share.follow(dt, t, st, mp);
      else if (worldRuns) {
        bear?.update(dt, t, { active: horror === 1, people, px: pp.x, pz: pp.z, camX: cx, camZ: cz });
        wildlife.update(dt, t, st);
        birds.update(dt, t, st);
      }
    }
    post.grade.uniforms.uTime.value = t;
    scene.updateMatrixWorld();
    post.shield.update(paused ? 0 : dt, { on: mode === 'car' && !!active && camMode === 'cockpit', rate: (weatherKey === 'rafale' ? 60 : 40) * RAIN.uRain.value, car: active, camera, pupil: rainFX.pupil.value });
    // the camera's motion blur (a recording that sets the lens itself marks it manual); a jump of the camera - a view
    // picked, into or out of a car, another camera mode - is a cut, not a smear
    if (!post.cine.manual) {
      const on = mblur > 0 && !paused;
      if (post.cine.enabled !== on) post.cine.enabled = on;
      if (on) {
        const cut = camera.position.distanceTo(lastCam) > 6 || 2 * Math.acos(Math.min(1, Math.abs(camera.quaternion.dot(lastQ)))) > 0.6;
        // (in a car: nothing up to its far end, inside its outline on the screen, smears - it moves with the camera)
        let keep = 0, keepBox = null;
        if (mode === 'car' && active && !window.__game?.cam) {
          const grp = active.car.group; grp.updateMatrixWorld();
          keep = camera.position.distanceTo(grp.position) + 2.6;
          let x0 = 1, y0 = 1, x1 = 0, y1 = 0, behind = false;
          for (let i = 0; i < 8; i++) {
            _kv.set(i & 1 ? 1.15 : -1.15, i & 2 ? 1.8 : -0.1, i & 4 ? 2.7 : -2.7).applyMatrix4(grp.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
            if (_kv.z > -0.05) { behind = true; break; }
            _kv.applyMatrix4(camera.projectionMatrix);
            x0 = Math.min(x0, _kv.x * 0.5 + 0.5); x1 = Math.max(x1, _kv.x * 0.5 + 0.5); y0 = Math.min(y0, _kv.y * 0.5 + 0.5); y1 = Math.max(y1, _kv.y * 0.5 + 0.5);
          }
          keepBox = behind ? _kb.set(0, 0, 1, 1) : _kb.set(x0, y0, x1, y1);
        }
        post.cine.params = { shutter: mblur, cut, keep, keepBox };
      }
      lastCam.copy(camera.position); lastQ.copy(camera.quaternion);
    }
    // the sun's shafts: by the share of its light that comes straight (the weather's), above the horizon, by day
    if (post.shafts) { camera.updateMatrixWorld(); post.shafts.set(sunDir, (1 - night) * sun.shadow.intensity * THREE.MathUtils.smoothstep(sunInfo.el, -1, 2), 0.85, sun.color); }
    // (the car you drive moves with the camera: the anti-aliasing follows it by its own motion)
    if (post.taa) {
      const mv = mode === 'car' && active ? active : riding;
      if (mv) {
        const hw = mv.car.half.w + 0.3, hl = mv.car.half.l + 0.3;
        taaMover.obj = mv.car.group; taaMover.min.set(-hw, -0.4, -hl); taaMover.max.set(hw, 2.6, hl);
        post.taa.mover = taaMover;
      } else post.taa.mover = null;
    }
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
  window.__game = { geo: geoWorld.info, geoWorld, get sun() { return sunInfo; }, get moon() { return moonInfo; }, get night() { return night; }, get horror() { return horror; }, bear, wildlife, birds, share, lightning, maybach, moonBeam, flashlight, cascades, forest, sceneTime, goToForest, hikers, RAIN, SNOW, STORM, rainOcc, runoff, eaves, firs, trail, snowLee, blanket, leeSkip, get shelter() { return shelter; }, shelterAt, get windSpeed() { return windSpeed; }, get gust() { return gust; }, get time() { return t; }, set time(v) { t = v; }, setWeather, setHour, get weather() { return weatherKey; }, get hour() { return hour; }, post, dogs, walkers, player, vehicles, camera, renderer, scene, farScene, views: PHOTO_VIEWS, gotoView, enterCar, mp, others, joinFriend, get riding() { return riding; }, exitCar: () => exitCar(true), begin, get mode() { return mode; }, input, world, TEX, M };
}

main().catch((e) => {
  console.error(e);
  $('loadText').textContent = 'Eroare: ' + e.message;
  $('loader').classList.add('err');
});
