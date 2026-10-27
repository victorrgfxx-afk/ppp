import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEX } from './textures.js';
import { rng, damp } from './util.js';

// A small campfire you can light and put out (E): a ring of fire-blackened stones on the gravel, a burnt patch round
// it, a bed of ash, four split logs leaning together over two laid across, a log to sit on and a few split logs piled
// for later. Lit, it catches over a few seconds: flames licking up (two billboards turned to you, their fire drawn by
// noise in the shader, bright enough to bloom at night), sparks rising and drifting with the wind, smoke curling off,
// a warm flickering light on the gravel, the van and the trees, and its crackle. Put out, the flames die down, the
// embers glow on in the ash for a while and a thicker smoke rises, as from a fire one has just doused. Rain keeps it
// small. Seen from beyond ~250 m only the stones and the logs are left.

const FLAME_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FLAME_FS = /* glsl */`
uniform float uTime, uSeed, uSize, uBright, uLean;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  float h = vUv.y / max(uSize, 0.01);                       // height in the flame's own scale (0 base, 1 tip)
  if (h > 1.0) discard;
  float x = (vUv.x - 0.5) * 2.0 - uLean * h * h;            // (bent by the wind)
  float n = fbm(vec2(x * 2.3 + uSeed, h * 3.1 - uTime * 2.7));
  float n2 = fbm(vec2(x * 4.6 - uSeed * 1.7, h * 5.4 - uTime * 4.3));
  x += (n - 0.5) * 0.55 * h;                                // tongues licking up
  float w = (1.0 - h) * (0.75 + 0.25 * n) + 0.04;           // the half width: full at the base, to a point at the top
  float body = smoothstep(w, w * 0.3, abs(x)) * smoothstep(0.0, 0.07, h);
  float f = clamp(body * (0.5 + 0.95 * n2) - h * 0.45, 0.0, 1.0);
  vec3 c = mix(vec3(0.9, 0.16, 0.02), vec3(1.0, 0.5, 0.08), smoothstep(0.08, 0.45, f));
  c = mix(c, vec3(1.0, 0.86, 0.55), smoothstep(0.5, 0.95, f));
  float a = smoothstep(0.04, 0.3, f);
  gl_FragColor = vec4(c * uBright * a, a);
}`;

// a soft round puff (smoke) and a burnt patch fading out at its edge
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function scorchTextures(R) {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  const e = document.createElement('canvas'); e.width = e.height = n;
  const ge = e.getContext('2d'), em = ge.createImageData(n, n);
  const blobs = Array.from({ length: 26 }, () => [R() * n, R() * n, 6 + R() * 22]);
  const sparks = Array.from({ length: 140 }, () => { const a = R() * 6.283, r = Math.sqrt(R()) * 0.38 * n; return [n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r, 1 + R() * 2.5, 0.4 + R() * 0.6]; });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, r = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
    let b = 0; for (const [bx, by, br] of blobs) b += Math.max(0, 1 - Math.hypot(x - bx, y - by) / br) * 0.35;
    // the ash in the middle (light grey), the charcoal and the blackened gravel round it, fading out ragged
    const ash = Math.max(0, 1 - r / 0.42), soot = Math.min(1, Math.max(0, (1.05 - r - b * 0.25) / 0.45));
    const v = 18 + 70 * ash * (0.6 + 0.4 * Math.sin(x * 0.7) * Math.sin(y * 0.9)) + 10 * b;
    img.data[i] = v; img.data[i + 1] = v * 0.97; img.data[i + 2] = v * 0.94; img.data[i + 3] = 255 * Math.min(1, soot * 1.1);
    let k = 0; for (const [sx, sy, sr, sk] of sparks) { const d = Math.hypot(x - sx, y - sy); if (d < sr * 2) k += sk * Math.max(0, 1 - d / (sr * 2)); }
    k = Math.min(1, k) * Math.min(1, ash * 2.5);
    em.data[i] = 255 * k; em.data[i + 1] = 90 * k; em.data[i + 2] = 20 * k; em.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); ge.putImageData(em, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(e); emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

// a log along a -> b (world points), radius r, bark tinted col, charred towards `burnt` (0 at a .. 1 at b)
function logGeo(a, b, r, col, charA, charB, R) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r * (0.9 + 0.2 * R()), r, L, 8, 3);
  const pos = g.attributes.position, nrm = g.attributes.normal, cols = [];
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getY(i) / L + 0.5, cap = Math.abs(nrm.getY(i)) > 0.9;
    const ch = charA + (charB - charA) * v, k = 0.85 + 0.3 * R();
    // the bark (or the light split wood at the ends), blackened where the fire had it
    const base = cap ? [0.62, 0.46, 0.3] : col;
    cols.push(...base.map(c => c * k * (1 - 0.88 * ch) + 0.02 * ch));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

export class Campfire {
  // at: { x, z, y (the ground), seat: [x, z, yaw], wood: [x, z, yaw] }; ground(x, z): the height there
  constructor(scene, world, at, ground = () => at.y) {
    const { x, z, y } = at, R = rng(8461);
    this.x = x; this.z = z; this.y = y;
    this.lit = false; this.level = 0; this.glow = 0; this.smolder = 0; this.t = 0;
    const g = this.group = new THREE.Group();
    scene.add(g);
    // ---- the burnt patch, the ash and its embers
    const { map, emissiveMap } = scorchTextures(R);
    this.ashMat = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const ash = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40).rotateX(-Math.PI / 2), this.ashMat);
    ash.position.set(x, y + 0.012, z); ash.receiveShadow = true; ash.renderOrder = -1;
    g.add(ash);
    // ---- the stone ring: 12 stones, half sunk, sooted on the side facing the fire
    const stones = [];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + (R() - 0.5) * 0.25, rr = 0.5 + (R() - 0.5) * 0.06;
      const sg = new THREE.IcosahedronGeometry(1, 1), p = sg.attributes.position;
      const s = [0.1 + R() * 0.06, 0.07 + R() * 0.05, 0.09 + R() * 0.05];
      // (the bumps hashed from each corner's direction: the faces' shared corners move together, no cracks)
      const seed = R() * 100;
      for (let k = 0; k < p.count; k++) {
        const h = Math.sin(p.getX(k) * 12.9898 + p.getY(k) * 78.233 + p.getZ(k) * 37.719 + seed) * 43758.5453, f = 0.8 + 0.4 * (h - Math.floor(h));
        p.setXYZ(k, p.getX(k) * s[0] * f, p.getY(k) * s[1] * f, p.getZ(k) * s[2] * f);
      }
      sg.rotateY(R() * 6.283).rotateX((R() - 0.5) * 0.5);
      const sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr;
      sg.translate(sx, ground(sx, sz) + s[1] * 0.45, sz);
      const tone = 0.36 + R() * 0.16, warm = R() * 0.05, cols = [];
      for (let k = 0; k < p.count; k++) {
        const vx = p.getX(k) - x, vz = p.getZ(k) - z, inner = Math.max(0, 1 - (Math.hypot(vx, vz) - 0.38) / 0.16);
        const top = Math.max(0, (p.getY(k) - y) / 0.12), soot = Math.min(1, inner * 0.85 + top * 0.25 * inner);
        const c = tone * (0.92 + 0.16 * R()) * (1 - 0.82 * soot);
        cols.push(c + warm, c, c - warm * 0.5);
      }
      sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      stones.push(sg.toNonIndexed());
    }
    const stoneMesh = new THREE.Mesh(mergeGeometries(stones), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    stoneMesh.castShadow = stoneMesh.receiveShadow = true;
    g.add(stoneMesh);
    // ---- the wood: four split logs leaning together over two laid across, blackened at their tops; the seat; the pile
    const V = (a, b, c) => new THREE.Vector3(a, b, c), logs = [], bark = [0.36, 0.25, 0.16];
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI / 2 + 0.4 + R() * 0.3, c = Math.cos(a), s = Math.sin(a);
      logs.push(logGeo(V(x - c * 0.3, y + 0.05 + i * 0.07, z - s * 0.3), V(x + c * 0.3, y + 0.06 + i * 0.07, z + s * 0.3), 0.045, bark, 0.8, 0.8, R));
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.2 + R() * 0.4, c = Math.cos(a), s = Math.sin(a);
      logs.push(logGeo(V(x + c * 0.32, y + 0.03, z + s * 0.32), V(x + c * 0.04, y + 0.42 + R() * 0.06, z + s * 0.04), 0.04 + R() * 0.015, bark, 0.25, 0.95, R));
    }
    const [sx, sz, sy] = at.seat, sc = Math.cos(sy), ss = Math.sin(sy), sh = ground(sx, sz) + 0.16;
    logs.push(logGeo(V(sx - sc * 0.85, sh, sz - ss * 0.85), V(sx + sc * 0.85, sh + 0.02, sz + ss * 0.85), 0.17, [0.3, 0.22, 0.15], 0, 0, R));
    const [wx, wz, wy] = at.wood, wc = Math.cos(wy), ws = Math.sin(wy), wh = ground(wx, wz);
    for (let row = 0; row < 2; row++) for (let k = 0; k < 3 - row; k++) {
      const o = (k - (2 - row) / 2) * 0.13, px = wx - ws * o, pz = wz + wc * o, py = wh + 0.055 + row * 0.1;
      logs.push(logGeo(V(px - wc * 0.3, py, pz - ws * 0.3), V(px + wc * 0.3, py, pz + ws * 0.3), 0.05 + R() * 0.012, bark, 0, 0, R));
    }
    const logMesh = new THREE.Mesh(mergeGeometries(logs.map(l => l.toNonIndexed())), new THREE.MeshStandardMaterial({ map: TEX.bark, normalMap: TEX.barkN, roughness: 0.95, vertexColors: true }));
    logMesh.castShadow = logMesh.receiveShadow = true;
    g.add(logMesh);
    // you don't walk into the fire (the seat and the pile are low enough to step over)
    world.addStatic(new world.Box(x, z, 0.5, 0.5, 0, y - 1, y + 0.9, 'campfire'));
    // ---- the flames: an outer body and a brighter core, turned to you about the vertical
    const flameGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.flames = [[0.85, 1.05, 2.2, 1.3], [0.5, 0.78, 3.4, 7.1]].map(([w, h, bright, seed]) => {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uSize: { value: 0 }, uBright: { value: bright }, uLean: { value: 0 } },
        vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(flameGeo, m);
      mesh.scale.set(w, h, 1); mesh.position.set(x, y + 0.04, z); mesh.renderOrder = 3; mesh.visible = false;
      mesh.userData.noAO = true; mesh.userData.bright = bright;
      g.add(mesh);
      return mesh;
    });
    // ---- the sparks: points rising from the fire, cooling from yellow to dull red as they go
    const NS = this.NS = 48;
    this.sp = Array.from({ length: NS }, () => ({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 1 }));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NS * 3), 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(NS * 3), 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.03, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false; this.sparks.visible = false; this.sparks.userData.noAO = true;
    g.add(this.sparks);
    // ---- the smoke: soft puffs that rise, widen and thin out
    const puff = puffTexture();
    this.smoke = Array.from({ length: 12 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0x8a8884, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; s.userData = { age: 1, life: 1, vx: 0, vz: 0, s0: 0.4, s1: 2, a: 0.3, rot: 0, g: 0.55 };
      g.add(s);
      return s;
    });
    this.nextPuff = 0;
    // ---- its light: warm, flickering, a little above the logs (no shadows: one more shadow map is not worth it)
    this.light = new THREE.PointLight(0xff8a3c, 0, 18, 2);
    this.light.position.set(x, y + 0.5, z);
    g.add(this.light);
  }
  near(px, pz) { return Math.hypot(px - this.x, pz - this.z) < 2.0; }
  set(on) { this.lit = !!on; if (!on && this.level > 0.2) this.smolder = 1; }
  // how loud its crackle is from p (0..1)
  audible(p) { const d = Math.hypot(p.x - this.x, p.z - this.z); return this.level * Math.min(1, 2.5 / Math.max(d, 1)) * (d < 40 ? 1 : 0); }
  // env: { night 0..1, rain 0..1, wind THREE.Vector2 (m/s, x z) }
  update(dt, cam, env = {}) {
    const d = Math.hypot(cam.x - this.x, cam.z - this.z), seen = d < 250;
    this.t += dt;
    // it catches over a few seconds and dies down in a few; rain keeps it small
    const rain = env.rain ?? 0, target = this.lit ? 1 - 0.45 * rain : 0;
    this.level = damp(this.level, target, this.lit ? 0.7 : 1.1, dt);
    if (this.level < 0.003 && !this.lit) this.level = 0;
    this.glow = damp(this.glow, this.lit ? 1 : 0, this.lit ? 0.5 : 0.05, dt);         // (the embers glow on for a minute)
    this.smolder = Math.max(0, this.smolder - dt / 14);
    const L = this.level, night = env.night ?? 0;
    // the flicker: two noises, slow and quick
    const fl = 0.78 + 0.16 * Math.sin(this.t * 7.3 + Math.sin(this.t * 2.1) * 2) + 0.09 * Math.sin(this.t * 17.9 + 1.3) + 0.05 * Math.sin(this.t * 31.7);
    // (by day the fire's light hardly shows against the sun; at night it lights the clearing: ~10 cd, like the torch's
    // pool on the ground at 2 m, scaled with the night's exposure)
    this.light.intensity = seen ? 10 * L * fl * (0.06 + 0.94 * night) : 0;
    this.light.position.set(this.x + 0.04 * Math.sin(this.t * 5.1), this.y + 0.45 + 0.05 * Math.sin(this.t * 6.7), this.z + 0.04 * Math.cos(this.t * 4.3));
    this.ashMat.emissiveIntensity = seen ? (0.9 + 0.6 * fl) * Math.max(this.glow * 0.8, L) * (0.5 + 0.5 * night) : 0;
    const wind = env.wind ?? null, wx = wind ? wind.x : 0, wz = wind ? wind.y : 0;
    // the flames turned to you
    const yaw = Math.atan2(cam.x - this.x, cam.z - this.z), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const [i, f] of this.flames.entries()) {
      f.visible = seen && L > 0.01;
      if (!f.visible) continue;
      f.rotation.y = yaw;
      const u = f.material.uniforms;
      u.uTime.value = this.t * (1 + i * 0.15);
      u.uSize.value = Math.min(1, L * (0.92 + 0.08 * fl)) * (i ? 0.95 : 1);
      u.uLean.value = Math.max(-0.6, Math.min(0.6, (wx * rx + wz * rz) * 0.08));
      u.uBright.value = f.userData.bright * (0.85 + 0.25 * fl);
    }
    // the sparks
    const sp = this.sp, pos = this.sparks.geometry.attributes.position, col = this.sparks.geometry.attributes.color;
    this.sparks.visible = seen && (L > 0.05 || sp.some(s => s.age < s.life));
    if (this.sparks.visible) {
      for (let i = 0; i < this.NS; i++) {
        const s = sp[i];
        s.age += dt;
        if (s.age >= s.life && L > 0.3 && Math.random() < dt * 9 * L) {
          const a = Math.random() * 6.283, r = Math.random() * 0.18;
          Object.assign(s, { x: this.x + Math.cos(a) * r, y: this.y + 0.25 + Math.random() * 0.25, z: this.z + Math.sin(a) * r,
            vx: (Math.random() - 0.5) * 0.5, vy: 0.9 + Math.random() * 1.4, vz: (Math.random() - 0.5) * 0.5, life: 0.7 + Math.random() * 1.6, age: 0 });
        }
        const k = s.age < s.life ? 1 - s.age / s.life : 0;
        if (k > 0) {
          s.vx += ((wx - s.vx) * 0.6 + (Math.random() - 0.5) * 3) * dt; s.vz += ((wz - s.vz) * 0.6 + (Math.random() - 0.5) * 3) * dt;
          s.vy -= 0.25 * dt;
          s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        }
        pos.setXYZ(i, s.x, k > 0 ? s.y : -999, s.z);
        col.setXYZ(i, 3.2 * k, (0.4 + 1.1 * k) * k, 0.25 * k * k);
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    }
    // the smoke: thin and grey from the fire, thicker and whiter for a while after it is put out
    const puffRate = seen ? L * 1.6 + this.smolder * 2.4 : 0;
    this.nextPuff -= dt * puffRate;
    for (const s of this.smoke) {
      const u = s.userData;
      if (this.nextPuff <= 0 && u.age >= u.life) {
        this.nextPuff += 1;
        const white = this.smolder > L ? 1 : 0;
        Object.assign(u, { age: 0, life: 4.5 + Math.random() * 3, vx: (Math.random() - 0.5) * 0.12, vz: (Math.random() - 0.5) * 0.12, s0: 0.35 + Math.random() * 0.2, s1: 1.8 + Math.random() * 1.2,
          a: 0.16 + 0.22 * Math.max(L * 0.6, this.smolder) + 0.06 * white, rot: (Math.random() - 0.5) * 0.6 });
        s.position.set(this.x + (Math.random() - 0.5) * 0.15, this.y + 0.55, this.z + (Math.random() - 0.5) * 0.15);
        u.g = white ? 0.78 : 0.55;
        s.material.rotation = Math.random() * 6.283;
      }
      u.age += dt;
      const k = u.age / u.life;
      s.visible = seen && k < 1;
      if (!s.visible) continue;
      u.vx += (wx * 0.35 - u.vx) * 0.5 * dt; u.vz += (wz * 0.35 - u.vz) * 0.5 * dt;
      s.position.x += u.vx * dt; s.position.z += u.vz * dt; s.position.y += (0.55 - 0.25 * k) * dt;
      const sc = u.s0 + (u.s1 - u.s0) * Math.sqrt(k);
      s.scale.set(sc, sc, 1);
      s.material.rotation += u.rot * dt;
      // (darker at night, lit warm from below by the fire)
      const dim = 0.35 + 0.65 * (1 - night * 0.8), glowC = night * L * (1 - k) * 0.6;
      s.material.color.setRGB((u.g + glowC * 0.5) * dim, (u.g + glowC * 0.2) * dim, u.g * dim);
      s.material.opacity = u.a * Math.min(1, k * 6) * (1 - k);
    }
  }
}
