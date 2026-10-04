import * as THREE from 'three';
import { Actor, CAST } from './cast.js';

// The forest scene from the user's two clips (night, a wood floor deep in dry leaves, a pale starved creature, two men
// wrestling it): played as a cinematic in the wood next to the cross on the hill above Strada Măgurii.
// Shot 1 (clip 2): the creature lunges out of the dark into the torchlight, screams with its arms up; the man in the
// black tank top grabs it from behind, the man in the cream T-shirt takes its arm; they force it down onto the leaves
// and pin it. Shot 2 (clip 1): lower and closer, leaves exploding: they haul it up by the legs and it hangs head down,
// flailing; they throw it, it scrambles off on all fours into the dark, the torch beam on it, the men after it.
// The stage's frame: origin on the ground at the action, +z towards the first camera, +x to its right.

// ------------------------------------------------------------------ small helpers
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D = Math.PI / 180;
const ease = (u) => u * u * (3 - 2 * u);
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function noise1(x, seed) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i + seed * 57) * (1 - u) + hash(i + 1 + seed * 57) * u) * 2 - 1; }
// Catmull-Rom through the keys' values (arrays), at time t
function track(keys, field, t, out) {
  const ks = keys.filter(k => k[field] !== undefined && k[field] !== null).map(k => Array.isArray(k[field]) ? k : { ...k, [field]: [k[field]] });
  if (!ks.length) return null;
  if (t <= ks[0].t) return ks[0][field].slice();
  if (t >= ks[ks.length - 1].t) return ks[ks.length - 1][field].slice();
  let i = 0; while (i < ks.length - 2 && ks[i + 1].t <= t) i++;
  const k1 = ks[i], k2 = ks[i + 1], k0 = ks[Math.max(0, i - 1)], k3 = ks[Math.min(ks.length - 1, i + 2)];
  const u = (t - k1.t) / (k2.t - k1.t), u2 = u * u, u3 = u2 * u;
  const r = out ?? new Array(k1[field].length);
  for (let j = 0; j < k1[field].length; j++) {
    const p0 = k0[field][j], p1 = k1[field][j], p2 = k2[field][j], p3 = k3[field][j];
    r[j] = 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }
  return r;
}
// the two keys around t: [k1, k2, eased u]
function bracket(keys, t) {
  if (t <= keys[0].t) return [keys[0], keys[0], 0];
  for (let i = 0; i < keys.length - 1; i++) if (t < keys[i + 1].t) return [keys[i], keys[i + 1], ease((t - keys[i].t) / (keys[i + 1].t - keys[i].t))];
  const k = keys[keys.length - 1]; return [k, k, 0];
}

// ------------------------------------------------------------------ the leaves: the floor and the ones kicked up
function leafAtlas() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const shapes = [
    (g) => { g.ellipse(0, 0, 54, 30, 0, 0, Math.PI * 2); },                                                  // beech
    (g) => { for (let k = 0; k < 6; k++) g.ellipse(-44 + k * 17, (k % 2 ? 1 : -1) * 8, 14, 20, 0, 0, Math.PI * 2); g.ellipse(0, 0, 50, 16, 0, 0, Math.PI * 2); },   // oak
    (g) => { g.moveTo(-56, 0); g.quadraticCurveTo(-10, -40, 56, 0); g.quadraticCurveTo(-10, 40, -56, 0); },     // hornbeam
    (g) => { for (let k = 0; k < 5; k++) { const a = -1.2 + k * 0.6; g.moveTo(-30, 0); g.ellipse(-30 + Math.cos(a) * 34, Math.sin(a) * 34, 28, 12, a, 0, Math.PI * 2); } },   // maple
  ];
  const cols = ['#9a6c42', '#a8784a', '#86603c', '#b48650', '#7a5434', '#c08c52', '#9a7044', '#c49458'];
  for (let i = 0; i < 4; i++) {
    const cx = (i % 2) * 128 + 64, cy = Math.floor(i / 2) * 128 + 64;
    g.save(); g.translate(cx, cy);
    g.fillStyle = cols[i * 2]; g.beginPath(); shapes[i](g); g.fill();
    // veins and a darker, curled rim
    g.strokeStyle = 'rgba(40,24,12,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-54, 0); g.lineTo(54, 0); g.stroke();
    g.lineWidth = 1; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(k * 13, 0); g.lineTo(k * 13 + 14, k % 2 ? 18 : -18); g.stroke(); }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
class Leaves {
  constructor(stage, ground, R = 6.5, n = 22000, nFly = 520) {
    this.ground = ground;
    const tex = leafAtlas();
    // one leaf: a slightly cupped quad (two triangles folded along the vein), 9 cm, atlas cell chosen per instance
    const g = new THREE.BufferGeometry();
    const P = [-0.045, 0, 0, 0, 0.006, -0.026, 0, 0.006, 0.026, 0.045, 0, 0, 0, 0.006, -0.026, 0, 0.006, 0.026];
    const U = [0, 0.5, 0.5, 0, 0.5, 1, 1, 0.5, 0.5, 0, 0.5, 1];
    g.setAttribute('position', new THREE.Float32BufferAttribute([P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], P[8], P[9], P[10], P[11], P[12], P[13], P[14], P[15], P[16], P[17]], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U.map(v => v), 2));
    g.setIndex([0, 1, 2, 3, 5, 4]);
    g.computeVertexNormals();
    const cell = new Float32Array(n * 2), cellF = new Float32Array(nFly * 2);
    const mat = (cells) => {
      const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
      m.userData.noWet = true;
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = uv * 0.5 + aCell * 0.5;');
      };
      m.customProgramCacheKey = () => 'cine-leaf';
      return m;
    };
    // the floor: leaves strewn over the clearing, densest in the middle
    const floor = this.floor = new THREE.InstancedMesh(g.clone(), mat(cell), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    let s = 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < n; i++) {
      const r = R * Math.sqrt(rnd()), a = rnd() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      e.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
      m4.compose(V(x, ground(x, z) + 0.004 + rnd() * 0.025, z), q.setFromEuler(e), V(1, 1, 1).multiplyScalar(1.0 + rnd() * 0.65));
      floor.setMatrixAt(i, m4);
      const b = 0.35 + rnd() * 0.55; floor.setColorAt(i, c.setRGB(b * (0.95 + rnd() * 0.1), b * (0.8 + rnd() * 0.14), b * (0.62 + rnd() * 0.18)));
      cell[i * 2] = Math.floor(rnd() * 2); cell[i * 2 + 1] = Math.floor(rnd() * 2);
    }
    floor.geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
    floor.receiveShadow = true; floor.castShadow = false; floor.userData.noAO = true;
    floor.computeBoundingSphere();
    stage.add(floor);
    // the ones in the air
    const fly = this.fly = new THREE.InstancedMesh(g.clone(), mat(cellF), nFly);
    fly.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < nFly; i++) { cellF[i * 2] = Math.floor(rnd() * 2); cellF[i * 2 + 1] = Math.floor(rnd() * 2); const b = 0.55 + rnd() * 0.45; fly.setColorAt(i, c.setRGB(b * (0.95 + rnd() * 0.1), b * (0.85 + rnd() * 0.12), b * (0.7 + rnd() * 0.15))); }
    fly.geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellF, 2));
    fly.castShadow = true; fly.frustumCulled = false; fly.userData.noAO = true;
    fly.count = 0; fly.visible = false;
    stage.add(fly);
    this.p = Array.from({ length: nFly }, () => ({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, s: 1 }));
    this.next = 0; this.rnd = rnd;
  }
  // kick n leaves up around (x, z) within radius r, at speed up (m/s); dir: a push sideways
  burst(x, z, n, r = 0.5, up = 2.5, dir = null) {
    const rnd = this.rnd;
    for (let k = 0; k < n; k++) {
      const p = this.p[this.next]; this.next = (this.next + 1) % this.p.length;
      const a = rnd() * Math.PI * 2, d = r * Math.sqrt(rnd());
      p.live = true; p.x = x + Math.cos(a) * d; p.z = z + Math.sin(a) * d; p.y = this.ground(p.x, p.z) + 0.02;
      const out = 0.6 + rnd() * 1.4;
      p.vx = Math.cos(a) * out + (dir ? dir[0] : 0) * (0.5 + rnd()); p.vz = Math.sin(a) * out + (dir ? dir[1] : 0) * (0.5 + rnd());
      p.vy = up * (0.4 + rnd() * 0.9);
      p.rx = rnd() * 6; p.ry = rnd() * 6; p.rz = rnd() * 6; p.wx = (rnd() - 0.5) * 18; p.wy = (rnd() - 0.5) * 10; p.wz = (rnd() - 0.5) * 18; p.s = 0.75 + rnd() * 0.6;
    }
  }
  update(dt) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = V(1, 1, 1), pv = V(0, 0, 0);
    let n = 0;
    for (const p of this.p) {
      if (!p.live) continue;
      // falling leaves: gravity against a strong drag, a flutter that swings them sideways
      p.vy -= 9.8 * dt;
      const k = Math.exp(-2.6 * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy > 0 ? p.vy * Math.exp(-1.2 * dt) : Math.max(p.vy, -0.9);
      p.x += (p.vx + Math.sin(p.rx * 2.3) * 0.35) * dt; p.y += p.vy * dt; p.z += (p.vz + Math.cos(p.rz * 2.1) * 0.35) * dt;
      p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
      const g = this.ground(p.x, p.z) + 0.01;
      if (p.y < g && p.vy < 0) { p.y = g; p.vx = p.vz = p.vy = 0; p.wx *= 0.1; p.wz *= 0.1; p.settled = (p.settled ?? 0) + dt; if (p.settled > 2.5) { p.live = false; p.settled = 0; continue; } }
      else p.settled = 0;
      m4.compose(pv.set(p.x, p.y, p.z), q.setFromEuler(e.set(p.rx, p.ry, p.rz)), sv.setScalar(p.s));
      this.fly.setMatrixAt(n++, m4);
    }
    this.fly.count = n; this.fly.visible = n > 0;
    this.fly.instanceMatrix.needsUpdate = true;
  }
  clear() { for (const p of this.p) p.live = false; this.fly.count = 0; this.fly.visible = false; }
}

// ------------------------------------------------------------------ a torch beam seen in the dust
const BEAM_VS = /* glsl */`
varying vec3 vW, vN; varying float vT;
void main() { vT = 1.0 - uv.y; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const BEAM_FS = /* glsl */`
uniform float uI, uTime; uniform vec3 uColor;
varying vec3 vW, vN; varying float vT;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float core = pow(abs(dot(normalize(vN), v)), 2.6);
  float along = smoothstep(0.0, 0.03, vT) * pow(1.0 - vT, 2.4);
  float dust = 0.55 + 0.45 * n2(vec2(atan(vN.z, vN.x) * 3.0, vT * 14.0 - uTime * 0.6));
  gl_FragColor = vec4(uColor * core * along * dust * uI, 1.0);
}`;
class Beam {
  constructor(parent) {
    const g = new THREE.CylinderGeometry(0.03, 0.85, 7, 32, 1, true);
    g.translate(0, -3.5, 0); g.rotateX(-Math.PI / 2);                 // narrow end at the origin, opening along +z (aimed with lookAt)
    this.mat = new THREE.ShaderMaterial({ vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uI: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(1, 0.94, 0.82) } } });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.mesh.userData.noAO = true; this.mesh.visible = false;
    parent.add(this.mesh);
  }
  set(on, from, to, I, t) {
    this.mesh.visible = on && I > 0.001;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(from); this.mesh.lookAt(to);
    this.mat.uniforms.uI.value = I; this.mat.uniforms.uTime.value = t;
  }
}

// ------------------------------------------------------------------ the choreography
// Targets: ['w', x, y, z] a point on the stage; ['r', x, y, z] relative to the actor's own chest; ['a', actor, bone, ox, oy, oz]
// a point on another actor's bone; ['g', x, z] the ground (feet). Keys: p hips position, r [pitch, yaw, roll] degrees,
// sp spine bend [x, y, z] degrees (split over spine and chest), hd head [x, y, z] (split over neck and head),
// aL aR lL lR the hands' and feet's targets (no leg key: the feet plant and step by themselves), n struggle (0..1).
// Heights (hips, 'w' points, the cameras and the torch) are above the ground under them: the clearing is on a slope.
const T1 = 8.2, T2 = 17.4;                       // the cut, the end
const TRACKS = {
  creature: [
    // shot 1: out of the dark at a run, into the torchlight
    { t: 0.0, p: [1.6, 0.98, 0.95], r: [26, -62, 0], sp: [14, 0, 0], hd: [-12, -10, 0], aL: ['r', 0.45, -0.05, 0.45], aR: ['r', -0.25, -0.2, 0.45], lL: ['g', 1.95, 1.1], lR: ['w', 1.3, 0.38, 0.85], n: 0.4 },
    { t: 0.35, p: [1.0, 0.99, 0.75], r: [22, -55, 0], sp: [12, 0, 0], hd: [-14, -6, 0], aL: ['r', 0.5, 0.0, 0.4], aR: ['r', -0.35, -0.1, 0.45], lL: ['w', 1.05, 0.34, 0.85], lR: ['g', 0.82, 0.7], n: 0.45 },
    { t: 0.7, p: [0.45, 0.99, 0.5], r: [14, -30, 0], sp: [8, 0, 0], hd: [-14, 0, 0], aL: ['r', 0.55, 0.05, 0.3], aR: ['r', -0.5, 0.0, 0.35], lL: ['g', 0.32, 0.6], lR: ['g', 0.62, 0.38], n: 0.5 },
    { t: 1.4, p: [0.15, 1.01, 0.35], r: [4, -5, 0], sp: [2, 8, 0], hd: [-18, 6, 0], aL: ['r', 0.6, 0.15, 0.1], aR: ['r', -0.55, -0.05, 0.3], n: 0.7 },
    { t: 2.3, p: [0.1, 1.01, 0.32], r: [0, 0, 3], sp: [-4, -6, 0], hd: [-22, 0, 0], aL: ['r', 0.42, 0.62, 0.1], aR: ['r', -0.5, 0.45, 0.2], n: 0.8 },
    { t: 3.2, p: [0.08, 1.0, 0.3], r: [-4, 4, -2], sp: [-10, 4, 0], hd: [-34, -8, 0], aL: ['r', 0.3, 0.86, 0.12], aR: ['r', -0.32, 0.84, 0.16], n: 0.9 },
    { t: 4.0, p: [0.08, 0.96, 0.32], r: [8, 0, 0], sp: [6, 0, 0], hd: [-25, 0, 0], aL: ['r', 0.36, 0.6, 0.2], aR: ['r', -0.4, 0.5, 0.25], n: 0.9 },
    { t: 4.7, p: [0.05, 0.84, 0.35], r: [30, 0, 0], sp: [26, 0, 0], hd: [10, 0, 0], aL: ['r', 0.3, -0.35, 0.35], aR: ['r', -0.3, -0.4, 0.35], n: 0.8 },
    { t: 5.3, p: [0.02, 0.58, 0.42], r: [55, 6, 0], sp: [30, 0, 0], hd: [-20, 0, 0], aL: ['g', 0.25, 0.95], aR: ['g', -0.2, 1.0], lL: ['g', 0.18, -0.05], lR: ['g', -0.14, -0.08], n: 0.6 },
    { t: 6.0, p: [0.0, 0.24, 0.42], r: [-30, 60, -60], sp: [10, 0, 0], hd: [0, 30, 0], aL: ['r', 0.35, 0.2, 0.25], aR: ['r', -0.3, 0.25, 0.3], lL: ['g', 0.05, 1.35], lR: ['g', 0.45, 1.2], n: 0.7 },
    { t: 6.6, p: [0.0, 0.16, 0.38], r: [-88, 0, 0], sp: [0, 0, 0], hd: [10, 25, 0], aL: ['r', 0.42, 0.25, 0.3], aR: ['r', -0.4, 0.3, 0.35], lL: ['g', 0.16, 1.15], lR: ['g', -0.15, 1.25], n: 1.0 },
    { t: 7.4, p: [0.0, 0.16, 0.36], r: [-86, -6, 4], sp: [-6, 10, 0], hd: [15, -30, 0], aL: ['r', 0.5, 0.35, 0.2], aR: ['r', -0.45, 0.4, 0.3], lL: ['g', 0.3, 0.95], lR: ['g', -0.1, 1.3], n: 1.0 },
    { t: 8.2, p: [0.0, 0.16, 0.36], r: [-87, 0, 0], sp: [0, 0, 0], hd: [10, 20, 0], aL: ['r', 0.45, 0.3, 0.3], aR: ['r', -0.45, 0.35, 0.3], lL: ['g', 0.16, 1.2], lR: ['g', -0.15, 1.25], n: 1.0 },
    // shot 2 (re-staged across the cut: its head towards the camera, its feet towards the man in the tank top):
    // hauled up by the shins, hanging head down, flailing
    { t: 8.25, p: [0.0, 0.16, -0.15], r: [-88, 180, 0], sp: [0, 0, 0], hd: [10, 0, 0], aL: ['r', 0.45, 0.3, 0.3], aR: ['r', -0.45, 0.35, 0.3], lL: ['g', 0.12, -1.0], lR: ['g', -0.14, -0.96], n: 1.0 },
    { t: 8.9, p: [0.0, 0.48, -0.36], r: [-140, 180, 0], sp: [-6, 0, 0], hd: [20, 0, 0], aL: ['r', 0.4, 0.4, 0.25], aR: ['r', -0.4, 0.5, 0.15], lL: ['w', 0.1, 1.2, -0.92], lR: ['w', -0.12, 1.16, -0.9], n: 1.0 },
    { t: 9.6, p: [0.0, 0.94, -0.5], r: [-176, 180, 0], sp: [-6, 0, 0], hd: [-10, 0, 0], aL: ['r', 0.38, 0.52, 0.3], aR: ['r', -0.36, 0.6, 0.12], lL: ['w', 0.1, 1.82, -0.66], lR: ['w', -0.12, 1.78, -0.62], n: 1.0 },
    { t: 10.6, p: [0.05, 0.96, -0.48], r: [-174, 188, 6], sp: [-12, 12, 0], hd: [-20, 25, 0], aL: ['r', 0.5, 0.3, -0.1], aR: ['r', -0.3, 0.68, 0.25], lL: ['w', 0.1, 1.83, -0.66], lR: ['w', -0.1, 1.8, -0.6], n: 1.0 },
    { t: 11.5, p: [-0.05, 0.95, -0.5], r: [-178, 172, -6], sp: [-4, -14, 0], hd: [-25, -20, 0], aL: ['r', 0.3, 0.62, 0.3], aR: ['r', -0.5, 0.42, -0.1], lL: ['w', 0.08, 1.82, -0.66], lR: ['w', -0.12, 1.79, -0.61], n: 1.0 },
    // thrown: swung to stage left and dropped on the leaves
    { t: 12.1, p: [-0.55, 0.88, -0.3], r: [-140, 215, -30], sp: [0, 0, 0], hd: [0, 0, 0], aL: ['r', 0.5, 0.45, 0.2], aR: ['r', -0.5, 0.45, 0.1], lL: ['w', -0.25, 1.62, -0.75], lR: ['w', -0.45, 1.58, -0.7], n: 0.6 },
    { t: 12.55, p: [-1.15, 0.2, 0.05], r: [-82, 250, -55], sp: [10, 0, 0], hd: [10, 0, 0], aL: ['g', -1.45, 0.45], aR: ['g', -0.85, 0.5], lL: ['g', -1.55, -0.85], lR: ['g', -1.1, -0.9], n: 0.4 },
    // up on all fours, and away into the dark (the run is procedural from 13.2 s)
    { t: 13.2, p: [-1.3, 0.56, 0.0], r: [70, 215, 0], sp: [8, 0, 0], hd: [-50, 0, 0], aL: ['g', -1.55, -0.3], aR: ['g', -1.15, -0.42], lL: ['g', -1.2, 0.45], lR: ['g', -0.9, 0.3], n: 0.3 },
  ],
  tank: [
    { t: 0.0, p: [-0.45, 0.985, -0.85], r: [0, 12, 0], sp: [4, 0, 0], hd: [0, 0, 0], aL: ['r', 0.3, -0.35, 0.3], aR: ['r', -0.32, -0.3, 0.32], n: 0.2 },
    { t: 0.8, p: [-0.35, 0.97, -0.6], r: [-4, 18, 0], sp: [-6, 0, 0], hd: [-6, 10, 0], aL: ['r', 0.32, 0.05, 0.38], aR: ['r', -0.3, 0.08, 0.4], n: 0.2 },
    { t: 1.6, p: [-0.3, 0.95, -0.22], r: [6, 20, 0], sp: [12, 0, 0], hd: [6, 0, 0], aL: ['a', 'creature', 'chest', 0.06, 0.02, 0.1], aR: ['a', 'creature', 'upperArmL', 0, -0.04, 0.01], n: 0.5 },
    { t: 2.6, p: [-0.28, 0.94, -0.2], r: [4, 16, 0], sp: [8, 6, 0], hd: [0, 10, 0], aL: ['a', 'creature', 'chest', 0.05, 0.08, 0.1], aR: ['a', 'creature', 'upperArmL', 0, -0.06, 0.02], n: 0.8 },
    { t: 3.6, p: [-0.3, 0.92, -0.18], r: [8, 10, -4], sp: [12, -6, 0], hd: [4, -6, 0], aL: ['a', 'creature', 'chest', 0.04, 0.05, 0.1], aR: ['a', 'creature', 'upperArmL', 0, -0.08, 0.02], n: 0.9 },
    { t: 4.6, p: [-0.32, 0.82, -0.02], r: [26, 12, 0], sp: [24, 0, 0], hd: [10, 0, 0], aL: ['a', 'creature', 'chest', 0.02, 0.1, -0.08], aR: ['a', 'creature', 'upperArmL', 0, -0.05, 0.0], n: 0.9 },
    { t: 5.4, p: [-0.42, 0.66, 0.16], r: [40, 25, 0], sp: [30, 0, 0], hd: [12, 0, 0], aL: ['a', 'creature', 'chest', 0.0, 0.08, -0.1], aR: ['a', 'creature', 'upperArmL', 0, -0.08, 0.0], n: 0.8 },
    // kneeling at its left, pinning its shoulder and its head
    { t: 6.4, p: [-0.66, 0.5, 0.5], r: [16, 75, 0], sp: [22, 0, 0], hd: [18, 0, 0], aL: ['a', 'creature', 'head', 0.0, 0.12, 0.02], aR: ['a', 'creature', 'upperArmL', 0, -0.06, 0.0], lL: ['g', -0.95, 0.35], lR: ['g', -0.95, 0.65], n: 0.8 },
    { t: 8.2, p: [-0.66, 0.5, 0.52], r: [18, 78, 0], sp: [24, 0, 0], hd: [20, 0, 0], aL: ['a', 'creature', 'head', 0.0, 0.1, 0.02], aR: ['a', 'creature', 'upperArmL', 0, -0.04, 0.0], lL: ['g', -0.95, 0.37], lR: ['g', -0.95, 0.67], n: 0.9 },
    // shot 2: behind it, facing the camera: bent over its shins, then hauling it up and holding it high
    { t: 8.25, p: [-0.42, 0.7, -1.35], r: [42, 25, 0], sp: [30, 0, 0], hd: [12, 0, 0], aL: ['a', 'creature', 'shinR', 0, -0.32, 0], aR: ['a', 'creature', 'shinL', 0, -0.32, 0], lL: ['g', -0.2, -1.6], lR: ['g', -0.6, -1.5], n: 0.8 },
    { t: 9.6, p: [-0.42, 0.97, -1.1], r: [-6, 25, 0], sp: [-10, 0, 0], hd: [-12, 0, 0], aL: ['a', 'creature', 'shinR', 0, -0.33, 0], aR: ['a', 'creature', 'shinL', 0, -0.33, 0], n: 0.9 },
    { t: 11.5, p: [-0.4, 0.96, -1.1], r: [-6, 29, 4], sp: [-6, 8, 0], hd: [-10, 6, 0], aL: ['a', 'creature', 'shinR', 0, -0.33, 0], aR: ['a', 'creature', 'shinL', 0, -0.33, 0], n: 1.0 },
    // the throw: a swing to his right (stage left), then he lets go
    { t: 12.1, p: [-0.5, 0.92, -1.05], r: [10, -5, 0], sp: [14, -25, 0], hd: [6, -20, 0], aL: ['a', 'creature', 'shinR', 0, -0.3, 0], aR: ['a', 'creature', 'shinL', 0, -0.3, 0], n: 0.6 },
    { t: 12.5, p: [-0.55, 0.9, -1.0], r: [18, -15, 0], sp: [20, -15, 0], hd: [0, -10, 0], aL: ['r', -0.1, -0.1, 0.55], aR: ['r', -0.4, -0.05, 0.45], n: 0.4 },
    // and he goes a few steps after it, staring into the dark
    { t: 13.4, p: [-0.75, 0.97, -0.85], r: [4, -105, 0], sp: [6, 0, 0], hd: [0, 0, 0], aL: ['r', 0.3, -0.3, 0.3], aR: ['r', -0.3, -0.3, 0.3], n: 0.2 },
    { t: 15.6, p: [-1.7, 0.97, -1.3], r: [8, -112, 0], sp: [8, 0, 0], hd: [-4, 0, 0], aL: ['r', 0.3, -0.3, 0.35], aR: ['r', -0.3, -0.3, 0.35], n: 0.25 },
  ],
  tee: [
    { t: 0.0, p: [2.3, 0.965, 0.1], r: [0, -85, 0], sp: [6, 0, 0], hd: [0, 0, 0], aL: ['r', 0.3, -0.3, 0.3], aR: ['r', -0.3, -0.3, 0.3], n: 0.2 },
    { t: 1.6, p: [1.55, 0.95, 0.3], r: [8, -80, 0], sp: [10, 0, 0], hd: [0, 0, 0], aL: ['r', 0.3, 0.0, 0.45], aR: ['r', -0.3, 0.05, 0.45], n: 0.3 },
    { t: 2.4, p: [0.92, 0.93, 0.36], r: [10, -78, 0], sp: [12, 0, 0], hd: [0, 0, 0], aL: ['a', 'creature', 'foreArmR', 0, -0.12, 0], aR: ['a', 'creature', 'upperArmR', 0, -0.12, 0.02], n: 0.6 },
    { t: 3.4, p: [0.98, 0.92, 0.38], r: [8, -74, 0], sp: [10, -8, 0], hd: [4, 0, 0], aL: ['a', 'creature', 'foreArmR', 0, -0.1, 0], aR: ['a', 'creature', 'upperArmR', 0, -0.1, 0.02], n: 0.9 },
    { t: 4.6, p: [0.84, 0.82, 0.38], r: [18, -80, 0], sp: [18, 0, 0], hd: [10, 0, 0], aL: ['a', 'creature', 'chest', -0.06, 0.05, -0.09], aR: ['a', 'creature', 'upperArmR', 0, -0.1, 0.0], n: 0.9 },
    { t: 5.4, p: [0.7, 0.64, 0.42], r: [30, -90, 0], sp: [24, 0, 0], hd: [12, 0, 0], aL: ['a', 'creature', 'chest', -0.06, 0.05, -0.09], aR: ['a', 'creature', 'upperArmR', 0, -0.1, 0.0], n: 0.8 },
    // kneeling at its right, pinning its arm and its chest
    { t: 6.4, p: [0.64, 0.5, 0.5], r: [16, -95, 0], sp: [22, 0, 0], hd: [18, 0, 0], aL: ['a', 'creature', 'chest', -0.05, 0.02, 0.1], aR: ['a', 'creature', 'upperArmR', 0, -0.12, 0.0], lL: ['g', 0.95, 0.68], lR: ['g', 0.95, 0.38], n: 0.8 },
    { t: 8.2, p: [0.64, 0.5, 0.5], r: [18, -92, 0], sp: [24, 0, 0], hd: [20, 0, 0], aL: ['a', 'creature', 'chest', -0.05, 0.04, 0.1], aR: ['a', 'creature', 'upperArmR', 0, -0.12, 0.0], lL: ['g', 0.95, 0.68], lR: ['g', 0.95, 0.38], n: 0.9 },
    // shot 2: at its right side (stage right), holding its arm and its body as it comes up
    { t: 8.25, p: [0.66, 0.66, -0.3], r: [34, -90, 0], sp: [28, 0, 0], hd: [14, 0, 0], aL: ['a', 'creature', 'upperArmR', 0, -0.1, 0], aR: ['a', 'creature', 'chest', -0.05, 0, 0.08], n: 0.8 },
    { t: 9.6, p: [0.66, 0.92, -0.45], r: [12, -95, 0], sp: [10, 0, 0], hd: [6, 0, 0], aL: ['a', 'creature', 'foreArmR', 0, -0.08, 0], aR: ['a', 'creature', 'chest', -0.05, 0.05, 0.08], n: 0.9 },
    { t: 11.5, p: [0.66, 0.92, -0.45], r: [12, -92, 0], sp: [12, 8, 0], hd: [8, 0, 0], aL: ['a', 'creature', 'foreArmR', 0, -0.08, 0], aR: ['a', 'creature', 'chest', -0.05, 0.08, 0.08], n: 1.0 },
    { t: 12.2, p: [0.55, 0.93, -0.35], r: [10, -110, 0], sp: [10, 0, 0], hd: [0, 0, 0], aL: ['r', 0.2, 0.0, 0.5], aR: ['r', -0.3, -0.1, 0.45], n: 0.4 },
    { t: 13.3, p: [0.5, 0.95, -0.45], r: [6, -130, 0], sp: [10, 0, 0], hd: [0, 0, 0], aL: ['r', 0.3, -0.2, 0.3], aR: ['r', -0.3, -0.2, 0.3], n: 0.2 },
  ],
};
// cameras: p position, l look at, fov, s shake, roll
const CAM = [
  { t: 0.0, p: [0.3, 1.5, 2.95], l: [0.75, 1.15, 0.45], fov: 52, s: 1.2, roll: 0 },
  { t: 1.4, p: [0.25, 1.52, 2.7], l: [0.1, 1.35, 0.15], fov: 50, s: 1.4, roll: -2 },
  { t: 3.2, p: [0.2, 1.48, 2.55], l: [0.12, 1.45, 0.05], fov: 50, s: 1.5, roll: 1 },
  { t: 4.6, p: [0.2, 1.45, 2.4], l: [0.1, 0.95, 0.25], fov: 52, s: 1.6, roll: -1 },
  { t: 6.4, p: [0.15, 1.55, 2.2], l: [0.0, 0.42, 0.45], fov: 54, s: 1.6, roll: 2 },
  { t: 8.2, p: [0.15, 1.52, 2.1], l: [0.0, 0.38, 0.45], fov: 54, s: 1.7, roll: 0 },
  { t: 8.25, p: [0.4, 0.88, 1.75], l: [0.0, 0.55, -0.6], fov: 62, s: 2.2, roll: -5 },
  { t: 9.8, p: [0.4, 0.96, 1.85], l: [0.0, 1.0, -0.65], fov: 60, s: 2.4, roll: -3 },
  { t: 11.6, p: [0.35, 0.98, 1.9], l: [0.0, 1.0, -0.65], fov: 60, s: 2.6, roll: 3 },
  { t: 12.6, p: [0.3, 1.0, 1.95], l: [-1.0, 0.45, -0.1], fov: 62, s: 2.4, roll: -2 },
  { t: 14.4, p: [0.2, 1.1, 1.95], l: [-3.4, 0.5, -1.0], fov: 58, s: 1.8, roll: 0 },
  { t: 16.2, p: [0.1, 1.15, 1.9], l: [-6.2, 0.6, -3.2], fov: 52, s: 1.4, roll: 0 },
];
// the torches: the one on the phone that films (I), and in shot 2 a friend's off to the left (side), its beam in the dust
const TORCH = [
  { t: 0.0, I: 12, side: 0 }, { t: 8.2, I: 12, side: 0 },
  { t: 8.25, I: 5, side: 20, p: [-2.2, 1.15, 0.7] }, { t: 17.4, I: 5, side: 20, p: [-1.4, 1.2, 0.9] },
];
const EVENTS = [
  { t: 0.05, leaves: [1.6, 0.95, 26, 0.5, 2.0, [-1, -0.4]] }, { t: 0.15, sound: 'shriek' },
  { t: 0.4, leaves: [0.85, 0.7, 14, 0.35, 1.5] }, { t: 0.75, leaves: [0.4, 0.5, 14, 0.35, 1.4] },
  { t: 2.75, sound: 'shriek' },
  { t: 4.8, leaves: [0.05, 0.6, 20, 0.6, 1.6] }, { t: 5.3, sound: 'thud' }, { t: 5.3, leaves: [0.0, 0.8, 34, 0.7, 2.2] },
  { t: 6.05, sound: 'thud' }, { t: 6.05, leaves: [0.0, 0.45, 40, 0.9, 2.4] }, { t: 6.8, sound: 'growl' },
  { t: 7.6, leaves: [0.2, 0.9, 16, 0.5, 1.8] },
  { t: 8.25, leaves: [0.0, -0.45, 130, 1.2, 3.6] }, { t: 8.4, leaves: [0.1, -0.9, 60, 0.8, 3.0] }, { t: 8.35, sound: 'shriek' },
  { t: 9.2, leaves: [0.1, -0.6, 30, 0.6, 2.0] },
  { t: 10.4, sound: 'shriek' }, { t: 11.0, leaves: [0.0, -0.45, 18, 0.5, 1.6] },
  { t: 12.5, sound: 'thud' }, { t: 12.5, leaves: [-1.15, 0.05, 90, 1.0, 3.2] },
  { t: 13.1, sound: 'shriek' }, { t: 13.3, leaves: [-1.3, 0.0, 30, 0.6, 2.4] },
];
// the escape: the creature on all fours along its path, the man in the T-shirt after it (stage points, from 13.2 s)
const ESCAPE = { t0: 13.2, path: [[-1.3, 0.0], [-2.4, -0.3], [-3.8, -0.9], [-5.4, -1.8], [-6.9, -3.9], [-8.6, -5.6], [-10.2, -7.2]], speed: 3.4 };
const CHASE = { t0: 13.5, path: [[0.5, -0.45], [-0.6, -0.6], [-2.0, -1.0], [-3.2, -1.7]], speed: 2.3 };

// ------------------------------------------------------------------ the scene
export class ForestScene {
  // world: { stage position (x, y, z) and yaw, ground(x, z) in world coordinates }
  constructor(scene, place) {
    this.scene = scene; this.place = place;
    this.stage = new THREE.Group();
    this.stage.position.set(place.x, place.y, place.z); this.stage.rotation.y = place.yaw;
    scene.add(this.stage);
    this.ready = false; this.active = false; this.t = 0;
    // the clearing's carpet of dry leaves stays in the wood; the cast is made the first time the scene plays
    this.leaves = new Leaves(this.stage, (x, z) => this.ground(x, z));
    this.beam = new Beam(scene);
    this.feet = {};
  }
  // stage-local ground height
  ground(x, z) {
    const c = Math.cos(this.place.yaw), s = Math.sin(this.place.yaw);
    return this.place.ground(this.place.x + x * c + z * s, this.place.z - x * s + z * c) - this.place.y;
  }
  build() {
    if (this.ready) return;
    const t0 = performance.now();
    this.actors = {};
    for (const k of ['creature', 'tank', 'tee']) { const a = this.actors[k] = new Actor(CAST[k]); a.mesh.visible = false; this.stage.add(a.mesh); }
    this.buildMs = Math.round(performance.now() - t0);
    this.ready = true;
  }
  // where the player is left at the end: the last camera, looking where the creature ran (world frame)
  endView() {
    const k = CAM[CAM.length - 1], m = this.stage.matrixWorld;
    this.stage.updateMatrixWorld();
    const p = V(k.p[0], k.p[1] + this.ground(k.p[0], k.p[2]), k.p[2]).applyMatrix4(m), l = V(k.l[0], k.l[1] + this.ground(k.l[0], k.l[2]), k.l[2]).applyMatrix4(m);
    return { x: p.x, z: p.z, yaw: Math.atan2(-(l.x - p.x), -(l.z - p.z)), pitch: Math.atan2(l.y - p.y, Math.hypot(l.x - p.x, l.z - p.z)) };
  }
  // the pose of every actor at time t (stage frame); each shot has its own keys (no spline across the cut)
  pose(t) {
    const A = this.actors, order = ['creature', 'tank', 'tee'];
    for (const k of order) {
      const a = A[k], keys = TRACKS[k].filter(q => t < T1 ? q.t < T1 + 0.01 : q.t >= T1 + 0.01);
      const p = track(keys, 'p', t), r = track(keys, 'r', t), sp = track(keys, 'sp', t) ?? [0, 0, 0], hd = track(keys, 'hd', t) ?? [0, 0, 0], n = (track(keys, 'n', t) ?? [0])[0];
      p[1] += this.ground(p[0], p[2]);
      const run = this.runPose(k, t, p, r);
      // struggle: a shake on everything, strongest in the trunk and the head
      const sd = 11 + k.length, w = (f, s) => noise1(t * f, sd + s) * n;
      const hips = a.bones[0];
      hips.position.set(p[0] + w(5, 1) * 0.025, p[1] + w(6, 2) * 0.02, p[2] + w(5, 3) * 0.025);
      hips.quaternion.setFromEuler(new THREE.Euler((r[0] + w(4, 4) * 5) * D, (r[1] + w(3, 5) * 6) * D, (r[2] + w(4, 6) * 5) * D, 'YXZ'));
      const sx = (sp[0] + w(5, 7) * 8) * D, sy = (sp[1] + w(4, 8) * 10) * D, sz = (sp[2] + w(5, 9) * 6) * D;
      a.bones[1].rotation.set(sx * 0.5, sy * 0.5, sz * 0.5); a.bones[2].rotation.set(sx * 0.5, sy * 0.5, sz * 0.5);
      const hx = (hd[0] + w(7, 10) * 14) * D, hy = (hd[1] + w(6, 11) * 18) * D, hz = (hd[2] + w(6, 12) * 8) * D;
      a.bones[3].rotation.set(hx * 0.4, hy * 0.4, hz * 0.4); a.bones[4].rotation.set(hx * 0.6, hy * 0.6, hz * 0.6);
      a.fk();
      // arms: keyed (relaxed by the sides when not)
      for (const [side, L, sg] of [['aL', 'L', 1], ['aR', 'R', -1]]) {
        const kt = run?.[side] ? { pos: run[side], w: 1 } : this.target(a, keys, side, t);
        const tg = a.point('chest', [sg * 0.3, -0.55, 0.05]);
        if (kt) tg.lerp(kt.pos, kt.w);
        tg.x += w(9, 20 + sg) * 0.05; tg.y += w(8, 22 + sg) * 0.05; tg.z += w(9, 24 + sg) * 0.05;
        a.ik('upperArm' + L, tg, a.point('chest', [sg * 0.55, -0.45, -0.7]), V(0, 0, -1));
      }
      // legs: keyed targets, else the feet stay planted and step when the body has moved on
      for (const [side, L, sg] of [['lL', 'L', 1], ['lR', 'R', -1]]) {
        const kt = run?.[side] ? { pos: run[side], w: 1 } : this.target(a, keys, side, t);
        const id = k + L;
        const home = a.point('hips', [sg * 0.11, -a.J.hips[1], 0.04]);
        home.y = this.ground(home.x, home.z) + 0.08;
        const f = this.feet[id] ??= { pos: home.clone(), from: home.clone(), to: home.clone(), u: 1, kicked: true };
        if (kt && kt.w >= 1) { f.pos.copy(kt.pos); f.u = 1; }
        else {
          if (f.u >= 1 && f.pos.distanceTo(home) > 0.3) { f.from.copy(f.pos); f.to.copy(home); f.u = 0; f.kicked = false; }
          if (f.u < 1) { f.u = Math.min(1, f.u + this.dt / 0.24); f.pos.lerpVectors(f.from, f.to, ease(f.u)); f.pos.y += Math.sin(Math.PI * f.u) * 0.09; }
        }
        const tg = f.pos.clone();
        if (kt && kt.w < 1) tg.lerp(kt.pos, kt.w);
        a.ik('thigh' + L, tg, a.point('hips', [sg * 0.08, -0.3, 0.9]), V(0, 0, 1));
      }
    }
  }
  // a keyed target now: the two keys around t, either of which may leave it out (then the weight fades it in / out)
  target(a, keys, side, t) {
    const [k1, k2, u] = bracket(keys, t), s1 = k1[side], s2 = k2[side];
    if (!s1 && !s2) return null;
    if (s1 && s2) return { pos: this.resolve(a, s1).lerp(this.resolve(a, s2), u), w: 1 };
    return s1 ? { pos: this.resolve(a, s1), w: 1 - u } : { pos: this.resolve(a, s2), w: u };
  }
  resolve(a, s) {
    if (s[0] === 'w') return V(s[1], s[2] + this.ground(s[1], s[3]), s[3]);
    if (s[0] === 'r') return a.point('chest', [s[1], s[2], s[3]]);
    if (s[0] === 'g') return V(s[1], this.ground(s[1], s[2]) + 0.06, s[2]);
    const o = this.actors[s[1]]; return o.point(s[2], [s[3], s[4], s[5]]);
  }
  // the escape: the creature on all fours along its path, the man running after it
  runPose(k, t, p, r) {
    const E = k === 'creature' ? ESCAPE : k === 'tee' ? CHASE : null;
    if (!E || t < E.t0) return null;
    const P = E.path, segs = []; let tot = 0;
    for (let i = 0; i < P.length - 1; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); segs.push(l); tot += l; }
    const ramp = Math.min(1, (t - E.t0) / 0.6), d = Math.min(tot - 0.01, E.speed * (t - E.t0 - 0.3 * (1 - ramp)) * (0.4 + 0.6 * ramp));
    let i = 0, acc = 0; while (i < segs.length - 1 && acc + segs[i] < d) { acc += segs[i]; i++; }
    const u = Math.max(0, (d - acc) / segs[i]), x = P[i][0] + (P[i + 1][0] - P[i][0]) * u, z = P[i][1] + (P[i + 1][1] - P[i][1]) * u;
    const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], yaw = Math.atan2(dx, dz) / D;
    const quad = k === 'creature', freq = quad ? 2.6 : 2.4, ph = (t - E.t0) * freq;
    const bob = Math.abs(Math.sin(ph * Math.PI)) * (quad ? 0.05 : 0.06);
    p[0] = x; p[2] = z; p[1] = (quad ? 0.52 : 0.92) + bob + this.ground(x, z);
    r[0] = quad ? 68 : 14; r[1] = yaw; r[2] = Math.sin(ph * Math.PI) * 4;
    const fx = Math.sin(yaw * D), fz = Math.cos(yaw * D), rx = fz, rz = -fx;
    const step = (phase, side, fwd, reach) => {          // a foot / hand: planted (moving back) then swung forward
      const q = ((ph + phase) % 1 + 1) % 1, stance = q < 0.55, v = stance ? q / 0.55 : (q - 0.55) / 0.45;
      const s = stance ? reach * (0.5 - v) : reach * (-0.5 + v);
      const lift = stance ? 0 : Math.sin(Math.PI * v) * (quad ? 0.12 : 0.16);
      const bx = x + fx * (fwd + s) + rx * side, bz = z + fz * (fwd + s) + rz * side;
      return V(bx, this.ground(bx, bz) + 0.06 + lift, bz);
    };
    if (quad) return { lL: step(0.5, 0.13, -0.18, 0.75), lR: step(0, -0.13, -0.18, 0.75), aL: step(0, 0.16, 0.95, 0.75), aR: step(0.5, -0.16, 0.95, 0.75) };
    const a = this.actors[k];
    const swing = (sg) => a.point('chest', [sg * 0.25, -0.35, Math.sin((ph + (sg > 0 ? 0.5 : 0)) * Math.PI * 2) * 0.3]);
    return { lL: step(0.5, 0.11, 0.1, 1.1), lR: step(0, -0.11, 0.1, 1.1), aL: swing(1), aR: swing(-1) };
  }
  // ---------------- playing
  start() {
    this.build();
    this.t = 0; this.active = true; this.ev = 0; this.feet = {};
    for (const a of Object.values(this.actors)) a.mesh.visible = true;
    this.leaves.clear();
  }
  stop() {
    this.active = false; this.beam.mesh.visible = false; this.leaves.clear();
    if (this.actors) for (const a of Object.values(this.actors)) a.mesh.visible = false;
  }
  // the clearing's carpet is drawn within 160 m (the wood hides it beyond)
  near(cam) { this.leaves.floor.visible = Math.hypot(cam.x - this.place.x, cam.z - this.place.z) < 160; }
  get done() { return this.t >= T2; }
  get duration() { return T2; }
  // one frame: poses, camera, torch, leaves; sounds through cb.sound(name)
  update(dt, camera, lights, cb = {}) {
    this.dt = dt;
    this.t += dt;
    const t = this.t;
    while (this.ev < EVENTS.length && EVENTS[this.ev].t <= t) {
      const e = EVENTS[this.ev++];
      if (e.leaves) { const [x, z, n, r, up, dir] = e.leaves; this.leaves.burst(x, z, n, r, up, dir); cb.sound?.(n > 50 ? 'rustle-big' : 'rustle'); }
      if (e.sound) cb.sound?.(e.sound);
    }
    this.pose(t);
    // leaves kicked by the feet that step
    for (const f of Object.values(this.feet)) if (!f.kicked && f.u > 0.6) { this.leaves.burst(f.to.x, f.to.z, 4, 0.15, 0.9); f.kicked = true; }
    this.leaves.update(dt);
    // the camera: keyed, with a hand-held shake
    const cut = t >= T1 ? 8.25 : 0;
    const keys = CAM.filter(k => cut ? k.t >= cut : k.t < 8.25);
    const cp = track(keys, 'p', t), cl = track(keys, 'l', t);
    cp[1] += this.ground(cp[0], cp[2]); cl[1] += this.ground(cl[0], cl[2]);
    const fov = track(keys, 'fov', t)[0], s = track(keys, 's', t)[0], roll = track(keys, 'roll', t)[0];
    const sh = (f, sd) => (noise1(t * f, sd) * 0.7 + noise1(t * f * 2.7, sd + 9) * 0.3);
    this.stage.updateMatrixWorld();
    const m = this.stage.matrixWorld;
    camera.position.set(cp[0] + sh(1.3, 1) * 0.02 * s, cp[1] + sh(1.7, 2) * 0.018 * s, cp[2] + sh(1.1, 3) * 0.02 * s).applyMatrix4(m);
    const look = V(cl[0] + sh(0.9, 4) * 0.05 * s, cl[1] + sh(1.2, 5) * 0.04 * s, cl[2]).applyMatrix4(m);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    camera.rotateZ((roll + sh(1.5, 6) * 1.2 * s) * D);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    // the torches
    const [tk] = bracket(TORCH, t);
    const aim = this.actors.creature.point('chest', [0, 0.05, 0]).applyMatrix4(m);
    const C = lights.cam, Sd = lights.side;
    C.position.set(0.12, -0.1, 0).applyMatrix4(camera.matrixWorld);
    C.target.position.copy(aim); C.intensity = tk.I; C.angle = 0.6; C.penumbra = 0.65;
    C.target.updateMatrixWorld();
    if (tk.side && Sd) {
      const k2 = bracket(TORCH.filter(q => q.p), t), from = V(...k2[0].p).lerp(V(...k2[1].p), k2[2]);
      from.x += noise1(t * 2.1, 31) * 0.03; from.y += noise1(t * 2.4, 32) * 0.03 + this.ground(from.x, from.z);
      from.applyMatrix4(m);
      Sd.position.copy(from); Sd.target.position.copy(aim); Sd.intensity = tk.side; Sd.angle = 0.3; Sd.penumbra = 0.45;
      Sd.target.updateMatrixWorld();
      this.beam.set(true, from, aim.clone().add(V(0, -0.1, 0)), 0.07, t);
    } else { if (Sd) Sd.intensity = 0; this.beam.set(false); }
    const fade = Math.max(1 - clamp01(t / 0.9), clamp01(1 - Math.abs(t - (T1 + 0.02)) / 0.09), clamp01((t - (T2 - 1.1)) / 1.0));
    return { t, shot: t < T1 ? 1 : 2, fade };
  }
}
export const FOREST_SCENE = { T1, T2 };
