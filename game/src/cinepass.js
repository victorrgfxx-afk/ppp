import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// A film camera's lens and shutter, for recorded cinematics (the trailer): off in play (enabled only while a recording
// sets `params`), so the game itself is untouched.
//  * depth of field: a thin lens focused at `focus` metres; the blur circle of a point at depth z is
//    c = blur * |1 - focus / z| px (blur: the circle of a point at infinity, the aperture's size in pixels), up to 24 px;
//    gathered over a 32-tap golden-angle disc, each tap counted only if its own circle reaches the centre (so a sharp
//    foreground does not bleed into the blurred background, nor the background over it);
//  * motion blur of the camera's own movement: every pixel's world point, reprojected through last frame's camera,
//    gives its motion on screen in one frame; the shutter (`shutter`: 0.5 = the 180-degree shutter of cinema, 1/48 s at
//    24 fps) smears it along that path, 12 taps, at most 48 px. Things that move by themselves (the car, the snow) keep
//    only the camera's share; a cut (`cut`) skips one frame of it.
// It reads the scene's depth as drawn by the main pass, copied out at once (DepthTap's hook) as the distance along the
// view axis into a float target of its own: the passes in between draw full-screen quads into the composer's buffers
// with the depth test on, and the quad's depth (0) overwrites the scene's in that buffer's depth texture. It keeps the
// alpha (the haze's share) of the pixel. It draws into targets of its own and copies the result out: the composer's
// buffer it writes to may be the one the depth belongs to, and a draw that samples a texture attached to its own
// framebuffer is refused (a feedback loop).
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
const LIN = /* glsl */`
uniform sampler2D tDepth;
uniform mat4 uInvProj;
varying vec2 vUv;
void main() { float d = texture2D(tDepth, vUv).r; vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); gl_FragColor = vec4(-v.z / v.w, 0.0, 0.0, 1.0); }`;
const DOF = /* glsl */`
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uTexel;
uniform float uFocus, uBlur;
varying vec2 vUv;
float depthAt(vec2 uv) { return texture2D(tDepth, uv).r; }
float coc(float z) { return min(24.0, uBlur * abs(1.0 - uFocus / max(z, 0.05))); }
void main() {
  vec4 c0 = texture2D(tDiffuse, vUv);
  float r0 = coc(depthAt(vUv));
  vec3 acc = c0.rgb; float w = 1.0;
  if (r0 > 0.5) {
    for (int i = 1; i < 32; i++) {
      float fi = float(i), r = sqrt(fi / 31.0) * r0, a = fi * 2.39996323;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
      float rs = coc(depthAt(uv));
      float k = smoothstep(r - 1.0, r + 0.5, max(rs, r0 * 0.25));      // (its own circle reaches here)
      acc += texture2D(tDiffuse, uv).rgb * k; w += k;
    }
  }
  gl_FragColor = vec4(acc / w, c0.a);
}`;
const MB = /* glsl */`
uniform sampler2D tDiffuse, tDepth;
uniform mat4 uInvProj, uCamWorld, uPrevVP;
uniform vec2 uRes;
uniform float uShutter;
varying vec2 vUv;
void main() {
  vec4 c0 = texture2D(tDiffuse, vUv);
  if (uShutter <= 0.0) { gl_FragColor = c0; return; }
  // (this pixel's point in view space: along its ray, at the distance kept)
  vec4 ray = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); ray.xyz /= ray.w;
  vec3 v = ray.xyz * (texture2D(tDepth, vUv).r / -ray.z);
  vec4 wp = uCamWorld * vec4(v, 1.0);
  vec4 pc = uPrevVP * wp;
  vec2 prev = pc.xy / pc.w * 0.5 + 0.5;
  vec2 mv = (vUv - prev) * uShutter;
  float L = length(mv * uRes);
  if (pc.w <= 0.0 || L < 0.5) { gl_FragColor = c0; return; }
  mv *= min(1.0, 48.0 / L);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 12; i++) acc += texture2D(tDiffuse, vUv + mv * (float(i) / 11.0 - 0.5)).rgb;
  gl_FragColor = vec4(acc / 12.0, c0.a);
}`;

export class CinePass extends Pass {
  constructor(camera, tap) {
    super();
    this.camera = camera; this.tap = tap;
    this.params = null;                    // { focus: m, blur: px, shutter: 0..1, cut: bool }
    this.dof = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uFocus: { value: 10 }, uBlur: { value: 0 } },
      vertexShader: VERT, fragmentShader: DOF, depthTest: false, depthWrite: false });
    this.mb = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uShutter: { value: 0.5 } },
      vertexShader: VERT, fragmentShader: MB, depthTest: false, depthWrite: false });
    this.mid = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.mid2 = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.copy = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader: VERT, fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }', depthTest: false, depthWrite: false });
    this.lin = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.linMat = new THREE.ShaderMaterial({ uniforms: { tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() } }, vertexShader: VERT, fragmentShader: LIN, depthTest: false, depthWrite: false });
    this.hasLin = false;
    this.quad = new FullScreenQuad(null);
    this.prevVP = new THREE.Matrix4(); this.hasPrev = false;
    this.enabled = false;
  }
  // (on, it has the depth copied out as the scene pass leaves it; off, the game pays nothing)
  get enabled() { return this._on; }
  set enabled(on) {
    this._on = on;
    if (this.tap) { this.hook ??= (r, rb) => this.keepDepth(r, rb); on ? this.tap.hooks.add(this.hook) : this.tap.hooks.delete(this.hook); }
    if (!on) this.hasLin = this.hasPrev = false;
  }
  keepDepth(renderer, rb) {
    if (!rb.depthTexture) return;
    if (this.lin.width !== rb.width || this.lin.height !== rb.height) this.lin.setSize(rb.width, rb.height);
    this.linMat.uniforms.tDepth.value = rb.depthTexture; this.linMat.uniforms.uInvProj.value.copy(this.camera.projectionMatrixInverse);
    this.quad.material = this.linMat;
    renderer.setRenderTarget(this.lin);
    this.quad.render(renderer);
    this.hasLin = true;
  }
  setSize(w, h) { this.mid.setSize(w, h); this.mid2.setSize(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const p = this.params ?? {}, cam = this.camera, depth = this.hasLin ? this.lin.texture : null;
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const doDof = depth && p.blur > 0, doMb = depth && p.shutter > 0 && this.hasPrev && !p.cut;
    let src = readBuffer.texture;
    if (doDof) {
      const u = this.dof.uniforms;
      u.tDiffuse.value = src; u.tDepth.value = depth;
      u.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height); u.uFocus.value = p.focus ?? 10; u.uBlur.value = p.blur;
      this.quad.material = this.dof;
      renderer.setRenderTarget(this.mid);
      this.quad.render(renderer);
      src = this.mid.texture;
    }
    if (doMb || !doDof) {
      // (with no motion either - a cut, or no shutter set - the same pass copies it through at a shutter of 0)
      const u = this.mb.uniforms;
      u.tDiffuse.value = src; u.tDepth.value = depth ?? null; u.uInvProj.value.copy(cam.projectionMatrixInverse); u.uCamWorld.value.copy(cam.matrixWorld);
      u.uPrevVP.value.copy(this.prevVP); u.uRes.value.set(readBuffer.width, readBuffer.height); u.uShutter.value = doMb ? p.shutter : 0;
      this.quad.material = this.mb;
      renderer.setRenderTarget(this.mid2);
      this.quad.render(renderer);
      src = this.mid2.texture;
    }
    this.copy.uniforms.tDiffuse.value = src;
    this.quad.material = this.copy;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
    this.prevVP.copy(vp); this.hasPrev = true;
  }
  dispose() { this.dof.dispose(); this.mb.dispose(); this.copy.dispose(); this.linMat.dispose(); this.mid.dispose(); this.mid2.dispose(); this.lin.dispose(); this.quad.dispose(); }
}
