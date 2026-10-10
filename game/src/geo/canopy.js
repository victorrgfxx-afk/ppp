import * as THREE from 'three';
import { GEO, heightAt, forestCode } from './data.js';
import { heightToNormalCanvas } from '../textures.js';
import { valueNoise2 } from './trees.js';
import { SNOW } from '../rain.js';

// Canopy shell: beyond the ring of individual trees the forests are a lumpy roof of crowns at the stand's
// height (from the same age noise as the trees), coloured by Sentinel-2 and dropping to the ground at the
// stand edges, road cuts and clearings. It fades in (dithered) where the tree impostors fade out.

function crownTexture() {
  const S = 256, H = new Float32Array(S * S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const crowns = [];
  for (let k = 0; k < 90; k++) crowns.push([rnd() * S, rnd() * S, 9 + rnd() * 15, 0.7 + rnd() * 0.3]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let h = 0;
    for (const [cx, cy, r, a] of crowns) {
      let dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      dx = Math.min(dx, S - dx); dy = Math.min(dy, S - dy);                 // tileable
      const d2 = (dx * dx + dy * dy) / (r * r);
      if (d2 < 1) h = Math.max(h, Math.sqrt(1 - d2) * a * (0.85 + 0.15 * Math.sin(x * 0.9 + y * 0.7)));
    }
    H[y * S + x] = h;
  }
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = Math.round(255 * Math.min(1, 0.12 + 0.95 * H[i]));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.NoColorSpace;
  const nrm = new THREE.CanvasTexture(heightToNormalCanvas(H, S, S, 4));
  nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.colorSpace = THREE.NoColorSpace;
  return { map, nrm };
}

export function buildCanopy(scene, gt, Q) {
  if (!GEO.forestBits || !Q || !gt.orthoW) return null;
  const E = GEO.worldExt, step = 20, n = Math.round(2 * E / step) + 1;
  // coverage and needle share per node from the 5 m stand raster (4 x 4 samples)
  const cov = new Float32Array(n * n), top = new Float32Array(n * n), ndl = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -E + i * step, z = -E + j * step;
    let c = 0, nd = 0;
    for (const dz of [-7.5, -2.5, 2.5, 7.5]) for (const dx of [-7.5, -2.5, 2.5, 7.5]) {
      const f = forestCode(x + dx, z + dz);
      if (f) { c++; nd += f === 3 ? 0.9 : f === 2 ? 0.45 : 0.04; }
    }
    const k = j * n + i;
    cov[k] = c / 16; ndl[k] = c ? nd / c : 0;
    if (c) top[k] = (20 + 2.5 * nd / c) * (0.68 + 0.45 * valueNoise2(x, z, 110, 9)) * 0.93 + 1.6 * (valueNoise2(x, z, 23, 31) - 0.5);
  }
  const { map, nrm } = crownTexture();
  const mat = new THREE.MeshStandardMaterial({ map, normalMap: nrm, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95, metalness: 0 });
  mat.userData.noSnow = true;                    // (its own winter look below)
  const uni = { uOrtho: { value: gt.orthoW }, uExt: { value: E }, uFade: { value: Q.imp * 0.72 }, uFadeLen: { value: Q.imp * 0.26 }, uWinter: { value: 0 }, uCanSnow: SNOW.uSnow };   // (uSnow itself is declared by rain.js)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCanW;\nattribute float aNeedle;\nvarying float vNeedle;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvCanW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNeedle = aNeedle;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCanW;\nvarying float vNeedle;\nuniform sampler2D uOrtho;\nuniform float uExt, uFade, uFadeLen, uWinter, uCanSnow;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  { float dd = distance(vCanW.xz, cameraPosition.xz);
    float hh = fract(sin(dot(floor(vCanW.xz * 0.3), vec2(12.9898, 78.233))) * 43758.5453);
    if (dd < uFade + hh * uFadeLen) discard; }`)
      .replace('#include <map_fragment>', `
  vec3 orth = texture2D(uOrtho, (vCanW.xz + uExt) / (2.0 * uExt)).rgb;
  float crown = texture2D(map, vMapUv).r;
  // winter: bare broadleaf crowns read from afar as a grey-brown haze over the snow between the trunks; the conifers
  // keep their green under white tops
  vec3 bare = mix(vec3(0.3, 0.27, 0.25), vec3(0.6, 0.6, 0.62), uCanSnow * 0.7);
  vec3 ever = mix(orth, vec3(0.86, 0.89, 0.93), uCanSnow * 0.45 * smoothstep(0.45, 0.9, crown));
  orth = mix(orth, mix(ever, bare, 1.0 - vNeedle), uWinter);
  diffuseColor.rgb *= orth * (0.5 + 0.85 * crown) * 1.08;`);
  };
  mat.customProgramCacheKey = () => 'geoCanopy';
  const CH = 100, nc = (n - 1) / CH, meshes = [];
  for (let cj = 0; cj < nc; cj++) for (let ci = 0; ci < nc; ci++) {
    const pos = [], uv = [], ndv = [], idx = [], vid = new Map();
    const vert = (i, j) => {
      const k = j * n + i;
      let v = vid.get(k);
      if (v !== undefined) return v;
      const x = -E + i * step, z = -E + j * step, c = cov[k];
      const t = c > 0.12 ? top[k] * Math.min(1, Math.max(0, (c - 0.12) / 0.5)) : -1.0;
      v = pos.length / 3;
      pos.push(x, heightAt(x, z) + t, z);
      uv.push(x / 34, z / 34);
      ndv.push(ndl[k]);
      vid.set(k, v);
      return v;
    };
    for (let j = cj * CH; j < (cj + 1) * CH; j++) for (let i = ci * CH; i < (ci + 1) * CH; i++) {
      const k = j * n + i;
      if (Math.max(cov[k], cov[k + 1], cov[k + n], cov[k + n + 1]) <= 0.12) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    if (!idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aNeedle', new THREE.Float32BufferAttribute(ndv, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = false; m.receiveShadow = false;
    m.userData.noAO = true;
    m.userData.ueSkip = 'canopy';                // (the Unreal export places the real trees instead)
    m.matrixAutoUpdate = false;
    scene.add(m);
    meshes.push(m);
  }
  return { meshes, material: mat, setWinter(on) { uni.uWinter.value = on ? 1 : 0; } };
}
