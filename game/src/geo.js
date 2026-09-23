/**
 * Utilitare de geometrie: merge de BufferGeometry (fara dependinte de
 * three/examples), constructori de forme si registru de coliziuni AABB.
 */
import * as THREE from '../vendor/three.module.min.js';

const ATTRS = ['position', 'normal', 'uv', 'color'];

/** Concateneaza geometrii non-indexate/indexate intr-una singura. */
export function mergeGeos(geos) {
  const list = geos.filter(Boolean);
  if (list.length === 0) return new THREE.BufferGeometry();
  if (list.length === 1) return list[0];

  let vCount = 0, iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  const buffers = {};
  const hasColor = list.some((g) => g.attributes.color);
  for (const name of ATTRS) {
    if (name === 'color' && !hasColor) continue;
    const size = name === 'uv' ? 2 : 3;
    buffers[name] = new Float32Array(vCount * size);
    if (name === 'color') buffers[name].fill(1);
  }
  const indices = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);

  let vOff = 0, iOff = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    for (const name of ATTRS) {
      if (!buffers[name]) continue;
      const size = name === 'uv' ? 2 : 3;
      const src = g.attributes[name];
      if (src) buffers[name].set(src.array.subarray(0, n * size), vOff * size);
      else if (name === 'normal') {
        for (let i = 0; i < n; i++) buffers.normal[(vOff + i) * 3 + 1] = 1;
      }
    }
    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) indices[iOff + i] = idx[i] + vOff;
      iOff += idx.length;
    } else {
      for (let i = 0; i < n; i++) indices[iOff + i] = vOff + i;
      iOff += n;
    }
    vOff += n;
    g.dispose();
  }
  for (const name of ATTRS) {
    if (!buffers[name]) continue;
    out.setAttribute(name, new THREE.BufferAttribute(buffers[name], name === 'uv' ? 2 : 3));
  }
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Cutie cu pozitie/rotatie/scala UV aplicate direct in geometrie. */
export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0, uvScale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale !== 1) scaleUV(g, uvScale, uvScale);
  _e.set(0, ry, 0);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

/** Plan orizontal (XZ) la inaltimea y. */
export function planeXZ(w, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.PlaneGeometry(w, d, 1, 1);
  g.rotateX(-Math.PI / 2);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function cyl(rTop, rBot, h, seg, x = 0, y = 0, z = 0, rx = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

export function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
  return g;
}

/** Proiecteaza UV world-space (triplanar simplificat pe axa dominanta). */
export function worldUV(g, scale = 1) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor ? nor.getX(i) : 0), ny = Math.abs(nor ? nor.getY(i) : 1), nz = Math.abs(nor ? nor.getZ(i) : 0);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Curba catenara intre doua puncte (cabluri electrice cu burta reala). */
export function catenary(p0, p1, sag = 0.5, segments = 14) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = p0.x + (p1.x - p0.x) * t;
    const y = p0.y + (p1.y - p0.y) * t;
    const z = p0.z + (p1.z - p0.z) * t;
    // aproximare de catenara: parabola normalizata
    pts.push(new THREE.Vector3(x, y - sag * 4 * t * (1 - t), z));
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function wire(p0, p1, sag, radius = 0.022, seg = 14) {
  const curve = catenary(p0, p1, sag, seg);
  return new THREE.TubeGeometry(curve, seg, radius, 4, false);
}

/* ------------------------------------------------------------------ */
/* Coliziuni: registru de AABB-uri orientate pe axa Y (cu yaw optional) */
/* ------------------------------------------------------------------ */

export class ColliderSet {
  constructor(cellSize = 8) {
    this.items = [];
    this.cell = cellSize;
    this.grid = new Map();
  }

  /** hx/hz = semi-dimensiuni, yaw = rotatie in jurul Y. */
  add(cx, cz, hx, hz, yBottom, yTop, yaw = 0, tag = 'static') {
    const item = {
      cx, cz, hx, hz, yBottom, yTop, yaw,
      cos: Math.cos(-yaw), sin: Math.sin(-yaw), tag,
      r: Math.hypot(hx, hz),
    };
    this.items.push(item);
    return item;
  }

  addBox3(min, max, tag = 'static') {
    return this.add((min.x + max.x) / 2, (min.z + max.z) / 2,
      (max.x - min.x) / 2, (max.z - min.z) / 2, min.y, max.y, 0, tag);
  }

  build() {
    this.grid.clear();
    for (const it of this.items) {
      const x0 = Math.floor((it.cx - it.r) / this.cell), x1 = Math.floor((it.cx + it.r) / this.cell);
      const z0 = Math.floor((it.cz - it.r) / this.cell), z1 = Math.floor((it.cz + it.r) / this.cell);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const key = x + ',' + z;
          let arr = this.grid.get(key);
          if (!arr) { arr = []; this.grid.set(key, arr); }
          arr.push(it);
        }
      }
    }
    return this;
  }

  /** Returneaza colliderele din celulele care ating cercul (x,z,radius). */
  query(x, z, radius, out = []) {
    out.length = 0;
    const x0 = Math.floor((x - radius) / this.cell), x1 = Math.floor((x + radius) / this.cell);
    const z0 = Math.floor((z - radius) / this.cell), z1 = Math.floor((z + radius) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.grid.get(cx + ',' + cz);
        if (!arr) continue;
        for (const it of arr) if (out.indexOf(it) === -1) out.push(it);
      }
    }
    return out;
  }
}

/** Cel mai apropiat punct din AABB-ul orientat fata de (px,pz), in spatiu lume. */
export function closestOnCollider(it, px, pz, outLocal) {
  const dx = px - it.cx, dz = pz - it.cz;
  const lx = dx * it.cos - dz * it.sin;
  const lz = dx * it.sin + dz * it.cos;
  const qx = Math.max(-it.hx, Math.min(it.hx, lx));
  const qz = Math.max(-it.hz, Math.min(it.hz, lz));
  outLocal.lx = lx; outLocal.lz = lz; outLocal.qx = qx; outLocal.qz = qz;
  const c = it.cos, s = it.sin;
  outLocal.wx = it.cx + qx * c + qz * s;
  outLocal.wz = it.cz - qx * s + qz * c;
  return outLocal;
}

/**
 * Normale netede cu praguri de muchie ("smoothing groups" dupa unghi).
 * ExtrudeGeometry nu imparte varfuri intre fete, deci computeVertexNormals()
 * da shading complet fatetat - caroseria arata ca hartie pliata. Aici
 * acumulam normalele fetelor vecine care se afla sub `angleDeg` una de alta,
 * deci suprafetele line se netezesc, iar muchiile reale raman taioase.
 */
export function smoothNormals(geo, angleDeg = 48) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const vCount = pos.count;
  const triCount = idx ? idx.count / 3 : vCount / 3;
  const get = (i) => (idx ? idx.getX(i) : i);
  const cosLimit = Math.cos((angleDeg * Math.PI) / 180);
  const P = 2000;                       // toleranta de sudare: 0.5 mm

  // gruparea varfurilor coincidente
  const groups = new Map();
  const keyOf = new Array(vCount);
  for (let i = 0; i < vCount; i++) {
    const k = Math.round(pos.getX(i) * P) + '|' + Math.round(pos.getY(i) * P)
            + '|' + Math.round(pos.getZ(i) * P);
    keyOf[i] = k;
    let a = groups.get(k);
    if (!a) { a = []; groups.set(k, a); }
    a.push(i);
  }

  // normalele fetelor + lista de fete pe fiecare grup de varfuri
  const fn = new Float32Array(triCount * 3);
  const facesOf = new Map();
  const ax = [0, 0, 0], bx = [0, 0, 0];
  for (let f = 0; f < triCount; f++) {
    const a = get(f * 3), b = get(f * 3 + 1), c = get(f * 3 + 2);
    ax[0] = pos.getX(b) - pos.getX(a); ax[1] = pos.getY(b) - pos.getY(a); ax[2] = pos.getZ(b) - pos.getZ(a);
    bx[0] = pos.getX(c) - pos.getX(a); bx[1] = pos.getY(c) - pos.getY(a); bx[2] = pos.getZ(c) - pos.getZ(a);
    const nx = ax[1] * bx[2] - ax[2] * bx[1];
    const ny = ax[2] * bx[0] - ax[0] * bx[2];
    const nz = ax[0] * bx[1] - ax[1] * bx[0];
    fn[f * 3] = nx; fn[f * 3 + 1] = ny; fn[f * 3 + 2] = nz;   // lungimea = 2 x aria
    for (const v of [a, b, c]) {
      const k = keyOf[v];
      let arr = facesOf.get(k);
      if (!arr) { arr = []; facesOf.set(k, arr); }
      arr.push(f);
    }
  }

  const out = new Float32Array(vCount * 3);
  for (let f = 0; f < triCount; f++) {
    let nx = fn[f * 3], ny = fn[f * 3 + 1], nz = fn[f * 3 + 2];
    const len = Math.hypot(nx, ny, nz) || 1;
    const ux = nx / len, uy = ny / len, uz = nz / len;
    for (const v of [get(f * 3), get(f * 3 + 1), get(f * 3 + 2)]) {
      let sx = 0, sy = 0, sz = 0;
      const arr = facesOf.get(keyOf[v]);
      for (let j = 0; j < arr.length; j++) {
        const g = arr[j];
        let gx = fn[g * 3], gy = fn[g * 3 + 1], gz = fn[g * 3 + 2];
        const gl = Math.hypot(gx, gy, gz) || 1;
        if ((gx / gl) * ux + (gy / gl) * uy + (gz / gl) * uz < cosLimit) continue;
        sx += gx; sy += gy; sz += gz;    // ponderat cu aria fetei
      }
      const sl = Math.hypot(sx, sy, sz);
      if (sl > 1e-9) { out[v * 3] = sx / sl; out[v * 3 + 1] = sy / sl; out[v * 3 + 2] = sz / sl; }
      else { out[v * 3] = ux; out[v * 3 + 1] = uy; out[v * 3 + 2] = uz; }
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geo;
}
