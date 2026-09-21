/**
 * Post-procesare proprie (fara three/examples): scena -> HDR half-float cu
 * MSAA -> bright pass -> 5 niveluri de bloom -> compozitie cu ACES,
 * gradare nocturna, vigneta, aberatie cromatica, grain si dither.
 * Dither-ul e obligatoriu: fara el, degradeurile intunecate fac benzi.
 */
import * as THREE from '../vendor/three.module.min.js';

const VS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FS = `
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * contrib, 1.0);
}`;

const BLUR_FS = `
uniform sampler2D tDiffuse;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227027;
  s += (texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb
      + texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  s += (texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb
      + texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`;

const COMP_FS = `
uniform sampler2D tScene;
uniform sampler2D tB0;
uniform sampler2D tB1;
uniform sampler2D tB2;
uniform sampler2D tB3;
uniform sampler2D tB4;
uniform float uExposure;
uniform float uBloom;
uniform float uGrain;
uniform float uVignette;
uniform float uCA;
uniform float uTime;
uniform float uSat;
uniform vec3  uShadowTint;
uniform vec3  uHighTint;
uniform float uFade;
uniform vec2  uRes;
varying vec2 vUv;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
             step(vec3(0.0031308), c));
}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);

  // aberatie cromatica radiala (ca la lentilele mici de telefon)
  float ca = uCA * r2;
  vec3 col;
  col.r = texture2D(tScene, uv + d * ca).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - d * ca).b;

  vec3 bloom = texture2D(tB0, uv).rgb * 1.00
             + texture2D(tB1, uv).rgb * 0.85
             + texture2D(tB2, uv).rgb * 0.62
             + texture2D(tB3, uv).rgb * 0.44
             + texture2D(tB4, uv).rgb * 0.30;
  col += bloom * uBloom;

  col *= uExposure;
  col = aces(col);

  // gradare: umbre reci, lumini calde (sodiu/LED cald), desaturare in umbra
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, col * uShadowTint, (1.0 - smoothstep(0.0, 0.34, l)) * 0.85);
  col = mix(col, col * uHighTint, smoothstep(0.45, 1.0, l) * 0.55);
  col = mix(vec3(l), col, mix(uSat * 0.72, uSat, smoothstep(0.02, 0.30, l)));

  // vigneta
  col *= mix(1.0, smoothstep(0.90, 0.16, r2), uVignette);

  // grain de senzor + dither ordonat pe 8 biti
  float n = hash(uv * uRes + vec2(fract(uTime * 7.13) * 511.0, fract(uTime * 3.77) * 379.0));
  col += (n - 0.5) * uGrain * (1.0 - smoothstep(0.0, 0.7, l));
  col += (hash(uv * uRes * 1.37 + 13.7) - 0.5) / 255.0;

  col *= uFade;
  gl_FragColor = vec4(toSRGB(col), 1.0);
}`;

function quad(material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return new THREE.Mesh(g, material);
}

export class PostFX {
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.opts = Object.assign({
      levels: 5, msaa: 4, exposure: 0.85, bloom: 0.62, threshold: 0.78,
      knee: 0.45, grain: 0.055, vignette: 0.85, ca: 0.0022, sat: 0.92,
      scale: 1.0,
    }, opts);

    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsScene = new THREE.Scene();

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: BRIGHT_FS, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: this.opts.threshold }, uKnee: { value: this.opts.knee } },
    });
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
    });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: null },
        tB0: { value: null }, tB1: { value: null }, tB2: { value: null },
        tB3: { value: null }, tB4: { value: null },
        uExposure: { value: this.opts.exposure },
        uBloom: { value: this.opts.bloom },
        uGrain: { value: this.opts.grain },
        uVignette: { value: this.opts.vignette },
        uCA: { value: this.opts.ca },
        uTime: { value: 0 },
        uSat: { value: this.opts.sat },
        uShadowTint: { value: new THREE.Color(0.80, 0.88, 1.12) },
        uHighTint: { value: new THREE.Color(1.10, 1.02, 0.90) },
        uFade: { value: 1 },
        uRes: { value: new THREE.Vector2(1920, 1080) },
      },
    });

    this.quad = quad(this.brightMat);
    this.quad.frustumCulled = false;
    this.fsScene.add(this.quad);

    this.rts = [];
    this.tmps = [];
    this.sceneRT = null;
    this._size = new THREE.Vector2();
  }

  setSize(w, h) {
    const s = this.opts.scale;
    const W = Math.max(2, Math.floor(w * s));
    const H = Math.max(2, Math.floor(h * s));
    if (this._size.x === W && this._size.y === H) return;
    this._size.set(W, H);
    this.compMat.uniforms.uRes.value.set(W, H);

    if (this.sceneRT) this.sceneRT.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      samples: this.opts.msaa,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    for (const rt of this.rts) rt.dispose();
    for (const rt of this.tmps) rt.dispose();
    this.rts = []; this.tmps = [];
    let bw = W >> 1, bh = H >> 1;
    for (let i = 0; i < this.opts.levels; i++) {
      const cfg = {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: false,
        stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      };
      this.rts.push(new THREE.WebGLRenderTarget(Math.max(2, bw), Math.max(2, bh), cfg));
      this.tmps.push(new THREE.WebGLRenderTarget(Math.max(2, bw), Math.max(2, bh), cfg));
      bw >>= 1; bh >>= 1;
    }
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.fsScene, this.orthoCam);
  }

  render(time, fade = 1) {
    const r = this.renderer;
    r.info.reset();
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, this.camera);
    this.stats = { calls: r.info.render.calls, tris: r.info.render.triangles };

    // bright pass
    this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
    this._pass(this.brightMat, this.rts[0]);

    // lant de blur separabil, la rezolutii din ce in ce mai mici
    for (let i = 0; i < this.rts.length; i++) {
      const src = i === 0 ? this.rts[0] : this.rts[i - 1];
      const dst = this.rts[i];
      const tmp = this.tmps[i];
      this.blurMat.uniforms.tDiffuse.value = src.texture;
      this.blurMat.uniforms.uDir.value.set(1 / dst.width, 0);
      this._pass(this.blurMat, tmp);
      this.blurMat.uniforms.tDiffuse.value = tmp.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1 / dst.height);
      this._pass(this.blurMat, dst);
    }

    const u = this.compMat.uniforms;
    u.tScene.value = this.sceneRT.texture;
    for (let i = 0; i < 5; i++) {
      u['tB' + i].value = this.rts[Math.min(i, this.rts.length - 1)].texture;
    }
    u.uTime.value = time;
    u.uFade.value = fade;
    this._pass(this.compMat, null);
    r.setRenderTarget(null);
  }

  set(key, value) {
    if (key === 'exposure') this.compMat.uniforms.uExposure.value = value;
    else if (key === 'bloom') this.compMat.uniforms.uBloom.value = value;
    else if (key === 'grain') this.compMat.uniforms.uGrain.value = value;
    else if (key === 'vignette') this.compMat.uniforms.uVignette.value = value;
    else if (key === 'ca') this.compMat.uniforms.uCA.value = value;
    else if (key === 'sat') this.compMat.uniforms.uSat.value = value;
    else if (key === 'threshold') this.brightMat.uniforms.uThreshold.value = value;
  }
}
