/* Static-geometry batching. A yard full of hand-built props costs a draw call
   per mesh and the shadow pass doubles it; merging by material takes a car from
   ~35 calls to ~6 and the whole scene from ~2000 to a few hundred. */
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

const ATTRS = ['position', 'normal', 'uv'];

function normalise(geo) {
  // merging requires identical attribute sets; drop the extras and add what's missing
  const g = geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (!ATTRS.includes(name)) g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (g.groups && g.groups.length > 1) g.clearGroups();
  return g.index ? g.toNonIndexed() : g;
}

/**
 * Merge every mesh under `root` that shares a material into one mesh.
 * Anything flagged `userData.noMerge` (or any descendant of such a node) is
 * left alone — wheels, animated doors, lamps whose transform changes.
 * @returns {{before:number, after:number}}
 */
export function mergeByMaterial(root, { maxVerts = 200000 } = {}) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  let before = 0;

  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    before++;
    if (Array.isArray(o.material)) return;
    let p = o;
    while (p && p !== root) { if (p.userData.noMerge) return; p = p.parent; }
    if (o.userData.noMerge) return;
    const key = o.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { material: o.material, items: [] });
    buckets.get(key).items.push(o);
    victims.push(o);
  });

  let merged = 0;
  for (const { material, items } of buckets.values()) {
    if (items.length < 2) continue;
    const geos = [];
    let verts = 0, ok = true;
    for (const m of items) {
      const g = normalise(m.geometry);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld));
      verts += g.attributes.position.count;
      geos.push(g);
      if (verts > maxVerts) { ok = false; break; }
    }
    if (!ok) { geos.forEach(g => g.dispose()); continue; }
    let out = null;
    try { out = BGU.mergeGeometries(geos, false); } catch { out = null; }
    geos.forEach(g => g.dispose());
    if (!out) continue;
    const mesh = new THREE.Mesh(out, material);
    mesh.castShadow = items.some(i => i.castShadow);
    mesh.receiveShadow = items.some(i => i.receiveShadow);
    mesh.name = 'merged:' + (material.name || material.type);
    root.add(mesh);
    for (const m of items) { m.parent?.remove(m); m.geometry.dispose?.(); }
    merged++;
  }

  let after = 0;
  root.traverse(o => { if (o.isMesh && !o.isInstancedMesh) after++; });
  return { before, after, merged };
}
