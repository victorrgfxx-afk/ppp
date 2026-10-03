import * as THREE from 'three';

// Night: the full moon's light that falls only on the hill of the cross (a shaft through the clouds), the
// flashlight, and the storm's lightning.

const BEAM_VERT = /* glsl */`
varying vec3 vN, vW;
varying float vT;
void main() {
  vT = uv.y;                                         // 0 at the hill, 1 towards the moon
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const BEAM_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uStrength, uTime, uFog;
uniform sampler2D uNoise;
varying vec3 vN, vW;
varying float vT;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float core = pow(abs(dot(normalize(vN), v)), 2.0);              // brightest across the middle of the shaft
  float along = smoothstep(0.0, 0.08, vT) * (1.0 - smoothstep(0.55, 1.0, vT));
  float streaks = 0.65 + 0.35 * texture2D(uNoise, vec2(atan(vN.z, vN.x) * 1.3, vT * 6.0 - uTime * 0.9)).r;   // rain and mist moving in it
  float a = core * along * streaks * uStrength * exp(-uFog * length(cameraPosition - vW));
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

export class MoonBeam {
  // target: the cross (x, y, z); r: radius of the lit area on the hill (m)
  constructor(scene, target, noise, r = 110) {
    this.target = new THREE.Vector3(target.x, target.y, target.z);
    this.r = r; this.dist = 650; this.frame = 0; this.on = false;
    const l = this.light = new THREE.SpotLight(0xb4cdff, 0, 0, Math.atan(r / this.dist), 0.6, 0);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.bias = -0.0006; l.shadow.normalBias = 0.06;
    l.shadow.camera.near = this.dist - 260; l.shadow.camera.far = this.dist + 260;
    l.shadow.autoUpdate = false; l.shadow.needsUpdate = true;      // (a map from the first frame, see lighting.js)
    l.target.position.copy(this.target);
    scene.add(l, l.target);
    // the visible shaft: an open tube from the hill up towards the moon, drawn additively
    const g = new THREE.CylinderGeometry(r * 0.55, r * 0.8, 520, 40, 1, true);
    g.translate(0, 260, 0);
    this.mat = new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uColor: { value: new THREE.Color(0.55, 0.65, 0.85) }, uStrength: { value: 0 }, uTime: { value: 0 }, uFog: { value: 0 }, uNoise: { value: noise } } });
    this.shaft = new THREE.Mesh(g, this.mat);
    this.shaft.position.copy(this.target).y -= 4;
    this.shaft.frustumCulled = false;
    this.shaft.userData.noAO = true; this.shaft.userData.ueSkip = 'night';
    this.shaft.renderOrder = 6;
    this.shaft.visible = false;
    scene.add(this.shaft);
  }

  // on: night with the moon up; strength: light on the hill; haze: how much of the shaft the air shows (rain: a lot)
  set(on, moonDir, strength, haze, fogDensity) {
    const l = this.light;
    l.intensity = on ? strength : 0;
    this.on = on; if (on) l.shadow.needsUpdate = true;          // (never cancel the first render: see the constructor)
    l.position.copy(this.target).addScaledVector(moonDir, this.dist);
    this.shaft.visible = on && haze > 0;
    this.shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), moonDir);
    this.mat.uniforms.uStrength.value = this.strength = haze * 0.09;
    this.mat.uniforms.uFog.value = fogDensity * 0.6;
  }
  // the hill's shadows hardly change (only the bear moves): re-rendered every 6th frame
  // camera: inside the shaft its walls would veil the whole view, so it fades there (the lit rain shows it instead)
  update(t, camera) {
    const u = this.mat.uniforms;
    u.uTime.value = t;
    if (this.on && (++this.frame % 6) === 0) this.light.shadow.needsUpdate = true;
    if (camera) {
      const d = camera.position.clone().sub(this.target), axis = this.shaft.up.clone().applyQuaternion(this.shaft.quaternion);
      const off = d.sub(axis.multiplyScalar(d.dot(axis))).length();
      u.uStrength.value = this.strength * (0.12 + 0.88 * THREE.MathUtils.smoothstep(off, this.r * 0.6, this.r * 1.6));
    }
  }
  // for the rain: the shaft as { on, pos, dir, r }
  get info() { return { on: this.light.intensity > 0, pos: this.target, dir: this.shaft.up.clone().applyQuaternion(this.shaft.quaternion), r: this.r }; }
}

// A hand torch: a spot light just right of and below the eyes, pointing where you look, with soft shadows.
export class Flashlight {
  constructor(scene) {
    const l = this.light = new THREE.SpotLight(0xfff0d8, 0, 55, 0.4, 0.55, 2);
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.0008; l.shadow.normalBias = 0.03;
    l.shadow.camera.near = 0.3; l.shadow.camera.far = 55;
    l.shadow.autoUpdate = false; l.shadow.needsUpdate = true;
    scene.add(l, l.target);
    this.on = false;
  }
  set(on) { this.on = on; this.light.intensity = on ? 12 : 0; this.light.shadow.autoUpdate = on; }
  get info() { const l = this.light; return { on: this.on, pos: l.position, dir: l.target.position.clone().sub(l.position).normalize() }; }
  update(camera) {
    if (!this.on) return;
    camera.updateMatrixWorld();
    this.light.position.set(0.22, -0.2, 0.05).applyMatrix4(camera.matrixWorld);
    this.light.target.position.set(0, 0, -12).applyMatrix4(camera.matrixWorld);
    this.light.target.updateMatrixWorld();
  }
}

// Lightning in a night storm: a strike every 6-22 s, 2-4 flickers, thunder after the sound has travelled.
export class Lightning {
  constructor(onThunder) { this.next = 4; this.t = 0; this.seq = []; this.onThunder = onThunder; this.level = 0; }
  update(dt, active) {
    this.level = 0;
    if (!active) { this.seq.length = 0; return 0; }
    this.t += dt;
    this.next -= dt;
    if (this.next <= 0) {
      this.next = 6 + Math.random() * 16;
      const n = 2 + Math.floor(Math.random() * 3), dist = 0.4 + Math.random() * 3.5;   // km
      let at = this.t;
      for (let i = 0; i < n; i++) { this.seq.push([at, 0.05 + Math.random() * 0.07, i === 0 ? 1 : 0.4 + Math.random() * 0.6]); at += 0.07 + Math.random() * 0.16; }
      this.onThunder?.(dist / 0.343, dist);                       // seconds until it is heard
    }
    for (const [at, len, k] of this.seq) if (this.t >= at && this.t < at + len) this.level = Math.max(this.level, k);
    this.seq = this.seq.filter(([at, len]) => this.t < at + len + 0.01);
    return this.level;
  }
}
