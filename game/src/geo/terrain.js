import * as THREE from 'three';
import { GEO, normalAt, heightAt, underpassAt } from './data.js';
import { TEX } from '../textures.js';
import { avgColor } from './geotex.js';
import { WIND } from '../util.js';

// Near terrain (+-3 km, 5 m grid) and world terrain (+-8 km, 10 m grid) in LOD chunks,
// far ring (+-20 km Copernicus DEM), water surfaces.

function loadTex(url, srgb = true) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.flipY = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    t.needsUpdate = true;
    res(t);
  }, undefined, rej));
}

export async function loadGeoTextures(base) {
  const [ortho, orthoFar, splat, orthoW, splatW] = await Promise.all([loadTex(base + 'ortho.jpg'), loadTex(base + 'ortho_far.jpg'), loadTex(base + 'splat.png', false),
    GEO.W ? loadTex(base + 'ortho_w.jpg') : null, GEO.W ? loadTex(base + 'splat_w.png', false) : null]);
  return { ortho, orthoFar, splat, orthoW, splatW };
}

function terrainMaterial(ortho, splat, ext) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0, color: 0xffffff });
  const uni = {
    uOrtho: { value: ortho }, uSplat: { value: splat },
    uGrass: { value: TEX.grass }, uSoil: { value: TEX.soil }, uGravel: { value: TEX.gravel },
    uGrassN: { value: TEX.grassN },
    uAvgG: { value: avgColor(TEX.grass) }, uAvgS: { value: avgColor(TEX.soil) }, uAvgR: { value: avgColor(TEX.gravel) },
    uExt: { value: ext },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGeoW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGeoW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGeoW;
uniform sampler2D uOrtho, uSplat, uGrass, uSoil, uGravel;
uniform vec3 uAvgG, uAvgS, uAvgR;
uniform float uExt;`)
      .replace('#include <map_fragment>', `
  vec2 guv = (vGeoW.xz + uExt) / (2.0 * uExt);
  vec3 sp = texture2D(uSplat, guv).rgb;                 // forest floor, farmland, gravel
  vec3 orth = texture2D(uOrtho, guv).rgb;               // Sentinel-2 colour of the real ground
  vec2 duv = vGeoW.xz / 2.6;
  vec3 cg = texture2D(uGrass, duv).rgb;
  vec3 cs = texture2D(uSoil, duv * 0.8).rgb;
  vec3 cr = texture2D(uGravel, duv * 1.3).rgb;
  // forest floor: last year's beech/oak leaves over dark soil, a little moss
  float lit = texture2D(uSoil, duv * 0.37 + 0.31).r;
  vec3 cf = mix(cs * vec3(0.78, 0.6, 0.42), cs * vec3(0.52, 0.4, 0.3), smoothstep(0.35, 0.65, lit));
  cf = mix(cf, cg * vec3(0.55, 0.65, 0.45), 0.14);
  float wf = sp.r, wa = sp.g, wr = sp.b;
  float wg = max(0.0, 1.0 - wf - wa - wr);
  float ws = wg + wf + wa + wr + 1e-4;
  vec3 det = (cg * wg + cf * wf + cs * wa + cr * wr) / ws;
  vec3 avg = (uAvgG * wg + (uAvgS * vec3(0.8, 0.72, 0.6) * 0.65 + uAvgG * 0.25) * wf + uAvgS * wa + uAvgR * wr) / ws;
  vec3 tint = clamp(orth / max(avg, vec3(0.01)), 0.35, 2.4);
  float dist = length(vGeoW - cameraPosition);
  float farK = smoothstep(35.0, 420.0, dist);
  vec3 nearCol = det * mix(vec3(1.0), tint, 0.6 * (1.0 - 0.75 * wf / ws));
  diffuseColor.rgb *= mix(nearCol, orth * 1.08, farK);
`);
  };
  m.customProgramCacheKey = () => 'geoTerrain';
  return m;
}

export function buildTerrain(scene, gt, quality) {
  const low = quality.label === 'Scăzută';
  // near grid: 120 cells = 600 m per chunk
  const near = gridTerrain(scene, GEO, terrainMaterial(gt.ortho, gt.splat, GEO.ext), 120,
    low ? [[2, 0], [5, 600], [10, 1300], [20, 2600]] : [[1, 0], [2, 480], [5, 1150], [10, 2300]]);
  if (!GEO.W) return near;
  // world grid around it: 100 cells = 1 km per chunk, the chunks under the near grid are left out
  const e = GEO.ext;
  const world = gridTerrain(scene, GEO.W, terrainMaterial(gt.orthoW, gt.splatW, GEO.W.ext), 100,
    low ? [[2, 0], [4, 1500], [10, 3500]] : [[1, 0], [2, 1300], [4, 2800], [10, 5000]],
    (x0, z0, x1, z1) => x0 >= -e - 1 && x1 <= e + 1 && z0 >= -e - 1 && z1 <= e + 1);
  return { lods: near.lods.concat(world.lods), material: near.material, worldMaterial: world.material };
}

// 1 m heightfield for the cut-out cells; edges shared with kept cells follow the coarse grid exactly (no cracks)
function patchCells(holes, pos, nor, idx, X, Z, cx, cz, step, m, H, n, i0, j0) {
  const K = Math.round(step), nv = new THREE.Vector3();
  const nodeH = (a, b) => H[(j0 + b) * n + i0 + a];
  for (const key of holes) {
    const [a, b] = key.split(',').map(Number);
    const kept = { s: !holes.has(a + ',' + (b - 1)), n: !holes.has(a + ',' + (b + 1)), w: !holes.has((a - 1) + ',' + b), e: !holes.has((a + 1) + ',' + b) };
    const base = pos.length / 3;
    for (let v = 0; v <= K; v++) for (let u = 0; u <= K; u++) {
      const x = X(a) + u * step / K, z = Z(b) + v * step / K, wx = x + cx, wz = z + cz;
      let y;
      const lerp = (p, q, t) => p + (q - p) * t;
      if (v === 0 && kept.s) y = lerp(nodeH(a, b), nodeH(a + 1, b), u / K);
      else if (v === K && kept.n) y = lerp(nodeH(a, b + 1), nodeH(a + 1, b + 1), u / K);
      else if (u === 0 && kept.w) y = lerp(nodeH(a, b), nodeH(a, b + 1), v / K);
      else if (u === K && kept.e) y = lerp(nodeH(a + 1, b), nodeH(a + 1, b + 1), v / K);
      else y = heightAt(wx, wz);
      pos.push(x, y, z);
      const e = 0.35, hx = heightAt(wx + e, wz) - heightAt(wx - e, wz), hz = heightAt(wx, wz + e) - heightAt(wx, wz - e);
      nv.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
      nor.push(nv.x, nv.y, nv.z);
    }
    for (let v = 0; v < K; v++) for (let u = 0; u < K; u++) {
      const A = base + v * (K + 1) + u, B = A + 1, C = A + K + 1, D = C + 1;
      idx.push(A, C, B, B, C, D);
    }
  }
  void m;
}

function gridTerrain(scene, G, mat, CH, levels, skip = null) {
  const { n, ext, step, H } = G;
  const nc = (n - 1) / CH;
  const nrm = new THREE.Vector3();
  const lods = [];
  for (let cj = 0; cj < nc; cj++) for (let ci = 0; ci < nc; ci++) {
    if (skip && skip(-ext + ci * CH * step, -ext + cj * CH * step, -ext + (ci + 1) * CH * step, -ext + (cj + 1) * CH * step)) continue;
    const lod = new THREE.LOD();
    const cx = -ext + (ci + 0.5) * CH * step, cz = -ext + (cj + 0.5) * CH * step;
    lod.position.set(cx, 0, cz);
    for (const [s, dist] of levels) {
      const m = CH / s + 1;
      const pos = [], nor = [], idx = [];
      for (let b = 0; b < m; b++) for (let a = 0; a < m; a++) {
        const i = ci * CH + a * s, j = cj * CH + b * s;
        pos.push(-ext + i * step - cx, H[j * n + i], -ext + j * step - cz);
        normalAt(i, j, nrm, G); nor.push(nrm.x, nrm.y, nrm.z);
      }
      // underpass boxes: at full resolution their cells are cut out and rebuilt at 1 m (vertical abutments, level road)
      const holes = s === 1 && G === GEO && GEO.ups?.length ? new Set() : null;
      const inHole = (a, b) => !!underpassAt(-ext + (ci * CH + a + 0.5) * step, -ext + (cj * CH + b + 0.5) * step);
      for (let b = 0; b < m - 1; b++) for (let a = 0; a < m - 1; a++) {
        const A = b * m + a, B = A + 1, C = A + m, D = C + 1;
        if (holes && inHole(a, b)) { holes.add(a + ',' + b); continue; }
        idx.push(A, C, B, B, C, D);
      }
      if (holes && holes.size) patchCells(holes, pos, nor, idx, (a) => -ext + (ci * CH + a) * step - cx, (b) => -ext + (cj * CH + b) * step - cz, cx, cz, step, m, H, n, ci * CH, cj * CH);
      // skirts hide cracks between chunks of different LOD
      const border = [];
      for (let a = 0; a < m; a++) border.push(a);
      for (let b = 1; b < m; b++) border.push(b * m + m - 1);
      for (let a = m - 2; a >= 0; a--) border.push((m - 1) * m + a);
      for (let b = m - 2; b > 0; b--) border.push(b * m);
      border.push(0);
      for (let k = 0; k < border.length - 1; k++) {
        const p = border[k], q = border[k + 1];
        const base = pos.length / 3;
        pos.push(pos[p * 3], pos[p * 3 + 1] - 4, pos[p * 3 + 2], pos[q * 3], pos[q * 3 + 1] - 4, pos[q * 3 + 2]);
        nor.push(nor[p * 3], nor[p * 3 + 1], nor[p * 3 + 2], nor[q * 3], nor[q * 3 + 1], nor[q * 3 + 2]);
        idx.push(p, base, q, q, base, base + 1, p, q, base, q, base + 1, base);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      lod.addLevel(mesh, dist);
    }
    lod.matrixAutoUpdate = false; lod.updateMatrix();
    scene.add(lod);
    lods.push(lod);
  }
  return { lods, material: mat };
}

// Real surroundings out to 20 km (Copernicus DEM + Sentinel-2): valley sides and ridges on the horizon.
export function buildFarTerrain(scene, gt) {
  const { farN: n, farExt: ext, F, worldExt: near } = GEO;
  const s = 2 * ext / (n - 1);
  const pos = [], uv = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -ext + i * s, z = -ext + j * s;
    pos.push(x, F[j * n + i] - 1.5, z);
    uv.push(i / (n - 1), j / (n - 1));
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const x0 = -ext + i * s, z0 = -ext + j * s;
    if (x0 >= -near - 1 && x0 + s <= near + 1 && z0 >= -near - 1 && z0 + s <= near + 1) continue;
    const A = j * n + i, B = A + 1, C = A + n, D = C + 1;
    if (F[A] < -3000 || F[B] < -3000 || F[C] < -3000 || F[D] < -3000) continue;
    idx.push(A, C, B, B, C, D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ map: gt.orthoFar, roughness: 1, metalness: 0, color: 0xd8dccf });
  const mesh = new THREE.Mesh(g, m);
  mesh.userData.noAO = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  return mesh;
}

// Water: Prahova (level from the DEM, falling ~0.8 % downstream), Câmpinița, lakes.
export function buildWater(scene) {
  const byChunk = new Map();
  const cells = GEO.water.map(c => [GEO.ext, GEO.step, c]);
  if (GEO.W && GEO.water2) for (const c of GEO.water2) cells.push([GEO.W.ext, GEO.W.step, c]);
  for (const [ext, step, [i, j, lc]] of cells) {
    const x0 = -ext + i * step, z0 = -ext + j * step, y = lc / 100;
    const key = Math.floor(x0 / 500) + ',' + Math.floor(z0 / 500);
    if (!byChunk.has(key)) byChunk.set(key, []);
    const a = byChunk.get(key);
    const x1 = x0 + step, z1 = z0 + step;
    a.push(x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z0, x0, y, z1, x1, y, z1);
  }
  const nm = TEX.waterN;
  nm.repeat.set(1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a5a52, roughness: 0.07, metalness: 0.0, transparent: true, opacity: 0.86, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.1 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_NORMALMAP\nvNormalMapUv = position.xz / 9.0 + vec2(uTime * 0.018, uTime * 0.05);\n#endif');
  };
  mat.customProgramCacheKey = () => 'geoWater';
  const meshes = [];
  for (const arr of byChunk.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const nrm = new Float32Array(arr.length); for (let k = 1; k < nrm.length; k += 3) nrm[k] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(arr.length / 3 * 2), 2));
    const tan = new Float32Array(arr.length / 3 * 4); for (let k = 0; k < tan.length; k += 4) { tan[k] = 1; tan[k + 3] = 1; }
    g.setAttribute('tangent', new THREE.BufferAttribute(tan, 4));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.userData.noAO = true;
    mesh.renderOrder = 2;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}
