import * as THREE from 'three';
import { GEO, heightAt } from './data.js';
import { TEX } from '../textures.js';
import { WIND } from '../util.js';
import { RAIN } from '../rain.js';
import { riverCellKept } from './bridge.js';

// Rivers and lakes (V63): the Prahova, the Câmpinița and the brooks, the ponds. Each water cell of the map (5 m near,
// 10 m out to 8 km) knows how deep the water stands over its carved bed (build_geo.py: up to ~1.5 m in the Prahova's
// channel, a few cm at its gravel edges) and which way and how fast it runs:
//  * the Prahova down its mapped line (the level falls ~0.8 % downstream), faster where it is deeper - Manning's
//    v ~ h^(2/3): ~1.5 m/s in the middle of the channel, ~0.5 m/s at the edges; a gravel-bed foothill river;
//  * the smaller rivers and brooks down their own level, the ponds still.
// The surface (one opaque PBR material, ior 1.33: the sky and the sun mirrored by Fresnel, ~2 % looking down, nearly all
// at a grazing angle):
//  * its waves carried with the current (a flow map: two layers of the same pattern, each carried for one period and
//    faded in and out in turn, so it runs without stretching): the swell of the current and the ripples on it,
//    stronger where it runs fast over the shallows (the riffles), flat on a pond;
//  * through it the bed: wet cobbles and gravel, shifted by refraction, dimmed per colour by the water on the way down
//    and back up (turbid river water: red lost fastest), the silt's own grey-green filling in with depth; on a sunny day
//    the ripples focus the sun into a moving net of light on the bed (caustics), fading with depth;
//  * foam carried in streaks where it runs fast over the shallows, and a line of it where it laps the gravel;
//  * in the rain, every drop's ring;
//  * near you, the banks, trees and bridges mirrored in it (the screen-space reflections, post.js), streaked by the waves.

const WATER_PARS = /* glsl */`
uniform float uWTime, uRain, uRainTime, uCaustic;
uniform sampler2D tWN, tBed;
varying vec3 vWW;
varying vec2 vFlow;
varying float vDepth;
vec3 wN;                 // the surface's normal here (world)
float wFoam, wRough;
float wHash(vec2 p) { vec3 q = fract(vec3(mod(p, 4096.0).xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 wSlope(vec2 uv) { vec3 n = texture2D(tWN, uv).xyz * 2.0 - 1.0; return n.xy / max(n.z, 0.3); }
// the rings of the raindrops landing: in every ~0.3 m cell a drop lands at a random spot and time (as rain.js)
vec2 wRings(vec2 p, float t) {
  vec2 g = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * 3.3 + float(k) * vec2(0.37, 0.71), c = floor(q), f = fract(q);
    float h = wHash(c + float(k) * 17.0), ph = fract(t * 1.7 + h);
    vec2 o = vec2(wHash(c + 3.7), wHash(c + 9.1)) * 0.4 + 0.3, d = f - o;
    float r = length(d) + 1e-4, x = (r - ph * 0.3) * 26.0;
    g += d / r * sin(x * 2.4) * exp(-x * x * 0.5) * (1.0 - ph) * (1.0 - ph) * step(r, 0.42);
  }
  return g;
}
// the bed's cobbles (10-25 cm, a Voronoi pattern): their colour and the dark gaps between them
vec3 wCobbles(vec2 p) {
  vec2 q = p * 5.5, c = floor(q), f = fract(q);
  float d1 = 9.0, d2 = 9.0; vec2 id = c;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j)), r = o + vec2(wHash(c + o), wHash(c + o + 7.3)) * 0.8 + 0.1 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = c + o; } else if (d < d2) d2 = d;
  }
  float h = wHash(id * 1.7 + 3.1), gap = smoothstep(0.0, 0.18, sqrt(d2) - sqrt(d1));
  vec3 stone = mix(vec3(0.42, 0.40, 0.36), vec3(0.62, 0.60, 0.55), h);
  stone = mix(stone, vec3(0.50, 0.42, 0.32), step(0.78, wHash(id + 11.0)));    // some brown sandstone
  stone = mix(stone, vec3(0.70, 0.69, 0.66), step(0.9, wHash(id + 23.0)));     // a few pale limestones
  return mix(vec3(0.16, 0.15, 0.13), stone, gap);
}
// the sun focused by the ripples onto the bed: a moving net of light
float wCaustic(vec2 p, float t) {
  float c = 0.0;
  vec2 q = p * 1.9;
  for (int k = 0; k < 2; k++) {
    vec2 w = q + vec2(sin(t * 0.9 + q.y * 1.7), cos(t * 0.8 + q.x * 1.5)) * 0.32;
    float v = sin(w.x * 4.1 + t) * sin(w.y * 3.7 - t * 0.7) + sin((w.x + w.y) * 2.9 + t * 1.3);
    c += pow(max(0.0, 1.0 - abs(v) * 1.6), 4.0);
    q = q * 1.63 + vec2(2.1, 5.3);
  }
  return c * 0.6;
}
void waterSurface() {
  vec2 fl = vFlow, p = vWW.xz;
  float sp = length(fl), d = max(vDepth, 0.0);
  float P = 2.6, f0 = fract(uWTime / P), f1 = fract(uWTime / P + 0.5), w0 = 1.0 - abs(2.0 * f0 - 1.0);
  // carried with the current: the swell (~3 m) and the ripples on it (~0.8 m, a little faster at the top)
  vec2 a = mix(wSlope((p - fl * f1 * P) / 3.1 + 0.37), wSlope((p - fl * f0 * P) / 3.1), w0);
  vec2 b = mix(wSlope((p - fl * f1 * P * 1.15) / 0.83 + 0.61), wSlope((p - fl * f0 * P * 1.15) / 0.83 + 0.11), w0);
  // a breeze ruffles still water a little; the current, the more the faster; over the shallows it breaks into riffles
  float shallow = 1.0 - smoothstep(0.12, 0.6, d);
  float riffle = smoothstep(0.5, 1.3, sp) * shallow;
  float k = 0.07 + 0.22 * smoothstep(0.15, 1.4, sp) + 0.5 * riffle;
  vec2 g = (a * 0.6 + b * 0.45) * k;
  if (uRain > 0.01) g += wRings(p, uRainTime) * 0.55 * min(1.0, uRain * 1.5);
  wN = normalize(vec3(-g.x, 1.0, -g.y));
  // foam: bubbles carried in streaks along the flow where it runs fast over the shallows, a lacy line at the edge
  vec2 fd = sp > 1e-3 ? fl / sp : vec2(1.0, 0.0), fa = vec2(-fd.y, fd.x);
  float fb = 0.0;
  for (int m = 0; m < 2; m++) {
    float ph = m == 0 ? f0 : f1, wk = m == 0 ? w0 : 1.0 - w0;
    vec2 q = p - fl * ph * P + float(m) * vec2(3.7, 7.1);
    fb += wNoise(vec2(dot(q, fa) * 6.0, dot(q, fd) * 1.6)) * wNoise(vec2(dot(q, fa) * 1.5 + 3.0, dot(q, fd) * 0.5 + 7.0)) * wk;
  }
  float edge = 1.0 - smoothstep(0.015, 0.09, d);
  wFoam = clamp(smoothstep(0.3, 0.55, fb) * (0.15 + 0.85 * riffle) + edge * smoothstep(0.35, 0.6, wNoise(p * 7.0 + uWTime * 0.3)) * 0.6, 0.0, 0.85);
  wRough = mix(0.035 + 0.08 * riffle, 0.55, wFoam);
}
// the colour under the surface: the bed through the water, the silt's own colour filling in with depth
vec3 waterBody(vec3 V) {
  float d = max(vDepth, 0.0);
  float ci = clamp(dot(V, wN), 0.02, 1.0), ct = sqrt(max(0.06, 1.0 - (1.0 - ci * ci) / 1.769));   // Snell, n = 1.33
  vec3 sigma = vec3(1.9, 1.05, 1.25);                               // turbid river water (1/m)
  vec3 Tw = exp(-sigma * d * (1.0 + 1.0 / ct));                    // down to the bed and back up along the view
  vec2 bp = vWW.xz - wN.xz * d * 0.6 - V.xz * d / ct * 0.15;        // (refraction: the bed seen shifted)
  vec3 bed = wCobbles(bp) * (0.55 + 0.6 * texture2D(tBed, bp / 1.8).rgb);
  bed *= 0.62;                                                       // (wet: darker)
  bed *= 1.0 + 1.8 * uCaustic * wCaustic(bp, uWTime) * exp(-d * 1.3);
  vec3 body = vec3(0.045, 0.062, 0.052);                            // light thrown back by the silt in the water
  vec3 col = bed * Tw + body * (1.0 - Tw);
  return mix(col, vec3(0.8, 0.82, 0.82), wFoam);
}`;

export function buildWater(scene) {
  // the cells: the near grid's, and the world grid's outside it (the near grid covers its own square)
  const inner = GEO.ext - GEO.step;
  const cells = GEO.water.map(c => [GEO.ext, GEO.step, c]);
  if (GEO.W && GEO.water2) for (const c of GEO.water2) {
    const x = -GEO.W.ext + (c[0] + 0.5) * GEO.W.step, z = -GEO.W.ext + (c[1] + 0.5) * GEO.W.step;
    if (Math.abs(x) < inner && Math.abs(z) < inner) continue;
    cells.push([GEO.W.ext, GEO.W.step, c]);
  }
  // the Prahova's line, downstream (its level falls along it), in 60 m buckets for the nearest segment
  const R = GEO.river?.p ?? [], B = 60, seg = new Map();
  for (let i = 0; i + 3 < R.length; i += 2) {
    const k = Math.floor((R[i] + R[i + 2]) / 2 / B) + ',' + Math.floor((R[i + 1] + R[i + 3]) / 2 / B);
    if (!seg.has(k)) seg.set(k, []);
    seg.get(k).push(i);
  }
  const prahova = (x, z) => {
    let best = Infinity, dir = null;
    const ci = Math.floor(x / B), cj = Math.floor(z / B);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const i of seg.get((ci + di) + ',' + (cj + dj)) ?? []) {
      const ax = R[i], az = R[i + 1], dx = R[i + 2] - ax, dz = R[i + 3] - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - t * dx, z - az - t * dz);
      if (d < best) { best = d; const l = Math.sqrt(l2); dir = [dx / l, dz / l]; }
    }
    return best < 70 ? dir : null;
  };
  // the level of every cell (its grid), for the others' downhill direction
  const levels = [new Map(), new Map()];
  for (const [ext, step, [i, j, lc]] of cells) levels[ext === GEO.ext ? 0 : 1].set(i + ',' + j, lc / 100);
  const pos = [], depth = [], flow = [];
  const nearCells = new Set();                    // (100 m squares with water: for the reflections and the river's sound)
  for (const [ext, step, [i, j, lc]] of cells) {
    const x0 = -ext + i * step, z0 = -ext + j * step, y = lc / 100;
    if (!riverCellKept(x0 + step / 2, z0 + step / 2)) continue;
    const cx = x0 + step / 2, cz = z0 + step / 2;
    nearCells.add(Math.floor(cx / 100) + ',' + Math.floor(cz / 100));
    // which way it runs
    let dir = prahova(cx, cz), vmax = 1.5;
    if (!dir) {
      const L = levels[ext === GEO.ext ? 0 : 1], at = (a, b) => L.get(a + ',' + b);
      const gx = ((at(i - 1, j) ?? y) - (at(i + 1, j) ?? y)) / (2 * step), gz = ((at(i, j - 1) ?? y) - (at(i, j + 1) ?? y)) / (2 * step);
      const g = Math.hypot(gx, gz);
      dir = g > 2e-4 ? [gx / g, gz / g] : [0, 0];
      vmax = g > 2e-4 ? Math.min(1.1, 0.25 + g * 60) : 0;          // (a brook on a 1 % slope ~0.85 m/s; a pond still)
    }
    const corner = (x, z) => {
      const d = y - heightAt(x, z), v = vmax * Math.pow(Math.min(1.2, Math.max(0.06, d / 1.2)), 2 / 3);
      pos.push(x, y, z); depth.push(d); flow.push(dir[0] * v, dir[1] * v);
    };
    const x1 = x0 + step, z1 = z0 + step;
    corner(x0, z0); corner(x0, z1); corner(x1, z0); corner(x1, z0); corner(x0, z1); corner(x1, z1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length); for (let k = 1; k < nrm.length; k += 3) nrm[k] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.computeBoundingSphere();

  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, ior: 1.33, envMapIntensity: 1 });
  const U = { uWTime: WIND.time, uRain: RAIN.uRain, uRainTime: RAIN.uRainTime, uCaustic: { value: 1 }, tWN: { value: TEX.waterN }, tBed: { value: TEX.gravel } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth;\nattribute vec2 aFlow;\nvarying vec3 vWW;\nvarying vec2 vFlow;\nvarying float vDepth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz; vFlow = aFlow; vDepth = aDepth;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WATER_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\nwaterSurface();\ndiffuseColor.rgb = waterBody(normalize(cameraPosition - vWW));')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = wRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
      // near the camera it mirrors the scene (the screen-space reflections read 1 - this from the alpha)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\nif (length(vWW - cameraPosition) < 170.0) gl_FragColor.a = 1.0 - 0.8 * (1.0 - wFoam) * (1.0 - 0.6 * smoothstep(0.1, 0.4, wRough));');
  };
  mat.customProgramCacheKey = () => 'riverWater';
  mat.userData.ue = { kind: 'water' };
  mat.userData.noWet = true;                     // (its own rain rings; no wet-ground patch)
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.userData.noAO = true;
  scene.add(mesh);
  return {
    meshes: [mesh],
    // is there open water within r metres (100 m squares)
    near(p, r = 150) {
      const n = Math.ceil(r / 100), ci = Math.floor(p.x / 100), cj = Math.floor(p.z / 100);
      for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) if (nearCells.has((ci + di) + ',' + (cj + dj))) return true;
      return false;
    },
    // the river's rush where you are (0..1): the Prahova's running water heard within ~150 m
    sound(p) {
      let best = Infinity;
      const ci = Math.floor(p.x / 100), cj = Math.floor(p.z / 100);
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (nearCells.has((ci + di) + ',' + (cj + dj))) best = Math.min(best, Math.hypot(((ci + di) + 0.5) * 100 - p.x, ((cj + dj) + 0.5) * 100 - p.z));
      return best === Infinity ? 0 : Math.max(0, 1 - best / 190) ** 1.6;
    },
    setSun(k) { U.uCaustic.value = k; },
  };
}
