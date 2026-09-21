/**
 * Cupola de cer: gradient zenit->orizont cu halou de poluare luminoasa
 * (asa arata cerul deasupra unui sat langa oras) si stele care se sting
 * la rasarit. Inlocuieste fundalul echirectangular: fara distorsiuni la poli
 * si cu tranzitie reala intre noapte si zi.
 */
import * as THREE from '../vendor/three.module.min.js';

const VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  // se ignora translatia: cupola ramane mereu centrata pe camera
  vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;            // mereu la adancime maxima
}`;

const FS = `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform float uStars;
uniform float uGlowAmt;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  float h = clamp(vDir.y, -1.0, 1.0);
  float t = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 0.85);
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.42, 0.95, t));
  // halou de poluare luminoasa deasupra orizontului
  col += uGlow * uGlowAmt * pow(clamp(1.0 - abs(h) * 4.6, 0.0, 1.0), 2.8);

  if (uStars > 0.001 && h > -0.02) {
    vec3 g = floor(vDir * 560.0);
    float r = hash(g);
    if (r > 0.99885) {
      float b = (r - 0.99885) / 0.00115;
      float tw = 0.65 + 0.35 * hash(g + 3.1);
      col += vec3(0.72, 0.80, 1.0) * b * b * 0.85 * tw * uStars
           * smoothstep(-0.02, 0.22, h);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class SkyDome {
  constructor(scene) {
    const g = new THREE.SphereGeometry(1, 32, 20);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: {
        uZenith: { value: new THREE.Color(0x01020a) },
        uHorizon: { value: new THREE.Color(0x0a0c16) },
        uGlow: { value: new THREE.Color(0x2a2233) },
        uStars: { value: 1 },
        uGlowAmt: { value: 1 },
      },
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    this.night = { zen: new THREE.Color(0x01020a), hor: new THREE.Color(0x0b0d18), glow: new THREE.Color(0x191428) };
    this.dawn  = { zen: new THREE.Color(0x1a2f5c), hor: new THREE.Color(0x8a6a58), glow: new THREE.Color(0x7a5a46) };
    this.day   = { zen: new THREE.Color(0x3d6fb5), hor: new THREE.Color(0xa8bed4), glow: new THREE.Color(0x203040) };
  }

  /** day: 0 = noapte, 1 = zi in toi. */
  setDay(day) {
    const u = this.mat.uniforms;
    const a = day < 0.5 ? this.night : this.dawn;
    const b = day < 0.5 ? this.dawn : this.day;
    const k = day < 0.5 ? day * 2 : (day - 0.5) * 2;
    u.uZenith.value.copy(a.zen).lerp(b.zen, k);
    u.uHorizon.value.copy(a.hor).lerp(b.hor, k);
    u.uGlow.value.copy(a.glow).lerp(b.glow, k);
    u.uStars.value = Math.max(0, 1 - day * 3.2);
    u.uGlowAmt.value = 1 - day * 0.75;
  }
}
