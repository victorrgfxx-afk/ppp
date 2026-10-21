import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { WIND } from './util.js';

// Temporal anti-aliasing: the far things smooth, the way an eye or a camera sees them.
// One sample per pixel, at its centre, shows a thing smaller than a pixel - a far tree's twig, a power line 300 m off, a
// blade of grass 40 m away - whole or not at all, and which of the two jumps from frame to frame as the view moves: the
// distance crawls with speckle and the wires break into dots. A lens and a retina integrate the light over the whole
// pixel; TAA does the same over time (Karis 2014, "High Quality Temporal Supersampling"; Salvi 2016; Pedersen 2016):
//  * each frame the projection is shifted by a sub-pixel offset (Halton 2,3; 8 positions), the far relief's too;
//  * the new frame is resampled at the pixel centres (a Blackman-Harris-like Gaussian over the 3x3 samples);
//  * last frame's result is fetched where this pixel's point was then (its depth reprojected through last frame's
//    camera; the car you drive by its own motion, so the cockpit and the car you follow do not smear; the sky and the
//    far relief by their direction), with a Catmull-Rom filter (no softening as it is resampled frame after frame);
//  * what the history holds is clipped to the colour range of this pixel's neighbourhood now (variance clipping in
//    YCoCg: a thing that moved or appeared leaves no ghost), the colours squeezed by 1/(1 + luma/4) so a few very bright
//    pixels (glints) do not dominate, while the scene's usual range stays nearly linear (1/(1 + luma) would darken and
//    thicken a dark wire against the sky: measured on a test edge, it moves a black-white edge 0.2 px into the white,
//    this 0.06 px);
//  * ~10% of the new frame goes into the result each frame (all of it where the history is off the screen, or after a
//    cut).
// It runs after the reflections and the ambient occlusion (so they are smoothed too) and before the haze's blur, the
// bloom and the tone curve. The falling rain and snow, the tyres' spray, the water off the eaves and the snow powder off
// the spruces move too fast and too thin to be followed: they are drawn after it (a scene of their own), into the
// result, against the scene's depth. The frame's alpha (the haze's share: post.js) is kept and smoothed alike.
export const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
const KEEP = /* glsl */`
uniform sampler2D tDepth;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tDepth, vUv).r, 0.0, 0.0, 1.0); }`;
const RESOLVE = /* glsl */`
uniform sampler2D tCur, tHist, tDepth;
uniform mat4 uInvProj, uToPrev, uCarLocal, uCarToPrev;
uniform vec3 uCarMin, uCarMax;
uniform vec2 uTexel, uJit;
uniform float uCarOn, uReset, uAlpha, uGamma, uTmK, uFilterK, uWind, uRespK;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 tm(vec3 c) { return c / (1.0 + uTmK * lum(c)); }
vec3 itm(vec3 c) { return c / max(1.0 - uTmK * lum(c), 1e-4); }
vec3 ycocg(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
vec3 rgb(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
// where the point drawn at uv (depth d, this frame's shifted projection) was on the screen last frame
vec2 reproject(vec2 uv, float d) {
  vec4 pc;
  if (d >= 1.0) {                                   // (the sky, the far relief: by direction)
    vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    pc = uToPrev * vec4(v.xyz / v.w, 0.0);
  } else {
    vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    v /= v.w;
    pc = uToPrev * v;
    if (uCarOn > 0.5) {
      vec3 l = (uCarLocal * v).xyz;
      if (all(greaterThan(l, uCarMin)) && all(lessThan(l, uCarMax))) pc = uCarToPrev * v;
    }
  }
  return pc.w > 1e-6 ? pc.xy / pc.w * 0.5 + 0.5 : vec2(-9.0);
}
vec4 catmullRom(vec2 uv) {
  vec2 sp = uv / uTexel, tp = floor(sp - 0.5) + 0.5, f = sp - tp;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, t12 = (tp + w2 / w12) * uTexel, t0 = (tp - 1.0) * uTexel, t3 = (tp + 2.0) * uTexel;
  vec4 r = texture2D(tHist, vec2(t12.x, t0.y)) * (w12.x * w0.y) + texture2D(tHist, vec2(t0.x, t12.y)) * (w0.x * w12.y)
         + texture2D(tHist, t12) * (w12.x * w12.y) + texture2D(tHist, vec2(t3.x, t12.y)) * (w3.x * w12.y)
         + texture2D(tHist, vec2(t12.x, t3.y)) * (w12.x * w3.y);
  return r / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y);
}
void main() {
  vec3 m1 = vec3(0.0), m2 = vec3(0.0), mn = vec3(1e9), mx = vec3(-1e9), acc = vec3(0.0);
  float amn = 1e9, amx = -1e9, aacc = 0.0, wsum = 0.0, dmin = 2.0, sway = 0.0;
  vec2 uvc = vUv;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j)), uv = vUv + o * uTexel;
    vec4 c = texture2D(tCur, uv);
    if (c.a < 0.0) { sway = 1.0; c.a = -c.a; }
    vec3 t = tm(max(c.rgb, 0.0)), y = ycocg(t);
    m1 += y; m2 += y * y; mn = min(mn, y); mx = max(mx, y);
    amn = min(amn, c.a); amx = max(amx, c.a);
    // (that pixel's sample lies at its centre + this frame's offset: its distance from this pixel's centre)
    vec2 dd = o + uJit;
    float w = exp(-uFilterK * dot(dd, dd));
    acc += t * w; aacc += c.a * w; wsum += w;
    float d = texture2D(tDepth, uv).r;
    if (d < dmin) { dmin = d; uvc = uv; }          // (the nearest point around: its motion, so edges keep theirs)
  }
  vec3 cur = acc / wsum; float curA = aacc / wsum;
  vec2 prev = reproject(uvc, dmin);
  vec2 huv = vUv + prev - (uvc + uJit * uTexel);
  // (moving fast, the history is resampled every frame: a little more of the new frame keeps it sharp)
  float a = mix(uAlpha, 2.0 * uAlpha, clamp(length((huv - vUv) / uTexel) / 40.0, 0.0, 1.0));
  // what sways in the wind (leaves, grass: marked by the scene, materials.js addWind) moves by ~uRespK/distance pixels a
  // frame at the most (~0.24 m at 3.5 rad/s at a crown's top, ~0.1 m at 5 rad/s for the grass): keep at most ~1 px of trail
  if (sway > 0.5 && dmin < 1.0) {
    vec4 vp = uInvProj * vec4(uvc * 2.0 - 1.0, dmin * 2.0 - 1.0, 1.0);
    a = max(a, clamp(uRespK * uWind / length(vp.xyz / vp.w), uAlpha, 0.5));
  }
  if (uReset > 0.5 || any(lessThan(huv, vec2(0.0))) || any(greaterThan(huv, vec2(1.0)))) a = 1.0;
  vec4 h = a < 1.0 ? catmullRom(huv) : vec4(0.0);
  if (any(isnan(h)) || any(isinf(h))) { a = 1.0; h = vec4(0.0); }
  vec3 mu = m1 / 9.0, sig = sqrt(max(m2 / 9.0 - mu * mu, 0.0));
  vec3 bmn = max(mn, mu - uGamma * sig), bmx = min(mx, mu + uGamma * sig);
  // the history clipped toward the middle of this neighbourhood's colour box
  vec3 hy = ycocg(tm(max(h.rgb, 0.0))), ctr = 0.5 * (bmx + bmn), ext = max(0.5 * (bmx - bmn), vec3(1e-5)), dv = hy - ctr;
  vec3 r = abs(dv / ext);
  float k = max(r.x, max(r.y, r.z));
  if (k > 1.0) hy = ctr + dv / k;
  vec3 res = mix(rgb(hy), cur, a);
  float ra = mix(clamp(h.a, amn, amx), curA, a);
  gl_FragColor = vec4(itm(max(res, 0.0)), ra);
}`;
const COMP = /* glsl */`
uniform sampler2D tColor, tDepth;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tColor, vUv); gl_FragDepth = texture2D(tDepth, vUv).r; }`;

// a dissolve over a few frames: a per-pixel threshold that changes every frame (interleaved gradient noise, Jimenez
// 2014), which the anti-aliasing averages into a smooth cross-fade (the trees' switch from model to billboard,
// geo/trees.js); while it is off (SMAA) the switch is a hard one, as before
export const DITHER = { uDitherOn: { value: 0 }, uDitherFrame: { value: 0 } };
export const DITHER_GLSL = 'float ditherIGN() { vec2 p = gl_FragCoord.xy + 5.588238 * mod(uDitherFrame, 64.0); return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }';

const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const JIT = Array.from({ length: 8 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);
const _m = new THREE.Matrix4(), _carInv = new THREE.Matrix4();

// the projection's sub-pixel shift: first thing in the frame (the scene and the far relief are drawn with it)
export class TAAJitter extends Pass {
  constructor(taa) { super(); this.taa = taa; this.needsSwap = false; }
  render() { if (this.taa.enabled) { this.taa.jitter(); WIND.mark.value = 1; } }
}

export class TAAPass extends Pass {
  constructor(camera, tap, far) {
    super();
    this.camera = camera; this.tap = tap; this.far = far;
    this.alpha = 0.1;
    this.mover = null;                    // { obj, min: Vector3, max: Vector3 }: the car you drive (its own frame)
    this.fx = new THREE.Scene();          // drawn after the resolve (setFX)
    this.fxList = []; this.fxHome = null;
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.hist = [rt(), rt()]; this.cur = 0;
    this.depth = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.keepMat = new THREE.ShaderMaterial({ uniforms: { tDepth: { value: null } }, vertexShader: VERT, fragmentShader: KEEP, depthTest: false, depthWrite: false });
    this.resolve = new THREE.ShaderMaterial({ uniforms: { tCur: { value: null }, tHist: { value: null }, tDepth: { value: this.depth.texture },
      uInvProj: { value: new THREE.Matrix4() }, uToPrev: { value: new THREE.Matrix4() }, uCarLocal: { value: new THREE.Matrix4() }, uCarToPrev: { value: new THREE.Matrix4() },
      uCarMin: { value: new THREE.Vector3() }, uCarMax: { value: new THREE.Vector3() }, uTexel: { value: new THREE.Vector2() }, uJit: { value: new THREE.Vector2() },
      uCarOn: { value: 0 }, uReset: { value: 1 }, uAlpha: { value: 0.1 }, uGamma: { value: 1 }, uTmK: { value: 0.25 }, uFilterK: { value: 2.29 }, uWind: WIND.strength, uRespK: { value: 7 } }, vertexShader: VERT, fragmentShader: RESOLVE, depthTest: false, depthWrite: false });
    this.comp = new THREE.ShaderMaterial({ uniforms: { tColor: { value: null }, tDepth: { value: this.depth.texture } }, vertexShader: VERT, fragmentShader: COMP,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });
    this.quad = new FullScreenQuad(null);
    this.w = 1; this.h = 1; this.frame = 0;
    this.jit = new THREE.Vector2(); this.farJit = new THREE.Vector2(); this.jitted = false;
    this.clean = new THREE.Matrix4(); this.cleanInv = new THREE.Matrix4(); this.jInv = new THREE.Matrix4();
    this.prevProj = new THREE.Matrix4(); this.prevView = new THREE.Matrix4(); this.prevPos = new THREE.Vector3();
    this.prevCar = new THREE.Matrix4(); this.prevMover = null;
    this.valid = false; this.hasDepth = false;
    this.hook = (r, rb) => this.keepDepth(r, rb);
    this._on = false;
    this.enabled = true;
  }
  // (the scene's depth: DepthTap in post.js; the far relief's pass, shifted alike)
  attach(tap, far) {
    if (this.tap) this.tap.hooks.delete(this.hook);
    this.tap = tap; this.far = far;
    if (tap && this._on) tap.hooks.add(this.hook);
  }
  get enabled() { return this._on; }
  set enabled(on) {
    if (on === this._on) return;
    this._on = on; this.valid = false; DITHER.uDitherOn.value = on ? 1 : 0;
    if (this.tap) on ? this.tap.hooks.add(this.hook) : this.tap.hooks.delete(this.hook);
    this.moveFX();
  }
  // the things drawn after the resolve: out of the scene while it is on, back in it while it is off
  setFX(home, list) { this.fxHome = home; this.fxList = list.filter(Boolean); this.moveFX(); }
  moveFX() {
    if (!this.fxHome) return;
    const to = this._on ? this.fx : this.fxHome;
    for (const o of this.fxList) if (o.parent !== to) to.add(o);
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    for (const r of this.hist) r.setSize(w, h);
    this.depth.setSize(w, h);
    this.valid = false;
  }
  jitter() {
    const cam = this.camera, j = JIT[this.frame++ % JIT.length];
    DITHER.uDitherFrame.value = this.frame % 64;
    if (this.jitted) this.unjitter();
    this.clean.copy(cam.projectionMatrix); this.cleanInv.copy(cam.projectionMatrixInverse);
    this.jit.set(j[0], j[1]);
    const dx = 2 * j[0] / this.w, dy = 2 * j[1] / this.h;
    cam.projectionMatrix.elements[8] += dx; cam.projectionMatrix.elements[9] += dy;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    this.jInv.copy(cam.projectionMatrixInverse);
    if (this.far) this.far.jitter = this.farJit.set(dx, dy);
    this.jitted = true;
  }
  unjitter() {
    if (!this.jitted) return;
    this.camera.projectionMatrix.copy(this.clean); this.camera.projectionMatrixInverse.copy(this.cleanInv);
    if (this.far) this.far.jitter = null;
    this.jitted = false;
  }
  keepDepth(renderer, rb) {
    WIND.mark.value = 0;                  // (the scene pass is over: no other drawing marks what sways)
    if (!rb.depthTexture) return;
    this.keepMat.uniforms.tDepth.value = rb.depthTexture;
    this.quad.material = this.keepMat;
    renderer.setRenderTarget(this.depth);
    this.quad.render(renderer);
    this.hasDepth = true;
  }
  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera, jit = this.jitted;
    WIND.mark.value = 0;
    this.unjitter();
    if (!this.hasDepth) { this.passThrough(renderer, writeBuffer, readBuffer); return; }
    this.hasDepth = false;
    const u = this.resolve.uniforms;
    // a cut (a view picked, a jump into or out of a car): start again
    const reset = !this.valid || !jit || cam.position.distanceTo(this.prevPos) > 8;
    u.tCur.value = readBuffer.texture; u.tHist.value = this.hist[this.cur].texture;
    u.uInvProj.value.copy(this.jInv);
    // (camera-relative: this frame's view space -> last frame's clip space, worked out in double precision here)
    u.uToPrev.value.multiplyMatrices(this.prevProj, this.prevView).multiply(cam.matrixWorld);
    const mv = this.mover, obj = mv?.obj;
    u.uCarOn.value = obj ? 1 : 0;
    if (obj) {                            // (its world matrix is this frame's: the scene's are updated before it is drawn)
      _carInv.copy(obj.matrixWorld).invert();
      u.uCarLocal.value.multiplyMatrices(_carInv, cam.matrixWorld);
      if (this.prevMover !== obj) this.prevCar.copy(obj.matrixWorld);
      u.uCarToPrev.value.multiplyMatrices(this.prevProj, this.prevView).multiply(this.prevCar).multiply(_m.multiplyMatrices(_carInv, cam.matrixWorld));
      u.uCarMin.value.copy(mv.min); u.uCarMax.value.copy(mv.max);
      this.prevCar.copy(obj.matrixWorld);
    }
    this.prevMover = obj ?? null;
    u.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    u.uJit.value.copy(this.jit);
    u.uReset.value = reset ? 1 : 0; u.uAlpha.value = this.alpha;
    u.uRespK.value = 7 * readBuffer.height / 720;     // (the pixels a metre of sway spans grow with the frame's height)
    const out = this.hist[1 - this.cur];
    this.quad.material = this.resolve;
    renderer.setRenderTarget(out);
    this.quad.render(renderer);
    this.cur = 1 - this.cur;
    this.prevProj.copy(this.clean); this.prevView.copy(cam.matrixWorldInverse); this.prevPos.copy(cam.position);
    this.valid = true;
    // into the frame, with the scene's depth (for what is drawn after)
    this.comp.uniforms.tColor.value = out.texture;
    this.quad.material = this.comp;
    renderer.setRenderTarget(writeBuffer);
    this.quad.render(renderer);
    this.drawFX(renderer, writeBuffer);
  }
  // (no depth this frame: the frame as it is, and the history starts again)
  passThrough(renderer, writeBuffer, readBuffer) {
    this.comp.uniforms.tColor.value = readBuffer.texture;
    this.quad.material = this.comp;
    renderer.setRenderTarget(writeBuffer);
    this.quad.render(renderer);
    this.valid = false;
  }
  drawFX(renderer, target) {
    if (!this.fx.children.some(o => o.visible)) return;
    const ac = renderer.autoClear, sm = renderer.shadowMap.autoUpdate;
    renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    renderer.render(this.fx, this.camera);
    renderer.autoClear = ac; renderer.shadowMap.autoUpdate = sm;
  }
  dispose() { this.hist.forEach(r => r.dispose()); this.depth.dispose(); this.keepMat.dispose(); this.resolve.dispose(); this.comp.dispose(); this.quad.dispose(); }
}
