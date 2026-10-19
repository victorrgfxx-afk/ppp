import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Crepuscular rays: the sun's light scattered toward the eye by the haze in the air between the trunks, the roofs and
// the edges of clouds, which shows as bright shafts where the sky is seen past them and darker ones in their shadow.
// Screen-space volumetric light scattering (Mitchell, "Volumetric light scattering as a post-process", GPU Gems 3,
// ch. 13): the source is the sky seen near the sun, taken right after the scene pass (DepthTap's hook: depth at the
// far plane, and an alpha below 1.5 - the far relief keeps 2 - e^-tau ~ 2 there, the sky 1), at half the resolution;
// it is smeared toward the sun's place on the screen twice (48 taps, each fainter) and added to the frame before the
// tone mapping. Its strength follows the sun's direct light (none under an overcast deck, at night or in a blizzard:
// the source is then a dull sky with nothing to stand out) and fades as the sun leaves the frame. The haze scatters
// forward (aerosols: an asymmetry of ~0.7), so the shafts are brightest looking toward the sun.
// Only what the occluders make is added: the sky and the aerial perspective already hold the light scattered along
// an open path to the sun, so the smear is weighted by how much of a pixel's path toward the sun is blocked (the same
// smear of the sky mask against that of an all-sky screen): an open sky gets none (a white veil over a snowfield
// before), the gaps between trunks and the lattice of the cross keep their shafts. And by the air in front of the
// pixel (1 - e^-z/25m): a trunk or a pillar a step away has no haze before it to light.
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
const MASK = /* glsl */`
uniform sampler2D tColor, tDepth;
uniform mat4 uInvProj;
uniform vec2 uSun;
uniform float uAspect, uThr, uAir;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tColor, vUv);
  float d = texture2D(tDepth, vUv).r, sky = step(0.99999, d) * step(c.a, 1.5);
  vec2 dv = (vUv - uSun) * vec2(uAspect, 1.0);
  float near = exp(-dot(dv, dv) * 5.0);                              // (the sky's glow around the sun only)
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  // r the bright sky near the sun, g the sky there at all, b as if all were sky; a the air in front (1 for the sky)
  gl_FragColor = vec4(l * sky * near * smoothstep(uThr, uThr * 2.5, l), sky * near, near, d >= 0.99999 ? 1.0 : 1.0 - exp(v.z / v.w / uAir));
}`;
const BLUR = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uLen, uDecay;
varying vec2 vUv;
void main() {
  vec2 stp = (vUv - uSun) * uLen / 48.0, uv = vUv;
  vec3 acc = vec3(0.0); float w = 1.0, sw = 0.0;
  for (int i = 0; i < 48; i++) {
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    acc += texture2D(tSrc, uv).rgb * w * inside; sw += w; w *= uDecay; uv -= stp;
  }
  gl_FragColor = vec4(acc / sw, 1.0);
}`;
const COMP = /* glsl */`
uniform sampler2D tDiffuse, tShafts, tMask;
uniform vec3 uCol;
uniform float uK;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec3 s = texture2D(tShafts, vUv).rgb;
  float blocked = 1.0 - clamp(s.g / max(s.b, 1e-4), 0.0, 1.0);    // (of the path toward the sun, smeared alike)
  gl_FragColor = vec4(c.rgb + uCol * (s.r * blocked * texture2D(tMask, vUv).a * uK), c.a);   // (the sun's colour: its light)
}`;

export class ShaftsPass extends Pass {
  constructor(camera, tap) {
    super();
    this.camera = camera; this.tap = tap;
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.mask = rt(); this.b1 = rt(); this.b2 = rt();
    const mat = (fs, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: fs, depthTest: false, depthWrite: false });
    this.maskMat = mat(MASK, { tColor: { value: null }, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uThr: { value: 1 }, uAir: { value: 25 } });
    this.blurMat = mat(BLUR, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uLen: { value: 0.9 }, uDecay: { value: 0.96 } });
    this.compMat = mat(COMP, { tDiffuse: { value: null }, tShafts: { value: null }, tMask: { value: null }, uCol: { value: new THREE.Color(1, 1, 1) }, uK: { value: 0 } });
    this.quad = new FullScreenQuad(null);
    this.sunUv = new THREE.Vector2(); this.k = 0; this.hasMask = false; this.thr = 0.18; this.air = 25; this.gain = 1.3;
    this.hook = (r, rb) => this.takeMask(r, rb);
    this.enabled = false;
  }
  // every frame: the direction to the sun (world), how much of its light comes straight (0..1: 0 overcast or night),
  // its colour (scaled to a brightest channel of 1)
  set(sunDir, direct, strength = 1, color = null) {
    if (color) { const m = Math.max(color.r, color.g, color.b, 1e-4); this.compMat.uniforms.uCol.value.setRGB(color.r / m, color.g / m, color.b / m); }
    const cam = this.camera, v = new THREE.Vector3().copy(sunDir).multiplyScalar(1e4).add(cam.position).applyMatrix4(cam.matrixWorldInverse);
    let k = 0;
    if (v.z < 0 && direct > 0.02) {
      v.applyMatrix4(cam.projectionMatrix);                          // (to normalized device coordinates)
      this.sunUv.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      const off = Math.max(Math.abs(this.sunUv.x - 0.5), Math.abs(this.sunUv.y - 0.5));
      k = direct * strength * (1 - THREE.MathUtils.smoothstep(off, 0.7, 1.3));
    }
    this.k = k;
    const on = k > 0.005;
    if (on !== this.enabled) {
      this.enabled = on; this.hasMask = false;
      if (this.tap) on ? this.tap.hooks.add(this.hook) : this.tap.hooks.delete(this.hook);
    }
  }
  takeMask(renderer, rb) {
    if (!rb.depthTexture) return;
    const u = this.maskMat.uniforms;
    u.tColor.value = rb.texture; u.tDepth.value = rb.depthTexture; u.uSun.value.copy(this.sunUv); u.uAspect.value = rb.width / rb.height;
    u.uInvProj.value.copy(this.camera.projectionMatrixInverse); u.uAir.value = this.air;
    // (only the bright sky around the sun - its glow, the clear sky between crowns - not dark cloud bases; the sky's
    // radiance before the exposure is ~0.2-1 by day: tried 0.15-1.2 in a wood at mid-afternoon)
    u.uThr.value = this.thr;
    this.quad.material = this.maskMat;
    renderer.setRenderTarget(this.mask); this.quad.render(renderer);
    this.hasMask = true;
  }
  setSize(w, h) { const a = Math.max(1, w >> 1), b = Math.max(1, h >> 1); this.mask.setSize(a, b); this.b1.setSize(a, b); this.b2.setSize(a, b); }
  render(renderer, writeBuffer, readBuffer) {
    const b = this.blurMat.uniforms;
    if (this.hasMask) {
      b.uSun.value.copy(this.sunUv);
      b.tSrc.value = this.mask.texture; b.uLen.value = 0.95; b.uDecay.value = 0.965;
      this.quad.material = this.blurMat; renderer.setRenderTarget(this.b1); this.quad.render(renderer);
      b.tSrc.value = this.b1.texture; b.uLen.value = 0.35; b.uDecay.value = 0.985;
      renderer.setRenderTarget(this.b2); this.quad.render(renderer);
    }
    const c = this.compMat.uniforms;
    c.tDiffuse.value = readBuffer.texture; c.tShafts.value = this.b2.texture; c.tMask.value = this.mask.texture; c.uK.value = this.hasMask ? this.k * this.gain : 0;
    this.quad.material = this.compMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { for (const t of [this.mask, this.b1, this.b2]) t.dispose(); for (const m of [this.maskMat, this.blurMat, this.compMat]) m.dispose(); this.quad.dispose(); }
}
