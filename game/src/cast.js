import * as THREE from 'three';

// The cast of the forest scene (cinematic.js): two men and the pale creature from the user's two clips.
// Each body is a signed-distance sculpture (ellipsoids and tapered capsules blended with a smooth minimum, hollows cut
// with a smooth maximum) meshed with surface nets in the rest pose, then skinned to a 19-bone skeleton: every vertex
// belongs to the bone of the part it was sculpted from and is blended with the neighbouring bone across each joint.
// Clothes, hair and the creature's skin are painted per vertex (regions) and get their fine detail in the shader.
// Posing: forward kinematics for the trunk and head, two-bone IK for the arms and legs (hands can hold on to a bone of
// another actor), all in the stage's frame.

// ------------------------------------------------------------------ signed distances
function sdEll(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.hypot(x, y, z), k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
}
function sdCap(px, py, pz, a, b, ra, rb) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const h = Math.max(0, Math.min(1, (qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz)));
  return Math.hypot(qx - bx * h, qy - by * h, qz - bz * h) - (ra + (rb - ra) * h);
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// a sculpture: parts { f(x,y,z), k (blend), bone, region, layer: 0 added, 1 cut away, 2 added after the cuts }
class Sculpt {
  constructor() { this.parts = []; this.bone = 0; this.region = 'skin'; this.k = 0.02; }
  at(bone, region, k = this.k) { this.bone = bone; this.region = region; this.k = k; return this; }
  _add(f, box, layer, o) { this.parts.push({ f, box, layer, k: o.k ?? this.k, bone: o.bone ?? this.bone, region: o.region ?? this.region }); return this; }
  ell(c, r, o = {}) { const m = Math.max(...r); return this._add((x, y, z) => sdEll(x, y, z, c, r), [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m], o.layer ?? 0, o); }
  cap(a, b, ra, rb = ra, o = {}) {
    const m = Math.max(ra, rb);
    return this._add((x, y, z) => sdCap(x, y, z, a, b, ra, rb), [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m], o.layer ?? 0, o);
  }
  cut(kind, ...args) { const o = args[args.length - 1]; return this[kind](...args.slice(0, -1), { ...o, layer: 1 }); }
  // the blended field; a part whose bounding box is farther than it could matter is skipped (smin(d, f, k) = d for f >= d + k)
  sdf() {
    const A = this.parts.filter(p => p.layer === 0), S = this.parts.filter(p => p.layer === 1), L = this.parts.filter(p => p.layer === 2);
    const boxD = (b, x, y, z) => { const dx = Math.max(b[0] - x, 0, x - b[3]), dy = Math.max(b[1] - y, 0, y - b[4]), dz = Math.max(b[2] - z, 0, z - b[5]); return Math.sqrt(dx * dx + dy * dy + dz * dz); };
    return (x, y, z) => {
      let d = 1e9;
      for (const p of A) { if (boxD(p.box, x, y, z) - 0.01 >= d + p.k) continue; d = smin(d, p.f(x, y, z), p.k); }
      for (const p of S) { if (boxD(p.box, x, y, z) - 0.01 >= p.k - d) continue; d = smax(d, -p.f(x, y, z), p.k); }
      for (const p of L) { if (boxD(p.box, x, y, z) - 0.01 >= d + p.k) continue; d = smin(d, p.f(x, y, z), p.k); }
      return d;
    };
  }
  // the part a surface point belongs to: the cut it lies on, else the nearest added part
  owner(x, y, z) {
    let best = null, bd = 1e9;
    for (const p of this.parts) {
      if (p.layer === 1) continue;
      const d = Math.abs(p.f(x, y, z));
      if (d < bd) { bd = d; best = p; }
    }
    for (const p of this.parts) if (p.layer === 1 && Math.abs(p.f(x, y, z)) < bd * 0.8 + 0.002) { const d = Math.abs(p.f(x, y, z)); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  bounds(pad) {
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const p of this.parts) if (p.layer !== 1) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], p.box[i]); b[i + 3] = Math.max(b[i + 3], p.box[i + 3]); }
    return [b[0] - pad, b[1] - pad, b[2] - pad, b[3] + pad, b[4] + pad, b[5] + pad];
  }
}

// Surface nets on a narrow band: the field is evaluated exactly only near the surface (found on a 4x coarser grid);
// elsewhere the coarse value's sign is all the mesher needs.
function mesh(sdf, B, cell) {
  const nx = Math.ceil((B[3] - B[0]) / cell) + 1, ny = Math.ceil((B[4] - B[1]) / cell) + 1, nz = Math.ceil((B[5] - B[2]) / cell) + 1;
  const C = 4, cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1;
  const Fc = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) Fc[(k * cy + j) * cx + i] = sdf(B[0] + i * C * cell, B[1] + j * C * cell, B[2] + k * C * cell);
  const F = new Float32Array(nx * ny * nz), band = C * cell * 1.9;
  const id = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const I = Math.min(cx - 2, Math.floor(i / C)), J = Math.min(cy - 2, Math.floor(j / C)), K = Math.min(cz - 2, Math.floor(k / C));
    let near = false, s = 0;
    for (let c = 0; c < 8; c++) { const v = Fc[((K + (c >> 2)) * cy + J + ((c >> 1) & 1)) * cx + I + (c & 1)]; if (Math.abs(v) < band) near = true; s += v; }
    F[id(i, j, k)] = near ? sdf(B[0] + i * cell, B[1] + j * cell, B[2] + k * cell) : s / 8;
  }
  const vIdx = new Int32Array(nx * ny * nz).fill(-1), pos = [];
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
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t; sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t; sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t; n++;
    }
    vIdx[id(i, j, k)] = pos.length / 3;
    pos.push(B[0] + (i + sx / n) * cell, B[1] + (j + sy / n) * cell, B[2] + (k + sz / n) * cell);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const f0 = F[id(i, j, k)] < 0;
    if (f0 !== (F[id(i + 1, j, k)] < 0)) quad(vIdx[id(i, j - 1, k - 1)], vIdx[id(i, j, k - 1)], vIdx[id(i, j, k)], vIdx[id(i, j - 1, k)], f0);
    if (f0 !== (F[id(i, j + 1, k)] < 0)) quad(vIdx[id(i - 1, j, k - 1)], vIdx[id(i - 1, j, k)], vIdx[id(i, j, k)], vIdx[id(i, j, k - 1)], f0);
    if (f0 !== (F[id(i, j, k + 1)] < 0)) quad(vIdx[id(i - 1, j - 1, k)], vIdx[id(i, j - 1, k)], vIdx[id(i, j, k)], vIdx[id(i - 1, j, k)], f0);
  }
  // normals from the field's gradient; triangles turned to face out
  const nv = pos.length / 3, nrm = new Float32Array(pos.length), e = cell * 0.5;
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2];
    const gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[v] = gx / l; nrm[v + 1] = gy / l; nrm[v + 2] = gz / l;
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
    const qx = uy * wz - uz * wy, qy = uz * wx - ux * wz, qz = ux * wy - uy * wx;
    if (qx * (nrm[a] + nrm[b] + nrm[c]) + qy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + qz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]) < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
  return { pos: new Float32Array(pos), nrm, idx: nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), nv };
}

// ------------------------------------------------------------------ the skeleton
export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavL', 'upperArmL', 'foreArmL', 'handL', 'clavR', 'upperArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 7, 2, 9, 10, 11, 0, 13, 14, 0, 16, 17];
const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
// blend radius across each bone's joint with its parent (m)
const BLEND = { spine: 0.07, chest: 0.08, neck: 0.04, head: 0.035, clavL: 0.05, clavR: 0.05, upperArmL: 0.06, upperArmR: 0.06, foreArmL: 0.045, foreArmR: 0.045,
  handL: 0.03, handR: 0.03, thighL: 0.07, thighR: 0.07, shinL: 0.055, shinR: 0.055, footL: 0.04, footR: 0.04 };

// joints of an A-pose body (model frame: facing +Z, its left = +X, feet on y = 0) from a few proportions
function joints(P) {
  const s = P.h / 1.8, J = {};
  const v = (x, y, z) => [x, y * s, z];
  J.hips = v(0, 0.97, 0); J.spine = v(0, 1.08, -0.008); J.chest = v(0, 1.27, -0.015); J.neck = v(0, 1.49 + P.neckLen, -0.02 - P.hunch * 0.5); J.head = v(0, 1.57 + P.neckLen * 1.4, -0.005 - P.hunch);
  J.headTop = v(0, 1.8 + P.neckLen * 1.4, -0.01 - P.hunch);
  const a = P.armAngle * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
  for (const [sg, L] of [[1, 'L'], [-1, 'R']]) {
    J['clav' + L] = v(sg * 0.025, 1.455, -0.01);
    const sh = J['upperArm' + L] = [sg * P.shoulderW, 1.43 * s, -0.025];
    const el = J['foreArm' + L] = [sh[0] + sg * dx * P.upper, sh[1] + dy * P.upper, sh[2] - 0.005];
    const wr = J['hand' + L] = [el[0] + sg * dx * P.fore, el[1] + dy * P.fore, el[2] + 0.01];
    J['handTip' + L] = [wr[0] + sg * dx * P.hand, wr[1] + dy * P.hand, wr[2] + 0.005];
    J['thigh' + L] = [sg * P.hipW, 0.935 * s, 0.0];
    J['shin' + L] = [sg * (P.hipW + 0.008), (0.935 * s - P.thigh), 0.012];
    J['foot' + L] = [sg * (P.hipW + 0.012), 0.085 * s, -0.03];
    J['toe' + L] = [sg * (P.hipW + 0.022), 0.02, -0.03 + P.foot];
  }
  return J;
}
const TAIL = { hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head', head: 'headTop', clavL: 'upperArmL', upperArmL: 'foreArmL', foreArmL: 'handL', handL: 'handTipL',
  clavR: 'upperArmR', upperArmR: 'foreArmR', foreArmR: 'handR', handR: 'handTipR', thighL: 'shinL', shinL: 'footL', footL: 'toeL', thighR: 'shinR', shinR: 'footR', footR: 'toeR' };

// ------------------------------------------------------------------ skinning weights
function skin(m, sculpt, J) {
  const { pos, idx, nv } = m;
  const W = new Float32Array(nv * BONES.length), owner = new Array(nv), dirs = BONES.map(n => { const h = J[n], t = J[TAIL[n]]; const d = [t[0] - h[0], t[1] - h[1], t[2] - h[2]], l = Math.hypot(...d); return d.map(x => x / l); });
  const children = BONES.map((_, i) => PARENT.map((p, c) => p === i ? c : -1).filter(c => c >= 0));
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let v = 0; v < nv; v++) {
    const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
    const o = owner[v] = sculpt.owner(x, y, z), b = o.bone;
    // the nearest joint of the owner bone: with its parent (its own head) or with one of its children (their heads)
    let jb = PARENT[b] >= 0 ? b : -1, jd = jb >= 0 ? Math.hypot(x - J[BONES[b]][0], y - J[BONES[b]][1], z - J[BONES[b]][2]) : 1e9;
    for (const c of children[b]) { const h = J[BONES[c]], d = Math.hypot(x - h[0], y - h[1], z - h[2]); if (d < jd) { jd = d; jb = c; } }
    if (jb < 0) { W[v * BONES.length + b] = 1; continue; }
    const h = J[BONES[jb]], d = dirs[jb], s = (x - h[0]) * d[0] + (y - h[1]) * d[1] + (z - h[2]) * d[2], R = BLEND[BONES[jb]];
    const w = ss(-R, R, s);                                     // 0 on the parent's side of the joint, 1 on the child's
    W[v * BONES.length + jb] += w; W[v * BONES.length + PARENT[jb]] += 1 - w;
  }
  // smooth across the mesh (seams where neighbouring vertices belong to parts of different bones)
  const nb = Array.from({ length: nv }, () => []);
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], c = idx[t + (e + 1) % 3]; nb[a].push(c); nb[c].push(a); }
  const NB = BONES.length;
  for (let it = 0; it < 4; it++) {
    const W2 = new Float32Array(W.length);
    for (let v = 0; v < nv; v++) {
      const L = nb[v]; if (!L.length) { for (let k = 0; k < NB; k++) W2[v * NB + k] = W[v * NB + k]; continue; }
      for (let k = 0; k < NB; k++) { let s = 0; for (const u of L) s += W[u * NB + k]; W2[v * NB + k] = 0.5 * W[v * NB + k] + 0.5 * s / L.length; }
    }
    W.set(W2);
  }
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const top = [];
    for (let k = 0; k < NB; k++) { const w = W[v * NB + k]; if (w > 1e-4) top.push([w, k]); }
    top.sort((a, b) => b[0] - a[0]);
    const t4 = top.slice(0, 4), s = t4.reduce((a, e) => a + e[0], 0) || 1;
    t4.forEach(([w, k], i) => { si[v * 4 + i] = k; sw[v * 4 + i] = w / s; });
  }
  return { si, sw, owner };
}

// ------------------------------------------------------------------ material: regions and fine detail in the shader
// region -> [colour (sRGB hex), material class]: 0 skin, 1 cloth, 2 hair, 3 shoe, 4 eye, 5 mouth / socket, 6 creature skin
const NOISE = /* glsl */`
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
// distance to the nearest cell border of a 3D Worley pattern (cracks)
float crack(vec3 p) { vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec3 g = vec3(x, y, z), o = vec3(h3(i + g), h3(i + g + 7.1), h3(i + g + 13.7));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return d2 - d1; }
`;
function castMaterial(kind) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.userData.noWet = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMat; attribute vec3 aRest; varying float vMat; varying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vRest = aRest;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMat; varying vec3 vRest;\n' + NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float mc = floor(vMat + 0.5);
      float grain = fbm(vRest * 140.0);
      float rough = 0.55;
      if (mc < 0.5) { diffuseColor.rgb *= 0.92 + 0.16 * fbm(vRest * 60.0); rough = 0.5 + 0.12 * grain; }                 // skin: blotches, pores
      else if (mc < 1.5) { float w = fbm(vRest * vec3(18.0, 6.0, 18.0)); diffuseColor.rgb *= 0.86 + 0.24 * w; rough = 0.88; }   // cloth: folds
      else if (mc < 2.5) { diffuseColor.rgb *= 0.7 + 0.5 * fbm(vRest * 220.0); rough = 0.72; }                          // hair: strands, curls
      else if (mc < 3.5) { rough = 0.6; }                                                                                 // shoes
      else if (mc < 4.5) { rough = 0.08; }                                                                                // eyes: wet
      else if (mc < 5.5) { rough = 0.5; }                                                                                 // mouth, sockets
      else {                                                                                                              // the creature
        float c = crack(vRest * 22.0), c2 = crack(vRest * 70.0 + 3.0);
        float lines = (1.0 - smoothstep(0.0, 0.045, c)) * 0.8 + (1.0 - smoothstep(0.0, 0.035, c2)) * 0.3;
        float bl = fbm(vRest * 9.0);
        float wr = fbm(vRest * vec3(160.0, 60.0, 160.0));
        diffuseColor.rgb *= (0.74 + 0.4 * bl) * (1.0 - 0.55 * clamp(lines, 0.0, 1.0)) * (0.84 + 0.3 * wr);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.95, 0.88, 0.84), smoothstep(0.55, 0.8, fbm(vRest * 4.0)));
        rough = 0.62 + 0.25 * lines;
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rough;');
  };
  m.customProgramCacheKey = () => 'cast-' + kind;
  return m;
}

// ------------------------------------------------------------------ the actor: mesh + skeleton + posing
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m3 = new THREE.Matrix4();
function frame(x, n, out) {                       // rotation whose X axis is x and whose Z axis is n (made orthogonal)
  const X = _v.copy(x).normalize(), Z = _v2.copy(n).addScaledVector(X, -n.dot(X)).normalize(), Y = new THREE.Vector3().crossVectors(Z, X);
  _m3.makeBasis(X, Y, Z);
  return out.setFromRotationMatrix(_m3);
}

export class Actor {
  constructor(def) {
    const J = this.J = joints(def.P);
    const sc = new Sculpt();
    def.sculpt(sc, J, def.P);
    const t0 = performance.now();
    const m = mesh(sc.sdf(), sc.bounds(0.03), def.cell);
    const { si, sw, owner } = skin(m, sc, J);
    // regions -> colour and material class
    const col = new Float32Array(m.nv * 3), mat = new Float32Array(m.nv), c = new THREE.Color();
    for (let v = 0; v < m.nv; v++) {
      const x = m.pos[3 * v], y = m.pos[3 * v + 1], z = m.pos[3 * v + 2];
      const [hex, cls] = def.paint(owner[v], x, y, z, J);
      c.set(hex); col[3 * v] = c.r; col[3 * v + 1] = c.g; col[3 * v + 2] = c.b; mat[v] = cls;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMat', new THREE.BufferAttribute(mat, 1));
    g.setAttribute('aRest', new THREE.BufferAttribute(m.pos.slice(), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    // bones in the rest pose (identity rotations: each bone's frame is the model frame)
    this.bones = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
    this.bones.forEach((b, i) => {
      const h = J[BONES[i]], p = PARENT[i] >= 0 ? J[BONES[PARENT[i]]] : [0, 0, 0];
      b.position.set(h[0] - p[0], h[1] - p[1], h[2] - p[2]);
      if (PARENT[i] >= 0) this.bones[PARENT[i]].add(b);
    });
    this.rest = this.bones.map(b => b.position.clone());
    this.mesh = new THREE.SkinnedMesh(g, castMaterial(def.kind));
    this.mesh.add(this.bones[0]);
    this.bones[0].updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;                    // (posed far from the rest pose: thrown, upside down)
    this.mesh.name = def.kind;
    this.stats = { verts: m.nv, tris: m.idx.length / 3, ms: Math.round(performance.now() - t0) };
    this.len = {};
    for (const n of BONES) { const h = J[n], t = J[TAIL[n]]; this.len[n] = Math.hypot(t[0] - h[0], t[1] - h[1], t[2] - h[2]); }
    this.restDir = BONES.map(n => { const h = J[n], t = J[TAIL[n]]; return new THREE.Vector3(t[0] - h[0], t[1] - h[1], t[2] - h[2]).normalize(); });
    // model-space bone transforms (positions of heads, rotations) after posing
    this.mq = BONES.map(() => new THREE.Quaternion()); this.mp = BONES.map(() => new THREE.Vector3());
  }
  // forward kinematics into the model (= stage) frame, from bone `from` down its subtree (all bones if omitted)
  fk() {
    for (let i = 0; i < BONES.length; i++) {
      const b = this.bones[i], p = PARENT[i];
      if (p < 0) { this.mq[i].copy(b.quaternion); this.mp[i].copy(b.position); }
      else { this.mq[i].multiplyQuaternions(this.mq[p], b.quaternion); this.mp[i].copy(b.position).applyQuaternion(this.mq[p]).add(this.mp[p]); }
    }
  }
  // the stage-frame position of a point fixed to a bone (offset in the bone's rest frame)
  point(bone, off, out = new THREE.Vector3()) { const i = B[bone]; return out.set(off[0], off[1], off[2]).applyQuaternion(this.mq[i]).add(this.mp[i]); }
  tip(bone, out = new THREE.Vector3()) { const i = B[bone]; return out.copy(this.restDir[i]).multiplyScalar(this.len[bone]).applyQuaternion(this.mq[i]).add(this.mp[i]); }
  // two-bone IK (upper, lower, end): the end's head reaches `target`, the middle joint bends towards `pole`.
  // restPole: the direction the middle joint bends towards in the rest pose (model frame)
  ik(upper, target, pole, restPole, endQ = null) {
    const u = B[upper], l = u + 1, e = u + 2;
    this.fk();
    const S = this.mp[u], a = this.len[BONES[u]], b = this.len[BONES[l]];
    const d = new THREE.Vector3().subVectors(target, S), dist = Math.min(Math.max(d.length(), 0.02), (a + b) * 0.9995);
    d.normalize();
    const toPole = new THREE.Vector3().subVectors(pole, S); toPole.addScaledVector(d, -toPole.dot(d));
    if (toPole.lengthSq() < 1e-8) toPole.set(0, 0, 1).addScaledVector(d, -d.z);
    toPole.normalize();
    const cosA = Math.max(-1, Math.min(1, (a * a + dist * dist - b * b) / (2 * a * dist))), sinA = Math.sqrt(1 - cosA * cosA);
    const E = new THREE.Vector3().copy(S).addScaledVector(d, a * cosA).addScaledVector(toPole, a * sinA);
    const T = new THREE.Vector3().copy(S).addScaledVector(d, dist);
    const nT = new THREE.Vector3().crossVectors(d, toPole).normalize();
    const nR = new THREE.Vector3().crossVectors(this.restDir[u], restPole).normalize();
    const dirU = new THREE.Vector3().subVectors(E, S).normalize(), dirL = new THREE.Vector3().subVectors(T, E).normalize();
    const qU = frame(dirU, nT, new THREE.Quaternion()).multiply(frame(this.restDir[u], nR, _q).invert());
    const qL = frame(dirL, nT, new THREE.Quaternion()).multiply(frame(this.restDir[l], nR, _q).invert());
    this.bones[u].quaternion.copy(_q2.copy(this.mq[PARENT[u]]).invert().multiply(qU));
    this.bones[l].quaternion.copy(_q2.copy(qU).invert().multiply(qL));
    if (endQ) this.bones[e].quaternion.copy(_q2.copy(qL).invert().multiply(endQ));
    this.fk();
  }
}
export { B as BONE_INDEX, PARENT as BONE_PARENT };

// ------------------------------------------------------------------ the three bodies
// paint helpers: how far along a bone (0 at its head, 1 at its tail) a point lies
function along(J, bone, x, y, z) {
  const h = J[bone], t = J[TAIL[bone]], d = [t[0] - h[0], t[1] - h[1], t[2] - h[2]], l2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
  return ((x - h[0]) * d[0] + (y - h[1]) * d[1] + (z - h[2]) * d[2]) / l2;
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// a man: trunk, limbs, head; `build` tweaks the proportions (muscle, belly) and adds hair
function manSculpt(sc, J, P) {
  const s = P.h / 1.8, mu = P.muscle, fat = P.belly;
  // pelvis, glutes, belly, ribcage, chest, back
  sc.at(B.hips, 'pelvis', 0.05).ell([0, 0.975 * s, -0.005], [0.158, 0.11, 0.112]);
  for (const sg of [1, -1]) sc.ell([sg * 0.072, 0.925 * s, -0.062], [0.082, 0.095, 0.075]);
  sc.at(B.spine, 'belly', 0.06).ell([0, 1.1 * s, 0.012 + fat * 0.02], [0.142 + fat * 0.012, 0.12, 0.1 + fat * 0.035]);
  sc.at(B.chest, 'chest', 0.06).ell([0, 1.28 * s, -0.004], [0.165 + mu * 0.012, 0.165, 0.118 + mu * 0.006]);
  for (const sg of [1, -1]) {
    sc.ell([sg * 0.074, 1.335 * s, 0.062 + mu * 0.008], [0.085 + mu * 0.012, 0.064 + mu * 0.006, 0.046 + mu * 0.012], { k: 0.04, bone: B.chest, region: 'chest' });   // pecs
    sc.ell([sg * (0.118 + mu * 0.012), 1.29 * s, -0.035], [0.07 + mu * 0.01, 0.13, 0.078], { k: 0.05, bone: B.chest, region: 'chest' });                             // lats
    sc.at(B.chest, 'trap', 0.04).cap([sg * 0.035, 1.5 * s, -0.035], [sg * (P.shoulderW - 0.02), 1.45 * s, -0.03], 0.05 + mu * 0.012, 0.04 + mu * 0.008);
  }
  // neck and head
  sc.at(B.neck, 'neck', 0.035).cap([0, J.neck[1] - 0.03, -0.02], [0, J.head[1] + 0.02, 0.0], 0.058 + mu * 0.008, 0.052);
  const hy = J.head[1];
  sc.at(B.head, 'head', 0.03).ell([0, hy + 0.13, -0.004], [0.077, 0.1, 0.095]);              // skull
  sc.ell([0, hy + 0.16, -0.018], [0.081, 0.08, 0.094]);                                      // cranium
  sc.ell([0, hy + 0.06, 0.035], [0.062, 0.045, 0.058], { region: 'jaw' });                   // jaw
  sc.ell([0, hy + 0.04, 0.072], [0.03, 0.022, 0.024], { region: 'chin', k: 0.025 });         // chin
  for (const sg of [1, -1]) {
    sc.ell([sg * 0.05, hy + 0.115, 0.06], [0.026, 0.02, 0.025], { region: 'cheek', k: 0.025 });          // cheekbones
    sc.ell([sg * 0.079, hy + 0.115, -0.008], [0.012, 0.03, 0.02], { region: 'ear', k: 0.012 });           // ears
  }
  sc.ell([0, hy + 0.148, 0.073], [0.064, 0.017, 0.022], { region: 'brow', k: 0.02 });       // brow ridge
  sc.cap([0, hy + 0.135, 0.088], [0, hy + 0.1, 0.105], 0.009, 0.015, { region: 'nose', k: 0.012 });       // nose
  sc.ell([0, hy + 0.098, 0.096], [0.016, 0.009, 0.012], { region: 'nose', k: 0.012 });
  sc.ell([0, hy + 0.07, 0.088], [0.024, 0.0085, 0.012], { region: 'lip', k: 0.008 });       // lips
  for (const sg of [1, -1]) sc.cut('ell', [sg * 0.031, hy + 0.122, 0.0935], [0.016, 0.0105, 0.0085], { region: 'socket', k: 0.012 });
  for (const sg of [1, -1]) sc.ell([sg * 0.031, hy + 0.122, 0.0815], [0.0108, 0.0108, 0.0108], { region: 'eye', layer: 2, k: 0.003 });
  // arms
  for (const [sg, L] of [[1, 'L'], [-1, 'R']]) {
    const sh = J['upperArm' + L], el = J['foreArm' + L], wr = J['hand' + L], tip = J['handTip' + L];
    sc.at(B['upperArm' + L], 'delt', 0.04).ell([sh[0] + sg * 0.012, sh[1] - 0.01, sh[2]], [0.058 + mu * 0.012, 0.07, 0.062 + mu * 0.01]);
    sc.at(B['upperArm' + L], 'arm', 0.035).cap(lerp3(sh, el, 0.1), el, 0.05 + mu * 0.012, 0.04);
    sc.ell(lerp3(sh, el, 0.5).map((v, i) => v + [0, 0, 0.02][i]), [0.04 + mu * 0.014, 0.07, 0.04 + mu * 0.014], { k: 0.04 });   // biceps
    sc.at(B['foreArm' + L], 'forearm', 0.03).cap(el, lerp3(el, wr, 0.95), 0.042 + mu * 0.008, 0.028);
    sc.ell(lerp3(el, wr, 0.3), [0.042 + mu * 0.008, 0.06, 0.04], { k: 0.035 });
    // hand: palm, four fingers slightly curled, thumb
    sc.at(B['hand' + L], 'hand', 0.015);
    const ax = [tip[0] - wr[0], tip[1] - wr[1], tip[2] - wr[2]], al = Math.hypot(...ax), u = ax.map(v => v / al), side = [0, 0, 1];
    const pc = lerp3(wr, tip, 0.33);
    sc.ell(pc, [0.03, 0.045, 0.015].map(v => v), { k: 0.02 });
    for (let f = 0; f < 4; f++) {
      const o = (f - 1.5) * 0.019, base = [pc[0] + u[0] * 0.04 + side[0] * o, pc[1] + u[1] * 0.04, pc[2] + side[2] * o];
      const len = [0.07, 0.08, 0.075, 0.06][f];
      const mid = [base[0] + u[0] * len * 0.55 - sg * 0.006, base[1] + u[1] * len * 0.55, base[2] + u[2] * len * 0.55];
      const end = [base[0] + u[0] * len - sg * 0.02, base[1] + u[1] * len, base[2] + u[2] * len];
      sc.cap(base, mid, 0.0095, 0.0085, { k: 0.008 }); sc.cap(mid, end, 0.0085, 0.007, { k: 0.008 });
    }
    const tb = [pc[0] - sg * 0.004, pc[1] + 0.01, pc[2] + 0.028];
    sc.cap(tb, [tb[0] + u[0] * 0.05, tb[1] + u[1] * 0.05, tb[2] + 0.03], 0.011, 0.008, { k: 0.01 });
  }
  // legs and shoes
  for (const [sg, L] of [[1, 'L'], [-1, 'R']]) {
    const hp = J['thigh' + L], kn = J['shin' + L], an = J['foot' + L], toe = J['toe' + L];
    sc.at(B['thigh' + L], 'thigh', 0.05).cap(lerp3(hp, kn, 0.05), kn, 0.082 + mu * 0.008, 0.055);
    sc.ell(lerp3(hp, kn, 0.4).map((v, i) => v + [0, 0, 0.02][i]), [0.07 + mu * 0.01, 0.15, 0.072], { k: 0.05 });   // quads
    sc.at(B['shin' + L], 'shin', 0.035).cap(kn, an, 0.05, 0.034);
    sc.ell(lerp3(kn, an, 0.28).map((v, i) => v + [0, 0, -0.025][i]), [0.048 + mu * 0.006, 0.1, 0.05], { k: 0.04 });   // calf
    sc.at(B['foot' + L], 'shoe', 0.025).ell([an[0], 0.055, an[2] + 0.035], [0.05, 0.05, 0.075]);
    sc.cap([an[0], 0.04, an[2] - 0.03], [toe[0], 0.04, toe[2]], 0.045, 0.042, { k: 0.03 });
  }
}

function manPaint(look) {
  return (o, x, y, z, J) => {
    const r = o.region, s = 1;
    const skin = look.skin;
    if (r === 'eye') {
      const ex = Math.abs(x) - 0.031, ey = y - J.head[1] - 0.122, rr = ex * ex + ey * ey;
      return z > 0.086 && rr < 0.0026 * 0.0026 ? [0x0c0806, 4] : z > 0.086 && rr < 0.006 * 0.006 ? [look.iris ?? 0x4a3020, 4] : [0xe2dcd2, 4];
    }
    if (r === 'socket') return [skin, 0];
    if (r === 'lip') return [look.lip, 0];
    if (r === 'shoe') return y < 0.022 ? [0xdedad2, 3] : [look.shoe, 3];          // the sole
    if (r === 'hair') return [look.hair, 2];
    const hy = J.head[1];
    // hair: above the hairline, down the sides to the sideburns, over the back; the eyebrows
    if (o.bone === B.head && r !== 'ear' && r !== 'eye' && r !== 'nose') {
      if (y > hy + 0.178 + Math.max(0, z - 0.04) * 0.3 || (z < 0.035 && Math.abs(x) > 0.062 && y > hy + 0.125) || (z < -0.03 && y > hy + 0.06)) return [look.hair, 2];
      if (r === 'brow' && z > 0.075 && y > hy + 0.141 && Math.abs(x) > 0.012 && Math.abs(x) < 0.058) return [look.hair, 2];
    }
    // beard: jaw, chin, cheeks below the cheekbones, upper lip
    if (look.beard && o.bone === B.head && r !== 'nose' && r !== 'ear' && r !== 'socket' && r !== 'lip' && r !== 'eye') {
      const mou = Math.abs(x) < 0.032 && y > hy + 0.074 && y < hy + 0.093 && z > 0.07;            // the moustache
      if (mou || (z > -0.025 && y < hy + 0.088 - Math.max(0, 0.03 - Math.abs(x)) * 0.4)) return [look.beard, 2];
    }
    if (look.top === 'tank') {
      const torso = o.bone === B.chest || o.bone === B.spine || (o.bone === B.hips && y > 1.0 * s);
      if (torso && r !== 'trap') {
        // a scoop neckline in front, deep armholes at the sides
        const neckline = z > 0 ? 1.37 + Math.abs(x) * 0.9 : 1.44 + Math.abs(x) * 0.4;
        const armhole = Math.abs(x) > 0.13 && y > 1.24;
        if (y < neckline && !armhole) return [look.shirt, 1];
      }
      if (r === 'trap' && Math.abs(x) > 0.055 && Math.abs(x) < 0.1 && y < 1.5) return [look.shirt, 1];       // the straps
    } else {
      const torso = o.bone === B.chest || o.bone === B.spine || o.bone === B.clavL || o.bone === B.clavR || r === 'trap' || (o.bone === B.hips && y > 0.99 * s);
      if (torso && !(o.bone === B.chest && z > 0.03 && y > 1.45 - Math.abs(x) * 0.3)) return [look.shirt, 1];
      for (const L of ['L', 'R']) if (o.bone === B['upperArm' + L] && along(J, 'upperArm' + L, x, y, z) < 0.55) return [look.shirt, 1];
    }
    // trousers / shorts
    if (o.bone === B.hips) return [look.pants, 1];
    for (const L of ['L', 'R']) {
      if (o.bone === B['thigh' + L]) return look.shorts && along(J, 'thigh' + L, x, y, z) > 0.62 ? [skin, 0] : [look.pants, 1];
      if (o.bone === B['shin' + L]) {
        if (look.shorts) return along(J, 'shin' + L, x, y, z) > 0.86 ? [look.sock, 1] : [skin, 0];
        return [look.pants, 1];
      }
      if (o.bone === B['foreArm' + L] && look.band === L) { const t = along(J, 'foreArm' + L, x, y, z); if (t > 0.86 && t < 0.95) return [0x18191b, 3]; }
    }
    return [skin, 0];
  };
}

// curly hair: a mass of small lumps over the cranium (seeded, the same each time)
function curls(sc, J, n, seed, rad, lift) {
  let a = seed;
  const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  const hy = J.head[1];
  sc.at(B.head, 'hair', 0.016);
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2, ph = Math.acos(1 - rnd() * 1.15);         // the top and the sides of the head
    const dx = Math.sin(ph) * Math.sin(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.cos(th);
    if (dz > 0.55 && dy < 0.55) continue;                                     // not over the forehead / face
    const r = rad * (0.75 + 0.5 * rnd());
    sc.ell([dx * 0.085, hy + 0.15 + dy * 0.085 + lift, -0.018 + dz * 0.095], [r, r * 0.9, r]);
  }
}

// the creature: a tall, starved, hairless body, ribs and joints showing, long fingers, gaping mouth, deep sockets
function creatureSculpt(sc, J, P) {
  const s = P.h / 1.8;
  sc.at(B.hips, 'skin', 0.035).ell([0, 0.975 * s, -0.005], [0.118, 0.085, 0.085]);
  for (const sg of [1, -1]) { sc.ell([sg * 0.098, 1.03 * s, 0.018], [0.03, 0.03, 0.035], { k: 0.025 }); sc.ell([sg * 0.06, 0.92 * s, -0.05], [0.055, 0.07, 0.055], { k: 0.04 }); }
  sc.at(B.spine, 'skin', 0.05).cap([0, 1.0 * s, 0.0], [0, 1.18 * s, -0.012], 0.084, 0.09);                 // the starved waist
  sc.at(B.chest, 'skin', 0.05).ell([0, 1.3 * s, -0.01], [0.148, 0.16, 0.104]);                             // ribcage
  for (let i = 0; i < 7; i++) {                                                                            // ribs under the skin
    const y = (1.4 - i * 0.034) * s, rx = 0.146 - Math.abs(i - 2) * 0.006, rz = 0.104 - Math.abs(i - 3) * 0.004;
    let prev = null;
    for (let k = 0; k <= 6; k++) {
      const th = -1.25 + k * 0.4167, p = [Math.sin(th) * (rx + 0.002), y - Math.abs(th) * 0.03, Math.cos(th) * (rz + 0.002) - 0.01];
      if (prev) sc.cap(prev, p, 0.0058, 0.0058, { k: 0.02 });
      prev = p;
    }
  }
  sc.cap([0, 1.44 * s, 0.098], [0, 1.24 * s, 0.093], 0.009, 0.007, { k: 0.012 });                         // sternum
  for (const sg of [1, -1]) {
    sc.cap([sg * 0.02, 1.452 * s, 0.062], [sg * (P.shoulderW - 0.015), 1.448 * s, -0.004], 0.0085, 0.009, { k: 0.022 });   // collarbones
    sc.cap([sg * 0.03, 1.49 * s, -0.04], [sg * (P.shoulderW - 0.02), 1.45 * s, -0.035], 0.03, 0.025, { k: 0.03 });   // a thin trapezius
    sc.ell([sg * 0.08, 1.33 * s, -0.07], [0.04, 0.1, 0.035], { k: 0.04 });                                            // shoulder blades
  }
  // the neck: thin, tendons standing out
  sc.at(B.neck, 'skin', 0.025).cap([0, J.neck[1] - 0.02, -0.03], [0, J.head[1] + 0.03, -0.01], 0.034, 0.03);
  for (const sg of [1, -1]) sc.cap([sg * 0.042, J.head[1] + 0.06, -0.012], [sg * 0.016, J.neck[1] - 0.035, 0.05], 0.0085, 0.0075, { k: 0.022 });
  // the head: long bald skull, sharp cheekbones, sunken cheeks, deep sockets, a gaping mouth
  const hy = J.head[1];
  sc.at(B.head, 'skin', 0.025).ell([0, hy + 0.14, -0.02], [0.08, 0.12, 0.104]);
  sc.ell([0, hy + 0.19, -0.035], [0.082, 0.075, 0.1]);
  for (const sg of [1, -1]) sc.ell([sg * 0.052, hy + 0.105, 0.05], [0.022, 0.018, 0.026], { k: 0.015 });   // cheekbones
  sc.ell([0, hy + 0.148, 0.066], [0.06, 0.015, 0.02], { k: 0.02 });                                        // brow
  sc.cap([0, hy + 0.135, 0.078], [0, hy + 0.1, 0.09], 0.008, 0.011, { k: 0.01 });                          // the nose's ridge
  sc.ell([0, hy + 0.03, 0.05], [0.042, 0.036, 0.042], { k: 0.035 });                                       // the dropped jaw
  for (const sg of [1, -1]) sc.cut('ell', [sg * 0.055, hy + 0.07, 0.045], [0.02, 0.03, 0.03], { region: 'skin', k: 0.03 });      // hollow cheeks
  for (const sg of [1, -1]) sc.cut('ell', [sg * 0.033, hy + 0.125, 0.08], [0.028, 0.025, 0.03], { region: 'socket', k: 0.012 });
  sc.cut('ell', [0, hy + 0.068, 0.085], [0.027, 0.048, 0.04], { region: 'mouth', k: 0.016 });
  for (const sg of [1, -1]) sc.ell([sg * 0.033, hy + 0.122, 0.062], [0.011, 0.011, 0.011], { region: 'eye', layer: 2, k: 0.003 });
  for (let t = 0; t < 6; t++) {                                                                            // teeth, top and bottom
    const x = (t - 2.5) * 0.009;
    sc.cap([x, hy + 0.1, 0.075], [x, hy + 0.088, 0.077], 0.0035, 0.0028, { region: 'tooth', layer: 2, k: 0.002 });
    sc.cap([x, hy + 0.036, 0.07], [x, hy + 0.047, 0.072], 0.0033, 0.0026, { region: 'tooth', layer: 2, k: 0.002 });
  }
  // arms: thin, knobby elbows, long spread fingers
  for (const [sg, L] of [[1, 'L'], [-1, 'R']]) {
    const sh = J['upperArm' + L], el = J['foreArm' + L], wr = J['hand' + L], tip = J['handTip' + L];
    sc.at(B['upperArm' + L], 'skin', 0.025).ell([sh[0], sh[1] - 0.005, sh[2]], [0.04, 0.045, 0.04]);
    sc.cap(sh, el, 0.034, 0.026);
    sc.at(B['foreArm' + L], 'skin', 0.02).ell(el, [0.03, 0.03, 0.03]);
    sc.cap(el, wr, 0.027, 0.018);
    sc.at(B['hand' + L], 'skin', 0.012);
    const ax = [tip[0] - wr[0], tip[1] - wr[1], tip[2] - wr[2]], al = Math.hypot(...ax), u = ax.map(v => v / al);
    const pc = lerp3(wr, tip, 0.22);
    sc.ell(pc, [0.024, 0.035, 0.011], { k: 0.015 });
    // four long fingers side by side across the palm (front to back), fanned out and hooked towards the palm (the body)
    for (let f = 0; f < 4; f++) {
      const o = (f - 1.5), dir = [u[0], u[1], o * 0.22];
      const dl = Math.hypot(...dir); dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
      let p = [pc[0] + u[0] * 0.03, pc[1] + u[1] * 0.03, pc[2] + o * 0.013];
      const len = [0.105, 0.125, 0.12, 0.095][f];
      for (let k = 0; k < 3; k++) {
        const l = len / 3, hook = (k + 1) * 0.009;
        const q = [p[0] + dir[0] * l - sg * hook, p[1] + dir[1] * l, p[2] + dir[2] * l];
        sc.cap(p, q, 0.0085 - k * 0.0012, 0.0078 - k * 0.0013, { k: 0.006, region: k === 2 ? 'nail' : 'skin' });
        p = q;
      }
    }
    const tb = [pc[0], pc[1] + 0.005, pc[2] + 0.02];
    sc.cap(tb, [tb[0] + u[0] * 0.045, tb[1] + u[1] * 0.045, tb[2] + 0.035], 0.009, 0.0065, { k: 0.008 });
  }
  // legs: thin thighs, big knees, bony shins, long feet and toes
  for (const [sg, L] of [[1, 'L'], [-1, 'R']]) {
    const hp = J['thigh' + L], kn = J['shin' + L], an = J['foot' + L], toe = J['toe' + L];
    sc.at(B['thigh' + L], 'skin', 0.035).cap(lerp3(hp, kn, 0.05), kn, 0.058, 0.04);
    sc.at(B['shin' + L], 'skin', 0.025).ell(kn, [0.038, 0.04, 0.04]);
    sc.cap(kn, an, 0.034, 0.022);
    sc.at(B['foot' + L], 'skin', 0.018).ell([an[0], 0.045, an[2] + 0.03], [0.034, 0.035, 0.06]);
    for (let t = 0; t < 4; t++) { const ox = (t - 1.5) * 0.017 * sg; sc.cap([an[0] + ox, 0.03, an[2] + 0.075], [an[0] + ox * 1.15, 0.012, toe[2] + 0.02 - t * 0.008], 0.0095, 0.007, { k: 0.012 }); }
  }
}
function creaturePaint(o, x, y, z, J) {
  const r = o.region;
  if (r === 'eye') return [0xd9d5c4, 4];
  if (r === 'socket') return [0x1c1915, 5];
  if (r === 'mouth') return [0x170d0b, 5];
  if (r === 'tooth') return [0x9d9481, 5];
  if (r === 'nail') return [0x6c655a, 6];
  return [0x9c9688, 6];
}

export const CAST = {
  // the one in the black tank top: tall, very muscular, short dark hair, black shorts, black trainers, a watch
  tank: { kind: 'tank', cell: 0.0085, P: { h: 1.83, shoulderW: 0.205, hipW: 0.092, armAngle: 47, upper: 0.3, fore: 0.265, hand: 0.19, thigh: 0.445, foot: 0.25, neckLen: 0, hunch: 0, muscle: 1, belly: 0 },
    sculpt: manSculpt, paint: manPaint({ top: 'tank', skin: 0xc79a80, lip: 0xa86a5c, hair: 0x231a14, shirt: 0x141416, pants: 0x161618, shorts: true, sock: 0x111112, shoe: 0x1a1a1c, band: 'L' }) },
  // the one in the cream T-shirt: broad and fit, curly dark hair, a full dark beard, black trousers
  tee: { kind: 'tee', cell: 0.0085, P: { h: 1.79, shoulderW: 0.198, hipW: 0.095, armAngle: 47, upper: 0.295, fore: 0.26, hand: 0.185, thigh: 0.44, foot: 0.25, neckLen: 0, hunch: 0, muscle: 0.7, belly: 0.12 },
    sculpt: (sc, J, P) => { manSculpt(sc, J, P); curls(sc, J, 70, 91, 0.026, 0.012); }, paint: manPaint({ skin: 0xbb8d70, lip: 0x9e6355, hair: 0x15100d, beard: 0x1f1712, shirt: 0xe3dccb, pants: 0x18181a, shorts: false, shoe: 0x1c1c1e }) },
  // the creature
  creature: { kind: 'creature', cell: 0.0072, P: { h: 1.9, shoulderW: 0.175, hipW: 0.08, armAngle: 44, upper: 0.34, fore: 0.33, hand: 0.25, thigh: 0.48, foot: 0.27, neckLen: 0.02, hunch: 0.02, muscle: 0, belly: 0 },
    sculpt: creatureSculpt, paint: creaturePaint },
};
