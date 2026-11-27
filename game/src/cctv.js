import * as THREE from 'three';

// (V128) The commune's cameras as the post's system sees them: where each one is and what it looks at, and its picture -
// drawn from the game itself (640 x 360 by default; main.js sizes them by the quality), with the main view's own colours (the same ACES curve, its exposure; the
// sRGB encoding is the target's own - an SRGB8_ALPHA8 texture, which the card encodes on write and decodes on read, as
// three.js leaves it for render targets: V126 had a guess at all this, 320 x 180), the far relief behind it as the
// main view has it. One camera at a time,
// round the list, as a recorder polls its channels (the caller says which and how often). Pan, tilt and zoom on the ones
// that have them. At night the infrared ones drop their IR-cut filter: black and white, lit by their own LEDs (a gain).
// Each keeps its last picture (its own 8-bit target): the video wall in the post shows them all at once, the system's
// screens read them back.
const TONE = /* glsl */`
uniform sampler2D tHDR;
uniform float uExp, uIR, uNoise, uTime, uGain;
varying vec2 vUv;
// three.js' ACESFilmicToneMapping (Stephen Hill's fit), the curve the game's own frame ends with
vec3 rrtOdt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(OUT * rrtOdt(IN * (c * uExp / 0.6)), 0.0, 1.0);
}
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main() {
  vec3 c = max(texture2D(tHDR, vUv).rgb, 0.0) * uGain;
  if (uIR > 0.5) {
    // (no IR-cut filter: the near infrared the leaves and the skin give back strongly - foliage bright, as IR pictures
    // show it - in one channel)
    float l = dot(c, vec3(0.30, 0.59, 0.11)) + 0.25 * c.g;
    c = vec3(l);
  }
  c = aces(c);
  // (the sensor's noise, even in the encoded steps from black to white: here in linear light, so scaled by the inverse
  // of sRGB's slope, 2.4 c^0.583 / 1.055)
  c += (hash(gl_FragCoord.xy + fract(uTime * 13.1) * 400.0) - 0.5) * uNoise * (0.02 + 2.27 * pow(c, vec3(0.583)));
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class CCTV {
  // renderer, scene, farScene (the far relief, or null)
  constructor(renderer, scene, farScene = null, { w = 640, h = 360 } = {}) {
    this.renderer = renderer; this.scene = scene; this.farScene = farScene; this.w = w; this.h = h;
    this.cams = [];
    this.hdr = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
    this.cam = new THREE.PerspectiveCamera(60, w / h, 0.1, 3000);
    this.far = new THREE.PerspectiveCamera(60, w / h, 30, 430000);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: TONE, depthTest: false, depthWrite: false,
      uniforms: { tHDR: { value: this.hdr.texture }, uExp: { value: 1 }, uIR: { value: 0 }, uNoise: { value: 0.02 }, uTime: { value: 0 }, uGain: { value: 1 } } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.buf = new Uint8Array(w * h * 4);
    this.img = null;
  }
  // a camera: { id, name, ip, x, y, z, yaw, pitch, fov, ptz, ir, model }, and for one that sees a place apart (the post's
  // rooms: bunker.js) layers (the mask it sees), far: false (no relief behind), exposure (its own), pre() / post() (to
  // show what it needs while it draws); its picture black until first drawn
  add(c) {
    const cam = { pan: 0, tilt: 0, zoom: 1, rt: this.target(), at: -1, frames: 0, ...c };
    this.cams.push(cam);
    return cam;
  }
  // a camera's own picture: 8-bit sRGB (encoded by the card on write), black until first drawn
  target() {
    const t = new THREE.WebGLRenderTarget(this.w, this.h, { depthBuffer: false });
    t.texture.colorSpace = THREE.SRGBColorSpace; t.texture.generateMipmaps = false;
    return t;
  }
  // pan / tilt (radians) and zoom (1 to 8) on a camera that can (fixed ones keep their view)
  ptz(i, dp, dt, dz) {
    const c = this.cams[i]; if (!c?.ptz) return false;
    c.pan = Math.max(-2.6, Math.min(2.6, c.pan + dp));
    c.tilt = Math.max(-0.9, Math.min(0.5, c.tilt + dt));
    c.zoom = Math.max(1, Math.min(8, c.zoom * dz));
    return true;
  }
  reset(i) { const c = this.cams[i]; if (c) { c.pan = 0; c.tilt = 0; c.zoom = 1; } }
  // its picture now: drawn into its own target (sRGB bytes). night 0..1 (the infrared ones switch over past 0.55),
  // exposure: the main view's (renderer.toneMappingExposure), time for the noise
  render(i, { night = 0, exposure = 1, time = 0 } = {}) {
    const c = this.cams[i]; if (!c) return null;
    const r = this.renderer;
    const cam = this.cam, fov = (c.fov ?? 62) / c.zoom;
    cam.layers.mask = c.layers ?? 1;
    cam.position.set(c.x, c.y, c.z);
    cam.rotation.set((c.pitch ?? 0) + c.tilt, (c.yaw ?? 0) + c.pan, 0, 'YXZ');
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    const prev = r.getRenderTarget(), ac = r.autoClear, sm = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.hdr); r.autoClear = false; r.clear();
    c.pre?.();
    if (this.farScene && c.far !== false) {
      const f = this.far; f.position.copy(cam.position); f.quaternion.copy(cam.quaternion);
      if (f.fov !== fov) { f.fov = fov; f.updateProjectionMatrix(); }
      f.updateMatrixWorld();
      r.render(this.farScene, f);
      r.clearDepth();
    }
    r.render(this.scene, cam);
    c.post?.();
    // (the infrared ones at night: their LEDs light ~30 m - a gain, and the picture in black and white)
    const ir = c.ir !== false && night > 0.55;
    const u = this.mat.uniforms;
    u.uExp.value = c.exposure ?? exposure; u.uIR.value = ir ? 1 : 0; u.uGain.value = ir ? 1 + 5 * night : 1 + 1.5 * night;
    u.uNoise.value = 0.012 + 0.05 * night; u.uTime.value = time;
    r.setRenderTarget(c.rt); r.clear();
    r.render(this.quadScene, this.quadCam);
    r.setRenderTarget(prev); r.autoClear = ac; r.shadowMap.autoUpdate = sm;
    c.at = time; c.frames++; c.irNow = ir;
    return c.rt.texture;
  }
  // its last picture onto a 2D canvas (read back from its target: a stall of the graphics card - a few a second at most)
  read(i, canvas) {
    const c = this.cams[i]; if (!c?.rt) return false;
    const w = this.w, h = this.h;
    this.renderer.readRenderTargetPixels(c.rt, 0, 0, w, h, this.buf);
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
    const g = canvas.getContext('2d');
    if (!this.img || this.img.width !== w) this.img = g.createImageData(w, h);
    const d = this.img.data, b = this.buf, row = w * 4;
    for (let y = 0; y < h; y++) d.set(b.subarray((h - 1 - y) * row, (h - y) * row), y * row);   // (the target's rows bottom up)
    g.putImageData(this.img, 0, 0);
    return true;
  }
  // its last picture onto a canvas of any size (through a scratch canvas at the camera's own size)
  readTo(i, canvas) {
    if (canvas.width === this.w && canvas.height === this.h) return this.read(i, canvas);
    this.scratch ??= document.createElement('canvas');
    if (!this.read(i, this.scratch)) return false;
    canvas.getContext('2d').drawImage(this.scratch, 0, 0, canvas.width, canvas.height);
    return true;
  }
  texture(i) { return this.cams[i]?.rt?.texture ?? null; }
  dispose() { this.hdr.dispose(); for (const c of this.cams) c.rt?.dispose(); this.mat.dispose(); }
}
