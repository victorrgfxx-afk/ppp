import * as THREE from 'three';
import { SEASON } from '../season.js';
import { GEO, normalAt, heightAt, underpassAt, fineAt } from './data.js';
import { TEX } from '../textures.js';
import { avgColor } from './geotex.js';
import { WIND } from '../util.js';
import { AIR_GLSL } from '../air.js';

// Near terrain (+-3 km, 5 m grid) and world terrain (+-8 km, 10 m grid) in LOD chunks,
// the far relief (the far ring to 20 km, the horizon ring to 100 km), water surfaces.

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
  const [ortho, orthoFar, splat, orthoW, splatW, horizon, horizon2] = await Promise.all([loadTex(base + 'ortho.jpg'), loadTex(base + 'ortho_far.jpg'), loadTex(base + 'splat.png', false),
    GEO.W ? loadTex(base + 'ortho_w.jpg') : null, GEO.W ? loadTex(base + 'splat_w.png', false) : null, GEO.Hz ? loadTex(base + 'horizon.jpg').catch(() => null) : null,
    GEO.Hz2 ? loadTex(base + 'horizon2.jpg').catch(() => null) : null]);
  return { ortho, orthoFar, splat, orthoW, splatW, horizon, horizon2 };
}

// the meadows of the hill of the cross, where the hay grows (hillwood.js sets these): seen from further than the hay is
// drawn, the ground there is the hay's colour (a field is the colour of what grows on it, not of the soil under it), so
// where the drawn grass ends there is no edge
export const MEADOW = { uMeadow: { value: null }, uMeadowBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uMeadowOn: { value: 0 } };

// the ground's three detail textures (grass, soil, gravel: textures.js, 512 px each) as the layers of one array texture:
// one texture unit for the three. The ground's material is the one with the most textures (the photo, the land cover, the
// details, the meadow, the rain's four, the sky's light and three.js's own) and every shadow-casting light adds its map to
// it: most graphics cards give WebGL 16 units, and past them the shader does not link - the ground is not drawn at all
// (V85: it was 17 at Înaltă). (Each layer as the canvas was drawn, flipped as the 2D textures are; mipmaps and the
// anisotropic filtering as theirs.)
let DETAIL = null;
export function detailArray() {
  if (DETAIL) return DETAIL;
  const src = [TEX.grass, TEX.soil, TEX.gravel].map(t => t.image), n = src[0].width;
  const data = new Uint8Array(n * n * 4 * src.length);
  src.forEach((c, k) => {
    let px;
    if (c.getContext) px = c.getContext('2d').getImageData(0, 0, n, n).data;
    else { const cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d'); g.drawImage(c, 0, 0, n, n); px = g.getImageData(0, 0, n, n).data; }
    for (let y = 0; y < n; y++) data.set(px.subarray((n - 1 - y) * n * 4, (n - y) * n * 4), (k * n + y) * n * 4);
  });
  const t = new THREE.DataArrayTexture(data, n, n, src.length);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = TEX.grass.anisotropy;
  t.needsUpdate = true;
  return (DETAIL = t);
}

function terrainMaterial(ortho, splat, ext) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0, color: 0xffffff });
  const uni = {
    uOrtho: { value: ortho }, uSplat: { value: splat }, uDetail: { value: detailArray() },
    uGrassN: { value: TEX.grassN },
    uAvgG: { value: avgColor(TEX.grass) }, uAvgS: { value: avgColor(TEX.soil) }, uAvgR: { value: avgColor(TEX.gravel) },
    uExt: { value: ext }, uAutumn: SEASON.uAutumn, uDormant: SEASON.uDormant, ...MEADOW,
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGeoW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGeoW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGeoW;
uniform sampler2D uOrtho, uSplat;
uniform highp sampler2DArray uDetail;                   // (layers: 0 the grass, 1 the soil, 2 the gravel)
uniform vec3 uAvgG, uAvgS, uAvgR;
uniform float uExt, uAutumn, uDormant, uMeadowOn;
uniform sampler2D uMeadow;
uniform vec4 uMeadowBox;`)
      .replace('#include <map_fragment>', `
  vec2 guv = (vGeoW.xz + uExt) / (2.0 * uExt);
  vec3 sp = texture2D(uSplat, guv).rgb;                 // forest floor, farmland, gravel
  vec3 orth = texture2D(uOrtho, guv).rgb;               // Sentinel-2 colour of the real ground
  vec2 duv = vGeoW.xz / 2.6;
  vec3 cg = texture(uDetail, vec3(duv, 0.0)).rgb;
  vec3 cs = texture(uDetail, vec3(duv * 0.8, 1.0)).rgb;
  // (the gravel: river cobbles and bars are a mid grey, darker in the damp hollows: a broad patchiness over the grit)
  vec3 cr = texture(uDetail, vec3(duv * 1.3, 2.0)).rgb * vec3(0.74, 0.73, 0.7) * (0.8 + 0.45 * (texture(uDetail, vec3(vGeoW.xz / 23.0 + 0.17, 1.0)).r - 0.5));
  // forest floor: last year's beech/oak leaves over dark soil, a little moss
  float lit = texture(uDetail, vec3(duv * 0.37 + 0.31, 1.0)).r;
  vec3 cf = mix(cs * vec3(1.08, 0.8, 0.54), cs * vec3(0.74, 0.56, 0.4), smoothstep(0.35, 0.65, lit));   // (the brown of dry beech leaves)
  cf = mix(cf, cg * vec3(0.55, 0.65, 0.45), 0.1);
  float wf = sp.r, wa = sp.g, wr = sp.b;
  float wg = max(0.0, 1.0 - wf - wa - wr);
  float ws = wg + wf + wa + wr + 1e-4;
  vec3 det = (cg * wg + cf * wf + cs * wa + cr * wr) / ws;
  vec3 avg = (uAvgG * wg + (uAvgS * vec3(0.8, 0.72, 0.6) * 0.65 + uAvgG * 0.25) * wf + uAvgS * wa + uAvgR * wr) / ws;
  vec3 tint = clamp(orth / max(avg, vec3(0.01)), 0.35, 2.4);
  float dist = length(vGeoW - cameraPosition);
  float farK = smoothstep(35.0, 420.0, dist);
  vec3 nearCol = det * mix(vec3(1.0), tint, 0.6 * (1.0 - wf / ws - 0.7 * wr / ws));
  // (under the woods the photo shows the crowns, not the floor; the gravel keeps its own grey, the photo's colour
  // there being a blend with the water and the scrub)
  vec3 farCol = mix(orth * 1.08, uAvgR * vec3(0.7, 0.69, 0.66), 0.6 * wr / ws);
  diffuseColor.rgb *= mix(nearCol, farCol, farK * (1.0 - 0.9 * wf / ws));
  // autumn (season.js): the grass dries in patches to olive and straw (the pastures on the hills in the drone photos;
  // the mown lawns by the houses stay greener: the patches are tens of metres across)
  // (winter, season.js uDormant: dry nearly everywhere, the patches only a little greener)
  if (uAutumn > 0.0 || uDormant > 0.0) {
    vec2 q = vGeoW.xz;
    float k = 0.5 + 0.25 * (sin(dot(q, vec2(0.031, 0.017)) + 1.8 * sin(dot(q, vec2(-0.012, 0.027)))) + sin(dot(q, vec2(0.019, -0.041)) + 1.3 * sin(dot(q, vec2(0.044, 0.008)))));
    vec3 c = diffuseColor.rgb;
    float L = dot(c, vec3(0.2126, 0.7152, 0.0722)), gr = smoothstep(0.02, 0.2, (c.g - max(c.r, c.b)) / max(c.g, 1e-4));
    vec3 dry = L * vec3(1.32, 1.0, 0.55);
    float dk = max(uAutumn * (0.25 + 0.75 * smoothstep(0.3, 0.75, k)), uDormant * (0.75 + 0.25 * smoothstep(0.3, 0.75, k)));
    diffuseColor.rgb = mix(c, dry, gr * (wg / ws) * dk * 0.9);
  }
  if (uMeadowOn > 0.5) {
    vec2 mq = (vGeoW.xz - uMeadowBox.xy) / (uMeadowBox.zw - uMeadowBox.xy);
    if (mq.x > 0.0 && mq.y > 0.0 && mq.x < 1.0 && mq.y < 1.0) { vec4 md = texture2D(uMeadow, mq); diffuseColor.rgb = mix(diffuseColor.rgb, md.rgb, md.a); }
  }
`);
  };
  m.customProgramCacheKey = () => 'geoTerrain';
  m.userData.ue = { kind: 'terrain', ortho, splat, ext };        // (the Unreal export rebuilds this shader)
  m.userData.wet = 'ground';                                      // (muddy where the water runs off it: rain.js)
  return m;
}

// the chunks' levels of detail: [stride, from distance] (the near grid 120 cells = 600 m a chunk, the world grid 100 cells
// = 1 km); roadbed.js keeps the roads over the ground at each of them
export function terrainLevels(quality) {
  const low = quality.label === 'Scăzută';
  return {
    near: low ? [[2, 0], [5, 600], [10, 1300], [20, 2600]] : [[1, 0], [2, 480], [5, 1150], [10, 2300]],
    world: low ? [[2, 0], [4, 1500], [10, 3500]] : [[1, 0], [2, 1300], [4, 2800], [10, 5000]],
  };
}

export function buildTerrain(scene, gt, quality) {
  const L = terrainLevels(quality);
  // near grid: 120 cells = 600 m per chunk
  const near = gridTerrain(scene, GEO, terrainMaterial(gt.ortho, gt.splat, GEO.ext), 120, L.near);
  if (!GEO.W) return near;
  // world grid around it: 100 cells = 1 km per chunk, the chunks under the near grid are left out
  const e = GEO.ext;
  const world = gridTerrain(scene, GEO.W, terrainMaterial(gt.orthoW, gt.splatW, GEO.W.ext), 100, L.world,
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
    // a corner is shared with the cell across the diagonal too: where that one is kept, the corner is its coarse node
    // (else, at an inner corner of the cut-out, this cell's corner stood off its neighbours': a slit you saw the sky
    // through, low across the ground)
    const diag = (da, db) => !holes.has((a + da) + ',' + (b + db));
    const base = pos.length / 3;
    for (let v = 0; v <= K; v++) for (let u = 0; u <= K; u++) {
      const x = X(a) + u * step / K, z = Z(b) + v * step / K, wx = x + cx, wz = z + cz;
      let y;
      const lerp = (p, q, t) => p + (q - p) * t;
      const cu = u === 0 ? -1 : u === K ? 1 : 0, cv = v === 0 ? -1 : v === K ? 1 : 0;
      if (cu && cv && diag(cu, cv)) y = nodeH(a + (cu > 0 ? 1 : 0), b + (cv > 0 ? 1 : 0));
      else if (v === 0 && kept.s) y = lerp(nodeH(a, b), nodeH(a + 1, b), u / K);
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
      // a farther level's nodes as roadbed.js left them (lowered under the roads), else the grid's
      const C = s > 1 ? GEO.lodAdj?.get(G)?.get(s) : null, mc = (n - 1) / s + 1;
      for (let b = 0; b < m; b++) for (let a = 0; a < m; a++) {
        const i = ci * CH + a * s, j = cj * CH + b * s;
        pos.push(-ext + i * step - cx, C ? C[(j / s) * mc + i / s] : H[j * n + i], -ext + j * step - cz);
        normalAt(i, j, nrm, G); nor.push(nrm.x, nrm.y, nrm.z);
      }
      // underpass boxes and fine zones: at full resolution their cells are cut out and rebuilt at 1 m (vertical abutments,
      // level road, terrace edges); fine zones in the world grid too (its 10 m cells rebuilt the same way)
      const holes = s === 1 && (G === GEO ? GEO.ups?.length || GEO.fine?.length : G === GEO.W && GEO.fine?.length) ? new Set() : null;
      const inHole = (a, b) => { const x = -ext + (ci * CH + a + 0.5) * step, z = -ext + (cj * CH + b + 0.5) * step; return !!(underpassAt(x, z) || (GEO.fine && fineAt(x, z))); };
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
    lod.userData.ue = { kind: 'terrainLod' };
    scene.add(lod);
    lods.push(lod);
  }
  return { lods, material: mat };
}

// ------------------------------------------------------------------ the far relief (drawn in a pass of its own)
// The real surroundings beyond the map: the far ring to 20 km (Copernicus DEM + Sentinel-2) and the horizon ring from
// 20 to 100 km (geo/build_horizon.py: the Subcarpathian hills, the Bucegi, Baiului, Ciucaș and Leaota mountains, the
// plain). They are drawn first, with a camera of their own (post.js FarPass: 30 m to 260 km, a few metres of depth
// precision at 100 km where the street's camera would have kilometres), then the map over them.
// Their shader: the Earth's curvature seen from the camera (with the usual refraction, k = 0.13: R' = R / (1 - k);
// ~110 m down at 40 km, ~440 m at 80 km), the colour of the ground lit by the sun and the sky, the snow of the winter
// modes (open ground white, the woods grey; the mountains white above ~900 m), and the aerial perspective: the
// weather's haze (main.js: its density is the real visibility), brighter towards the sun (forward scattering).
export const FAR = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
  uSky: { value: new THREE.Color(0.5, 0.55, 0.6) }, uGround: { value: new THREE.Color(0.3, 0.28, 0.25) }, uAmb: { value: new THREE.Color(0.3, 0.33, 0.38) },
  uFogCol: { value: new THREE.Color(0.6, 0.66, 0.74) }, uFogDensity: { value: 1e-4 }, uFogH: { value: 1200 }, uSunHaze: { value: 0.8 },
  uAirCool: { value: new THREE.Vector3() },
  uSnow: { value: 0 }, uWinter: { value: 0 }, uH0: { value: 0 }, uREff: { value: 6371000 / 0.87 },
};
const FAR_VERT = /* glsl */`
uniform float uREff;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vAlt;
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vAlt = p.y;
  vec2 d = p.xz - cameraPosition.xz;
  p.y -= max(0.0, dot(d, d) - 6.4e7) / (2.0 * uREff);                // (nothing within 8 km of the camera: the map stays level)
  vW = p; vN = normal; vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FAR_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uSunDir, uSunCol, uSky, uGround, uAmb, uFogCol, uAirCool;
uniform float uFogDensity, uFogH, uSunHaze, uSnow, uWinter, uH0;
${AIR_GLSL}
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
varying float vAlt;
void main() {
  vec3 alb = texture2D(uMap, vUv).rgb;
  vec3 n = normalize(vN);
  // snow: the open ground white, the woods (dark, green) grey with it; the mountains in winter white high up
  float green = clamp((alb.g - max(alb.r, alb.b)) * 18.0 + (0.09 - dot(alb, vec3(0.33))) * 9.0, 0.0, 1.0);
  float hi = uWinter * smoothstep(900.0, 1400.0, vAlt + uH0);
  float sn = clamp(max(uSnow * (1.0 - 0.6 * green), hi * (1.0 - 0.35 * green)) * smoothstep(0.35, 0.75, n.y), 0.0, 1.0);
  alb = mix(alb, vec3(0.78, 0.8, 0.83), sn);
  // lit by the sun and the sky (the imagery has its own soft relief shading: the sun's share kept modest)
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 col = alb * (uSunCol * ndl + mix(uGround, uSky, 0.5 + 0.5 * n.y) + uAmb) * 0.3183;
  // the air between (air.js): its own height along the ray (vAlt: the point's, before the curvature's drop), the
  // haze brighter towards the sun (the aerosols scatter forward), at a low sun golden on its side only (main.js)
  vec3 v = vW - cameraPosition;
  float mie = pow(max(dot(normalize(v), uSunDir), 0.0), 6.0);
  vec3 airT, airL; float airTau;
  airPath(cameraPosition, vec3(vW.x, vAlt, vW.z), uFogDensity, uFogH, uFogCol * (1.0 - uAirCool * (1.0 - airToward(v, uSunDir))) * (1.0 + uSunHaze * mie), airT, airL, airTau);
  col = col * airT + airL;
  gl_FragColor = vec4(col, 2.0 - exp(-airTau));                       // (the haze's share for the distance blur: post.js)
}`;
function farMaterial(map) {
  const m = new THREE.ShaderMaterial({ uniforms: { ...FAR, uMap: { value: map } }, vertexShader: FAR_VERT, fragmentShader: FAR_FRAG, fog: false });
  // (what the Unreal export reads: export/unreal.js)
  Object.assign(m, { map, color: new THREE.Color(0xd8dccf), roughness: 1, metalness: 0 });
  return m;
}

// the far ring to 20 km (100 m cells; the map's square is left out)
export function buildFarTerrain(gt) {
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
  const mesh = new THREE.Mesh(g, farMaterial(gt.orthoFar));
  mesh.userData.noAO = true;
  mesh.userData.ue = { kind: 'far' };
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;                        // (its bounds take no account of the curvature)
  return mesh;
}

// The horizon ring, 20.25 to 100 km: a polar grid whose cells all look the same size from the middle (512 sectors of
// 0.7 deg, rings 1.23 % apart: ~250 m at 20 km, ~1.2 km at 100 km), heights from the 500 m grid; its inner edge a
// little under the far ring's (no gap, no flicker) with a skirt hanging below it.
// The outer ring (V62), 99 to 299 km on the 1.5 km grid, the same way: nothing is cut short of where the Earth's
// curvature (and the air) hides it.
export function buildHorizon(gt, outer = false) {
  const Hz = outer ? GEO.Hz2 : GEO.Hz, tex = outer ? gt.horizon2 : gt.horizon;
  if (!Hz || !tex) return null;
  const { n, ext, step, H } = Hz;
  const hAt = (x, z) => {
    const fx = Math.min(n - 1.001, Math.max(0, (x + ext) / step)), fz = Math.min(n - 1.001, Math.max(0, (z + ext) / step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (H[j * n + i] * (1 - u) + H[j * n + i + 1] * u) * (1 - v) + (H[(j + 1) * n + i] * (1 - u) + H[(j + 1) * n + i + 1] * u) * v;
  };
  const NA = 512, Q = 1.0123, R0 = outer ? 98950 : 20250, R1 = outer ? ext - 1800 : Math.min(ext - 600, 99000);
  const radii = [R0 - 1];                             // (the skirt's ring)
  for (let r = R0; r < R1; r *= Q) radii.push(r);
  radii.push(R1);
  const NR = radii.length, pos = new Float32Array(NA * NR * 3), uv = new Float32Array(NA * NR * 2);
  for (let k = 0; k < NR; k++) for (let a = 0; a < NA; a++) {
    const t = a / NA * Math.PI * 2, r = radii[k], x = Math.cos(t) * r, z = Math.sin(t) * r, o = k * NA + a;
    pos[o * 3] = x; pos[o * 3 + 1] = k === 0 ? hAt(x, z) - 160 : hAt(x, z) - (k === 1 ? 3 : 0); pos[o * 3 + 2] = z;
    uv[o * 2] = (x + ext) / (2 * ext); uv[o * 2 + 1] = (z + ext) / (2 * ext);
  }
  const idx = new Uint32Array((NR - 1) * NA * 6);
  let q = 0;
  for (let k = 0; k < NR - 1; k++) for (let a = 0; a < NA; a++) {
    const A = k * NA + a, B = k * NA + (a + 1) % NA, C = A + NA, D = B + NA;
    idx[q++] = A; idx[q++] = B; idx[q++] = C; idx[q++] = B; idx[q++] = D; idx[q++] = C;     // (facing up: A->B turns with the angle)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, farMaterial(tex));
  mesh.userData.noAO = true;
  mesh.userData.ue = { kind: 'far' };
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return mesh;
}

// Water: geo/water.js.
