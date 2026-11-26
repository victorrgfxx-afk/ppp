import * as THREE from 'three';
import { RAIN, SNOW, HASH_GLSL, WAVES_GLSL } from './rain.js';
import { FXSRC } from './taa.js';

// (V125) The surface of the water that gathers in a storm (runoff.js), drawn at its own level over what it covers:
// a mesh over the run-off's box (a vertex every second cell, ~37 cm), each vertex at the water's level there (or run
// on in under the bank beside it), drawn after TAA's resolve (taa.js: the scene's frame and depth are there to read),
// against what the frame has at each pixel (by height: below) - so a kerb, a tyre, a post, your boots stand in it and
// the hollows' edges are where the level meets the ground, to the pixel; in the small hollows the map cannot show
// (runoff.js: under the ground as drawn) it lies on the ground, as deep as they hold. What it shows:
// - its mirror: Fresnel for water (n = 1.333, F0 = 0.02), the frame's own picture along the reflected ray (a
//   screen-space march, as post.js has it for the wet road) and the sky's light map where that ray leaves the view; the
//   street lamps drawn out in it by its ripples;
// - what is under it, refracted (Snell: the bottom seen nearer and shallower, wavering with the ripples), and the light
//   the water itself sends back - Lee et al. 1998's model of shallow water (Appl. Opt. 37:6329: eqs. 3, 7, 16, 21 and
//   their Rrs above the surface), fitted to radiative transfer (Hydrolight) for depth, bottom and turbidity: the
//   bottom's light dimmed on its way down and up, the water column's own light growing with its depth; of the bottom's
//   light only the part never scattered shows sharp, the rest blurred. What it carries (runoff.js: silt and clay)
//   scatters ~0.5 m2 per gram at 555 nm, nearly the same at every wavelength (Babin et al. 2003, L&O 48:843: mineral
//   particles), 1.9 % of it backwards (the particle phase function Lee et al. fitted with; 3.7 % for Kopelevich's
//   suspended sediments), and absorbs: the iron in it the blue (Babin & Stramski 2004, L&O 49:756: 0.03-0.1 m2/g at
//   443 nm, falling off exponentially to the red), the water itself the red (Pope & Fry 1997: 0.34 /m at 650 nm,
//   0.057 at 550, 0.0092 at 450). So rainwater off a roof is clear, the
//   road's runoff (~100 mg/l) shows the bottom of a puddle a few cm deep blurred and grey-brown, the water off the soil
//   (~0.7 g/l) is ochre-brown and opaque within a few centimetres;
// - on it: the rings of the drops landing, the riffles it carries where it runs and the foam on them, a gust's ripples;
//   finer than a pixel they turn into the mirror's blur instead;
// - the haze between it and you, as on everything else (main.js's fog chunk, worked out once here).
// The ground under it is drawn as its soaked bottom only (rain.js: uFloodFX). Only while TAA is on (its frame and
// depth are needed); otherwise the surfaces draw the water themselves, as before.

const VERT = /* glsl */`
attribute vec2 cell;
uniform sampler2D uLevel;
uniform vec4 uFlowBox;
uniform float uN;
varying vec3 vW, vV;
varying float vKeep, vCov;
#ifdef USE_FOG
varying float vFogDepth;
varying vec3 vFogW;
#endif
void main() {
  vec4 lv = texelFetch(uLevel, ivec2(cell), 0);
  vec2 cuv = (cell * 2.0 + 0.5) / uN;
  vec3 p = vec3((cuv.x * 2.0 - 1.0) * uFlowBox.z, lv.r, (1.0 - cuv.y * 2.0) * uFlowBox.z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vW = (modelMatrix * vec4(p, 1.0)).xyz; vV = mv.xyz;
  vKeep = lv.g; vCov = lv.b;
#ifdef USE_FOG
  vFogDepth = -mv.z; vFogW = vW;
#endif
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = (fogTerms) => /* glsl */`
uniform mat4 projectionMatrix;
uniform sampler2D uFlow, uSed, uDepth, uScene, uOcc, uEnv;
uniform vec4 uFlowBox, uOccBox, uSnowCar;
uniform vec2 uRes, uWind, uWindOff, uSnowCarSize, uSnowCarY;
uniform mat4 uInvProjJ;
uniform float uN, uRain, uRainTime, uSceneOn, uOccOn, uEnvOn, uEnvK;
uniform vec4 uLamps[8];
uniform vec3 uLampCol;
varying vec3 vW, vV;
varying float vKeep, vCov;
#include <fog_pars_fragment>
#include <cube_uv_reflection_fragment>
${HASH_GLSL}
${WAVES_GLSL}
// (the scene's depth was drawn through this frame's sub-pixel shifted projection: taa.js)
vec3 viewPos(vec2 uv, float d) { vec4 p = uInvProjJ * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
vec2 toUv(vec3 p) { vec4 c = projectionMatrix * vec4(p, 1.0); return c.xy / c.w * 0.5 + 0.5; }
vec3 worldOf(vec3 p) { return cameraPosition + transpose(mat3(viewMatrix)) * p; }
// how open it is to the rain (the height map: not under a roof, a car, a crown)
float openSky(vec3 wp) {
  if (uOccOn < 0.5) return 1.0;
  vec2 uv = vec2(0.5 + (wp.x - uOccBox.x) / (2.0 * uOccBox.z), 0.5 - (wp.z - uOccBox.y) / (2.0 * uOccBox.z));
  if (any(lessThan(uv, vec2(0.004))) || any(greaterThan(uv, vec2(0.996)))) return 1.0;
  return 1.0 - smoothstep(0.3, 0.9, texture2D(uOcc, uv).r + uOccBox.w - wp.y);
}
// what it carries here (silt + clay, g/m3): the float state read between its cells by hand
float sedAt(vec2 fuv) {
  vec2 t = fuv * uN - 0.5, f = fract(t);
  ivec2 i = ivec2(floor(t)), M = ivec2(int(uN) - 1);
  vec2 a = texelFetch(uSed, clamp(i, ivec2(0), M), 0).rg, b = texelFetch(uSed, clamp(i + ivec2(1, 0), ivec2(0), M), 0).rg;
  vec2 c = texelFetch(uSed, clamp(i + ivec2(0, 1), ivec2(0), M), 0).rg, d = texelFetch(uSed, clamp(i + ivec2(1, 1), ivec2(0), M), 0).rg;
  vec2 s = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  return s.x + s.y;
}
vec3 envAt(vec3 r, float rough) {
  vec3 c = vec3(0.3);
#ifdef ENVMAP_TYPE_CUBE_UV
  if (uEnvOn > 0.5) c = textureCubeUV(uEnv, r, rough).rgb;
#endif
  return c * uEnvK;
}
void main() {
  vec3 wp = vW;
  float px = length(fwidth(wp.xz));                          // (before anything branches: how big a pixel is here)
  if (vKeep < 0.999) discard;
  // (not inside the car you drive, over its floor: as the rain and the snow are not)
  if (uSnowCar.w > 0.5) {
    vec2 dc = wp.xz - uSnowCar.xy, cs = vec2(cos(uSnowCar.z), sin(uSnowCar.z));
    vec2 q = abs(vec2(dot(dc, vec2(cs.x, -cs.y)), dot(dc, cs.yx))) - uSnowCarSize - 0.04;
    if (max(q.x, q.y) < 0.0 && wp.y > uSnowCarY.x + 0.25) discard;
  }
  vec2 fuv = vec2(0.5 + (wp.x - uFlowBox.x) / (2.0 * uFlowBox.z), 0.5 - (wp.z - uFlowBox.y) / (2.0 * uFlowBox.z));
  vec4 fl = texture2D(uFlow, fuv);
  vec2 be = abs(fuv - 0.5) * 2.0;
  float cov = vCov * smoothstep(0.003, 0.006, fl.r) * (1.0 - smoothstep(0.86, 0.97, max(be.x, be.y)));
  // the bottom under this point (or whatever stands in the water), as the frame has it: how far under the surface
  vec2 suv = gl_FragCoord.xy / uRes;
  float d0 = texture2D(uDepth, suv).r;
  float col = d0 >= 1.0 ? 1.0 : wp.y - worldOf(viewPos(suv, d0)).y;
  // (in front of what the frame has here, or what the frame has here stands out of it: the heights compared, not the
  // depths - the scene's depth was drawn through a projection shifted by a fraction of a pixel, which at a glancing
  // view of the ground moves it by more than a thin sheet of water is deep; level ground hardly changes height across it)
  cov *= smoothstep(-0.003, 0.0005, col);
  if (cov < 0.003) discard;
  vec3 toE = cameraPosition - wp;
  float dist = length(toE);
  vec3 v = -toE / dist;
  float aa = 1.0 - smoothstep(0.003, 0.012, px), near = 1.0 - smoothstep(25.0, 45.0, dist);
  vec2 vel = fl.gb; float sp = length(vel);
  // its surface: the drops' rings, the riffles and foam it carries where it runs, a gust's ripples
  vec2 sl = vec2(0.0); float foam = 0.0;
  float rip = uRain * openSky(wp) * (1.0 - smoothstep(14.0, 30.0, dist));
  if (rip > 0.01) sl += wetRipples(wp.xz, uRainTime) * rip * 0.45;
  if (near > 0.0 && sp > 0.03) {
    vec3 fs = flowSurface(wp.xz, vel, uRainTime, aa);
    sl += fs.xy * near * (0.12 + 0.5 * smoothstep(0.1, 1.2, sp));
    foam = fs.z * near * smoothstep(0.3, 1.1, sp);
  }
  float wsp = length(uWind);
  if (wsp > 1.5 && near > 0.0) {
    // (wind ripples, ~10 cm, run downwind in the patches a gust touches - cat's paws a few metres across, carried along)
    vec2 wd = uWind / wsp, wa = vec2(-wd.y, wd.x), q = wp.xz - uWindOff * 0.7;
    float paw = smoothstep(0.4, 0.75, wetNoise(vec2(dot(q, wd), dot(q, wa)) * 0.3));
    vec2 r = vec2(dot(wp.xz, wd) * 9.0 - uRainTime * 9.0, dot(wp.xz, wa) * 3.0);
    float n0 = wetNoise(r), nx = wetNoise(r + vec2(0.25, 0.0)), ny = wetNoise(r + vec2(0.0, 0.25));
    sl += (wd * (nx - n0) + wa * (ny - n0) * 0.33) * 1.6 * paw * smoothstep(1.5, 9.0, wsp) * near * mix(0.4, 1.0, aa);
  }
  // (finer than a pixel: the mirror's blur instead)
  float rough = clamp(0.015 + 0.3 * length(sl) * (1.0 - aa) + 0.04 * (1.0 - near), 0.015, 0.4);
  sl *= mix(0.3, 1.0, aa);
  vec3 n = normalize(vec3(-sl.x, 1.0, -sl.y));
  float F = 0.0204 + 0.9796 * pow(1.0 - clamp(dot(-v, n), 0.0, 1.0), 5.0);
  // the fog between it and you: taken out of what the frame has, put back on all of it at the end
  vec3 wT = vec3(1.0), wL = vec3(0.0);
${fogTerms}
  vec3 iT = 1.0 / max(wT, vec3(1e-3));
  // what is under it, refracted (seen through the point where the refracted ray meets a bottom this deep)
  vec3 rt = refract(v, n, 0.7502);
  float cl = clamp(max(col, fl.r), 0.0, 2.0), Lup = cl / max(-rt.y, 0.1);   // (the small hollows lie under the ground as drawn: their depth)
  vec2 ruv = clamp(toUv((viewMatrix * vec4(wp + rt * Lup, 1.0)).xyz), vec2(0.001), vec2(0.999));
  float dR = texture2D(uDepth, ruv).r;
  if (dR >= 1.0 || worldOf(viewPos(ruv, dR)).y > wp.y - 0.002) ruv = suv;   // (that stands out of the water: straight through)
  vec3 bot = max((texture2D(uScene, ruv).rgb - wL) * iT, vec3(0.0));
  // the bottom as the light scattered on its way spreads it (~0.3 of the depth), and the light it is lit by: as bright
  // as the frame has the bottom round about (a soaked bottom's albedo ~0.1)
  vec2 o = clamp(0.3 * cl / max(px, 1e-4), 2.0, 14.0) / uRes;
  vec3 botB = (texture2D(uScene, ruv + o).rgb + texture2D(uScene, ruv - o).rgb + texture2D(uScene, ruv + vec2(o.x, -o.y)).rgb + texture2D(uScene, ruv - vec2(o.x, -o.y)).rgb) * 0.25;
  botB = max((botB - wL) * iT, vec3(0.0));
  vec3 lit = botB * 10.0;
  // the water itself (see the header): Lee et al. 1998's model of shallow water (eqs. 3, 7, 16, 21; their Rrs above
  // the surface), the sky's light under the surface at the mean cosine an overcast sky gives it there (0.84), the
  // way up along the view's refracted ray; of the bottom's light the part never scattered is its sharp image
  float spm = sedAt(fuv);
  vec3 bp = vec3(0.5 * spm), bb = 0.019 * bp;
  vec3 ap = vec3(0.007, 0.021, 0.064) * spm + vec3(0.34, 0.057, 0.0092);
  vec3 al = ap + bb, u = bb / al;
  float cv = max(-rt.y, 0.1);
  vec3 rcol = max((0.070 + 0.155 * pow(u, vec3(0.752))) * u * (1.0 - 1.03 * exp(-(1.19 + 1.2 * sqrt(1.0 + 2.0 * u) / cv) * al * cl)), vec3(0.0));
  vec3 TB = exp(-(1.19 + 1.1 * sqrt(1.0 + 4.9 * u) / cv) * al * cl), Ts = min(exp(-(ap + bp) * cl * (1.19 + 1.0 / cv)), TB);
  vec3 under = (bot * Ts + botB * (TB - Ts) + 3.14159 * 0.518 * rcol / (1.0 - 1.562 * rcol) * lit) / 0.98;
  // its mirror: what the frame shows along the reflected ray, the sky's light where it leaves the view
  vec3 r = reflect(v, n); r.y = max(r.y, 0.02); r = normalize(r);
  vec3 refl = envAt(r, rough);
  vec3 rv = normalize((viewMatrix * vec4(r, 0.0)).xyz), q = vV + rv * 0.03, prev = q;
  float stepLen = (0.08 + 0.06 * rainHash(gl_FragCoord.xy + fract(uRainTime) * 61.0)) * max(1.0, -vV.z * 0.03), travelled = 0.0;
  vec2 hit = vec2(-1.0);
  if (uSceneOn > 0.5) for (int i = 0; i < 36; i++) {
    prev = q; q += rv * stepLen; travelled += stepLen; stepLen *= 1.16;
    if (q.z > -0.05) break;
    vec2 u2 = toUv(q);
    if (u2.x < 0.0 || u2.x > 1.0 || u2.y < 0.0 || u2.y > 1.0) break;
    float sd = texture2D(uDepth, u2).r;
    if (sd >= 1.0) continue;
    float dz = viewPos(u2, sd).z - q.z;
    if (dz > 0.0 && dz < stepLen * 3.0 + 0.25) {
      vec3 a = prev, b = q;
      for (int k = 0; k < 5; k++) { vec3 m = (a + b) * 0.5; vec2 mu = toUv(m); if (viewPos(mu, texture2D(uDepth, mu).r).z - m.z > 0.0) b = m; else a = m; }
      hit = toUv(b);
      break;
    }
  }
  if (hit.x >= 0.0) {
    vec2 e = smoothstep(vec2(0.0), vec2(0.07), hit) * smoothstep(vec2(0.0), vec2(0.07), 1.0 - hit);
    float conf = e.x * e.y * (1.0 - smoothstep(60.0, 140.0, travelled));
    vec3 h = min(max((texture2D(uScene, hit).rgb - wL) * iT, vec3(0.0)), vec3(64.0));
    refl = mix(refl, h, conf);
  }
  // the street lamps' images, drawn out into streaks by its ripples
  vec3 nv = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float sx = 0.004 + 0.02 * rough, sy = 0.01 + 0.4 * rough + 0.03 * rip;
  for (int i = 0; i < 8; i++) {
    vec4 L = uLamps[i];
    if (L.w <= 0.0) continue;
    vec3 Lm = L.xyz - 2.0 * dot(L.xyz - vV, nv) * nv;
    if (Lm.z > -0.2) continue;
    vec2 dd = (suv - toUv(Lm)) * vec2(uRes.x / uRes.y, 1.0);
    refl += uLampCol * L.w * exp(-dd.x * dd.x / (sx * sx) - dd.y * dd.y / (sy * sy)) * 2.5;
  }
  vec3 c = mix(under, refl, F);
  c = mix(c, vec3(0.75) * lit, clamp(foam, 0.0, 1.0) * 0.8);
  c = c * wT + wL;
  gl_FragColor = vec4(c * cov, cov);
}`;

// the fog chunk's terms (main.js patches three's), kept instead of applied
function fogTerms() {
  const src = THREE.ShaderChunk.fog_fragment, line = 'gl_FragColor.rgb = gl_FragColor.rgb * airT + airL;';
  if (!src.includes(line)) throw new Error('floodwater.js: the fog chunk has changed');
  return src.replace(line, 'wT = airT; wL = airL;');
}

export class FloodWater {
  // runoff: runoff.js's Runoff; fog: scene.fog; air: main.js's shared haze values { sun, cool, fog }; env/envOn/envK,
  // wind/windOff: RainFX's uniforms (the sky's light map, the wind); lamps: post.js's SSR uniforms (uLamps, uLampCol)
  constructor(runoff, { fog, air, env, envOn, envK, wind, windOff, lamps }) {
    this.runoff = runoff; this.fog = fog;
    const n = runoff.size / 2;                     // (a vertex every second cell)
    const cell = new Float32Array(n * n * 2), idx = new (n * n > 65536 ? Uint32Array : Uint16Array)((n - 1) * (n - 1) * 6);
    for (let j = 0, k = 0; j < n; j++) for (let i = 0; i < n; i++, k++) { cell[2 * k] = i; cell[2 * k + 1] = j; }
    for (let j = 0, k = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.set([a, b, c, b, d, c], k); k += 6;      // (facing up: x east, z south as the rows run)
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('cell', new THREE.BufferAttribute(cell, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.u = {
      uLevel: { value: runoff.level.texture }, uSed: { value: null }, uN: { value: runoff.size },
      uFlow: RAIN.uFlow, uFlowBox: RAIN.uFlowBox, uOccBox: RAIN.uOccBox, uOcc: RAIN.uOcc, uOccOn: RAIN.uOccOn, uRain: RAIN.uRain, uRainTime: RAIN.uRainTime,
      uDepth: FXSRC.tDepth, uScene: FXSRC.tScene, uSceneOn: FXSRC.uSceneOn, uInvProjJ: FXSRC.uInvProjJ, uRes: FXSRC.uRes,
      uEnv: env, uEnvOn: envOn, uEnvK: envK, uWind: wind, uWindOff: windOff,
      uLamps: lamps?.uLamps ?? { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uLampCol: lamps?.uLampCol ?? { value: new THREE.Color(1, 0.78, 0.5) },
      uSnowCar: SNOW.uSnowCar, uSnowCarSize: SNOW.uSnowCarSize, uSnowCarY: SNOW.uSnowCarY,
      fogColor: { value: fog.color }, fogNear: { value: fog.near }, fogFar: { value: fog.far },
      airSun: { value: air.sun }, airCool: { value: air.cool }, airFog: { value: air.fog },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG(fogTerms()), uniforms: this.u, defines: { USE_FOG: '' },
      transparent: true, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, fog: false,   // (its own test: the heights, above)
      // over the frame: premultiplied (what it shows, its share of the pixel), the frame's alpha kept (post.js: the haze)
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.userData.noAO = true;
    this.mesh.visible = false;
    this.envKey = null;
  }

  // on: TAA is on (the frame and its depth are there to read) and there is water; after runoff.step
  update(on) {
    const ro = this.runoff, show = on && ro.on && RAIN.uFlowBox.value.w > 0.5;
    this.mesh.visible = show;
    RAIN.uFloodFX.value = show ? 1 : 0;
    if (!show) return;
    this.mesh.position.set(RAIN.uFlowBox.value.x, RAIN.uOccBox.value.w, RAIN.uFlowBox.value.y);
    this.u.uSed.value = ro.C[ro.cc].texture;
    this.u.fogNear.value = this.fog.near; this.u.fogFar.value = this.fog.far;
    // (the sky's light map: its layout from its height, as three's WebGLPrograms works it out)
    const env = this.u.uEnv.value, h = env && env.mapping === THREE.CubeUVReflectionMapping ? env.image?.height : 0;
    if (h !== this.envKey) {
      this.envKey = h;
      const mip = h ? Math.log2(h) - 2 : 0;
      this.mat.defines = h ? { USE_FOG: '', ENVMAP_TYPE_CUBE_UV: '', CUBEUV_TEXEL_WIDTH: 1 / (3 * Math.max(2 ** mip, 7 * 16)), CUBEUV_TEXEL_HEIGHT: 1 / h, CUBEUV_MAX_MIP: mip.toFixed(1) } : { USE_FOG: '' };
      this.mat.needsUpdate = true;
    }
  }
}
