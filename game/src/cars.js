import * as THREE from 'three';
import { TEX } from './textures.js';
import { M } from './materials.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batcher } from './util.js';

// Parametric car bodies lofted from side/top profiles of the real models in the photos.
// Local frame: forward = -Z, right = +X, origin on the ground under the middle of the car.

const P = (arr) => arr; // [s, value]
export const MODELS = {
  // BMW 3 Series E90 sedan (black, photos 1-4)
  bmw: {
    name: 'BMW Seria 3 (E90)', L: 4.52, W: 1.82, axles: [0.80, 3.56], r: 0.315, tireW: 0.205, wheelTex: 'wheelBMW',
    belt: P([[0, 0.56], [0.04, 0.66], [0.12, 0.75], [0.35, 0.8], [0.8, 0.845], [1.3, 0.885], [1.62, 0.92], [3.95, 0.99], [4.1, 1.0], [4.35, 0.99], [4.47, 0.93], [4.52, 0.8]]),
    roof: P([[1.62, 0.92], [1.9, 1.12], [2.15, 1.29], [2.35, 1.38], [2.7, 1.42], [3.0, 1.41], [3.25, 1.36], [3.5, 1.22], [3.75, 1.07], [3.95, 0.99]]),
    bottom: P([[0, 0.36], [0.1, 0.26], [0.35, 0.18], [4.15, 0.2], [4.38, 0.3], [4.52, 0.4]]),
    hwr: 0.66, wind: [1.66, 2.34], rear: [3.3, 3.93], side: [1.72, 3.6], pillars: [2.62, 3.52], interior: 0x9c8e76,
    lights: { head: [0.1, 0.7, 0.62, 0.42, 0.11], tail: [4.47, 0.88, 0.62, 0.36, 0.13] }, grille: 'kidney',
  },
  // Opel Corsa C 5-door (silver, "PH 13 KLI")
  corsa: {
    name: 'Opel Corsa C', L: 3.82, W: 1.65, axles: [0.72, 3.21], r: 0.29, tireW: 0.185, wheelTex: 'wheelOpel',
    belt: P([[0, 0.55], [0.05, 0.66], [0.15, 0.73], [0.5, 0.81], [0.9, 0.875], [1.05, 0.9], [3.7, 0.98], [3.78, 0.95], [3.82, 0.78]]),
    roof: P([[1.05, 0.9], [1.3, 1.1], [1.55, 1.28], [1.8, 1.4], [2.3, 1.445], [2.9, 1.43], [3.35, 1.39], [3.55, 1.3], [3.66, 1.12], [3.72, 0.98]]),
    bottom: P([[0, 0.36], [0.12, 0.24], [0.35, 0.18], [3.5, 0.2], [3.7, 0.3], [3.82, 0.4]]),
    hwr: 0.6, wind: [1.08, 1.78], rear: [3.36, 3.7], side: [1.14, 3.4], pillars: [2.25, 3.08], interior: 0x3a3b3e,
    lights: { head: [0.1, 0.72, 0.56, 0.36, 0.12], tail: [3.77, 0.95, 0.62, 0.14, 0.3] }, grille: 'opel',
  },
  // Peugeot 508 sedan (gray, "PH 77 XXS", photos 6-8)
  p508: {
    name: 'Peugeot 508', L: 4.79, W: 1.83, axles: [0.93, 3.75], r: 0.33, tireW: 0.215, wheelTex: 'wheel508',
    belt: P([[0, 0.58], [0.05, 0.68], [0.15, 0.75], [0.5, 0.81], [1.0, 0.86], [1.65, 0.93], [4.2, 1.01], [4.45, 1.02], [4.66, 0.99], [4.75, 0.93], [4.79, 0.8]]),
    roof: P([[1.65, 0.93], [1.95, 1.13], [2.25, 1.32], [2.5, 1.43], [2.9, 1.46], [3.3, 1.45], [3.6, 1.38], [3.9, 1.2], [4.2, 1.01]]),
    bottom: P([[0, 0.36], [0.12, 0.25], [0.4, 0.18], [4.4, 0.2], [4.62, 0.31], [4.79, 0.41]]),
    hwr: 0.66, wind: [1.69, 2.47], rear: [3.56, 4.18], side: [1.76, 3.84], pillars: [2.8, 3.7], interior: 0x2a2a2c,
    lights: { head: [0.1, 0.73, 0.63, 0.44, 0.1], tail: [4.75, 0.95, 0.6, 0.36, 0.13] }, grille: 'plain',
  },
  // Dark compact SUV (behind the Opel in photo 1)
  suv: {
    name: 'SUV', L: 4.5, W: 1.86, axles: [0.9, 3.54], r: 0.36, tireW: 0.235, wheelTex: 'wheelSUV',
    belt: P([[0, 0.72], [0.06, 0.86], [0.2, 0.95], [0.6, 1.02], [1.1, 1.06], [1.35, 1.08], [4.3, 1.14], [4.45, 1.12], [4.5, 1.0]]),
    roof: P([[1.35, 1.08], [1.6, 1.3], [1.85, 1.48], [2.1, 1.61], [2.6, 1.66], [3.6, 1.64], [4.1, 1.58], [4.3, 1.46], [4.4, 1.25], [4.45, 1.12]]),
    bottom: P([[0, 0.48], [0.12, 0.34], [0.4, 0.25], [4.1, 0.26], [4.35, 0.38], [4.5, 0.5]]),
    hwr: 0.74, wind: [1.38, 2.08], rear: [4.12, 4.42], side: [1.45, 4.12], pillars: [2.62, 3.62], interior: 0x2c2c2e,
    lights: { head: [0.07, 0.9, 0.66, 0.4, 0.09], tail: [4.47, 1.08, 0.72, 0.34, 0.1] }, grille: 'suv',
  },
  // Generic sedan (Dacia Logan-like)
  sedan: {
    name: 'Dacia Logan', L: 4.29, W: 1.74, axles: [0.82, 3.45], r: 0.3, tireW: 0.185, wheelTex: 'wheelGen',
    belt: P([[0, 0.6], [0.05, 0.7], [0.15, 0.78], [0.5, 0.84], [1.0, 0.89], [1.45, 0.93], [3.75, 1.0], [3.9, 1.02], [4.15, 1.0], [4.25, 0.94], [4.29, 0.8]]),
    roof: P([[1.45, 0.93], [1.7, 1.15], [1.95, 1.36], [2.2, 1.48], [2.6, 1.52], [3.0, 1.5], [3.25, 1.42], [3.5, 1.24], [3.75, 1.0]]),
    bottom: P([[0, 0.36], [0.12, 0.25], [0.35, 0.19], [4.0, 0.21], [4.2, 0.31], [4.29, 0.4]]),
    hwr: 0.64, wind: [1.5, 2.2], rear: [3.28, 3.72], side: [1.56, 3.4], pillars: [2.5, 3.3], interior: 0x333336,
    lights: { head: [0.08, 0.74, 0.6, 0.34, 0.12], tail: [4.26, 0.9, 0.6, 0.3, 0.13] }, grille: 'plain',
  },
  // Generic hatchback (Dacia Sandero-like)
  hatch: {
    name: 'Dacia Sandero', L: 4.07, W: 1.73, axles: [0.8, 3.39], r: 0.31, tireW: 0.195, wheelTex: 'wheelGen',
    belt: P([[0, 0.6], [0.05, 0.71], [0.15, 0.79], [0.5, 0.86], [0.95, 0.92], [1.15, 0.95], [3.95, 1.03], [4.02, 1.0], [4.07, 0.82]]),
    roof: P([[1.15, 0.95], [1.4, 1.16], [1.65, 1.36], [1.9, 1.49], [2.4, 1.53], [3.2, 1.51], [3.65, 1.46], [3.85, 1.34], [3.95, 1.12], [3.98, 1.03]]),
    bottom: P([[0, 0.37], [0.12, 0.25], [0.35, 0.2], [3.8, 0.22], [3.97, 0.33], [4.07, 0.42]]),
    hwr: 0.63, wind: [1.18, 1.88], rear: [3.66, 3.97], side: [1.24, 3.65], pillars: [2.4, 3.3], interior: 0x303033,
    lights: { head: [0.08, 0.76, 0.6, 0.36, 0.12], tail: [4.03, 1.0, 0.64, 0.12, 0.28] }, grille: 'plain',
  },
};

function interp(arr, s) {
  if (s <= arr[0][0]) return arr[0][1];
  for (let i = 1; i < arr.length; i++) {
    if (s <= arr[i][0]) {
      const [s0, v0] = arr[i - 1], [s1, v1] = arr[i];
      const t = (s - s0) / (s1 - s0);
      const k = t * t * (3 - 2 * t) * 0.5 + t * 0.5;   // slightly eased
      return v0 + (v1 - v0) * k;
    }
  }
  return arr[arr.length - 1][1];
}

export function profileAt(m, s) {
  const belt = interp(m.belt, s);
  const inCab = s > m.roof[0][0] && s < m.roof[m.roof.length - 1][0];
  const roof = inCab ? Math.max(belt, interp(m.roof, s)) : belt;
  let yb = interp(m.bottom, s);
  for (const a of m.axles) {
    const R = m.r + 0.055;
    const d = s - a;
    if (Math.abs(d) < R) yb = Math.max(yb, m.r + Math.sqrt(R * R - d * d) * 0.97);
  }
  const d = Math.min(s, m.L - s);
  const f = 0.74 + 0.26 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - Math.min(d / 0.55, 1), 2)));
  const hw = m.W / 2 * f;
  return { belt, roof, yb, hw, cab: Math.min(1, (roof - belt) / 0.25) };
}

function section(m, s) {
  const { belt, roof, yb, hw, cab } = profileAt(m, s);
  const hwr = Math.min(m.hwr, hw * 0.9);
  const mid = (yb + belt) / 2;
  const R = [
    [0, yb], [hw * 0.86, yb], [hw * 0.985, yb + 0.07], [hw * 1.0, mid], [hw * 0.985, belt - 0.05], [hw * 0.93, belt],
  ];
  // cabin (blend with a flat hood/trunk top when cab -> 0)
  const lerp = (a, b, t) => a + (b - a) * t;
  const wb = hw * 0.9;
  R.push([lerp(hw * 0.8, wb, cab), belt + lerp(0.018, 0.035, cab)]);
  R.push([lerp(hw * 0.52, hwr * 1.02, cab), lerp(belt + 0.034, roof - 0.07, cab)]);
  R.push([lerp(hw * 0.25, hwr * 0.84, cab), lerp(belt + 0.042, roof - 0.005, cab)]);
  R.push([0, lerp(belt + 0.046, roof + 0.012, cab)]);
  return R;
}

function carBodyGeometry(m) {
  const stations = [];
  for (let s = 0; s <= m.L + 1e-6; s += (s < 0.4 || s > m.L - 0.4) ? 0.035 : 0.06) stations.push(Math.min(s, m.L));
  if (stations[stations.length - 1] < m.L) stations.push(m.L);
  const ring = 10 + 8;
  const pos = [], uvs = [];
  for (const s of stations) {
    const R = section(m, s);
    const z = s - m.L / 2;
    const full = [...R, ...R.slice(1, 9).reverse().map(([x, y]) => [-x, y])];
    for (const [x, y] of full) { pos.push(x, y, z); uvs.push(s / m.L, y); }
  }
  const groups = { body: [], glass: [], trim: [], under: [] };
  const inR = (s, r) => s >= r[0] && s <= r[1];
  for (let j = 0; j < stations.length - 1; j++) {
    const s = (stations[j] + stations[j + 1]) / 2;
    const p = profileAt(m, s);
    for (let i = 0; i < ring; i++) {
      const i2 = (i + 1) % ring;
      const a = j * ring + i, b = j * ring + i2, c = (j + 1) * ring + i, d = (j + 1) * ring + i2;
      // segment id relative to the right half (mirror left)
      const seg = i < 9 ? i : ring - 1 - i;          // 0..8
      let g = 'body';
      if (seg === 0) g = 'under';
      else if ((seg === 6) && p.cab > 0.5) {
        g = inR(s, m.side) ? 'glass' : 'trim';
        for (const pl of m.pillars) if (Math.abs(s - pl) < 0.055) g = 'trim';
      } else if (seg === 8 && p.cab > 0.3) {
        if (inR(s, m.wind) || inR(s, m.rear)) g = 'glass';      // seg 7 stays body => A/C pillars
      } else if (seg === 5 && p.cab > 0.5 && inR(s, m.side)) g = 'trim';   // window seal line
      groups[g].push(a, b, c, b, d, c);
    }
  }
  const idx = [...groups.body, ...groups.glass, ...groups.trim, ...groups.under];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  let o = 0;
  g.addGroup(o, groups.body.length, 0); o += groups.body.length;
  g.addGroup(o, groups.glass.length, 1); o += groups.glass.length;
  g.addGroup(o, groups.trim.length, 2); o += groups.trim.length;
  g.addGroup(o, groups.under.length, 3);
  g.computeVertexNormals();

  // end caps (flat normals, separate vertices)
  const caps = [];
  for (const [j, front] of [[0, true], [stations.length - 1, false]]) {
    const R = section(m, stations[j]);
    const z = stations[j] - m.L / 2;
    const full = [...R, ...R.slice(1, 9).reverse().map(([x, y]) => [-x, y])];
    const cy = full.reduce((a, p) => a + p[1], 0) / full.length;
    for (let i = 0; i < full.length; i++) {
      const p0 = full[i], p1 = full[(i + 1) % full.length];
      if (front) caps.push(0, cy, z, p1[0], p1[1], z, p0[0], p0[1], z);
      else caps.push(0, cy, z, p0[0], p0[1], z, p1[0], p1[1], z);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(caps, 3));
  cg.computeVertexNormals();
  return { body: g, caps: cg };
}

function roundedRectGeo(w, h, r, depth) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

const shared = {};
function sharedMats() {
  if (shared.ready) return shared;
  shared.glass = new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.86, envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide, depthWrite: false });
  shared.trim = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.35, metalness: 0.2 });
  shared.under = new THREE.MeshStandardMaterial({ color: 0x151516, roughness: 0.95 });
  shared.tire = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.88 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: 0xdadde0, roughness: 0.12, metalness: 1.0 });
  shared.headGlass = new THREE.MeshPhysicalMaterial({ color: 0xcfd6dc, roughness: 0.05, metalness: 0.6, clearcoat: 1, emissive: 0xfff6e0, emissiveIntensity: 0.0 });
  shared.plastic = new THREE.MeshStandardMaterial({ color: 0x19191a, roughness: 0.55 });
  shared.ready = true;
  return shared;
}

export function paintMaterial(color, { metallic = 0.6, rough = 0.32, dusty = 0 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color, metalness: metallic, roughness: rough + dusty * 0.35,
    clearcoat: 1 - dusty * 0.5, clearcoatRoughness: 0.04 + dusty * 0.35,
    envMapIntensity: 1.1,
  });
  if (dusty > 0) { m.roughnessMap = TEX.stucco; }
  return m;
}

export function buildCar(modelKey, paint, plateKey) {
  const m = MODELS[modelKey];
  const S = sharedMats();
  const group = new THREE.Group();
  const bodyPivot = new THREE.Group();      // for pitch/roll
  group.add(bodyPivot);
  const raw = carBodyGeometry(m);
  const body = toCreasedNormals(raw.body, 0.55), caps = raw.caps;
  const glass = S.glass.clone();
  const bodyMesh = new THREE.Mesh(body, [paint, glass, S.trim, S.under]);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  bodyPivot.add(bodyMesh);
  const capMesh = new THREE.Mesh(caps, paint);
  capMesh.castShadow = true; capMesh.receiveShadow = true;
  bodyPivot.add(capMesh);

  const zAt = (s) => s - m.L / 2;
  // static detail parts are merged per material (few draw calls per car)
  const parts = new Batcher();
  const e = new THREE.Euler();
  const add = (geo, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(e.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    parts.add(material, geo, mtx);
    return null;
  };

  // find where the body surface is for a point (x,y), marching from the front or rear
  const surfaceS = (x, y, fromFront) => {
    for (let k = 0; k <= 80; k++) {
      const s = fromFront ? k * 0.01 : m.L - k * 0.01;
      const p = profileAt(m, s);
      if (y > p.yb && y < p.belt + 0.02 && Math.abs(x) < p.hw * 0.97) return s;
    }
    return fromFront ? 0.1 : m.L - 0.1;
  };
  const headMat = S.headGlass.clone();
  const [, hy, hx, hw, hh] = m.lights.head;
  const headL = [], tailL = [];
  for (const sg of [-1, 1]) {
    const s0 = surfaceS(sg * hx, hy + hh * 0.3, true);
    const p = profileAt(m, s0 + 0.05);
    const x = sg * Math.min(hx, p.hw - hw / 2 - 0.03);
    headL.push(add(roundedRectGeo(hw, hh, 0.03, 0.12), headMat, x, hy, zAt(s0) + 0.035, -0.35, sg * 0.25, 0));
  }
  const tailMat = new THREE.MeshPhysicalMaterial({ color: 0x7a0a0a, roughness: 0.15, clearcoat: 1, emissive: 0xff1a10, emissiveIntensity: 0.15 });
  const [, ty, tx, tw, th] = m.lights.tail;
  for (const sg of [-1, 1]) {
    const s0 = surfaceS(sg * tx, ty, false);
    const p = profileAt(m, s0 - 0.05);
    const x = sg * Math.min(tx, p.hw - tw / 2 - 0.02);
    tailL.push(add(roundedRectGeo(tw, th, 0.03, 0.1), tailMat, x, ty, zAt(s0) - 0.03, 0.1, -sg * 0.25, 0));
  }
  // grille
  const sg0 = surfaceS(0, m.lights.head[1], true);
  if (m.grille === 'kidney') {
    for (const sg of [-1, 1]) add(roundedRectGeo(0.17, 0.12, 0.04, 0.08), S.chrome, sg * 0.11, 0.66, zAt(surfaceS(0.11, 0.66, true)) + 0.02, -0.3, 0, 0);
    for (const sg of [-1, 1]) add(roundedRectGeo(0.14, 0.09, 0.035, 0.08), S.trim, sg * 0.11, 0.66, zAt(surfaceS(0.11, 0.66, true)) + 0.008, -0.3, 0, 0);
    add(roundedRectGeo(0.9, 0.12, 0.05, 0.06), S.trim, 0, 0.36, zAt(surfaceS(0.4, 0.36, true)) + 0.01);
  } else {
    add(roundedRectGeo(m.W * 0.42, 0.13, 0.05, 0.08), S.trim, 0, m.lights.head[1] - 0.04, zAt(sg0) + 0.02, -0.3, 0, 0);
    add(roundedRectGeo(m.W * 0.5, 0.12, 0.05, 0.06), S.trim, 0, 0.38, zAt(surfaceS(0.4, 0.38, true)) + 0.01);
    if (m.grille === 'opel') add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), S.chrome, 0, m.lights.head[1] - 0.04, zAt(sg0) - 0.005, Math.PI / 2, 0, 0);
  }
  // plates
  const plateMat = new THREE.MeshStandardMaterial({ map: TEX[plateKey] ?? TEX.plateA, roughness: 0.4 });
  const pg = new THREE.PlaneGeometry(0.52, 0.112);
  add(pg, plateMat, 0, 0.42, zAt(0) - 0.012, 0, Math.PI, 0);
  add(pg, plateMat, 0, m.belt[m.belt.length - 1][1] - 0.05, zAt(m.L) + 0.012);
  // mirrors
  for (const sg of [-1, 1]) {
    const s = m.wind[0] + 0.12;
    const p = profileAt(m, s);
    add(roundedRectGeo(0.2, 0.12, 0.04, 0.08), paint, sg * (p.hw + 0.07), p.belt + 0.07, zAt(s), 0, Math.PI / 2, 0);
    add(new THREE.BoxGeometry(0.08, 0.04, 0.05), S.trim, sg * (p.hw - 0.01), p.belt + 0.04, zAt(s));
  }
  // door handles
  for (const sg of [-1, 1]) for (const s of [m.pillars[0] - 0.2, m.pillars[1] - 0.25]) {
    const p = profileAt(m, s);
    add(new THREE.BoxGeometry(0.02, 0.025, 0.13), paint, sg * (p.hw * 0.99 + 0.005), p.belt - 0.08, zAt(s));
  }
  // door shut lines
  const seamMat = S.trim;
  for (const sg of [-1, 1]) for (const s of [m.wind[0] + 0.12, m.pillars[0] + 0.03, m.pillars[1] - 0.02]) {
    const p = profileAt(m, s);
    const y0 = Math.max(p.yb + 0.06, profileAt(m, s - 0.1).yb + 0.06, profileAt(m, s + 0.1).yb + 0.06), y1 = p.belt - 0.015;
    if (y1 - y0 < 0.1) continue;
    add(new THREE.BoxGeometry(0.006, y1 - y0, 0.006), seamMat, sg * (p.hw + 0.001), (y0 + y1) / 2, zAt(s));
  }
  // exhaust
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.15, 10), S.chrome, -0.5, 0.26, zAt(m.L) + 0.02, Math.PI / 2, 0, 0);

  // simple interior (visible through the glass)
  const seatMat = new THREE.MeshStandardMaterial({ color: m.interior, roughness: 0.8 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.7 });
  const pm = profileAt(m, (m.wind[1] + m.pillars[0]) / 2);
  const seatY = pm.belt - 0.35;
  for (const sg of [-1, 1]) {
    add(new THREE.BoxGeometry(0.5, 0.14, 0.5), seatMat, sg * 0.38, seatY, zAt(m.pillars[0] + 0.1));
    add(new THREE.BoxGeometry(0.48, 0.62, 0.12), seatMat, sg * 0.38, seatY + 0.36, zAt(m.pillars[0] + 0.35), -0.2, 0, 0);
  }
  add(new THREE.BoxGeometry(1.3, 0.14, 0.5), seatMat, 0, seatY, zAt(m.pillars[1] - 0.25));
  add(new THREE.BoxGeometry(1.3, 0.58, 0.12), seatMat, 0, seatY + 0.34, zAt(m.pillars[1] - 0.02), -0.25, 0, 0);
  const pw = profileAt(m, m.wind[0] + 0.2);
  add(new THREE.BoxGeometry(m.W - 0.25, 0.2, 0.55), dashMat, 0, pw.belt - 0.1, zAt(m.wind[0] + 0.28));
  // headliner + door cards so the cockpit view is enclosed
  const pr = profileAt(m, (m.wind[1] + m.rear[0]) / 2);
  const cabL = m.rear[0] - m.wind[1] + 0.3;
  const liner = new THREE.MeshStandardMaterial({ color: m.interior === 0x9c8e76 ? 0xb9ad98 : 0x5a5a5c, roughness: 0.95, side: THREE.DoubleSide });
  add(new THREE.BoxGeometry(m.hwr * 2 - 0.1, 0.02, cabL), liner, 0, pr.roof - 0.07, zAt((m.wind[1] + m.rear[0]) / 2));
  for (const sg of [-1, 1]) add(new THREE.BoxGeometry(0.04, pr.belt - 0.25, m.rear[0] - m.wind[0]), dashMat, sg * (m.W / 2 - 0.1), (pr.belt + 0.25) / 2, zAt((m.wind[0] + m.rear[0]) / 2));
  const steer = new THREE.Group();
  steer.position.set(-0.38, pw.belt - 0.06, zAt(m.wind[0] + 0.6));
  steer.rotation.x = -1.1;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 24), dashMat);
  steer.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), dashMat);
  hub.rotation.x = Math.PI / 2; steer.add(hub);
  for (const a of [0, 2.1, 4.2]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.015), dashMat); sp.rotation.z = a; sp.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0); steer.add(sp); }
  bodyPivot.add(steer);

  // wheels
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(m.r, m.r, m.tireW, 28, 1);
  tireGeo.rotateZ(Math.PI / 2);
  // rounded sidewall bulge
  const tp = tireGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
    const rr = Math.hypot(y, z);
    if (rr > m.r * 0.99) { const k = 1 - 0.035 * Math.pow(Math.abs(x) / (m.tireW / 2), 4); tp.setY(i, y * k); tp.setZ(i, z * k); }
  }
  tireGeo.computeVertexNormals();
  const rimMat = new THREE.MeshStandardMaterial({ map: TEX[m.wheelTex], roughness: 0.3, metalness: 0.8, alphaTest: 0 });
  const rimGeo = new THREE.CircleGeometry(m.r * 0.72, 28);
  const arch = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.9, side: THREE.DoubleSide });
  for (const [ai, a] of m.axles.entries()) {
    for (const sg of [-1, 1]) {
      const pivot = new THREE.Group();
      const p = profileAt(m, a);
      const x = sg * (m.W / 2 - m.tireW / 2 - 0.005);
      pivot.position.set(x, m.r, zAt(a));
      const spin = new THREE.Group();
      pivot.add(spin);
      const tire = new THREE.Mesh(tireGeo, S.tire); tire.castShadow = true; spin.add(tire);
      const rimM = new THREE.Mesh(rimGeo, rimMat);
      rimM.position.x = sg * (m.tireW / 2 + 0.002);
      rimM.rotation.y = sg * Math.PI / 2;
      spin.add(rimM);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(m.r * 0.72, 20), S.under);
      inner.position.x = -sg * (m.tireW / 2 + 0.002); inner.rotation.y = -sg * Math.PI / 2;
      spin.add(inner);
      group.add(pivot);
      // dark wheel-well liner
      const well = new THREE.Mesh(new THREE.CylinderGeometry(m.r + 0.06, m.r + 0.06, m.tireW + 0.1, 18, 1, true, -Math.PI / 2, Math.PI), arch);
      well.rotation.z = Math.PI / 2;
      well.position.set(x, m.r, zAt(a));
      bodyPivot.add(well);
      wheels.push({ pivot, spin, front: ai === 0, side: sg, x, z: zAt(a) });
      void p;
    }
  }
  parts.build(bodyPivot);

  // soft contact shadow (grounds the car like ambient occlusion)
  if (!shared.blob) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(64, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
      const dx = Math.max(0, Math.abs(x - 31.5) / 32 - 0.55) / 0.45, dy = Math.max(0, Math.abs(y - 63.5) / 64 - 0.7) / 0.3;
      const d = Math.min(1, Math.hypot(dx, dy));
      img.data[(y * 64 + x) * 4 + 3] = Math.pow(1 - d, 1.6) * 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    shared.blob = new THREE.MeshBasicMaterial({ color: 0x000000, map: t, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  }
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(m.W + 0.35, m.L + 0.5), shared.blob);
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1;
  group.add(blob);

  return {
    group, bodyPivot, wheels, steer, model: m,
    lights: { head: headL, tail: tailL, tailMat, headMat }, glass,
    half: { w: m.W / 2 + 0.05, l: m.L / 2 },
  };
}
