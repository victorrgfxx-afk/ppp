import * as THREE from 'three';
import { LAMP_OCC_GLSL, LAMP_I0 } from './lamps.js';
import { EYE } from './eye.js';
import { FXSRC } from './taa.js';

// Torrential rain: falling streaks, splashes, wet surfaces with puddles, water running down sloped roads and raindrop
// rings, all stopped by whatever is on top. A top-down height map around the camera (the highest surface: crowns,
// roofs, car roofs, bridge decks, the ground) tells where the rain lands: drops vanish there, splashes sit on it and
// whatever lies more than ~0.5 m under it stays sheltered (damp, no rings, no running water).

// shared uniform objects: the very same ones are put into every patched material, so one write reaches all
export const RAIN = {
  uWet: { value: 0 },          // how wet the surfaces are (0..1, follows the rain slowly)
  uRain: { value: 0 },         // how hard it rains now (0..1)
  uRainTime: { value: 0 },
  uOcc: { value: null },
  uOccBox: { value: new THREE.Vector4(0, 0, 48, 0) },   // centre x, z, half size (m), reference height
  uOccOn: { value: 0 },
  uGale: { value: 0 },         // a squall's gale (0..1): the rain driven along the wind, kept off by what stands upwind
  uFlow: { value: null },      // the running water (runoff.js): depth, velocity, the surface it runs on
  uFlowBox: { value: new THREE.Vector4(0, 0, 48, 0) },   // centre x, z, half size, on
  // (V92) for the splashes: the roads and the ground under everything (RainOcclusion's maps, on the occlusion's box)
  uRoad: { value: null }, uLow: { value: null }, uSurfOn: { value: 0 },
  uAirOff: { value: new THREE.Vector2() },   // how far the air has carried the haze's patterns (main.js: the squall's sheets of rain)
};

// snow (the same hook as the rain: every patched material can be covered)
export const SNOW = {
  uSnow: { value: 0 },         // how much snow lies on the surfaces (0..1: a dusting on the level ones .. everything that faces up)
  uSnowFall: { value: 0 },     // how hard it snows now (0..1)
  uSnowLight: { value: 1 },    // daylight on the snow (the sparkle of its crystals)
  uSnowDepth: { value: 0 },    // how deep it lies in the open, in metres (it builds up while it snows: main.js)
  uSnowField: { value: null }, // the lying snow's shape around the camera (RainOcclusion)
  uSnowCar: { value: new THREE.Vector4() },        // the car you are in: x, z, heading, 1 when in one (it ploughs through)
  uSnowCarSize: { value: new THREE.Vector2(1, 2.4) },   // its half width and half length (m)
  uSnowPlaster: { value: 0 },  // a blizzard's snow plastered on the windward faces (0..1, builds up in ~1.5 min)
  uSnowWindDir: { value: new THREE.Vector2(0.052, -0.9986).normalize() },   // the prevailing wind (downwind: the crivăț, from the NE)
  uSnowCarY: { value: new THREE.Vector2(0, 1.5) },  // the driven car: the ground under it and its height (no flakes inside it)
  // the snow's flight seen from upwind (SnowLee): what it cannot blow through, as far along the flight as it stands
  uLee: { value: null },
  uLeeVP: { value: new THREE.Matrix4() },
  uLeeOrg: { value: new THREE.Vector3() },
  uLeeDir: { value: new THREE.Vector3(0, -1, 0) },
  uLeeOn: { value: 0 },
  // the footprints and tyre tracks (snowtrail.js): how much of the depth they pressed out, around uTrailBox (x, z, half
  // size, on)
  uTrail: { value: null },
  uTrailBox: { value: new THREE.Vector4(0, 0, 24, 0) },
  uSnowFine: { value: new THREE.Vector4(0, 0, 6.4, 0) },   // the fine blanket near you: centre x, z, half size, on
};
// low plants that go under a cover deeper than a dusting (meadow grass, flowers, ferns, weeds): their materials are
// hidden then (main.js)
export const UNDER_SNOW = new Set();

// the footprints and tyre tracks (snowtrail.js): R how much of the depth is pressed out, G the rim pushed up around,
// B the tread on the floor of the print (0 outside the map, fading out at its edge)
const TRAIL_GLSL = /* glsl */`
vec4 trailAt(vec2 xz) {
  if (uTrailBox.w < 0.5) return vec4(0.0);
  vec2 uv = vec2(0.5 + (xz.x - uTrailBox.x) / (2.0 * uTrailBox.z), 0.5 - (xz.y - uTrailBox.y) / (2.0 * uTrailBox.z));
  vec2 e = abs(uv - 0.5) * 2.0;
  return texture2D(uTrail, uv) * (1.0 - smoothstep(0.9, 1.0, max(e.x, e.y)));
}`;
// a crystal's glint (shared by the cover and the blanket): ~1.4 cm crystals with facets turned every way, a few of
// which mirror the sun (or the moon) into the eye; sharp, and gone as you move
const GLINT_GLSL = /* glsl */`
float snowGlint(vec3 wp, vec3 n, vec3 l, vec3 v) {
  vec2 c = floor(wp.xz * 70.0 + wp.y * 13.0);
  vec3 r = vec3(rainHash(c), rainHash(c + 3.7), rainHash(c + 8.3)) * 2.0 - 1.0;
  vec3 f = normalize(n + (viewMatrix * vec4(r * 1.6, 0.0)).xyz);
  return pow(max(dot(f, normalize(l + v)), 0.0), 1400.0) * step(0.4, rainHash(c + 1.9)) * step(0.0, dot(n, l));
}`;

// the height map look-up, shared by the surface, streak and splash shaders (top surface height or -1e5 outside)
const OCC_GLSL = /* glsl */`
float rainTop(vec2 xz) {
  if (uOccOn < 0.5) return -1e5;
  vec2 uv = vec2(0.5 + (xz.x - uOccBox.x) / (2.0 * uOccBox.z), 0.5 - (xz.y - uOccBox.y) / (2.0 * uOccBox.z));
  if (any(lessThan(uv, vec2(0.004))) || any(greaterThan(uv, vec2(0.996)))) return -1e5;
  return texture2D(uOcc, uv).r + uOccBox.w;
}
// (world cells run to 10^5 and more a few km out: brought into a small range first, or float precision leaves the hash
// with a handful of values and every pattern built on it flat)
float rainHash(vec2 p) { vec3 q = fract(vec3(mod(p, 4096.0).xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float rainNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rainHash(i), rainHash(i + vec2(1.0, 0.0)), f.x), mix(rainHash(i + vec2(0.0, 1.0)), rainHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// what keeps the flying snow off (the flakes and the drift): SnowLee's map of the things in its way, seen along its
// flight, and the car you drive
const LEE_GLSL = /* glsl */`
uniform sampler2D uLee;
uniform mat4 uLeeVP;
uniform vec3 uLeeOrg, uLeeDir;
uniform float uLeeOn;
uniform vec4 uSnowCar;
uniform vec2 uSnowCarSize, uSnowCarY;
// how far (m along the flight) p lies behind the first thing upwind of it that the snow cannot blow through; < 0 open
float leeGap(vec3 p) {
  if (uLeeOn < 0.5) return -1.0;
  vec2 uv = (uLeeVP * vec4(p, 1.0)).xy * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.002))) || any(greaterThan(uv, vec2(0.998)))) return -1.0;
  return dot(p - uLeeOrg, uLeeDir) - texture2D(uLee, uv).r;
}
bool inCar(vec3 p) {
  if (uSnowCar.w < 0.5) return false;
  vec2 dc = p.xz - uSnowCar.xy, cs = vec2(cos(uSnowCar.z), sin(uSnowCar.z));
  vec2 q = abs(vec2(dot(dc, vec2(cs.x, -cs.y)), dot(dc, cs.yx))) - uSnowCarSize - 0.04;
  return max(q.x, q.y) < 0.0 && p.y > uSnowCarY.x - 0.1 && p.y < uSnowCarY.x + uSnowCarY.y + 0.04;
}`;

// ------------------------------------------------------------------ wet surfaces
const WET_PARS = /* glsl */`
uniform float uWet, uRain, uRainTime, uOccOn, uSnow, uSnowFall, uSnowLight, uSnowPlaster, uSnowDepth;
uniform vec2 uSnowWindDir;
uniform sampler2D uOcc, uTrail, uFlow;
uniform vec4 uOccBox, uTrailBox, uFlowBox;
uniform float uGale;
varying vec3 vWetP;
float wetReflOut = 0.0;                              // how much this point mirrors the scene (screen-space reflections, post.js)
float wetEarth = -1.0;                               // how much of the ground here is bare earth (geo/terrain.js sets it; else MUD_K)
float wetGrass = -1.0;                               // and how much of it grass (geo/terrain.js; else GRASS_K)
float snowGlintK = 0.0;                              // fresh snow here: its crystals glint in the sun (after the lights)
${OCC_GLSL}
${TRAIL_GLSL}
${LEE_GLSL}
float wetNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rainHash(i), rainHash(i + vec2(1.0, 0.0)), f.x), mix(rainHash(i + vec2(0.0, 1.0)), rainHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// raindrop rings: in every ~0.3 m cell a drop lands at a random spot and time; the ring runs out and fades.
// Returns the slope (gradient) of the water surface in world x / z.
vec2 wetRipples(vec2 p, float t) {
  vec2 g = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * 3.3 + float(k) * vec2(0.37, 0.71);
    vec2 c = floor(q), f = fract(q);
    float h = rainHash(c + float(k) * 17.0);
    vec2 o = vec2(rainHash(c + 3.7), rainHash(c + 9.1)) * 0.4 + 0.3;
    float ph = fract(t * 1.7 + h);
    vec2 d = f - o; float r = length(d) + 1e-4;
    float x = (r - ph * 0.3) * 26.0;
    g += d / r * sin(x * 2.4) * exp(-x * x * 0.5) * (1.0 - ph) * (1.0 - ph) * step(r, 0.42);
  }
  return g;
}
// how open p is to the driven rain (0 behind something along its flight .. 1): five taps across the flight, soft (a
// map texel is ~7 cm: a hard edge would be a staircase)
float leeOpen(vec3 p) {
  vec3 a = normalize(cross(uLeeDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4)), b = cross(a, uLeeDir);
  float e = 0.0;
  for (int k = 0; k < 5; k++) {
    vec2 o = k == 0 ? vec2(0.0) : vec2(k == 1 ? 1.0 : k == 2 ? -1.0 : 0.0, k == 3 ? 1.0 : k == 4 ? -1.0 : 0.0) * 0.14;
    e += 1.0 - smoothstep(0.1, 0.45, leeGap(p + a * o.x + b * o.y));
  }
  return e / 5.0;
}
float wetOpen(vec3 wp) {
  float top = rainTop(wp.xz);
  return top < -1e4 ? 1.0 : 1.0 - smoothstep(0.3, 0.9, top - wp.y);
}
// the running water (runoff.js): how deep (m) and how fast (m/s, world x / z) it runs here, only on the surface it was
// worked out on (not on a wall below the eaves, nor on a floor under a roof); w: 1 inside the box it covers
vec4 flowAt(vec3 wp) {
  if (uFlowBox.w < 0.5) return vec4(0.0);
  vec2 uv = vec2(0.5 + (wp.x - uFlowBox.x) / (2.0 * uFlowBox.z), 0.5 - (wp.z - uFlowBox.y) / (2.0 * uFlowBox.z));
  vec2 e = abs(uv - 0.5) * 2.0;
  float inBox = 1.0 - smoothstep(0.88, 0.99, max(e.x, e.y));
  if (inBox <= 0.0) return vec4(0.0);
  vec4 f = texture2D(uFlow, uv);
  return vec4(f.xyz * inBox * (1.0 - smoothstep(0.1, 0.25, abs(wp.y - f.w - uOccBox.w))), inBox);
}
// carried along with the water (a flow map: two layers of the same pattern, each carried for one period and faded in
// and out in turn): its little waves, stretched across the flow (the riffles stand across a stream), as a slope
// (world x / z), and the foam it carries in streaks
vec3 flowSurface(vec2 p, vec2 vel, float t, float aa) {
  float sp = length(vel);
  vec2 fd = sp > 1e-3 ? vel / sp : vec2(1.0, 0.0), fa = vec2(-fd.y, fd.x);
  vec3 g = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float ph = fract(t * 0.8 + float(k) * 0.5), wk = 1.0 - abs(2.0 * ph - 1.0);
    vec2 q = p - vel * ph * 1.25 + float(k) * vec2(3.7, 7.1);
    float ac = dot(q, fa), al = dot(q, fd);
    // the riffles (~15-25 cm), and finer ones on them where the pixels can still show them
    vec2 r = vec2(ac * 2.2, al * (4.0 + 3.0 * min(sp, 2.0)));
    float n0 = wetNoise(r), nx = wetNoise(r + vec2(0.25, 0.0)), ny = wetNoise(r + vec2(0.0, 0.25));
    vec2 d = fa * (nx - n0) + fd * (ny - n0);
    if (aa > 0.0) {
      vec2 r2 = r * 2.7 + 5.3;
      float m0 = wetNoise(r2), mx = wetNoise(r2 + vec2(0.25, 0.0)), my = wetNoise(r2 + vec2(0.0, 0.25));
      d += (fa * (mx - m0) + fd * (my - m0)) * 0.45 * aa;
    }
    g.xy += d * wk;
    // the foam: little clusters of bubbles riding on it, thinning out
    float fb = wetNoise(vec2(ac * 7.0 + 11.0, al * 3.5)) * wetNoise(vec2(ac * 1.8 + 3.0, al * 0.9 + 7.0));
    g.z += mix(0.12, smoothstep(0.36, 0.58, fb), aa) * wk;
  }
  return g;
}
`;

const WET_MAIN = /* glsl */`
if (uWet > 0.001) {
  vec3 wp = vWetP;
  float upF = smoothstep(0.6, 0.92, wetGeoN.y);
  float open = wetOpen(wp);
  // a squall's driven rain wets what faces it (walls, trunks, fences: the windward side of everything) right down, and
  // misses what stands behind something along its flight (the ground in the lee of a house stays without drops)
  // (hit: where the drops land now - their rings and bursts; the ground in the lee is as wet as the rest)
  float drv = 0.0, hit = open;
#ifndef WET_LEAF
  if (uGale > 0.05 && uLeeOn > 0.5) {
    float exposed = leeOpen(wp + wetGeoN * 0.15);
    drv = uGale * exposed * smoothstep(-0.05, 0.4, -dot(wetGeoN, uLeeDir));
    hit *= mix(1.0, exposed, 0.5 * uGale * upF);
  }
#endif
  float wet = uWet * max(mix(0.3, 1.0, open), mix(0.3, 1.0, drv));
  float rough0 = roughnessFactor;
  float dist = length(wp - cameraPosition);
  // porous things darken when soaked (soil, plaster, asphalt), metal and paint hardly; everything gets glossier
  float por = clamp((roughnessFactor - 0.25) / 0.6, 0.0, 1.0) * (1.0 - metalnessFactor);
#ifndef WET_LEAF
  // (the water in the pores darkens the darker channels more than the lighter ones, so a wet thing is deeper in colour:
  // A_wet = A / (n^2 - (n^2 - 1) A), n = 1.33 - Angstrom 1925, Lekner & Dorf 1988 - here scaled to the ~0.45-0.65 of
  // the dry albedo measured for soaked soil, concrete and asphalt)
  diffuseColor.rgb *= 1.0 - wet * por * mix(0.3, 0.5, upF) * (1.15 - 0.6 * clamp(diffuseColor.rgb, 0.0, 1.0));
#endif
  roughnessFactor = mix(roughnessFactor, roughnessFactor * mix(0.7, 0.32, upF), wet);
  vec2 slopeW = vec2(0.0);
  float water = 0.0, flowFoam = 0.0, flowRough = 0.0, drown = 0.0;
  vec4 fl = flowAt(wp);
#ifndef WET_LEAF
  // and the water streams down the faces it drives against, in rivulets that run, join and part
  if (drv > 0.01 && upF < 0.5) {
    vec2 tw = normalize(vec2(-wetGeoN.z, wetGeoN.x) + 1e-5);
    float along = dot(wp.xz, tw);
    float rv = wetNoise(vec2(along * 9.0, wp.y * 1.6 + uRainTime * 2.4)) * 0.6 + wetNoise(vec2(along * 3.1 + 7.0, wp.y * 0.5 + uRainTime * 1.1)) * 0.4;
    float riv = smoothstep(0.5, 0.68, rv) * drv * uWet * (1.0 - upF) * (1.0 - smoothstep(10.0, 30.0, dist));
    diffuseColor.rgb *= 1.0 - 0.22 * riv * por;
    roughnessFactor = mix(roughnessFactor, 0.05, riv);
  }
#endif
#ifdef WET_ROAD
  {
    // the real tilt of the surface (the road ribbons carry flat normals): puddles on the level, a running film downhill
    vec3 gN = normalize(cross(dFdx(wp), dFdy(wp)));
    if (dot(gN, wetGeoN) < 0.0) gN = -gN;
    float sl = length(gN.xz) / max(gN.y, 0.05);
    float lvl = 1.0 - smoothstep(0.012, 0.035, sl);
    float n = wetNoise(wp.xz * 0.45) * 0.65 + wetNoise(wp.xz * 1.7 + 5.3) * 0.35;
    float pud = smoothstep(0.57, 0.66, n) * lvl;
    vec2 fd = normalize(gN.xz + vec2(1e-5));          // downhill
    vec2 fa = vec2(-fd.y, fd.x);
    float al = dot(wp.xz, fd), ac = dot(wp.xz, fa);
    float sp = clamp(sl * 14.0, 0.7, 3.0);             // faster on steeper roads (m/s scale)
    float s1 = wetNoise(vec2(ac * 3.0, al * 0.7 - uRainTime * sp));
    float s2 = wetNoise(vec2(ac * 7.5 + 3.1, al * 1.6 - uRainTime * sp * 2.1));
    float flowing = smoothstep(0.025, 0.05, sl);
    // (where the running water is worked out, it is drawn from that instead: below)
    float sheet = flowing * (0.55 + 0.45 * smoothstep(0.35, 0.7, s1 * 0.65 + s2 * 0.35 + 0.08)) * (1.0 - fl.w);   // a continuous film, thicker in rills
    water = max(pud, sheet) * open * upF * uWet;
    // wavelets of the running film, drawn out along the flow
    float s3 = wetNoise(vec2((ac + 0.12) * 7.5 + 3.1, al * 1.6 - uRainTime * sp * 2.1));
    float s4 = wetNoise(vec2(ac * 7.5 + 3.1, (al + 0.3) * 1.6 - uRainTime * sp * 2.1));
    slopeW += (fa * (s3 - s2) + fd * (s4 - s2) * 0.5) * 0.9 * sheet * open * upF * uWet;
  }
#endif
#ifndef WET_LEAF
  // the running water: a film where the rain sheets off, streams along the kerbs and down the slopes, the hollows
  // standing full; little waves and foam carried along with it, muddy where it runs off the bare ground
  float fh = fl.x * smoothstep(0.35, 0.8, wetGeoN.y);
  if (fh > 5e-5) {
    // (on the ground a thin sheet runs in among the grass and the crumbs of soil: only a stream or a puddle shows)
#ifdef WET_GROUND
    float film = smoothstep(0.004, 0.012, fh);
#else
    float film = smoothstep(0.0006, 0.0025, fh);          // (the asphalt's grit shows through a film thinner than ~2 mm)
#endif
    float deep = smoothstep(0.002, 0.025, fh);
    vec2 vel = fl.yz; float sp = length(vel);
    float near = 1.0 - smoothstep(18.0, 40.0, dist);
    if (near > 0.0) {
      // (the finer detail only where a pixel is small enough for it: no glitter further off)
      float aa = 1.0 - smoothstep(0.003, 0.012, length(fwidth(wp.xz)));
      vec3 fs = flowSurface(wp.xz, vel, uRainTime, aa);
      slopeW += fs.xy * near * film * (0.18 + 0.4 * smoothstep(0.1, 1.0, sp)) * mix(0.5, 1.0, deep);
      flowFoam = fs.z * near * smoothstep(0.2, 0.9, sp) * smoothstep(0.002, 0.008, fh);
    }
    // a stream carries what it washes off: muddy off the bare ground, a turbid grey-brown off the road (lighter than the
    // black wet asphalt under it)
#ifdef WET_GROUND
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.115, 0.08), deep * 0.7);
#else
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.18, 0.15), deep * smoothstep(0.1, 0.6, sp) * 0.55);
#endif
    diffuseColor.rgb *= 1.0 - 0.2 * deep;                // (a stream a few cm deep: some of the light goes into it)
    water = max(water, film);
    drown = smoothstep(0.001, 0.008, fh);                 // (under a few mm of water the grit and the joints are gone)
    flowRough = film * smoothstep(0.15, 1.0, sp);          // (a running surface is never quite a mirror)
  }
#endif
#ifdef WET_GROUND
  // (V92) the prints in the mud (snowtrail.js: the snow's map): where the wet ground is earth - a field, a path, a garden
  // bed, the floor of a wood; a little in the grass, hardly on gravel. The floor of a print darker and smoother (the soil
  // pressed and soaked), the lugs of the tread in it, the rim squeezed up round it; the deeper ones hold water in the rain
  if (uTrailBox.w > 0.5 && uSnow < 0.02) {
    float earth = (wetEarth >= 0.0 ? wetEarth : MUD_K) * smoothstep(0.1, 0.45, uWet) * upF;
    vec4 tr = trailAt(wp.xz);
    if (earth > 0.01 && tr.r + tr.g > 0.003) {
      // (its shape - ~2.5 cm deep in its middle, the rim ~0.8 cm up - as a slope, from the map 2 cm either side)
      vec2 e = vec2(0.02, 0.0);
      vec4 ax = trailAt(wp.xz + e.xy) - trailAt(wp.xz - e.xy), az = trailAt(wp.xz + e.yx) - trailAt(wp.xz - e.yx);
      slopeW += vec2(-0.025 * ax.r + 0.008 * ax.g, -0.025 * az.r + 0.008 * az.g) / (2.0 * e.x) * earth * (1.0 - smoothstep(10.0, 22.0, dist));
      float pr = tr.r * earth;
      diffuseColor.rgb *= (1.0 - 0.32 * pr - 0.1 * tr.b * earth) * (1.0 + 0.1 * tr.g * earth);
      roughnessFactor = mix(roughnessFactor, 0.28, pr);
      water = max(water, smoothstep(0.55, 0.9, tr.r) * earth * smoothstep(0.15, 0.6, uRain + 0.3 * uWet));
    }
  }
#endif
  diffuseColor.rgb *= 1.0 - 0.3 * water;
  roughnessFactor = mix(roughnessFactor, 0.05, water);
  roughnessFactor = max(roughnessFactor, 0.11 * flowRough);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.78, 0.75), flowFoam * 0.75);
  roughnessFactor = mix(roughnessFactor, 0.5, flowFoam);
  // raindrop rings only on standing water; beyond ~25 m they are below a pixel
  float rip = uRain * hit * upF * (1.0 - smoothstep(12.0, 26.0, dist)) * smoothstep(0.25, 0.7, water);
  if (rip > 0.01) slopeW += wetRipples(wp.xz, uRainTime) * rip * (0.24 + 0.22 * drown);   // (a smooth sheet of water shows every ring)
#ifndef WET_LEAF
  // the impacts: in a downpour hard ground 'boils' with tiny crowns of spray (~4 cm), each lasting ~0.08 s, about
  // 140 at a time on every square metre (~3000 drops/m2/s at 50 mm/h)
  float imp = uRain * hit * upF * (1.0 - smoothstep(5.0, 13.0, dist));
#ifdef WET_GROUND
  imp *= 1.0 - 0.8 * (wetGrass >= 0.0 ? wetGrass : GRASS_K);   // (V92: in the grass the drops break on the blades - no boil)
#endif
  if (imp > 0.01) {
    float sp = 0.0;
    for (int k = 0; k < 2; k++) {
      vec2 q = wp.xz * 24.0 + float(k) * vec2(0.5, 0.27);
      vec2 c = floor(q);
      float ph = fract(uRainTime * 2.6 + rainHash(c + float(k) * 7.0));
      vec2 o = vec2(rainHash(c + 1.3), rainHash(c + 2.7)) * 0.6 + 0.2;
      float r = length(fract(q) - o);
      sp += (1.0 - smoothstep(0.04, 0.1 + 0.3 * ph, r)) * (1.0 - smoothstep(0.0, 0.22, ph)) * step(rainHash(c + 5.1), 0.55);
    }
    sp = clamp(sp, 0.0, 1.0) * imp;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72), sp * 0.65);
    roughnessFactor = mix(roughnessFactor, 0.45, sp);
  }
#endif
  normal = normalize(mix(normal, (viewMatrix * vec4(wetGeoN, 0.0)).xyz, drown));
  normal = normalize(normal - (viewMatrix * vec4(slopeW.x, 0.0, slopeW.y, 0.0)).xyz);
  // for the screen-space reflections: standing and running water mirror, a wet road film a little, other level hard
  // surfaces (roofs, slabs, car roofs) a little; leaves and rough ground not
#ifdef WET_ROAD
  wetReflOut = max(water, 0.5 * wet * upF * open);
#elif !defined(WET_LEAF)
  wetReflOut = wet * upF * open * 0.25 * (1.0 - smoothstep(0.55, 0.85, rough0));
#endif
#ifndef WET_LEAF
  wetReflOut = max(wetReflOut, water * (1.0 - flowFoam));
#endif
}
`;

// ------------------------------------------------------------------ snow cover
// Snow settles on what faces the sky (not on walls, not under roofs or eaves: the same height map as the rain), first
// in patches on the level surfaces, then over everything up to ~50 deg of slope. It hides the texture under a smooth,
// lumpy white with a few glinting crystals; on the roads it is driven into grey slush and wet asphalt shows between.
const SNOW_MAIN = /* glsl */`
#ifndef SNOW_SKIP
if (uSnow > 0.001) {
  vec3 sp = vWetP;
  // (a dusting only on the level, a real cover, ~10 cm and more, on every slope up to ~60 deg: then no ground shows)
  float sDeep = smoothstep(0.03, 0.12, uSnowDepth);
  float sUp = smoothstep(mix(0.32, 0.22, sDeep), mix(0.78, 0.5, sDeep), wetGeoN.y);
  // (under a high canopy, a forest's crowns 10 m and more up, about half the snow still sifts through to the floor;
  // under low crowns and eaves 2-4 m up a little blows in: a patchy dusting thinning towards the trunk or the wall)
  float sGap = rainTop(sp.xz) - sp.y;
  float sOpen = max(max(wetOpen(sp), 0.12), max(0.5 * smoothstep(10.0, 14.0, sGap), 0.28 * smoothstep(1.6, 4.0, sGap)));   // (some always sifts in: patches)
  float sn = wetNoise(sp.xz * 0.7) * 0.55 + wetNoise(sp.xz * 2.9 + 7.1) * 0.3 + wetNoise(sp.xz * 11.0 + 3.3) * 0.15;
  float sVal = sUp * sOpen * (0.62 + 0.38 * sn) * SNOW_K;
  float sTh = 1.0 - uSnow;
  float sc = smoothstep(sTh, sTh + 0.12, sVal);
#ifdef WET_ROAD
  // wheels, feet and the plough: slush in patches (at most ~4/5 cover), wet dark asphalt between
  sc *= 0.2 + 0.6 * smoothstep(0.35, 0.75, wetNoise(sp.xz * 0.45 + 4.0));
  diffuseColor.rgb *= 1.0 - 0.3 * uSnow * sOpen;
  roughnessFactor *= 1.0 - 0.45 * uSnow * sOpen;
#endif
  // footprints and tyre tracks: pressed into a thin, packed layer (a thin cover lets the ground show through them)
  vec4 sTr = trailAt(sp.xz) * sUp;
  sc *= 1.0 - 0.6 * sTr.r;
  // snow is opaque: where it lies only in part it lies in flakes and patches with the ground between, never as a
  // see-through white film (the part covered becomes a share of fine, crisp patches; far off, a few pixels, it blends)
#if !defined(WET_LEAF) || defined(WET_GLASS)
  float sFine = wetNoise(sp.xz * 23.0 + 1.7) * 0.6 + wetNoise(sp.xz * 61.0 + 5.3) * 0.4;
  float sCrisp = smoothstep(0.08 + 0.84 * sFine - 0.06, 0.08 + 0.84 * sFine + 0.06, sc);
  sc = mix(sCrisp, sc, smoothstep(12.0, 30.0, length(sp - cameraPosition)));
#endif
  sc *= min(1.0, SNOW_K * 1.6);
#ifndef WET_ROAD
  // a blizzard plasters snow on the faces turned to the wind: trunks, poles, walls, fences, windows, in streaks
  if (uSnowPlaster > 0.001) {
    float wf = dot(wetGeoN.xz, -uSnowWindDir) * (1.0 - abs(wetGeoN.y));
    // (a crust in streaks and flecks; bark takes it best, a painted fence or a wall only in a real blizzard)
    float pa = dot(sp.xz, vec2(-uSnowWindDir.y, uSnowWindDir.x));
    float pn = wetNoise(vec2(pa * 3.0, sp.y * 1.2)) * 0.4 + wetNoise(vec2(pa * 9.0, sp.y * 4.0) + 3.1) * 0.35 + wetNoise(sp.xz * 7.0 + sp.y * 5.0) * 0.25;
    float pl = smoothstep(0.15, 0.7, wf) * (0.15 + 0.85 * pn) * min(1.0, SNOW_K * 1.6) * PLASTER_K;
    sc = max(sc, smoothstep(1.0 - uSnowPlaster, 1.06 - uSnowPlaster, pl));
  }
#endif
#ifdef WET_GLASS
  // (the car you drive: its wipers and its heater keep the windows clear)
  if (uSnowCar.w > 0.5) {
    vec2 gc = sp.xz - uSnowCar.xy, gs = vec2(cos(uSnowCar.z), sin(uSnowCar.z));
    vec2 gq = abs(vec2(dot(gc, vec2(gs.x, -gs.y)), dot(gc, gs.yx))) - uSnowCarSize - 0.1;
    if (max(gq.x, gq.y) < 0.0 && sp.y < uSnowCarY.x + uSnowCarY.y + 0.3) sc = 0.0;
  }
#endif
  if (sc > 0.002) {
    vec3 snowCol = vec3(0.87, 0.9, 0.94) * (0.93 + 0.07 * sn) * (1.0 - 0.1 * sTr.r);
#ifdef WET_ROAD
    snowCol = mix(vec3(0.5, 0.51, 0.52), snowCol, smoothstep(0.35, 0.8, sn));
#endif
    diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, sc);
#ifdef WET_GLASS
    diffuseColor.a = mix(diffuseColor.a, 1.0, sc);      // (snow on a windscreen is opaque: never a see-through white film)
#endif
    roughnessFactor = mix(roughnessFactor, 0.82, sc);
    metalnessFactor = mix(metalnessFactor, 0.0, sc);
    // smoother than what it covers, lumpy at the decimetre scale
    vec2 sg = vec2(wetNoise(sp.xz * 4.0 + 0.5) - wetNoise(sp.xz * 4.0 - 0.5), wetNoise(sp.zx * 4.0 + 0.5) - wetNoise(sp.zx * 4.0 - 0.5)) * 0.3;
    normal = normalize(mix(normal, normalize((viewMatrix * vec4(sg.x, 1.0, sg.y, 0.0)).xyz), sc * 0.75 * sUp));
#if !defined(WET_LEAF) && !defined(WET_ROAD)
    // crystals glinting on the fresh cover (not on the trodden slush): after the lights, where the sun reaches
    snowGlintK = smoothstep(0.6, 1.0, sc) * sUp * (1.0 - sTr.r) * (1.0 - smoothstep(6.0, 18.0, length(sp - cameraPosition)));
#endif
  }
}
#endif
`;

// the glints, lit by the sun (or the moon) where its shadow lets it through (lighting.js: CSM_SHADOW)
const GLINT_MAIN = /* glsl */`
#if NUM_DIR_LIGHTS > 0
if (snowGlintK > 0.001) {
  float gSh = 1.0;
#ifdef CSM_SHADOW
  gSh = receiveShadow ? csmShadow : 1.0;
#endif
  reflectedLight.directSpecular += directionalLights[0].color * (gSh * snowGlintK * 6.0 * snowGlint(vWetP, normal, directionalLights[0].direction, normalize(-vViewPosition)));
}
#endif
`;

function injectWet(sh, kind, opaque, snowK, snowSkip, plasterK, glass = false, cut = false, mudK = 0, grassK = 0) {
  const v = sh.vertexShader, f = sh.fragmentShader;
  if (v.includes('vWetP')) return;                 // already in (a material cloned from a patched one keeps its hook)
  if (!v.includes('#include <project_vertex>') || !f.includes('#include <normal_fragment_maps>') || !f.includes('#include <normal_fragment_begin>') || !f.includes('#include <lights_physical_fragment>') || !f.includes('#include <lights_fragment_end>')) return;
  Object.assign(sh.uniforms, RAIN, SNOW);
  sh.vertexShader = v.replace('#include <common>', '#include <common>\nvarying vec3 vWetP;').replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wetW = vec4(transformed, 1.0);
#ifdef USE_BATCHING
    wetW = batchingMatrix * wetW;
#endif
#ifdef USE_INSTANCING
    wetW = instanceMatrix * wetW;
#endif
    vWetP = (modelMatrix * wetW).xyz; }`);
  const def = (kind === 'road' ? '#define WET_ROAD\n' : kind === 'leaf' ? '#define WET_LEAF\n' : kind === 'ground' ? '#define WET_GROUND\n' : '') + (opaque ? '#define WET_OUT\n' : '') + `#define MUD_K ${mudK.toFixed(2)}\n#define GRASS_K ${grassK.toFixed(2)}\n` +
    `#define SNOW_K ${snowK.toFixed(3)}\n#define PLASTER_K ${plasterK.toFixed(2)}\n` + (snowSkip ? '#define SNOW_SKIP\n' : '') + (glass ? '#define WET_GLASS\n' : '') + (cut ? '#define CABIN_CUT\n' : '');
  // (V101: the street lamps' light, lamps.js: shadowed by the height map, and sparkling on fresh snow)
  const lampDef = '#define LAMP_OCC\n#define LAMP_GLINT(c, l) if (snowGlintK > 0.001) reflectedLight.directSpecular += (c) * (snowGlintK * 6.0 * snowGlint(vWetP, normal, (l), normalize(-vViewPosition)));\n';
  sh.fragmentShader = f.replace('#include <common>', '#include <common>\n' + def + lampDef + WET_PARS + GLINT_GLSL + LAMP_OCC_GLSL)
    // (a leaf of a bush or a tree a car stands in: not inside the car you are in - as the rain and the snow are not)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n#ifdef CABIN_CUT\n  if (inCar(vWetP)) discard;\n#endif')
    .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nvec3 wetGeoN = inverseTransformDirection(normal, viewMatrix);')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WET_MAIN + SNOW_MAIN)
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + GLINT_MAIN)
    // opaque surfaces write their reflectivity into the (otherwise always 1) alpha of the scene buffer
    .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n#ifdef WET_OUT\n  gl_FragColor.a = 1.0 - wetReflOut;\n#endif');
}

// Make a standard / physical material react to the rain (its own onBeforeCompile, if any, runs first).
// Road surfaces are tagged with userData.wet = 'road' (the clones of M.asphalt, M.pavers, M.concrete inherit it).
const patched = new WeakSet();
export function wetMaterial(m) {
  if (!m || patched.has(m)) return;
  patched.add(m);
  if (!m.isMeshStandardMaterial || m.userData.noWet) return;
  const kind = m.userData.wet === 'road' ? 'road' : (m.alphaTest > 0 || m.transparent) ? 'leaf' : m.userData.wet === 'ground' ? 'ground' : 'solid';
  // userData.snow: how much of it gets covered (leaf cards and the trees' far billboards only partly); noSnow: never
  // (userData.glass: a car's windows - the snow lies on a windscreen as on the bonnet, opaque)
  const glass = !!m.userData.glass;
  const snowK = m.userData.snow ?? (kind === 'leaf' && !glass ? 0.45 : 1), snowSkip = !!m.userData.noSnow;
  const plasterK = m.userData.bark ? 1 : 0.45;                 // (how well a blizzard's snow sticks: bark best)
  const key0 = m.customProgramCacheKey();
  const prev = m.onBeforeCompile;
  const opaque = !m.transparent;
  // (leaf cards, not a car's own glass, lenses or badges: buildCar tags its materials)
  const cut = kind === 'leaf' && !glass && !m.userData.car;
  const mudK = m.userData.mud ?? 0, grassK = m.userData.grass ?? 0;   // (bare earth that takes a print in the mud; grass: V92)
  m.onBeforeCompile = function (sh, r) { prev.call(this, sh, r); injectWet(sh, kind, opaque, snowK, snowSkip, plasterK, glass, cut, mudK, grassK); };
  m.customProgramCacheKey = () => key0 + '|wet-' + kind + (opaque ? '-o' : '') + (glass ? 'g' : '') + (cut ? 'c' : '') + '|s' + snowK.toFixed(2) + (snowSkip ? 'x' : '') + '|p' + plasterK + '|m' + mudK + grassK;
  m.needsUpdate = true;
}
export function wetScene(root) {
  root.traverse((o) => {
    if (!o.material) return;
    if (Array.isArray(o.material)) o.material.forEach(wetMaterial); else wetMaterial(o.material);
  });
}

// ------------------------------------------------------------------ the height map seen from above
const OCC_VERT = /* glsl */`
uniform float uRef;
varying float vH;
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  p = modelMatrix * p;
  vH = p.y - uRef;
  gl_Position = projectionMatrix * viewMatrix * p;
}`;
const OCC_FRAG = /* glsl */`
varying float vH;
void main() { gl_FragColor = vec4(vH, 0.0, 0.0, 1.0); }`;

// The snow's shape (the lying snow, SnowBlanket): baked from the height maps seen from above and from below (the
// ground under everything) and the roads, every time those are re-rendered. Per texel: R the surface the snow lies on
// (relative height, as the maps), G how much of the depth lies there (x SNOW.uSnowDepth), B the open surface around
// averaged over ~2 m (where a deep cover lies: it fills the steps).
const BAKE_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BAKE_FRAG = /* glsl */`
uniform sampler2D uTop, uLow, uRoad, uSolid;
uniform vec4 uOccBox;
uniform vec2 uWind;
uniform float uSnowPlaster;                                       // (how much of a blizzard has blown: bigger drifts)
varying vec2 vUv;
float bHash(vec2 p) { vec3 q = fract(vec3(mod(p, 4096.0).xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }   // (as rainHash)
float bNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), f.x), mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 at(vec2 d) { return vUv + vec2(d.x, -d.y) / (2.0 * uOccBox.z); }          // the texel d metres (x, z) away
float topH(vec2 uv) { return texture2D(uTop, uv).r; }                       // (the sky's lid: leaves and needles too)
float solH(vec2 uv) { return texture2D(uSolid, uv).r; }                     // (what the snow can lie on or pile against)
float lowH(vec2 uv) { return texture2D(uLow, vec2(uv.x, 1.0 - uv.y)).r; }    // (seen from below: mirrored)
// an obstacle the wind blows the snow against: 0.35-3 m over the ground (fences, walls, cars, rocks; not a shrub's
// twigs or a sapling's needles, which it blows through)
float obstacle(vec2 uv) { float r = solH(uv) - lowH(uv); return smoothstep(0.35, 1.0, r) * (1.0 - smoothstep(2.8, 4.0, r)); }
void main() {
  vec2 p = uOccBox.xy + vec2(vUv.x - 0.5, 0.5 - vUv.y) * 2.0 * uOccBox.z;
  float h = solH(vUv), g = lowH(vUv);
  // open to the sky down to (nearly) the ground: not under a roof, eaves, a car, a bridge deck, a spruce. The snow lies
  // on the solid top surface there (ground, road, kerb, step: never on a sapling's or a shrub's branches); where it
  // does not, on the open surface next to it. Under a high canopy (a forest's crowns, 10 m and more up) about half of
  // it still reaches the floor.
  float open = 0.0, baseSum = 0.0, ow = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 uv = at(vec2(float(i), float(j)) * 0.35);
    float t = topH(uv), sl = solH(uv), l = lowH(uv), o = step(t - l, 0.6), c = 0.45 * smoothstep(10.0, 14.0, t - l);
    float b = sl - l < 0.6 ? sl : l;
    open += o + c; baseSum += (o + c) * b; ow += o + c;
  }
  float base = h - g < 0.6 ? h : ow > 0.0 ? baseSum / ow : g;
  // ... and the open surface around, averaged over ~2 m: a deep cover fills the steps (kerbs, plinths, ditches) and
  // rounds them over instead of following them
  float wide = 0.0, wn = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 uv = at(vec2(float(i), float(j)) * 0.45);
    float t = topH(uv), sl = solH(uv), l = lowH(uv), o = (step(t - l, 0.6) + 0.45 * smoothstep(10.0, 14.0, t - l)) * (1.0 - 0.12 * float(i * i + j * j));
    wide += o * (sl - l < 0.6 ? sl : l); wn += o;
  }
  wide = wn > 0.0 ? wide / wn : base;
  open /= 9.0;
  // the wind's work: dunes across it (~3 m apart, ~10 m long), lumps, and rounded mounds over what lies buried
  // (tussocks, stones, low shrubs)
  vec2 w = uWind, wp = vec2(dot(p, w), dot(p, vec2(-w.y, w.x)));
  float gale = 1.0 + 1.3 * uSnowPlaster;
  float f = 1.0 + 0.6 * gale * (bNoise(vec2(wp.x * 0.33, wp.y * 0.1)) - 0.5) + 0.5 * (bNoise(p * 0.5 + 3.1) - 0.5) + 0.2 * (bNoise(p * 1.7 + 7.7) - 0.5);
  vec2 cell = floor(p * 0.62);
  for (int j = 0; j <= 1; j++) for (int i = 0; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j)) - 0.5, r = vec2(bHash(c + 0.7), bHash(c + 5.3));
    vec2 m = (c + 0.2 + 0.6 * r) / 0.62;
    float rad = 0.35 + 0.5 * bHash(c + 9.1), q = clamp(1.0 - dot(p - m, p - m) / (rad * rad), 0.0, 1.0);
    f += step(0.6, bHash(c + 2.9)) * (0.25 + 0.4 * r.x) * q * q;
  }
  // drifts in the lee of the obstacles (the snow the wind carries settles behind them: a long rounded tail that rises
  // from the obstacle's foot to its crest ~1.5 m back and dies out ~5 m back), scoured on their windward side
  float lee = 0.0, scour = 0.0;
  for (int k = 1; k <= 10; k++) { float d = float(k) * 0.5; lee = max(lee, obstacle(at(-w * d)) * smoothstep(0.0, 1.5, d) * (1.0 - smoothstep(1.5, 5.5, d))); }
  for (int k = 1; k <= 2; k++) scour = max(scour, obstacle(at(w * float(k) * 0.35)));
  f += 1.2 * gale * lee - 0.45 * gale * scour;
  // roads: the wheels pack it to a thin layer (the slush of the cover shows), ploughed up into low banks along the
  // edges that slope down to the asphalt over ~1 m (the road mask blurred over ±1.1 m)
  float road = 0.0, rw = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    float k = 1.0 - 0.1 * float(i * i + j * j);
    road += k * texture2D(uRoad, at(vec2(float(i), float(j)) * 0.55)).r; rw += k;
  }
  road /= rw;
  float core = smoothstep(0.2, 0.85, road), bank = smoothstep(0.0, 0.18, road) * (1.0 - smoothstep(0.18, 0.5, road));
  f = f * (1.0 - core) + 0.3 * bank * (1.0 - core);
  f *= smoothstep(0.15, 0.85, open);                                             // thinning into the shelter
  gl_FragColor = vec4(base, max(f, 0.0), wide, 1.0);
}`;
// the shape and the open surface around (G, B) smoothed over ~±1 m, in two passes: the drifts, mounds and banks come out
// rounded, without ridges or corners (R, the surface it lies on, stays sharp: kerbs and steps)
const SMOOTH_FRAG = /* glsl */`
uniform sampler2D uSrc;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uSrc, vUv);
  vec2 a = vec2(0.0);
  float w = 0.0;
  for (int i = -4; i <= 4; i++) { float k = exp(-float(i * i) / 8.0); a += texture2D(uSrc, vUv + uStep * float(i)).gb * k; w += k; }
  gl_FragColor = vec4(c.r, a / w, 1.0);
}`;
// the snow's wind (downwind, world x / z: the flakes drift the same way): the crivăț from the north-east, which
// brings the blizzards of Muntenia (the map is turned 42 deg: north-east to south-west is world -z)
const SNOW_WIND = new THREE.Vector2(0.052, -0.9986).normalize();

const _cc = new THREE.Color();
export class RainOcclusion {
  constructor(size = 512, half = 48) {
    this.half = half; this.size = size;
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: true });
    this.cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 1500);
    this.cam.rotation.set(-Math.PI / 2, 0, 0);                 // looking straight down: screen right = +x, up = -z
    this.viewCam = new THREE.PerspectiveCamera();               // (where you stand: the levels of detail chosen from it)
    this.mat = new THREE.ShaderMaterial({ vertexShader: OCC_VERT, fragmentShader: OCC_FRAG, uniforms: { uRef: { value: 0 } }, side: THREE.DoubleSide });
    RAIN.uOcc.value = this.rt.texture;
    this.last = new THREE.Vector2(1e9, 1e9);
    this.frame = 0;
    this.snow = null; this.snowOn = false;
    this.roads = [];                                             // (main.js: the map's roads, for the snow)
  }

  // the snow's maps (made with the first snow): the lowest surface seen from below (the ground under everything), the
  // roads near the camera, and the lying snow's shape baked from them
  initSnow() {
    const { size, half } = this;
    const rt = (depth) => new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: depth });
    const camLow = new THREE.OrthographicCamera(-half, half, half, -half, 1, 1500);
    camLow.rotation.set(Math.PI / 2, 0, 0);                      // looking straight up: screen right = +x, up = +z
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const roadTex = new THREE.CanvasTexture(canvas);
    roadTex.colorSpace = THREE.NoColorSpace; roadTex.generateMipmaps = false; roadTex.minFilter = THREE.LinearFilter;
    const low = rt(true), solid = rt(true), field = rt(false), field2 = rt(false);
    const bake = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uTop: { value: this.rt.texture }, uSolid: { value: solid.texture }, uLow: { value: low.texture }, uRoad: { value: roadTex }, uOccBox: RAIN.uOccBox, uWind: { value: SNOW_WIND }, uSnowPlaster: SNOW.uSnowPlaster } });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bake); quad.frustumCulled = false;
    const qs = new THREE.Scene(); qs.add(quad);
    const smooth = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: SMOOTH_FRAG, depthTest: false, depthWrite: false, uniforms: { uSrc: { value: null }, uStep: { value: new THREE.Vector2() } } });
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), smooth); sq.frustumCulled = false;
    const ss = new THREE.Scene(); ss.add(sq);
    this.snow = { low, solid, field, field2, smooth, ss, camLow, canvas, ctx: canvas.getContext('2d'), roadTex, qs, qc: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    SNOW.uSnowField.value = field.texture;
    RAIN.uRoad.value = roadTex; RAIN.uLow.value = low.texture;       // (what a drop lands on: the splashes, V92)
  }

  // the roads around (cx, cz), white on black, as wide as they are (the snow's bake blurs the edges)
  drawRoads(cx, cz) {
    const S = this.snow, n = S.canvas.width, k = n / (2 * this.half), g = S.ctx;
    const x0 = cx - this.half, z0 = cz - this.half, x1 = cx + this.half, z1 = cz + this.half;
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of this.roads) {
      if (r.x1 < x0 - r.w || r.x0 > x1 + r.w || r.z1 < z0 - r.w || r.z0 > z1 + r.w) continue;
      g.lineWidth = r.w * k;
      g.beginPath();
      for (let i = 0; i < r.p.length; i += 2) { const px = (r.p[i] - x0) * k, py = (r.p[i + 1] - z0) * k; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
      g.stroke();
    }
    S.roadTex.needsUpdate = true;
  }

  // re-rendered when the camera has moved 6 m, else every 30 frames (cars and dogs move); skip(mesh): left out too
  // (in winter the bare broadleaf crowns let the snow through). snow: the lying snow's maps too (and at once when it
  // begins); soft(object): what the snow does not lie on in a layer nor pile against (leaves, needles, twigs, cards);
  // maps: the maps seen from below and of the solid surfaces without the snow's (the running water, runoff.js; the
  // driven rain's lee). The box moves in steps of 16 texels (3 m), so what is worked out on it can be carried over.
  // Returns true when re-rendered.
  update(renderer, scene, camPos, groundY, hide, skip, snow = false, soft = null, maps = false) {
    this.frame++;
    const want = snow || maps, fresh = (snow && !this.snowOn) || (want && !this.mapsOn);
    this.snowOn = snow; this.mapsOn = want;
    if (!fresh && Math.hypot(camPos.x - this.last.x, camPos.z - this.last.y) < 6 && this.frame % 30) return false;
    const snap = 32 * this.half / this.size, cx = Math.round(camPos.x / snap) * snap, cz = Math.round(camPos.z / snap) * snap;
    this.last.set(camPos.x, camPos.z);
    this.cam.position.set(cx, Math.max(camPos.y, groundY) + 600, cz);
    this.cam.updateMatrixWorld();
    this.mat.uniforms.uRef.value = groundY;
    RAIN.uOccBox.value.set(cx, cz, this.half, groundY);
    const rt0 = renderer.getRenderTarget(), bg = scene.background, ov = scene.overrideMaterial, sm = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(_cc); const ca = renderer.getClearAlpha();
    if (skip) scene.traverse((o) => { if (o.isMesh && o.visible && skip(o)) hide = [...hide, o]; });
    const vis = hide.map(o => o.visible);
    for (const o of hide) o.visible = false;
    scene.background = null; scene.overrideMaterial = this.mat; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);                         // (nothing drawn: taken as the ground near the camera)
    renderer.clear();
    scene.updateMatrixWorld();                                    // (the scene does not update itself: main.js)
    // (V110) every level of detail as the view has it - the terrain's chunks, chosen from where you stand: seen from these
    // cameras, 600 m away, three.js picked the coarsest near level for each (10 m cells on Înaltă, 25 m on Scăzută, for
    // the view's 5-10 m), and on the hills the ground the snow lies on came out 1-3 m under the ground drawn: the lying
    // snow sank out of sight round you, bare cover in a patch about you with the snow's edge round it
    this.viewCam.position.copy(camPos); this.viewCam.updateMatrixWorld();
    const lods = [];
    scene.traverse((o) => { if (o.isLOD && o.autoUpdate) { o.update(this.viewCam); o.autoUpdate = false; lods.push(o); } });
    renderer.render(scene, this.cam);
    if (want) {
      if (!this.snow) this.initSnow();
      const S = this.snow;
      S.camLow.position.set(cx, groundY - 600, cz);
      S.camLow.updateMatrixWorld();
      renderer.setRenderTarget(S.low);
      renderer.clear();
      renderer.render(scene, S.camLow);
      // the solid surfaces seen from above
      const off = [];
      if (soft) scene.traverse((o) => { if (o.visible && soft(o)) off.push(o); });
      for (const o of off) o.visible = false;
      renderer.setRenderTarget(S.solid);
      renderer.clear();
      renderer.render(scene, this.cam);
      for (const o of off) o.visible = true;
      scene.overrideMaterial = ov;
      this.drawRoads(cx, cz);
      RAIN.uSurfOn.value = 1;
    }
    if (snow) {
      const S = this.snow;
      renderer.setRenderTarget(S.field);
      renderer.render(S.qs, S.qc);
      // smoothed: across, then along (~0.28 m a tap, 9 taps)
      const u = S.smooth.uniforms, st = 1.5 / this.size;
      u.uSrc.value = S.field.texture; u.uStep.value.set(st, 0);
      renderer.setRenderTarget(S.field2); renderer.render(S.ss, S.qc);
      u.uSrc.value = S.field2.texture; u.uStep.value.set(0, st);
      renderer.setRenderTarget(S.field); renderer.render(S.ss, S.qc);
    }
    renderer.setRenderTarget(rt0);
    renderer.setClearColor(_cc, ca);
    scene.background = bg; scene.overrideMaterial = ov; renderer.shadowMap.autoUpdate = sm;
    hide.forEach((o, i) => { o.visible = vis[i]; });
    for (const o of lods) o.autoUpdate = true;
    RAIN.uOccOn.value = 1;
    return true;
  }

  // is (x, z) on a road (within its width)? For the wheels and feet in deep snow (main.js)
  onRoad(x, z) {
    for (const r of this.roads) {
      const hw = r.w / 2;
      if (x < r.x0 - hw || x > r.x1 + hw || z < r.z0 - hw || z > r.z1 + hw) continue;
      const P = r.p;
      for (let i = 0; i < P.length - 2; i += 2) {
        const ax = P[i], az = P[i + 1], dx = P[i + 2] - ax, dz = P[i + 3] - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (Math.hypot(x - ax - t * dx, z - az - t * dz) < hw) return true;
      }
    }
    return false;
  }
}

// the map's roads for the snow (geo GEO.roads: flat x, z lists and widths; not the tunnels)
export function snowRoads(roads) {
  const out = [];
  for (const r of roads || []) {
    if (r.tu || !r.p || r.p.length < 4) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < r.p.length; i += 2) { x0 = Math.min(x0, r.p[i]); x1 = Math.max(x1, r.p[i]); z0 = Math.min(z0, r.p[i + 1]); z1 = Math.max(z1, r.p[i + 1]); }
    out.push({ p: r.p, w: r.w || 5, x0, z0, x1, z1 });
  }
  return out;
}

// ------------------------------------------------------------------ the snow's flight seen from upwind
// An orthographic map looking the way the flakes fly (the wind and their ~1 m/s fall), of what stands in their way:
// walls, roofs, fences, cars, trunks, rocks. Not the ground (the air follows it over the hills), nor the leaves, the
// needles, a chain-link fence (it blows through them). Per texel: how far along the flight the first of them stands.
// A flake further along than that is behind it (the flake and drift shaders, LEE_GLSL).
const LEE_VERT = /* glsl */`
uniform sampler2D uLow;
uniform vec4 uOccBox;
uniform vec3 uLeeOrg, uLeeDir;
varying float vD, vH;
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  p = modelMatrix * p;
  vD = dot(p.xyz - uLeeOrg, uLeeDir);
  // its height over the ground (the map seen from below); off that map nothing counts
  vec2 uv = vec2(0.5 + (p.x - uOccBox.x) / (2.0 * uOccBox.z), 0.5 - (p.z - uOccBox.y) / (2.0 * uOccBox.z));
  vH = all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0))) ? p.y - uOccBox.w - texture2D(uLow, vec2(uv.x, 1.0 - uv.y)).r : -1.0;
  gl_Position = projectionMatrix * viewMatrix * p;
}`;
const LEE_FRAG = /* glsl */`
varying float vD, vH;
void main() {
  if (vH < 0.12) discard;                                     // (the ground, the roads, what lies flat on them)
  gl_FragColor = vec4(vD, 0.0, 0.0, 1.0);
}`;
const _lv = new THREE.Vector3(), _lr = new THREE.Vector3(), _lu = new THREE.Vector3(), _lc = new THREE.Vector3(), _ls = new THREE.Sphere();
export class SnowLee {
  constructor(w = 1024, h = 512) {
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true });
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.mat = new THREE.ShaderMaterial({ vertexShader: LEE_VERT, fragmentShader: LEE_FRAG, uniforms: { uLow: { value: null }, uOccBox: RAIN.uOccBox, uLeeOrg: SNOW.uLeeOrg, uLeeDir: SNOW.uLeeDir }, side: THREE.DoubleSide });
    SNOW.uLee.value = this.rt.texture;
    this.dir = new THREE.Vector3(0, -1, 0);
    this.last = new THREE.Vector3(1e9, 0, 0); this.lastDir = new THREE.Vector3(); this.frame = 0;
  }

  // made again when you have moved 3 m or the flight has turned 1.5 deg (the gusts), else every 40 frames (the cars
  // come and go); hide: left out always, skip(object): left out too; low: the ground seen from below (RainOcclusion);
  // fall: how fast what flies falls (m/s: the flakes ~1, the drops ~7)
  update(renderer, scene, camPos, hide, skip, low, dt, fall = 1) {
    const w = STORM.uWind.value;
    _lv.set(w.x, -fall, w.y).normalize();
    // (over ~2 s: the flakes' own past flight; the heavy drops follow the gusts within ~0.7 s)
    this.dir.lerp(_lv, SNOW.uLeeOn.value && this.fall === fall ? 1 - Math.exp(-dt / (fall > 2 ? 0.7 : 2)) : 1).normalize();
    this.fall = fall;
    this.frame++;
    if (SNOW.uLeeOn.value && camPos.distanceTo(this.last) < 3 && this.dir.angleTo(this.lastDir) < 0.026 && this.frame % 40) return;
    this.last.copy(camPos); this.lastDir.copy(this.dir);
    // the box the flakes and the drops fill (SnowFX, RainFX: up to 34 m around you, ~10 m under the eye to 16 m over
    // it), seen along the flight
    const f = this.dir;
    _lr.crossVectors(f, THREE.Object3D.DEFAULT_UP);
    if (_lr.lengthSq() < 1e-6) _lr.set(1, 0, 0); else _lr.normalize();
    _lu.crossVectors(_lr, f);
    let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity, f0 = Infinity, f1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      _lc.set(i & 1 ? 34 : -34, i & 2 ? 16 : -10.5, i & 4 ? 34 : -34);
      const a = _lc.dot(_lr), b = _lc.dot(_lu), c = _lc.dot(f);
      r0 = Math.min(r0, a); r1 = Math.max(r1, a); u0 = Math.min(u0, b); u1 = Math.max(u1, b); f0 = Math.min(f0, c); f1 = Math.max(f1, c);
    }
    // from 16 m further upwind (what stands there shelters the near side of the box; further out the ground under it is
    // off the map seen from below, so nothing there would count)
    const cam = this.cam;
    cam.position.copy(camPos).addScaledVector(f, f0 - 16);
    cam.up.copy(_lu);
    _lc.copy(cam.position).add(f);
    cam.lookAt(_lc);
    Object.assign(cam, { left: r0, right: r1, bottom: u0, top: u1, near: 0.1, far: f1 - f0 + 18 });
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    SNOW.uLeeOrg.value.copy(cam.position); SNOW.uLeeDir.value.copy(f);
    SNOW.uLeeVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.mat.uniforms.uLow.value = low;
    const rt0 = renderer.getRenderTarget(), bg = scene.background, ov = scene.overrideMaterial, sm = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(_cc); const ca = renderer.getClearAlpha();
    // (and what stands off that map altogether: it would only be drawn to be thrown away)
    const off = [...hide], ob = RAIN.uOccBox.value;
    scene.traverse((o) => {
      if (!o.visible) return;
      if (skip(o)) { off.push(o); return; }
      if (o.isMesh && !o.isInstancedMesh && o.geometry) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        _ls.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
        if (Math.abs(_ls.center.x - ob.x) > ob.z + _ls.radius || Math.abs(_ls.center.z - ob.y) > ob.z + _ls.radius) off.push(o);
      }
    });
    const vis = off.map(o => o.visible);
    for (const o of off) o.visible = false;
    scene.background = null; renderer.shadowMap.autoUpdate = false;
    const ac = renderer.autoClear; renderer.autoClear = false;
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1); renderer.clear();
    this.clearQuad ??= (() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: 'void main() { gl_FragColor = vec4(1e4, 0.0, 0.0, 1.0); }', depthTest: false, depthWrite: false })); m.frustumCulled = false; const sc = new THREE.Scene(); sc.add(m); return sc; })();
    renderer.render(this.clearQuad, cam);                       // (nothing in the way: far)
    scene.overrideMaterial = this.mat;
    renderer.render(scene, cam);
    this.stats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };    // (what a refresh draws)
    renderer.autoClear = ac;
    renderer.setRenderTarget(rt0);
    renderer.setClearColor(_cc, ca);
    scene.background = bg; scene.overrideMaterial = ov; renderer.shadowMap.autoUpdate = sm;
    off.forEach((o, i) => { o.visible = vis[i]; });
    SNOW.uLeeOn.value = 1;
  }

  off() { SNOW.uLeeOn.value = 0; }
}

// ------------------------------------------------------------------ falling rain and splashes
// (V122) The drops, as drops. A falling drop is a small ball lens of water (n = 1.333): a ray entering it at a share rho
// of its radius off its middle leaves it turned by 2 (asin rho - asin(rho / n)) towards the far side - up to 83 deg at
// its rim, a field of view of ~165 deg (Garg & Nayar 2004, "Photometric model of a rain drop"). So it shows, small and
// turned over, the scene behind it in its middle, the bright sky round its lower rim and the ground round its upper one,
// and a little of everything mirrored at its edge (Fresnel): its brightness hardly depends on what is behind it, it is
// "typically brighter than its background" (ibid.) - and against the sky it hardly shows. The big ones are flattened
// underneath (Beard & Chuang 1987: axis ratio ~0.93 at 2 mm, ~0.71 at 5 mm), never tear-shaped.
// Each drop is drawn as what one exposure takes of it: its disc moving down its path, over each pixel for the share of
// the exposure it covers it (worked out exactly), blurred by the pupil when it is nearer or further than the eye's
// focus (eye.js), blended over the frame (not added on). The exposure: half a frame (a 180 deg shutter, ~8 ms at 60
// fps). Before V122 each drop drew the ~45 ms the retina holds an image (60-90 ms: Rousseau et al. 2006) - but the eye
// that watches the screen holds it again on top: lines.
// In the nearest layer each pixel of a drop is worked out as the lens it is, from the frame itself (TAA's resolve, drawn
// before the rain: taa.js FXSRC) and, where its rays leave the view, the sky's light (the IBL map); further out, where a
// drop is under a pixel, from its mean: the sky and the ground round its rim, what is behind it through its middle.
const SEEN_GLSL = /* glsl */`
uniform sampler2D uEnv, uScene;
uniform float uEnvOn, uEnvK, uSceneOn;
uniform vec3 uEnvFlat;
#include <cube_uv_reflection_fragment>
// the light coming along r (world): the frame where r is in view (the scene as drawn, before the rain); out of view, the
// frame's nearest edge stands for what is there (the street, the houses and the trees go on past it) - but for the open
// sky overhead and what is behind you: the sky's light map (the sky; the ground under the horizon)
vec3 seen(vec3 r, float rough) {
  vec3 c = uEnvFlat;
#ifdef ENVMAP_TYPE_CUBE_UV
  if (uEnvOn > 0.5) c = textureCubeUV(uEnv, r, rough).rgb;
#endif
  c *= uEnvK;
  if (uSceneOn > 0.5) {
    vec4 cl = projectionMatrix * (viewMatrix * vec4(r, 0.0));
    if (cl.w > 1e-4) {
      vec2 uv = cl.xy / cl.w * 0.5 + 0.5, ed = abs(uv - 0.5) * 2.0;
      float k = max(1.0 - smoothstep(0.86, 0.99, max(ed.x, ed.y)), 1.0 - smoothstep(0.15, 0.55, r.y));
      if (k > 0.0) c = mix(c, texture2D(uScene, clamp(uv, 0.002, 0.998)).rgb, k);
    }
  }
  return c;
}`;
const DROP_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aSeed;
uniform float uRain, uRainTime, uOccOn, uRadius, uHeight, uSpeed, uCurtain, uGale, uGain;
uniform float uRate, uPx, uExpo;     // the rain rate (mm/h); the camera's angle per pixel; the exposure (s)
uniform float uGlint;                // (how much a lit drop sends on: its glint's share of the light, for the exposure)
uniform vec4 uLamps[6];              // street lamp heads near you (w: how bright)
uniform vec4 uCarL, uCarLDir;        // the headlights of the car you drive (w: on) and their axis (w: cos of the cone)
uniform sampler2D uOcc;
uniform vec4 uOccBox;
uniform vec2 uWind, uWindOff;        // the wind now and how far it has carried the air so far (no jumps when it changes)
uniform vec2 uAxis;                  // the wind's mean bearing (unit): the patterns carried on the air keep it
uniform vec2 uAirOff;                // how far the air has carried the squall's sheets of rain (main.js: the haze's own)
uniform vec3 uCam;
uniform vec4 uTorch, uTorchDir;      // torch position (w: on) and direction (w: cos of the cone)
uniform vec4 uBeam, uBeamDir;        // the moon's shaft: a point on its axis (w: radius) and the axis (w: on)
uniform sampler2D uEyeProbe;         // (eye.js: the eye's focus in dioptres, its pupil in metres)
uniform float uEyeProbeW;
varying float vA, vM, vAr, vSharp, vOsc, vAmp;
varying vec2 vQ, vUp;
varying vec3 vSky, vGnd, vGlint, vVd, vSide, vAlong;
${OCC_GLSL}
${LEE_GLSL}
${SEEN_GLSL}
void main() {
  vQ = vec2(0.0); vUp = vec2(0.0, -1.0); vA = 0.0; vM = 0.0; vAr = 1.0; vSharp = 0.0; vOsc = 0.0; vAmp = 0.0;
  vSky = vec3(0.0); vGnd = vec3(0.0); vGlint = vec3(0.0); vVd = vec3(0.0, 0.0, -1.0); vSide = vec3(1.0, 0.0, 0.0); vAlong = vec3(0.0, -1.0, 0.0);
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);                       // (culled unless placed below)
  if (aSeed.w > uRain) return;
  // the drop's diameter (mm), as rain has them: Marshall-Palmer, N(D) ~ exp(-Lambda D), Lambda = 4.1 R^-0.21 per mm
  // (the drops under ~0.5 mm too faint to show); its fall speed (Atlas et al. 1973): ~4 m/s at 1 mm, ~6.5 at 2 mm,
  // ~8 at 3 mm, ~9 m/s at 5 mm
  float u = fract(aSeed.w * 7.31 + aSeed.x * 3.17);
  float D = min(5.5, 0.5 - log(1.0 - 0.995 * u) / (4.1 * pow(max(uRate, 1.0), -0.21)));
  float sz = clamp((D - 0.5) / 3.0, 0.0, 1.0);
  float fall = max(1.6, 9.65 - 10.3 * exp(-0.6 * D)) * uSpeed / 9.5;
  // in a gale each drop rides the gusty air at its own slant (the eddies toss the small ones about)
  vec2 tw = (vec2(fract(aSeed.z * 13.7), fract(aSeed.x * 29.3)) - 0.5) * (1.2 - 0.6 * sz) * 0.35 * length(uWind) * uGale;
  vec3 vel = vec3(uWind.x + tw.x, -fall, uWind.y + tw.y);
  vec3 box = vec3(2.0 * uRadius, uHeight, 2.0 * uRadius);
  vec3 org = uCam - vec3(uRadius, uHeight * 0.4, uRadius);
  // world-anchored drops wrapped into a box around the camera (they keep their place when you move)
  vec3 p = org + mod(vec3(aSeed.x, aSeed.z, aSeed.y) * box + vec3(uWindOff.x + tw.x * uRainTime, -fall * uRainTime, uWindOff.y + tw.y * uRainTime) - org, box);
  // (V92) a squall's gusts come as fronts carried along on the air, some tens of metres deep and wider across the wind:
  // in one the air - and the rain in it - runs ~30% faster than the wind around it, between them ~25% slower, so there
  // the drops fly flatter (each carried the further the longer it has been falling: its depth under the top of the box)
  // and come thicker - the sheets of rain that sweep past in waves (the pattern rides the air on the gale's bearing)
  float gf = 0.0, sheet = 0.45;
  if (uGale > 0.05) {
    vec2 q = p.xz - uAirOff;
    gf = smoothstep(0.35, 0.75, rainNoise(vec2(dot(q, uAxis) / 34.0, dot(q, vec2(-uAxis.y, uAxis.x)) / 75.0)));
    // (and the sheets of rain the haze shows sweeping along, a few hundred metres across: main.js, the fog chunk)
    sheet = smoothstep(0.3, 0.7, rainNoise(vec2(dot(q, uAxis) / 160.0, dot(q, vec2(-uAxis.y, uAxis.x)) / 320.0)));
    vec2 gv = uAxis * (gf - 0.45) * 0.6 * uGale * length(uWind);
    p.xz = org.xz + mod(p.xz + gv * (org.y + box.y - p.y) / fall - org.xz, box.xz);
    vel.xz += gv;
  }
  // landed: on a crown, a roof or the ground. Driven by a gale: wherever the wind cannot carry it, behind (along its
  // flight) a wall, a house, a fence, a car; under a roof or a crown only some, blown in from the open side or dripping
  float top = rainTop(p.xz);
  if (uGale > 0.05 && uLeeOn > 0.5) {
    if (leeGap(p) > 0.06 || (p.y < top && top - p.y < 10.0 && fract(aSeed.y * 41.3) < 0.55)) return;
  } else if (p.y < top) return;
  if (inCar(p)) return;
  // seen from here: its motion across the line of sight (what it travels along it changes nothing in the picture)
  vec3 toCam = uCam - p;
  float dist = length(toCam);
  vec3 vd = -toCam / max(dist, 1e-4);
  vec3 vp = vel - vd * dot(vel, vd), dn = vec3(0.0, -1.0, 0.0) + vd * vd.y;
  float vl = length(vp);
  vec3 along = vl > 1e-4 ? vp / vl : (dot(dn, dn) > 1e-6 ? normalize(dn) : vec3(1.0, 0.0, 0.0));
  vec3 side = normalize(cross(along, vd));
  // its radius, and how flattened it is (Beard & Chuang 1987, the polynomial fit: b/a = 1.0048 + 5.7e-4 D - 2.628e-2 D^2
  // + 3.682e-3 D^3 - 1.677e-4 D^4, D in mm) as seen from this side (its axis upright)
  float a = D * 5e-4;
  float ar = clamp(1.0048 + D * (5.7e-4 + D * (-2.628e-2 + D * (3.682e-3 - 1.677e-4 * D))), 0.6, 1.0);
  float arP = sqrt(ar * ar * (1.0 - vd.y * vd.y) + vd.y * vd.y);
  // drawn as a disc of radius R: the drop, spread by the eye's blur circle (b = A |1/z - 1/z0|, A the pupil: eye.js) and
  // by the pixel (one across at least); the share of the disc's light that is the drop's own image goes as (a / R)^2
  vec4 eyeP = texture2D(uEyeProbe, vec2(0.5 / uEyeProbeW, 0.5));
  float blurR = 0.5 * eyeP.g * abs(1.0 / max(dist, 0.05) - eyeP.r) * dist, P = uPx * dist;
  float R = sqrt(a * a + blurR * blurR + 0.36 * P * P);
  vSharp = a * a / (R * R);
  // the quad: across the disc, and along its path in the exposure - from where it was when the exposure opened (its
  // centre at y = -m, in R) to where it is now (y = 0)
  float m = vl * uExpo / R, e = 0.05 + 0.6 * P / R;
  float y = mix(arP + e, -m - arP - e, corner.y), x = corner.x * (1.0 + e);
  vQ = vec2(x, y); vM = m; vAr = arP; vVd = vd; vSide = side; vAlong = along;
  // each drawn drop stands for many (uGain); heavier rain holds more water in the air (its liquid water content goes as
  // R^0.88, Marshall-Palmer: 1.43x at 60 mm/h, 1.84x at 80); a gale drives the drops along its gusts' sheets, denser than
  // can be drawn - their streaks, longer as they fly faster, are kept about as bright as a falling drop's
  vA = uGain * pow(max(uRate, 1.0) / 40.0, 0.88) * clamp(vl / fall, 1.0, 3.0) * (1.0 - smoothstep(uRadius * 0.7, uRadius, length(toCam.xz))) * smoothstep(0.08, 0.2, dist);
  // drops over ~1 mm oscillate as they fall (mode 2, f = sqrt(8 sigma / rho a^3) / 2 pi: ~65 Hz at 3 mm, ~120 Hz at
  // 2 mm): over a long exposure their streaks come out banded (Garg & Nayar 2006); over this one, a little
  vOsc = sqrt(8.0 * 0.0728 / (1000.0 * a * a * a)) / 6.2832 * uExpo;
  vAmp = 0.45 * smoothstep(1.0, 3.0, D);
  // the rain comes in sheets (curtains) carried along by the air, denser and sparser bands across the wind some tens of
  // metres apart; in a squall they sweep past with every gust
  // (on the wind's mean bearing, V92: on its passing one - it veers with every gust - the bands far from where the air's
  // travel was first summed up turned round faster and faster, the longer you played: a flicker)
  vec2 wd = uAxis, wn = vec2(-wd.y, wd.x), ap = p.xz - uWindOff;
  float cur = 0.5 + 0.5 * sin(dot(ap, wd) * 0.09 + 1.6 * sin(dot(ap, wn) * 0.035 + 1.3)) * cos(dot(ap, wn) * 0.05 + uRainTime * 0.37 * (1.0 - uGale));
  vA *= mix(1.0, 0.2 + 0.8 * cur, max(uCurtain, uGale * 0.85)) * mix(1.0, (0.55 + 0.75 * gf) * (0.6 + 0.9 * sheet), uGale);
  // drops caught in the torch's cone or in the moon's shaft light up
  vec3 tp = p - uTorch.xyz; float tl = length(tp);
  float lit = uTorch.w * smoothstep(uTorchDir.w, uTorchDir.w + 0.04, dot(tp / max(tl, 1e-3), uTorchDir.xyz)) * (1.0 - smoothstep(4.0, 22.0, tl));
  vec3 bp = p - uBeam.xyz; float br = length(bp - uBeamDir.xyz * dot(bp, uBeamDir.xyz));
  lit += uBeamDir.w * 0.1 * (1.0 - smoothstep(uBeam.w * 0.6, uBeam.w, br));
  // the headlights of the car you drive, and the street lamps: a drop with the light behind it, nearly on your line of
  // sight, throws it forward into your eye (the forward scattering of a water drop) - the bright rain under a lamp
  vec3 cp = p - uCarL.xyz; float cl = length(cp);
  lit += 1.2 * uCarL.w * smoothstep(uCarLDir.w, uCarLDir.w + 0.05, dot(cp / max(cl, 1e-3), uCarLDir.xyz)) * (1.0 - smoothstep(3.0, 40.0, cl));
  vec3 lamp = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec4 L = uLamps[i];
    if (L.w <= 0.0) continue;
    // (V101: lit as everything is by the lamp, lamps.js; a drop passes most of it on, throws it forward)
    vec3 q = L.xyz - p; float d2 = max(dot(q, q), 0.3), dl = sqrt(d2), cf = dot(q / dl, vd), cg = q.y / dl;
    float sp = (0.55 + 0.9 * (1.0 - cg * cg)) * smoothstep(0.1, 0.34, cg);
    lamp += vec3(1.0, 0.78, 0.5) * min(L.w * sp / d2, 60.0) * 0.012 * (0.35 + 2.5 * pow(max(cf, 0.0), 8.0));
  }
  vGlint = (vec3(0.9, 0.92, 1.0) * lit * 1.4 + lamp) * uGlint;
  // (too faint to show anywhere, lit or not: not drawn)
  if (vSharp * vA * min(1.0, 2.0 * arP / max(m, 1e-3)) * (1.0 + dot(vGlint, vec3(4.0))) < 0.002) { vA = 0.0; return; }
  // what its rim shows, on average: the sky ~50 deg above the line of sight round its lower part, the ground ~50 deg
  // below it round its upper part (its mean (1 - k)^2 + k there ~0.96); which way is up across the drop (vUp)
  vec3 upI = vec3(0.0, 1.0, 0.0) - vd * vd.y;
  upI = dot(upI, upI) > 1e-6 ? normalize(upI) : -along;
  vSky = 0.96 * seen(vd * 0.643 + upI * 0.766, 0.7);
  vGnd = 0.96 * seen(vd * 0.643 - upI * 0.766, 0.7);
  vUp = vec2(dot(upI, side), dot(upI, along));
  gl_Position = projectionMatrix * viewMatrix * vec4(p + (side * x + along * y) * R, 1.0);
}`;
const DROP_FRAG = /* glsl */`
uniform mat4 projectionMatrix;
uniform float uDetail;
varying float vA, vM, vAr, vSharp, vOsc, vAmp;
varying vec2 vQ, vUp;
varying vec3 vSky, vGnd, vGlint, vVd, vSide, vAlong;
${SEEN_GLSL}
// the light the drop sends to the eye from a point h of its disc (unit radius; y along its path): through it, bent
// twice, (1 - k)^2 of it; off its surface, k (Fresnel, water, unpolarised) - Garg & Nayar's model without the internal
// reflections ("significant only at the periphery of the drop")
vec3 lens(vec2 h) {
  float r2 = min(dot(h, h), 0.996);
  h *= sqrt(r2 / max(dot(h, h), 1e-8));
  float rho = sqrt(r2), ci = sqrt(1.0 - r2), st = rho / 1.333, ct = sqrt(1.0 - st * st);
  float rs = (ci - 1.333 * ct) / (ci + 1.333 * ct), rp = (ct - 1.333 * ci) / (ct + 1.333 * ci);
  float k = 0.5 * (rs * rs + rp * rp), dev = 2.0 * (asin(rho) - asin(st));
  vec3 o = vSide * h.x + vAlong * h.y;                    // (from its middle to the point, across the line of sight)
  vec3 rr = vVd * cos(dev) - o * (sin(dev) / max(rho, 1e-4));
  vec3 rf = reflect(vVd, o - vVd * ci);
  return (1.0 - k) * (1.0 - k) * seen(rr, 0.2) + k * seen(rf, 0.3);
}
void main() {
  // the share of the exposure its disc covers this pixel: its centre runs along y from -m (the exposure opening) to 0
  // (now); flattened along y by vAr
  float x = vQ.x, y = vQ.y / vAr, m = vM / vAr, w = sqrt(max(0.0, 1.0 - x * x));
  float u0 = max(0.0, -y - w), u1 = min(m, w - y);
  float cov = m > 1e-3 ? max(0.0, u1 - u0) / m : step(x * x + y * y, 1.0);
  if (cov <= 0.0) discard;
  cov *= 1.0 + vAmp * sin(6.2832 * vOsc * clamp(-vQ.y / max(vM, 1e-3), 0.0, 1.0) + vOsc * 3.1);   // (an oscillating drop: beads)
  // (its share of the pixel; where drops would cover it over and over, at most ~0.9 of it)
  float A = 0.9 * (1.0 - exp(-cov * vSharp * vA / 0.9));
  if (A < 0.0015) discard;
  // what it shows: its mean - round its rim the sky and the ground (over this pixel the part of the drop that passed it:
  // the leading end of its path only the drop's lower part - the sky, bright -, the trailing end its upper part - the
  // ground); its middle lets through what is behind it. Close by: the lens itself, at three points of its path here
  float hu = clamp(dot(vec2(x, y + 0.5 * (u0 + u1)), vUp), -1.0, 1.0);
  vec3 ring = mix(vSky, vGnd, 0.5 + 0.5 * hu);
  vec4 o = vec4(ring, 1.0) * A * 0.64;
  if (uDetail > 0.5 && uSceneOn > 0.5 && vSharp > 0.04) {
    vec3 L = lens(vec2(x, y + mix(u0, u1, 0.1667))) + lens(vec2(x, y + mix(u0, u1, 0.5))) + lens(vec2(x, y + mix(u0, u1, 0.8333)));
    vec3 B = texture2D(uScene, gl_FragCoord.xy / vec2(textureSize(uScene, 0))).rgb;
    o = vec4(mix(0.64 * ring + 0.36 * B, L / 3.0, sqrt(vSharp)), 1.0) * A;
  }
  o.rgb += vGlint * A;
  gl_FragColor = o;
}`;

// (V92) the splash of a drop, as high-speed films show it (a 2-3 mm drop landing at 7-8 m/s): the sheet thrown up round
// it - a crown ~2 cm across, gone in ~30 ms - breaking up into droplets that fly out low at a sixth to a third of the
// drop's speed (splash-erosion measurements) and come down 5-40 cm off; on standing water the crater closing again throws up a
// jet (Worthington's), ~2-3 cm, from ~20 to ~90 ms, that pinches off a droplet; on bare earth fewer droplets, muddy.
// Each instance is one piece of one impact (9 a slot: 0 the crown, 1-6 its droplets, 7 the jet, 8 the jet's droplet);
// a slot lands a drop every 0.22 s somewhere new within uRadius of you (denser close up: further off a splash is under a
// pixel - drawn a pixel, as faint as it is small - and the surfaces' own boil takes over: WET_MAIN). The old splash was
// one 4-11 cm crown that lasted ~0.3 s
const SPLASH_VERT = /* glsl */`
attribute vec2 corner;
uniform float uRain, uRainTime, uOccOn, uRadius, uGale, uRate, uPx, uSurfOn;
uniform sampler2D uOcc, uFlow, uRoad, uLow;
uniform vec4 uOccBox, uFlowBox;
uniform vec3 uCam;
varying vec2 vC, vFl;
varying float vA, vKind, vT;
varying vec3 vTint;
varying vec4 vCr;
${OCC_GLSL}
${LEE_GLSL}
void main() {
  vC = corner; vA = 0.0; vKind = 0.0; vT = 0.0; vTint = vec3(1.0); vCr = vec4(0.0); vFl = vec2(0.0, 1.0);
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  int slot = gl_InstanceID / 9, part = gl_InstanceID - slot * 9;
  float fs = float(slot);
  if (rainHash(vec2(fs * 0.137, 7.1)) > uRain) return;
  float tt = uRainTime / 0.22 + rainHash(vec2(fs, 3.3)), cyc = floor(tt), t = fract(tt) * 0.22;
  // (the pieces not up at this moment: out before any of the maps is read)
  if ((part == 0 && t > 0.05) || (part == 7 && (t < 0.018 || t > 0.09)) || (part == 8 && t < 0.054)) return;
  vec2 h = vec2(rainHash(vec2(cyc * 0.731, fs * 0.91)), rainHash(vec2(fs * 0.57, cyc * 1.37)));
  float an = 6.2832 * h.y;
  vec2 xz = uCam.xz + vec2(cos(an), sin(an)) * uRadius * h.x;
  float top = rainTop(xz);
  if (top < -1e4) return;
  vec3 c = vec3(xz.x, top + 0.002, xz.y);
  if (uGale > 0.05 && leeGap(c + vec3(0.0, 0.3, 0.0)) > 0.06) return;     // (the driven rain does not reach it)
  // (none inside the car you drive: the map of tops is redrawn every ~0.5 s, the car meanwhile metres on)
  if (inCar(c + vec3(0.0, 0.05, 0.0))) return;
  // the drop: its size (Marshall-Palmer, as the streaks') and its speed when it lands (Atlas et al. 1973)
  float u = rainHash(vec2(cyc * 1.91, fs * 1.3 + 0.5));
  float D = min(5.0, 0.5 - log(1.0 - 0.99 * u) / (4.1 * pow(max(uRate, 1.0), -0.21)));
  float V = max(1.6, 9.65 - 10.3 * exp(-0.6 * D)), big = clamp((D - 0.8) / 2.5, 0.0, 1.0);
  // what it lands on: water (the run-off standing or running here, a road's puddles as the road draws them), the bare
  // ground (earth, grass), or something hard (a road between its puddles, a roof, a step, a car)
  vec2 uv = vec2(0.5 + (xz.x - uOccBox.x) / (2.0 * uOccBox.z), 0.5 - (xz.y - uOccBox.y) / (2.0 * uOccBox.z));
  float depth = 0.0, road = 0.0, ground = 1.0;
  if (uFlowBox.w > 0.5) depth = texture2D(uFlow, vec2(0.5 + (xz.x - uFlowBox.x) / (2.0 * uFlowBox.z), 0.5 - (xz.y - uFlowBox.y) / (2.0 * uFlowBox.z))).r;
  if (uSurfOn > 0.5) {
    road = texture2D(uRoad, uv).r;
    ground = 1.0 - smoothstep(0.25, 0.6, top - uOccBox.w - texture2D(uLow, vec2(uv.x, 1.0 - uv.y)).r);   // (down on the ground, not up on something)
  }
  float n = rainNoise(xz * 0.45) * 0.65 + rainNoise(xz * 1.7 + 5.3) * 0.35;
  float water = max(smoothstep(0.002, 0.006, depth), road * ground * smoothstep(0.57, 0.66, n));
  float earth = ground * (1.0 - road) * (1.0 - water);
  vec3 up = vec3(0.0, 1.0, 0.0), toC = uCam - c;
  vec3 right = normalize(cross(up, toC));
  float fade = (1.0 - smoothstep(uRadius * 0.55, uRadius, length(toC.xz))) * smoothstep(0.35, 0.9, length(toC));
  vec3 pos;
  if (part == 0) {
    // the crown: up in ~8 ms, gone by ~30 ms (on water a little bigger and longer); hardly any in the grass
    float Tc = 0.028 + 0.02 * water;
    if (t > Tc) return;
    // (its rim's radius: ~0.7-1.9 cm, a third more on water - 1.4-3.8 cm across)
    float w = (0.004 + 0.003 * D) * (1.0 + 0.35 * water), hc = w * (0.9 + 0.5 * water), g = smoothstep(0.0, 0.008, t);
    // as you see it: a ring of the sheet standing round the spot (from above an ellipse), its rim w out, hh tall; the
    // quad facing you holds the cup seen from where you are (sE: how steeply you look down on it)
    vec3 vdir = normalize(toC), by = normalize(cross(vdir, right));
    float sE = clamp(vdir.y, 0.0, 1.0), cE = sqrt(1.0 - sE * sE), wr = w * (0.6 + 0.4 * g), hh = hc * g;
    float y0 = -wr * sE, y1 = hh * cE + wr * sE;
    // (a few metres off it is under a pixel: drawn a pixel or so, a soft dot as faint as the light it really sends)
    float pw = uPx * length(toC), W = max(wr, 1.2 * pw), Hq = max(y1 - y0, 1.6 * pw), k2 = wr * (y1 - y0) / (W * Hq);
    vec2 qc = vec2(corner.x * W, y0 + (corner.y * 0.5 + 0.5) * Hq);
    pos = c + right * qc.x + by * qc.y + vdir * 1.2 * wr;   // (brought a rim's breadth towards you: its near foot not in the ground)
    vCr = vec4(qc / wr, sE, hh * cE / wr); vFl = vec2(smoothstep(0.3, 0.8, 1.0 - k2), k2);
    vA = fade * (1.0 - t / Tc) * (0.6 + 0.4 * big) * (1.0 - 0.7 * earth); vT = t / Tc;
  } else if (part <= 6) {
    // a droplet of it: out from the rim, low (20-45 deg; off water steeper), coming down under gravity; drawn as the
    // streak it makes in ~12 ms
    int k = part - 1;
    if (earth > 0.5 && k >= 3) return;                            // (off the earth fewer, and muddy)
    float j = rainHash(vec2(cyc + float(k) * 7.3, fs * 2.1));
    float az = 6.2832 * (float(k) + 0.6 * j) / 6.0 + an * 3.0;
    vec3 dir = vec3(cos(az), 0.0, sin(az));
    float v = V * (0.15 + 0.17 * rainHash(vec2(fs * 3.1, cyc + float(k)))) * mix(1.0, 0.7, water);
    float th = mix(0.3, 0.75, rainHash(vec2(cyc * 2.3, fs + float(k)))) + 0.35 * water;
    float tau = t - 0.004, vh = v * cos(th), vy = v * sin(th), y = 0.004 + vy * tau - 4.905 * tau * tau;
    if (tau <= 0.0 || y < 0.0) return;
    vec3 p = c + dir * (0.004 + 0.003 * D + vh * tau) + up * y;
    vec3 vel = dir * vh + up * (vy - 9.81 * tau);
    float sp = length(vel), d = length(uCam - p), dw = 0.0003 + 0.0003 * big;
    vec3 vd = vel / max(sp, 1e-4), side = normalize(cross(vd, uCam - p));
    pos = p - vd * sp * 0.012 * (corner.y * 0.5 + 0.5) + side * max(uPx * d, dw) * 0.5 * corner.x;
    vA = fade * (0.5 + 0.5 * big) * min(1.0, dw / max(uPx * d, 1e-6) + 0.3) * (1.0 - 0.45 * earth);
    vKind = 1.0;
    vTint = mix(vec3(1.0), vec3(0.62, 0.5, 0.38), 0.6 * earth);
  } else if (water > 0.5) {
    // the jet on water: up out of the closing crater from ~18 ms to ~90 ms (taller for a bigger drop), and the droplet
    // it pinches off at its top
    float t0 = 0.018, T = 0.072, Hj = 0.008 + 0.007 * D;
    if (part == 7) {
      if (t < t0 || t > t0 + T) return;
      float hj = Hj * sin(3.1416 * (t - t0) / T);
      pos = c + right * corner.x * (0.0018 + 0.0006 * D) + up * (corner.y * 0.5 + 0.5) * hj;
      vA = fade * 0.85; vKind = 2.0;
    } else {
      float tau = t - t0 - 0.5 * T, y = Hj + (0.5 + 0.12 * D) * tau - 4.905 * tau * tau;
      if (tau < 0.0 || y < 0.0 || D < 1.5) return;
      vec3 p = c + up * y;
      float sz = max(uPx * length(uCam - p), 0.0012 + 0.0004 * D) * 0.6;
      pos = p + right * corner.x * sz + up * corner.y * sz;
      vA = fade * 0.85; vKind = 3.0;
    }
  } else return;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;
const SPLASH_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vC, vFl;
varying float vA, vKind, vT;
varying vec3 vTint;
varying vec4 vCr;
void main() {
  float a;
  if (vKind < 0.5) {
    // the crown (vCr: where on it, in its rim's radius; how steeply you look down; its height on the screen): a thin
    // sheet standing in a ring, brightest at its sides where you see it edge-on, and its rim - a beaded ellipse round
    // the top, the fingers that break up into the droplets
    float X = vCr.x, Y = vCr.y, sE = max(vCr.z, 0.06), Hc = vCr.w, k = sqrt(max(1.0 - X * X, 0.0));
    float wall = step(abs(X), 1.0) * smoothstep(-sE * k - 0.08, -sE * k + 0.02, Y) * (1.0 - smoothstep(Hc + sE * k - 0.02, Hc + sE * k + 0.08, Y))
      * min(2.2, 0.3 / max(k, 0.14));
    vec2 e = vec2(X, (Y - Hc) / sE);
    float rr = max(length(e), 1e-3), d = abs(rr - 0.95) * rr / max(length(vec2(e.x, e.y / sE)), 1e-3);
    float rim = (1.0 - smoothstep(0.03, 0.13, d)) * (0.5 + 0.5 * sin(atan(e.y, e.x) * 8.0 + vT * 5.0));
    a = mix(max(rim, 0.3 * wall) * (1.0 - 0.6 * vT), (1.0 - smoothstep(0.2, 1.0, length(vC))) * vFl.y, vFl.x);   // (the sheet itself clear: its sides and rim catch the light)
  } else if (vKind < 1.5) a = (1.0 - abs(vC.x)) * smoothstep(-1.0, -0.5, vC.y) * (1.0 - smoothstep(0.6, 1.0, vC.y));   // (a droplet's streak)
  else if (vKind < 2.5) { float y = vC.y * 0.5 + 0.5; a = (1.0 - smoothstep(0.5, 1.0, abs(vC.x) * (1.2 - 0.5 * y))) * (1.0 - smoothstep(0.9, 1.0, y)); }   // (the jet, thicker at its top)
  else a = 1.0 - smoothstep(0.3, 1.0, length(vC));                                      // (its droplet)
  a *= vA * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * vTint, min(a, 1.0));
}`;

// the spray of a downpour: the drops burst on the hard ground into a fine mist that hangs over it, mostly within a hand
// or two of it; a squall's gusts tear it off and drive it along the street in smoky veils, never through what stands in
// their way
const MIST_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aSeed;
uniform float uRain, uRainTime, uOccOn, uRadius, uGale, uGust;
uniform sampler2D uOcc, uFlow;
uniform vec4 uOccBox, uFlowBox;
uniform vec2 uWind, uWindOff;
uniform vec3 uCam;
varying float vA;
varying vec2 vC;
${OCC_GLSL}
${LEE_GLSL}
void main() {
  vC = corner; vA = 0.0;
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  if (aSeed.w > uRain * (0.35 + 0.65 * uGale * clamp(uGust - 0.45, 0.0, 1.5))) return;
  float h = min(1.0, -log(max(1e-3, fract(aSeed.w * 13.7 + aSeed.z * 5.1))) * (0.07 + 0.12 * uGale));
  float spd = 0.55 + 0.35 * fract(aSeed.x * 5.3);
  vec2 box = vec2(2.0 * uRadius), org = uCam.xz - uRadius;
  vec2 q = org + mod(aSeed.xy * box + uWindOff * spd - org, box);
  float top = rainTop(q);
  if (top < -1e4) return;
  // (only off the hard, streaming surfaces: where the water runs in a film - not off the grass)
  vec2 fuv = vec2(0.5 + (q.x - uFlowBox.x) / (2.0 * uFlowBox.z), 0.5 - (q.y - uFlowBox.y) / (2.0 * uFlowBox.z));
  if (uFlowBox.w > 0.5 && texture2D(uFlow, fuv).r < 3e-4) return;
  float life = fract(uRainTime * (0.5 + 0.3 * fract(aSeed.y * 3.3)) + aSeed.z);   // (each puff swells and thins out)
  float s = (0.25 + 0.5 * fract(aSeed.y * 7.1)) * (0.6 + 0.8 * life) * (1.0 + 0.8 * h);
  // (its lower rim just over the ground, V92: a puff stuck into the road showed the line where it went in - the veils
  // came out as hard-edged sheets)
  vec3 p = vec3(q.x, top + 0.02 + h + 0.3 * s, q.y);
  if (leeGap(p) > 0.06 || inCar(p)) return;
  vec3 toCam = uCam - p;
  float dist = length(toCam);
  vec2 wd = normalize(uWind + vec2(1e-4));
  vec3 along = vec3(wd.x, 0.0, wd.y), side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 ax = normalize(mix(side, along, 0.5 * uGale));
  gl_Position = projectionMatrix * viewMatrix * vec4(p + ax * corner.x * s * (1.3 + 1.2 * uGale) + vec3(0.0, 1.0, 0.0) * corner.y * s * 0.3, 1.0);
  // (V92: in a burst the gale tears much more of it off the puddles and the streaming road - white veils driven along)
  vA = (0.01 + uGale * (0.018 + 0.024 * smoothstep(1.1, 1.9, uGust))) * sin(life * 3.14159) * (1.0 - smoothstep(uRadius * 0.6, uRadius, length(toCam.xz))) * smoothstep(0.6, 2.5, dist) * (1.0 - 0.6 * smoothstep(0.1, 0.8, h));
}`;
const MIST_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA;
varying vec2 vC;
void main() {
  float a = vA * max(0.0, exp(-2.2 * dot(vC, vC)) - 0.111) * 1.125;   // (nothing left at its rim: the quads' edges showed)
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor, a);
}`;

function cloud(n, corners, idx) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(corners.length / 2 * 3), 3));
  g.setIndex(idx);
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = n;
  return g;
}

export class RainFX {
  // splashes: how many drops' splashes at a time (their slots, V92: 4000 on the higher settings)
  constructor(scene, splashes = 4000) {
    this.group = new THREE.Group();
    this.group.userData.ueSkip = 'rain';
    this.group.visible = false;
    scene.add(this.group);
    const common = { uRain: RAIN.uRain, uRainTime: RAIN.uRainTime, uOcc: RAIN.uOcc, uOccBox: RAIN.uOccBox, uOccOn: RAIN.uOccOn, uGale: RAIN.uGale, uAirOff: RAIN.uAirOff,
      uLee: SNOW.uLee, uLeeVP: SNOW.uLeeVP, uLeeOrg: SNOW.uLeeOrg, uLeeDir: SNOW.uLeeDir, uLeeOn: SNOW.uLeeOn, uSnowCar: SNOW.uSnowCar, uSnowCarSize: SNOW.uSnowCarSize, uSnowCarY: SNOW.uSnowCarY };
    this.cam = { value: new THREE.Vector3() };
    this.color = { value: new THREE.Color(0.6, 0.63, 0.67) };
    this.wind = { value: new THREE.Vector2(1.6, 0.7) }; this.windOff = { value: new THREE.Vector2() }; this.lastT = null;
    this.axis = { value: new THREE.Vector2(1.6, 0.7).normalize() };
    this.torch = { value: new THREE.Vector4() }; this.torchDir = { value: new THREE.Vector4(0, 0, -1, 0.92) };
    this.beam = { value: new THREE.Vector4() }; this.beamDir = { value: new THREE.Vector4(0, 1, 0, 0) };
    this.rate = { value: 40 }; this.px = { value: 1.1e-3 }; this.pupil = { value: 0.003 };
    this.carL = { value: new THREE.Vector4() }; this.carLDir = { value: new THREE.Vector4(0, 0, -1, 0.9) };
    this.lamps = { value: Array.from({ length: 6 }, () => new THREE.Vector4()) };
    Object.assign(common, { uRate: this.rate, uPx: this.px, uPupil: this.pupil, uCarL: this.carL, uCarLDir: this.carLDir, uLamps: this.lamps });
    const mk = (vs, fs, u) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: { ...common, uCam: this.cam, uColor: this.color, uWind: this.wind, uWindOff: this.windOff, uAxis: this.axis, uTorch: this.torch, uTorchDir: this.torchDir, uBeam: this.beam, uBeamDir: this.beamDir, ...u },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });   // (the quads face either way)
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.userData.noAO = true; m.renderOrder = 5; this.group.add(m); return m; };
    // (V122) the drops: the exposure (update), the sky's light (the IBL map: setEnv) and the frame before the rain (TAA)
    this.scene = scene; this.fdt = 1 / 60; this.lastNow = null; this.envKey = null;
    this.expo = { value: 1 / 120 }; this.glint = { value: 6 };
    this.env = { value: null }; this.envOn = { value: 0 }; this.envK = { value: 1 }; this.envFlat = { value: new THREE.Color(0.45, 0.47, 0.5) };
    const dropU = { uExpo: this.expo, uGlint: this.glint, uEnv: this.env, uEnvOn: this.envOn, uEnvK: this.envK, uEnvFlat: this.envFlat,
      uScene: FXSRC.tScene, uSceneOn: FXSRC.uSceneOn, uEyeProbe: EYE.probe, uEyeProbeW: EYE.probeW };
    this.dropMats = [];
    const drops = (u) => {
      const m = mk(DROP_VERT, DROP_FRAG, { ...dropU, ...u });
      // blended over the frame: premultiplied (the light it sends, its share of the pixel), the frame's alpha kept
      Object.assign(m, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
      m.defines = {};
      this.dropMats.push(m);
      return m;
    };
    // three layers, drawn from the furthest: the curtain further out, the drops of the street round you, and the ones
    // right before your face (each pixel of them worked out as the lens it is). Real heavy rain has hundreds of drops
    // over a millimetre in every cubic metre (Marshall-Palmer: ~640 at 40 mm/h); these are ~1/15 - 1/1300 of them, so
    // each stands for many (uGain: the light of the ones it stands for), and fewer of them, each the more, on the lower
    // settings (as many as the splashes allow: q)
    const quad = [-1, 0, 1, 0, 1, 1, -1, 1], qi = [0, 1, 2, 0, 2, 3], q = Math.min(1, splashes / 4000);
    add(cloud(Math.round(60000 * q), quad, qi), drops({ uRadius: { value: 34 }, uHeight: { value: 26 }, uSpeed: { value: 9.5 }, uGain: { value: 500 / q }, uCurtain: { value: 1 }, uDetail: { value: 0 } }));
    add(cloud(Math.round(30000 * q), quad, qi), drops({ uRadius: { value: 9 }, uHeight: { value: 12 }, uSpeed: { value: 9.5 }, uGain: { value: 220 / q }, uCurtain: { value: 0.3 }, uDetail: { value: 0 } }));
    add(cloud(Math.round(6000 * q), quad, qi), drops({ uRadius: { value: 2.6 }, uHeight: { value: 5 }, uSpeed: { value: 9.5 }, uGain: { value: 25 / q }, uCurtain: { value: 0 }, uDetail: { value: 1 } }));
    // the splashes (V92): slots of 9 pieces each, within 7 m
    add(cloud(splashes * 9, [-1, -1, 1, -1, 1, 1, -1, 1], qi), mk(SPLASH_VERT, SPLASH_FRAG, { uRadius: { value: 7 }, uOpacity: { value: 1.6 }, uFlow: RAIN.uFlow, uFlowBox: RAIN.uFlowBox, uRoad: RAIN.uRoad, uLow: RAIN.uLow, uSurfOn: RAIN.uSurfOn }));
    // the spray mist over the ground (not added on: it veils what is behind it)
    this.gust = { value: 1 }; this.mistColor = { value: new THREE.Color() };
    const mist = mk(MIST_VERT, MIST_FRAG, { uRadius: { value: 22 }, uGust: this.gust, uColor: this.mistColor, uFlow: RAIN.uFlow, uFlowBox: RAIN.uFlowBox });
    mist.blending = THREE.NormalBlending;
    add(cloud(4000, [-1, -1, 1, -1, 1, 1, -1, 1], qi), mist);
  }

  // torch: { on, pos, dir } ; beam: { on, pos, dir, r } (the moon's shaft); car: the headlights { on, pos, dir };
  // lamps: the lamp heads near you, level: how bright they burn; rate: mm/h; night: 0..1 (the pupil opens)
  update(camera, light, torch, beam, car = null, lamps = [], level = 0, rate = 40, night = 0, flash = 0) {
    this.group.visible = RAIN.uRain.value > 0.002;
    // (V122) the drops' exposure: half a frame (a 180 deg shutter), on the frame rate as it runs - ~8 ms at 60 fps,
    // 1/60 s at most, 1/250 s at least
    const now = performance.now();
    if (this.lastNow !== null) this.fdt += (Math.min(0.1, Math.max(0.002, (now - this.lastNow) / 1000)) - this.fdt) * 0.05;
    this.lastNow = now;
    this.expo.value = Math.min(1 / 60, Math.max(1 / 250, 0.5 * this.fdt));
    // the sky's light they show (the IBL map, made again with the weather and the hour: main.js), the lightning on it
    if (this.scene.environment !== this.env.value) this.setEnv(this.scene.environment);
    this.envK.value = 1 + 1.5 * flash;
    this.envFlat.value.setScalar(0.45 * light);
    if (car?.on) { this.carL.value.set(car.pos.x, car.pos.y, car.pos.z, 1); this.carLDir.value.set(car.dir.x, car.dir.y, car.dir.z, 0.9); } else this.carL.value.w = 0;
    this.lamps.value.forEach((v, i) => { const l = lamps[i]; if (l && level > 0.05) v.set(l.x, l.y, l.z, level * LAMP_I0); else v.w = 0; });
    this.rate.value = rate; this.pupil.value = 0.003 + 0.003 * night;
    this.px.value = camera.fov * Math.PI / 180 / Math.max(1, innerHeight);
    if (torch?.on) { this.torch.value.set(torch.pos.x, torch.pos.y, torch.pos.z, 1); this.torchDir.value.set(torch.dir.x, torch.dir.y, torch.dir.z, 0.93); } else this.torch.value.w = 0;
    if (beam?.on) { this.beam.value.set(beam.pos.x, beam.pos.y, beam.pos.z, beam.r); this.beamDir.value.set(beam.dir.x, beam.dir.y, beam.dir.z, 1); } else this.beamDir.value.w = 0;
    this.cam.value.copy(camera.position);
    this.color.value.setScalar(0.32 * light).multiply(_tint);         // (added on top of the scene)
    this.mistColor.value.setScalar(0.62 * light).multiply(_tint);
    this.gust.value = STORM.gust;
    const t = RAIN.uRainTime.value, dt = this.lastT === null ? 0 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    // gusts; in a squall the gale's own wind (main.js)
    const g = STORM.gale, W = STORM.uWind.value;
    this.wind.value.set(1.6 + 0.8 * Math.sin(t * 0.37), 0.7 + 0.5 * Math.sin(t * 0.23 + 1)).multiplyScalar(1 - g).addScaledVector(W, g);
    this.windOff.value.addScaledVector(this.wind.value, dt);
    this.axis.value.set(0.916, 0.401).multiplyScalar(1 - g).addScaledVector(STORM.axis, g);
    if (this.axis.value.lengthSq() < 1e-6) this.axis.value.set(1, 0);
    this.axis.value.normalize();
    RAIN.uGale.value = g;
  }

  // the IBL map (PMREM, CubeUV): the drops read it as the materials do (three's textureCubeUV, its layout from the map's
  // height, as WebGLPrograms works it out)
  setEnv(env) {
    const h = env && env.mapping === THREE.CubeUVReflectionMapping ? env.image?.height : 0;
    this.env.value = h ? env : null; this.envOn.value = h ? 1 : 0;
    if (h === this.envKey) return;
    this.envKey = h;
    const mip = h ? Math.log2(h) - 2 : 0;
    for (const m of this.dropMats) {
      m.defines = h ? { ENVMAP_TYPE_CUBE_UV: '', CUBEUV_TEXEL_WIDTH: 1 / (3 * Math.max(2 ** mip, 7 * 16)), CUBEUV_TEXEL_HEIGHT: 1 / h, CUBEUV_MAX_MIP: mip.toFixed(1) } : {};
      m.needsUpdate = true;
    }
  }
}
const _tint = new THREE.Color(0.97, 1, 1.05);

// ------------------------------------------------------------------ falling snow
// Flakes fall at ~1 m/s (big wet ones a little faster), ride the wind and each swings on its own small circle as it
// tumbles; world-anchored like the drops (they keep their place when you move) and gone where they land. In a blizzard
// (STORM) they fly almost level at 10-20 m/s, as streaks, in three more layers (one right at your face), only where
// the open side lets them in, and the snow lying on the ground streams along it (DRIFT).
const FLAKE_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aSeed;
uniform float uSnowFall, uStorm, uStormLayer, uRainTime, uOccOn, uRadius, uHeight, uSize, uOpacity;
uniform sampler2D uOcc;
uniform vec4 uOccBox;
uniform vec2 uWind, uWindOff;        // the wind now (m/s, world x / z) and how far it has carried the air so far (m)
uniform vec3 uCam;
uniform vec4 uTorch, uTorchDir, uCarL, uCarLDir;
uniform vec4 uLamps[6];
uniform sampler2D uEyeProbe;         // (V101, eye.js: the eye's focus in dioptres, its pupil in metres)
uniform float uEyeProbeW;
varying float vA, vLit, vEdge;
varying vec3 vLamp;
varying vec2 vC;
${OCC_GLSL}
${LEE_GLSL}
void main() {
  vC = corner; vA = 0.0; vLit = 0.0; vLamp = vec3(0.0); vEdge = 0.35;
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  if (aSeed.w > (uStormLayer > 0.5 ? uStorm : uSnowFall)) return;
  float sz = fract(aSeed.w * 7.31 + aSeed.x * 3.17);
  float t = uRainTime, ph = aSeed.z * 6.2832, fall = 0.75 + 0.6 * sz;
  vec3 box = vec3(2.0 * uRadius, uHeight, 2.0 * uRadius);
  vec3 org = uCam - vec3(uRadius, uHeight * 0.4, uRadius);
  // carried by the air (its travel so far: a change of wind moves nothing at once) and tossed by the turbulence
  vec3 p = org + mod(vec3(aSeed.x, aSeed.z, aSeed.y) * box + vec3(uWindOff.x, -fall * t, uWindOff.y) - org, box);
  float turb = 0.15 + 0.25 * sz + 0.9 * uStorm;
  float w1 = t * (1.1 + sz) + ph, w2 = t * (0.8 + 0.7 * sz) + ph * 1.3;
  p += vec3(sin(w1), 0.35 * uStorm * sin(t * 2.3 + ph * 1.9), cos(w2)) * turb;
  // nothing passes through anything: a flake behind a wall, a fence, a car, a trunk (along its flight) is in the lee,
  // and so is one inside a house or under a roof whose open side faces away from the wind; the eddies behind an
  // obstacle carry some in again 3-14 m further back, under the open sky. A gale blows the snow in under the eaves
  // from the open side. Gently falling snow does not reach under a roof or a crown at all.
  float wsp = length(uWind);
  vec2 wd = uWind / max(wsp, 1e-3);
  float top = rainTop(p.xz), gap = leeGap(p);
  if (gap > 0.08 && (gap < mix(3.0, 14.0, fract(aSeed.x * 17.3 + aSeed.y * 31.7)) || (p.y < top && top - p.y < 10.0))) return;
  if (uStorm < 0.5 && p.y < top) return;
  if (uLeeOn < 0.5 && p.y < rainTop(p.xz - wd * min(6.0, wsp / fall * 0.5))) return;      // (before the map is made)
  if (inCar(p)) return;
  vec3 toCam = uCam - p;
  float dist = length(toCam);
  vec3 vd = toCam / max(dist, 1e-3);
  // moving fast across the view it is a streak (its travel in ~1/80 s)
  vec3 vel = vec3(uWind.x, -fall, uWind.y) + vec3(cos(w1) * (1.1 + sz), 0.0, -sin(w2) * (0.8 + 0.7 * sz)) * turb;
  vec3 vp = vel - vd * dot(vel, vd);
  float vl = length(vp);
  vec3 along = vl > 1e-3 ? vp / vl : vec3(0.0, 1.0, 0.0), side = normalize(cross(along, vd));
  float real = uSize * (0.6 + 0.8 * sz), s = max(real, dist * 0.0017);       // at least ~1.5 px across
  // the eye (V101, eye.js): nearer or further than where it is focused, a flake is out of focus by a blur circle of
  // angular diameter b = A |1/z - 1/z0| (A the pupil): its disc spread over it, as bright in all (the same light)
  vec4 eyeP = texture2D(uEyeProbe, vec2(0.5 / uEyeProbeW, 0.5));
  float blurR = 0.5 * eyeP.g * abs(1.0 / max(dist, 0.05) - eyeP.r) * dist;
  float sb = sqrt(s * s + blurR * blurR);
  vEdge = 0.35 * clamp((s - blurR) / sb, 0.0, 1.0);
  float len = sb + vl * 0.0125;
  gl_Position = projectionMatrix * viewMatrix * vec4(p + side * corner.x * sb + along * corner.y * len, 1.0);
  vA = uOpacity * (1.0 - smoothstep(uRadius * 0.7, uRadius, length(toCam.xz))) * smoothstep(0.12, 0.4, dist) * min(1.0, 1.5 * real / s) * mix(1.0, sb / len, 0.6) * (s * s) / (sb * sb);
  // lit by the torch, the headlights of the car you drive, the street lamps (the snow swirling in their light)
  vec3 tp = p - uTorch.xyz; float tl = length(tp);
  vLit = uTorch.w * smoothstep(uTorchDir.w, uTorchDir.w + 0.04, dot(tp / max(tl, 1e-3), uTorchDir.xyz)) * (1.0 - smoothstep(4.0, 22.0, tl));
  vec3 cp = p - uCarL.xyz; float cl = length(cp);
  vLit += 1.4 * uCarL.w * smoothstep(uCarLDir.w, uCarLDir.w + 0.05, dot(cp / max(cl, 1e-3), uCarLDir.xyz)) * (1.0 - smoothstep(3.0, 38.0, cl));
  // (V101: the street lamps' light as it lights everything else, lamps.js - the spread of a road luminaire, 1/d^2 - and
  // scattered on by the flake: a white flake's ~0.8 of it, much more of it forward, into the eye when the lamp is behind)
  for (int i = 0; i < 6; i++) {
    vec4 L = uLamps[i];
    if (L.w > 0.0) {
      vec3 q = p - L.xyz; float d2 = max(dot(q, q), 0.3), dl = sqrt(d2), cg = -q.y / dl;
      float sp = (0.55 + 0.9 * (1.0 - cg * cg)) * smoothstep(0.1, 0.34, cg);
      vLamp += vec3(1.0, 0.78, 0.5) * min(L.w * sp / d2, 60.0) * 0.255 * (0.45 + 2.2 * pow(max(dot(q / dl, vd), 0.0), 6.0));
    }
  }
}`;
const FLAKE_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA, vLit, vEdge;
varying vec3 vLamp;
varying vec2 vC;
void main() {
  float a = vA * (1.0 - smoothstep(vEdge, 1.0, length(vC)));
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor + vec3(0.9, 0.92, 1.0) * vLit * 0.85 + vLamp, min(a, 1.0));
}`;
// the snow the gale lifts off the ground: streamers racing along the surface, most of it below the knees, some to
// head height, in wavy ribbons
const DRIFT_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aSeed;
uniform float uStorm, uSnowCover, uRainTime, uOccOn, uRadius, uSnowDepth;
uniform sampler2D uOcc, uSnowField;
uniform vec4 uOccBox;
uniform vec2 uWind, uWindOff;
uniform vec3 uCam;
varying float vA;
varying vec2 vC;
${OCC_GLSL}
${LEE_GLSL}
void main() {
  vC = corner; vA = 0.0;
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  if (aSeed.w > uStorm * smoothstep(0.3, 0.8, uSnowCover)) return;
  float h = min(2.2, -log(max(1e-3, fract(aSeed.w * 13.7 + aSeed.z * 5.1))) * 0.28);
  float spd = 0.45 + 0.35 * fract(aSeed.x * 5.3) + 0.12 * h;                     // (slower near the ground)
  vec2 box = vec2(2.0 * uRadius), org = uCam.xz - uRadius;
  vec2 q = org + mod(aSeed.xy * box + uWindOff * spd - org, box);
  float wsp = length(uWind);
  vec2 wd = uWind / max(wsp, 1e-3), wn = vec2(-wd.y, wd.x);
  q += wn * sin(dot(q, wd) * 0.55 + aSeed.z * 6.28 + uRainTime * 1.7) * 0.4;
  // along the lying snow's surface (not over the roofs and the car roofs)
  float top = rainTop(q);
  if (top < -1e4) return;
  vec2 fuv = vec2(0.5 + (q.x - uOccBox.x) / (2.0 * uOccBox.z), 0.5 - (q.y - uOccBox.y) / (2.0 * uOccBox.z));
  vec4 sf = texture2D(uSnowField, fuv);
  float g = sf.r + uOccBox.w + max(sf.g, 0.0) * uSnowDepth;
  vec3 p = vec3(q.x, g + 0.03 + h, q.y);
  // never through a wall, a fence or a car, nor under a roof
  float gap = leeGap(p);
  if ((gap > 0.08 && gap < mix(1.5, 8.0, fract(aSeed.y * 23.1))) || (p.y < top - 0.3 && top - p.y < 10.0) || inCar(p)) return;
  vec3 toCam = uCam - p;
  float dist = length(toCam);
  vec3 along = vec3(wd.x, 0.0, wd.y), side = normalize(cross(along, toCam / max(dist, 1e-3)));
  float len = (0.35 + 0.9 * fract(aSeed.z * 3.1)) * clamp(wsp / 14.0, 0.3, 1.5), wid = 0.05 + 0.1 * h;
  gl_Position = projectionMatrix * viewMatrix * vec4(p + along * corner.y * len + side * corner.x * wid, 1.0);
  vA = (0.07 + 0.1 * fract(aSeed.y * 9.7)) * (1.0 - smoothstep(uRadius * 0.6, uRadius, length(toCam.xz))) * smoothstep(0.3, 1.2, dist) * (1.0 - 0.5 * smoothstep(0.5, 2.2, h));
}`;
const DRIFT_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA;
varying vec2 vC;
void main() {
  float a = vA * exp(-2.5 * dot(vC, vC));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

// the wind (main.js): now (m/s, world x / z), the air's travel so far, how stormy (0..1)
export const STORM = { uStorm: { value: 0 }, uWind: { value: new THREE.Vector2(0.03, -0.55) }, uWindOff: { value: new THREE.Vector2() }, gust: 1, gale: 0, burst: 0,
  axis: new THREE.Vector2(0.052, -0.9986) };   // (the gale's mean bearing, unit: main.js)

export class SnowFX {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.userData.ueSkip = 'rain';
    this.group.visible = false;
    scene.add(this.group);
    this.cam = { value: new THREE.Vector3() };
    this.color = { value: new THREE.Color(1, 1, 1) };
    this.torch = { value: new THREE.Vector4() }; this.torchDir = { value: new THREE.Vector4(0, 0, -1, 0.92) };
    this.carL = { value: new THREE.Vector4() }; this.carLDir = { value: new THREE.Vector4(0, 0, -1, 0.9) };
    this.lamps = { value: Array.from({ length: 6 }, () => new THREE.Vector4()) };
    const common = { uEyeProbe: EYE.probe, uEyeProbeW: EYE.probeW, uSnowFall: SNOW.uSnowFall, uStorm: STORM.uStorm, uRainTime: RAIN.uRainTime, uOcc: RAIN.uOcc, uOccBox: RAIN.uOccBox, uOccOn: RAIN.uOccOn, uCam: this.cam, uColor: this.color,
      uWind: STORM.uWind, uWindOff: STORM.uWindOff, uTorch: this.torch, uTorchDir: this.torchDir, uCarL: this.carL, uCarLDir: this.carLDir, uLamps: this.lamps,
      uLee: SNOW.uLee, uLeeVP: SNOW.uLeeVP, uLeeOrg: SNOW.uLeeOrg, uLeeDir: SNOW.uLeeDir, uLeeOn: SNOW.uLeeOn, uSnowCar: SNOW.uSnowCar, uSnowCarSize: SNOW.uSnowCarSize, uSnowCarY: SNOW.uSnowCarY,
      uSnowField: SNOW.uSnowField, uSnowDepth: SNOW.uSnowDepth };
    const quad = [-1, -1, 1, -1, 1, 1, -1, 1], qi = [0, 1, 2, 0, 2, 3];
    const add = (n, u, vs = FLAKE_VERT, fs = FLAKE_FRAG) => {
      const m = new THREE.Mesh(cloud(n, quad, qi), new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: { ...common, ...u }, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.userData.noAO = true; m.renderOrder = 5;
      this.group.add(m);
      return m;
    };
    // big flakes close by (the ones you see tumbling), and the fall further out that greys the view
    add(16000, { uRadius: { value: 7 }, uHeight: { value: 9 }, uSize: { value: 0.01 }, uOpacity: { value: 0.95 }, uStormLayer: { value: 0 } });
    add(40000, { uRadius: { value: 30 }, uHeight: { value: 22 }, uSize: { value: 0.011 }, uOpacity: { value: 0.75 }, uStormLayer: { value: 0 } });
    // the blizzard: flakes right at your face, a dense fall close by and further out
    add(1500, { uRadius: { value: 2.6 }, uHeight: { value: 4 }, uSize: { value: 0.012 }, uOpacity: { value: 0.35 }, uStormLayer: { value: 1 } });
    add(22000, { uRadius: { value: 8 }, uHeight: { value: 9 }, uSize: { value: 0.01 }, uOpacity: { value: 0.55 }, uStormLayer: { value: 1 } });
    add(40000, { uRadius: { value: 32 }, uHeight: { value: 22 }, uSize: { value: 0.011 }, uOpacity: { value: 0.42 }, uStormLayer: { value: 1 } });
    this.drift = add(30000, { uRadius: { value: 24 }, uSnowCover: SNOW.uSnow }, DRIFT_VERT, DRIFT_FRAG);
  }

  // torch, car: { on, pos, dir }; lamps: the lamp heads near you (Vector3), level: how bright they burn
  update(camera, light, torch, car, lamps = [], level = 0) {
    this.group.visible = SNOW.uSnowFall.value > 0.002 || STORM.uStorm.value > 0.002;
    if (!this.group.visible) return;
    this.drift.visible = STORM.uStorm.value > 0.02 && SNOW.uSnow.value > 0.3;
    if (torch?.on) { this.torch.value.set(torch.pos.x, torch.pos.y, torch.pos.z, 1); this.torchDir.value.set(torch.dir.x, torch.dir.y, torch.dir.z, 0.93); } else this.torch.value.w = 0;
    if (car?.on) { this.carL.value.set(car.pos.x, car.pos.y, car.pos.z, 1); this.carLDir.value.set(car.dir.x, car.dir.y, car.dir.z, 0.9); } else this.carL.value.w = 0;
    this.lamps.value.forEach((v, i) => { const l = lamps[i]; if (l && level > 0.05) v.set(l.x, l.y, l.z, level * LAMP_I0); else v.w = 0; });
    this.cam.value.copy(camera.position);
    this.color.value.setRGB(0.93, 0.95, 1).multiplyScalar(Math.max(0.06, light));
  }
}

// ------------------------------------------------------------------ the lying snow
// A blanket of snow over the ground around the camera (±48 m, a vertex every 0.4 m, on the world's grid so it does not
// swim): it lies on the surface baked by RainOcclusion, as deep as SNOW.uSnowDepth times the local shape (drifts behind
// fences and walls, dunes, mounds, thin on the roads with banks along them, none under roofs and cars), and it thins
// out where it ends. Further away the cover of rain.js (white surfaces) carries on. Near you a finer one takes over (a
// vertex every 3.3 cm over 12.8 m, ahead of you): it carries the footprints and the tyre tracks (snowtrail.js) down to
// the tread; along its edge it runs straight between the coarse vertices, so the two meet without a crack.
export const BLANKET_PARS = /* glsl */`
uniform sampler2D uSnowField, uTrail;
uniform vec4 uOccBox, uSnowCar, uTrailBox, uSnowFine;
uniform vec2 uSnowCarSize;
uniform float uSnowDepth;
${TRAIL_GLSL}
// the field read with a cubic B-spline (4 filtered taps): a surface smooth in its slope too, without the creases and
// corners of plain bilinear texels
vec4 fieldCubic(vec2 uv) {
  vec2 n = vec2(textureSize(uSnowField, 0)), p = uv * n - 0.5, f = fract(p);
  p -= f;
  vec4 nx = vec4(1.0, 2.0, 3.0, 4.0) - f.x, ny = vec4(1.0, 2.0, 3.0, 4.0) - f.y;
  vec4 sx = nx * nx * nx, sy = ny * ny * ny;
  vec4 cx = vec4(sx.x, sx.y - 4.0 * sx.x, sx.z - 4.0 * sx.y + 6.0 * sx.x, 0.0); cx.w = 6.0 - cx.x - cx.y - cx.z; cx /= 6.0;
  vec4 cy = vec4(sy.x, sy.y - 4.0 * sy.x, sy.z - 4.0 * sy.y + 6.0 * sy.x, 0.0); cy.w = 6.0 - cy.x - cy.y - cy.z; cy /= 6.0;
  vec4 c = p.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(cx.xz + cx.yw, cy.xz + cy.yw);
  vec4 o = (c + vec4(cx.yw, cy.yw) / s) / n.xxyy;
  vec4 a = texture2D(uSnowField, o.xz), b = texture2D(uSnowField, o.yz), d = texture2D(uSnowField, o.xw), e = texture2D(uSnowField, o.yw);
  float kx = s.x / (s.x + s.y), ky = s.z / (s.z + s.w);
  return mix(mix(e, d, kx), mix(b, a, kx), ky);
}
// the surface the snow lies on at xz (returned), and how deep it lies there before anyone walked through it (d0)
float snowBase(vec2 xz, out float d0) {
  vec2 uv = vec2(0.5 + (xz.x - uOccBox.x) / (2.0 * uOccBox.z), 0.5 - (xz.y - uOccBox.y) / (2.0 * uOccBox.z));
  vec4 s = fieldCubic(uv);
  vec2 e = abs(uv - 0.5) * 2.0;
  d0 = uSnowDepth * s.g * (1.0 - smoothstep(0.78, 0.97, max(e.x, e.y)));
  // the car you drive pushes the snow aside (the maps follow it only every few metres)
  vec2 dc = xz - uSnowCar.xy, cs = vec2(cos(uSnowCar.z), sin(uSnowCar.z));
  vec2 q = abs(vec2(dot(dc, vec2(cs.x, -cs.y)), dot(dc, -cs.yx))) - uSnowCarSize;
  d0 *= 1.0 - uSnowCar.w * (1.0 - smoothstep(-0.2, 0.25, max(q.x, q.y)));
  // the deeper it lies, the more it smooths what is under it: it fills the low side of a step up to the step's
  // average (never below the surface it lies on)
  return mix(s.r, max(s.r, s.b), smoothstep(0.03, 0.35, d0)) + uOccBox.w;
}
// the prints in a cover d0 deep: a boot or a tyre packs fresh snow to about a quarter of its depth, pushes up a rim
// around (at most ~6 cm) and leaves its tread on the floor
float trailDh(vec2 xz, float d0) {
  vec4 t = trailAt(xz);
  return -0.75 * d0 * t.r + 0.4 * min(d0, 0.15) * t.g * (1.0 - t.r) - 0.12 * min(d0, 0.05) * t.b;
}
float snowAt(vec2 xz, out float d) {
  float d0, b = snowBase(xz, d0);
  d = d0 + trailDh(xz, d0);
  return b + d;
}`;
const BLANKET_POS = /* glsl */`
#ifdef SNOW_FINE
  vec2 sxz = position.xz + uSnowFine.xy;
#else
  // (V109) on the world's 0.4 m lattice, whatever the box: the box moves in 3 m steps, 7.5 of its cells - on every other
  // step the lattice stood 0.2 m off the fine blanket's (whose edges lie on the world's), and the coarse vertex just
  // inside the fine square, sunk out of the way, dragged the snow down along its edge: a groove round the 12.8 m square
  // about you, the ground showing in it, there and gone as you walked
  vec2 sxz = position.xz + floor(uOccBox.xy / 0.4 + 0.5) * 0.4;
#endif
  float sd;
  float sy = snowAt(sxz, sd);
#ifdef SNOW_FINE
  // its edge runs straight between the coarse vertices (0.4 m apart), as the coarse triangles' edges do
  { vec2 fe = uSnowFine.z - abs(position.xz);
    if (fe.x < 0.002 || fe.y < 0.002) {
      bool alongZ = fe.x < 0.002;
      float c = alongZ ? sxz.y : sxz.x, c0 = floor(c / 0.4 + 0.001) * 0.4, k = clamp((c - c0) / 0.4, 0.0, 1.0), s0, s1;
      vec2 p0 = alongZ ? vec2(sxz.x, c0) : vec2(c0, sxz.y), p1 = alongZ ? vec2(sxz.x, c0 + 0.4) : vec2(c0 + 0.4, sxz.y);
      sy = mix(snowAt(p0, s0), snowAt(p1, s1), k);
    } }
#else
  // under the fine blanket it goes down out of the way
  { vec2 fq = abs(sxz - uSnowFine.xy); if (uSnowFine.w > 0.5 && max(fq.x, fq.y) < uSnowFine.z - 0.05) sy -= 3.0; }
#endif`;

function blanketMaterials(fine) {
  const uni = { uOcc: RAIN.uOcc, uOccOn: RAIN.uOccOn, uSnowField: SNOW.uSnowField, uOccBox: RAIN.uOccBox, uSnowDepth: SNOW.uSnowDepth, uSnowLight: SNOW.uSnowLight, uSnowCar: SNOW.uSnowCar, uSnowCarSize: SNOW.uSnowCarSize,
    uTrail: SNOW.uTrail, uTrailBox: SNOW.uTrailBox, uSnowFine: SNOW.uSnowFine, uSnowPlaster: SNOW.uSnowPlaster, uSnowFall: SNOW.uSnowFall, uSnowWindDir: SNOW.uSnowWindDir };
  const def = (fine ? '#define SNOW_FINE\n' : '') + `#define SNOW_TE ${fine ? '0.03' : '0.06'}\n`;
  // (V115: both its faces - a camera that ends up inside the snow, flying or in a car's chase view, sees snow, not
  // through it; its shadow as before, from the faces turned away from the light)
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.BackSide });
  mat.color.setRGB(0.87, 0.9, 0.94);                         // (the cover's snow colour)
  mat.userData.noWet = true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + def + BLANKET_PARS + '\nvarying vec3 vSnowP;')
      // (the normal is worked out per pixel)
      .replace('#include <beginnormal_vertex>', BLANKET_POS + `
  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
  vSnowP = vec3(sxz.x, sy, sxz.y);`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(sxz.x, sy, sxz.y);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${def}${BLANKET_PARS}
uniform float uSnowLight, uSnowPlaster, uSnowFall;
uniform vec2 uSnowWindDir;
varying vec3 vSnowP;
float sFd, sFd0;
// (world cells run to 10^5 and more a few km out: brought into a small range first, or float precision leaves the hash
// with a handful of values and every pattern built on it flat)
float rainHash(vec2 p) { vec3 q = fract(vec3(mod(p, 4096.0).xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float bnNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rainHash(i), rainHash(i + vec2(1.0, 0.0)), f.x), mix(rainHash(i + vec2(0.0, 1.0)), rainHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fieldH(vec2 xz) { float d0, b = snowBase(xz, d0); return b + d0; }
// (V101: the street lamps' shadows on the lying snow, lamps.js: the height map of the tops of things)
uniform sampler2D uOcc;
uniform float uOccOn;
float rainTop(vec2 xz) {
  if (uOccOn < 0.5) return -1e5;
  vec2 uv = vec2(0.5 + (xz.x - uOccBox.x) / (2.0 * uOccBox.z), 0.5 - (xz.y - uOccBox.y) / (2.0 * uOccBox.z));
  if (any(lessThan(uv, vec2(0.004))) || any(greaterThan(uv, vec2(0.996)))) return -1e5;
  return texture2D(uOcc, uv).r + uOccBox.w;
}
#define LAMP_OCC
${LAMP_OCC_GLSL}
${GLINT_GLSL}
#define LAMP_GLINT(c, l) reflectedLight.directSpecular += (c) * (6.0 * (1.0 - sTr.r) * (1.0 - smoothstep(6.0, 18.0, length(vSnowP - cameraPosition))) * snowGlint(vSnowP, normal, (l), normalize(-vViewPosition)));`)
      // where it ends, per pixel from the snow's shape and the prints (not from the triangles)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  snowBase(vSnowP.xz, sFd0);
  sFd = sFd0 + trailDh(vSnowP.xz, sFd0);
  if (sFd < 0.012) discard;
  vec4 sTr = trailAt(vSnowP.xz);`)
      // packed snow is a little greyer
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb *= (0.95 + 0.05 * bnNoise(vSnowP.xz * 0.8)) * (1.0 - 0.07 * sTr.r);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // the shape, per pixel: the drifts' at 0.2 m, the prints' at 3 cm (6 further out)
    vec2 sp = vSnowP.xz, te = vec2(SNOW_TE, 0.0);
    vec2 G = vec2(fieldH(sp + vec2(0.2, 0.0)) - fieldH(sp - vec2(0.2, 0.0)), fieldH(sp + vec2(0.0, 0.2)) - fieldH(sp - vec2(0.0, 0.2))) / 0.4
           + vec2(trailDh(sp + te.xy, sFd0) - trailDh(sp - te.xy, sFd0), trailDh(sp + te.yx, sFd0) - trailDh(sp - te.yx, sFd0)) / (2.0 * SNOW_TE);
    float sDist = length(vSnowP - cameraPosition);
    // lumps at the decimetre and centimetre scale
    vec2 bq = sp * 3.0, bq2 = sp * 11.0;
    G += vec2(bnNoise(bq + vec2(0.5, 0.0)) - bnNoise(bq - vec2(0.5, 0.0)), bnNoise(bq + vec2(0.0, 0.5)) - bnNoise(bq - vec2(0.0, 0.5))) * 0.35 * (1.0 - sTr.r)
       + vec2(bnNoise(bq2 + vec2(0.5, 0.0)) - bnNoise(bq2 - vec2(0.5, 0.0)), bnNoise(bq2 + vec2(0.0, 0.5)) - bnNoise(bq2 - vec2(0.0, 0.5))) * 0.12;
    // the wind's ripples: short crests across it, 15-30 cm apart, wavering and breaking off, a long gentle windward
    // slope and a short steep lee face, in patches; clear after a blizzard, faint after a calm fall, none in the prints
    vec2 wd = uSnowWindDir, wn = vec2(-wd.y, wd.x);
    float rk = smoothstep(0.45, 0.75, bnNoise(sp * 0.3 + 11.0)) * max(uSnowPlaster, 0.3 * (1.0 - uSnowFall)) * (1.0 - smoothstep(8.0, 24.0, sDist)) * (1.0 - sTr.r);
    if (rk > 0.001) {
      for (int k = 0; k < 2; k++) {
        float fk = float(k), ang = fk * 0.4 - 0.2;
        vec2 dk = normalize(wd + wn * ang);
        float al = dot(sp, dk), ac = dot(sp, vec2(-dk.y, dk.x));
        float ph = al * (4.0 + 2.2 * fk) + bnNoise(vec2(ac * 1.6, al * 0.5) + fk * 7.0) * 2.5 + bnNoise(vec2(ac * 5.0, al * 1.5) + fk * 3.0) * 0.8;
        // (a smooth skewed profile, h = sin + 0.35 sin 2x: its slope, steeper on the lee side; each crest breaks off)
        float x = ph * 6.2832, crest = smoothstep(0.3, 0.6, bnNoise(vec2(ac * 3.0, floor(ph) * 0.7) + fk * 5.0));
        G += dk * (cos(x) + 0.7 * cos(2.0 * x)) * 0.045 * crest * rk * (1.0 - 0.4 * fk);
      }
    }
    normal = normalize((viewMatrix * vec4(-G.x, 1.0, -G.y, 0.0)).xyz);
  }`)
      // the sun (or the moon) on it: what goes into the snow and comes out a little further on (the turned-away side
      // of every lump and the walls of the prints glow softly, bluish: ice takes the red), and its crystals' glints
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
  {
    float gSh = 1.0;
#ifdef CSM_SHADOW
    gSh = csmShadow;
#endif
    vec3 sL = directionalLights[0].direction, sC = directionalLights[0].color * gSh;
    float ndl = dot(normal, sL);
    reflectedLight.directDiffuse += sC * diffuseColor.rgb * vec3(0.6, 0.82, 1.0) * (0.3 * RECIPROCAL_PI) * (clamp((ndl + 0.5) / 1.5, 0.0, 1.0) - clamp(ndl, 0.0, 1.0));
    reflectedLight.directSpecular += sC * (6.0 * (1.0 - sTr.r) * (1.0 - smoothstep(6.0, 18.0, length(vSnowP - cameraPosition))) * snowGlint(vSnowP, normal, sL, normalize(-vViewPosition)));
  }
#endif`);
  };
  mat.customProgramCacheKey = () => fine ? 'snowBlanketFine' : 'snowBlanket';
  // its own shadow (the low winter sun picks out the drifts and the prints)
  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + def + BLANKET_PARS)
      .replace('#include <begin_vertex>', BLANKET_POS + '\nvec3 transformed = vec3(sxz.x, sy - (sd < 0.012 ? 0.05 : 0.0), sxz.y);');
  };
  depth.customProgramCacheKey = () => fine ? 'snowBlanketFineDepth' : 'snowBlanketDepth';
  return { mat, depth };
}

export class SnowBlanket {
  // fineSegs: the fine blanket's vertices along a side (384: 3.3 cm apart)
  constructor(scene, fineSegs = 384) {
    const mk = (size, segs, fine) => {
      const g = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
      g.deleteAttribute('normal'); g.deleteAttribute('uv');
      const { mat, depth } = blanketMaterials(fine);
      const m = new THREE.Mesh(g, mat);
      m.customDepthMaterial = depth;
      m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.userData.noAO = true; m.userData.ueSkip = 'rain';
      m.visible = false;
      scene.add(m);
      return m;
    };
    this.mesh = mk(96, 240, false);
    this.fine = mk(2 * SNOW.uSnowFine.value.z, fineSegs, true);
  }

  // the fine one follows you, 3.5 m ahead (on the coarse vertices' 0.4 m lattice, so it never swims)
  update(camera) {
    const on = SNOW.uSnowDepth.value > 0.012 && !!SNOW.uSnowField.value && RAIN.uOccOn.value > 0.5;
    this.mesh.visible = on;
    const f = SNOW.uSnowFine.value;
    this.fine.visible = on && !!camera;
    f.w = this.fine.visible ? 1 : 0;
    if (!this.fine.visible) return;
    const yaw = camera.rotation.y;
    f.x = Math.round((camera.position.x - Math.sin(yaw) * 3.5) / 0.4) * 0.4;
    f.y = Math.round((camera.position.z - Math.cos(yaw) * 3.5) / 0.4) * 0.4;
  }
}

// ------------------------------------------------------------------ spray thrown up by the tyres on a wet road
const SPRAY_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aP;          // position, size
attribute float aA;         // opacity
uniform vec3 uCam;
varying vec2 vC;
varying float vA;
void main() {
  vC = corner; vA = aA;
  vec3 toCam = normalize(uCam - aP.xyz);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  gl_Position = projectionMatrix * viewMatrix * vec4(aP.xyz + (right * corner.x + up * corner.y) * aP.w, 1.0);
}`;
const SPRAY_FRAG = /* glsl */`
uniform vec3 uColor;
uniform sampler2D uNoise;
varying vec2 vC;
varying float vA;
void main() {
  float r = length(vC);
  float n = texture2D(uNoise, vC * 0.35 + vec2(vA * 3.1, vA * 1.7)).r;
  float a = vA * (1.0 - smoothstep(0.25, 1.0, r)) * (0.45 + 0.55 * n);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

// (V92) the halo of a lamp in a fog: the light its droplets scatter towards you all along your line of sight past it.
// In an even fog of extinction b, a lamp of intensity I at distance D seen th off its centre glows (single scattering)
// L(th) ~ b I (pi - th) / (4 pi D sin th) e^(-b D): bright close round it and falling off as 1/th - the wide soft glow
// round a street lamp in a fog. One quad round each lamp head near you, across the line of sight just this side of it
// (what stands in front of the lamp hides its glow), drawn added on.
const GLOW_VERT = /* glsl */`
attribute vec2 corner;
uniform vec4 uLampsF[12];            // the lamp heads (xyz) and how bright they burn (w; 0 none)
uniform float uFogB;                 // the fog's extinction where you are (1/m)
uniform vec3 uCam;
varying vec2 vQ;
varying float vI;
void main() {
  vQ = vec2(0.0); vI = 0.0;
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec4 L = uLampsF[gl_InstanceID];
  if (L.w <= 0.0) return;
  vec3 toL = L.xyz - uCam; float D = length(toL);
  if (D < 1.0) return;
  vec3 f = toL / D, r = normalize(cross(f, vec3(0.0, 1.0, 0.0)) + vec3(1e-5)), u = cross(r, f);
  vQ = corner * 0.35;                                         // (out to 20 deg off the lamp)
  vec3 p = uCam + f * (D - 0.3) + (r * corner.x + u * corner.y) * 0.365 * (D - 0.3);
  vI = L.w * uFogB * exp(-uFogB * D) / D;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const GLOW_FRAG = /* glsl */`
uniform vec3 uColor;
varying vec2 vQ;
varying float vI;
void main() {
  float th = length(vQ);
  if (th > 0.35 || vI <= 0.0) discard;
  float s = (3.1416 - th) / (12.566 * max(sin(th), 0.004)) * (1.0 - smoothstep(0.22, 0.35, th));
  gl_FragColor = vec4(uColor * vI * s, 1.0);
}`;
export class FogGlow {
  constructor(scene, n = 12) {
    this.lamps = { value: Array.from({ length: n }, () => new THREE.Vector4()) };
    this.cam = { value: new THREE.Vector3() }; this.b = { value: 0 }; this.color = { value: new THREE.Color(1, 0.78, 0.5) };
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.instanceCount = n;
    const m = new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { uLampsF: this.lamps, uFogB: this.b, uCam: this.cam, uColor: this.color },
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.mesh.visible = false;
    this.mesh.userData.noAO = true; this.mesh.userData.ueSkip = 'rain';
    scene.add(this.mesh);
  }
  // lamps: the lamp heads near you ({x, y, z}); level: how bright they burn; b: the fog's extinction where you are
  update(camera, lamps, level, b) {
    const on = b > 1e-3 && level > 0.05 && lamps.length > 0;
    this.mesh.visible = on;
    if (!on) return;
    this.cam.value.copy(camera.position); this.b.value = b;
    this.lamps.value.forEach((v, i) => { const l = lamps[i]; if (l) v.set(l.x, l.y, l.z, level * 8); else v.w = 0; });
  }
}

export class Spray {
  constructor(scene, noise, n = 420) {
    this.n = n; this.next = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.age = new Float32Array(n).fill(9); this.life = new Float32Array(n).fill(1);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.aP.setUsage(THREE.DynamicDrawUsage);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); this.aA.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aP', this.aP); g.setAttribute('aA', this.aA);
    g.instanceCount = n;
    this.cam = { value: new THREE.Vector3() }; this.color = { value: new THREE.Color() };
    const mat = new THREE.ShaderMaterial({ vertexShader: SPRAY_VERT, fragmentShader: SPRAY_FRAG, uniforms: { uCam: this.cam, uColor: this.color, uNoise: { value: noise } },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.visible = false;
    this.mesh.userData.noAO = true; this.mesh.userData.ueSkip = 'rain';
    scene.add(this.mesh);
  }

  // car: the driven vehicle (x, z, h, vx, vz, speed) and its ground height y, or null; wet: 0..1
  update(dt, car, y, wet, light, camPos) {
    const sp = car ? Math.abs(car.speed) : 0;
    if (car && wet > 0.25 && sp > 3) {
      // each tyre lifts a fan of spray behind it, more the faster it turns (rear ones more, in the front ones' wake)
      const fx = -Math.sin(car.h), fz = -Math.cos(car.h), rx = Math.cos(car.h), rz = -Math.sin(car.h);
      const rate = Math.min(1, (sp - 3) / 18) * 240 * wet;
      const m = car.m, af = m ? m.axles[0] - m.L / 2 + 0.1 : -1.35, ar = m ? m.axles[1] - m.L / 2 : 1.3, sw = m ? m.W / 2 - 0.12 : 0.78;
      for (let k = 0; k < 4; k++) {
        const along = k < 2 ? af : ar, side = k % 2 ? sw : -sw, share = k < 2 ? 0.65 : 0.35;
        this.acc = (this.acc ?? 0) + rate * share * dt;
        while (this.acc >= 1) {
          this.acc -= 1;
          const i = this.next = (this.next + 1) % this.n, j = i * 3, back = 0.25 + Math.random() * 0.35;
          this.p[j] = car.x + fx * (along - 0.35) + rx * side + (Math.random() - 0.5) * 0.25;
          this.p[j + 1] = y + 0.1 + Math.random() * 0.25;
          this.p[j + 2] = car.z + fz * (along - 0.35) + rz * side + (Math.random() - 0.5) * 0.25;
          // thrown off the tread backwards about as fast as the car goes, so in the world it hangs nearly where it rose
          this.v[j] = car.vx * back * 0.5 + rx * side * (0.8 + Math.random() * 1.5);
          this.v[j + 1] = 1.5 + Math.random() * 3;
          this.v[j + 2] = car.vz * back * 0.5 + rz * side * (0.8 + Math.random() * 1.5);
          this.age[i] = 0; this.life[i] = 0.6 + Math.random() * 0.7;
        }
      }
    }
    let any = false;
    const P = this.aP.array, A = this.aA.array;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) { A[i] = 0; P[i * 4 + 3] = 0; continue; }
      any = true;
      const drag = Math.exp(-2.2 * dt);
      this.v[j] *= drag; this.v[j + 2] *= drag; this.v[j + 1] = this.v[j + 1] * drag - 1.5 * dt;   // mist: it floats
      this.p[j] += this.v[j] * dt; this.p[j + 1] = Math.max(y + 0.05, this.p[j + 1] + this.v[j + 1] * dt); this.p[j + 2] += this.v[j + 2] * dt;
      P[i * 4] = this.p[j]; P[i * 4 + 1] = this.p[j + 1]; P[i * 4 + 2] = this.p[j + 2]; P[i * 4 + 3] = 0.3 + 1.6 * t;   // mist spreading out
      A[i] = 0.17 * (1 - t) * Math.min(1, t * 5);
    }
    this.mesh.visible = any;
    if (!any) return;
    this.aP.needsUpdate = true; this.aA.needsUpdate = true;
    this.cam.value.copy(camPos);
    this.color.value.setScalar(0.55 * light);
  }
}
