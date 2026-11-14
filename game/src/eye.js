import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// The naked eye (V101): what the eye's own optics do to the picture, measured, instead of a camera's lens.
//
//  * The pupil. Its diameter follows the light the eye is adapted to (the frame's log-mean luminance, in cd/m2 through
//    the scene's calibration, main.js): d = 5 - 3 tanh(0.4 log10 L) mm (Le Grand's formula, the one Pokorny & Smith
//    use for binocular viewing of a large field: ~7 mm by moonlight, ~5 mm under a street lamp, ~2.3 mm by day). It
//    narrows in ~0.3 s and opens in ~1.5 s.
//  * The focus. The eye focuses on what you look at (the nearest thing under the crosshair, from the depth buffer),
//    in ~0.35 s; when there is little to focus on - the dark, a white-out - it drifts to its resting "dark focus",
//    1.5 dioptres (67 cm) on average (Leibowitz & Owens: night and empty-field myopia). Whatever is nearer or further
//    is out of focus by a blur circle of angular diameter b = A |1/z - 1/z0| (A the pupil, metres): the falling
//    snow close to the face is soft (rain.js reads both here, from the probe texture).
//  * Glare. The eye's media scatter a little of the light from every bright thing over the field around it. The CIE
//    General Disability Glare equation gives that spread (the veil, cd/m2 per lux at the eye, sr^-1), for a glare angle
//    θ in degrees, an age A and an iris pigmentation p (0.5 brown): Ψ(θ) = 10/θ^3 + (5/θ^2 + 0.1 p/θ)(1 + (A/62.5)^4)
//    + 0.0025 p (CIE 146:2002; as printed by Bará & Bao-Varela 2023), valid 0.1-100 deg. It is used twice: on the
//    frame itself (a pyramid of blurs weighted to the equation's energy in each band of angles, energy kept: what is
//    spread out is taken from where it came from - no threshold, everything veils its surroundings a little), and for
//    the point lights (street lamps, the moon, the sun), worked out exactly per pixel from their illuminance at the eye
//    and their direction, and only as much as they are seen (their pixels in the depth buffer, or their disk in the
//    sky - a cloud, a roof, a branch hides them).
//  * The ciliary corona: the fine needles radiating from a point light seen in the dark (diffraction by the particles
//    in the lens - van den Berg et al.), the same pattern around every light (it is the eye's, fixed in the view), a
//    little restless with the pupil's unrest (hippus); and the lenticular halo: a coloured ring of ~3 deg radius
//    (yellow at 3.1 deg, each colour's radius in proportion to its wavelength, blue inside, red outside), from the
//    lens's peripheral fibres acting as a circular grating - so only with a wide pupil, by night.
//  * In a blizzard, facing the wind, you squint: the lids close in from above and below (seen blurred, with the
//    lashes), and a light seen through the slit draws long vertical streaks (diffraction by the lids' edges and the
//    lashes, which the wind keeps moving). A flake now and then flies into an eye (looking into the wind, or up into
//    the falling snow): it shuts for an instant and waters; the tears blur and haze the view for a second or two. The
//    cold wind alone makes the eyes water a little. (Ordinary blinks are not drawn: the brain suppresses them - one
//    does not see one's own blinks, Volkmann, Riggs & Moore 1980.)

export const EYE_N = 12;                      // point lights (glare) at most
export const EYE = {
  probe: { value: null },                    // (2 + EYE_N) x 1: [focus D, pupil m, adapting cd/m2], then each light's visibility
  probeW: { value: 2 + EYE_N },
  on: { value: 1 },                          // the menu: the eye's effects on (1) or off (0)
};

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';

// ---- the probe: the eye's state, kept on the GPU (no read-back): focus, pupil, adaptation; the lights' visibility
const PROBE_FRAG = /* glsl */`
uniform sampler2D tPrev, tDepth, tColor;
uniform float uHasDepth, uNear, uFar, uDt, uAbs, uRest, uRestW, uFresh;
uniform vec4 uSrcDir[${EYE_N}];        // view space: unit direction xyz, w: distance (m; 0 for the sky's bodies)
uniform vec4 uSrcInfo[${EYE_N}];       // x: on, y: how it is tested (0 depth, 1 the sky's disk), z: the disk's expected luminance
uniform vec4 uSrcCol[${EYE_N}];        // (its colour times its illuminance at the eye)
uniform mat4 uProj;
uniform float uP, uAgeK;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float psf(float th) { return 10.0 / (th * th * th) + (5.0 / (th * th) + 0.1 * uP / th) * uAgeK + 0.0025 * uP; }
float viewDist(vec2 uv) {
  float d = textureLod(tDepth, uv, 0.0).r;
  if (d >= 1.0) return 1e9;
  return -(uNear * uFar) / ((uFar - uNear) * d - uFar);
}
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  float W = float(${EYE_N + 2});
  int ix = int(floor(vUv.x * W));
  vec4 prev = texture2D(tPrev, vUv);
  vec2 px = vec2(1.0) / vec2(textureSize(tColor, 0));
  if (ix == 0) {
    // the nearest thing under the crosshair (5 taps, ~1 % of the view) - or nothing to focus on: the resting focus
    float z = 1e9;
    if (uHasDepth > 0.5) for (int k = 0; k < 5; k++) {
      vec2 o = k == 0 ? vec2(0.0) : vec2(k == 1 ? 1.0 : k == 2 ? -1.0 : 0.0, k == 3 ? 1.0 : k == 4 ? -1.0 : 0.0) * 0.01;
      z = min(z, viewDist(vec2(0.5) + o));
    }
    // (the dark focus: only as dark as it is where you look - under a lamp the eye has enough to focus on)
    float rest = max(uRest * (1.0 - smoothstep(-5.8, -1.2, log(max(prev.b, 1e-6)))), uRestW);
    float want = uHasDepth > 0.5 ? max(1.0 / max(z, 0.2), rest) : rest;
    // the adapting luminance: the frame's log-mean (64 taps, jittered), weighted to the middle of the view where one
    // looks (the fovea and round it), in cd/m2
    float s = 0.0, sw = 0.0;
    for (int k = 0; k < 64; k++) {
      vec2 g = (vec2(float(k % 8), float(k / 8)) + vec2(hash(vec2(float(k), uDt * 7919.0)), hash(vec2(uDt * 104.7, float(k))))) / 8.0;
      float w = exp(-dot(g - 0.5, g - 0.5) / (2.0 * 0.22 * 0.22));
      s += w * log(max(lum(textureLod(tColor, g, 0.0).rgb), 1e-7)); sw += w;
    }
    float La = exp(s / sw);
    // and the lights' veil over the middle of the view: it adds to what the eye adapts to (as in road lighting's
    // threshold increment: a lamp in view raises the adaptation, so the dark round it is seen less)
    for (int i = 0; i < ${EYE_N}; i++) {
      if (uSrcCol[i].w < 0.5) continue;
      float th = degrees(acos(clamp(-uSrcDir[i].z, -1.0, 1.0)));
      La += lum(uSrcCol[i].rgb) * textureLod(tPrev, vec2((float(i) + 2.5) / W, 0.5), 0.0).r * psf(max(th, 0.5));
    }
    La = max(La * uAbs, 1e-5);
    float pupil = (5.0 - 3.0 * tanh(0.4 * log(La) / log(10.0))) * 1e-3;
    if (uFresh > 0.5 || prev.a < 0.5) { gl_FragColor = vec4(want, pupil, La, 1.0); return; }
    float kf = 1.0 - exp(-uDt / 0.35), kp = 1.0 - exp(-uDt / (pupil < prev.g ? 0.3 : 1.5));
    gl_FragColor = vec4(mix(prev.r, want, kf), mix(prev.g, pupil, kp), mix(prev.b, La, kp), 1.0);
    return;
  }
  if (ix == 1) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  int i = ix - 2;
  vec4 sd = uSrcDir[i], si = uSrcInfo[i];
  float vis = 0.0;
  if (si.x > 0.5) {
    vec4 c = uProj * vec4(sd.xyz * (sd.w > 0.0 ? sd.w : 5000.0), 1.0);
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (c.w > 0.0 && all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
      for (int k = 0; k < 5; k++) {
        vec2 o = (k == 0 ? vec2(0.0) : vec2(k == 1 ? 1.0 : k == 2 ? -1.0 : 0.0, k == 3 ? 1.0 : k == 4 ? -1.0 : 0.0)) * px * 1.5;
        // a lamp: nothing nearer in the depth buffer where it is (without one, the lowest setting: its glass lit there);
        // the sun, the moon: their disk as bright as it should be (a cloud, the far hills hide it), nothing nearer
        if (si.y < 0.5 && uHasDepth > 0.5) vis += step(-sd.z * sd.w - 0.6, viewDist(uv + o));
        else vis += (uHasDepth > 0.5 && si.y > 0.5 && viewDist(uv + o) < 1e8 ? 0.0 : 1.0) * smoothstep(0.25, 0.7, lum(textureLod(tColor, uv + o, 0.0).rgb) / max(si.z, 1e-4));
      }
      vis /= 5.0;
    }
  }
  if (uFresh > 0.5 || prev.a < 0.5) { gl_FragColor = vec4(vis, 0.0, 0.0, 1.0); return; }
  gl_FragColor = vec4(mix(prev.r, vis, 1.0 - exp(-uDt / 0.05)), 0.0, 0.0, 1.0);
}`;

// ---- the frame's pyramid (Jimenez 2014: a 13-tap box-of-boxes going down, a 3x3 tent coming up)
const DOWN_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexel;           // the source's texel
uniform float uFirst, uT;
varying vec2 vUv;
vec3 tap(vec2 o) { vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb; return uFirst > 0.5 ? max(min(c, vec3(64.0)) - uT, vec3(0.0)) : c; }
void main() {
  vec3 a = tap(vec2(-2.0, -2.0)), b = tap(vec2(0.0, -2.0)), c = tap(vec2(2.0, -2.0));
  vec3 d = tap(vec2(-1.0, -1.0)), e = tap(vec2(1.0, -1.0));
  vec3 f = tap(vec2(-2.0, 0.0)), g = tap(vec2(0.0, 0.0)), h = tap(vec2(2.0, 0.0));
  vec3 i = tap(vec2(-1.0, 1.0)), j = tap(vec2(1.0, 1.0));
  vec3 k = tap(vec2(-2.0, 2.0)), l = tap(vec2(0.0, 2.0)), m = tap(vec2(2.0, 2.0));
  vec3 s = (d + e + i + j) * 0.125 + (a + b + f + g) * 0.03125 + (b + c + g + h) * 0.03125 + (f + g + k + l) * 0.03125 + (g + h + l + m) * 0.03125;
  gl_FragColor = vec4(s, 1.0);
}`;
const UP_FRAG = /* glsl */`
uniform sampler2D tCoarse, tHere;
uniform vec2 uTexel;           // the coarse level's texel
uniform float uW, uHasCoarse;
varying vec2 vUv;
void main() {
  vec3 u = vec3(0.0);
  if (uHasCoarse > 0.5) {
    u += texture2D(tCoarse, vUv + vec2(-1.0, -1.0) * uTexel).rgb + texture2D(tCoarse, vUv + vec2(1.0, -1.0) * uTexel).rgb
       + texture2D(tCoarse, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture2D(tCoarse, vUv + vec2(1.0, 1.0) * uTexel).rgb;
    u += 2.0 * (texture2D(tCoarse, vUv + vec2(0.0, -1.0) * uTexel).rgb + texture2D(tCoarse, vUv + vec2(0.0, 1.0) * uTexel).rgb
       + texture2D(tCoarse, vUv + vec2(-1.0, 0.0) * uTexel).rgb + texture2D(tCoarse, vUv + vec2(1.0, 0.0) * uTexel).rgb);
    u += 4.0 * texture2D(tCoarse, vUv).rgb;
    u /= 16.0;
  }
  gl_FragColor = vec4(u + uW * texture2D(tHere, vUv).rgb, 1.0);
}`;

// ---- the eye's picture: the veil, the lights' glare, the corona, the halo; the squint, the tears, the lids
const COMP_FRAG = /* glsl */`
uniform sampler2D tDiffuse, tVeil, tSoft, tProbe;
uniform float uVeilOn, uScat, uP, uAgeK, uTime, uSquint, uTear, uLid, uAspect, uOn, uWind, uT;
uniform vec2 uTexel;
uniform mat4 uProjInv;
uniform vec4 uSrcDir[${EYE_N}];        // view space unit direction (w: its distance, for the probe)
uniform vec4 uSrcInfo[${EYE_N}];       // w: the source's angular radius (rad)
uniform vec4 uSrcCol[${EYE_N}];        // its colour times its illuminance at the eye (scene units), w: on
varying vec2 vUv;
float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
// the CIE General Disability Glare equation (sr^-1), th in degrees
float psf(float th) { return 10.0 / (th * th * th) + (5.0 / (th * th) + 0.1 * uP / th) * uAgeK + 0.0025 * uP; }
// the corona's needles: a fixed pattern around every light (the eye's own), each needle its own brightness and length,
// a little restless; its mean over the circle is 1
float needles(float phi, float th) {
  float n = 0.0;
  for (int o = 0; o < 2; o++) {
    float N = o == 0 ? 160.0 : 67.0, x = phi / 6.2831853 * N, b = floor(x + 0.5), f = x - b;
    float h = hash1(b * (o == 0 ? 1.0 : 7.31) + 0.5), h2 = hash1(b * 3.17 + 11.0 + float(o)), h3 = hash1(b * 5.71 + 3.0);
    float a = pow(h, 5.0) * 6.0 * (0.75 + 0.25 * sin(uTime * (2.4 + 3.1 * h3) + 6.2831853 * h2));
    float len = 0.5 + 2.8 * h2;                                  // (deg)
    n += a * exp(-f * f * (o == 0 ? 90.0 : 140.0)) * exp(-th / len) * (o == 0 ? 1.0 : 0.6);
  }
  return n * 4.8;
}
void main() {
  vec2 uv = vUv;
  // the tears: a film that runs and refracts (a slow, wavy distortion), and blurs
  if (uTear > 0.001) {
    vec2 w = vec2(vnoise(uv * vec2(7.0, 4.0) + vec2(0.0, uTime * 0.35)), vnoise(uv * vec2(5.0, 6.0) + vec2(3.1, uTime * 0.27))) - 0.5;
    uv += w * 0.012 * uTear * (0.4 + 0.6 * (1.0 - smoothstep(0.0, 0.55, uv.y)));
  }
  vec3 col = texture2D(tDiffuse, uv).rgb;
  // the frame's own glare: what the pyramid spread out, taken from where it came from (more through a film of tears) -
  // of the light the screen cannot show only (above its white): the rest the viewer's own eye spreads as it looks
  if (uVeilOn > 0.5) col += (1.0 + uTear) * (texture2D(tVeil, uv).rgb - uScat * max(min(col, vec3(64.0)) - uT, vec3(0.0)));
  col = mix(col, texture2D(tSoft, uv).rgb, clamp(uTear * 0.75, 0.0, 0.75));
  // the lights: per pixel, from each one's direction and illuminance at the eye
  vec4 ep = texture2D(tProbe, vec2(0.5 / ${(EYE_N + 2).toFixed(1)}, 0.5));
  float pupilMM = ep.g * 1000.0;
  float kCor = 0.65 * smoothstep(3.0, 6.5, pupilMM) * (1.0 - 0.4 * uSquint);
  float kHalo = 0.55 * smoothstep(4.5, 7.0, pupilMM) * (1.0 - 0.6 * uSquint);
  vec3 ray = (uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0)).xyz;
  ray = normalize(ray);
  vec2 rp = ray.xy / max(-ray.z, 1e-4);
  vec3 glare = vec3(0.0);
  for (int i = 0; i < ${EYE_N}; i++) {
    vec4 sc = uSrcCol[i];
    if (sc.w < 0.5) continue;
    float vis = textureLod(tProbe, vec2((float(i) + 2.5) / ${(EYE_N + 2).toFixed(1)}, 0.5), 0.0).r;
    if (vis < 0.002) continue;
    vec4 sd = uSrcDir[i];
    float th = degrees(2.0 * asin(clamp(0.5 * length(ray - sd.xyz), 0.0, 1.0)));
    if (th > 60.0) continue;
    float th0 = max(th, max(degrees(uSrcInfo[i].w), 0.06));
    vec2 sp = sd.xy / max(-sd.z, 1e-4), q = rp - sp;
    float phi = atan(q.y, q.x * 1.0);
    float inner = 10.0 / (th0 * th0 * th0) + 5.0 / (th0 * th0) * uAgeK;
    // (the corona: a share of the inner spread gathered into the needles)
    float g = (psf(th0) + kCor * inner * (needles(phi < 0.0 ? phi + 6.2831853 : phi, th0) - 1.0)) * (1.0 + 1.5 * uTear);
    vec3 e = sc.rgb * vis * max(g, 0.0);
    // the lenticular halo: yellow at 3.1 deg, each colour at a radius in proportion to its wavelength (red outside)
    vec3 R = vec3(610.0, 545.0, 465.0) / 575.0 * 3.1;
    vec3 ring = exp(-pow((vec3(th) - R) / 0.2, vec3(2.0)));
    e += sc.rgb * vis * kHalo * 0.9 * ring;
    // squinting: the slit of the lids and the lashes draw it out into long vertical streaks
    if (uSquint > 0.001) {
      float dx = abs(q.x) * 57.2958, dy = abs(q.y) * 57.2958 + 0.05;
      float sway = (vnoise(vec2(uTime * 3.0, float(i))) - 0.5) * 0.25 * uWind;
      float dxs = abs(q.x * 57.2958 - sway * q.y * 57.2958);
      e += sc.rgb * vis * uSquint * (1.6 / pow(dy, 1.15)) * exp(-dxs * 9.0) * (1.0 - smoothstep(4.0, 18.0, dy));
    }
    glare += e;
  }
  col += glare;
  // the lids: blurred, with the lashes, from above and below (a squint, an eye shutting for an instant)
  // (off the screen with the eyes open: their blurred edges come in as the lids close)
  float soft = 0.07;
  float top = 1.0 + soft - (0.3 + soft) * uSquint - 0.55 * uLid, bot = -soft + (0.18 + soft) * uSquint + 0.53 * uLid;
  // (the lashes, a centimetre from the eye: far out of focus - soft dark smudges along the lid's edge, the wind moving them)
  float lash = vnoise(vec2(vUv.x * 26.0 + 0.6 * sin(uTime * 2.1) * uWind, 3.0)) * 0.65 + vnoise(vec2(vUv.x * 57.0 - 0.4 * sin(uTime * 3.3) * uWind, 7.0)) * 0.35;
  float T = (1.0 - smoothstep(top - soft, top + soft * 0.6, vUv.y)) * smoothstep(bot - soft * 0.4, bot + soft, vUv.y);
  float lashBand = smoothstep(top - 0.16, top - 0.02, vUv.y) * (1.0 - smoothstep(top - 0.02, top + 0.05, vUv.y))
                 + (1.0 - smoothstep(bot + 0.01, bot + 0.1, vUv.y)) * smoothstep(bot - 0.04, bot + 0.01, vUv.y) * 0.6;
  T *= 1.0 - (0.22 + 0.2 * uSquint) * lashBand * smoothstep(0.3, 0.8, lash) * step(0.001, uSquint + uLid);
  if (uSquint + uLid > 0.001) col *= T;
  gl_FragColor = vec4(col, 1.0);
}`;

const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };

// The energy of the CIE spread between two angles (deg): ∫ Ψ dΩ, dΩ = 2π θ dθ (θ in rad)
function psfEnergy(a, b, p, ageK) {
  const F = (t) => -10 / t + (5 * Math.log(t) + 0.1 * p * t) * ageK + 0.0025 * p * t * t / 2;
  return 2 * Math.PI * (Math.PI / 180) ** 2 * (F(b) - F(a));
}

export class EyePass extends Pass {
  // tap: the scene's depth (post.js DepthTap; null on the lowest setting), veil: the frame's own glare (the pyramid)
  constructor(camera, tap, veil) {
    super();
    this.camera = camera; this.tap = tap; this.veil = veil;
    this.age = 25; this.p = 0.5;                       // (an average young observer, brown eyes)
    this.levels = 6;
    this.squint = 0; this.tear = 0; this.lid = 0; this.wind = 0; this.time = 0;
    this.abs = 26000; this.rest = 0; this.restW = 0;   // (main.js: cd/m2 per unit; the resting focus, D: the dark's, a white-out's)
    // (the frame's glare from what lies above the screen's white: ~1 after the exposure, before the tone curve's
    // shoulder - ACES shows ~0.8 there)
    this.white = 1;
    this.fresh = true;
    // the probe, two of them in turn
    const pw = EYE_N + 2;
    this.probes = [0, 1].map(() => new THREE.WebGLRenderTarget(pw, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false }));
    this.pi = 0;
    EYE.probe.value = this.probes[0].texture;
    const ageK = 1 + (this.age / 62.5) ** 4;
    this.srcDir = Array.from({ length: EYE_N }, () => new THREE.Vector4());
    this.srcInfo = Array.from({ length: EYE_N }, () => new THREE.Vector4());
    this.srcCol = Array.from({ length: EYE_N }, () => new THREE.Vector4());
    this.probeMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: PROBE_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tPrev: { value: null }, tDepth: { value: null }, tColor: { value: null }, uHasDepth: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 1000 },
        uDt: { value: 0.016 }, uAbs: { value: 1 }, uRest: { value: 0 }, uRestW: { value: 0 }, uFresh: { value: 1 }, uSrcDir: { value: this.srcDir }, uSrcInfo: { value: this.srcInfo },
        uSrcCol: { value: this.srcCol }, uP: { value: this.p }, uAgeK: { value: ageK }, uProj: { value: new THREE.Matrix4() } } });
    this.probeQuad = new FullScreenQuad(this.probeMat);
    this.downMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: DOWN_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 }, uT: { value: 1 } } });
    this.upMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: UP_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tCoarse: { value: null }, tHere: { value: null }, uTexel: { value: new THREE.Vector2() }, uW: { value: 0 }, uHasCoarse: { value: 0 } } });
    this.downQuad = new FullScreenQuad(this.downMat);
    this.upQuad = new FullScreenQuad(this.upMat);
    this.down = []; this.up = []; this.w = new Array(this.levels + 1).fill(0); this.scat = 0;
    if (veil) for (let k = 1; k <= this.levels; k++) { this.down[k] = new THREE.WebGLRenderTarget(1, 1, rtOpts); this.up[k] = new THREE.WebGLRenderTarget(1, 1, rtOpts); }
    this.soft = veil ? null : new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.comp = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMP_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, tVeil: { value: null }, tSoft: { value: null }, tProbe: EYE.probe, uVeilOn: { value: veil ? 1 : 0 }, uScat: { value: 0 },
        uP: { value: this.p }, uAgeK: { value: ageK }, uTime: { value: 0 }, uSquint: { value: 0 }, uTear: { value: 0 }, uLid: { value: 0 }, uAspect: { value: 1 },
        uOn: EYE.on, uWind: { value: 0 }, uT: { value: 1 }, uTexel: { value: new THREE.Vector2() }, uProjInv: { value: new THREE.Matrix4() },
        uSrcDir: { value: this.srcDir }, uSrcInfo: { value: this.srcInfo }, uSrcCol: { value: this.srcCol } } });
    this.compQuad = new FullScreenQuad(this.comp);
    this.size = new THREE.Vector2(1, 1);
    this.fovKey = '';
  }

  setSize(w, h) {
    this.size.set(w, h);
    if (this.veil) for (let k = 1; k <= this.levels; k++) {
      const s = 2 ** k;
      this.down[k].setSize(Math.max(1, Math.round(w / s)), Math.max(1, Math.round(h / s)));
      this.up[k].setSize(Math.max(1, Math.round(w / s)), Math.max(1, Math.round(h / s)));
    }
    if (this.soft) this.soft.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    this.comp.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.fovKey = '';
  }

  // The pyramid's weights: the CIE spread's energy in each band of angles a level stands for (a level k blur is about
  // 2^k pixels wide), from the angle of one pixel, so the glare's reach is the same at any resolution and field of view.
  weights() {
    const key = this.size.x + 'x' + this.size.y + '@' + this.camera.fov.toFixed(3) + '/' + this.camera.zoom.toFixed(3);
    if (key === this.fovKey) return;
    this.fovKey = key;
    const fovY = 2 * Math.atan(Math.tan(this.camera.fov * Math.PI / 360) / this.camera.zoom) * 180 / Math.PI;
    const px = fovY / this.size.y, ageK = 1 + (this.age / 62.5) ** 4;
    let sum = 0;
    for (let k = 1; k <= this.levels; k++) {
      const a = Math.max(0.1, px * 2 ** (k - 0.5)), b = k === this.levels ? 60 : px * 2 ** (k + 0.5);
      this.w[k] = b > a ? psfEnergy(a, b, this.p, ageK) : 0;
      sum += this.w[k];
    }
    this.scat = sum;
  }

  // lights: [{ dir: Vector3 (world, unit, towards it), dist (m, 0: the sky), E (its illuminance at the eye, scene units),
  //   color: [r, g, b], test: 0 depth / 1 the sky's disk, disk: the disk's expected luminance, radius (rad) }]
  setLights(lights) {
    const V = this.camera.matrixWorldInverse;
    for (let i = 0; i < EYE_N; i++) {
      const l = lights[i];
      if (!l || l.E <= 0) { this.srcInfo[i].x = 0; this.srcCol[i].w = 0; continue; }
      const d = _v.copy(l.dir).transformDirection(V);
      this.srcDir[i].set(d.x, d.y, d.z, l.dist);
      this.srcInfo[i].set(1, l.test, l.disk ?? 1, l.radius ?? 0.002);
      this.srcCol[i].set(l.color[0] * l.E, l.color[1] * l.E, l.color[2] * l.E, 1);
    }
  }

  render(renderer, writeBuffer, readBuffer, deltaTime) {
    const dt = Math.min(0.1, Math.max(1e-3, deltaTime || 0.016));
    this.time += dt;
    const cam = this.camera;
    // the probe
    const pu = this.probeMat.uniforms, next = 1 - this.pi;
    pu.tPrev.value = this.probes[this.pi].texture;
    pu.tDepth.value = this.tap?.tex ?? null; pu.uHasDepth.value = this.tap?.tex ? 1 : 0;
    pu.tColor.value = readBuffer.texture;
    pu.uNear.value = cam.near; pu.uFar.value = cam.far; pu.uDt.value = dt; pu.uAbs.value = this.abs; pu.uRest.value = this.rest; pu.uRestW.value = this.restW;
    pu.uFresh.value = this.fresh ? 1 : 0; this.fresh = false;
    pu.uProj.value.copy(cam.projectionMatrix);
    renderer.setRenderTarget(this.probes[next]);
    this.probeQuad.render(renderer);
    this.pi = next;
    EYE.probe.value = this.probes[next].texture;
    // the pyramid
    if (this.veil) {
      this.weights();
      const dm = this.downMat.uniforms;
      dm.uT.value = this.comp.uniforms.uT.value = this.white / Math.max(renderer.toneMappingExposure, 1e-3);
      let src = readBuffer.texture, sw = readBuffer.width, sh = readBuffer.height;
      for (let k = 1; k <= this.levels; k++) {
        dm.tSrc.value = src; dm.uTexel.value.set(1 / sw, 1 / sh); dm.uFirst.value = k === 1 ? 1 : 0;
        renderer.setRenderTarget(this.down[k]); this.downQuad.render(renderer);
        src = this.down[k].texture; sw = this.down[k].width; sh = this.down[k].height;
      }
      const um = this.upMat.uniforms;
      for (let k = this.levels; k >= 1; k--) {
        const coarse = k < this.levels ? this.up[k + 1] : null;
        um.tCoarse.value = coarse ? coarse.texture : null; um.uHasCoarse.value = coarse ? 1 : 0;
        if (coarse) um.uTexel.value.set(1 / coarse.width, 1 / coarse.height);
        um.tHere.value = this.down[k].texture; um.uW.value = this.w[k];
        renderer.setRenderTarget(this.up[k]); this.upQuad.render(renderer);
      }
    } else {
      const dm = this.downMat.uniforms;
      dm.tSrc.value = readBuffer.texture; dm.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height); dm.uFirst.value = 1; dm.uT.value = 0;
      renderer.setRenderTarget(this.soft); this.downQuad.render(renderer);
    }
    // the picture
    const cu = this.comp.uniforms;
    cu.tDiffuse.value = readBuffer.texture;
    cu.tVeil.value = this.veil ? this.up[1].texture : null;
    cu.tSoft.value = this.veil ? this.down[1].texture : this.soft.texture;
    cu.uScat.value = this.scat;
    cu.uTime.value = this.time; cu.uSquint.value = this.squint; cu.uTear.value = this.tear; cu.uLid.value = this.lid; cu.uWind.value = this.wind;
    cu.uProjInv.value.copy(cam.projectionMatrixInverse);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compQuad.render(renderer);
  }

  dispose() {
    for (const r of [...this.probes, ...this.down.filter(Boolean), ...this.up.filter(Boolean), this.soft].filter(Boolean)) r.dispose();
    for (const m of [this.probeMat, this.downMat, this.upMat, this.comp]) m.dispose();
  }
}
const _v = new THREE.Vector3();

// The eye's own state through the game: squinting into a blizzard, a flake in the eye, watering in the cold wind.
// ctx: { dt, storm (0-1), snow (0-1, falling), gale (m/s), windDir (Vector2, world x/z, where it blows to),
//        look (Vector3, the view's direction), outdoors (bool), shelter (0-1), on (bool) }
export class EyeState {
  constructor() { this.squint = 0; this.tear = 0; this.lid = 0; this.hitT = -1; this.cool = 0; this.hits = 0; }
  update(c) {
    const dt = Math.min(0.1, c.dt);
    if (!c.on || !c.outdoors) { this.squint = Math.max(0, this.squint - dt * 2); this.tear = Math.max(0, this.tear - dt / 1.5); this.lid = 0; this.hitT = -1; return this; }
    const wl = Math.hypot(c.windDir.x, c.windDir.y) || 1;
    // facing the wind: the view against where it comes from (1 straight into it)
    const facing = Math.max(0, -(c.look.x * c.windDir.x + c.look.z * c.windDir.y) / wl / (Math.hypot(c.look.x, c.look.z) || 1));
    const exposed = (1 - c.shelter) * Math.min(1, c.gale / 14);
    const want = c.storm * c.snow * exposed * Math.min(1, facing * 1.6);
    this.squint += (want - this.squint) * (1 - Math.exp(-dt / (want > this.squint ? 0.35 : 0.8)));
    // a flake in the eye: into the wind in a blizzard, or looking up into the falling snow (rarely)
    const up = Math.max(0, c.look.y);
    const rate = c.snow * (c.storm * exposed * facing * 0.05 + 0.02 * Math.max(0, up - 0.35) / 0.65);   // (per second)
    this.cool = Math.max(0, this.cool - dt);
    if (this.hitT < 0 && this.cool <= 0 && Math.random() < rate * dt) { this.hitT = 0; this.hits++; this.cool = 4; }
    if (this.hitT >= 0) {
      this.hitT += dt;
      const t = this.hitT;
      // it shuts in ~0.06 s, stays ~0.05 s, opens in ~0.22 s (a reflex blink, quicker than a voluntary one's 0.57 s:
      // Kwon et al. 2013) - drawn only most of the way: the brain blanks out a blink (Volkmann et al. 1980)
      this.lid = 0.8 * (t < 0.06 ? t / 0.06 : t < 0.11 ? 1 : t < 0.33 ? 1 - (t - 0.11) / 0.22 : 0);
      if (t > 0.06) this.tear = Math.max(this.tear, 1);
      if (t >= 0.33) this.hitT = -1;
    } else this.lid = 0;
    // the cold wind waters the eyes a little; the tears clear in a couple of seconds
    const base = 0.22 * c.storm * c.snow * exposed * facing;
    this.tear = this.tear > base ? Math.max(base, this.tear - dt / 1.6) : this.tear + (base - this.tear) * (1 - Math.exp(-dt / 3));
    return this;
  }
}
