import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M } from './materials.js';
import { WIND, damp } from './util.js';

// The two dogs from photos 15 and 16. Bodies are signed-distance sculptures (ellipsoids and
// tapered capsules blended with a smooth minimum) meshed with surface nets; the coat is a stack of
// instanced shells whose strands come from 3D Worley noise on the skin, so long and short fur
// read as real hair instead of a painted texture. Head and tail are separate parts so they move.

// ---------------- signed distance sculpting ----------------
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
function sdEllipsoid(px, py, pz, c, r) {
  const x = (px - c.x) / r.x, y = (py - c.y) / r.y, z = (pz - c.z) / r.z;
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / r.x, y / r.y, z / r.z);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r.x, r.y, r.z);
}
function sdCapsule(px, py, pz, a, b, ra, rb) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const pax = px - a.x, pay = py - a.y, paz = pz - a.z;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
}
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const E = (c, r, k = 0.04) => ({ f: (x, y, z) => sdEllipsoid(x, y, z, c, r), k });
const C = (a, b, ra, rb, k = 0.04) => ({ f: (x, y, z) => sdCapsule(x, y, z, a, b, ra, rb), k });
// flattened capsule (ears): squash across the ear's thickness axis, around the ear's own plane
const Flat = (prim, axis, s, c) => ({ f: (x, y, z) => { const p = [x, y, z]; p[axis] = c + (p[axis] - c) / s; return prim.f(p[0], p[1], p[2]) * s; }, k: prim.k });

function sdfOf(prims) {
  return (x, y, z) => {
    let d = prims[0].f(x, y, z);
    for (let i = 1; i < prims.length; i++) d = smin(d, prims[i].f(x, y, z), prims[i].k);
    return d;
  };
}

// Surface nets: one vertex per sign-changing cell, quads across sign-changing edges.
function surfaceNets(sdf, min, max, cell) {
  const nx = Math.ceil((max.x - min.x) / cell) + 1, ny = Math.ceil((max.y - min.y) / cell) + 1, nz = Math.ceil((max.z - min.z) / cell) + 1;
  const F = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[id(i, j, k)] = sdf(min.x + i * cell, min.y + j * cell, min.z + k * cell);
  const vIdx = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { val[c] = F[id(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; if (val[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((val[a] < 0) === (val[b] < 0)) continue;
      const t = val[a] / (val[a] - val[b]);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
      sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
      sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
      n++;
    }
    vIdx[id(i, j, k)] = pos.length / 3;
    pos.push(min.x + (i + sx / n) * cell, min.y + (j + sy / n) * cell, min.z + (k + sz / n) * cell);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const f0 = F[id(i, j, k)] < 0;
    if (f0 !== (F[id(i + 1, j, k)] < 0)) quad(vIdx[id(i, j - 1, k - 1)], vIdx[id(i, j, k - 1)], vIdx[id(i, j, k)], vIdx[id(i, j - 1, k)], f0);
    if (f0 !== (F[id(i, j + 1, k)] < 0)) quad(vIdx[id(i - 1, j, k - 1)], vIdx[id(i - 1, j, k)], vIdx[id(i, j, k)], vIdx[id(i, j, k - 1)], f0);
    if (f0 !== (F[id(i, j, k + 1)] < 0)) quad(vIdx[id(i - 1, j - 1, k)], vIdx[id(i, j - 1, k)], vIdx[id(i, j, k)], vIdx[id(i - 1, j, k)], f0);
  }
  // normals from the field gradient; fix any triangle facing inwards
  const nrm = new Float32Array(pos.length), e = cell * 0.5;
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2];
    const gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[v] = gx / l; nrm[v + 1] = gy / l; nrm[v + 2] = gz / l;
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    if (cx * (nrm[a] + nrm[b] + nrm[c]) + cy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + cz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]) < 0) {
      const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

// per-vertex fur length and colour
function paint(g, furFn, colFn) {
  const p = g.attributes.position, n = p.count;
  const fur = new Float32Array(n), col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    fur[i] = furFn(x, y, z);
    colFn(x, y, z, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('aFur', new THREE.BufferAttribute(fur, 1));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------------- fur material (instanced shells) ----------------
function furMaterial({ shells, density, tip, sheen, gravity, lift = 0.6, thick = 0.6, ao = 0.32, vary = 0.36 }) {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, sheen: 1, sheenColor: new THREE.Color(sheen), sheenRoughness: 0.45 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uShells = { value: shells };
    sh.uniforms.uDensity = { value: density };
    sh.uniforms.uTip = { value: new THREE.Color(tip) };
    sh.uniforms.uGrav = { value: new THREE.Vector3(...gravity) };
    sh.uniforms.uTime = WIND.time;
    sh.uniforms.uLift = { value: lift };
    sh.uniforms.uThick = { value: thick };
    sh.uniforms.uAO = { value: ao };
    sh.uniforms.uVary = { value: vary };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aFur;
uniform float uShells; uniform vec3 uGrav; uniform float uTime; uniform float uLift;
varying vec3 vFurObj; varying float vShell;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vShell = float(gl_InstanceID) / max(1.0, uShells - 1.0);
  vFurObj = position;
  float sway = sin(uTime * 1.7 + position.x * 9.0 + position.z * 7.0) * 0.12;
  transformed += objectNormal * aFur * vShell * uLift + (uGrav + vec3(sway, 0.0, sway * 0.5)) * aFur * pow(vShell, 1.4);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uDensity; uniform vec3 uTip; uniform float uThick; uniform float uAO; uniform float uVary;
varying vec3 vFurObj; varying float vShell;
vec3 furHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 q = vFurObj * uDensity, cell = floor(q);
    float best = 9.0; vec3 bh = vec3(0.5);
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
      vec3 c = cell + vec3(float(i), float(j), float(k));
      vec3 h = furHash(c);
      float d = length(q - c - h);
      if (d < best) { best = d; bh = h; }
    }
    float thick = (uThick + 0.3 * bh.x) * (1.0 - vShell * (0.75 + 0.2 * bh.y));
    if (vShell > 0.001 && best > thick) discard;
    // self-shadowing towards the skin, lighter sun-bleached tips, per-strand variation
    diffuseColor.rgb *= mix(uAO, 1.0, pow(vShell, 0.7)) * (1.0 - uVary * 0.5 + uVary * bh.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, uTip, vShell * vShell * 0.6);
  }`);
  };
  m.customProgramCacheKey = () => 'fur' + shells + density + lift + thick + ao + vary;
  return m;
}

function furryPart(sdf, box, cell, furFn, colFn, look) {
  const g = paint(surfaceNets(sdf, box[0], box[1], cell), furFn, colFn);
  const mat = furMaterial(look);
  const im = new THREE.InstancedMesh(g, mat, look.shells);
  const I = new THREE.Matrix4();
  for (let i = 0; i < look.shells; i++) im.setMatrixAt(i, I);
  // bounds grow by the longest hair so culling never clips the coat
  im.computeBoundingSphere();
  im.boundingSphere.radius += 0.15;
  im.castShadow = true; im.receiveShadow = true;
  im.userData.noAO = true;
  return im;
}

function glossy(color, rough = 0.15) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
}

// soft contact shadow so the dog sits in the grass instead of floating on it
function contactShadow(w, l) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.position.y = 0.012;
  m.userData.noAO = true;
  return m;
}

// ---------------- Dog 1: black Belgian Shepherd (Groenendael), lying in the garden (photo 15) ----------------
function groenendael() {
  const S = 1.0;
  const body = sdfOf([
    E(v3(0, 0.19, -0.02), v3(0.15, 0.14, 0.34)),
    E(v3(0, 0.25, 0.24), v3(0.14, 0.17, 0.16), 0.08),                       // deep chest, raised (sphinx pose)
    E(v3(0, 0.17, -0.3), v3(0.165, 0.14, 0.17), 0.07),                       // hips
    E(v3(0.13, 0.13, -0.26), v3(0.07, 0.11, 0.16), 0.05), E(v3(-0.13, 0.13, -0.26), v3(0.07, 0.11, 0.16), 0.05),   // folded thighs
    C(v3(0.16, 0.04, -0.4), v3(0.15, 0.035, -0.12), 0.04, 0.035, 0.05), C(v3(-0.16, 0.04, -0.4), v3(-0.15, 0.035, -0.12), 0.04, 0.035, 0.05),
    C(v3(0.085, 0.12, 0.3), v3(0.085, 0.04, 0.6), 0.05, 0.034, 0.05), C(v3(-0.085, 0.12, 0.3), v3(-0.085, 0.04, 0.6), 0.05, 0.034, 0.05),
    E(v3(0.085, 0.028, 0.64), v3(0.042, 0.028, 0.06), 0.03), E(v3(-0.085, 0.028, 0.64), v3(-0.042, 0.028, 0.06), 0.03),
    C(v3(0, 0.3, 0.3), v3(0, 0.46, 0.43), 0.1, 0.085, 0.07),               // lower neck
  ].map(p => ({ ...p, k: p.k * S })));
  const pivot = v3(0, 0.4, 0.38);                                             // head/neck joint
  const head = sdfOf([
    C(v3(0, 0.36, 0.35), v3(0, 0.49, 0.46), 0.088, 0.075, 0.06),
    E(v3(0, 0.55, 0.5), v3(0.094, 0.09, 0.118), 0.05),                      // skull
    C(v3(0, 0.535, 0.57), v3(0, 0.505, 0.765), 0.06, 0.033, 0.05),          // long muzzle
    C(v3(0, 0.468, 0.58), v3(0, 0.455, 0.705), 0.036, 0.022, 0.02),         // lower jaw (open, panting)
    Flat(C(v3(0.052, 0.6, 0.47), v3(0.088, 0.775, 0.44), 0.047, 0.004, 0.03), 2, 0.38, 0.455),   // big erect triangular ears
    Flat(C(v3(-0.052, 0.6, 0.47), v3(-0.088, 0.775, 0.44), 0.047, 0.004, 0.03), 2, 0.38, 0.455),
  ]);
  const tail = sdfOf([
    C(v3(0, 0.16, -0.44), v3(0.04, 0.08, -0.62), 0.045, 0.035, 0.03),
    C(v3(0.04, 0.08, -0.62), v3(0.17, 0.035, -0.74), 0.035, 0.022, 0.04),
  ]);
  const furLen = (x, y, z) => {
    let f = 0.045;
    if (z > 0.18 && y > 0.18 && y < 0.5) f = 0.08;                           // mane / ruff
    if (y < 0.1 && z > 0.3) f = 0.018;                                       // front legs and paws
    if (y < 0.1 && z < -0.1) f = 0.03;
    if (z < -0.2 && y > 0.05 && Math.abs(x) > 0.1) f = 0.075;                // culottes
    return f;
  };
  const headFur = (x, y, z) => (y > 0.62 ? 0.004 : z > 0.58 ? 0.006 : z < 0.44 ? 0.075 : 0.014);
  const black = (x, y, z, c) => c.setRGB(0.028, 0.024, 0.022, THREE.SRGBColorSpace);
  const look = { shells: 11, density: 420, tip: 0x4a2e1a, sheen: 0x6a4a30, gravity: [0, -0.45, -1.05], lift: 0.5, thick: 0.52 };
  const grp = new THREE.Group();
  const bodyM = furryPart(body, [v3(-0.32, -0.02, -0.62), v3(0.32, 0.5, 0.74)], 0.017, furLen, black, look);
  const headG = new THREE.Group(); headG.position.copy(pivot);
  const headM = furryPart((x, y, z) => head(x + pivot.x, y + pivot.y, z + pivot.z), [v3(-0.17, -0.1, -0.1), v3(0.17, 0.42, 0.44)], 0.0095, (x, y, z) => headFur(x + pivot.x, y + pivot.y, z + pivot.z), black, { ...look, shells: 9, gravity: [0, -0.4, -0.6], lift: 0.7 });
  headG.add(headM);
  // eyes, nose, tongue (in head space)
  const eyeM = glossy(0x1a0e08, 0.1);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 12, 8), eyeM);
    e.position.set(s * 0.047, 0.575 - pivot.y, 0.598 - pivot.z);
    headG.add(e);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glossy(0x050505, 0.3));
  nose.scale.set(0.026, 0.02, 0.018); nose.position.set(0, 0.52 - pivot.y, 0.785 - pivot.z);
  headG.add(nose);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshPhysicalMaterial({ color: 0xc85a6a, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
  tongue.scale.set(0.028, 0.062, 0.011);
  tongue.rotation.x = -0.35;
  tongue.position.set(0, 0.42 - pivot.y, 0.69 - pivot.z);
  headG.add(tongue);
  const tailG = new THREE.Group(); tailG.position.set(0, 0.16, -0.44);
  const tailM = furryPart((x, y, z) => tail(x, y + 0.16, z - 0.44), [v3(-0.12, -0.2, -0.36), v3(0.3, 0.1, 0.06)], 0.013, () => 0.1, black, { ...look, shells: 10 });
  tailG.add(tailM);
  grp.add(bodyM, headG, tailG, contactShadow(0.7, 1.5));
  return { grp, headG, tailG, tongue, body: bodyM, half: [0.24, 0.72], pant: 3.2, tongueY: tongue.position.y };
}

// ---------------- Dog 2: small fawn mix with big erect ears, sitting (photo 16) ----------------
function fawnDog() {
  const body = sdfOf([
    E(v3(0, 0.1, -0.08), v3(0.105, 0.095, 0.12), 0.05),                     // rump on the floor
    C(v3(0, 0.12, -0.05), v3(0, 0.25, 0.08), 0.1, 0.085, 0.06),             // long back, sitting up
    E(v3(0, 0.235, 0.11), v3(0.085, 0.095, 0.07), 0.05),                     // chest
    C(v3(0.05, 0.2, 0.12), v3(0.05, 0.03, 0.15), 0.028, 0.021, 0.03), C(v3(-0.05, 0.2, 0.12), v3(-0.05, 0.03, 0.15), 0.028, 0.021, 0.03),
    E(v3(0.05, 0.017, 0.168), v3(0.028, 0.018, 0.038), 0.02), E(v3(-0.05, 0.017, 0.168), v3(-0.028, 0.018, 0.038), 0.02),
    E(v3(0.085, 0.075, -0.045), v3(0.042, 0.068, 0.085), 0.04), E(v3(-0.085, 0.075, -0.045), v3(-0.042, 0.068, 0.085), 0.04),
    C(v3(0.09, 0.02, -0.03), v3(0.09, 0.018, 0.05), 0.024, 0.02, 0.03), C(v3(-0.09, 0.02, -0.03), v3(-0.09, 0.018, 0.05), 0.024, 0.02, 0.03),
    C(v3(0, 0.26, 0.09), v3(0, 0.34, 0.12), 0.06, 0.052, 0.05),
  ]);
  const pivot = v3(0, 0.31, 0.1);
  const head = sdfOf([
    C(v3(0, 0.3, 0.09), v3(0, 0.38, 0.13), 0.055, 0.05, 0.04),
    E(v3(0, 0.415, 0.15), v3(0.066, 0.062, 0.075), 0.04),                    // round skull
    C(v3(0, 0.4, 0.2), v3(0, 0.385, 0.285), 0.036, 0.021, 0.035),           // muzzle
    Flat(C(v3(0.036, 0.455, 0.135), v3(0.072, 0.575, 0.12), 0.036, 0.006, 0.025), 2, 0.4, 0.128),  // big erect ears
    Flat(C(v3(-0.036, 0.455, 0.135), v3(-0.072, 0.575, 0.12), 0.036, 0.006, 0.025), 2, 0.4, 0.128),
  ]);
  const tail = sdfOf([C(v3(0, 0.05, -0.18), v3(0.08, 0.018, -0.3), 0.024, 0.014, 0.03)]);
  const fawn = new THREE.Color().setRGB(0.72, 0.54, 0.37, THREE.SRGBColorSpace);
  const cream = new THREE.Color().setRGB(0.88, 0.76, 0.6, THREE.SRGBColorSpace);
  const gray = new THREE.Color().setRGB(0.8, 0.72, 0.62, THREE.SRGBColorSpace);
  const earC = new THREE.Color().setRGB(0.6, 0.4, 0.25, THREE.SRGBColorSpace);
  const bodyCol = (x, y, z, c) => {
    c.copy(fawn);
    const front = z > 0.1 && y > 0.12 && y < 0.3;
    if (front) c.lerp(cream, Math.min(1, (z - 0.1) * 18) * (1 - Math.min(1, Math.abs(x) * 9)));   // pale throat and chest
    if (y < 0.06 && z > 0.12) c.copy(cream);                                  // white-ish toes
  };
  const headCol = (x, y, z, c) => {
    const wy = y + pivot.y, wz = z + pivot.z;
    c.copy(fawn);
    if (wz > 0.2) c.lerp(gray, Math.min(1, (wz - 0.2) * 14));               // greying muzzle
    if (wy > 0.47) c.copy(earC);
    if (wy < 0.39 && wz > 0.14) c.lerp(cream, 0.6);
  };
  const look = { shells: 4, density: 1100, tip: 0xe6c49a, sheen: 0xc89a68, gravity: [0, -0.3, -0.8], lift: 0.5, thick: 0.8, ao: 0.72, vary: 0.14 };
  const grp = new THREE.Group();
  const bodyM = furryPart(body, [v3(-0.16, -0.02, -0.25), v3(0.16, 0.42, 0.24)], 0.0085, () => 0.006, bodyCol, look);
  const headG = new THREE.Group(); headG.position.copy(pivot);
  const headM = furryPart((x, y, z) => head(x + pivot.x, y + pivot.y, z + pivot.z), [v3(-0.12, -0.06, -0.06), v3(0.12, 0.3, 0.22)], 0.0065,
    (x, y) => (y + pivot.y > 0.47 ? 0.002 : 0.004), headCol, look);
  headG.add(headM);
  const eyeM = glossy(0x1c0f07, 0.1);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), eyeM);
    e.scale.set(1, 0.7, 1);                                                   // half-closed, dozing in the sun
    e.position.set(s * 0.036, 0.425 - pivot.y, 0.205 - pivot.z);
    headG.add(e);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glossy(0x0a0706, 0.3));
  nose.scale.set(0.019, 0.015, 0.013); nose.position.set(0, 0.398 - pivot.y, 0.29 - pivot.z);
  headG.add(nose);
  const tailG = new THREE.Group(); tailG.position.set(0, 0.05, -0.18);
  tailG.add(furryPart((x, y, z) => tail(x, y + 0.05, z - 0.18), [v3(-0.06, -0.06, -0.16), v3(0.13, 0.05, 0.03)], 0.006, () => 0.01, (x, y, z, c) => c.copy(fawn), look));
  grp.add(bodyM, headG, tailG, contactShadow(0.36, 0.55));
  return { grp, headG, tailG, tongue: null, body: bodyM, half: [0.13, 0.24], pant: 1.1, headBias: [0.35, 0.25] };
}

// ---------------- garden details from photo 15: clothesline posts, rags, blue fescue, roses ----------------
function gardenDetails(scene, world, x0, z0, y) {
  const green = new THREE.MeshStandardMaterial({ color: 0x3f8f79, roughness: 0.6, metalness: 0.35 });
  const rag = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.95, side: THREE.DoubleSide });
  const parts = [];
  const posts = [[x0 + 0.95, z0 + 0.35], [x0 + 1.75, z0 + 1.35]];
  for (const [x, z] of posts) {
    const g = new THREE.BoxGeometry(0.06, 2.0, 0.06); g.translate(x, y + 1.0, z); parts.push([g, green]);
    world.addAABB(x - 0.05, x + 0.05, z - 0.05, z + 0.05, -5, 3, 'post');
  }
  const [a, b] = posts;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const wire = new THREE.CylinderGeometry(0.003, 0.003, L, 4); wire.rotateX(Math.PI / 2); wire.rotateY(ang); wire.translate((a[0] + b[0]) / 2, y + 1.12, (a[1] + b[1]) / 2);
  parts.push([wire, M.cable]);
  for (const [t, w, h] of [[0.28, 0.32, 0.36], [0.62, 0.22, 0.52]]) {
    const g = new THREE.PlaneGeometry(w, h, 4, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 18) * 0.015 + Math.sin(p.getY(i) * 11) * 0.01);
    g.computeVertexNormals();
    g.translate(0, -h / 2, 0); g.rotateY(ang + Math.PI / 2);
    g.translate(a[0] + (b[0] - a[0]) * t, y + 1.12, a[1] + (b[1] - a[1]) * t);
    parts.push([g, rag]);
  }
  // blue fescue tuft: fine blue-grey blades
  const blades = [];
  for (let i = 0; i < 90; i++) {
    const r = Math.random, h = 0.25 + r() * 0.25, g = new THREE.PlaneGeometry(0.008, h, 1, 3);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / h; p.setZ(k, t * t * 0.12); }
    g.rotateY(r() * Math.PI * 2);
    g.translate(x0 + 1.2 + (r() - 0.5) * 0.12, y, z0 - 0.35 + (r() - 0.5) * 0.12);
    blades.push(g);
  }
  parts.push([mergeGeometries(blades), new THREE.MeshStandardMaterial({ color: 0x9fb3b0, roughness: 0.7, side: THREE.DoubleSide })]);
  // a few red roses on a thin rose bush left of the dog
  const leaf = M.leavesSmall ?? M.leaves;
  const rose = new THREE.MeshStandardMaterial({ color: 0xc0182a, roughness: 0.55 });
  for (let i = 0; i < 26; i++) {
    const g = new THREE.PlaneGeometry(0.22, 0.22); g.rotateX(-Math.PI / 2 + (Math.random() - 0.5) * 1.6); g.rotateY(Math.random() * 6);
    g.translate(x0 - 0.7 + (Math.random() - 0.5) * 0.5, y + 0.4 + Math.random() * 0.9, z0 + 0.4 + (Math.random() - 0.5) * 0.5);
    parts.push([g, leaf]);
  }
  for (const [dx, dy, dz] of [[-0.6, 1.05, 0.35], [-0.78, 1.18, 0.5], [-0.55, 0.8, 0.6]]) {
    const g = new THREE.IcosahedronGeometry(0.035, 1); g.scale(1, 0.8, 1); g.translate(x0 + dx, y + dy, z0 + dz); parts.push([g, rose]);
  }
  const byMat = new Map();
  for (const [g, m] of parts) { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g.index ? g.toNonIndexed() : g); }
  for (const [m, gs] of byMat) {
    for (const g of gs) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const mesh = new THREE.Mesh(mergeGeometries(gs), m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

export function buildDogs(scene, world) {
  const dogs = [];
  const place = (d, x, y, z, ry, name) => {
    d.grp.position.set(x, y, z); d.grp.rotation.y = ry;
    scene.add(d.grp);
    // collider: oriented box around the body
    world.addStatic(new world.Box(x, z, d.half[0], d.half[1], ry, -5, 1.2, 'dog'));
    Object.assign(d, { name, x, z, ry, yaw: 0, pitch: 0, wag: 0.4, pet: 0, t0: Math.random() * 10 });
    dogs.push(d);
  };
  // photo 15: the black shepherd lies on the lawn by the clothesline, facing the walkway
  const g = groenendael();
  place(g, 5.6, 0.25, 15.6, -2.53, 'Ciobănescul negru');
  gardenDetails(scene, world, 5.6, 15.6, 0.25);
  // photo 16: the fawn dog sits in the sun on the porch, next to the veranda door
  const f = fawnDog();
  place(f, 5.25, 0.25, 4.62, -Math.PI / 2 - 0.25, 'Câinele roșcat');
  const tmp = new THREE.Vector3();
  return {
    dogs,
    nearest(px, pz, r = 1.7) {
      let best = null, bd = r;
      for (const d of dogs) { const dd = Math.hypot(d.x - px, d.z - pz); if (dd < bd) { bd = dd; best = d; } }
      return best;
    },
    pet(d) { d.pet = 3.5; },
    update(dt, t, eye) {
      for (const d of dogs) {
        const dx = eye.x - d.x, dz = eye.z - d.z, dist = Math.hypot(dx, dz);
        d.grp.visible = dist < 90;                   // the yard is hidden beyond that anyway
        if (!d.grp.visible) continue;
        // head follows a person within 7 m, otherwise idles
        let wantYaw, wantPitch;
        if (dist < 7) {
          tmp.set(dx, 0, dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), -d.ry);
          wantYaw = Math.max(-0.8, Math.min(0.8, Math.atan2(tmp.x, tmp.z)));
          wantPitch = Math.max(-0.35, Math.min(0.25, -Math.atan2(eye.y - d.grp.position.y - 0.45, dist)));
        } else {
          wantYaw = Math.sin((t + d.t0) * 0.21) * 0.5 + (d.headBias ? d.headBias[0] : 0);
          wantPitch = d.headBias ? d.headBias[1] : 0;
        }
        d.yaw = damp(d.yaw, wantYaw, 3, dt); d.pitch = damp(d.pitch, wantPitch, 3, dt);
        d.headG.rotation.set(d.pitch, d.yaw, d.pet > 0 ? Math.sin(t * 2) * 0.15 : 0, 'YXZ');
        // tail: faster and wider when someone is close or petting
        d.pet = Math.max(0, d.pet - dt);
        const excite = d.pet > 0 ? 1 : dist < 4 ? 0.55 : 0.12;
        d.wag = damp(d.wag, excite, 2, dt);
        d.tailG.rotation.y = Math.sin((t + d.t0) * (3 + 9 * d.wag)) * (0.08 + 0.45 * d.wag);
        // breathing / panting
        const br = Math.sin((t + d.t0) * Math.PI * 2 * d.pant);
        d.body.scale.set(1 + br * 0.008, 1 + br * 0.012, 1);
        if (d.tongue) d.tongue.position.y = d.tongueY + br * 0.004;
      }
    },
  };
}
