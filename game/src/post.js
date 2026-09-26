import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

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

export function createComposer(renderer, scene, camera, q) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null, bloom = null, smaa = null;
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
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.18, 0.6, 0.92);
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
  return { composer, grade, gtao, bloom, smaa, setSize };
}
