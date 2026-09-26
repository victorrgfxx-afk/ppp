import * as THREE from 'three';
import { GEO, normalAt } from './data.js';
import { TEX } from '../textures.js';
import { avgColor } from './geotex.js';
import { WIND } from '../util.js';

// Near terrain (+-1.5 km, 5 m DEM grid) in LOD chunks, far ring (+-8 km Copernicus DEM), water surfaces.

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
  const [ortho, orthoFar, splat] = await Promise.all([loadTex(base + 'ortho.jpg'), loadTex(base + 'ortho_far.jpg'), loadTex(base + 'splat.png', false)]);
  return { ortho, orthoFar, splat };
}

function terrainMaterial(gt) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0, color: 0xffffff });
  const uni = {
    uOrtho: { value: gt.ortho }, uSplat: { value: gt.splat },
    uGrass: { value: TEX.grass }, uSoil: { value: TEX.soil }, uGravel: { value: TEX.gravel },
    uGrassN: { value: TEX.grassN },
    uAvgG: { value: avgColor(TEX.grass) }, uAvgS: { value: avgColor(TEX.soil) }, uAvgR: { value: avgColor(TEX.gravel) },
    uExt: { value: GEO.ext },
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
  vec3 cf = mix(cs * vec3(0.8, 0.72, 0.6), cg * 0.7, 0.35);
  float wf = sp.r, wa = sp.g, wr = sp.b;
  float wg = max(0.0, 1.0 - wf - wa - wr);
  float ws = wg + wf + wa + wr + 1e-4;
  vec3 det = (cg * wg + cf * wf + cs * wa + cr * wr) / ws;
  vec3 avg = (uAvgG * wg + (uAvgS * vec3(0.8, 0.72, 0.6) * 0.65 + uAvgG * 0.25) * wf + uAvgS * wa + uAvgR * wr) / ws;
  vec3 tint = clamp(orth / max(avg, vec3(0.01)), 0.35, 2.4);
  float dist = length(vGeoW - cameraPosition);
  float farK = smoothstep(35.0, 420.0, dist);
  vec3 nearCol = det * mix(vec3(1.0), tint, 0.6);
  diffuseColor.rgb *= mix(nearCol, orth * 1.08, farK);
`);
  };
  m.customProgramCacheKey = () => 'geoTerrain';
  return m;
}

export function buildTerrain(scene, gt, quality) {
  const { n, ext, step, H } = GEO;
  const CH = 60;                                   // 60 cells = 300 m per chunk
  const nc = (n - 1) / CH;
  const mat = terrainMaterial(gt);
  const levels = quality.label === 'Scăzută' ? [[2, 0], [5, 350], [10, 800]] : [[1, 0], [2, 320], [5, 750]];
  const nrm = new THREE.Vector3();
  const lods = [];
  for (let cj = 0; cj < nc; cj++) for (let ci = 0; ci < nc; ci++) {
    const lod = new THREE.LOD();
    const cx = -ext + (ci + 0.5) * CH * step, cz = -ext + (cj + 0.5) * CH * step;
    lod.position.set(cx, 0, cz);
    for (const [s, dist] of levels) {
      const m = CH / s + 1;
      const pos = [], nor = [], idx = [];
      for (let b = 0; b < m; b++) for (let a = 0; a < m; a++) {
        const i = ci * CH + a * s, j = cj * CH + b * s;
        pos.push(-ext + i * step - cx, H[j * n + i], -ext + j * step - cz);
        normalAt(i, j, nrm); nor.push(nrm.x, nrm.y, nrm.z);
      }
      for (let b = 0; b < m - 1; b++) for (let a = 0; a < m - 1; a++) {
        const A = b * m + a, B = A + 1, C = A + m, D = C + 1;
        idx.push(A, C, B, B, C, D);
      }
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

// Real surroundings out to 8 km (Copernicus DEM + Sentinel-2): valley sides and ridges on the horizon.
export function buildFarTerrain(scene, gt) {
  const { farN: n, farExt: ext, F, ext: near } = GEO;
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
  const { ext, step, water } = GEO;
  const byChunk = new Map();
  for (const [i, j, lc] of water) {
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
