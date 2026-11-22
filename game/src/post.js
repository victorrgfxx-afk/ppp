import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { WindshieldPass } from './windshield.js';
import { CinePass } from './cinepass.js';
import { ShaftsPass } from './shafts.js';
import { VisionPass } from './vision.js';
import { TAAPass, TAAJitter } from './taa.js';
import { HeatShader } from './campfire.js';
import { EyePass } from './eye.js';

// the depth the scene pass has just drawn (the composer's two buffers take turns: whichever it was this frame)
// (hooks: passes further on that need the scene as the scene pass leaves it - its depth, its sky - take it here, before
// the full-screen passes in between overwrite that buffer's depth with their quads')
class DepthTap extends Pass {
  constructor() { super(); this.needsSwap = false; this.tex = null; this.hooks = new Set(); }
  render(renderer, writeBuffer, readBuffer) { this.tex = readBuffer.depthTexture; for (const h of this.hooks) h(renderer, readBuffer); }
}

// GTAO that ignores alpha-tested foliage/grass (they would render as solid quads in its normal pass).
// With the scene pass's own depth (tap), it draws nothing again: the normals are worked out from that depth, so the
// whole scene is drawn once a frame instead of twice (measured: ~2300 draws and ~2-3.5 M triangles a frame saved on
// high), and the leaves and grass count with their real cut-out shapes.
class FoliageSafeGTAO extends GTAOPass {
  // The AO fades out with distance. A 24-bit depth buffer (near 0.08 m) steps by z^2 / (near * 2^24): 3 cm at 200 m,
  // 0.75 m at 1 km, 3 m at 2 km. Once a step is a fair part of the depth one pixel spans, the slope worked out from
  // neighbouring pixels flips between flat and steep at every step and the AO draws the steps: dark contour bands
  // across the far hills ("zebra" stripes). The AO's 0.55 m reach is under a pixel there anyway, so it is faded out by
  // that ratio (it follows the zoom and the resolution: ~100-260 m at 1080p and 60 deg) and not computed past it -
  // engines do the same (Unreal's AO has a fade-out distance "avoiding artifacts and AO effects on huge objects").
  constructor(scene, camera, w, h) {
    super(scene, camera, w, h);
    const patch = (m, edits) => {
      let fs = m.fragmentShader;
      for (const [a, b] of edits) { if (!fs.includes(a)) throw new Error('GTAO: shader changed, cannot fade with distance'); fs = fs.replace(a, b); }
      m.fragmentShader = fs;
    };
    // (the depth step over the depth a pixel spans: z^2 / (near 2^24) against z * 2 tan(fov/2) / height)
    const steps = /* glsl */`
      float aoStepRatio(float z) { return z * resolution.y / (2.0 * cameraNear * 16777216.0 * cameraProjectionMatrixInverse[1][1]); }`;
    patch(this.gtaoMaterial, [
      ['vec3 getViewPosition(', `${steps}\n\t\tvec3 getViewPosition(`],
      ['vec3 viewPos = getViewPosition(vUv, depth);', `vec3 viewPos = getViewPosition(vUv, depth);
			float aoFar = smoothstep(0.07, 0.18, aoStepRatio(-viewPos.z));
			if (aoFar >= 1.0) { gl_FragColor = vec4(1.0); return; }`],
      ['ao = pow(ao, scale);', 'ao = mix(pow(ao, scale), 1.0, aoFar);'],
    ]);
    // (the denoiser: nothing to smooth past it either)
    this.pdMaterial.uniforms.cameraNear = { value: camera.near };
    patch(this.pdMaterial, [
      ['vec3 getViewPosition(', `uniform float cameraNear;${steps}\n\t\tvec3 getViewPosition(`],
      ['vec3 viewPos = getViewPosition(vUv, depth);', `vec3 viewPos = getViewPosition(vUv, depth);
			if (aoStepRatio(-viewPos.z) >= 0.18) { gl_FragColor = vec4(1.0); return; }`],
    ]);
  }
  // the scene pass has already rendered this frame's shadow maps: its normal pass must not render them all again
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    if (this.tap?.tex && this.depthTexture !== this.tap.tex) {
      const first = this._renderGBuffer;
      this.setGBuffer(this.tap.tex);
      if (first) { this.gtaoMaterial.needsUpdate = this.pdMaterial.needsUpdate = true; this.normalRenderTarget.dispose(); }
    }
    this.pdMaterial.uniforms.cameraNear.value = this.camera.near;
    const sm = renderer.shadowMap, auto = sm.autoUpdate;
    sm.autoUpdate = false;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    sm.autoUpdate = auto;
  }
  // (only the visible part of the scene: what is hidden is not drawn anyway, and a hidden object hides its subtree)
  _overrideVisibility() {
    const cache = this._visibilityCache;
    const hide = (o) => {
      if (!o.visible) return;
      if (o.isPoints || o.isLine || o.userData.noAO) { o.visible = false; cache.push(o); return; }
      for (const c of o.children) hide(c);
    };
    hide(this.scene);
  }
}

// Photographic finish: slight lens vignette, fine film grain, gentle S-curve, a touch of CA.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uGrain: { value: 0.035 }, uVig: { value: 0.28 },
    uCold: { value: 0 }, uFrost: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uGrain; uniform float uVig;
    uniform float uCold, uFrost;          // (V100: a snow night's mission look, the frost at the view's edges: mission.js)
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * 0.0035;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // gentle contrast curve in display space
      col = mix(col, col*col*(3.0-2.0*col), 0.18);
      // (V100) a snow night's mission: cold and hard - the colour drained, the shadows to steel blue, the contrast up
      if (uCold > 0.0) {
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 cold = mix(vec3(l), col, 0.6) * mix(vec3(0.74, 0.9, 1.14), vec3(0.98, 1.0, 1.03), smoothstep(0.0, 0.55, l));
        cold = (cold - 0.45) * 1.12 + 0.45;
        col = mix(col, max(cold, 0.0), uCold);
      }
      // frost creeping in from the corners, as on a lens out in the wind: a ragged front of crystals, whitish, catching
      // the light that falls on it
      if (uFrost > 0.0) {
        vec2 q = c * vec2(uRes.x / uRes.y, 1.0);
        float n = 0.55 * fn(vUv * uRes / uRes.y * 7.0) + 0.3 * fn(vUv * uRes / uRes.y * 19.0 + 3.1) + 0.15 * fn(vUv * uRes / uRes.y * 47.0 + 7.7);
        float edge = length(q * vec2(0.82, 1.12)) + 0.22 * (n - 0.5);
        float grow = smoothstep(0.78 - 0.3 * uFrost, 0.98 - 0.22 * uFrost, edge) * uFrost;
        float vein = 1.0 - abs(fn(vUv * uRes / uRes.y * 85.0 + n * 6.0) * 2.0 - 1.0);
        float lum = dot(col, vec3(0.333));
        col = mix(col, vec3(0.78, 0.86, 0.94) * (0.22 + 0.9 * max(lum, 0.12)) + 0.03, clamp(grow * (0.45 + 0.4 * vein), 0.0, 0.8));
      }
      // vignette (harder on a mission night)
      col *= 1.0 - (uVig + 0.12 * uCold) * smoothstep(0.12, 0.75, r2 * 1.6);
      // grain (luma weighted)
      float g = h(vUv * uRes + fract(uTime * 13.7) * 91.0) - 0.5;
      col += g * uGrain * (0.6 + 0.4 * (1.0 - dot(col, vec3(0.333))));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// The detail the anti-aliasing softens, given back: contrast adaptive sharpening (AMD FidelityFX CAS, MIT licence:
// gpuopen.com/fidelityfx-cas). A 5-tap cross sharpens each pixel by how far its 3x3 neighbourhood is from clipping, so
// fine texture (bark, asphalt, the far trees) gets crisper while edges that are already hard get no halo. In display
// space, after the tone curve and before the grain (the grain is not sharpened); only with TAA (SMAA's edges are its own).
const CASShader = {
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uPeak: { value: -1 / 7.4 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uPeak;
varying vec2 vUv;
vec3 px(float x, float y) { return texture2D(tDiffuse, vUv + vec2(x, y) * uTexel).rgb; }
void main() {
  vec4 E = texture2D(tDiffuse, vUv);
  vec3 a = px(-1.0, -1.0), b = px(0.0, -1.0), c = px(1.0, -1.0), d = px(-1.0, 0.0), e = E.rgb, f = px(1.0, 0.0), g = px(-1.0, 1.0), h = px(0.0, 1.0), i = px(1.0, 1.0);
  // soft min and max (the cross plus the whole 3x3: twice the size)
  float mn = min(min(min(d.g, e.g), min(f.g, b.g)), h.g), mx = max(max(max(d.g, e.g), max(f.g, b.g)), h.g);
  mn += min(mn, min(min(a.g, c.g), min(g.g, i.g)));
  mx += max(mx, max(max(a.g, c.g), max(g.g, i.g)));
  // the smooth distance to the signal's limits over the smooth max: the amount (by the green, for every channel: no colour fringes)
  float amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, 1e-5), 0.0, 1.0));
  float w = amp * uPeak;
  gl_FragColor = vec4(clamp(((b + d + f + h) * w + e) / (1.0 + 4.0 * w), 0.0, 1.0), E.a);
}`,
};

// Reflections in wet ground (rain.js): opaque wet materials write how much they mirror into the alpha of the scene
// buffer (1 elsewhere). For those pixels a ray is reflected about the up direction and marched through the depth buffer;
// where it meets the scene that colour replaces the sky's in the reflection, weighted by water's Fresnel term. Standing
// water stays sharp; on a wet film the micro-ripples draw reflections out into vertical streaks, as on a real wet road.
const WetSSRShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() },
    uUp: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 }, uAspect: { value: 1 },
    uLamps: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uLampCol: { value: new THREE.Color(1, 0.78, 0.5) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: /* glsl */`
uniform sampler2D tDiffuse, tDepth;
uniform mat4 uProj, uInvProj;
uniform vec3 uUp, uLampCol;
uniform float uTime, uAspect;
uniform vec4 uLamps[8];               // street lamp heads in view space (w: brightness)
varying vec2 vUv;
vec3 viewPos(vec2 uv, float d) { vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
vec2 toUv(vec3 p) { vec4 c = uProj * vec4(p, 1.0); return c.xy / c.w * 0.5 + 0.5; }
float ssrHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float d = texture2D(tDepth, vUv).r;
  vec3 p = viewPos(vUv, d);
  vec3 fn = normalize(cross(dFdx(p), dFdy(p)));                  // (derivatives before any branch)
  gl_FragColor = vec4(c.rgb, c.a < 0.0 ? min(c.a, -1.0) : max(c.a, 1.0));   // (> 1: the haze's share, for the distance blur; < 0: what sways, taa.js)
  float refl = c.a < 0.0 ? 0.0 : clamp(1.0 - c.a, 0.0, 1.0);
  if (refl < 0.02 || d >= 1.0 || abs(dot(fn, uUp)) < 0.8) return; // wet, level surfaces only
  vec3 n = normalize(uUp), v = normalize(p);
  vec3 r = reflect(v, n);
  float F = 0.02 + 0.98 * pow(1.0 - clamp(dot(-v, n), 0.0, 1.0), 5.0);   // water, n = 1.33
  float rough = 1.0 - smoothstep(0.45, 0.9, refl);                // a film is rough, a puddle a mirror
  vec3 col = c.rgb;
  float jit = ssrHash(gl_FragCoord.xy + fract(uTime) * 61.0);
  float stepLen = (0.08 + 0.06 * jit) * max(1.0, -p.z * 0.03);
  vec3 q = p + n * 0.02, prev = q;
  vec2 hit = vec2(-1.0);
  float travelled = 0.0;
  for (int i = 0; i < 36; i++) {
    prev = q; q += r * stepLen; travelled += stepLen; stepLen *= 1.16;
    if (q.z > -0.05) break;
    vec2 uv = toUv(q);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float sd = texture2D(tDepth, uv).r;
    if (sd >= 1.0) continue;                                      // sky: keep going (a roof may still be ahead)
    float dz = viewPos(uv, sd).z - q.z;                           // > 0: the ray is behind the visible surface
    if (dz > 0.0 && dz < stepLen * 3.0 + 0.25) {
      vec3 a = prev, b = q;
      for (int k = 0; k < 5; k++) { vec3 m = (a + b) * 0.5; vec2 mu = toUv(m); if (viewPos(mu, texture2D(tDepth, mu).r).z - m.z > 0.0) b = m; else a = m; }
      hit = toUv(b);
      break;
    }
  }
  if (hit.x >= 0.0) {
    vec2 e = smoothstep(vec2(0.0), vec2(0.07), hit) * smoothstep(vec2(0.0), vec2(0.07), 1.0 - hit);
    float conf = e.x * e.y * (1.0 - smoothstep(60.0, 140.0, travelled));
    // the film's micro-ripples blur the reflection along the vertical; puddles keep it sharp
    float smear = rough * 0.018;
    vec3 h = vec3(0.0);
    for (int k = -2; k <= 2; k++) h += texture2D(tDiffuse, hit + vec2((jit - 0.5) * 0.002, float(k) * smear)).rgb;
    h = min(h / 5.0, vec3(64.0));
    col = mix(col, h, clamp(refl * F * conf, 0.0, 0.92));
  }
  // street lamps: their mirror image in the wet road, drawn out into long vertical streaks (thin lamp heads are too
  // small for the march to find)
  for (int i = 0; i < 8; i++) {
    vec4 L = uLamps[i];
    if (L.w <= 0.0) continue;
    vec3 Lm = L.xyz - 2.0 * dot(L.xyz - p, n) * n;
    if (Lm.z > -0.2) continue;
    vec2 dd = (vUv - toUv(Lm)) * vec2(uAspect, 1.0);
    float sx = 0.005 + 0.008 * rough, sy = 0.015 + 0.16 * rough;
    col += uLampCol * L.w * exp(-dd.x * dd.x / (sx * sx) - dd.y * dd.y / (sy * sy)) * F * refl * 2.5;
  }
  gl_FragColor.rgb = col;
}`,
};
const _lv = new THREE.Vector3();
class WetSSRPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({ ...WetSSRShader, uniforms: THREE.UniformsUtils.clone(WetSSRShader.uniforms), depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.material);
    this.enabled = false;
    this.lamps = []; this.lampLevel = 0;
  }
  // the nearest street lamps (world positions) and how bright they are now (0 by day)
  setLamps(list, level) { this.lamps = list; this.lampLevel = level; }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms, cam = this.camera;
    u.tDiffuse.value = readBuffer.texture; u.tDepth.value = readBuffer.depthTexture;
    u.uProj.value.copy(cam.projectionMatrix); u.uInvProj.value.copy(cam.projectionMatrixInverse);
    u.uUp.value.set(0, 1, 0).transformDirection(cam.matrixWorldInverse);
    u.uTime.value = performance.now() * 0.001;
    u.uAspect.value = cam.aspect;
    for (let i = 0; i < 8; i++) {
      const l = this.lamps[i], o = u.uLamps.value[i];
      if (l && this.lampLevel > 0) { _lv.copy(l).applyMatrix4(cam.matrixWorldInverse); o.set(_lv.x, _lv.y, _lv.z, this.lampLevel); } else o.w = 0;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}

// The softness of distant things (air.js). The haze scatters light mostly at small angles forward, so part of what
// reaches the eye from far off arrives slightly off its line: the far hills lose their crisp edges and fine detail, the
// more the thicker the haze between (the atmospheric point spread function: Narasimhan & Nayar 2003; Monte Carlo
// studies find the aerosols' near-forward scattering the main cause, growing with their optical depth, turbulence far
// smaller). Opaque surfaces leave 1 + (1 - e^-tau) of the haze in the frame's alpha (main.js fog chunk, the far relief);
// a pyramid of the frame built from the hazy pixels only (a near trunk lends no glow to the hills behind it) is read per
// pixel at a width growing with tau (~0.07 deg per unit: in pixels by the camera's field of view) and mixed in by the
// share the haze scatters forward (~half of what it takes out of the direct light). The output's alpha is 1 again.
const AB_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
const AB_DOWN = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFirst;
varying vec2 vUv;
vec4 tap(vec2 o) {
  vec4 c = texture2D(tSrc, vUv + o * uTexel);
  if (uFirst > 0.5) { float h = clamp(abs(c.a) - 1.0, 0.0, 1.0); return vec4(c.rgb * h, h); }   // (premultiplied by the haze)
  return c;
}
void main() {
  gl_FragColor = (tap(vec2(0.0)) * 4.0 + tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) / 8.0;
}`;
const AB_COMP = /* glsl */`
uniform sampler2D tDiffuse, tL0, tL1, tL2, tL3, tL4;
uniform vec2 uTexel4;
uniform float uRadPerPx;
varying vec2 vUv;
vec4 lv(sampler2D t, vec2 tx) { return (texture2D(t, vUv + tx * vec2(-0.5, -0.5)) + texture2D(t, vUv + tx * vec2(0.5, -0.5)) + texture2D(t, vUv + tx * vec2(-0.5, 0.5)) + texture2D(t, vUv + tx * vec2(0.5, 0.5))) * 0.25; }
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float h = clamp(abs(c.a) - 1.0, 0.0, 0.999);
  gl_FragColor = vec4(c.rgb, 1.0);
  if (h < 0.02) return;
  float tau = -log(1.0 - h);
  float sigma = min(0.0012 * tau, 0.02) / uRadPerPx;              // the glow's width, in pixels
  float k = smoothstep(0.35, 1.2, sigma);
  if (k <= 0.0) return;
  // the pyramid's level k blurs over ~2^(k+1) pixels: blend the two around the width wanted
  float L = clamp(log2(max(sigma, 1.0)) - 1.0, 0.0, 4.0);
  vec4 b = texture2D(tL0, vUv) * max(0.0, 1.0 - abs(L)) + texture2D(tL1, vUv) * max(0.0, 1.0 - abs(L - 1.0))
         + texture2D(tL2, vUv) * max(0.0, 1.0 - abs(L - 2.0)) + lv(tL3, uTexel4 * 0.5) * max(0.0, 1.0 - abs(L - 3.0))
         + lv(tL4, uTexel4) * max(0.0, 1.0 - abs(L - 4.0));
  if (b.a < 1e-4) return;
  gl_FragColor.rgb = mix(c.rgb, b.rgb / b.a, min(0.6, 0.5 * h) * k);
}`;
class AerialBlurPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.rts = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.down = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 1 } }, vertexShader: AB_VERT, fragmentShader: AB_DOWN, depthTest: false, depthWrite: false });
    this.comp = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, tL0: { value: null }, tL1: { value: null }, tL2: { value: null }, tL3: { value: null }, tL4: { value: null },
      uTexel4: { value: new THREE.Vector2() }, uRadPerPx: { value: 1e-3 } }, vertexShader: AB_VERT, fragmentShader: AB_COMP, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(null);
  }
  setSize(w, h) {
    this.h = h;
    this.rts.forEach((rt, i) => rt.setSize(Math.max(1, Math.ceil(w / 2 ** (i + 1))), Math.max(1, Math.ceil(h / 2 ** (i + 1)))));
    this.comp.uniforms.uTexel4.value.set(2 ** 5 / w, 2 ** 5 / h);
  }
  render(renderer, writeBuffer, readBuffer) {
    let src = readBuffer.texture, sw = readBuffer.width, sh = readBuffer.height;
    this.quad.material = this.down;
    this.rts.forEach((rt, i) => {
      this.down.uniforms.tSrc.value = src; this.down.uniforms.uFirst.value = i === 0 ? 1 : 0; this.down.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      renderer.setRenderTarget(rt); this.quad.render(renderer);
      src = rt.texture; sw = rt.width; sh = rt.height;
    });
    const u = this.comp.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    for (let i = 0; i < 5; i++) u['tL' + i].value = this.rts[i].texture;
    u.uRadPerPx.value = 2 * Math.atan(1 / this.camera.projectionMatrix.elements[5]) / readBuffer.height;   // (as drawn: the lens widens it)
    this.quad.material = this.comp;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.rts.forEach(r => r.dispose()); this.down.dispose(); this.comp.dispose(); this.quad.dispose(); }
}

// The enhanced field of view (V99), as Call of Duty: Modern Warfare 4's "Enhanced FOV" (PC): more of the world at the
// screen's edges through a lens, the centre as it was. A flat (rectilinear) picture stretches the edges of a wide view -
// at 110 deg a ball near the side is drawn 3 times as wide as in the middle. The Pannini projection (Sharpless, Postle &
// German 2010; Unity's HDRP offers it as a post effect) is the view from behind the centre of a cylinder: the
// verticals stay vertical and straight, the lines through the centre straight, the middle exactly as the flat picture's
// (the same size at the same field of view), and the edges taken in, so the same screen holds a wider view without
// the stretch. d (0 flat, 1 the classic Panini) is set per view, as strong as an overscan of at most LENS_M lets it
// be: the scene is drawn wider (the camera's zoom 1/m) and this pass maps every screen pixel to where its direction lies
// in that picture. The scene is drawn at `scale` times the screen's size (the menu's quality: up to 1.4) so the middle,
// magnified m times, keeps its sharpness; Catmull-Rom where it is magnified, a 4-tap box where the edges are squeezed.
const LENS_M = 1.4;
const LENS = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uOut, uSrc, uTexel;   // the screen's and the drawn picture's half extents (tangents); the picture's texel
uniform float uD, uPeak;
// (V104) the head-mounted GoPro: its fisheye (uFish), the angle off the axis theta = uK1 r + uK3 r^3 for r in half
// widths of the frame (uAsp: its half height in them), and what its picture adds - lateral colour (uCA), the light
// falling off (uVig), the sensor's noise (uNoise), its colour (uSat, uCon), the helmet's edge (uHelm: the side, +-1)
uniform float uFish, uK1, uK3, uAsp, uCA, uVig, uNoise, uSat, uCon, uHelm, uTime, uRmax;
uniform float uBlurK;              // (V108) the see-through edge's blur in the picture's texels, kept as wide on the screen
// (V113) the GoPro's rig: the two side views (their pictures; on or off), the right one's yaw and its box of tangents
// (x0, x1 across, y1 up and down: the left one's mirrored), the azimuths between which the middle gives way to them
uniform sampler2D tSideL, tSideR;
uniform float uSide, uYaw;
uniform vec3 uSBox;
uniform vec2 uSeam;
uniform mat3 uRotL, uRotR;         // (V113) from this frame's view back to the one each side view was drawn from
varying vec2 vUv;
// the direction at the frame's point q (x right, y up, z ahead), its angle off the axis scaled by s (the lateral
// colour); with the side views the whole frame (no RMAX: they hold the corners, to 88.5 deg off the axis)
vec3 fishDir(vec2 q, float s) {
  float r = length(q), rr = uSide > 0.5 ? r : min(r, uRmax), th = min((uK1 * rr + uK3 * rr * rr * rr) * s, uSide > 0.5 ? 1.56 : 1.45);
  return r > 1e-6 ? vec3(q / r * sin(th), cos(th)) : vec3(0.0, 0.0, 1.0);
}
vec2 fishUV(vec2 q, float s) { vec3 d = fishDir(q, s); return d.xy / max(d.z, 1e-4) / uSrc * 0.5 + 0.5; }
// a direction in the side views' pictures: the right one's (x > 0), or the left one's (mirrored) - turned back to the
// view each was drawn from (they are drawn in turn, one a frame, while the head turns between)
vec2 sideUV(vec3 d0) {
  vec3 d = (d0.x > 0.0 ? uRotR : uRotL) * d0;
  vec3 m = vec3(d0.x > 0.0 ? d.x : -d.x, d.y, d.z);
  float c = cos(uYaw), s = sin(uYaw);
  vec2 t = vec2(m.x * c - m.z * s, m.y) / max(m.x * s + m.z * c, 1e-4);
  vec2 uv = vec2((t.x - uSBox.x) / (uSBox.y - uSBox.x), t.y / (2.0 * uSBox.z) + 0.5);
  if (d0.x < 0.0) uv.x = 1.0 - uv.x;
  return uv;
}
vec3 sideTap(vec2 uv, float right) { return right > 0.5 ? textureLod(tSideR, uv, 0.0).rgb : textureLod(tSideL, uv, 0.0).rgb; }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// (the picture has no mip levels: level 0 is all it has - read so, the taps need no derivatives, and may sit in loops
// and branches the shader compilers keep as such)
vec3 tap(vec2 p) { return textureLod(tDiffuse, p, 0.0).rgb; }
vec3 catmullRom(vec2 uv) {
  vec2 sp = uv / uTexel, tp = floor(sp - 0.5) + 0.5, f = sp - tp;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, t12 = (tp + w2 / w12) * uTexel, t0 = (tp - 1.0) * uTexel, t3 = (tp + 2.0) * uTexel;
  vec3 r = tap(vec2(t12.x, t0.y)) * (w12.x * w0.y) + tap(vec2(t0.x, t12.y)) * (w0.x * w12.y)
         + tap(t12) * (w12.x * w12.y) + tap(vec2(t3.x, t12.y)) * (w3.x * w12.y)
         + tap(vec2(t12.x, t3.y)) * (w12.x * w3.y);
  return r / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y);
}
// magnified or 1:1 (the middle): Catmull-Rom, and the softness of resampling taken back as the sharpening does it
// (CAS's cross, with the screen's own neighbours: one screen pixel away in the picture)
vec3 crisp(vec2 uv, vec2 ex, vec2 ey) {
  vec3 c = catmullRom(uv);
  vec3 b = tap(uv - ey), dd = tap(uv - ex), f = tap(uv + ex), h = tap(uv + ey);
  float mn = min(min(min(dd.g, c.g), min(f.g, b.g)), h.g), mx = max(max(max(dd.g, c.g), max(f.g, b.g)), h.g);
  float w = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-5), 0.0, 1.0)) * uPeak;
  return ((b + dd + f + h) * w + c) / (1.0 + 4.0 * w);
}
// (V108) the GoPro's picture at its full resolution: its middle 1:1 with the screen - so toward the edges, where the
// fisheye squeezes the world, one screen pixel covers up to ~7 of the picture's texels. The pixel gathers all it covers,
// as a camera's pixel gathers the light falling on it: n taps along its footprint's long axis (aMaj, the radius) and
// two rows across where that is wide too (aMin), red and blue each from their own place (the lateral colour: dR, dB) -
// not a few taps that would let the squeezed detail shimmer as the head turns
vec3 gather(vec2 uv, vec2 dR, vec2 dB, vec2 aMaj, vec2 aMin, float n, float rows, float ca) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= n) break;
    vec2 p = uv + aMaj * ((float(i) + 0.5) / n - 0.5);
    for (int j = 0; j < 2; j++) {
      if (float(j) >= rows) break;
      vec2 pp = p + aMin * (rows > 1.5 ? (float(j) - 0.5) * 0.5 : 0.0);
      vec3 t = tap(pp);
      t.r = mix(t.r, textureLod(tDiffuse, pp + dR, 0.0).r, ca);
      t.b = mix(t.b, textureLod(tDiffuse, pp + dB, 0.0).b, ca);
      s += t;
    }
  }
  return s / (n * rows);
}
void main() {
  vec2 uv, q = (vUv * 2.0 - 1.0) * vec2(1.0, uAsp);
  vec3 fd = vec3(0.0, 0.0, 1.0);
  if (uFish > 0.5) { fd = fishDir(q, 1.0); uv = fd.xy / max(fd.z, 1e-4) / uSrc * 0.5 + 0.5; }   // (V104) the GoPro's fisheye: the direction at this point of its frame
  else {
  // the screen point on the Panini plane (tangents of the view's own field: the middle is the flat picture's)
  vec2 p = (vUv * 2.0 - 1.0) * uOut;
  // back to a direction (longitude from x, then the height): x = S sin(lon), y = S tan(lat), S = (d + 1) / (d + cos(lon))
  float d = uD, k = p.x * p.x / ((d + 1.0) * (d + 1.0));
  float cl = (-k * d + sqrt(max(k * k * d * d - (k + 1.0) * (k * d * d - 1.0), 0.0))) / (k + 1.0);
  float sl = sign(p.x) * sqrt(max(1.0 - cl * cl, 0.0));
  uv = vec2(sl, p.y * (d + cl) / (d + 1.0)) / cl / uSrc * 0.5 + 0.5;   // that direction in the drawn (flat) picture
  }
  vec2 ex = dFdx(uv), ey = dFdy(uv), fx = ex / uTexel, fy = ey / uTexel;   // (a screen pixel's footprint, in the picture's texels)
  // (V113) the side views' share: by the direction's azimuth, none in the middle, all past the seam; their pictures'
  // footprint of a screen pixel (worked out here, where every pixel runs: the derivatives need it)
  float ws = uFish > 0.5 && uSide > 0.5 ? smoothstep(uSeam.x, uSeam.y, abs(atan(fd.x, fd.z))) : 0.0;
  vec2 suv = sideUV(fd), sx = dFdx(suv), sy = dFdy(suv);
  float right = fd.x > 0.0 ? 1.0 : 0.0;
  vec3 c;
  if (uFish > 0.5) {
    // (V108) the footprint as an ellipse: its long and short axes (texels per screen pixel) and the long one's direction
    float A = fx.x * fx.x + fy.x * fy.x, B = fx.x * fx.y + fy.x * fy.y, C = fx.y * fx.y + fy.y * fy.y;
    float hq = sqrt(0.25 * (A - C) * (A - C) + B * B), fMaj = sqrt(0.5 * (A + C) + hq), fMin = sqrt(max(0.5 * (A + C) - hq, 0.0));
    vec2 dir = abs(B) > 1e-9 ? normalize(vec2(B, 0.5 * (C - A) + hq)) : (A >= C ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    // lateral colour: red and blue land a little apart from green toward the edges
    float ca = smoothstep(0.15, 1.3, dot(q, q));
    vec2 uvR = fishUV(q, 1.0 + uCA), uvB = fishUV(q, 1.0 - uCA);
    // 1:1 to a little squeezed: Catmull-Rom and the sharpening; squeezed more: the gathered footprint (blended between)
    float t = smoothstep(1.2, 2.0, fMaj);
    vec3 cc = vec3(0.0), cg = vec3(0.0), cs = vec3(0.0);
    if (ws < 1.0) {
      if (t < 1.0) { cc = crisp(uv, ex, ey); cc.r = mix(cc.r, textureLod(tDiffuse, uvR, 0.0).r, ca); cc.b = mix(cc.b, textureLod(tDiffuse, uvB, 0.0).b, ca); }
      if (t > 0.0) cg = gather(uv, uvR - uv, uvB - uv, dir * fMaj * uTexel, vec2(-dir.y, dir.x) * fMin * uTexel, clamp(ceil(fMaj), 2.0, 8.0), fMin > 1.5 ? 2.0 : 1.0, ca);
    }
    // (V113) the side view: four taps over the screen pixel's footprint (they are drawn ~1:1), the lateral colour from
    // the directions at the angles scaled as the middle's
    if (ws > 0.0) {
      vec2 a1 = 0.25 * (sx + sy), a2 = 0.25 * (sx - sy);
      cs = 0.25 * (sideTap(suv + a1, right) + sideTap(suv - a1, right) + sideTap(suv + a2, right) + sideTap(suv - a2, right));
      cs.r = mix(cs.r, sideTap(sideUV(fishDir(q, 1.0 + uCA)), right).r, ca);
      cs.b = mix(cs.b, sideTap(sideUV(fishDir(q, 1.0 - uCA)), right).b, ca);
    }
    c = mix(mix(cc, cg, t), cs, ws);
  } else if (max(dot(fx, fx), dot(fy, fy)) <= 1.0) c = crisp(uv, ex, ey);
  else c = 0.25 * (tap(uv + 0.25 * (ex + ey)) + tap(uv - 0.25 * (ex + ey)) + tap(uv + 0.25 * (ex - ey)) + tap(uv - 0.25 * (ex - ey)));
  if (uFish > 0.5) {
    float r2 = dot(q, q);
    // (V107) the lens's edge, see-through - no dark band: toward the frame's edges and in its corners the picture
    // softens, its colours part (the glass's dispersion) and a faint glassy sheen lies over it; you see the world through
    float de = min(1.0 - abs(q.x), uAsp - abs(q.y));
    // (with the side views the corners are the world's own: only the frame's edges stay see-through)
    float edge = max(uSide > 0.5 ? 0.0 : smoothstep(uRmax - 0.16, uRmax + 0.06, sqrt(r2)), 1.0 - smoothstep(0.0, 0.08, de));
    if (edge > 0.002) {
      vec3 bl = vec3(0.0);
      float caE = uCA + 0.012 * edge;
      if (ws < 1.0) {
        // (V113: by the screen pixel's footprint in the middle's picture, as the side views' - as wide on the screen)
        vec2 ox = ex * (1.0 + 4.3 * edge), oy = ey * (1.0 + 4.3 * edge);
        vec3 b0 = tap(uv + ox) + tap(uv - ox) + tap(uv + oy) + tap(uv - oy)
                + tap(uv + (ox + oy) * 0.7) + tap(uv - (ox + oy) * 0.7) + tap(uv + (ox - oy) * 0.7) + tap(uv - (ox - oy) * 0.7);
        b0 *= 0.125;
        b0.r = mix(b0.r, textureLod(tDiffuse, fishUV(q, 1.0 + caE), 0.0).r, 0.6);
        b0.b = mix(b0.b, textureLod(tDiffuse, fishUV(q, 1.0 - caE), 0.0).b, 0.6);
        bl += b0 * (1.0 - ws);
      }
      if (ws > 0.0) {
        // (as wide on the screen as the middle's: by the side picture's own footprint of a screen pixel)
        vec2 ox = sx * (1.0 + 4.3 * edge), oy = sy * (1.0 + 4.3 * edge);
        vec3 b1 = sideTap(suv + ox, right) + sideTap(suv - ox, right) + sideTap(suv + oy, right) + sideTap(suv - oy, right)
                + sideTap(suv + (ox + oy) * 0.7, right) + sideTap(suv - (ox + oy) * 0.7, right) + sideTap(suv + (ox - oy) * 0.7, right) + sideTap(suv - (ox - oy) * 0.7, right);
        b1 *= 0.125;
        b1.r = mix(b1.r, sideTap(sideUV(fishDir(q, 1.0 + caE)), right).r, 0.6);
        b1.b = mix(b1.b, sideTap(sideUV(fishDir(q, 1.0 - caE)), right).b, 0.6);
        bl += b1 * ws;
      }
      c = mix(c, bl, edge);
      c += vec3(0.035) * edge * (1.0 - dot(c, vec3(0.3333)));
    }
    // its colour: more saturated and a touch more contrast than the eye's
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = clamp((mix(vec3(l), c, uSat) - 0.5) * uCon + 0.5, 0.0, 1.0);
    // the sensor's noise: grain in the luminance and coloured blotches, worse in the dark (the gain turned up)
    vec2 fc = floor(gl_FragCoord.xy);
    float n = hash12(fc + fract(uTime * 7.31) * 517.0) - 0.5;
    vec3 nc = vec3(hash12(floor(fc * 0.5) + fract(uTime * 3.7) * 311.0), hash12(floor(fc * 0.5) + 41.0 + fract(uTime * 5.3) * 197.0), hash12(floor(fc * 0.5) + 83.0 + fract(uTime * 2.9) * 401.0)) - 0.5;
    float dark = 1.0 - smoothstep(0.02, 0.55, l);
    c += (vec3(n) * 0.9 + nc * 0.6) * uNoise * (0.3 + 0.7 * dark);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
// how far the edges' directions reach in the drawn picture, over the screen's (Panini of strength d, the view's
// half-tangents tx across and ty up): across at the side, up at the corners
function lensOverscan(tx, d) {
  const k = tx * tx / ((d + 1) * (d + 1)), cl = (-k * d + Math.sqrt(Math.max(k * k * d * d - (k + 1) * (k * d * d - 1), 0))) / (k + 1);
  if (cl < 0.05) return Infinity;              // (the edge's direction ~90 deg to the side: no flat picture holds it)
  return Math.max(Math.sqrt(Math.max(1 - cl * cl, 0)) / cl / tx, (d + cl) / ((d + 1) * cl));
}
// the strongest Panini (d <= 1) whose overscan stays within m
export function lensFit(tx, m = LENS_M) {
  if (lensOverscan(tx, 1) <= m) return { d: 1, m: lensOverscan(tx, 1) };
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = 0.5 * (lo + hi); if (lensOverscan(tx, mid) <= m) lo = mid; else hi = mid; }
  return { d: lo, m: lensOverscan(tx, lo) };
}
// the field of view across the screen with the lens (degrees), for the view's half-tangent across tx
export function lensSpan(tx) {
  const { d } = lensFit(tx), k = tx * tx / ((d + 1) * (d + 1));
  const cl = (-k * d + Math.sqrt(Math.max(k * k * d * d - (k + 1) * (k * d * d - 1), 0))) / (k + 1);
  return 2 * Math.acos(Math.min(1, cl)) * 180 / Math.PI;
}
// (V104-V105) the GoPro's fisheye: the angle off the axis theta = K1 r + K3 r^3, r in half widths of the frame. V104 had
// GoPro's Wide (HERO10 Black, 16:9: 118 deg across, 69 up, 133 on the diagonal - K1 1.0893, K3 -0.0595, fitted to all
// three); V105-V106 far wider, toward GoPro's widest (the Max Lens Mod 2.0's Max HyperView, 177 deg): 140 across, 81 up,
// the same shape of curve (V105's 150 left the corners ~85 deg off the axis, which no flat picture can feed: its dark band
// had to be wide). Past r = RMAX (~74 deg) only the frame's corners lie: there, as along the edges, the lens's edge is
// see-through (V107: softened, its colours parted, no darkening), the flat picture's edge drawn out under it.
export const GOPRO_K1 = 1.2817, GOPRO_K3 = -0.06, GOPRO_RMAX = 1.07;
// (V113) One flat picture cannot hold a lens that wide: its corners lay ~79 deg off the axis, so it was drawn up to 3.5
// tangents out (V108: 5.3K, 15.9 MP, to keep its middle 1:1) - most of it squeezed back into the frame's edges. Now the
// GoPro is a rig of three: the middle view (all the passes: the anti-aliasing, the reflections, the AO, the haze, the
// shafts) out to 50 deg either side, and two side views turned toward the edges (the scene, the far relief and the sky,
// their own anti-aliasing), blended over 4 deg. Each holds about one picture pixel to one screen pixel, so the whole
// frame takes ~4 MP at 1080p (a quarter), and the lens goes to GoPro's widest: Max HyperView, 177 deg on the diagonal
// (GoPro's figure for the Max Lens Mod 2.0 and the Ultra Wide Lens Mod) - 157 across and 91 up on 16:9, every corner the
// world's own, no longer drawn out. The curve keeps V105's shape: theta = K1 (r + C r^3), C = K3 / K1 = -0.0468.
export const GOPRO_LENSES = [
  { diag: 177, name: 'Max HyperView, 177°' },
  { diag: 158, name: '158° (V105–V112)' },
  { diag: 133, name: 'Wide, 133°' },
];
const GOPRO_C = -0.0468, SEAM = 50 * Math.PI / 180, SEAM_BLEND = 4 * Math.PI / 180;
// the rig for a lens (diagonal on GoPro's 16:9 frame) on a screen of this aspect: the middle's box of tangents (tx, ty),
// the side views' yaw and box (x0, x1 across in the right one's frame, y1 up and down), the tangents that hold the whole
// frame (all: for what asks whether a thing is in view)
export function goproRig(diagDeg, aspect) {
  const rc = Math.hypot(1, 9 / 16), K1 = (diagDeg / 2) * Math.PI / 180 / (rc + GOPRO_C * rc ** 3), K3 = K1 * GOPRO_C, A = 1 / aspect;
  const pts = [], NX = 96, NY = Math.max(24, Math.round(96 * A));
  for (let i = 0; i <= NX; i++) for (let j = 0; j <= NY; j++) {
    const x = -1 + 2 * i / NX, y = (-1 + 2 * j / NY) * A, r = Math.hypot(x, y), th = Math.min(K1 * r + K3 * r * r * r, 1.56);
    pts.push(r < 1e-9 ? [0, 0, 1] : [Math.sin(th) * x / r, Math.sin(th) * y / r, Math.cos(th)]);
  }
  let tx = 0, ty = 0, maxAz = 0, allX = 0, allY = 0;
  for (const d of pts) {
    const az = Math.abs(Math.atan2(d[0], d[2]));
    maxAz = Math.max(maxAz, az);
    if (az <= SEAM) { tx = Math.max(tx, Math.abs(d[0] / d[2])); ty = Math.max(ty, Math.abs(d[1] / d[2])); }
    if (d[2] > 0.17) { allX = Math.max(allX, Math.abs(d[0] / d[2])); allY = Math.max(allY, Math.abs(d[1] / d[2])); }
  }
  const rig = { K1, K3, tx: tx * 1.01, ty: ty * 1.01, sides: null, seam: [SEAM - SEAM_BLEND, SEAM], all: [allX, allY], across: 2 * (K1 + K3) * 180 / Math.PI, up: 2 * (K1 * A + K3 * A ** 3) * 180 / Math.PI };
  if (maxAz <= SEAM) return rig;
  let best = null;
  for (let a = 30; a <= 85; a++) {
    const al = a * Math.PI / 180, c = Math.cos(al), sn = Math.sin(al);
    let x0 = Infinity, x1 = -Infinity, y1 = 0;
    for (const d of pts) {
      if (Math.atan2(d[0], d[2]) < SEAM - SEAM_BLEND) continue;
      const ez = d[0] * sn + d[2] * c, u = (d[0] * c - d[2] * sn) / ez, v = Math.abs(d[1] / ez);
      x0 = Math.min(x0, u); x1 = Math.max(x1, u); y1 = Math.max(y1, v);
    }
    const area = (x1 - x0) * y1;
    if (!best || area < best.area) best = { yaw: al, x0, x1, y1, area };
  }
  // (a hair wider than the frame needs: the taps over a pixel's footprint stay inside)
  const m = 0.01 * (best.x1 - best.x0);
  rig.sides = { yaw: best.yaw, x0: best.x0 - m, x1: best.x1 + m, y1: best.y1 * 1.01 };
  return rig;
}
// the GoPro's drawing scales: the side views and the middle drawn at this share of one picture pixel to one screen pixel
// (V113: the frame rate picks it, goproFrame)
const DRS = [0.42, 0.5, 0.58, 0.67, 0.76, 0.86, 1];
const _yAxis = new THREE.Vector3(0, 1, 0), _qYaw = new THREE.Quaternion(), _wp = new THREE.Vector3(), _wq = new THREE.Quaternion(), _ws = new THREE.Vector3();
const _lp = new THREE.Vector3(), _lq = new THREE.Quaternion(), _ls = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rm = new THREE.Matrix4();
// (V113) a side view's far relief and sky: FarPass's, with the side view's own box of tangents (its frustum is off the axis)
class SideFarPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera; this.needsSwap = false; this.jitter = null; this.box = [-1, 1, 1];
    this.cam = new THREE.PerspectiveCamera(70, 1, 30, 430000);
  }
  render(renderer, writeBuffer, readBuffer) {
    const c = this.cam, [x0, x1, y1] = this.box, n = 30, f = 430000;
    c.position.copy(this.camera.position); c.quaternion.copy(this.camera.quaternion); c.updateMatrixWorld();
    c.projectionMatrix.makePerspective(x0 * n, x1 * n, y1 * n, -y1 * n, n, f);
    const e = c.projectionMatrix.elements;
    if (this.jitter) { e[8] += this.jitter.x; e[9] += this.jitter.y; }
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clear();
    renderer.render(this.scene, c);
    renderer.autoClear = ac;
  }
}
// (V113) one of the GoPro's side views: its camera at the lens, turned by the rig's yaw to its side (sign: +1 right, -1
// left), its frustum the rig's box; the scene, the far relief and the sky, the anti-aliasing (as the middle's, when on:
// the rain, the snow and the spray drawn after it, the middle's own), the tone mapping and the GoPro's colour
class SideView {
  constructor(renderer, scene, farScene, sign, taaMain, gradeU) {
    this.sign = sign; this.taaMain = taaMain;
    this.q = new THREE.Quaternion(); this.valid = false;       // (the main camera's turn it was last drawn with)
    this.cam = new THREE.PerspectiveCamera();
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0, depthTexture: taaMain ? new THREE.DepthTexture(1, 1) : null });
    const comp = this.composer = new EffectComposer(renderer, rt);
    comp.setPixelRatio(1); comp.renderToScreen = false;
    this.taa = taaMain ? new TAAPass(this.cam, null, null) : null;
    if (this.taa) { this.taa.fx = taaMain.fx; comp.addPass(new TAAJitter(this.taa)); }
    this.far = farScene ? new SideFarPass(farScene, this.cam) : null;
    if (this.far) {
      comp.addPass(this.far);
      const rp = new RenderPass(scene, this.cam);
      rp.clear = false; rp.clearDepth = true;
      comp.addPass(rp);
    } else comp.addPass(new RenderPass(scene, this.cam));
    if (this.taa) {
      const tap = new DepthTap();
      comp.addPass(tap);
      this.taa.attach(tap, this.far);
      comp.addPass(nanGuard());
      comp.addPass(this.taa);
      this.taa.enabled = taaMain.enabled;
    }
    comp.addPass(new OutputPass());
    this.grade = new ShaderPass(new THREE.ShaderMaterial({ vertexShader: GradeShader.vertexShader, fragmentShader: GradeShader.fragmentShader,
      uniforms: { tDiffuse: { value: null }, uTime: gradeU.uTime, uRes: { value: new THREE.Vector2(1, 1) }, uGrain: { value: 0 }, uVig: { value: 0 }, uCold: gradeU.uCold, uFrost: { value: 0 } } }));
    comp.addPass(this.grade);
  }
  setSize(w, h) { this.composer.setSize(w, h); this.grade.uniforms.uRes.value.set(w, h); }
  place(main, rig) {
    const c = this.cam, R = rig.sides, n = main.near, f = main.far;
    const x0 = this.sign > 0 ? R.x0 : -R.x1, x1 = this.sign > 0 ? R.x1 : -R.x0;
    main.matrixWorld.decompose(_wp, _wq, _ws);
    c.position.copy(_wp);
    c.quaternion.copy(_wq).multiply(_qYaw.setFromAxisAngle(_yAxis, -this.sign * R.yaw));
    c.near = n; c.far = f;
    c.updateMatrixWorld();
    c.projectionMatrix.makePerspective(x0 * n, x1 * n, R.y1 * n, -R.y1 * n, n, f);
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    if (this.far) this.far.box = [x0, x1, R.y1];
  }
  render(renderer) {
    if (this.taa) { if (this.taa.enabled !== this.taaMain.enabled) this.taa.enabled = this.taaMain.enabled; this.taa.mover = this.taaMain.mover; }
    this.composer.render(0);
  }
  get texture() { return this.composer.readBuffer.texture; }
  dispose() { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); this.taa?.dispose(); }
}
class LensPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uOut: { value: new THREE.Vector2(1, 1) }, uSrc: { value: new THREE.Vector2(1, 1) },
      uTexel: { value: new THREE.Vector2(1, 1) }, uD: { value: 1 }, uPeak: { value: -1 / 14 },
      uFish: { value: 0 }, uK1: { value: GOPRO_K1 }, uK3: { value: GOPRO_K3 }, uAsp: { value: 9 / 16 }, uCA: { value: 0.0025 }, uVig: { value: 0.22 },
      uNoise: { value: 0.006 }, uSat: { value: 1.16 }, uCon: { value: 1.06 }, uHelm: { value: -1 }, uTime: { value: 0 },
      uRmax: { value: GOPRO_RMAX }, uBlurK: { value: 1 },
      tSideL: { value: null }, tSideR: { value: null }, uSide: { value: 0 }, uYaw: { value: 1 }, uSBox: { value: new THREE.Vector3(-0.3, 0.5, 0.9) },
      uSeam: { value: new THREE.Vector2(SEAM - SEAM_BLEND, SEAM) }, uRotL: { value: new THREE.Matrix3() }, uRotR: { value: new THREE.Matrix3() } },
      vertexShader: AB_VERT, fragmentShader: LENS, depthTest: false, depthWrite: false });
    this.fish = false;                   // (V104) the GoPro's fisheye instead of the Panini
    this.quad = new FullScreenQuad(this.material);
    this.enabled = false;
    this.scale = 1;                      // (how much larger than the screen the scene is drawn: createComposer)
    this.rig = null;                     // (V113) the GoPro's rig (goproRig) and its side views (SideView), its screen's aspect
    this.sides = null;
    this.screenAspect = 16 / 9;
    this.turn = 0; this.lastPos = null; this.allSides = false;   // (whose turn; where the camera was; both every frame)
  }
  setSize(w, h) { this.material.uniforms.uTexel.value.set(1 / w, 1 / h); }
  // the camera drawn wider for this frame's view (its own field of view and aspect; zoom 1 when off)
  aim(cam) {
    const u = this.material.uniforms;
    if (!this.enabled) { if (cam.zoom !== 1) { cam.zoom = 1; cam.updateProjectionMatrix(); } return; }
    u.uFish.value = this.fish ? 1 : 0;
    if (this.fish && this.rig) {
      // (V113) the GoPro's frame across the screen's width, its height as the screen's; the camera is the rig's middle
      // view: its box of tangents (an aspect and a zoom of its own), the side views around it
      const R = this.rig, ty = Math.tan(cam.fov * Math.PI / 360), asp = R.tx / R.ty, z = ty / R.ty;
      u.uAsp.value = 1 / this.screenAspect; u.uSrc.value.set(R.tx, R.ty); u.uK1.value = R.K1; u.uK3.value = R.K3;
      u.uSide.value = R.sides ? 1 : 0;
      if (R.sides) { u.uYaw.value = R.sides.yaw; u.uSBox.value.set(R.sides.x0, R.sides.x1, R.sides.y1); }
      u.uSeam.value.set(R.seam[0], R.seam[1]);
      const mag = 1 / Math.max(this.scale, 0.1);                         // (the middle magnified this much on the screen)
      u.uPeak.value = -Math.min(1 / 5, mag * mag / 14 + 0.05);            // (and its own sharpening, set high)
      if (Math.abs(cam.zoom - z) > 1e-6 || Math.abs(cam.aspect - asp) > 1e-6) { cam.zoom = z; cam.aspect = asp; cam.updateProjectionMatrix(); }
      return;
    }
    const ty = Math.tan(cam.fov * Math.PI / 360), tx = ty * cam.aspect, f = lensFit(tx);
    u.uOut.value.set(tx, ty); u.uSrc.value.set(tx * f.m, ty * f.m); u.uD.value = f.d;
    // (the sharpening back: as much as the middle is magnified - measured at 1.04x, -1/14 gives the detail of the
    // view without the lens: Laplacian 0.0398 against 0.0403)
    const mag = f.m / this.scale;
    u.uPeak.value = -Math.min(1 / 6, mag * mag / 14);
    if (Math.abs(cam.zoom - 1 / f.m) > 1e-6) { cam.zoom = 1 / f.m; cam.updateProjectionMatrix(); }
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    // (V113) the side views first, from where the middle was just drawn (the shadow maps as it left them: not again);
    // one a frame, in turn, while the camera stands (each at half the frame rate, the head's turn since taken back in the
    // lens: uRot - a turn about the lens's centre shifts nothing near against what is far); both once it moves more
    // than 1.5 cm a frame (walking, a car: what is near would shift between them at the seam), or after a cut
    if (this.fish && this.rig?.sides && this.sides && this.camera) {
      const cam = this.camera;
      cam.matrixWorld.decompose(_lp, _lq, _ls);
      const moved = this.lastPos ? _lp.distanceTo(this.lastPos) : Infinity;
      (this.lastPos ??= new THREE.Vector3()).copy(_lp);
      const both = moved > 0.015 || this.allSides;
      this.turn = (this.turn + 1) & 1;
      const sm = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      this.sides.forEach((v, i) => {
        if (both || !v.valid || this.turn === i) { v.place(cam, this.rig); v.render(renderer); v.q.copy(_lq); v.valid = true; }
        // the rotation from this frame's camera to the one it was drawn with, in the lens's axes (z ahead)
        _rq.copy(v.q).invert().multiply(_lq);
        const e = (i ? u.uRotR : u.uRotL).value.setFromMatrix4(_rm.makeRotationFromQuaternion(_rq)).elements;
        e[2] = -e[2]; e[5] = -e[5]; e[6] = -e[6]; e[7] = -e[7];
      });
      renderer.shadowMap.autoUpdate = sm;
      u.tSideL.value = this.sides[0].texture; u.tSideR.value = this.sides[1].texture;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); this.sides?.forEach(v => v.dispose()); }
}

// The far relief and the sky (terrain.js FAR): drawn first into the frame with a camera of their own (the street's
// view, 30 m to 430 km), so the mountains 40-300 km away keep a depth precision of metres; the map is drawn over them
// after the depth is cleared (the RenderPass). Nothing of the map lies beyond the far relief along any view ray (the
// rings surround the map's square), so the order is right everywhere.
class FarPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera; this.needsSwap = false; this.jitter = null;
    this.cam = new THREE.PerspectiveCamera(70, 1, 30, 430000);              // (the outer relief ring reaches 300 km)
  }
  render(renderer, writeBuffer, readBuffer) {
    const c = this.cam, m = this.camera;
    c.position.copy(m.position); c.quaternion.copy(m.quaternion);
    if (c.fov !== m.fov || c.aspect !== m.aspect || c.zoom !== m.zoom) { c.fov = m.fov; c.aspect = m.aspect; c.zoom = m.zoom; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
    // (the anti-aliasing's sub-pixel shift, the same as the main camera's: taa.js)
    const e = c.projectionMatrix.elements, e8 = e[8], e9 = e[9];
    if (this.jitter) { e[8] += this.jitter.x; e[9] += this.jitter.y; }
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clear();
    renderer.render(this.scene, c);
    renderer.autoClear = ac;
    e[8] = e8; e[9] = e9;
  }
}

function nanGuard() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = min(c, vec4(64.0)); }',
  });
}

export function createComposer(renderer, scene, camera, q, farScene = null) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // (with a depth texture: the wet-ground reflections march through it)
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0, depthTexture: q.ssr ? new THREE.DepthTexture(size.x, size.y) : null });
  const composer = new EffectComposer(renderer, rt);
  // (V108: its sizes given in the device's pixels, whole - with its own pixel ratio, a larger drawing came out fractional,
  // e.g. 2080.84 x 1300.53: the buffers cut to 2080 x 1300, the lens's texel grid then off by up to a texel)
  composer.setPixelRatio(1);
  // the temporal anti-aliasing (taa.js): it needs the scene's depth, so not on the lowest setting (SMAA there)
  const taa = q.ssr ? new TAAPass(camera, null, null) : null;
  if (taa) composer.addPass(new TAAJitter(taa));
  let far = null;
  if (farScene) {
    composer.addPass(far = new FarPass(farScene, camera));
    const rp = new RenderPass(scene, camera);
    rp.clear = false; rp.clearDepth = true;              // (over the far relief)
    composer.addPass(rp);
  } else composer.addPass(new RenderPass(scene, camera));
  let gtao = null, bloom = null, smaa = null, ssr = null;
  const reuse = q.ao && q.ssr && (() => { try { return localStorage.getItem('strada.aoReuse') !== 'false'; } catch (_) { return true; } })();
  // (the scene's depth: for the AO when it reuses it, and for the cinematics' lens and shutter, cinepass.js)
  const tap = q.ssr ? new DepthTap() : null;
  if (tap) composer.addPass(tap);
  if (taa) taa.attach(tap, far);
  if (q.ssr) { ssr = new WetSSRPass(camera); composer.addPass(ssr); }
  // AO straight after the reflections: no pass in between may draw into the buffer whose depth it reads
  if (q.ao) {
    gtao = new FoliageSafeGTAO(scene, camera, size.x, size.y);
    gtao.tap = reuse ? tap : null;
    gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.6, scale: 1.15, samples: 16, distanceFallOff: 0.9, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.95;
    composer.addPass(gtao);
  }
  // safety net: never let a stray NaN/Inf pixel be smeared across the screen by blur passes
  composer.addPass(nanGuard());
  // the anti-aliasing: after the reflections and the AO (smoothed with the rest), before the haze's blur and the bloom
  if (taa) composer.addPass(taa);
  // the air shimmering over the campfire (campfire.js turns it on near a lit fire in view)
  const heat = new ShaderPass(HeatShader);
  heat.enabled = false;
  composer.addPass(heat);
  // the softness of distant things in the haze (after the passes that read the scene's depth through this buffer)
  const aerial = new AerialBlurPass(camera);
  composer.addPass(aerial);
  // the sun's shafts through the haze (on while the sun shines into the frame: shafts.js)
  const shafts = q.shafts && tap ? new ShaftsPass(camera, tap) : null;
  if (shafts) composer.addPass(shafts);
  // a film lens and shutter for recorded cinematics (off in play)
  const cine = new CinePass(camera, tap);
  composer.addPass(cine);
  // the rain on the windshield, from the driver's seat (windshield.js; off but in a car's cockpit in the rain)
  const shield = new WindshieldPass(tap);
  composer.addPass(shield);
  // (V101) the naked eye's optics (eye.js): the glare of everything bright as the CIE's equation spreads it (on the
  // frame itself where there is a bloom), the lights' glare, corona and halo, the pupil and the focus, the squint and
  // the tears in a blizzard - before the retina's own response (vision.js). It replaces the thresholded bloom.
  const eye = new EyePass(camera, tap, !!q.bloom);
  composer.addPass(eye);
  // the eye at night: rods instead of cones below ~5 cd/m2 (vision.js; off by day)
  const vision = new VisionPass();
  composer.addPass(vision);
  composer.addPass(new OutputPass());
  if (q.smaa) { smaa = new SMAAPass(); smaa.enabled = !taa; composer.addPass(smaa); }
  const cas = taa ? new ShaderPass(CASShader) : null;
  if (cas) { cas.uniforms.uTexel.value.set(1 / size.x, 1 / size.y); composer.addPass(cas); }
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  // the enhanced field of view: the last pass, from the picture drawn wider (and larger) to the screen
  const lens = new LensPass();
  lens.camera = camera;
  composer.addPass(lens);
  // (how much larger than the screen the scene is drawn with the lens on: the middle keeps its sharpness up to this)
  const lensMax = q.ao ? (q.pixelRatio >= 2 ? 1.4 : 1.25) : q.ssr ? 1.1 : 1;
  // (V108) the GoPro's picture on the screen's every pixel (the device's own pixel ratio, not the quality's), at most
  // the GoPro's own largest frame - 5.3K, 5312 x 2988 pixels (15.9 MP) - and what the graphics card can hold. (If the
  // card gives up, main.js steps down the GoPro's own ladder for the tab: 4K UHD, 3840 x 2160, then 2.7K, 2704 x 1520.)
  const GOPRO_FRAMES = [5312 * 2988, 3840 * 2160, 2704 * 1520], basePr = renderer.getPixelRatio(), gl = renderer.getContext();
  let goproLevel = 0;
  const hwMax = Math.min(renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
  const css = renderer.getSize(new THREE.Vector2());
  let scale = 1, lastW = css.x, lastH = css.y;               // (the canvas's size in CSS pixels until the first resize)
  let sizeW = 0, sizeH = 0;                                  // (the passes' size as set: the GoPro's middle has an aspect of its own)
  const setComposerSize = (w, h) => {
    composer.setSize(w, h);
    grade.uniforms.uRes.value.set(w, h);
    if (cas) cas.uniforms.uTexel.value.set(1 / w, 1 / h);
    if (gtao) gtao.setSize(w, h);
    sizeW = w; sizeH = h;
  };
  const resize = () => {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(scale).round();
    setComposerSize(s.x, s.y);
  };
  // the drawing size k (and the pixel ratio pr): the buffers made again only when either changes, or for a new window
  const apply = (k, pr, force = false) => {
    const prNew = Math.abs(pr - renderer.getPixelRatio()) > 1e-3;
    if (prNew) renderer.setPixelRatio(pr);
    if (force || prNew || Math.abs(k - scale) > 1e-3) { scale = k; resize(); }
    lens.scale = scale;
  };
  // (V113) the GoPro: the rig of its lens (goproRig) on the screen's device pixels; the middle and the side views drawn
  // at the scale the frame rate allows (DRS[drs] of one picture pixel to one screen pixel; V108 drew the middle 1:1
  // always), within the 5.3K frame and the card's limits
  let goproLens = 0, drs = 3;
  const goproFit = (force) => {
    const pr = window.devicePixelRatio || 1, w = Math.round(lastW * pr), h = Math.round(lastH * pr);
    const rig = goproRig(GOPRO_LENSES[goproLens].diag, w / h), R = rig.sides;
    lens.rig = rig; lens.screenAspect = w / h;
    const fc = (w / 2) / rig.K1;                             // (the frame's pixels a radian, in its middle)
    const mp = (2 * fc * rig.tx) * (2 * fc * rig.ty) + (R ? 2 * (fc * (R.x1 - R.x0)) * (2 * fc * R.y1) : 0);
    const s = Math.min(DRS[drs], Math.sqrt(GOPRO_FRAMES[goproLevel] / mp));
    const cl = (v) => Math.max(16, Math.min(hwMax - 2, Math.round(v)));
    const cw = cl(2 * fc * rig.tx * s), ch = cl(2 * fc * rig.ty * s);
    if (Math.abs(pr - renderer.getPixelRatio()) > 1e-3) renderer.setPixelRatio(pr);
    if (force || cw !== sizeW || ch !== sizeH) setComposerSize(cw, ch);
    if (R) {
      lens.sides ??= [new SideView(renderer, scene, farScene, -1, taa, grade.uniforms), new SideView(renderer, scene, farScene, 1, taa, grade.uniforms)];
      const sw = cl(fc * (R.x1 - R.x0) * s), sh = cl(2 * fc * R.y1 * s);
      for (const v of lens.sides) { v.setSize(sw, sh); v.valid = false; }
    }
    scale = s; lens.scale = s;
    lens.aim(camera);
  };
  // (V113) its frame rate: the scale a step down when the frames take 15 % longer than the eyes' did (and than 60 Hz's),
  // over a second; a step up when they keep within 8 % of it (at the screen's refresh: the headroom is not seen) -
  // taken back if that was too much (and no step up for 20 s); a step down that did not help (the processor, not the
  // graphics card, the limit) taken back too (and no step down for 10 s)
  const D = { t: 0, n: 0, sum: 0, eye: 1000 / 60, hold: 0, probe: false, last: null, upBlock: 0, downBlock: 0 };
  let drsLock = null;                                        // (a scale held: tests, or a setting)
  const goproFrame = (ms) => {
    if (!(ms > 0 && ms < 1000)) return;
    if (!lens.fish) { D.eye += (ms - D.eye) * 0.02; return; }
    if (drsLock !== null) return;
    D.sum += ms; D.n++; D.t += ms;
    if (D.t < 1000) return;
    const ft = D.sum / D.n; D.t = 0; D.sum = 0; D.n = 0;
    if (D.hold > 0) { D.hold--; return; }                    // (the window after a change: its buffers made again)
    const target = Math.max(1000 / 60, D.eye), set = (v) => { drs = v; goproFit(false); D.hold = 1; };
    if (D.upBlock > 0) D.upBlock--;
    if (D.downBlock > 0) D.downBlock--;
    if (D.probe) { D.probe = false; if (ft > target * 1.15 && drs > 0) { D.upBlock = 20; set(drs - 1); return; } }
    if (D.last) { const l = D.last; D.last = null; if (ft > l.ft * 0.95) { D.downBlock = 10; set(l.level); return; } }
    if (ft > target * 1.15 && drs > 0 && !D.downBlock) { D.last = { ft, level: drs }; set(drs - 1); return; }
    if (ft < target * 1.08 && drs < DRS.length - 1 && !D.upBlock) { D.probe = true; set(drs + 1); }
  };
  const setSize = (w, h) => {
    lastW = w; lastH = h;
    if (lens.fish) goproFit(true); else resize();
  };
  // on or off (the menu); the drawing size from the overscan of the view as it is now (its field of view and aspect).
  // (While the GoPro is on, the menu's lens waits: it comes back with the GoPro off - main.js calls this then.)
  const setLens = (on, fov = camera.fov) => {
    if (lens.fish) return;
    lens.enabled = on;
    const ty = Math.tan(fov * Math.PI / 360);
    const k = on ? Math.min(lensMax, lensFit(ty * camera.aspect).m) : 1;
    apply(k, basePr);
    lens.aim(camera);
  };
  // (V104) the GoPro's picture on (its rig) or off (back to the quality's pixel ratio and the screen's size and aspect,
  // then the lens the menu set: setLens after it)
  const setGoPro = (on) => {
    lens.fish = on;
    if (!on) {
      lens.material.uniforms.uFish.value = 0; lens.material.uniforms.uSide.value = 0;
      camera.aspect = lastW / lastH; camera.zoom = 1; camera.updateProjectionMatrix();
      apply(1, basePr, true);
      return;
    }
    lens.enabled = true;
    goproFit(true);
  };
  // (V113) its drawing scale held at DRS[i] (null: the frame rate picks it again)
  const setGoProScale = (i) => { drsLock = i === null ? null : Math.max(0, Math.min(DRS.length - 1, i | 0)); if (drsLock !== null) { drs = drsLock; if (lens.fish) goproFit(false); } };
  // (V113) the GoPro's lens (GOPRO_LENSES): the next one
  const setGoProLens = (i) => { const n = GOPRO_LENSES.length; goproLens = ((i % n) + n) % n; if (lens.fish) goproFit(true); return GOPRO_LENSES[goproLens]; };
  // (V113) the camera that says what is in view (the forest's people, the hikers, the animals: nothing appears or goes
  // where you can see it): with the GoPro, a frustum round its whole frame, not its middle view's
  const seeCam = new THREE.PerspectiveCamera();
  const viewCam = () => {
    if (!lens.fish || !lens.rig) return camera;
    camera.updateMatrixWorld();
    camera.matrixWorld.decompose(seeCam.position, seeCam.quaternion, _ws);
    const n = camera.near, [ax, ay] = lens.rig.all;
    seeCam.near = n; seeCam.far = camera.far;
    seeCam.projectionMatrix.makePerspective(-ax * n, ax * n, ay * n, -ay * n, n, camera.far);
    seeCam.projectionMatrixInverse.copy(seeCam.projectionMatrix).invert();
    seeCam.updateMatrixWorld();
    return seeCam;
  };
  // the anti-aliasing on or off (the menu): SMAA while TAA is off, the sharpening with TAA
  const setTAA = (on) => { if (!taa) return; taa.enabled = on; if (smaa) smaa.enabled = !on; if (cas) cas.enabled = on; };
  return { composer, grade, gtao, bloom, smaa, ssr, aerial, shafts, cine, shield, vision, eye, taa, heat, cas, lens, setTAA, setSize, setLens, setGoPro, setGoProLens, setGoProScale, goproFrame, get scale() { return scale; },
    get viewCam() { return viewCam(); }, get goproLens() { return goproLens; }, get drs() { return DRS[drs]; },
    get goproLevel() { return goproLevel; }, set goproLevel(v) { goproLevel = Math.max(0, Math.min(GOPRO_FRAMES.length - 1, v | 0)); } };
}
