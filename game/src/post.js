import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// GTAO that ignores alpha-tested foliage/grass (they would render as solid quads in its normal pass).
class FoliageSafeGTAO extends GTAOPass {
  _overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      if ((o.isPoints || o.isLine || o.userData.noAO) && o.visible) { o.visible = false; cache.push(o); }
    });
  }
}

// Photographic finish: slight lens vignette, fine film grain, gentle S-curve, a touch of CA.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uGrain: { value: 0.035 }, uVig: { value: 0.28 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uGrain; uniform float uVig;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
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
      // vignette
      col *= 1.0 - uVig * smoothstep(0.12, 0.75, r2 * 1.6);
      // grain (luma weighted)
      float g = h(vUv * uRes + fract(uTime * 13.7) * 91.0) - 0.5;
      col += g * uGrain * (0.6 + 0.4 * (1.0 - dot(col, vec3(0.333))));
      gl_FragColor = vec4(col, 1.0);
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
  gl_FragColor = vec4(c.rgb, 1.0);
  float refl = clamp(1.0 - c.a, 0.0, 1.0);
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

export function createComposer(renderer, scene, camera, q) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // (with a depth texture: the wet-ground reflections march through it)
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0, depthTexture: q.ssr ? new THREE.DepthTexture(size.x, size.y) : null });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null, bloom = null, smaa = null, ssr = null;
  if (q.ssr) { ssr = new WetSSRPass(camera); composer.addPass(ssr); }
  // safety net: never let a stray NaN/Inf pixel be smeared across the screen by blur passes
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = min(c, vec4(64.0)); }',
  }));
  if (q.ao) {
    gtao = new FoliageSafeGTAO(scene, camera, size.x, size.y);
    gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.6, scale: 1.15, samples: 16, distanceFallOff: 0.9, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.95;
    composer.addPass(gtao);
  }
  if (q.bloom) {
    // only really bright things (sun glints, lamps) bloom: a bright overcast sky must not veil the view
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.1, 0.4, 1.3);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  if (q.smaa) { smaa = new SMAAPass(); composer.addPass(smaa); }
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const setSize = (w, h) => {
    composer.setSize(w, h);
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    grade.uniforms.uRes.value.set(s.x, s.y);
    if (gtao) gtao.setSize(s.x, s.y);
  };
  return { composer, grade, gtao, bloom, smaa, ssr, setSize };
}
