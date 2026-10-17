import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { profileAt } from './cars.js';

// The windshield in the rain (V63), from the driver's seat. The drops are worked out on the glass itself (a plane
// through the windshield of the car you drive, in metres), so they stay on it when you look round.
//  * The drops that land: as many as the rain brings (Marshall-Palmer: N(D) = 8000 e^(-Λ D) per m³ per mm,
//    Λ = 4.1 R^-0.21 per mm) times how fast they hit the glass - their fall (Atlas: 9.65 - 10.3 e^(-0.6 D) m/s) on its
//    slope and, driving, the car's speed into them: standing in a 40 mm/h downpour ~7 000 per m² per s land on the
//    Maybach's windshield (34° from level), at 70 km/h ~36 000. Each sits as a cap of radius ~0.63 D (a half sphere of
//    the same water).
//  * What it collects merges: where ~1 cm² has gathered the water of a 2-4.5 mm drop, there is one (and 0.8-2 mm ones
//    between, the small ones they swallowed gone); where 2.6 cm across has gathered a 3.5 mm one, it is heavy enough to
//    slide: it runs down the slope in fits and starts, along a wavering path, leaving a trail of small beads; driving
//    fast (over ~50 km/h) the air pushes it up instead.
//  * Every drop is a little ball lens: through it the view behind, small and turned over, darkened at its rim (light
//    past ~50° in it is reflected back inside: the dark of the car). The eye focused on the road sees it out of focus:
//    blurred over about the pupil's width (3 mm by day, 6 mm at night) - the small ones a soft speckle, the big ones
//    soft blobs.
//  * Two wipers in tandem (left-hand drive), swept on the linkage's near-sine stroke: in a downpour fast (55 a minute),
//    in steady rain slow (38; FMVSS 104: high >= 45, low >= 20 a minute), in a drizzle once every few seconds; their
//    blades, black against the light, push a wedge of water ahead and leave the glass clear (with a thin smear that
//    dries in a fraction of a second) for the drops to land on again. What they don't reach (the upper corners) fills.
// A pass over the frame (post.js), on only in the cockpit of a car (not the ATV) in the rain.

const NB = 64;                                  // the wipers' angular bins: when each was last wiped
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
const FRAG = /* glsl */`
#define PI 3.14159265
#define NB ${NB}
uniform sampler2D tDiffuse, uWipe;
uniform vec3 uNow;                    // (s, drops landed per m², water landed in m) since the car was in the rain
uniform float uPupil, uLam, uLv, uRunD, uRunDir, uDim;
uniform vec2 uTan, uHw, uAng, uAngV;
uniform vec3 uO, uU, uV, uN;          // the glass in view space: its bottom middle, across, up the slope, its normal
uniform vec4 uW0, uW1;                // each wiper: its pivot (across, up the slope; m), its blade from, to (m)
varying vec2 vUv;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// since a point g of the glass was last wiped by one wiper: (s, drops per m², water in m)
vec3 since(vec2 g, vec4 w, int k) {
  vec2 d = g - w.xy; float r = length(d), a = atan(d.y, d.x);
  if (r < w.z || r > w.w || a < 0.0) return uNow;
  int b = int(clamp(a / PI * float(NB), 0.0, float(NB - 1)));
  return uNow - texelFetch(uWipe, ivec2(b, k), 0).rgb;
}
// how much a cap of radius r at distance l covers, seen out of focus (blur radius e)
float cover(float l, float r, float e) { return clamp((r + e - l) / (2.0 * e), 0.0, 1.0) * min(1.0, r * r / (e * e)); }
// best: the drop that covers this point most: (where in it -1..1, coverage, its radius)
void take(inout vec4 best, vec2 d, float r, float e) {
  float c = cover(length(d), r, e);
  if (c > best.z) best = vec4(d / r, c, r);
}
// the drops as they land (two a cell at most; a few drops later each has merged with its neighbours into the bigger
// ones below)
void small(vec2 g, float n, float e, inout vec4 best) {
  const float C = 0.0045;
  vec2 c = floor(g / C);
  float landed = n * C * C;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) for (int s = 0; s < 2; s++) {
    vec2 id = c + vec2(float(i), float(j)), k = id + float(s) * 37.0;
    float at = float(s) + h21(k);
    if (at > landed || landed > at + 3.0 + 4.0 * h21(k + 1.9)) continue;
    float D = min(3.0, 0.25 - log(1.0 - 0.97 * h21(k + 3.7)) / uLam);
    take(best, g - (id + vec2(h21(k + 7.3), h21(k + 11.1))) * C, 6.3e-4 * D, e);
  }
}
// the drops they merge into: big ones (2-4.5 mm) with middling ones (0.8-2 mm) between, not every cell holding one
void merged(vec2 g, float q, float e, float C, float r0, float r1, float salt, inout vec4 best) {
  vec2 c = floor(g / C);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = c + vec2(float(i), float(j)), k = id + salt;
    if (h21(k + 4.4) > 0.72) continue;
    float r = mix(r0, r1, pow(h21(k), 1.6));
    if (2.0 / 3.0 * PI * r * r * r / (C * C) * (0.6 + 0.8 * h21(k + 2.9)) > q) continue;
    take(best, g - (id + 0.15 + 0.7 * vec2(h21(k + 5.1), h21(k + 8.7))) * C, r, e);
  }
}
// the ones heavy enough to run, each in its column, with its trail
void runners(vec2 g, float q, float e, inout vec4 best) {
  const float W = 0.026;
  float col = floor(g.x / W), h = h21(vec2(col, 91.7));
  if (h > 0.62 || 9.0e-8 / (W * W) * (0.7 + 0.6 * h) > q) return;
  // how far it has run (uRunD: the same for all, m, down < 0 < up), its own pace, in lurches
  float D = uRunD * (0.6 + 0.8 * h) + h * 9.0;
  D += 0.007 * sin(D * 140.0 + h * 30.0);
  float span = uLv + 0.12, y = mod(D, span) - 0.06;
  float x = (col + 0.5 + 0.4 * (h - 0.5)) * W + 0.004 * sin(g.y * 26.0 + h * 10.0);
  vec2 d = vec2(g.x - x, g.y - y);
  d.y -= span * floor(d.y / span + 0.5);
  take(best, vec2(d.x, d.y * 0.78), 2.6e-3, e);
  // the trail: behind it, beads every ~4 mm, smaller the older
  float back = -d.y * uRunDir;
  if (back > 0.004 && back < 0.15) {
    float yb = (floor(g.y / 0.004) + 0.5) * 0.004;
    take(best, vec2(g.x - x, g.y - yb), (1.1 - 6.0 * back) * 1e-3 * (0.7 + 0.5 * h21(vec2(col, floor(g.y / 0.004)))), e);
  }
}
// a wiper: its blade and arm black against the light, the water it pushes along ahead of it
void wiper(vec2 g, vec4 w, float a, float av, float e, inout float dark, inout vec4 best) {
  vec2 d = g - w.xy, u = vec2(cos(a), sin(a));
  float along = dot(d, u), across = dot(d, vec2(-u.y, u.x));
  if (along < 0.0 || along > w.w + 0.015) return;
  float hw = along > w.z - 0.02 ? 0.011 : 0.007;             // (the blade on its beam, the arm by the pivot)
  dark = max(dark, clamp((hw + e - abs(across)) / (2.0 * e), 0.0, 1.0) * min(1.0, hw / e));
  float ahead = across * sign(av) - hw;
  if (along > w.z && along < w.w && abs(av) > 0.2 && ahead > 0.0 && ahead < 0.007) {
    vec2 n = vec2(-u.y, u.x) * sign(av) * (ahead / 0.0035 - 1.0);
    float c = 0.75 * smoothstep(0.0, 0.002, ahead) * smoothstep(0.007, 0.005, ahead);
    if (c > best.z) best = vec4(n * 0.8, c, 0.0035);
  }
}
vec3 tap(vec2 uv) { return texture2D(tDiffuse, clamp(uv, vec2(0.001), vec2(0.999))).rgb; }
void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  // where this pixel's ray meets the glass, and the size of a pixel there (before any branch: derivatives)
  vec3 ray = vec3((vUv.x * 2.0 - 1.0) * uTan.x, (vUv.y * 2.0 - 1.0) * uTan.y, -1.0);
  float dn = dot(ray, uN), t = dot(uO, uN) / (abs(dn) > 1e-6 ? dn : 1e-6);
  vec3 hit = ray * t - uO;
  vec2 g = vec2(dot(hit, uU), dot(hit, uV));
  float px = length(fwidth(g));
  gl_FragColor = vec4(base.rgb, 1.0);
  if (t <= 0.0) return;
  float e = max(uPupil * 0.5, px * 0.7);
  float hw = mix(uHw.x, uHw.y, clamp(g.y / uLv, 0.0, 1.0));
  float inG = clamp((g.y + e) / (2.0 * e), 0.0, 1.0) * clamp((uLv - g.y + e) / (2.0 * e), 0.0, 1.0) * clamp((hw - abs(g.x) + e) / (2.0 * e), 0.0, 1.0);
  if (inG <= 0.0) return;
  vec3 s0 = since(g, uW0, 0), s1 = since(g, uW1, 1), s = min(s0, s1);
  vec4 best = vec4(0.0);
  small(g, s.y, e, best);
  merged(g, s.z, e, 0.011, 2.0e-3, 4.5e-3, 51.3, best);
  merged(g, s.z * 2.0, e, 0.0062, 0.8e-3, 2.0e-3, 13.7, best);
  runners(g, s.z, e, best);
  float dark = 0.0;
  wiper(g, uW0, uAng.x, uAngV.x, e, dark, best);
  wiper(g, uW1, uAng.y, uAngV.y, e, dark, best);
  // just wiped: the thin film the rubber leaves, in fine arcs, dries in a fraction of a second
  vec3 col = base.rgb;
  float film = exp(-s.x / 0.12) * step(s.x, 0.6);
  if (film > 0.01) {
    float r = length(g - (s0.x < s1.x ? uW0.xy : uW1.xy));
    col = tap(vUv + vec2(0.0, 0.0016 * film * sin(r * 2300.0 + 4.0 * sin(r * 310.0))));
  }
  if (best.z > 0.002) {
    // through the drop: the view behind it turned over and shrunk (~a fifth of the frame across), blurred like the
    // drop itself, dark at its rim
    vec2 n = best.xy / max(1.0, length(best.xy)), k = vec2(uTan.y / uTan.x, 1.0);
    vec2 suv = vUv - n * 0.2 * k;
    float bl = 0.2 * clamp(e / max(best.w, 1e-4), 0.08, 1.0) * 0.5;
    vec3 lc = (tap(suv) * 2.0 + tap(suv + vec2(bl, 0.0) * k) + tap(suv - vec2(bl, 0.0) * k) + tap(suv + vec2(0.0, bl)) + tap(suv - vec2(0.0, bl))) / 6.0;
    float rim = smoothstep(0.55, 1.0, length(best.xy));
    lc = mix(lc, lc * 0.08 + vec3(0.004), rim * 0.9) * uDim;
    col = mix(col, lc, best.z);
  }
  col = mix(col, vec3(0.008), dark);
  gl_FragColor.rgb = mix(base.rgb, col, inG);
}`;

const _B = new THREE.Vector3(), _T = new THREE.Vector3(), _X = new THREE.Vector3(), _MV = new THREE.Matrix4(), _n = new THREE.Vector3();

export class WindshieldPass extends Pass {
  constructor() {
    super();
    this.wipe = new THREE.DataTexture(new Float32Array(NB * 2 * 4), NB, 2, THREE.RGBAFormat, THREE.FloatType);
    this.wipe.needsUpdate = true;
    const v2 = () => ({ value: new THREE.Vector2() }), v3 = () => ({ value: new THREE.Vector3() });
    this.u = {
      tDiffuse: { value: null }, uWipe: { value: this.wipe }, uNow: v3(),
      uPupil: { value: 0.003 }, uLam: { value: 2 }, uLv: { value: 0.9 }, uRunD: { value: 0 }, uRunDir: { value: -1 }, uDim: { value: 0.96 },
      uTan: v2(), uHw: v2(), uAng: v2(), uAngV: v2(), uO: v3(), uU: v3(), uV: v3(), uN: v3(),
      uW0: { value: new THREE.Vector4() }, uW1: { value: new THREE.Vector4() },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.material);
    this.enabled = false;
    this.now = null;                 // [s, drops per m², water m] since the car was in the rain
    this.phase = 0; this.pause = 0; this.ang = [0.07, 0.07]; this.mode = 'off'; this.model = null; this.s0 = 0;
  }
  // o: { on (in a car's cockpit), rate (mm/h), car (the Vehicle), camera, pupil (m) }
  update(dt, o) {
    const car = o.car, m = car?.m;
    const on = !!(o.on && m && m.wind && !m.seat && o.rate > 0.05);
    this.enabled = on;
    if (!on) return;
    const u = this.u, cam = o.camera;
    // the glass: a plane from the middle of the windshield's lower edge (where the body turns to glass: cars.js) to the
    // middle of its upper edge (car frame); the wipers sized by its full width, at the top
    if (this.model !== m) {
      let s0 = m.wind[0];
      while (s0 < m.wind[1] - 0.2 && profileAt(m, s0).cab < 0.3) s0 += 0.01;
      this.model = m; this.s0 = s0;
    }
    const s0 = this.s0, s1 = m.wind[1] - 0.03, p0 = profileAt(m, s0), p1 = profileAt(m, s1);
    const hwOf = (p) => { const hwr = Math.min(m.hwr, p.hw * 0.9); return p.hw * 0.25 + (hwr * 0.84 - p.hw * 0.25) * Math.min(1, p.cab); };
    _B.set(0, p0.roof + 0.008, s0 - m.L / 2); _T.set(0, p1.roof + 0.008, s1 - m.L / 2);
    const Lv = _B.distanceTo(_T), hwB = hwOf(p0), hwT = hwOf(p1), Wg = 2 * hwT;
    // its outward normal (forward and up) in the car's frame, for how hard the rain hits it
    _n.subVectors(_T, _B).cross(_X.set(1, 0, 0)).normalize();
    const R = o.rate, lam = 4.1 * Math.pow(R, -0.21), Dm = 0.25 + 1 / lam;
    const vf = Math.max(1, 9.65 - 10.3 * Math.exp(-0.6 * Dm));
    const imp = Math.max(0, vf * _n.y - (car.speed ?? 0) * _n.z);          // (m/s into the glass)
    const flux = 8000 / lam * Math.exp(-0.25 * lam) * imp;                 // drops over 0.25 mm per m² per s
    const qv = R / 3.6e6 * imp / vf;                                       // water per m² per s (m/s)
    this.flux = flux; this.slope = Math.acos(Math.min(1, _n.y)) * 180 / Math.PI;
    // a car that has stood in the rain: its glass all over drops when you get in
    if (!this.now) this.now = [300, flux * 300, qv * 300];
    const now = this.now;
    now[0] += dt; now[1] += flux * dt; now[2] += qv * dt;
    u.uNow.value.set(now[0], now[1], now[2]);
    // the drops that run: down the slope (~3 cm/s), held by the air at ~50 km/h, pushed up past it
    const sp = Math.abs(car.speed ?? 0), air = THREE.MathUtils.smoothstep(sp, 10, 22);
    const run = -0.035 * (1 - air) + 0.22 * air * air;
    u.uRunD.value += dt * run; u.uRunDir.value = run < 0 ? -1 : 1;
    // the wipers: by how fast the glass fills (a drop on every 4.5 mm in t1 seconds)
    const t1 = 1 / Math.max(1e-6, flux * 0.0045 * 0.0045);
    this.mode = t1 < 2.2 ? 'fast' : t1 < 9 ? 'slow' : 'int';
    const period = this.mode === 'fast' ? 60 / 55 : 60 / 38;
    const W = [[-0.3 * Wg, -0.04, 0.18 * Wg, Math.min(0.66 * Wg, 1.02 * Lv)], [0.06 * Wg, -0.04, 0.12 * Wg, Math.min(0.48 * Wg, 0.82 * Lv)]];
    const top = [1.85, 1.65], A0 = 0.07;
    const prev = this.ang.slice(), av = [0, 0];
    if (this.pause > 0) this.pause -= dt;
    else {
      this.phase += dt / period;
      if (this.phase >= 1) { this.phase = 0; if (this.mode === 'int') this.pause = Math.min(9, Math.max(2, 0.35 * t1)); }
      const k = this.phase < 0.5 ? this.phase * 2 : 2 - this.phase * 2, f = 0.5 - 0.5 * Math.cos(Math.PI * k);
      for (let i = 0; i < 2; i++) { this.ang[i] = A0 + (top[i] - A0) * f; av[i] = (this.ang[i] - prev[i]) / Math.max(dt, 1e-4); }
    }
    // the glass they went over since the last frame is clear now
    const d = this.wipe.image.data;
    let swept = false;
    for (let i = 0; i < 2; i++) {
      const lo = Math.min(prev[i], this.ang[i]) - 0.03, hi = Math.max(prev[i], this.ang[i]) + 0.03;
      if (Math.abs(this.ang[i] - prev[i]) < 1e-5) continue;
      for (let b = 0; b < NB; b++) {
        const a = (b + 0.5) / NB * Math.PI;
        if (a < lo || a > hi) continue;
        const j = (i * NB + b) * 4;
        d[j] = now[0]; d[j + 1] = now[1]; d[j + 2] = now[2]; swept = true;
      }
    }
    if (swept) this.wipe.needsUpdate = true;
    u.uAng.value.set(this.ang[0], this.ang[1]); u.uAngV.value.set(av[0], av[1]);
    u.uW0.value.set(...W[0]); u.uW1.value.set(...W[1]);
    u.uLv.value = Lv; u.uHw.value.set(hwB, hwT); u.uLam.value = lam; u.uPupil.value = o.pupil ?? 0.003;
    // the glass in the camera's frame
    const piv = car.car.bodyPivot;
    piv.updateWorldMatrix(true, false); cam.updateMatrixWorld();
    _MV.multiplyMatrices(cam.matrixWorldInverse, piv.matrixWorld);
    const O = u.uO.value.copy(_B).applyMatrix4(_MV);
    u.uV.value.copy(_T).applyMatrix4(_MV).sub(O).normalize();
    u.uU.value.copy(_B).add(_X.set(1, 0, 0)).applyMatrix4(_MV).sub(O).normalize();
    u.uN.value.crossVectors(u.uU.value, u.uV.value).normalize();
    const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    u.uTan.value.set(ty * cam.aspect, ty);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.u.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); this.wipe.dispose(); }
}
