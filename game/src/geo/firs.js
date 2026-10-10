import * as THREE from 'three';
import { M } from '../materials.js';
import { TEX } from '../textures.js';
import { WIND, rng } from '../util.js';
import { SNOW } from '../rain.js';
import { heightAt } from './data.js';

// Detailed near spruces (Picea abies) and how they react to you.
//
// The ~40 conifers nearest the camera are drawn with a detailed model instead of the whorls of cards of geo/trees.js
// and vegetation.js (those instances are hidden meanwhile): a tapered trunk (dead branch stubs below the crown of the
// forest-grown ones), whorls of branches every ~0.42 m that droop and turn their tips up, each with a spray of needles
// along its top and, in the lower crown, the hanging "comb" of branchlets of a Norway spruce; in the snow modes a pillow
// of snow lies along every branch, as deep as the cover is.
// Walk or drive into a crown and its branches give way around you and swing back (a damped spring) when you leave;
// the snow on the branches you shake falls off, in clumps and powder, and the branches stay bare there.

// ------------------------------------------------------------------ the model
class Geo {
  constructor(anchor = false) { this.p = []; this.n = []; this.uv = []; this.f = []; this.a = anchor ? [] : null; this.idx = []; }
  v(p, n, u, v, f, a) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v); this.f.push(f);
    if (this.a) this.a.push(a.x, a.y, a.z);
    return this.p.length / 3 - 1;
  }
  // a triangle facing `up` (DoubleSide materials flip the normal of the back face: the side we mean must be the front)
  tri(a, b, c, up) {
    const P = this.p, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, wx = P[c * 3] - ax, wy = P[c * 3 + 1] - ay, wz = P[c * 3 + 2] - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (up && nx * up.x + ny * up.y + nz * up.z < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  quad(a, b, c, d, up) { this.tri(a, b, c, up); this.tri(b, d, c, up); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.f, 1));
    if (this.a) g.setAttribute('aAnchor', new THREE.Float32BufferAttribute(this.a, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);

// a tube along points P with radii R (sides around), flex F per point
function tube(G, P, R, F, sides, uScale = 1) {
  const base = G.p.length / 3, T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  let len = 0;
  for (let i = 0; i < P.length; i++) {
    T.subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
    N.crossVectors(T, Math.abs(T.y) > 0.9 ? V3(1, 0, 0) : UP).normalize();
    B.crossVectors(T, N);
    if (i) len += P[i].distanceTo(P[i - 1]);
    for (let s = 0; s <= sides; s++) {
      const a = s / sides * Math.PI * 2, d = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      G.v(P[i].clone().addScaledVector(d, R[i]), d, s / sides * uScale, len / 1.5, F[i]);
    }
  }
  for (let i = 0; i < P.length - 1; i++) for (let s = 0; s < sides; s++) {
    const a = base + i * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
    G.idx.push(a, b, c, b, d, c);                                   // (outward: (b - a) x (c - a) = B x T = N)
  }
}

// spec: { H, crown, low, seed, stubs }: the same proportions as the card model it replaces (geo/trees.js TYPES)
export function spruceDetail(spec) {
  const r = rng(spec.seed ?? 7);
  const { H, crown } = spec, low = spec.low ?? 1.3;
  const wood = new Geo(), needle = new Geo(), snow = new Geo(true);
  const trunkR = Math.min(0.42, 0.012 + H * 0.012);                 // (a stem ~H/40 across at the foot)
  tube(wood, [V3(0, -0.3, 0), V3(0, H * 0.35, 0), V3(0, H * 0.75, 0), V3(0, H, 0)], [trunkR, trunkR * 0.72, trunkR * 0.35, 0.02], [0, 0, 0.05, 0.15], 10, 3);
  // forest-grown spruces keep their dead lower branches as grey stubs
  if (spec.stubs) for (let y = 1.3; y < low - 0.2; y += 0.3 + r() * 0.1) {
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2, L = 0.12 + r() * 0.33, d = V3(Math.cos(a), -0.35 - r() * 0.35, Math.sin(a)).normalize();
      const p0 = V3(Math.cos(a) * trunkR * 0.8, y, Math.sin(a) * trunkR * 0.8);
      tube(wood, [p0, p0.clone().addScaledVector(d, L)], [0.009, 0.003], [0, 0.05], 3);
    }
  }
  const branch = (y, a, L, k, small) => {
    // the branch: out from the trunk, sagging in the middle (lower crown), its tip turned up
    const e0 = -0.42 + 0.62 * k + (r() - 0.5) * 0.12, tipUp = 0.18 + 0.12 * r(), sag = L * (0.1 + 0.08 * (1 - k));
    const bend = (r() - 0.5) * 0.35, rt = trunkR * Math.max(0.2, 1 - y / H) * 0.85;
    const pt = (u) => {
      const aa = a + bend * u, h = rt + L * u;
      return V3(Math.cos(aa) * h, y + L * (e0 * u + tipUp * u * u * u) - sag * Math.sin(Math.PI * u), Math.sin(aa) * h);
    };
    const flex = (u) => Math.min(1, Math.pow(u, 1.2) * (0.45 + 0.55 * Math.min(1, L / 2.4)));
    const P = [0, 0.33, 0.66, 1].map(pt), rb = 0.008 + 0.008 * L;      // (3-6 cm across at the trunk)
    tube(wood, P, [rb, rb * 0.7, rb * 0.45, rb * 0.15], [0, flex(0.33), flex(0.66), flex(1)], 5);
    const side = V3(-Math.sin(a), 0, Math.cos(a)), radial = V3(Math.cos(a), 0, Math.sin(a));
    const nTop = radial.clone().multiplyScalar(0.55).add(V3(0, 0.8, 0)).normalize();
    const hw = (u) => (0.42 * L * (1 - 0.5 * u) + 0.14) * (small ? 0.75 : 1) / 2;
    // the spray along its top: arched across, three sections along; and a second one under it, tilted about the
    // branch, so the foliage has depth seen from the side too
    const spray = (tilt, sc, dy) => {
      const S = [], us = [0.08, 0.4, 0.72, 1.04];
      us.forEach((u, j) => {
        const c = pt(Math.min(u, 1)).addScaledVector(radial, u > 1 ? (u - 1) * L : 0).add(V3(0, 0.025 + dy, 0)), w = hw(u) * sc;
        const sv = side.clone().multiplyScalar(Math.cos(tilt)).add(V3(0, Math.sin(tilt), 0));
        const vv = 0.505 + 0.485 * j / 3, f = flex(Math.min(u, 1));
        S.push([
          needle.v(c.clone().addScaledVector(sv, -w).add(V3(0, -0.15 * w, 0)), nTop, 0, vv, f),
          needle.v(c.clone().add(V3(0, 0.12 * w, 0)), nTop, 0.5, vv, f),
          needle.v(c.clone().addScaledVector(sv, w).add(V3(0, -0.15 * w, 0)), nTop, 1, vv, f),
        ]);
      });
      for (let j = 0; j < 3; j++) { needle.quad(S[j][0], S[j][1], S[j + 1][0], S[j + 1][1], UP); needle.quad(S[j][1], S[j][2], S[j + 1][1], S[j + 1][2], UP); }
    };
    spray(0, 1, 0);
    spray((r() < 0.5 ? 1 : -1) * (0.45 + 0.25 * r()), 0.8, -0.05);
    // the comb: short branchlets hanging from both edges (lower and middle crown)
    if (k < 0.7 && !small) for (const sd of [-1, 1]) {
      const C = [], hc = Math.max(0.12, Math.min(0.5, (0.15 + 0.18 * (1 - k)) * L * 0.6));
      const out = side.clone().multiplyScalar(sd).multiplyScalar(0.6).addScaledVector(radial, 0.5).add(V3(0, 0.15, 0)).normalize();
      [0.18, 0.45, 0.72, 0.98].forEach((u, j) => {
        const t0 = pt(u).addScaledVector(side, sd * hw(u) * 0.8), f = flex(u), x = 0.05 + 0.9 * j / 3;
        C.push([needle.v(t0, out, x, 0.49, f), needle.v(t0.clone().add(V3(0, -hc, 0)).addScaledVector(side, sd * hc * 0.3), out, x, 0.02, f)]);
      });
      for (let j = 0; j < 3; j++) needle.quad(C[j][0], C[j + 1][0], C[j][1], C[j + 1][1], out);
    }
    // the snow lying along it: a lumpy pillow on the spray, thickest mid-branch; every section collapses to its
    // centre line when there is no snow (or it has been shaken off)
    const T = (0.05 + 0.055 * Math.min(1, L / 2.4)) * (0.8 + 0.4 * r()) * (small ? 0.7 : 1);
    const gap = r() < 0.35 ? 2 + Math.floor(r() * 2) : -1;                // (now and then two lumps, not one)
    const ring = [];
    for (let j = 0; j <= 5; j++) {
      const u = 0.14 + j / 5 * 0.8, c = pt(u), w = hw(u) * (0.38 + 0.2 * r()), f = flex(u);
      const th = j === gap ? 0 : T * Math.pow(Math.sin(Math.PI * j / 5), 0.7) * (0.55 + 0.7 * r());
      const off = (r() - 0.5) * 0.3 * w;                                     // (not quite on the middle)
      const anchor = c.clone().add(V3(0, 0.05 + 0.1 * hw(u), 0));
      const row = [];
      for (const o of [-1, -0.5, 0, 0.5, 1]) {
        const h = th * Math.pow(1 - o * o, 0.6) + (Math.abs(o) > 0.9 ? -0.01 : 0.012);
        row.push(snow.v(c.clone().addScaledVector(side, o * w + off).add(V3(0, 0.035 + 0.1 * hw(u) * (1 - Math.abs(o)) + h, 0)), UP, 0, 0, f, anchor));
      }
      ring.push(row);
    }
    for (let j = 0; j < 5; j++) for (let o = 0; o < 4; o++) snow.quad(ring[j][o], ring[j][o + 1], ring[j + 1][o], ring[j + 1][o + 1], UP);
  };
  // whorls every ~0.42 m (a year's growth), 5-6 branches each, and a couple of smaller ones between the whorls
  for (let y = low; y < H - 0.7; y += 0.38 + r() * 0.09) {
    const k = (y - low) / Math.max(0.5, H - low), R = crown * Math.pow(1 - k, 0.85) + 0.22;
    const n = 5 + (r() < 0.5 ? 1 : 0), a0 = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) branch(y, a0 + i / n * Math.PI * 2 + (r() - 0.5) * 0.4, R * (0.88 + r() * 0.24), k, false);
    for (let i = 0; i < 2; i++) branch(y + 0.19, r() * Math.PI * 2, R * (0.45 + r() * 0.15), k, true);
  }
  // the leader and the last whorl pointing up
  for (let i = 0; i < 4; i++) branch(H - 0.7, i * Math.PI / 2 + r() * 0.5, 0.45, 0.95, true);
  const sg = snow.build();
  sg.computeVertexNormals();
  return { wood: wood.build(), needle: needle.build(), snow: sg };
}

// ------------------------------------------------------------------ the near pool, the branches you push, the snow that falls
const NC = 6, NS = 24;
const FIR_VERT = /* glsl */`
#ifdef USE_INSTANCING
{
  mat3 fm = mat3(instanceMatrix); vec3 fo = instanceMatrix[3].xyz;
  float fs2 = dot(fm[0], fm[0]);
#ifdef FIR_SNOW
  vec3 fwa = fm * aAnchor + fo;
  float fk = uCapK;
  for (int i = 0; i < ${NS}; i++) {
    vec4 sh = uShed[i];
    if (sh.w > 0.0) {
      vec3 q = fwa - sh.xyz;
      float yy = q.y < 0.0 ? -q.y * 1.5 : max(0.0, q.y - uShedTop[i]);
      fk *= smoothstep(0.75, 1.0, length(vec2(length(q.xz), yy)) / sh.w);
    }
  }
  transformed = aAnchor + (transformed - aAnchor) * fk;
#endif
  vec3 fwp = fm * transformed + fo, fd = vec3(0.0);
  // wind: the branch tips sway, the tree leans a little in the gusts
  float fph = fo.x * 0.35 + fo.z * 0.27, fg = (0.6 + 0.4 * sin(uTime * 0.23 + fo.x * 0.02)) * uWind;
  fd.x += (sin(uTime * 1.3 + fph + position.y * 0.4) * 0.6 + sin(uTime * 3.4 + fph * 1.7) * 0.25) * 0.09 * aFlex * fg;
  fd.z += cos(uTime * 1.05 + fph + position.y * 0.3) * 0.06 * aFlex * fg;
  fd.xz += vec2(sin(uTime * 0.7 + fph), cos(uTime * 0.6 + fph)) * 0.0002 * position.y * position.y * fg;
  // the bodies pushing through: the branches give way around them (and swing back: w is a spring)
  for (int i = 0; i < ${NC}; i++) {
    vec4 c = uFirC[i];
    if (c.w != 0.0) {
      vec3 q = fwp - c.xyz;
      float dy = max(0.0, abs(q.y) - uFirR[i].y), dh = length(q.xz);
      float w = exp(-(dh * dh + dy * dy) / (uFirR[i].x * uFirR[i].x));
      fd.xz += (dh > 0.001 ? q.xz / dh : vec2(1.0, 0.0)) * w * c.w * 0.55 * aFlex;
      fd.y -= w * abs(c.w) * 0.16 * aFlex;
    }
  }
  transformed += transpose(fm) * fd / fs2;
}
#endif`;

export class FirDetail {
  // sources: functions (x, z, R, out) pushing records { x, y, z, s, rot, v, spec, refs, hide(on), dead } near (x, z)
  constructor(scene, { cap = 40, audio = null } = {}) {
    this.scene = scene; this.cap = cap; this.audio = audio;
    this.sources = [];
    this.kinds = new Map();
    this.pool = new Set();
    this.timer = 0; this.t = 0;
    this.U = {
      uFirC: { value: Array.from({ length: NC }, () => new THREE.Vector4()) },
      uFirR: { value: Array.from({ length: NC }, () => new THREE.Vector4(1, 0.8, 0, 0)) },
      uShed: { value: Array.from({ length: NS }, () => new THREE.Vector4()) },
      uShedTop: { value: new Array(NS).fill(0) },
      uCapK: { value: 0 },
      uTime: WIND.time, uWind: WIND.strength,
    };
    this.contacts = Array.from({ length: NC }, () => ({ rec: null, x: 0, y: 0, z: 0, s: 0, v: 0, held: false, R: 1, hh: 0.8, lx: 0, lz: 0 }));
    this.sheds = [];
    const inject = (m, snow, key) => {
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, rr) => {
        if (prev) prev.call(m, sh, rr);
        Object.assign(sh.uniforms, this.U);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
attribute float aFlex;
${snow ? '#define FIR_SNOW\nattribute vec3 aAnchor;' : ''}
uniform vec4 uFirC[${NC}], uFirR[${NC}], uShed[${NS}];
uniform float uShedTop[${NS}], uCapK, uTime, uWind;`)
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + FIR_VERT);
      };
      m.customProgramCacheKey = () => key;
      return m;
    };
    const bark = M.bark.clone(); bark.color = new THREE.Color(0xa89482);   // (spruce bark: grey-brown, the twigs lighter)
    this.mats = {
      wood: inject(bark, false, 'firWood'),
      needle: inject(new THREE.MeshStandardMaterial({ map: TEX.spruceAtlas, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.74, color: 0xe2f0d6 }), false, 'firNeedle'),
      snow: inject(new THREE.MeshStandardMaterial({ roughness: 0.85, color: new THREE.Color().setRGB(0.87, 0.9, 0.94) }), true, 'firSnow'),
    };
    this.mats.needle.userData.snow = 0.8;                       // (rain.js: the needles' tops whiten too)
    this.mats.snow.userData.noWet = true;
    this.fall = new SnowFall(scene);
    this.nextDrop = 6;
  }

  addSource(fn) { this.sources.push(fn); }

  kind(spec) {
    const key = spec.key;
    let k = this.kinds.get(key);
    if (k) return k;
    const geo = spruceDetail(spec);
    k = { spec, meshes: {}, list: [] };
    for (const part of ['wood', 'needle', 'snow']) {
      const im = new THREE.InstancedMesh(geo[part], this.mats[part], this.cap);
      im.count = 0; im.frustumCulled = false;
      im.castShadow = part !== 'snow'; im.receiveShadow = true;
      im.userData.noAO = true; im.userData.ueSkip = 'trees';
      if (part === 'needle') im.setColorAt(0, new THREE.Color(1, 1, 1));
      this.scene.add(im);
      k.meshes[part] = im;
    }
    this.kinds.set(key, k);
    return k;
  }

  // the nearest conifers take the detailed model (their card model instances are hidden meanwhile)
  refresh(cam) {
    const cand = [];
    for (const fn of this.sources) fn(cam.x, cam.z, 46, cand);
    for (const c of cand) c.d = Math.hypot(c.x - cam.x, c.z - cam.z);
    cand.sort((a, b) => a.d - b.d);
    const want = new Set(cand.slice(0, this.cap));
    for (const rec of this.pool) if (!want.has(rec)) { if (!rec.dead) rec.hide(false); this.pool.delete(rec); }
    for (const rec of want) if (!this.pool.has(rec)) { rec.hide(true); this.pool.add(rec); }
    for (const k of this.kinds.values()) k.list.length = 0;
    for (const rec of this.pool) this.kind(rec.spec).list.push(rec);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (const k of this.kinds.values()) {
      k.list.forEach((rec, j) => {
        m4.compose(new THREE.Vector3(rec.x, rec.y, rec.z), q.setFromAxisAngle(UP, rec.rot), new THREE.Vector3(rec.s, rec.s, rec.s));
        for (const part of ['wood', 'needle', 'snow']) k.meshes[part].setMatrixAt(j, m4);
        k.meshes.needle.setColorAt(j, c.setScalar(rec.v ?? 1));
      });
      for (const part of ['wood', 'needle', 'snow']) {
        const im = k.meshes[part];
        im.count = k.list.length;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    }
  }

  // the crown of a pooled tree at height y (m from its foot): its radius, or -1 outside its height
  static crownAt(rec, y) {
    const sp = rec.spec, s = rec.s, lo = (sp.low ?? 1.3) * s, hi = sp.H * s;
    if (y < lo - 0.3 || y > hi) return -1;
    const k = Math.max(0, (y - lo) / Math.max(0.5, hi - lo));
    return (sp.crown * Math.pow(1 - k, 0.85) + 0.22) * s;
  }

  shed(x, y, z, R, top, rec, n, big = false) {
    if (this.sheds.length >= NS) this.sheds.shift();
    this.sheds.push({ x, y, z, R, top, t: this.t });
    if (rec && SNOW.uSnow.value > 0.2) this.fall.spawn(rec, x, y, z, R, top, n);
    if (this.audio && n > 0) this.audio.snowDrop(Math.min(1, n / 30) * this.vol(x, z), big);
  }
  vol(x, z) { const c = this.cam; return c ? 1 / (1 + Math.hypot(x - c.x, z - c.z) / 6) : 1; }

  // bodies: [{ x, z, y0, y1, r, speed, car }] (the player's capsule, the car you drive)
  update(dt, cam, bodies) {
    this.t += dt; this.cam = cam;
    if ((this.timer -= dt) <= 0) { this.timer = 0.25; this.refresh(cam); }
    // snow on the branches: with the cover, as deep as it lies (a dusting to a full pillow by ~20 cm)
    const capK = Math.min(1, SNOW.uSnow.value * 1.25) * (0.35 + 0.65 * Math.min(1, SNOW.uSnowDepth.value / 0.2));
    this.U.uCapK.value = capK;
    for (const k of this.kinds.values()) k.meshes.snow.visible = capK > 0.01;
    if (capK < 0.01) this.sheds.length = 0;
    // it re-covers the bare branches while it snows (~90 s)
    if (SNOW.uSnowFall.value > 0.3) this.sheds = this.sheds.filter(s => this.t - s.t < 90);
    // contacts: who is inside which crown, at what height
    for (const c of this.contacts) c.held = false;
    for (const b of bodies) {
      let best = null, bd = 0;
      for (const rec of this.pool) {
        const d = Math.hypot(b.x - rec.x, b.z - rec.z);
        if (d > rec.spec.crown * rec.s + b.r + 0.3) continue;
        for (const fy of [0.25, 0.55, 0.85]) {
          const y = b.y0 + (b.y1 - b.y0) * fy, R = FirDetail.crownAt(rec, y - rec.y);
          if (R > 0 && d < R + b.r * 0.6 && R + b.r - d > bd) { bd = R + b.r - d; best = { rec, y }; }
        }
      }
      if (!best) continue;
      const { rec } = best;
      let c = this.contacts.find(c => c.rec === rec && c.body === b.id);
      const fresh = !c;
      if (!c) c = this.contacts.find(c => !c.rec) ?? this.contacts.reduce((a, q) => (Math.abs(q.s) < Math.abs(a.s) && !q.held ? q : a));
      if (fresh) Object.assign(c, { rec, body: b.id, x: b.x, z: b.z, y: (b.y0 + b.y1) / 2, s: c.rec === rec ? c.s : 0, v: 0, lx: 1e9, lz: 1e9 });
      c.rec = rec; c.held = true;
      c.x = b.x; c.z = b.z; c.y = (b.y0 + b.y1) / 2; c.R = 0.75 + b.r * 0.9; c.hh = (b.y1 - b.y0) / 2; c.push = Math.min(1.35, 0.75 + 0.15 * b.speed);
      // the snow comes down where you push in (again every ~0.7 m you move through)
      if (Math.hypot(c.x - c.lx, c.z - c.lz) > 0.7) {
        c.lx = c.x; c.lz = c.z;
        const n = Math.round(capK * (b.car ? 60 : 26) * (0.6 + 0.4 * Math.min(1, b.speed / 3)));
        this.shed(b.x, b.y0 + 0.3, b.z, b.car ? 1.9 : 1.25, b.car ? 3.5 : 2.6, rec, capK > 0.05 ? n : 0, b.car);
        if (this.audio) this.audio.rustle(b.car ? 6 : 3, (b.car ? 0.9 : 0.5) * this.vol(b.x, b.z));
      }
      // a car hitting the trunk shakes the whole tree
      if (b.car && b.impact > 2 && Math.hypot(b.x - rec.x, b.z - rec.z) < 3) this.shakeTree(rec, capK, true);
    }
    // the springs: pushed aside while held, then back and swinging (~1.7 Hz, lightly damped)
    const K = 115, C = 2 * 0.14 * Math.sqrt(K);
    const steps = Math.ceil(dt / 0.01);
    for (const c of this.contacts) {
      if (!c.rec) continue;
      const target = c.held ? c.push : 0;
      for (let i = 0; i < steps; i++) { const h = dt / steps; c.v += (K * (target - c.s) - C * c.v) * h; c.s += c.v * h; }
      if (!c.held && Math.abs(c.s) < 0.004 && Math.abs(c.v) < 0.01) { c.rec = null; c.s = c.v = 0; }
    }
    this.contacts.forEach((c, i) => {
      this.U.uFirC.value[i].set(c.x, c.y, c.z, c.rec ? c.s : 0);
      this.U.uFirR.value[i].set(c.R, c.hh, 0, 0);
    });
    for (let i = 0; i < NS; i++) {
      const s = this.sheds[i];
      this.U.uShed.value[i].set(s ? s.x : 0, s ? s.y : 0, s ? s.z : 0, s ? s.R : 0);
      this.U.uShedTop.value[i] = s ? s.top : 0;
    }
    // now and then a branch lets its load go by itself
    if (capK > 0.3 && this.pool.size && (this.nextDrop -= dt) <= 0) {
      this.nextDrop = 4 + Math.random() * 9;
      const list = [...this.pool].filter(r => Math.hypot(r.x - cam.x, r.z - cam.z) < 28);
      const rec = list[Math.floor(Math.random() * list.length)];
      if (rec) {
        const hy = rec.y + rec.spec.H * rec.s * (0.4 + 0.45 * Math.random()), R = FirDetail.crownAt(rec, hy - rec.y), a = Math.random() * 6.283;
        if (R > 0) this.shed(rec.x + Math.cos(a) * R * 0.6, hy, rec.z + Math.sin(a) * R * 0.6, 0.8, 1.2, rec, Math.round(10 * capK));
      }
    }
    this.fall.update(dt, SNOW.uSnowLight.value);
  }

  shakeTree(rec, capK, big) {
    const top = rec.spec.H * rec.s;
    this.shed(rec.x, rec.y, rec.z, rec.spec.crown * rec.s + 0.6, top, rec, Math.round(capK * 160), big);
    const c = this.contacts.find(c => !c.rec);
    if (c) Object.assign(c, { rec, body: -1, x: rec.x + 0.01, y: rec.y + top * 0.5, z: rec.z, s: 0, v: 9, held: false, R: rec.spec.crown * rec.s + 1, hh: top * 0.5 });
  }
}

// ------------------------------------------------------------------ the falling snow: clumps and powder
const POWDER_VERT = /* glsl */`
attribute float aA, aS;
varying float vA;
void main() {
  vA = aA;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aS * 320.0 / max(0.3, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const POWDER_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a = vA * exp(-4.0 * dot(c, c)) * (1.0 - smoothstep(0.7, 1.0, dot(c, c)));   // (a soft puff, no rim)
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

class SnowFall {
  constructor(scene) {
    this.NCL = 360; this.NP = 3000;
    this.cl = []; this.pw = [];
    const g = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, color: new THREE.Color().setRGB(0.8, 0.83, 0.88) });
    mat.userData.noWet = true;
    this.clumps = new THREE.InstancedMesh(g, mat, this.NCL);
    this.clumps.count = 0; this.clumps.frustumCulled = false; this.clumps.castShadow = false; this.clumps.userData.noAO = true; this.clumps.userData.ueSkip = 'rain';
    scene.add(this.clumps);
    const pg = new THREE.BufferGeometry();
    this.pp = new Float32Array(this.NP * 3); this.pa = new Float32Array(this.NP); this.ps = new Float32Array(this.NP);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pp, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aA', new THREE.BufferAttribute(this.pa, 1).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aS', new THREE.BufferAttribute(this.ps, 1).setUsage(THREE.DynamicDrawUsage));
    this.color = { value: new THREE.Color(1, 1, 1) };
    this.powder = new THREE.Points(pg, new THREE.ShaderMaterial({ vertexShader: POWDER_VERT, fragmentShader: POWDER_FRAG, uniforms: { uColor: this.color }, transparent: true, depthWrite: false }));
    this.powder.frustumCulled = false; this.powder.userData.noAO = true; this.powder.userData.ueSkip = 'rain';
    pg.setDrawRange(0, 0);
    scene.add(this.powder);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler();
  }

  // snow falling off the branches of rec within R of (x, z), from y up to y + top
  spawn(rec, x, y, z, R, top, n) {
    // from the branches of the crown between y and y + top (as far as the crown goes), within R of (x, z)
    const lo = Math.max(y, rec.y + (rec.spec.low ?? 1.3) * rec.s), hi = Math.min(y + top, rec.y + rec.spec.H * rec.s - 0.2);
    if (hi <= lo) return;
    let made = 0;
    for (let tries = 0; tries < n * 6 && made < n; tries++) {
      const py = lo + Math.random() * (hi - lo), cr = FirDetail.crownAt(rec, py - rec.y);
      if (cr < 0) continue;
      const a = Math.random() * 6.283, rr = (0.25 + 0.75 * Math.sqrt(Math.random())) * cr;
      const px = rec.x + Math.cos(a) * rr, pz = rec.z + Math.sin(a) * rr;
      if (Math.hypot(px - x, pz - z) > R) continue;
      const dx = px - rec.x, dz = pz - rec.z, d = Math.max(0.05, Math.hypot(dx, dz));
      made++;
      const delay = Math.max(0, (py - y) * 0.08) + Math.random() * 0.15;    // the shaking runs up the tree
      // mostly powder, with small clumps (2-7 cm) in it
      if (this.cl.length < this.NCL && Math.random() < 0.7) this.cl.push({ x: px, y: py, z: pz, vx: dx / d * 0.4 * Math.random(), vy: -0.2 - Math.random() * 0.8, vz: dz / d * 0.4 * Math.random(),
        s: 0.01 + Math.random() * 0.025, sy: 0.45 + Math.random() * 0.45, sz: 0.6 + Math.random() * 0.8, rx: Math.random() * 6, ry: Math.random() * 6, delay });
      for (let k = 0; k < 7; k++) this.puff(px + (Math.random() - 0.5) * 0.3, py + (Math.random() - 0.5) * 0.2, pz + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, -0.2 - Math.random() * 0.5, (Math.random() - 0.5) * 0.6, delay);
    }
  }
  puff(x, y, z, vx, vy, vz, delay = 0) {
    if (this.pw.length >= this.NP) return;
    this.pw.push({ x, y, z, vx, vy, vz, life: 0, max: 2 + Math.random() * 2.6, s: 0.04 + Math.random() * 0.07, delay });
  }

  update(dt, light) {
    const g = 9.81, depth = SNOW.uSnowDepth.value;
    let j = 0;
    for (const c of this.cl) {
      if (c.delay > 0) { c.delay -= dt; this.cl[j++] = c; continue; }
      c.vy -= g * dt; const dr = Math.exp(-0.5 * dt); c.vx *= dr; c.vz *= dr;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      const gy = heightAt(c.x, c.z) + depth * 0.6;
      if (c.y < gy) { for (let k = 0; k < 6; k++) this.puff(c.x, gy + 0.05, c.z, (Math.random() - 0.5) * 1.6, Math.random() * 0.6, (Math.random() - 0.5) * 1.6); continue; }
      this.cl[j++] = c;
    }
    this.cl.length = j;
    this.clumps.count = 0;
    this.cl.forEach((c, i) => {
      if (c.delay > 0) { this.clumps.setMatrixAt(i, this.m4.makeScale(0, 0, 0)); return; }
      this.m4.compose(new THREE.Vector3(c.x, c.y, c.z), this.q.setFromEuler(this.e.set(c.rx, c.ry, 0)), new THREE.Vector3(c.s, c.s * c.sy, c.s * c.sz));
      this.clumps.setMatrixAt(i, this.m4);
    });
    this.clumps.count = this.cl.length;
    this.clumps.instanceMatrix.needsUpdate = true;
    // powder: light, it slows to ~0.7 m/s at once and drifts, thinning out
    j = 0;
    for (const p of this.pw) {
      if (p.delay > 0) { p.delay -= dt; this.pw[j++] = p; continue; }
      p.life += dt;
      if (p.life > p.max) continue;
      const k = Math.exp(-2.2 * dt);
      p.vx = p.vx * k + (Math.random() - 0.5) * 0.6 * dt; p.vz = p.vz * k + (Math.random() - 0.5) * 0.6 * dt;
      p.vy = p.vy * k + (-0.7) * (1 - k);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      this.pw[j++] = p;
    }
    this.pw.length = j;
    let n = 0;
    for (const p of this.pw) {
      if (p.delay > 0) continue;
      const f = p.life / p.max;
      this.pp[n * 3] = p.x; this.pp[n * 3 + 1] = p.y; this.pp[n * 3 + 2] = p.z;
      this.pa[n] = 0.42 * Math.min(1, p.life * 6) * (1 - f) * (1 - f);
      this.ps[n] = p.s * (1.2 + 4 * f);                                   // (it spreads into a haze as it settles)
      n++;
    }
    const pg = this.powder.geometry;
    pg.setDrawRange(0, n);
    pg.attributes.position.needsUpdate = pg.attributes.aA.needsUpdate = pg.attributes.aS.needsUpdate = true;
    this.color.value.setRGB(0.9, 0.92, 0.96).multiplyScalar(Math.max(0.08, light));
    this.clumps.visible = this.cl.length > 0; this.powder.visible = n > 0;
  }
}
