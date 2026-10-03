import * as THREE from 'three';
import { TEX } from './textures.js';

// The sky dome: a blue gradient with the sun's aureole and a cloud layer that is either an even grey deck with a few
// thinner patches (overcast, like the user's late-September photos) or separate cumulus heaps lit from the sun's side
// (the sunny Street View captures). The weather presets are in lighting.js.
const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // just inside the far plane: exactly w/w gets clipped by rounding with a long view distance
  gl_Position = vec4(p.xy, p.w * 0.99995, p.w);
}`;

const frag = /* glsl */`
uniform sampler2D uNoise;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform float uTime;
uniform float uCover;
uniform float uCumulus;
uniform float uBright;
uniform float uDisk;
uniform float uEnvPass;
uniform float uEnvDesat;
uniform vec3 uGround;
varying vec3 vDir;

float fbm3(vec2 q, float t) {
  return texture2D(uNoise, q).r * 0.55 + texture2D(uNoise, q * 2.3 + 0.3).g * 0.3 + texture2D(uNoise, q * 5.1 - t).b * 0.15;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float mu = max(dot(d, uSunDir), 0.0);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), mix(0.55, 0.42, uCumulus)));
  // the bright aureole around the sun (forward scattering), the disk itself only in the visible sky
  sky += uSunColor * (mix(0.8 * pow(mu, 32.0), 0.22 * pow(mu, 5.0) + 0.6 * pow(mu, 90.0), uCumulus));
  sky += uSunColor * smoothstep(0.999955, 0.99999, mu) * 60.0 * uDisk * uCumulus;

  // clouds on a virtual plane: an even grey deck (overcast) or separate cumulus heaps lit from the sun's side
  float t = uTime * 0.0035;
  vec2 uv = d.xz / (max(y, 0.0) + 0.12);
  vec2 q = uv * mix(0.09, 0.055, uCumulus) + vec2(t, t * 0.4);
  // cumulus get ragged, crisp edges from a fine octave
  float c = fbm3(q, t) + (texture2D(uNoise, q * 9.7 + 0.71).g - 0.5) * 0.14 * uCumulus;
  float big = texture2D(uNoise, uv * 0.018 + vec2(t * 0.3, 0.0)).b;
  float cov = uCover + (big - 0.5) * 0.5;
  float soft = mix(0.4, 0.09, uCumulus);
  float dens = smoothstep(1.0 - cov - soft * 0.45, 1.0 - cov + soft * 0.55, c);
  float thick = smoothstep(0.35, 0.95, c * dens);
  // cumulus: a step towards the sun through the density field tells the lit side from the shaded one
  vec2 ts = normalize(uSunDir.xz + vec2(1e-4)) * 0.03;
  float c2 = fbm3(q + ts, t);
  float lit = mix(1.0 - thick * 0.85, clamp(0.62 + (c - c2) * 5.0 - thick * 0.45, 0.0, 1.0), uCumulus);
  vec3 cloud = mix(uCloudDark, uCloudLit, lit);
  cloud += uSunColor * pow(mu, 8.0) * (1.0 - thick) * 0.6;
  float fade = smoothstep(-0.02, 0.2, y);
  vec3 col = mix(sky, cloud, dens * fade);
  col = mix(col, uHorizon * 1.02, (1.0 - smoothstep(0.0, 0.16, y)) * 0.65);
  // for the image-based light: in sun the shade is also lit by the sunlit ground, walls and leaves around it, which
  // the bare sky lacks, so its blue is partly neutralised there
  col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), uEnvDesat * uEnvPass);
  // below horizon: the ground bounce (used by reflections / env map)
  col = mix(uGround, col, smoothstep(-0.06, 0.005, y));
  gl_FragColor = vec4(col * uBright, 1.0);
}`;

export function createSky() {
  const v3 = () => ({ value: new THREE.Vector3() });
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: {
      uNoise: { value: TEX.noise },
      uSunDir: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
      uSunColor: v3(), uZenith: v3(), uHorizon: v3(), uCloudLit: v3(), uCloudDark: v3(),
      uTime: { value: 0 },
      uCover: { value: 0.72 },
      uCumulus: { value: 0 },
      uBright: { value: 1.12 },
      uDisk: { value: 1 },
      uEnvPass: { value: 0 },
      uEnvDesat: { value: 0 },
      uGround: { value: new THREE.Vector3(0.33, 0.33, 0.31) },
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

// Sky uniforms of a weather preset (see lighting.js WEATHER).
export function setSkyWeather(sky, w) {
  const u = sky.material.uniforms;
  u.uSunColor.value.fromArray(w.sunColor); u.uZenith.value.fromArray(w.zenith); u.uHorizon.value.fromArray(w.horizon);
  u.uCloudLit.value.fromArray(w.cloudLit); u.uCloudDark.value.fromArray(w.cloudDark);
  u.uCover.value = w.cover; u.uCumulus.value = w.cumulus; u.uBright.value = w.bright;
  u.uEnvDesat.value = w.envDesat ?? 0; u.uGround.value.fromArray(w.envGround ?? [0.33, 0.33, 0.31]);
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
  s.position.set(0, 0, 0);                             // (the dome follows the camera: rebuilt later, it is far away)
  s.scale.setScalar(100);
  envScene.add(s);
  const u = sky.material.uniforms, disk = u.uDisk.value;
  u.uDisk.value = 0;                                   // the sun's specular comes from the light, not from the env map
  u.uEnvPass.value = 1;
  const rt = pmrem.fromScene(envScene, 0, 0.1, 500);
  u.uDisk.value = disk; u.uEnvPass.value = 0;
  pmrem.dispose();
  return rt.texture;
}
