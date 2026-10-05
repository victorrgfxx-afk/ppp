import * as THREE from 'three';
import { Actor, makeCast } from './cast.js';

// The forest scene from the user's two clips (night, a wood floor deep in dry leaves, a pale starved creature, two men
// wrestling it), played live in the game, in the clearing of the wood by the cross on the hill above Strada Măgurii: no
// cutscene, you keep walking and looking, and light it with your own torch. It happens only at 23:30 under an overcast
// sky. Two men wait in the clearing; when you come within 16 m the creature runs out of the dark screaming, the man in
// the black tank top grabs it from behind, the man in the cream T-shirt takes its arm and they force it down onto the
// leaves and pin it; the man in the tank top goes round to its feet and hauls it up by the legs, it hangs head down,
// flailing, he throws it, and it scrambles off on all fours into the dark, between the trunks and away from you, the two
// men after it. Each of them is gone once you no longer see them; it can happen again after you have gone 60 m away.
// The stage's frame: origin on the ground at the action, +z towards the cross, +x to its right seen from there.

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


// ------------------------------------------------------------------ the choreography
// Targets: ['w', x, y, z] a point on the stage; ['r', x, y, z] relative to the actor's own chest; ['a', actor, bone, ox, oy, oz]
// a point on another actor's bone; ['g', x, z] the ground (feet). Keys: p hips position, r [pitch, yaw, roll] degrees,
// sp spine bend [x, y, z] degrees (split over spine and chest), hd head [x, y, z] (split over neck and head),
// aL aR lL lR the hands' and feet's targets (no leg key: the feet plant and step by themselves), n struggle (0..1).
// Heights (hips and 'w' points) are above the ground under them: the clearing is on a slope.
const T0 = -1.6;                                  // the creature comes out of the dark (it runs in until 0)
const T1 = 8.2;                                   // pinned on the leaves
const GAP = 1.2;                                  // the man in the tank top goes round to its feet
const SHOT1 = {
  creature: [
    // out of the dark at a run, into the torchlight
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
    // up, and round its feet (between the two parts)
    { t: T1 + GAP * 0.5, p: [-0.8, 0.93, 1.02], r: [8, 120, 0], sp: [6, 0, 0], hd: [6, 0, 0], aL: ['r', 0.3, -0.25, 0.35], aR: ['r', -0.3, -0.25, 0.35], n: 0.5 },
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
  ],
};
// The second part was staged for the second clip's camera, on the far side: it is turned round (reflected front to
// back, z -> DZ - z, left and right swapped) so that it carries on from where the first part leaves them.
const SHOT2 = {
  creature: [
    // hauled up by the shins, hanging head down, flailing
    { t: 8.25, p: [0.0, 0.16, -0.15], r: [-88, 180, 0], sp: [0, 0, 0], hd: [10, 0, 0], aL: ['r', 0.45, 0.3, 0.3], aR: ['r', -0.45, 0.35, 0.3], lL: ['g', -0.14, -0.96], lR: ['g', 0.12, -1.0], n: 1.0 },
    { t: 8.9, p: [0.0, 0.48, -0.36], r: [-140, 180, 0], sp: [-6, 0, 0], hd: [20, 0, 0], aL: ['r', 0.4, 0.4, 0.25], aR: ['r', -0.4, 0.5, 0.15], lL: ['w', -0.12, 1.16, -0.9], lR: ['w', 0.1, 1.2, -0.92], n: 1.0 },
    { t: 9.6, p: [0.0, 0.94, -0.5], r: [-176, 180, 0], sp: [-6, 0, 0], hd: [-10, 0, 0], aL: ['r', 0.38, 0.52, 0.3], aR: ['r', -0.36, 0.6, 0.12], lL: ['w', -0.12, 1.78, -0.62], lR: ['w', 0.1, 1.82, -0.66], n: 1.0 },
    { t: 10.6, p: [0.05, 0.96, -0.48], r: [-174, 188, 6], sp: [-12, 12, 0], hd: [-20, 25, 0], aL: ['r', 0.5, 0.3, -0.1], aR: ['r', -0.3, 0.68, 0.25], lL: ['w', -0.1, 1.8, -0.6], lR: ['w', 0.1, 1.83, -0.66], n: 1.0 },
    { t: 11.5, p: [-0.05, 0.95, -0.5], r: [-178, 172, -6], sp: [-4, -14, 0], hd: [-25, -20, 0], aL: ['r', 0.3, 0.62, 0.3], aR: ['r', -0.5, 0.42, -0.1], lL: ['w', -0.12, 1.79, -0.61], lR: ['w', 0.08, 1.82, -0.66], n: 1.0 },
    // thrown: swung to the side and dropped on the leaves
    { t: 12.1, p: [-0.55, 0.88, -0.3], r: [-140, 215, -30], sp: [0, 0, 0], hd: [0, 0, 0], aL: ['r', 0.5, 0.45, 0.2], aR: ['r', -0.5, 0.45, 0.1], lL: ['w', -0.45, 1.58, -0.7], lR: ['w', -0.25, 1.62, -0.75], n: 0.6 },
    { t: 12.55, p: [-1.15, 0.2, 0.05], r: [-82, 250, -55], sp: [10, 0, 0], hd: [10, 0, 0], aL: ['g', -1.45, 0.45], aR: ['g', -0.85, 0.5], lL: ['g', -1.55, -0.85], lR: ['g', -1.1, -0.9], n: 0.4 },
    // up on all fours (then away into the dark: ESCAPE)
    { t: 13.2, p: [-1.3, 0.56, 0.0], r: [70, 215, 0], sp: [8, 0, 0], hd: [-50, 0, 0], aL: ['g', -1.55, -0.3], aR: ['g', -1.15, -0.42], lL: ['g', -1.2, 0.45], lR: ['g', -0.9, 0.3], n: 0.3 },
  ],
  tank: [
    // bent over its shins, then hauling it up and holding it high
    { t: 8.25, p: [-0.42, 0.7, -1.35], r: [42, 25, 0], sp: [30, 0, 0], hd: [12, 0, 0], aL: ['a', 'creature', 'shinR', 0, -0.32, 0], aR: ['a', 'creature', 'shinL', 0, -0.32, 0], lL: ['g', -0.2, -1.6], lR: ['g', -0.6, -1.5], n: 0.8 },
    { t: 9.6, p: [-0.42, 0.97, -1.1], r: [-6, 25, 0], sp: [-10, 0, 0], hd: [-12, 0, 0], aL: ['a', 'creature', 'shinR', 0, -0.33, 0], aR: ['a', 'creature', 'shinL', 0, -0.33, 0], n: 0.9 },
    { t: 11.5, p: [-0.4, 0.96, -1.1], r: [-6, 29, 4], sp: [-6, 8, 0], hd: [-10, 6, 0], aL: ['a', 'creature', 'shinR', 0, -0.33, 0], aR: ['a', 'creature', 'shinL', 0, -0.33, 0], n: 1.0 },
    // the throw: a swing to his right, then he lets go
    { t: 12.1, p: [-0.5, 0.92, -1.05], r: [10, -5, 0], sp: [14, -25, 0], hd: [6, -20, 0], aL: ['a', 'creature', 'shinR', 0, -0.3, 0], aR: ['a', 'creature', 'shinL', 0, -0.3, 0], n: 0.6 },
    { t: 12.5, p: [-0.55, 0.9, -1.0], r: [18, -15, 0], sp: [20, -15, 0], hd: [0, -10, 0], aL: ['r', -0.1, -0.1, 0.55], aR: ['r', -0.4, -0.05, 0.45], n: 0.4 },
    { t: 13.4, p: [-0.75, 0.97, -0.85], r: [4, -105, 0], sp: [6, 0, 0], hd: [0, 0, 0], aL: ['r', 0.3, -0.3, 0.3], aR: ['r', -0.3, -0.3, 0.3], n: 0.2 },
  ],
  tee: [
    // at its side, holding its arm and its body as it comes up
    { t: 8.25, p: [0.66, 0.66, -0.3], r: [34, -90, 0], sp: [28, 0, 0], hd: [14, 0, 0], aL: ['a', 'creature', 'upperArmR', 0, -0.1, 0], aR: ['a', 'creature', 'chest', -0.05, 0, 0.08], n: 0.8 },
    { t: 9.6, p: [0.66, 0.92, -0.45], r: [12, -95, 0], sp: [10, 0, 0], hd: [6, 0, 0], aL: ['a', 'creature', 'foreArmR', 0, -0.08, 0], aR: ['a', 'creature', 'chest', -0.05, 0.05, 0.08], n: 0.9 },
    { t: 11.5, p: [0.66, 0.92, -0.45], r: [12, -92, 0], sp: [12, 8, 0], hd: [8, 0, 0], aL: ['a', 'creature', 'foreArmR', 0, -0.08, 0], aR: ['a', 'creature', 'chest', -0.05, 0.08, 0.08], n: 1.0 },
    { t: 12.2, p: [0.55, 0.93, -0.35], r: [10, -110, 0], sp: [10, 0, 0], hd: [0, 0, 0], aL: ['r', 0.2, 0.0, 0.5], aR: ['r', -0.3, -0.1, 0.45], n: 0.4 },
    { t: 13.3, p: [0.5, 0.95, -0.45], r: [6, -130, 0], sp: [10, 0, 0], hd: [0, 0, 0], aL: ['r', 0.3, -0.2, 0.3], aR: ['r', -0.3, -0.2, 0.3], n: 0.2 },
  ],
};
const DZ = 0.21;
const swapLR = (n) => n.replace(/[LR]$/, (c) => (c === 'L' ? 'R' : 'L'));
function reflectTarget(s) {
  if (!s) return s;
  if (s[0] === 'w') return ['w', s[1], s[2], DZ - s[3]];
  if (s[0] === 'g') return ['g', s[1], DZ - s[2]];
  if (s[0] === 'r') return ['r', -s[1], s[2], s[3]];
  return ['a', s[1], swapLR(s[2]), -s[3], s[4], s[5]];
}
function reflectKey(k) {
  const o = { t: k.t + GAP, p: [k.p[0], k.p[1], DZ - k.p[2]], r: [k.r[0], 180 - k.r[1], -k.r[2]], n: k.n };
  if (k.sp) o.sp = [k.sp[0], -k.sp[1], -k.sp[2]];
  if (k.hd) o.hd = [k.hd[0], -k.hd[1], -k.hd[2]];
  for (const [to, from] of [['aL', 'aR'], ['aR', 'aL'], ['lL', 'lR'], ['lR', 'lL']]) if (k[from]) o[to] = reflectTarget(k[from]);
  return o;
}
// one continuous track per actor (yaws unwrapped so that each key turns the short way from the one before)
const TRACKS = {};
for (const k of ['creature', 'tank', 'tee']) {
  const keys = [...SHOT1[k], ...SHOT2[k].map(reflectKey)].sort((a, b) => a.t - b.t);
  for (let i = 1; i < keys.length; i++) { let y = keys[i].r[1]; const y0 = keys[i - 1].r[1]; while (y - y0 > 180) y -= 360; while (y - y0 < -180) y += 360; keys[i].r[1] = y; }
  TRACKS[k] = keys;
}
const reflectBurst = (e) => (e.leaves ? { ...e, t: e.t + GAP, leaves: [e.leaves[0], DZ - e.leaves[1], ...e.leaves.slice(2, 5), e.leaves[5] && [e.leaves[5][0], -e.leaves[5][1]]] } : { ...e, t: e.t + GAP });
const EVENTS = [
  { t: -1.5, sound: 'rustle' }, { t: -1.0, sound: 'rustle' }, { t: -0.45, sound: 'shriek' },
  { t: 0.05, leaves: [1.6, 0.95, 26, 0.5, 2.0, [-1, -0.4]] },
  { t: 0.4, leaves: [0.85, 0.7, 14, 0.35, 1.5] }, { t: 0.75, leaves: [0.4, 0.5, 14, 0.35, 1.4] },
  { t: 2.75, sound: 'shriek' },
  { t: 4.8, leaves: [0.05, 0.6, 20, 0.6, 1.6] }, { t: 5.3, sound: 'thud' }, { t: 5.3, leaves: [0.0, 0.8, 34, 0.7, 2.2] },
  { t: 6.05, sound: 'thud' }, { t: 6.05, leaves: [0.0, 0.45, 40, 0.9, 2.4] }, { t: 6.8, sound: 'growl' },
  { t: 7.6, leaves: [0.2, 0.9, 16, 0.5, 1.8] },
  ...[
    { t: 8.25, leaves: [0.0, -0.45, 130, 1.2, 3.6] }, { t: 8.4, leaves: [0.1, -0.9, 60, 0.8, 3.0] }, { t: 8.35, sound: 'shriek' },
    { t: 9.2, leaves: [0.1, -0.6, 30, 0.6, 2.0] },
    { t: 10.4, sound: 'shriek' }, { t: 11.0, leaves: [0.0, -0.45, 18, 0.5, 1.6] },
    { t: 12.5, sound: 'thud' }, { t: 12.5, leaves: [-1.15, 0.05, 90, 1.0, 3.2] },
    { t: 13.1, sound: 'shriek' }, { t: 13.3, leaves: [-1.3, 0.0, 30, 0.6, 2.4] },
  ].map(reflectBurst),
].sort((a, b) => a.t - b.t);
// Paths made when needed, between the trunks (and away from you): the creature running in from the dark, its escape on
// all fours, the man in the T-shirt running after it, the man in the tank top a few steps behind.
const RUNS = {
  entry: { who: 'creature', gait: 'run', t0: T0, t1: 0 },
  escape: { who: 'creature', gait: 'quad', t0: 13.2 + GAP, speed: 3.4, len: 22 },
  chase: { who: 'tee', gait: 'run', t0: 13.5 + GAP, speed: 2.3, len: 7 },
  follow: { who: 'tank', gait: 'walk', t0: 13.7 + GAP, speed: 1.15, len: 2.6 },
};

// ------------------------------------------------------------------ the scene
const ORDER = ['creature', 'tank', 'tee'];
const R_START = 16, R_WAIT = 80, R_REARM = 60, R_GONE = 22;      // m: it starts / they are drawn / again / out of sight
export class ForestScene {
  // place: the stage's position (x, y, z) and yaw; ground(x, z) the terrain in world coordinates; world: the collision
  // world (the trunks, logs and rocks the paths go round, and the bodies' own colliders)
  constructor(scene, place) {
    this.scene = scene; this.place = place; this.world = place.world;
    this.stage = new THREE.Group();
    this.stage.position.set(place.x, place.y, place.z); this.stage.rotation.y = place.yaw;
    scene.add(this.stage);
    this.c = Math.cos(place.yaw); this.s = Math.sin(place.yaw);
    // the clearing's carpet of dry leaves is always there; the cast is made the first time the scene's hour comes
    this.leaves = new Leaves(this.stage, (x, z) => this.ground(x, z));
    this.state = 'off'; this.ready = false; this.t = T0; this.tn = 0; this.dt = 0;
    this.feet = {}; this.runs = {}; this.end = Infinity; this._q = []; this._f = new THREE.Frustum(); this._m = new THREE.Matrix4(); this._s = new THREE.Sphere();
  }
  // stage <-> world
  toWorld(x, z) { return [this.place.x + x * this.c + z * this.s, this.place.z - x * this.s + z * this.c]; }
  toStage(wx, wz) { const dx = wx - this.place.x, dz = wz - this.place.z; return [dx * this.c - dz * this.s, dx * this.s + dz * this.c]; }
  ground(x, z) { const [wx, wz] = this.toWorld(x, z); return this.place.ground(wx, wz) - this.place.y; }
  // the cast, made in a worker (cast.js): the game goes on meanwhile
  prepare() {
    if (this.making) return;
    this.making = makeCast(ORDER).then(({ bodies, how, ms }) => {
      this.actors = {};
      for (const k of ORDER) {
        const a = this.actors[k] = new Actor(bodies[k]);
        a.mesh.visible = false; this.stage.add(a.mesh);
        a.box = new this.world.Box(0, 0, 0.24, 0.24, 0, -1e4, 1e4, 'actor'); a.boxIn = false;
      }
      this.how = how; this.buildMs = ms; this.ready = true;
    });
  }
  // where to stand to see it: on the cross's side, 19 m off, with the clearest view between the trunks (world x, z, yaw)
  viewpoint() {
    let best = null;
    for (let a = -60; a <= 60; a += 10) {
      const sx = Math.sin(a * D) * 19, sz = Math.cos(a * D) * 19;
      let c = 9;
      for (let u = 0.15; u <= 1.001; u += 0.05) c = Math.min(c, this.clearance(sx * u, sz * u, u > 0.9 ? 1.2 : 0.25));
      if (!best || c > best.c) best = { c, sx, sz };
    }
    const [x, z] = this.toWorld(best.sx, best.sz), [ox, oz] = this.toWorld(0, 0);
    return { x, z, yaw: Math.atan2(-(ox - x), -(oz - z)) };
  }
  // free space around a stage point: the distance to the nearest trunk, log, rock or wall (m, up to 3)
  clearance(x, z, r = 0) {
    const [wx, wz] = this.toWorld(x, z), W = this.world;
    let best = 3;
    for (const b of W.query(wx, wz, 3.5, this._q)) {
      if (W.dynamic.has(b)) continue;
      const dx = wx - b.x, dz = wz - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      best = Math.min(best, Math.hypot(Math.max(Math.abs(lx) - b.hw, 0), Math.max(Math.abs(lz) - b.hd, 0)));
    }
    return best - r;
  }
  // a path from `from` heading roughly along `dir` (stage x, z), 1 m steps that keep 0.6 m off everything, turning at
  // most 35 degrees a step and 80 from the heading wanted; away from `avoid` (a stage point, e.g. you) if given
  plan(from, dir, len, avoid = null) {
    const pts = [from.slice()];
    let [x, z] = from, h = Math.atan2(dir[0], dir[1]);
    const want = h;
    for (let s = 0; s < len; s++) {
      let best = null, bs = -1e9;
      for (let da = -35; da <= 35; da += 7) {
        const a = h + da * D, off = Math.abs(((a - want) / D + 540) % 360 - 180);
        if (off > 80) continue;
        const nx = x + Math.sin(a), nz = z + Math.cos(a);
        let c = Math.min(this.clearance(x + Math.sin(a) * 0.5, z + Math.cos(a) * 0.5), this.clearance(nx, nz));
        if (avoid) c = Math.min(c, Math.hypot(nx - avoid[0], nz - avoid[1]) - 0.9);
        if (c < 0.6) continue;
        const score = Math.min(c, 1.6) - off / 80 * 0.5 - Math.abs(da) / 35 * 0.15;
        if (score > bs) { bs = score; best = a; }
      }
      if (best === null) break;
      h = best; x += Math.sin(h); z += Math.cos(h); pts.push([x, z]);
    }
    return pts;
  }
  // ---------------- each frame (not while paused)
  // ctx: ok (23:30 under clouds), px pz (you, world), camera, sound(name, distance)
  update(dt, ctx) {
    this.dt = dt; this.tn += dt;
    if (ctx.ok) this.prepare();
    const [sx, sz] = this.toStage(ctx.px, ctx.pz), dist = Math.hypot(sx, sz);
    this.you = [sx, sz];
    if (!ctx.ok) { if (this.state !== 'off') this.reset('off'); return; }
    if (!this.ready) return;
    ctx.camera.updateMatrixWorld();
    this._m.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse); this._f.setFromProjectionMatrix(this._m);
    this.stage.updateMatrixWorld();
    switch (this.state) {
      case 'off':                                  // (not where you can see them appear)
        if (dist > 45 || !this.seen(0, 0, 3)) this.reset('wait');
        return;
      case 'gone':
        if (dist > R_REARM) this.reset('wait');
        return;
      case 'wait': {
        const show = dist < R_WAIT;
        this.show('tank', show); this.show('tee', show); this.show('creature', false);
        if (show) this.pose(T0);
        if (dist < R_START) { this.state = 'play'; this.t = T0; this.ev = 0; this.show('creature', true); this.pose(T0); }
        break;
      }
      case 'play': case 'after': {
        this.t += dt;
        const t = this.t;
        while (this.ev < EVENTS.length && EVENTS[this.ev].t <= t) {
          const e = EVENTS[this.ev++], at = this.actors.creature.point('head', [0, 0, 0]);
          if (e.leaves) { const [x, z, n, r, up, d] = e.leaves; this.leaves.burst(x, z, n, r, up, d); ctx.sound?.(n > 50 ? 'rustle-big' : 'rustle', Math.hypot(x - sx, z - sz)); }
          if (e.sound) ctx.sound?.(e.sound, Math.hypot(at.x - sx, at.z - sz));
        }
        this.pose(t);
        if (this.state === 'play' && t > this.end) this.state = 'after';
        if (this.state === 'after') {
          // once their part is over, each of them is gone as soon as you no longer see them (or they are far)
          let left = 0;
          for (const k of ORDER) {
            const a = this.actors[k];
            if (!a.mesh.visible) continue;
            const h = a.point('hips', [0, 0, 0]);
            if (Math.hypot(h.x - sx, h.z - sz) > R_GONE || !this.seen(h.x, h.z, 1.2)) this.show(k, false); else left++;
          }
          if (!left) this.reset('gone');
        }
        if (dist > R_REARM) this.reset('wait');
        break;
      }
    }
    // the leaves kicked by the feet that step, those in the air, and the bodies' colliders
    for (const f of Object.values(this.feet)) if (!f.kicked && f.u > 0.6) { this.leaves.burst(f.to.x, f.to.z, 4, 0.15, 0.9); f.kicked = true; }
    this.leaves.update(dt);
    for (const k of ORDER) {
      const a = this.actors[k];
      if (!a.mesh.visible) continue;
      const h = a.point('hips', [0, 0, 0]), [wx, wz] = this.toWorld(h.x, h.z);
      a.box.x = wx; a.box.z = wz; a.box.update();
    }
  }
  // is a stage point (radius r) in the camera's view?
  seen(x, z, r) {
    const [wx, wz] = this.toWorld(x, z);
    this._s.center.set(wx, this.place.ground(wx, wz) + 0.9, wz); this._s.radius = r;
    return this._f.intersectsSphere(this._s);
  }
  show(k, on) {
    const a = this.actors[k];
    if (a.mesh.visible === on) return;
    a.mesh.visible = on;
    if (on && !a.boxIn) { this.world.addDynamic(a.box); a.boxIn = true; }
    if (!on && a.boxIn) { this.world.removeDynamic(a.box); a.boxIn = false; }
  }
  reset(state) {
    this.state = state; this.t = T0; this.ev = 0; this.feet = {}; this.runs = {};
    if (this.actors) for (const k of ORDER) this.show(k, false);
    this.leaves.clear();
    this.end = Infinity;
  }
  // ready to happen again now (K takes you there: what you saw before is gone anyway)
  arm() { if (this.ready && (this.state === 'off' || this.state === 'gone')) this.reset('wait'); return this.ready; }
  get live() { return this.state === 'play' || this.state === 'after' || (this.state === 'wait' && this.actors?.tank.mesh.visible); }
  // the clearing's carpet is drawn within 160 m (the wood hides it beyond)
  near(cam) { this.leaves.floor.visible = Math.hypot(cam.x - this.place.x, cam.z - this.place.z) < 160; }

  // ---------------- posing
  // a run along a path, made when it starts: the hips position and rotation, the hands' and feet's targets, and how
  // much of it to use (it takes over in 0.4 s); after its end the actor stands (the creature crouches) where it stopped
  run(name, t) {
    const R = RUNS[name];
    if (t < R.t0) return null;
    let P = this.runs[name];
    if (!P) {
      if (name === 'entry') {
        // from the dark on the far side of the clearing to where the first key picks it up, in 1.6 s
        const k = TRACKS.creature[0], back = this.plan([k.p[0], k.p[2]], [1, 0.12], 6, this.you).reverse();
        P = { pts: back, speed: null };
      } else if (name === 'escape') {
        // away from you and from the men, between the trunks
        const k = TRACKS.creature.find(q => q.t >= R.t0 - 0.01) ?? TRACKS.creature[TRACKS.creature.length - 1];
        const from = [k.p[0], k.p[2]], y = this.you, ax = from[0] - y[0], az = from[1] - y[1], al = Math.hypot(ax, az) || 1;
        const d = [ax / al - 0.6, az / al], dl = Math.hypot(d[0], d[1]) || 1;
        P = { pts: this.plan(from, [d[0] / dl, d[1] / dl], R.len, y) };
      } else {
        // after it, along its path
        const esc = this.runs.escape?.pts ?? [[-3, DZ]], h = this.pose0(R.who, t);
        const pts = [[h[0], h[2]]];
        let L = 0;
        for (const q of esc.slice(1)) { const l = Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]); if (L + l > R.len) break; pts.push(q); L += l; }
        P = { pts };
      }
      P.seg = []; P.len = 0;
      for (let i = 0; i < P.pts.length - 1; i++) { const l = Math.hypot(P.pts[i + 1][0] - P.pts[i][0], P.pts[i + 1][1] - P.pts[i][1]); P.seg.push(l); P.len += l; }
      if (name === 'entry') P.speed = P.len / (R.t1 - R.t0);
      this.runs[name] = P;
      if (name !== 'entry') {
        P.endT = R.t0 + P.len / R.speed + 0.6;
        const after = ['escape', 'chase', 'follow'].map(n => this.runs[n]);
        if (after.every(Boolean)) this.end = Math.max(...after.map(q => q.endT));
      }
    }
    if (P.len < 0.3) return null;
    const speed = P.speed ?? R.speed, tt = t - R.t0;
    let d;
    if (name === 'entry') d = speed * tt;
    else { const ramp = Math.min(1, tt / 0.6); d = speed * (tt - 0.3 * (1 - ramp)) * (0.4 + 0.6 * ramp); }
    const stopped = d >= P.len;
    d = Math.max(0, Math.min(P.len - 0.001, d));
    let i = 0, acc = 0; while (i < P.seg.length - 1 && acc + P.seg[i] < d) { acc += P.seg[i]; i++; }
    const u = (d - acc) / P.seg[i], A = P.pts[i], B = P.pts[i + 1];
    const x = A[0] + (B[0] - A[0]) * u, z = A[1] + (B[1] - A[1]) * u, yaw = Math.atan2(B[0] - A[0], B[1] - A[1]) / D;
    const quad = R.gait === 'quad', walk = R.gait === 'walk', g = this.ground(x, z);
    const w = name === 'entry' ? 1 - clamp01((t + 0.35) / 0.35) : clamp01(tt / 0.4);
    if (stopped && !quad) return { p: [x, (walk ? 0.97 : 0.95) + g, z], r: [6, yaw, 0], w: 1 };      // standing, looking after it
    const freq = quad ? 2.6 : walk ? 1.7 : name === 'entry' ? 2.7 : 2.4, ph = (stopped ? P.len / speed : tt) * freq;
    const bob = Math.abs(Math.sin(ph * Math.PI)) * (quad ? 0.05 : walk ? 0.025 : 0.06);
    const p = [x, (quad ? 0.52 : walk ? 0.96 : 0.92) + bob + g, z];
    const r = [quad ? 68 : walk ? 4 : name === 'entry' ? 22 : 14, yaw, Math.sin(ph * Math.PI) * (walk ? 2 : 4)];
    const fx = Math.sin(yaw * D), fz = Math.cos(yaw * D), rx = fz, rz = -fx;
    const step = (phase, side, fwd, reach) => {          // a foot / hand: planted (moving back) then swung forward
      const q = ((ph + phase) % 1 + 1) % 1, stance = q < 0.55, v = stance ? q / 0.55 : (q - 0.55) / 0.45;
      const s = stance ? reach * (0.5 - v) : reach * (-0.5 + v);
      const lift = stance ? 0 : Math.sin(Math.PI * v) * (quad ? 0.12 : walk ? 0.08 : 0.16);
      const bx = x + fx * (fwd + s) + rx * side, bz = z + fz * (fwd + s) + rz * side;
      return V(bx, this.ground(bx, bz) + 0.06 + lift, bz);
    };
    if (quad) return { p, r, w, lL: step(0.5, 0.13, -0.18, 0.75), lR: step(0, -0.13, -0.18, 0.75), aL: step(0, 0.16, 0.95, 0.75), aR: step(0.5, -0.16, 0.95, 0.75) };
    const a = this.actors[R.who], sw = walk ? 0.15 : 0.3;
    const swing = (sg) => name === 'entry'
      ? a.point('chest', [sg * 0.35, 0.05 + Math.sin((ph + (sg > 0 ? 0.5 : 0)) * Math.PI * 2) * 0.12, 0.5])        // arms out in front, clawing
      : a.point('chest', [sg * 0.25, -0.35, Math.sin((ph + (sg > 0 ? 0.5 : 0)) * Math.PI * 2) * sw]);
    const stride = walk ? 0.7 : name === 'entry' ? 1.2 : 1.1;
    return { p, r, w, lL: step(0.5, 0.11, 0.1, stride), lR: step(0, -0.11, 0.1, stride), aL: swing(1), aR: swing(-1) };
  }
  // an actor's keyed hips position at t (stage)
  pose0(k, t) { const p = track(TRACKS[k], 'p', t); p[1] += this.ground(p[0], p[2]); return p; }
  // the pose of every visible actor at time t (stage frame)
  pose(t) {
    const A = this.actors;
    for (const k of ORDER) {
      const a = A[k];
      if (!a.mesh.visible) continue;
      const keys = TRACKS[k];
      const p = track(keys, 'p', t), r = track(keys, 'r', t), sp = track(keys, 'sp', t) ?? [0, 0, 0], hd = track(keys, 'hd', t) ?? [0, 0, 0];
      const n = this.state === 'wait' ? 0.15 : (track(keys, 'n', t) ?? [0])[0];
      p[1] += this.ground(p[0], p[2]);
      const run = k === 'creature' ? (t < 0 ? this.run('entry', t) : this.run('escape', t)) : this.run(k === 'tee' ? 'chase' : 'follow', t);
      if (run) {
        for (let i = 0; i < 3; i++) p[i] += (run.p[i] - p[i]) * run.w;
        r[0] += (run.r[0] - r[0]) * run.w; r[2] += (run.r[2] - r[2]) * run.w;
        r[1] += ((((run.r[1] - r[1]) % 360) + 540) % 360 - 180) * run.w;
      }
      // struggle (or, waiting, breathing and looking about): a shake on everything, strongest in the trunk and the head
      const sd = 11 + k.length, tn = this.tn, w = (f, s) => noise1(tn * f, sd + s) * n;
      const hips = a.bones[0];
      hips.position.set(p[0] + w(5, 1) * 0.025, p[1] + w(6, 2) * 0.02, p[2] + w(5, 3) * 0.025);
      hips.quaternion.setFromEuler(new THREE.Euler((r[0] + w(4, 4) * 5) * D, (r[1] + w(3, 5) * 6) * D, (r[2] + w(4, 6) * 5) * D, 'YXZ'));
      const sx = (sp[0] + w(5, 7) * 8) * D, sy = (sp[1] + w(4, 8) * 10) * D, sz = (sp[2] + w(5, 9) * 6) * D;
      a.bones[1].rotation.set(sx * 0.5, sy * 0.5, sz * 0.5); a.bones[2].rotation.set(sx * 0.5, sy * 0.5, sz * 0.5);
      const look = this.state === 'wait' ? noise1(tn * 0.25, sd + 40) * 40 : 0;
      const hx = (hd[0] + w(7, 10) * 14) * D, hy = (hd[1] + look + w(6, 11) * 18) * D, hz = (hd[2] + w(6, 12) * 8) * D;
      a.bones[3].rotation.set(hx * 0.4, hy * 0.4, hz * 0.4); a.bones[4].rotation.set(hx * 0.6, hy * 0.6, hz * 0.6);
      a.fk();
      // arms: keyed (relaxed by the sides when not), or the run's
      for (const [side, L, sg] of [['aL', 'L', 1], ['aR', 'R', -1]]) {
        const kt = this.target(a, keys, side, t);
        const tg = a.point('chest', [sg * 0.3, -0.55, 0.05]);
        if (kt) tg.lerp(kt.pos, kt.w);
        if (run?.[side]) tg.lerp(run[side], run.w);
        tg.x += w(9, 20 + sg) * 0.05; tg.y += w(8, 22 + sg) * 0.05; tg.z += w(9, 24 + sg) * 0.05;
        a.ik('upperArm' + L, tg, a.point('chest', [sg * 0.55, -0.45, -0.7]), V(0, 0, -1));
      }
      // legs: keyed or the run's targets, else the feet stay planted and step when the body has moved on
      for (const [side, L, sg] of [['lL', 'L', 1], ['lR', 'R', -1]]) {
        let kt = this.target(a, keys, side, t);
        if (run?.[side]) kt = kt ? { pos: kt.pos.clone().lerp(run[side], run.w), w: kt.w + (1 - kt.w) * run.w } : { pos: run[side], w: run.w };
        if (run && !run[side]) kt = null;                     // (standing after a run: the feet find their own place)
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
}
