// (V95) What the tyres leave behind and throw up as you drive:
//  * the black marks of a tyre that slides on a paved road - locked by the handbrake, spinning under power, pushed past
//    its side grip, the car going sideways (vehicle.js: sk4, per wheel) - laid as ribbons the tyre's width, darker the
//    harder it slides, fainter on a wet road, gone after ~3 minutes;
//  * its smoke there (light, rising, drifting off behind);
//  * the dust of a gravel or an earth road in dry weather, raised by every wheel, more the faster it goes and when it
//    slides; bits of earth off the grass under a spinning or sliding tyre;
//  * a puff where the car comes down hard (main.js: its landing).
// Nothing on snow (the snow keeps its own tracks: snowtrail.js) and no dust or smoke in the rain (the spray: rain.js).
import * as THREE from 'three';

const N_MARK = 1800;                        // quads kept (a ring: the oldest go first)
const MARK_VERT = /* glsl */`
attribute vec2 aTK;         // when it was laid (s), how dark (0-1)
uniform float uTime;
uniform vec3 uCam;
varying float vA;
void main() {
  float age = uTime - aTK.x;
  vA = aTK.y * (1.0 - smoothstep(150.0, 200.0, age)) * (1.0 - smoothstep(90.0, 160.0, distance(position, uCam)));
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
const MARK_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA;
void main() {
  if (vA < 0.004) discard;
  gl_FragColor = vec4(uColor, vA);
}`;
const PUFF_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aP;          // position, size
attribute vec4 aC;          // colour, opacity
uniform vec3 uCam;
varying vec2 vC;
varying vec4 vCol;
void main() {
  vC = corner; vCol = aC;
  vec3 toCam = normalize(uCam - aP.xyz);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  gl_Position = projectionMatrix * viewMatrix * vec4(aP.xyz + (right * corner.x + up * corner.y) * aP.w, 1.0);
}`;
const PUFF_FRAG = /* glsl */`
uniform sampler2D uNoise;
uniform float uLight;
varying vec2 vC;
varying vec4 vCol;
void main() {
  float r = length(vC);
  float n = texture2D(uNoise, vC * 0.3 + vec2(vCol.a * 2.3, vCol.r * 1.9)).r;
  float a = vCol.a * (1.0 - smoothstep(0.2, 1.0, r)) * (0.4 + 0.6 * n);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol.rgb * uLight * (0.8 + 0.3 * n), a);
}`;

const PAVED = { asphalt: 1, concrete: 1, paving: 0.8, cobble: 0.6 };
const SMOKE = [0.86, 0.86, 0.88, 1];
// (the dust's colour, how much of it a wheel raises)
const LOOSE = { gravel: [0.66, 0.62, 0.55, 1], dirt: [0.5, 0.42, 0.31, 0.8], grass: [0.3, 0.25, 0.17, 0.25] };

export class WheelFX {
  constructor(scene, noise, world, n = 520) {
    this.world = world;
    // ---- the marks: a ring of quads on the ground
    const g = new THREE.BufferGeometry();
    this.mP = new THREE.BufferAttribute(new Float32Array(N_MARK * 12), 3); this.mP.setUsage(THREE.DynamicDrawUsage);
    this.mT = new THREE.BufferAttribute(new Float32Array(N_MARK * 8).fill(-1e4), 2); this.mT.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.mP); g.setAttribute('aTK', this.mT);
    const idx = new Uint16Array(N_MARK * 6);
    for (let q = 0; q < N_MARK; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3], q * 6);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.time = { value: 0 }; this.cam = { value: new THREE.Vector3() };
    this.marks = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: MARK_VERT, fragmentShader: MARK_FRAG, uniforms: { uTime: this.time, uCam: this.cam, uColor: { value: new THREE.Color(0.018, 0.018, 0.02) } },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
    this.marks.frustumCulled = false; this.marks.renderOrder = 1; this.marks.visible = false;
    this.marks.userData.noAO = true; this.marks.userData.ueSkip = 'rain';
    scene.add(this.marks);
    this.nextQ = 0; this.laid = 0; this.lastLaid = -1e9;
    this.wheel = [0, 1, 2, 3].map(() => ({ on: false, x: 0, z: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, k: 0 }));
    // ---- the smoke and the dust: soft quads turned to the eye
    this.n = n; this.next = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.age = new Float32Array(n).fill(9); this.life = new Float32Array(n).fill(1);
    this.col = new Float32Array(n * 4); this.grow = new Float32Array(n * 2); this.floor = new Float32Array(n);
    const pg = new THREE.InstancedBufferGeometry();
    pg.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    pg.setIndex([0, 1, 2, 0, 2, 3]);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.aP.setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.aC.setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('aP', this.aP); pg.setAttribute('aC', this.aC);
    pg.instanceCount = n;
    this.light = { value: 1 };
    this.mesh = new THREE.Mesh(pg, new THREE.ShaderMaterial({ vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, uniforms: { uCam: this.cam, uNoise: { value: noise }, uLight: this.light },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.visible = false;
    this.mesh.userData.noAO = true; this.mesh.userData.ueSkip = 'rain';
    scene.add(this.mesh);
    this.acc = [0, 0, 0, 0]; this.stats = { marks: 0, puffs: 0 };
  }

  // one puff: where, how it moves, its colour and opacity, its size from - to, how long it lives
  puff(x, y, z, vx, vy, vz, c, a, s0, s1, life) {
    const i = this.next = (this.next + 1) % this.n, j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.col[i * 4] = c[0]; this.col[i * 4 + 1] = c[1]; this.col[i * 4 + 2] = c[2]; this.col[i * 4 + 3] = a;
    this.grow[i * 2] = s0; this.grow[i * 2 + 1] = s1; this.age[i] = 0; this.life[i] = life; this.floor[i] = y - 0.1;
    this.stats.puffs++;
  }

  // the car came down hard (hit: m/s): a puff under each wheel - dust off a loose road, a little off a paved one
  land(car, hit, o = {}) {
    if (!car || (o.snow ?? 0) > 0.3 || (o.wet ?? 0) > 0.5) return;
    const L = LOOSE[car.surf], c = L ?? [0.62, 0.6, 0.57, 0.3], k = Math.min(1, (hit - 1.2) / 4) * (L ? L[3] : 0.3), s = Math.sin(car.h), co = Math.cos(car.h), y = car.car.group.position.y;
    for (const [lx, lz] of car.sp.spots) {
      const wx = car.x + lx * co + lz * s, wz = car.z - lx * s + lz * co;
      for (let q = 0; q < Math.round(2 + 7 * k); q++) this.puff(wx + (Math.random() - 0.5) * 0.4, y + 0.1, wz + (Math.random() - 0.5) * 0.4, car.vx * 0.3 + (Math.random() - 0.5) * 3, 0.5 + Math.random() * 1.5, car.vz * 0.3 + (Math.random() - 0.5) * 3, c, 0.1 + 0.12 * k, 0.4, 1.8 + 1.4 * k, 0.9 + Math.random() * 0.9);
    }
  }

  // car: the vehicle you drive (or null); o: { wet, snow (0-1), light, cam, t (s) }
  update(dt, car, o) {
    this.time.value = o.t; this.cam.value.copy(o.cam); this.light.value = Math.max(0.06, o.light);
    const wet = o.wet ?? 0, snow = o.snow ?? 0;
    if (car && car.sk4 && snow < 0.3) {
      const sp = Math.hypot(car.vx, car.vz), s = Math.sin(car.h), c = Math.cos(car.h), paved = PAVED[car.surf] ?? 0, loose = LOOSE[car.surf], hw = (car.m.tireW ?? 0.2) / 2;
      const S = car.vs?.awake ? car.vs : null, gy = car.car.group.position.y;
      for (let i = 0; i < 4; i++) {
        const W = this.wheel[i], lx = car.sp.spots[i][0], lz = car.sp.spots[i][1], onGround = !S || S.load[i] > 0.12;
        const k = onGround ? car.sk4[i] : 0, wx = car.x + lx * c + lz * s, wz = car.z - lx * s + lz * c;
        // ---- a mark under a sliding tyre on a paved road
        const dark = paved * Math.min(1, (k - 0.3) / 0.5) * (1 - 0.75 * wet) * 0.62;
        if (dark > 0.03 && sp > 0.8) {
          const ax = wx - c * hw, az = wz + s * hw, bx = wx + c * hw, bz = wz - s * hw;
          const ay = this.world.groundHeight(ax, az, gy) + 0.012, by = this.world.groundHeight(bx, bz, gy) + 0.012;
          const d = Math.hypot(wx - W.x, wz - W.z);
          if (!W.on || d > 1.6) { W.on = true; W.x = wx; W.z = wz; W.ax = ax; W.ay = ay; W.az = az; W.bx = bx; W.by = by; W.bz = bz; W.k = 0; }   // (a new strip: from nothing)
          else if (d > 0.12) {
            const q = this.nextQ = (this.nextQ + 1) % N_MARK, P = this.mP.array, T = this.mT.array, j = q * 12, t = q * 8;
            P[j] = W.ax; P[j + 1] = W.ay; P[j + 2] = W.az; P[j + 3] = W.bx; P[j + 4] = W.by; P[j + 5] = W.bz;
            P[j + 6] = ax; P[j + 7] = ay; P[j + 8] = az; P[j + 9] = bx; P[j + 10] = by; P[j + 11] = bz;
            T[t] = T[t + 2] = T[t + 4] = T[t + 6] = o.t; T[t + 1] = T[t + 3] = W.k; T[t + 5] = T[t + 7] = dark;
            W.x = wx; W.z = wz; W.ax = ax; W.ay = ay; W.az = az; W.bx = bx; W.by = by; W.bz = bz; W.k = dark;
            this.mP.needsUpdate = true; this.mT.needsUpdate = true; this.laid++; this.lastLaid = o.t; this.stats.marks++;
          }
        } else W.on = false;
        // ---- what it throws up
        let rate = 0, col = null, a = 0, s1 = 2, life = 1.4, rise = 0.6;
        if (paved && k > 0.5 && wet < 0.5) { rate = (k - 0.5) * 2 * 38 * paved * (1 - wet); col = SMOKE; a = 0.13; s1 = 1.45; life = 1.6; rise = 1.1; }
        else if (loose && wet < 0.35) { rate = loose[3] * ((car.surf === 'grass' ? 0 : Math.min(1, Math.max(0, sp - 4) / 22) * 16) + k * 34 * Math.min(1, sp / 6 + (car.spinK ?? 0))); col = loose; a = 0.075 * (1 - wet * 2); s1 = car.surf === 'grass' ? 1 : 2.8; life = car.surf === 'grass' ? 0.7 : 2.2; rise = 0.35; }
        if (rate > 0 && onGround) {
          this.acc[i] += rate * dt;
          while (this.acc[i] >= 1) {
            this.acc[i] -= 1;
            this.puff(wx + (Math.random() - 0.5) * 0.3, gy + 0.08 + Math.random() * 0.12, wz + (Math.random() - 0.5) * 0.3,
              car.vx * 0.12 + (Math.random() - 0.5) * 0.9, rise * (0.5 + Math.random()), car.vz * 0.12 + (Math.random() - 0.5) * 0.9, col, a * (0.7 + 0.6 * Math.random()), 0.28, s1 * (0.8 + 0.5 * Math.random()), life * (0.7 + 0.6 * Math.random()));
          }
        } else this.acc[i] = 0;
      }
    } else for (const W of this.wheel) W.on = false;
    this.marks.visible = this.laid > 0 && o.t - this.lastLaid < 205;
    let any = false;
    const P = this.aP.array, C = this.aC.array, drag = Math.exp(-1.6 * dt);
    for (let i = 0; i < this.n; i++) {
      const t = (this.age[i] += dt) / this.life[i], j = i * 3;
      if (t >= 1) { if (C[i * 4 + 3] !== 0) { C[i * 4 + 3] = 0; P[i * 4 + 3] = 0; any = true; } continue; }
      any = true;
      this.v[j] *= drag; this.v[j + 2] *= drag; this.v[j + 1] *= drag;
      this.p[j] += this.v[j] * dt; this.p[j + 1] = Math.max(this.floor[i], this.p[j + 1] + this.v[j + 1] * dt); this.p[j + 2] += this.v[j + 2] * dt;
      P[i * 4] = this.p[j]; P[i * 4 + 1] = this.p[j + 1]; P[i * 4 + 2] = this.p[j + 2]; P[i * 4 + 3] = this.grow[i * 2] + (this.grow[i * 2 + 1] - this.grow[i * 2]) * Math.sqrt(t);
      C[i * 4] = this.col[i * 4]; C[i * 4 + 1] = this.col[i * 4 + 1]; C[i * 4 + 2] = this.col[i * 4 + 2]; C[i * 4 + 3] = this.col[i * 4 + 3] * (1 - t) * Math.min(1, t * 6);
    }
    this.mesh.visible = any;
    if (any) { this.aP.needsUpdate = true; this.aC.needsUpdate = true; }
  }
}
