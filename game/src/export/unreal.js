import * as THREE from 'three';
import { GEO, heightAt } from '../geo/data.js';
import { eachForestTree, eachShrub, TREE_TYPES } from '../geo/trees.js';
import { avgColor } from '../geo/geotex.js';

// Export of the built world for Unreal Engine 5 (tools/export-unreal.mjs drives it; unreal/import_poiana.py reads it).
// Everything stays in the game's frame (metres, +Y up, right-handed glTF): the Unreal script measures the importer's
// axis conversion on calibration.gltf and applies the same one to the instances, cameras and the sun.
//  * tiles/<T>.gltf: per 1 km tile the exact terrain (the game's full-resolution chunks with their 1 m patches), the
//    static world (buildings, roads, landmarks, fences, poles, wires as thin ribbons) merged per material, glass apart,
//    water apart; vertices in world space (actors at the origin), welded, uint32 indices
//  * materials.json + textures/: every material with its PBR values, texture files (flipped like three.js samples
//    them), tiling and the special ones (terrain splat shader, water, foliage, car paint, glass)
//  * trees/: one model per tree type (trunk + leaf cards) and the instances (x, y, z, yaw, scale) of the mapped trees,
//    of the whole procedural forest and of its understory, sorted by tile
//  * instances/: the other instanced meshes (street vegetation...) as asset + transforms
//  * cars/: the parked cars where they stand; manifest.json: tiles, cameras of the photos, player start, sun, origin
export const TILE = 1000;
// the photos taken from the Google car (camera 2.5 m over the road); the others from the user's phone (1.6 m)
const STREET_VIEW = (n) => (n >= 25 && n <= 39) || (n >= 42 && n <= 45) || n >= 61;

const san = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'x';
const tileName = (i, j) => `T_${i < 0 ? 'm' : 'p'}${String(Math.abs(i)).padStart(2, '0')}_${j < 0 ? 'm' : 'p'}${String(Math.abs(j)).padStart(2, '0')}`;
const lin = (c) => [c.r, c.g, c.b].map(v => +v.toFixed(5));

// ------------------------------------------------------------------ sinks
// the node driver serves PUT /__ue/<path>; in a browser a directory from the File System Access API
export function httpSink(prefix = '/__ue/') {
  return {
    rawPng: true,                                             // textures go as raw RGBA; the node side writes the PNG
    async write(path, data) {
      for (let k = 0; k < 4; k++) {
        const r = await fetch(prefix + path, { method: 'PUT', body: data }).catch(e => ({ ok: false, statusText: String(e) }));
        if (r.ok) return;
        if (k === 3) throw new Error('write failed ' + path + ': ' + r.statusText);
        await new Promise(res => setTimeout(res, 500 * (k + 1)));
      }
    },
  };
}
export function dirSink(root) {
  return {
    async write(path, data) {
      const parts = path.split('/'); let d = root;
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const f = await d.getFileHandle(parts[parts.length - 1], { create: true }), w = await f.createWritable();
      await w.write(data); await w.close();
    },
  };
}

// ------------------------------------------------------------------ growable typed arrays
class Grow {
  constructor(T = Float32Array, n = 192) { this.T = T; this.a = new T(n); this.n = 0; }
  reserve(k) { if (this.n + k <= this.a.length) return; let m = this.a.length * 2; while (m < this.n + k) m *= 2; const b = new this.T(m); b.set(this.a.subarray(0, this.n)); this.a = b; }
  push(v) { this.reserve(1); this.a[this.n++] = v; }
  view() { return this.a.subarray(0, this.n); }
}
class Acc {                                                  // a triangle soup of one material in one tile
  constructor() { this.p = new Grow(); this.nr = new Grow(); this.uv = new Grow(); this.c = new Grow(); }
  get verts() { return this.p.n / 3; }
}

// vertex welding: identical position/normal/uv/colour (quantised) share one index
function weld(P, N, U, C) {
  const nv = P.length / 3, hasU = !!U, hasC = !!C;
  const q = (v, s) => Math.round(v * s);
  let size = 1; while (size < nv * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1), key = new Int32Array(nv * 12), map = new Uint32Array(nv);
  const oP = new Float32Array(nv * 3), oN = new Float32Array(nv * 3), oU = hasU ? new Float32Array(nv * 2) : null, oC = hasC ? new Float32Array(nv * 3) : null;
  let n = 0;
  const k = new Int32Array(12);
  for (let i = 0; i < nv; i++) {
    k[0] = q(P[i * 3], 1e4); k[1] = q(P[i * 3 + 1], 1e4); k[2] = q(P[i * 3 + 2], 1e4);
    k[3] = q(N[i * 3], 1e3); k[4] = q(N[i * 3 + 1], 1e3); k[5] = q(N[i * 3 + 2], 1e3);
    k[6] = hasU ? q(U[i * 2], 1e5) : 0; k[7] = hasU ? q(U[i * 2 + 1], 1e5) : 0;
    k[8] = hasC ? q(C[i * 3], 1e3) : 0; k[9] = hasC ? q(C[i * 3 + 1], 1e3) : 0; k[10] = hasC ? q(C[i * 3 + 2], 1e3) : 0; k[11] = 0;
    let h = 2166136261;
    for (let t = 0; t < 11; t++) h = Math.imul(h ^ k[t], 16777619);
    let s = (h >>> 0) & (size - 1);
    for (;;) {
      const e = table[s];
      if (e < 0) {
        table[s] = n; key.set(k, n * 12);
        oP.set(P.subarray(i * 3, i * 3 + 3), n * 3);
        const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
        oN[n * 3] = N[i * 3] / l; oN[n * 3 + 1] = N[i * 3 + 1] / l; oN[n * 3 + 2] = N[i * 3 + 2] / l;
        if (l < 1e-6) { oN[n * 3] = 0; oN[n * 3 + 1] = 1; oN[n * 3 + 2] = 0; }
        if (hasU) oU.set(U.subarray(i * 2, i * 2 + 2), n * 2);
        if (hasC) oC.set(C.subarray(i * 3, i * 3 + 3), n * 3);
        map[i] = n++; break;
      }
      let same = true;
      for (let t = 0; t < 11; t++) if (key[e * 12 + t] !== k[t]) { same = false; break; }
      if (same) { map[i] = e; break; }
      s = (s + 1) & (size - 1);
    }
  }
  // drop degenerate triangles (welding can collapse slivers)
  const idx = new Grow(Uint32Array, nv);
  for (let t = 0; t < nv; t += 3) { const a = map[t], b = map[t + 1], c = map[t + 2]; if (a !== b && b !== c && a !== c) { idx.push(a); idx.push(b); idx.push(c); } }
  return { P: oP.subarray(0, n * 3), N: oN.subarray(0, n * 3), U: hasU ? oU.subarray(0, n * 2) : null, C: hasC ? oC.subarray(0, n * 3) : null, I: idx.view(), n };
}

// ------------------------------------------------------------------ glTF 2.0 writer (static meshes, no textures)
// meshes: [{ name, prims: [{ material, P, N, U, C, I }] }]; materials: names only (the Unreal script builds them)
function gltf(meshes, file, extraNodes = []) {
  const bufs = [], json = { asset: { version: '2.0', generator: 'Poiana Campina -> Unreal exporter' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
  let off = 0;
  const matIdx = new Map();
  const view = (arr, target) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), pad = (4 - (bytes.byteLength % 4)) % 4;
    bufs.push(bytes); if (pad) bufs.push(new Uint8Array(pad));
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    off += bytes.byteLength + pad;
    return json.bufferViews.length - 1;
  };
  const acc = (arr, type, comp, count, target, minmax = false) => {
    const a = { bufferView: view(arr, target), componentType: comp, count, type };
    if (minmax) {
      const k = type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 1, mn = new Array(k).fill(Infinity), mx = new Array(k).fill(-Infinity);
      for (let i = 0; i < count; i++) for (let c = 0; c < k; c++) { const v = arr[i * k + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
      a.min = mn.map(v => Math.fround(v)); a.max = mx.map(v => Math.fround(v));
    }
    json.accessors.push(a); return json.accessors.length - 1;
  };
  const bounds = {};
  for (const m of meshes) {
    const prims = [];
    const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
    for (const p of m.prims) {
      if (!p.I.length) continue;
      if (!matIdx.has(p.material)) { matIdx.set(p.material, json.materials.length); json.materials.push({ name: p.material, pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.8 } }); }
      const nv = p.P.length / 3, attributes = { POSITION: acc(p.P, 'VEC3', 5126, nv, 34962, true), NORMAL: acc(p.N, 'VEC3', 5126, nv, 34962) };
      const pa = json.accessors[attributes.POSITION];
      for (let c = 0; c < 3; c++) { bmin[c] = Math.min(bmin[c], pa.min[c]); bmax[c] = Math.max(bmax[c], pa.max[c]); }
      if (p.U) attributes.TEXCOORD_0 = acc(p.U, 'VEC2', 5126, nv, 34962);
      if (p.C) attributes.COLOR_0 = acc(p.C, 'VEC3', 5126, nv, 34962);
      prims.push({ attributes, indices: acc(p.I, 'SCALAR', 5125, p.I.length, 34963), material: matIdx.get(p.material), mode: 4 });
    }
    if (!prims.length) continue;
    json.meshes.push({ name: m.name, primitives: prims });
    bounds[m.name] = { min: bmin, max: bmax };
    json.nodes.push({ name: m.name, mesh: json.meshes.length - 1 });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  }
  for (const n of extraNodes) { json.nodes.push(n); json.scenes[0].nodes.push(json.nodes.length - 1); }
  if (!json.meshes.length) return null;
  json.buffers.push({ uri: file + '.bin', byteLength: off });
  return { json: JSON.stringify(json), bin: new Blob(bufs), bounds };
}

// ------------------------------------------------------------------ the exporter
export async function exportUnreal(game, sink, { log = (s) => console.log('[ue] ' + s), trees: doTrees = true, understory = true } = {}) {
  const t0 = performance.now(), el = () => ((performance.now() - t0) / 1000).toFixed(1) + ' s';
  const S = game.scene;
  S.updateMatrixWorld(true);
  const manifest = { format: 'poiana-ue/1', units: 'm', upAxis: '+Y', handedness: 'right (glTF)', tile: TILE, origin: GEO.meta?.origin ?? null, worldExt: GEO.worldExt,
    tiles: [], trees: null, instances: [], cars: [], cameras: [], playerStart: null, sun: null, materials: 'materials.json', calibration: 'calibration.gltf', stats: {} };

  // ---- textures: one file per (image, vertical flip); linear/sRGB and wrap recorded per use
  const texReg = new Map(), texList = [];
  let texN = 0;
  const texFile = (t) => {
    if (!t || !t.image) return null;
    const flip = t.flipY !== false && !t.isDataTexture;
    const key = t.image;
    let e = texReg.get(key);
    if (!e) { e = new Map(); texReg.set(key, e); }
    if (!e.has(flip)) {
      const base = san(t.name || (t.image.src ? t.image.src.split('/').pop().replace(/\.[a-z]+$/i, '') : 'tex'));
      const file = `textures/${base}_${String(++texN).padStart(3, '0')}.png`;
      e.set(flip, file); texList.push({ file, tex: t, flip });
    }
    return e.get(flip);
  };
  const mapRef = (t, srgb) => t && t.image ? {
    file: texFile(t), srgb, repeat: [t.repeat.x, t.repeat.y], offset: [t.offset.x, t.offset.y], rotation: t.rotation || 0,
    wrap: [t.wrapS, t.wrapT].map(w => w === THREE.RepeatWrapping || w === THREE.MirroredRepeatWrapping ? 'wrap' : 'clamp'),
  } : null;

  // ---- materials
  const matReg = new Map(), mats = [], matSig = new Map();
  const record = (rec) => { mats.push(rec); return rec; };
  const matOf = (m, variant = null) => {
    const key = variant ? m.uuid + '|' + variant.key : m;
    if (matReg.has(key)) return matReg.get(key);
    const u = m.userData?.ue ?? {};
    const id = `M_${san(m.name || m.type.replace('Mesh', '').replace('Material', ''))}_${String(mats.length + 1).padStart(4, '0')}${variant ? '_' + san(variant.key) : ''}`;
    let rec;
    if (u.kind === 'terrain') {
      rec = { name: id, kind: 'terrain', ext: u.ext, maps: { ortho: mapRef(u.ortho, true), splat: mapRef(u.splat, false), grass: mapRef(game.TEX.grass, true), soil: mapRef(game.TEX.soil, true), gravel: mapRef(game.TEX.gravel, true), grassN: mapRef(game.TEX.grassN, false) },
        avg: { grass: avgColor(game.TEX.grass).toArray(), soil: avgColor(game.TEX.soil).toArray(), gravel: avgColor(game.TEX.gravel).toArray() }, roughness: m.roughness };
    } else if (u.kind === 'water') {
      rec = { name: id, kind: 'water', color: lin(m.color), opacity: m.opacity, roughness: m.roughness, maps: { normal: mapRef(m.normalMap, false) }, normalScale: m.normalScale?.x ?? 1, uvScale: 1 / 9, flow: [0.018, 0.05] };
    } else {
      const phys = m.isMeshPhysicalMaterial, basic = m.isMeshBasicMaterial;
      const transp = m.transparent && (m.opacity < 0.999 || !!m.alphaMap);
      const glass = phys && (m.transmission > 0.01 || (transp && m.metalness < 0.5));
      const kind = variant?.kind ?? (basic ? 'unlit' : glass ? 'glass' : phys && m.clearcoat > 0.01 ? 'paint' : 'pbr');
      const color = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
      if (variant?.tint) color.multiply(variant.tint);
      rec = {
        name: id, kind, source: m.name || '', color: lin(color), opacity: m.opacity ?? 1,
        blend: m.alphaTest > 0 ? 'masked' : transp || glass ? 'translucent' : 'opaque', alphaCutoff: m.alphaTest || 0.5,
        twoSided: m.side === THREE.DoubleSide, vertexColors: !!m.vertexColors,
        facadeMask: m.customProgramCacheKey?.() === 'facadeMask',
        roughness: m.roughness ?? 1, metalness: m.metalness ?? 0,
        emissive: m.emissive ? lin(m.emissive.clone().multiplyScalar(m.emissiveIntensity ?? 1)) : [0, 0, 0],
        normalScale: m.normalScale ? m.normalScale.x : 1,
        clearcoat: phys ? m.clearcoat : 0, clearcoatRoughness: phys ? m.clearcoatRoughness : 0, transmission: phys ? m.transmission : 0, ior: phys ? m.ior : 1.5,
        maps: { base: mapRef(m.map, true), normal: mapRef(m.normalMap, false), rough: mapRef(m.roughnessMap, false), metal: mapRef(m.metalnessMap, false), emissive: mapRef(m.emissiveMap, true), alpha: mapRef(m.alphaMap, false) },
      };
      if (m.map && m.map.isVideoTexture) rec.maps.base = null;
      for (const k of Object.keys(rec.maps)) if (!rec.maps[k]) delete rec.maps[k];
    }
    // identical materials (the same values and textures under another object) share one record
    const { name: _n, source: _s, ...body } = rec, sig = JSON.stringify(body);
    const same = matSig.get(sig);
    if (same) { matReg.set(key, same); return same; }
    matSig.set(sig, rec);
    matReg.set(key, record(rec));
    return rec;
  };
  const cable = record({ name: 'M_Cable', kind: 'pbr', color: [0.012, 0.012, 0.012], opacity: 1, blend: 'opaque', twoSided: true, vertexColors: false, roughness: 0.55, metalness: 0.2, emissive: [0, 0, 0], normalScale: 1, maps: {} });

  // ---- what is not static: the sky, lights, cars (exported apart), dogs, walkers, streamed trees and ground cover
  const skip = new Set();
  // the scene's top-level objects reachable from the dynamic things (cars, dogs, walkers), found by a shallow search
  const dyn = (x, depth = 0) => {
    if (!x || typeof x !== 'object' || depth > 3) return;
    if (x.isObject3D) { let o = x; while (o.parent && o.parent !== S) o = o.parent; if (o.parent === S) skip.add(o); return; }
    for (const val of Array.isArray(x) ? x : Object.values(x)) if (val && typeof val === 'object') dyn(val, depth + 1);
  };
  dyn(game.vehicles); dyn(game.dogs); dyn(game.walkers);
  S.traverse(o => { if (o.isMesh && o.material?.isShaderMaterial) skip.add(o); });

  // ---- walk the scene
  const tiles = new Map();                                    // name -> { i, j, groups: Map(kind -> Map(matName -> Acc)) }
  const accFor = (x, z, group, rec) => {
    const i = Math.floor(x / TILE), j = Math.floor(z / TILE), name = tileName(i, j);
    let t = tiles.get(name); if (!t) { t = { name, i, j, groups: new Map() }; tiles.set(name, t); }
    let g = t.groups.get(group); if (!g) { g = new Map(); t.groups.set(group, g); }
    let a = g.get(rec.name); if (!a) { a = new Acc(); a.rec = rec; g.set(rec.name, a); }
    return a;
  };
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let nMeshes = 0, nTris = 0;
  // append a geometry (world matrix M) to per-tile accumulators; the tile is chosen per triangle (by its first vertex)
  const addGeo = (geo, M, rec, group, { color = null, uv = true, byTri = true, fixedTile = null } = {}) => {
    const P = geo.attributes.position; if (!P) return;
    let Nn = geo.attributes.normal;
    if (!Nn) { geo = geo.clone(); geo.computeVertexNormals(); Nn = geo.attributes.normal; }
    const U = uv ? geo.attributes.uv : null, C = rec.vertexColors ? geo.attributes.color : null;
    const idx = geo.index ? geo.index.array : null, cnt = idx ? idx.length : P.count;
    nm.getNormalMatrix(M);
    const flip = M.determinant() < 0;
    const e = M.elements;
    let a = null, lastKey = '';
    for (let k = 0; k < cnt - 2; k += 3) {
      const i0 = idx ? idx[k] : k;
      const x0 = e[0] * P.getX(i0) + e[4] * P.getY(i0) + e[8] * P.getZ(i0) + e[12], z0 = e[2] * P.getX(i0) + e[6] * P.getY(i0) + e[10] * P.getZ(i0) + e[14];
      if (fixedTile) { if (!a) a = accFor(fixedTile[0], fixedTile[1], group, rec); }
      else if (byTri || !a) { const key = Math.floor(x0 / TILE) + ',' + Math.floor(z0 / TILE); if (key !== lastKey) { a = accFor(x0, z0, group, rec); lastKey = key; } }
      a.p.reserve(9); a.nr.reserve(9); if (U || uv) a.uv.reserve(6); if (C || rec.vertexColors) a.c.reserve(9);
      for (const t of flip ? [0, 2, 1] : [0, 1, 2]) {
        const i = idx ? idx[k + t] : k + t;
        v.fromBufferAttribute(P, i).applyMatrix4(M); a.p.a[a.p.n++] = v.x; a.p.a[a.p.n++] = v.y; a.p.a[a.p.n++] = v.z;
        v.fromBufferAttribute(Nn, i).applyMatrix3(nm); a.nr.a[a.nr.n++] = v.x; a.nr.a[a.nr.n++] = v.y; a.nr.a[a.nr.n++] = v.z;
        if (uv) { a.uv.a[a.uv.n++] = U ? U.getX(i) : 0; a.uv.a[a.uv.n++] = U ? U.getY(i) : 0; }
        if (rec.vertexColors) {
          if (C) { a.c.a[a.c.n++] = C.getX(i); a.c.a[a.c.n++] = C.getY(i); a.c.a[a.c.n++] = C.getZ(i); }
          else { const cc = color ?? [1, 1, 1]; a.c.a[a.c.n++] = cc[0]; a.c.a[a.c.n++] = cc[1]; a.c.a[a.c.n++] = cc[2]; }
        }
      }
      nTris++;
    }
  };
  const instGroups = new Map();                               // generic InstancedMesh -> asset + transforms
  const walk = (o) => {
    if (skip.has(o) || o.userData?.ueSkip) return;
    if (o.isLight || o.isCamera) return;
    if (o.isLOD) {
      const lv0 = o.levels[0]?.object;
      if (lv0) walkLod(o, lv0);
      return;
    }
    if (o.isInstancedMesh) { instanced(o); return; }
    if (o.isLineSegments) { wires(o); return; }
    if (o.isMesh && o.geometry && o.material) staticMesh(o);
    for (const c of o.children) walk(c);
  };
  const walkLod = (lod, lv0) => {
    if (lod.userData?.ue?.kind === 'terrainLod') {
      lv0.updateWorldMatrix(true, false);
      const rec = matOf(lv0.material);
      const c = new THREE.Vector3().setFromMatrixPosition(lv0.matrixWorld);
      addGeo(lv0.geometry, lv0.matrixWorld, rec, 'Terrain', { uv: false, byTri: false, fixedTile: [c.x, c.z] });
      nMeshes++;
      return;
    }
    walk(lv0);
  };
  const staticMesh = (o) => {
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if (!m || m.visible === false || m.colorWrite === false) return;
    const u = ms[0].userData?.ue;
    if (o.userData?.ue?.kind === 'far') { farMeshes.push(o); return; }
    const group = u?.kind === 'water' ? 'Water' : null;
    nMeshes++;
    if (Array.isArray(o.material) && o.geometry.groups.length) {
      for (const gr of o.geometry.groups) {
        const m = o.material[gr.materialIndex]; if (!m) continue;
        const rec = matOf(m), sub = o.geometry.index ? o.geometry.clone() : o.geometry.clone();
        if (sub.index) sub.setIndex(Array.from(sub.index.array.subarray(gr.start, gr.start + gr.count)));
        else { sub.setDrawRange(gr.start, gr.count); }
        addGeo(sub, o.matrixWorld, rec, group ?? (rec.blend === 'translucent' ? 'Glass' : 'Static'));
      }
      return;
    }
    const rec = matOf(ms[0]);
    addGeo(o.geometry, o.matrixWorld, rec, group ?? (rec.blend === 'translucent' ? 'Glass' : 'Static'));
  };
  const farMeshes = [];
  // wires: two crossed ribbons 2 cm wide per segment
  const wires = (o) => {
    const P = o.geometry.attributes.position; if (!P) return;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), s1 = new THREE.Vector3(), s2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const w = 0.01;
    for (let i = 0; i + 1 < P.count; i += 2) {
      a.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(P, i + 1).applyMatrix4(o.matrixWorld);
      d.subVectors(b, a); if (d.lengthSq() < 1e-8) continue;
      s1.crossVectors(d, up); if (s1.lengthSq() < 1e-8) s1.set(1, 0, 0); s1.normalize().multiplyScalar(w);
      s2.crossVectors(d, s1).normalize().multiplyScalar(w);
      const acc = accFor((a.x + b.x) / 2, (a.z + b.z) / 2, 'Static', cable);
      for (const [s, n] of [[s1, s2], [s2, s1]]) {
        const nn = n.clone().normalize();
        const quad = [a.clone().sub(s), b.clone().sub(s), b.clone().add(s), a.clone().sub(s), b.clone().add(s), a.clone().add(s)];
        acc.p.reserve(18); acc.nr.reserve(18); acc.uv.reserve(12);
        for (const q of quad) { acc.p.a[acc.p.n++] = q.x; acc.p.a[acc.p.n++] = q.y; acc.p.a[acc.p.n++] = q.z; acc.nr.a[acc.nr.n++] = nn.x; acc.nr.a[acc.nr.n++] = nn.y; acc.nr.a[acc.nr.n++] = nn.z; acc.uv.a[acc.uv.n++] = 0; acc.uv.a[acc.uv.n++] = 0; }
        nTris += 2;
      }
    }
  };
  const instanced = (o) => {
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    if (!o.count || ms.some(m => !m || m.visible === false)) return;
    const key = o.geometry.uuid + '|' + ms.map(m => m.uuid).join(',');
    let g = instGroups.get(key);
    if (!g) { g = { name: `Inst_${String(instGroups.size + 1).padStart(3, '0')}_${san(ms[0].name || 'mesh')}`, geo: o.geometry, mats: ms, T: new Grow() }; instGroups.set(key, g); }
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); m.decompose(p, q, s);
      g.T.reserve(10); for (const val of [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z]) g.T.a[g.T.n++] = val;
    }
  };
  log('scena: parcurg obiectele…');
  for (const c of S.children) walk(c);
  log(`scena: ${nMeshes} obiecte, ${(nTris / 1e6).toFixed(2)} M triunghiuri, ${tiles.size} tile-uri, ${instGroups.size} grupuri de instanțe (${el()})`);

  // ---- write the tiles
  let written = 0, vertsOut = 0;
  const writeGltf = async (path, meshes, extraNodes) => {
    const base = path.split('/').pop();
    const g = gltf(meshes, base, extraNodes); if (!g) return false;
    await sink.write(path + '.gltf', g.json);
    await sink.write(path + '.bin', g.bin);
    return g.bounds;
  };
  const primsOf = (group) => [...group.values()].map(a => {
    const w = weld(a.p.view(), a.nr.view(), a.uv.n ? a.uv.view() : null, a.rec.vertexColors && a.c.n ? a.c.view() : null);
    vertsOut += w.n;
    return { material: a.rec.name, P: w.P, N: w.N, U: w.U, C: w.C, I: w.I };
  });
  const tileList = [...tiles.values()].sort((a, b) => a.i - b.i || a.j - b.j);
  for (const t of tileList) {
    const meshes = [], kinds = [];
    for (const kind of ['Terrain', 'Static', 'Glass', 'Water']) {
      const g = t.groups.get(kind); if (!g) continue;
      meshes.push({ name: `${t.name}_${kind}`, prims: primsOf(g) }); kinds.push(kind);
    }
    t.groups.clear();
    const b = await writeGltf(`tiles/${t.name}`, meshes);
    if (b) {
      manifest.tiles.push({ name: t.name, file: `tiles/${t.name}.gltf`, i: t.i, j: t.j, meshes: kinds.filter(k => b[`${t.name}_${k}`]).map(k => ({ name: `${t.name}_${k}`, kind: k, ...b[`${t.name}_${k}`] })) });
      written++;
    }
    if (written % 10 === 0) log(`tile-uri scrise: ${written}/${tileList.length} (${el()})`);
  }
  // the far ring of relief (to 20 km) as one mesh of its own
  if (farMeshes.length) {
    const g = new Map();
    for (const o of farMeshes) {
      const rec = matOf(o.material), a = g.get(rec.name) ?? Object.assign(new Acc(), { rec });
      g.set(rec.name, a);
      const P = o.geometry.attributes.position, N = o.geometry.attributes.normal, U = o.geometry.attributes.uv, idx = o.geometry.index.array;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); a.p.push(v.x); a.p.push(v.y); a.p.push(v.z);
        v.fromBufferAttribute(N, i); a.nr.push(v.x); a.nr.push(v.y); a.nr.push(v.z);
        a.uv.push(U.getX(i)); a.uv.push(U.getY(i));
      }
    }
    const b = await writeGltf('terrain/FarTerrain', [{ name: 'FarTerrain', prims: primsOf(g) }]);
    if (b) manifest.farTerrain = { file: 'terrain/FarTerrain.gltf', mesh: 'FarTerrain', ...b.FarTerrain };
  }
  log(`tile-uri: ${written}, ${(vertsOut / 1e6).toFixed(2)} M vârfuri (${el()})`);

  // ---- generic instanced meshes
  for (const g of instGroups.values()) {
    const acc = new Map();
    const prims = [];
    if (Array.isArray(g.mats) && g.mats.length > 1 && g.geo.groups.length) {
      for (const gr of g.geo.groups) { const m = g.mats[gr.materialIndex]; if (!m) continue; const rec = matOf(m); const sub = g.geo.clone(); if (sub.index) sub.setIndex(Array.from(sub.index.array.subarray(gr.start, gr.start + gr.count))); collectLocal(sub, rec, acc); }
    } else collectLocal(g.geo, matOf(g.mats[0]), acc);
    for (const a of acc.values()) { const w = weld(a.p.view(), a.nr.view(), a.uv.view(), a.rec.vertexColors && a.c.n ? a.c.view() : null); prims.push({ material: a.rec.name, P: w.P, N: w.N, U: w.U, C: w.C, I: w.I }); }
    const b = await writeGltf(`instances/${g.name}`, [{ name: g.name, prims }]);
    if (!b) continue;
    const T = g.T.view();
    await sink.write(`instances/${g.name}.inst`, new Blob([T]));
    manifest.instances.push({ name: g.name, file: `instances/${g.name}.gltf`, mesh: g.name, ...b[g.name], transforms: `instances/${g.name}.inst`, count: T.length / 10, layout: 'px py pz qx qy qz qw sx sy sz (float32, game frame)' });
  }
  function collectLocal(geo, rec, acc) {
    let a = acc.get(rec.name); if (!a) { a = Object.assign(new Acc(), { rec }); acc.set(rec.name, a); }
    const P = geo.attributes.position, N = geo.attributes.normal ?? (geo.computeVertexNormals(), geo.attributes.normal), U = geo.attributes.uv, C = geo.attributes.color;
    const idx = geo.index ? geo.index.array : null, cnt = idx ? idx.length : P.count;
    for (let k = 0; k < cnt; k++) {
      const i = idx ? idx[k] : k;
      a.p.push(P.getX(i)); a.p.push(P.getY(i)); a.p.push(P.getZ(i));
      a.nr.push(N.getX(i)); a.nr.push(N.getY(i)); a.nr.push(N.getZ(i));
      a.uv.push(U ? U.getX(i) : 0); a.uv.push(U ? U.getY(i) : 0);
      if (rec.vertexColors) { a.c.push(C ? C.getX(i) : 1); a.c.push(C ? C.getY(i) : 1); a.c.push(C ? C.getZ(i) : 1); }
    }
  }
  log(`instanțe generice: ${manifest.instances.length} (${el()})`);

  // ---- trees: models per type, instances of the mapped trees, the whole forest and its understory
  if (doTrees && game.geoWorld?.trees?.exportData) {
    const D = game.geoWorld.trees.exportData;
    const types = [];
    for (const [ty, model] of D.models.entries()) {
      const t = TREE_TYPES[ty], acc = new Map();
      const tint = new THREE.Color(t.tint ?? 0xffffff);
      for (const [g, m] of model.parts) {
        if (m.userData?.core) continue;
        const leafy = !m.userData?.bark;
        const rec = matOf(m, leafy ? { key: 'leaf_' + san(t.name), tint, kind: 'foliage' } : { key: 'bark_' + san(t.name), tint: new THREE.Color(0.9, 0.9, 0.9), kind: 'pbr' });
        collectLocal(g, rec, acc);
      }
      const name = `Tree_${String(ty).padStart(2, '0')}_${san(t.name)}`;
      const prims = [...acc.values()].map(a => { const w = weld(a.p.view(), a.nr.view(), a.uv.view(), null); return { material: a.rec.name, P: w.P, N: w.N, U: w.U, C: null, I: w.I }; });
      const b = await writeGltf(`trees/${name}`, [{ name, prims }]);
      if (b) types.push({ id: ty, name, label: t.name, file: `trees/${name}.gltf`, mesh: name, ...b[name], trunkRadius: t.trunkR ?? 0.3, height: t.H, conifer: !!(t.conifer || t.pine), sets: {} });
    }
    // instances by set and type, sorted by tile: x y z yaw scale (float32, game frame)
    const sets = { mapped: new Map(), forest: new Map(), understory: new Map() };
    const put = (set, ty, x, y, z, rot, s) => {
      const i = Math.floor(x / TILE), j = Math.floor(z / TILE), key = ty + '|' + tileName(i, j);
      let g = sets[set].get(key); if (!g) { g = { ty, tile: tileName(i, j), G: new Grow(Float32Array, 1024) }; sets[set].set(key, g); }
      g.G.reserve(5); g.G.a[g.G.n++] = x; g.G.a[g.G.n++] = y; g.G.a[g.G.n++] = z; g.G.a[g.G.n++] = rot; g.G.a[g.G.n++] = s;
    };
    for (let k = 0; k < D.count; k++) put('mapped', D.TY[k], D.X[k], D.Y[k], D.Z[k], D.R[k], D.S[k]);
    log(`copaci din hartă: ${D.count} (${el()})`);
    const E = GEO.worldExt;
    let nf = 0;
    for (let z0 = -E; z0 < E; z0 += 500) {
      eachForestTree(-E, z0, E, z0 + 500, (x, z, ty, s, rot) => { put('forest', ty, x, heightAt(x, z) - 0.12, z, rot, s); nf++; });
      await new Promise(r => setTimeout(r, 0));
    }
    log(`pădure: ${nf} copaci (${el()})`);
    let nu = 0;
    if (understory) {
      for (let z0 = -E; z0 < E; z0 += 500) {
        eachShrub(-E, z0, E, z0 + 500, (x, z, ty, s, rot) => { put('understory', ty, x, heightAt(x, z) - 0.05, z, rot, s); nu++; });
        await new Promise(r => setTimeout(r, 0));
      }
      log(`subarboret: ${nu} (${el()})`);
    }
    for (const [set, map] of Object.entries(sets)) {
      const byType = new Map();
      for (const g of map.values()) { if (!byType.has(g.ty)) byType.set(g.ty, []); byType.get(g.ty).push(g); }
      for (const [ty, list] of byType) {
        list.sort((a, b) => a.tile < b.tile ? -1 : 1);
        let n = 0; for (const g of list) n += g.G.n;
        const all = new Float32Array(n), ranges = [];
        let o = 0; for (const g of list) { all.set(g.G.view(), o); ranges.push([g.tile, o / 5, g.G.n / 5]); o += g.G.n; }
        const tt = types.find(t => t.id === ty); if (!tt) continue;
        const file = `trees/${tt.name}.${set}.bin`;
        await sink.write(file, new Blob([all]));
        tt.sets[set] = { file, count: n / 5, tiles: ranges };
      }
    }
    manifest.trees = { layout: 'x y z yaw scale (float32, game frame; yaw about +Y, radians)', types, counts: { mapped: D.count, forest: nf, understory: nu } };
  }

  // ---- parked cars, where they stand
  let ci = 0;
  for (const veh of game.vehicles || []) {
    const grp = veh.car?.group; if (!grp) continue;
    grp.updateMatrixWorld(true);
    const acc = new Map();
    grp.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const rec = matOf(ms[0]);
      let a = acc.get(rec.name); if (!a) { a = Object.assign(new Acc(), { rec }); acc.set(rec.name, a); }
      const g = o.geometry, P = g.attributes.position, N = g.attributes.normal ?? (g.computeVertexNormals(), g.attributes.normal), U = g.attributes.uv, idx = g.index ? g.index.array : null, cnt = idx ? idx.length : P.count;
      nm.getNormalMatrix(o.matrixWorld);
      const flip = o.matrixWorld.determinant() < 0;
      for (let k = 0; k < cnt - 2; k += 3) for (const t of flip ? [0, 2, 1] : [0, 1, 2]) {
        const i = idx ? idx[k + t] : k + t;
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); a.p.push(v.x); a.p.push(v.y); a.p.push(v.z);
        v.fromBufferAttribute(N, i).applyMatrix3(nm); a.nr.push(v.x); a.nr.push(v.y); a.nr.push(v.z);
        a.uv.push(U ? U.getX(i) : 0); a.uv.push(U ? U.getY(i) : 0);
      }
    });
    const name = `Car_${String(++ci).padStart(2, '0')}_${san(veh.name || veh.car?.model?.name || 'car')}`;
    const prims = [...acc.values()].map(a => { const w = weld(a.p.view(), a.nr.view(), a.uv.view(), null); return { material: a.rec.name, P: w.P, N: w.N, U: w.U, C: null, I: w.I }; });
    const b = await writeGltf(`cars/${name}`, [{ name, prims }]);
    if (b) manifest.cars.push({ name, file: `cars/${name}.gltf`, mesh: name, ...b[name], x: veh.x, z: veh.z, heading: veh.h });
  }
  log(`mașini: ${manifest.cars.length} (${el()})`);

  // ---- cameras of the photos, player start, sun
  const ground = (x, z) => game.world?.groundHeight ? game.world.groundHeight(x, z) : heightAt(x, z);     // decks and ledges included
  for (const [k, vw] of (game.views || []).entries()) {
    const g = ground(vw.x, vw.z), yaw = vw.yaw, pitch = vw.pitch ?? 0;
    const f = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const n = +((vw.label || '').match(/Poza (\d+)/)?.[1] ?? k + 1);
    manifest.cameras.push({ n, label: vw.label || `View ${k + 1}`, position: [vw.x, g, vw.z], ground: g, eye: STREET_VIEW(n) ? 2.5 : 1.6, forward: f, vfov: vw.fov ?? 70 });
  }
  const v0 = game.views?.[0];
  if (v0) manifest.playerStart = { position: [v0.x, ground(v0.x, v0.z), v0.z], forward: [-Math.sin(v0.yaw), 0, -Math.cos(v0.yaw)] };
  if (game.sun) manifest.sun = { toSun: game.sun.dir.toArray(), elevation: game.sun.el, azimuth: game.sun.az, date: new Date(Date.UTC(2026, 8, 26) + ((game.hour ?? 11.5) - 3) * 3600e3).toISOString() };

  // ---- calibration: a 1 x 2 x 3 m box from the origin (the Unreal script reads the importer's axes and scale off it)
  {
    const P = new Float32Array([0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 2, 0, 0, 0, 3, 1, 0, 3, 1, 2, 3, 0, 2, 3]);
    const N = new Float32Array(24); for (let i = 0; i < 8; i++) { N[i * 3 + 1] = 1; }
    const I = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
    const g = gltf([{ name: 'UE_Calibration', prims: [{ material: 'M_Calibration', P, N, U: null, C: null, I }] }], 'calibration');
    await sink.write('calibration.gltf', g.json); await sink.write('calibration.bin', g.bin);
  }

  // ---- default textures of the master materials' parameters (white in sRGB and linear, a flat normal)
  for (const [file, rgb] of [['textures/_Default_White.png', [255, 255, 255]], ['textures/_Default_WhiteLinear.png', [255, 255, 255]], ['textures/_Default_Normal.png', [128, 128, 255]]]) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 4;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.fillStyle = `rgb(${rgb.join(',')})`; g.fillRect(0, 0, 4, 4);
    if (sink.rawPng) await sink.write(file + '.rgba', new Blob([new Uint32Array([4, 4]), g.getImageData(0, 0, 4, 4).data]));
    else await sink.write(file, await new Promise(r => cv.toBlob(r, 'image/png')));
  }
  // ---- textures (after the materials, so every one in use is listed)
  log(`texturi: ${texList.length}…`);
  const texOut = [];
  for (const { file, tex, flip } of texList) {
    const blob = await encodeTexture(tex, flip, !!sink.rawPng);
    if (!blob) { log('  (textură sărită: ' + file + ')'); continue; }
    await sink.write(sink.rawPng ? file + '.rgba' : file, blob);
    texOut.push({ file, width: tex.image.width, height: tex.image.height });
  }
  await sink.write('materials.json', JSON.stringify({ materials: mats, textures: texOut }, null, 1));
  manifest.stats = { tiles: manifest.tiles.length, triangles: nTris, vertices: vertsOut, materials: mats.length, textures: texOut.length, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
  await sink.write('manifest.json', JSON.stringify(manifest, null, 1));
  log(`gata: ${JSON.stringify(manifest.stats)}`);
  return manifest.stats;
}

// a texture as PNG, flipped the way three.js samples it (flipY) so plain top-left UVs match in Unreal
async function encodeTexture(t, flip, raw = false) {
  const img = t.image;
  let w = img.width ?? img.videoWidth, h = img.height ?? img.videoHeight;
  if (!w || !h) return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: raw });
  let src = img;
  if (img.data) {                                             // DataTexture: to 8-bit RGBA first
    const d = img.data, id = new ImageData(w, h), o = id.data, n = w * h;
    const ch = d.length / n, f = d instanceof Float32Array ? 255 : d instanceof Uint16Array ? 1 / 257 : 1;
    for (let i = 0; i < n; i++) {
      const r = d[i * ch] * f, gg = ch > 1 ? d[i * ch + 1] * f : r, b = ch > 2 ? d[i * ch + 2] * f : r, a = ch > 3 ? d[i * ch + 3] * f : 255;
      o[i * 4] = r; o[i * 4 + 1] = gg; o[i * 4 + 2] = b; o[i * 4 + 3] = a;
    }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(id, 0, 0);
    src = tmp;
  }
  if (flip) { g.translate(0, h); g.scale(1, -1); }
  try { g.drawImage(src, 0, 0, w, h); } catch (e) { return null; }
  if (raw) {                                                  // 8-byte header (width, height) + RGBA rows
    const px = g.getImageData(0, 0, w, h).data, head = new Uint32Array([w, h]);
    return new Blob([head, px]);
  }
  return await new Promise(r => cv.toBlob(r, 'image/png'));
}
