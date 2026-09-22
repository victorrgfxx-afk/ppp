/* ============================================================================
   Sky, sun and weather.

   The sun is placed with a real solar-position calculation for the site's
   latitude/longitude (Prahova county, RO — 44.94 N, 25.90 E), so shadow
   directions at 13:40 in late September match the reference photos instead of
   being an arbitrary guess.
   ========================================================================== */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Fbm, clamp01, mix } from './Noise.js';

/* `north` is the real-world compass bearing that the map's −Z axis points at.
   It is not a free choice: the reference photographs show the hall's and the
   garage's door faces in shade (their piers sample around rgb(106,110,110))
   while the apron and the west gable beside them are in full sun (rgb(194,196,186)),
   and at 44.9 N in late September the sun never crosses north of due east or
   due west — so the faces cannot be looking south. Laying the map's −Z along
   286 deg puts the sun at about 265 deg in map terms at midday: raking across
   the yard from the west, lighting the ground and the gable ends and leaving
   the doors in their own shadow, exactly as photographed. */
export const SITE = { lat: 44.9412, lon: 25.9012, dayOfYear: 265, north: 286 }; // 22 September

/** Solar altitude/azimuth in radians. `minutes` is local clock time (EEST = UTC+3). */
export function sunAngles(minutes, dayOfYear = SITE.dayOfYear, lat = SITE.lat, lon = SITE.lon, tz = 3) {
  const rad = Math.PI / 180;
  const decl = 23.44 * rad * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
  // equation of time (minutes)
  const B = 2 * Math.PI * (dayOfYear - 81) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const solarTime = minutes + 4 * (lon - 15 * tz) + eot;
  const H = (solarTime / 4 - 180) * rad;                  // hour angle
  const phi = lat * rad;
  const sinAlt = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const alt = Math.asin(clamp01((sinAlt + 1) / 2) * 2 - 1);
  const cosAz = (Math.sin(decl) - Math.sin(alt) * Math.sin(phi)) / (Math.cos(alt) * Math.cos(phi));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (H > 0) az = 2 * Math.PI - az;                        // afternoon -> west
  return { alt, az };                                      // az measured from north, clockwise
}

/* cover/density feed the Sky shader's own cloud layer (r186+) */
const WEATHER = {
  clear:    { turbidity: 2.0,  rayleigh: 1.10, mie: 0.004, mieG: 0.80, cover: 0.13, density: 0.45, fog: 0.0032, sun: 1.00, amb: 1.00, wet: 0 },
  cumulus:  { turbidity: 3.0,  rayleigh: 1.45, mie: 0.008, mieG: 0.78, cover: 0.42, density: 0.60, fog: 0.0038, sun: 0.94, amb: 1.06, wet: 0 },
  overcast: { turbidity: 8.0,  rayleigh: 2.80, mie: 0.026, mieG: 0.70, cover: 0.92, density: 0.85, fog: 0.0050, sun: 0.26, amb: 1.22, wet: 0.25 },
  rain:     { turbidity: 11.0, rayleigh: 3.60, mie: 0.038, mieG: 0.66, cover: 1.00, density: 1.00, fog: 0.0085, sun: 0.16, amb: 1.12, wet: 1.0 },
};

/* three's Sky shader ends with a gamma-ish curve, so its output is display-
   referred rather than linear radiance — dropped straight into an HDR pipeline
   it reads about 5x too bright and forces a tiny exposure. Scaling it here lets
   the rest of the scene run at exposure 1.0 with sane light intensities.
   SKY_GAIN was solved from measurements: it puts the zenith at rgb(~60,97,150),
   matching the reference photos. */
export const SKY_GAIN = 0.205;

function patchSkyGain(sky) {
  const m = sky.material;
  m.uniforms.skyGain = { value: SKY_GAIN };
  m.fragmentShader = m.fragmentShader
    .replace('uniform float showSunDisc;', 'uniform float showSunDisc;\n\t\tuniform float skyGain;')
    .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * skyGain, 1.0 );');
  m.needsUpdate = true;
  return sky;
}

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.weather = 'clear';
    this.minutes = 13 * 60 + 40;
    this.windDir = new THREE.Vector2(0.82, -0.57);
    this.windStrength = 0.35;
    this._lastEnvAlt = -99;
    this._lastEnvWeather = '';

    /* --- sky dome ------------------------------------------------------- */
    this.sky = patchSkyGain(new Sky());
    this.sky.scale.setScalar(20000);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.sky.material.uniforms.cloudScale.value = 0.00030;
    this.sky.material.uniforms.cloudSpeed.value = 0.000018;
    this.sky.material.uniforms.cloudElevation.value = 0.55;

    /* --- lights --------------------------------------------------------- */
    this.sun = new THREE.DirectionalLight(0xfff3e0, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;

    this.hemi = new THREE.HemisphereLight(0xa9c7ff, 0x5b5348, 0.55);
    scene.add(this.hemi);

    this.moon = new THREE.DirectionalLight(0x9fb6e8, 0.0);
    scene.add(this.moon);

    scene.fog = new THREE.FogExp2(0xbcd0e4, 0.0016);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this._envScene = new THREE.Scene();
    this._envSky = patchSkyGain(new Sky());
    this._envSky.scale.setScalar(20000);
    this._envScene.add(this._envSky);
    /* The lower half of the environment is not sky, it is the yard. Without it
       the IBL lights every shaded wall with pure zenith blue and they come out
       at rgb(165,186,199); the photographs put them at rgb(109,108,98), which
       is sky plus a large helping of bounce off warm gravel. This dome carries
       that bounce, and its brightness is tracked to the sun in update(). */
    this._envGround = new THREE.Mesh(
      new THREE.SphereGeometry(60, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x6a6052, side: THREE.BackSide, fog: false }));
    this._envScene.add(this._envGround);

    /* Calibrated against the reference photos (see docs/LIGHTING.md):
       sunlit gravel ~rgb(160,148,130), shadowed gravel ~rgb(118,113,108),
       zenith ~rgb(55,102,165), sunlit white panel ~rgb(226,227,218). */
    this.sunGain = 5.95;
    this.ambientGain = 1.02;
    scene.environmentIntensity = this.ambientGain;
    this.setShadowDistance(80);
    this.update(0, new THREE.Vector3());
  }

  setShadowDistance(d) {
    this.shadowDist = d;
    const c = this.sun.shadow.camera;
    c.left = -d * 0.62; c.right = d * 0.62; c.top = d * 0.62; c.bottom = -d * 0.62;
    c.far = d * 4.2;
    c.updateProjectionMatrix();
  }
  setShadowMapSize(n) {
    if (this.sun.shadow.mapSize.x === n) return;
    this.sun.shadow.mapSize.set(n, n);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }
  setWeather(w) { if (WEATHER[w]) { this.weather = w; this._lastEnvAlt = -99; } }
  setTime(minutes) { this.minutes = ((minutes % 1440) + 1440) % 1440; }

  /** Direction *towards* the sun, unit length. */
  get sunDirection() { return this._sunDir; }
  get wetness() { return this._wet ?? 0; }

  update(dt, focus) {
    const W = WEATHER[this.weather];
    const { alt, az: trueAz } = sunAngles(this.minutes);
    // rotate the true solar azimuth into map space (see SITE.north)
    const az = trueAz - SITE.north * Math.PI / 180;
    const ca = Math.cos(alt);
    // azimuth is measured from map north (−Z) clockwise towards east (+X)
    const dir = new THREE.Vector3(ca * Math.sin(az), Math.sin(alt), -ca * Math.cos(az)).normalize();
    this._sunDir = dir;

    const up = clamp01(Math.sin(alt) * 3.2 + 0.08);           // 0 at night, 1 in full day
    const dusk = clamp01(1 - Math.abs(Math.sin(alt)) * 6);     // peaks around the horizon

    /* sky */
    const u = this.sky.material.uniforms;
    u.turbidity.value = W.turbidity + dusk * 2.5;
    u.rayleigh.value = W.rayleigh * (1 + dusk * 0.9);
    u.mieCoefficient.value = W.mie + dusk * 0.008;
    u.mieDirectionalG.value = W.mieG;
    u.sunPosition.value.copy(dir);

    /* clouds (Sky's own layer) */
    u.cloudCoverage.value = W.cover;
    u.cloudDensity.value = W.density;
    u.time.value += dt * (0.35 + this.windStrength * 1.8);

    /* sun light */
    const warm = clamp01(1 - Math.sin(Math.max(alt, 0)) * 2.2);
    this.sun.color.setRGB(1, mix(1, 0.62, warm * 0.9), mix(1, 0.33, warm));
    this.sun.intensity = up * this.sunGain * W.sun;
    this.sun.visible = this.sun.intensity > 0.01;
    this.hemi.intensity = mix(0.06, 0.42, up) * W.amb;
    // sky half stays dim (the IBL already carries it); the ground half is the
    // warm bounce off the gravel that keeps shaded white walls from going blue
    this.hemi.color.setRGB(mix(0.16, 0.30, up), mix(0.20, 0.38, up), mix(0.32, 0.52, up));
    this.hemi.groundColor.setRGB(mix(0.05, 0.92, up), mix(0.05, 0.76, up), mix(0.06, 0.52, up));

    /* moon */
    const night = clamp01(-Math.sin(alt) * 4);
    this.moon.intensity = night * 0.22;
    this.moon.position.set(-dir.x * 100, Math.abs(dir.y) * 100 + 30, -dir.z * 100);

    /* fog + wetness */
    const fogUp = mix(0.05, 1, up);
    this.scene.fog.density = W.fog * mix(2.2, 1, up);
    this.scene.fog.color.setRGB(
      mix(0.045, 0.70, fogUp) + dusk * 0.22,
      mix(0.05, 0.78, fogUp) + dusk * 0.06,
      mix(0.075, 0.88, fogUp));
    this._wet = W.wet;

    /* keep the shadow frustum glued to the player */
    const d = this.shadowDist;
    this.sunTarget.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(dir, d * 1.9);
    this.sun.shadow.camera.updateProjectionMatrix();

    /* the yard's own bounce, which is what the IBL's lower half stands for */
    this._envGround.material.color.setRGB(
      mix(0.014, 0.68, up), mix(0.013, 0.575, up), mix(0.016, 0.435, up));

    /* refresh the IBL only when the lighting has actually moved */
    const altDeg = alt * 180 / Math.PI;
    if (Math.abs(altDeg - this._lastEnvAlt) > 1.2 || this.weather !== this._lastEnvWeather) {
      this._lastEnvAlt = altDeg; this._lastEnvWeather = this.weather;
      this.refreshEnvironment();
    }
  }

  refreshEnvironment() {
    const src = this.sky.material.uniforms, dst = this._envSky.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG',
                     'cloudCoverage', 'cloudDensity', 'cloudScale', 'cloudElevation', 'time']) dst[k].value = src[k].value;
    dst.showSunDisc.value = 0;   // the sun disc is the DirectionalLight's job; leaving it in blows out the IBL
    dst.sunPosition.value.copy(src.sunPosition.value);
    const rt = this.pmrem.fromScene(this._envScene, 0.04);
    this.scene.environment?.dispose?.();
    this.scene.environment = rt.texture;
    this._envRT?.dispose?.();
    this._envRT = rt;
  }

  dispose() {
    this._envRT?.dispose(); this.pmrem.dispose();
  }
}
