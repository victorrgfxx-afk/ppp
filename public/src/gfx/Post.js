/* Post-processing. three r186 exposes a native output pipeline
   (renderer.setEffects) that keeps MSAA and applies tone mapping + colour space
   after the effect chain, so effects run in linear HDR and we still get real
   multisampling on geometry edges — cheaper and cleaner than EffectComposer. */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

/** Final look pass: grade, vignette, chromatic aberration, grain, subtle sharpen. */
export class GradePass extends Pass {
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uVignette: { value: 0.32 },
      uGrain: { value: 0.045 },
      uAberration: { value: 0.0016 },
      uSaturation: { value: 1.08 },
      uContrast: { value: 1.045 },
      uLift: { value: new THREE.Vector3(0.004, 0.004, 0.009) },
      uSharpen: { value: 0.28 },
      uWet: { value: 0.0 },
      uDamage: { value: 0.0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime;
        uniform float uVignette, uGrain, uAberration, uSaturation, uContrast, uSharpen, uWet, uDamage;
        uniform vec3 uLift;
        varying vec2 vUv;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

        void main(){
          vec2 uv = vUv;
          vec2 c = uv - 0.5;
          float r2 = dot(c, c);

          // lateral chromatic aberration, zero in the centre like a real lens
          float ab = uAberration * (1.0 + uDamage * 6.0);
          vec3 col;
          col.r = texture2D(tDiffuse, uv + c * r2 * ab * 2.0).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv - c * r2 * ab * 2.0).b;

          // unsharp mask against a 4-tap box blur
          if (uSharpen > 0.001) {
            vec2 px = 1.0 / uRes;
            vec3 blur = texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb
                      + texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb
                      + texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb
                      + texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb;
            col += (col - blur * 0.25) * uSharpen;
          }

          col = max(col, 0.0);
          col += uLift;
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l), col, uSaturation);
          col = (col - 0.18) * uContrast + 0.18;
          col = mix(col, col * vec3(0.97, 0.99, 1.06), uWet * 0.5);   // cool, damp look in rain
          col = max(col, 0.0);

          float vig = 1.0 - uVignette * smoothstep(0.12, 0.78, r2);
          col *= vig;

          float g = hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
          col += g * uGrain * (0.35 + 0.65 * smoothstep(1.2, 0.0, l));

          gl_FragColor = vec4(max(col, 0.0), 1.0);
        }`,
    });
    this._quad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer, deltaTime) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uTime.value += deltaTime || 0.016;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (!this.renderToScreen) renderer.clear();
    this._quad.render(renderer);
  }
  dispose() { this.material.dispose(); this._quad.dispose(); }
}

export class PostChain {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.grade = new GradePass();
    this.bloom = null;
    this.gtao = null;
    this.enabled = false;
    this._size = new THREE.Vector2(1, 1);
  }
  _ensureBloom() {
    if (this.bloom) return;
    this.bloom = new UnrealBloomPass(this._size.clone(), 0.17, 0.55, 1.65);
  }
  _ensureGtao() {
    if (this.gtao) return;
    const g = new GTAOPass(this.scene, this.camera, this._size.x, this._size.y);
    g.output = GTAOPass.OUTPUT.Default;
    g.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 0.35, scale: 1.0, samples: 12 });
    g.blendIntensity = 0.85;
    this.gtao = g;
  }
  configure({ post, bloom, ao, grain, wet = 0 }) {
    this.enabled = !!post;
    const fx = [];
    if (post) {
      if (ao) { this._ensureGtao(); fx.push(this.gtao); }
      if (bloom) { this._ensureBloom(); fx.push(this.bloom); }
      this.grade.uniforms.uGrain.value = grain ? 0.045 : 0.0;
      this.grade.uniforms.uAberration.value = grain ? 0.0016 : 0.0;
      this.grade.uniforms.uWet.value = wet;
      fx.push(this.grade);
    }
    try { this.renderer.setEffects(fx); } catch (e) { console.warn('post chain disabled:', e.message); this.renderer.setEffects([]); }
  }
  setSize(w, h) {
    this._size.set(w, h);
    this.grade.setSize(w, h);
    this.bloom?.setSize(w, h);
    this.gtao?.setSize(w, h);
  }
  setWet(v) { this.grade.uniforms.uWet.value = v; }
  /** Brief screen punch on a hard impact. */
  setDamage(v) { this.grade.uniforms.uDamage.value = v; }
}
