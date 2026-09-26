import * as THREE from 'three';
import { TEX } from './textures.js';

// Overcast, late-September sky like in the photos: bright gray-white cloud deck
// with a few thinner patches where blue shows through.
const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const frag = /* glsl */`
uniform sampler2D uNoise;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uCover;
uniform float uBright;
varying vec3 vDir;

float n2(vec2 p) { return texture2D(uNoise, p).r; }

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 zenith = vec3(0.32, 0.42, 0.58);
  vec3 horizon = vec3(0.60, 0.64, 0.69);
  vec3 sky = mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.55));

  // clouds on a virtual plane
  float t = uTime * 0.0035;
  vec2 uv = d.xz / (max(y, 0.0) + 0.12);
  vec2 q = uv * 0.09 + vec2(t, t * 0.4);
  float c = texture2D(uNoise, q).r * 0.55 + texture2D(uNoise, q * 2.3 + 0.3).g * 0.3 + texture2D(uNoise, q * 5.1 - t).b * 0.15;
  float big = texture2D(uNoise, uv * 0.018 + vec2(t * 0.3, 0.0)).b;
  float cov = uCover + (big - 0.5) * 0.5;
  float dens = smoothstep(1.0 - cov - 0.18, 1.0 - cov + 0.22, c);
  float thick = smoothstep(0.35, 0.95, c * dens);
  vec3 cloudLit = vec3(0.86, 0.87, 0.89);
  vec3 cloudDark = vec3(0.50, 0.53, 0.58);
  vec3 cloud = mix(cloudLit, cloudDark, thick * 0.85);
  // sun behind thin clouds
  float sd = max(dot(d, uSunDir), 0.0);
  cloud += vec3(1.0, 0.97, 0.9) * pow(sd, 8.0) * (1.0 - thick) * 0.6;
  sky += vec3(1.0, 0.95, 0.85) * pow(sd, 32.0) * 0.8;
  float fade = smoothstep(-0.02, 0.2, y);
  vec3 col = mix(sky, cloud, dens * fade);
  col = mix(col, horizon * 1.02, (1.0 - smoothstep(0.0, 0.16, y)) * 0.65);
  // below horizon: dim ground bounce (used by reflections / env map)
  vec3 ground = vec3(0.33, 0.33, 0.31);
  col = mix(ground, col, smoothstep(-0.06, 0.005, y));
  gl_FragColor = vec4(col * uBright, 1.0);
}`;

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: {
      uNoise: { value: TEX.noise },
      uSunDir: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
      uTime: { value: 0 },
      uCover: { value: 0.72 },
      uBright: { value: 1.12 },
    },
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.scale.setScalar(2000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.noAO = true;
  return mesh;
}

export function createLights(scene, sunDir) {
  const hemi = new THREE.HemisphereLight(0xdfe6ee, 0x4f4a42, 0.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.7);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  const s = sun.shadow.camera;
  s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 1; s.far = 220;
  scene.add(sun, sun.target);
  return { hemi, sun };
}

// Pre-filtered environment from the sky (IBL for all PBR materials).
export function buildEnvironment(renderer, sky) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const s = sky.clone();
  s.scale.setScalar(100);
  envScene.add(s);
  const rt = pmrem.fromScene(envScene, 0, 0.1, 500);
  pmrem.dispose();
  return rt.texture;
}
