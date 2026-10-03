import * as THREE from 'three';

// Sun lighting: cascaded shadows and the weather presets.
//
// Cascades without touching any material: every shadow-casting directional light is one cascade of the same sun
// (the first one lights, the others have intensity 0 and only carry a shadow map). The patched light loop picks,
// per pixel, the finest cascade whose map covers it (blending across a border band) and applies that one shadow to
// the sun. So the street keeps its 2 cm shadow texels and the houses and trees 300 m away still cast shadows.

const DIR_START = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
const DIR_CASCADED = /* glsl */`#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	float csmShadow = 0.0;
	float csmLeft = 1.0;
	float csmW;
	vec3 csmP;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLightShadow = directionalLightShadows[ i ];
		csmP = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
		csmW = csmLeft * smoothstep( 0.0, 0.08, min( min( csmP.x, 1.0 - csmP.x ), min( csmP.y, 1.0 - csmP.y ) ) ) * step( csmP.z, 1.0 );
		if ( csmW > 0.001 ) csmShadow += csmW * getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] );
		csmLeft -= csmW;
	}
	#pragma unroll_loop_end
	csmShadow += max( csmLeft, 0.0 );
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directLight.color *= receiveShadow ? csmShadow : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
`;

// Must run before the first material is compiled. Returns false (and leaves three.js alone) if the chunk changed.
export function installCascadedShadows() {
  const src = THREE.ShaderChunk.lights_fragment_begin;
  const a = src.indexOf(DIR_START), b = src.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 )', a);
  if (a < 0 || b < 0) { console.warn('cascaded shadows: unknown lights_fragment_begin, using one shadow map'); return false; }
  THREE.ShaderChunk.lights_fragment_begin = src.slice(0, a) + DIR_CASCADED + src.slice(b);
  return true;
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3();

// The sun's shadow cascades. `sun` is the lighting light (near cascade); the far ones are added after it, in order
// (the shader takes the shadow maps in the order of the lights in the scene: finest first).
export class SunCascades {
  constructor(scene, sun, sunDir, q) {
    this.sunDir = sunDir;
    this.list = [{ light: sun, half: q.shadowBox, ahead: 0.45, depth: 100, every: 1 }];
    for (const c of q.cascades ?? []) {
      const l = new THREE.DirectionalLight(0xffffff, 0);
      l.castShadow = true;
      l.shadow.mapSize.set(c.map, c.map);
      l.shadow.bias = c.bias; l.shadow.normalBias = c.normalBias; l.shadow.radius = c.radius ?? 1;
      Object.assign(l.shadow.camera, { left: -c.half, right: c.half, top: c.half, bottom: -c.half, near: 1, far: c.depth + 300 });
      l.shadow.camera.updateProjectionMatrix();
      l.shadow.autoUpdate = false;
      l.shadow.needsUpdate = true;   // a map from the first frame: three r186 binds an unusable empty texture to a null one in an array
      scene.add(l, l.target);
      this.list.push({ light: l, half: c.half, ahead: c.ahead ?? 0.7, depth: c.depth, every: c.every ?? 2 });
    }
    this.frame = 0;
  }

  // centre each cascade ahead of the camera on the ground, snapped to whole shadow texels (no shimmer when moving)
  update(camera, groundY) {
    this.frame++;
    camera.getWorldDirection(_f); _f.y = 0;
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1); else _f.normalize();
    _m.lookAt(this.sunDir, _c.set(0, 0, 0), THREE.Object3D.DEFAULT_UP);
    _x.setFromMatrixColumn(_m, 0); _y.setFromMatrixColumn(_m, 1); _z.copy(this.sunDir);
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i], l = c.light;
      if (i > 0 && (this.frame + i) % c.every !== 0) continue;        // (staggered: not all far maps in one frame)
      _c.copy(camera.position).addScaledVector(_f, c.half * c.ahead);
      _c.y = groundY;
      const texel = (2 * c.half) / l.shadow.mapSize.x;
      const px = _c.dot(_x), py = _c.dot(_y);
      _c.addScaledVector(_x, Math.round(px / texel) * texel - px).addScaledVector(_y, Math.round(py / texel) * texel - py);
      l.target.position.copy(_c);
      l.position.copy(_c).addScaledVector(_z, c.depth);
      if (i > 0) l.shadow.needsUpdate = true;
    }
  }

  setSunDir(d) { this.sunDir.copy(d); }
  setEnabled(on) { for (let i = 1; i < this.list.length; i++) this.list[i].light.castShadow = on; }
}

// ------------------------------------------------------------------ weather
// Each preset: the sky shader's uniforms, the sun / sky lights, the image-based light, fog and exposure.
// "senin" and "noros" match the sunny Street View captures (deep blue sky, cumulus, hard sun shadows); "innorat" is the
// grey late-September deck of the user's own photos 1-23.
export const WEATHER = {
  senin: {
    label: 'Senin', cover: 0.4, cumulus: 1, zenith: [0.03, 0.115, 0.43], horizon: [0.46, 0.6, 0.78], bright: 1,
    cloudLit: [1.25, 1.22, 1.18], cloudDark: [0.46, 0.52, 0.62],
    sun: 3.8, sunColor: [1, 0.94, 0.84], hemi: 0.4, hemiSky: [0.8, 0.85, 0.95], hemiGround: [0.45, 0.4, 0.32],
    env: 1.4, envDesat: 0.7, envGround: [0.4, 0.37, 0.3], fog: [0.6, 0.69, 0.8], fogDensity: 1 / 6500, exposure: 0.95, shadow: 1,
  },
  noros: {
    label: 'Parțial noros', cover: 0.56, cumulus: 1, zenith: [0.06, 0.17, 0.48], horizon: [0.56, 0.64, 0.75], bright: 1,
    cloudLit: [1.15, 1.13, 1.1], cloudDark: [0.42, 0.46, 0.53],
    sun: 3.3, sunColor: [1, 0.94, 0.85], hemi: 0.45, hemiSky: [0.8, 0.84, 0.92], hemiGround: [0.42, 0.38, 0.31],
    env: 1.3, envDesat: 0.5, envGround: [0.38, 0.36, 0.3], fog: [0.6, 0.66, 0.74], fogDensity: 1 / 5500, exposure: 0.95, shadow: 0.95,
  },
  innorat: {
    label: 'Înnorat', cover: 0.72, cumulus: 0, zenith: [0.32, 0.42, 0.58], horizon: [0.6, 0.64, 0.69], bright: 1.12,
    cloudLit: [0.86, 0.87, 0.89], cloudDark: [0.5, 0.53, 0.58],
    sun: 1.7, sunColor: [1, 0.945, 0.867], hemi: 0.35, hemiSky: [0.875, 0.902, 0.933], hemiGround: [0.31, 0.29, 0.26],
    env: 0.75, fog: [0.56, 0.6, 0.65], fogDensity: 1 / 4000, exposure: 0.92, shadow: 1,
  },
};
// torrential rain (rain.js): a low, dark, even deck; the sun only a faint glow; heavy haze, visibility ~1.5 km
WEATHER.ploaie = {
  label: 'Ploaie torențială', cover: 0.97, cumulus: 0, zenith: [0.2, 0.215, 0.235], horizon: [0.36, 0.38, 0.4], bright: 0.95,
  cloudLit: [0.47, 0.49, 0.52], cloudDark: [0.22, 0.235, 0.255],
  sun: 0.35, sunColor: [0.85, 0.88, 0.95], hemi: 0.5, hemiSky: [0.62, 0.66, 0.72], hemiGround: [0.2, 0.2, 0.19],
  env: 0.9, envGround: [0.2, 0.2, 0.19], fog: [0.33, 0.35, 0.38], fogDensity: 1 / 520, exposure: 1.3, shadow: 0.45, rain: 1,
};
export const WEATHER_ORDER = ['senin', 'noros', 'innorat', 'ploaie'];

// ------------------------------------------------------------------ time of day
// Direct sunlight through the atmosphere: Kasten-Young air mass and per-channel optical depths (Rayleigh at
// ~680/550/440 nm plus a light aerosol load), relative to the sun at 38 deg (the photos' late-September late morning).
const airMass = (el) => 1 / (Math.sin(el * Math.PI / 180) + 0.50572 * Math.pow(el + 6.07995, -1.6364));
const TAU = [0.045 + 0.09, 0.097 + 0.1, 0.235 + 0.11];
const T38 = TAU.map(t => Math.exp(-t * airMass(38)));
export function sunlightAt(elDeg) {
  const m = airMass(Math.max(elDeg, 0.3));
  const rel = TAU.map((t, i) => Math.exp(-t * m) / T38[i]);
  const k = Math.max(...rel);
  const up = THREE.MathUtils.smoothstep(elDeg, -0.8, 2.5);          // the disk sinks behind the horizon
  return { color: rel.map(v => v / k), intensity: Math.min(1.15, rel[1]) * up, day: THREE.MathUtils.smoothstep(elDeg, -4, 22) };
}
// the hours offered (local summer time, UTC+3): the photos were taken around 11:30; the night of 26 September 2026 has
// a full moon (16:49 UTC)
export const HOURS = [8, 10, 11.5, 13, 15, 17, 18.5, 20, 22, 23.5];   // 20:00 dusk; 22:00 and 23:30 under the full moon
export const hourLabel = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
