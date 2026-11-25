import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GEO, gridHeight, addFineZone, addHolePoly } from './data.js';
import { keepClearArea } from './trees.js';
import { ROOF_FRAMES } from './buildings.js';
import { addHillBlock } from './hillwood.js';
import { M } from '../materials.js';
import { TEX, heightToNormalCanvas } from '../textures.js';
import { akmGeometry, m4Geometry, pslGeometry, shotgunGeometry, spares, armsMaterials } from '../arms.js';
import { rng } from '../util.js';

// The shepherds' shed on the hill of the cross (V117): at the user's pin (45.11564 N 25.70305 E), on the open pasture
// ~300 m south-west of the cross, where the shepherds shelter in winter. It is in no map we have - not in OSM, not in
// the ML building footprints, not on the aerial (Esri World Imagery, older than it) - so it is drawn as such a shed is
// built in these hills: 6 x 4 m, a frame of squared timber on dry stones, clad in vertical boards with battens over the
// joints, gone silver-grey outside; a gable roof (30 degrees) of corrugated sheet gone to rust on rafters and purlins,
// a stovepipe through it. The ground falls 14 % to the south-south-east there (the DEM): the long side runs along the
// contour, on a terrace dug into the slope, the door down the slope and to the sun. Inside: a sheet-iron stove with its
// pot and the firewood by it, the plank bed (a straw mattress, a sheepskin, a striped blanket), a table and a bench under
// the gable's window, a hurricane lantern hanging from a tie beam; and on the back wall, facing the door, the rack of
// guns (arms.js: an AKM, an M4, a PSL with its LPS-4 scope, a Remington 870) on iron hooks, the spare magazines and
// the ammunition on the shelf under it, a crate under the shelf. Outside the firewood stacked along the west gable under
// a sheet weighted with stones, the chopping block with its axe, a rain barrel at the corner.
// The light inside: the sky's (the hemisphere and the environment map light everything alike) comes in only through the
// door and the windows - every surface of the shed, inside, takes as much of it as it sees of them (shedSky below,
// worked out per pixel from its place in the shed); the lantern and the stove's fire light it from the shader too, as
// three.js lights each light (RE_Direct), so their light falls only on the shed's own surfaces: nothing of it leaks
// through the walls onto the snow outside, and nothing else in the world pays for it (main.js sets their colour).

// the site: the user's pin; compass east / north as game-frame vectors (the map is turned 42.02 deg)
const P0 = [-899.02, -1955.59];
const EV = [-0.7429, 0.6693], NV = [0.6693, 0.7429];
const dirOf = (az) => { const a = az * Math.PI / 180, e = Math.sin(a), n = Math.cos(a); return [EV[0] * e + NV[0] * n, EV[1] * e + NV[1] * n]; };
// the shed's frame: u along its long side (ENE), v out of its front (SSE, down the slope), y up from its floor
const FRONT_AZ = 166;
const U = dirOf(FRONT_AZ - 90), V = dirOf(FRONT_AZ);
const at = (u, v) => [P0[0] + U[0] * u + V[0] * v, P0[1] + U[1] * u + V[1] * v];
const uvOf = (x, z) => { const dx = x - P0[0], dz = z - P0[1]; return [dx * U[0] + dz * U[1], dx * V[0] + dz * V[1]]; };
// its size: outside 6 x 4 m, the boards 25 mm; the wall plate 2.15 m over the floor, the roof 30 degrees, its
// overhangs 0.4 m at the eaves and 0.3 m at the gables; the purlins and the sheet ~7 cm over the rafters
const W2 = 3.0, D2 = 2.0, T = 0.025, HU = W2 - T, HV = D2 - T;
const WALL = 2.15, PITCH = 30 * Math.PI / 180, TAN = Math.tan(PITCH), COS = Math.cos(PITCH), SIN = Math.sin(PITCH);
const RIDGE = WALL + D2 * TAN, OV_E = 0.4, OV_G = 0.3, LIFT = 0.059 / COS;
const roofY = (v) => WALL + (D2 - Math.abs(v)) * TAN;                 // (the rafters' top)
const DOOR = { u0: -1.35, u1: -0.45, h: 1.92, open: 105 };
const WIN_E = { v0: -0.32, v1: 0.32, y0: 1.08, y1: 1.68 };              // (on the east gable, u = +W2)
const WIN_F = { u0: 1.3, u1: 1.9, y0: 1.05, y1: 1.6 };                 // (on the front, v = +D2)
const GROUND = -0.32;                                                   // (the terrace, under the floor)
const LAMP = [0, 1.8, -1.22], STOVE = [-1.95, -1.45];
let FL = null, TER = null;                                              // the floor's height, the terrace's

export function prepareMagazie() {
  if (!GEO.H) return false;
  // the terrace: level at the footprint's mean ground (dug ~0.3 m into the slope behind, built up as much in front),
  // the step, the woodpile and the chopping block on it too; blended over 4.5 m into the slope round it
  let sum = 0, n = 0;
  for (let u = -W2; u <= W2 + 1e-6; u += 1) for (let v = -D2; v <= D2 + 1e-6; v += 1) { sum += gridHeight(GEO, ...at(u, v)); n++; }
  TER = sum / n; FL = TER - GROUND;
  const E = 4.5, Mg = E + 6, U0 = -W2 - 1.3, U1 = W2 + 1.0, V0 = -D2 - 0.8, V1 = D2 + 1.2;
  const cs = [at(U0 - Mg, V0 - Mg), at(U1 + Mg, V0 - Mg), at(U1 + Mg, V1 + Mg), at(U0 - Mg, V1 + Mg)];
  const box = (P) => [Math.min(...P.map(p => p[0])), Math.max(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[1]))];
  const [x0, x1, z0, z1] = box(cs);
  addFineZone({ x0, x1, z0, z1,
    test: (x, z) => { const [u, v] = uvOf(x, z); return u > U0 - Mg && u < U1 + Mg && v > V0 - Mg && v < V1 + Mg; },
    h: (x, z) => {
      const [u, v] = uvOf(x, z), g0 = gridHeight(GEO, x, z), d = Math.max(U0 - u, u - U1, V0 - v, v - V1, 0);
      const w = 0.025 * Math.sin(u * 1.3 + v * 0.7) * Math.sin(v * 1.1 - u * 0.4);   // (trodden, a little uneven)
      const k = Math.min(1, d / E), s = k * k * (3 - 2 * k);
      return TER + w * (1 - s) + (g0 - TER) * s;
    } });
  // the yard: no tree, no scrub, none of the hill's tall grass, deadwood or boulders; the sward short (a lawn)
  const yard = [at(U0, V0), at(U1, V0), at(U1, V1), at(U0, V1)];
  addHolePoly(yard, { lawn: true, noFences: true });
  const [ax0, ax1, az0, az1] = box(yard);
  const inYard = (m) => (x, z) => { const [u, v] = uvOf(x, z); return u > U0 - m && u < U1 + m && v > V0 - m && v < V1 + m; };
  keepClearArea(ax0 - 2, az0 - 2, ax1 + 2, az1 + 2, inYard(1.5));
  addHillBlock(ax0 - 1, ax1 + 1, az0 - 1, az1 + 1, inYard(0.3));
  return true;
}

// ------------------------------------------------------------------ textures
function hash2(i, j, s) { const h = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); }
// periodic value noise: x, y in cells, px, py the periods (cells), so a tile repeats without a seam
function pn(x, y, px, py, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = (a, p) => ((a % p) + p) % p, a0 = m(xi, px), a1 = m(xi + 1, px), b0 = m(yi, py), b1 = m(yi + 1, py);
  const a = hash2(a0, b0, s), b = hash2(a1, b0, s), c = hash2(a0, b1, s), d = hash2(a1, b1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
// a W x H tile from fn(x, y) -> [r, g, b, height], with its normal map (strength k)
function texFrom(W, H, fn, k) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), HT = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = fn(x, y), i = (y * W + x) * 4;
    img.data[i] = o[0]; img.data[i + 1] = o[1]; img.data[i + 2] = o[2]; img.data[i + 3] = 255; HT[y * W + x] = o[3];
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const nrm = new THREE.CanvasTexture(heightToNormalCanvas(HT, W, H, k));
  for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, nrm };
}
let TX = null;
function textures() {
  if (TX) return TX;
  // sawn softwood, 1 m a tile, the grain along x: its dark late-wood lines (unevenly spaced, wavy), the raised grain
  // of weathered wood, a few knots with the grain swirling round them, checks along it. A neutral light brown: the
  // vertex colours make it the silver-grey of the boards outside, the brown inside, the floor, the stained rack
  const KN = [[90, 140, 8], [330, 400, 6], [460, 60, 5], [250, 250, 4]];
  const grain = texFrom(512, 512, (x, y) => {
    let wy = y + 7 * pn(x / 64, y / 64, 8, 8, 1) + 2.5 * Math.sin(x * Math.PI * 4 / 512 + 3 * pn(x / 128, y / 32, 4, 16, 2)), knot = 0;
    for (const [kx, ky, kr] of KN) {
      let dx = Math.abs(x - kx), dy = Math.abs(y - ky); dx = Math.min(dx, 512 - dx); dy = Math.min(dy, 512 - dy);
      const d = Math.hypot(dx / 2.4, dy) / kr;
      wy += Math.sign(y - ky || 1) * 6 * Math.exp(-d * d * 0.35);
      knot = Math.max(knot, clamp01(1.25 - d));
    }
    const st = pn(x / 64, wy / 1.6, 8, 320, 3) * 0.6 + pn(x / 16, wy / 0.8, 32, 640, 4) * 0.4;
    const dark = Math.max(0, st - 0.55) * 2.6, chk = pn(x / 32, y / 0.5, 16, 1024, 5) > 0.93 ? 1 : 0;
    const k = 0.84 + 0.12 * pn(x / 128, y / 128, 4, 4, 6) - 0.3 * dark - 0.42 * knot - 0.35 * chk;
    return [205 * k, 192 * k, 172 * k, -dark * 0.6 - chk * 0.8 + knot * 0.25 + 0.15 * pn(x / 4, y / 2, 128, 256, 7)];
  }, 1.4);
  // the roof's sheet, 2 m a tile (x along the ridge, y down the slope): galvanised zinc gone to rust in patches,
  // darker where it is deepest, rust running down the corrugations in streaks
  const tin = texFrom(256, 256, (x, y) => {
    const n = pn(x / 32, y / 32, 8, 8, 11) * 0.55 + pn(x / 8, y / 8, 32, 32, 12) * 0.3 + pn(x / 2, y / 16, 128, 16, 13) * 0.15;
    const streak = pn(x / 2, y / 32, 128, 8, 14), r = clamp01((n - 0.4) * 3.2 + (streak - 0.5) * 0.9), deep = clamp01((n - 0.62) * 4);
    const c = [150 + (118 - 150) * r + (70 - 118) * deep * r, 152 + (60 - 152) * r + (36 - 60) * deep * r, 155 + (30 - 155) * r + (20 - 30) * deep * r];
    return [c[0], c[1], c[2], r * 0.5 + deep * 0.3 + 0.2 * pn(x, y, 256, 256, 15)];
  }, 0.9);
  // the striped blanket (a cergă, 0.5 m a tile): red bands with black, white and green stripes, woven in a twill
  const BANDS = [[150, 24, 30, 30], [22, 20, 20, 6], [226, 216, 194, 6], [22, 20, 20, 6], [150, 24, 30, 30], [28, 84, 48, 16], [196, 150, 60, 6], [28, 84, 48, 16], [226, 216, 194, 6], [22, 20, 20, 6]];
  const blanket = texFrom(128, 128, (x, y) => {
    let b = 0, s = 0; while (s + BANDS[b][3] <= y) { s += BANDS[b][3]; b++; }
    const tw = ((x + y) & 3) < 2 ? 1 : 0, f = pn(x, y / 2, 128, 64, 16), k = 0.82 + 0.1 * tw + 0.16 * f;
    return [BANDS[b][0] * k, BANDS[b][1] * k, BANDS[b][2] * k, tw * 0.5 + f * 0.5];
  }, 1.6);
  // a sheepskin (0.4 m a tile): the locks of wool, creamy, their tips grubby
  const wool = texFrom(256, 256, (x, y) => {
    const n = pn(x / 8, y / 8, 32, 32, 21) * 0.5 + pn(x / 4, y / 4, 64, 64, 22) * 0.3 + pn(x / 2, y / 2, 128, 128, 23) * 0.2;
    const lock = 0.5 + 0.5 * Math.sin((x + 9 * pn(x / 16, y / 16, 16, 16, 24)) * 0.4) * Math.sin((y + 9 * pn(x / 16, y / 16, 16, 16, 25)) * 0.4);
    const k = 0.68 + 0.26 * n + 0.12 * lock;
    return [228 * k, 216 * k, 190 * k, n * 0.6 + lock * 0.4];
  }, 3);
  // burlap with straw in it (the mattress), 0.25 m a tile
  const burlap = texFrom(128, 128, (x, y) => {
    const ux = (x & 3) / 3, uy = (y & 3) / 3, over = ((x >> 2) + (y >> 2)) & 1, th = over ? Math.sin(ux * Math.PI) : Math.sin(uy * Math.PI);
    const straw = pn(x / 2, y / 16, 64, 8, 31) > 0.8 ? 1 : 0, k = 0.7 + 0.25 * th + 0.08 * pn(x, y, 128, 128, 32);
    return straw ? [214, 186, 112, 0.8] : [168 * k, 140 * k, 96 * k, th];
  }, 1.5);
  // the stacked logs' ends (0.8 m a tile): split and round billets 11-19 cm across, their rings, the sapwood paler, a
  // check or two, the bark round them; dark gaps between
  const LOG = [];
  const lr = rng(77);
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) LOG.push([(i + 0.5 + (lr() - 0.5) * 0.35) * 256 / 6, (j + 0.5 + (lr() - 0.5) * 0.35) * 256 / 6, 16 + lr() * 6, lr()]);
  const logs = texFrom(256, 256, (x, y) => {
    let best = 1e9, L = null;
    for (const l of LOG) { let dx = Math.abs(x - l[0]), dy = Math.abs(y - l[1]); dx = Math.min(dx, 256 - dx); dy = Math.min(dy, 256 - dy); const d = Math.hypot(dx, dy) / l[2]; if (d < best) { best = d; L = l; } }
    if (best > 1) return [28, 22, 17, -1];
    const a = Math.atan2(y - L[1], x - L[0]), ring = 0.5 + 0.5 * Math.sin(best * L[2] * 1.6 + Math.sin(a * 3) * 0.6);
    const bark = best > 0.9 ? 1 : 0, chk = Math.abs(Math.sin(a * 2 + L[3] * 6)) < 0.04 && best < 0.85 ? 1 : 0;
    const k = (0.78 + 0.12 * ring + 0.1 * best) * (1 - 0.5 * chk);
    return bark ? [70, 52, 38, 0.6] : [196 * k, 160 * k, 112 * k, 0.8 - chk * 0.6 + ring * 0.1];
  }, 2);
  TX = { grain, tin, blanket, wool, burlap, logs };
  return TX;
}

// ------------------------------------------------------------------ the light inside (see the header)
// the lantern and the stove's fire: their places (world) are fixed at build; main.js sets their colours every frame
export const SHED_LAMPS = { uLampW: { value: [new THREE.Vector3(), new THREE.Vector3()] }, uLampColor: { value: [new THREE.Vector3(), new THREE.Vector3()] } };
let SHADE = null;
function shaderParts() {
  if (SHADE) return SHADE;
  const f = (v) => v.toFixed(5);
  const pars = /* glsl */`
varying vec3 vShedP;
uniform vec3 uLampW[2], uLampColor[2];
// the sky's light a point of the shed takes (p, n in its frame: u, height over the floor, v): outside 1 (less at the
// foot of the walls and under the eaves); inside what it sees of the door and the windows, less in the corners, up under
// the smoky roof and on surfaces turned away from the door
float shedSky(vec3 p, vec3 n) {
  bool inside = abs(p.x) <= ${f(HU + 0.004)} && abs(p.z) <= ${f(HV + 0.004)} && p.y > -0.05 && p.y < ${f(RIDGE + 0.05)} && !(n.y > 0.5 && p.y > ${f(WALL - 0.05)});
  // (in the walls' thickness, facing the room: a batten's back seen through a joint is in the shed's dark too)
  inside = inside || (abs(p.x) <= ${f(W2 + 0.03)} && abs(p.z) <= ${f(D2 + 0.03)} && p.y > -0.25 && p.y < ${f(RIDGE)} && dot(n.xz, -p.xz) > 0.3 * length(p.xz));
  if (!inside) return (0.72 + 0.28 * clamp((p.y + 0.32) / 0.7, 0.0, 1.0)) * (n.y < -0.5 && abs(p.z) > ${f(HV)} ? 0.6 : 1.0);
  float dd = length(vec3(p.x - ${f((DOOR.u0 + DOOR.u1) / 2)}, (p.y - 0.95) * 0.7, p.z - ${f(D2)}));
  float k = 0.24 + 0.52 * exp(-dd / 1.6);
  k += 0.12 * exp(-length(vec3(p.x - ${f(W2)}, p.y - ${f((WIN_E.y0 + WIN_E.y1) / 2)}, p.z)) / 1.1);
  k += 0.1 * exp(-length(vec3(p.x - ${f((WIN_F.u0 + WIN_F.u1) / 2)}, p.y - ${f((WIN_F.y0 + WIN_F.y1) / 2)}, p.z - ${f(D2)})) / 1.0);
  vec2 td = vec2(${f((DOOR.u0 + DOOR.u1) / 2)} - p.x, ${f(D2 + 1)} - p.z);
  k *= 0.85 + 0.25 * max(dot(n.xz, td) / max(length(td), 1e-3), 0.0);
  float cu = clamp((${f(HU)} - abs(p.x)) / 0.35, 0.0, 1.0), cv = clamp((${f(HV)} - abs(p.z)) / 0.35, 0.0, 1.0);
  k *= (0.72 + 0.28 * min(cu, cv)) * (0.8 + 0.2 * clamp(p.y / 0.3, 0.0, 1.0)) * (1.0 - 0.25 * clamp((p.y - 1.8) / 1.2, 0.0, 1.0));
  return min(k, 1.0);
}`;
  const main = /* glsl */`
{
  vec3 sp = vShedP - vec3(${f(P0[0])}, ${f(FL)}, ${f(P0[1])}), wn = inverseTransformDirection(geometryNormal, viewMatrix);
  vec3 su = vec3(${f(U[0])}, 0.0, ${f(U[1])}), sv = vec3(${f(V[0])}, 0.0, ${f(V[1])});
  float sky = shedSky(vec3(dot(sp, su), sp.y, dot(sp, sv)), vec3(dot(wn, su), wn.y, dot(wn, sv)));
  reflectedLight.indirectDiffuse *= sky;
#ifdef SHED_ARMS
  reflectedLight.indirectSpecular *= 0.3 + 0.7 * sky;      // (the guns' steel catches the doorway's light, as it does)
#else
  reflectedLight.indirectSpecular *= sky * (0.55 + 0.45 * sky);
#endif
  for (int i = 0; i < 2; i++) {
    vec3 lw = uLampW[i] - vShedP; float ld = max(length(lw), 0.05);
    IncidentLight lampL;
    lampL.direction = normalize((viewMatrix * vec4(lw, 0.0)).xyz);
    lampL.color = uLampColor[i] * getDistanceAttenuation(ld, 7.0, 2.0);
    lampL.visible = true;
    RE_Direct(lampL, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  }
}`;
  SHADE = { pars, main };
  return SHADE;
}
function shade(m) {
  const { pars, main } = shaderParts();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLampW = SHED_LAMPS.uLampW; sh.uniforms.uLampColor = SHED_LAMPS.uLampColor;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShedP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvShedP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + pars)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + main);
  };
  return m;
}

let MT = null;
function mats() {
  if (MT) return MT;
  const t = textures();
  const lit = (o) => shade(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }));
  MT = {
    wood: lit({ map: t.grain.map, normalMap: t.grain.nrm, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9 }),
    tin: lit({ map: t.tin.map, normalMap: t.tin.nrm, normalScale: new THREE.Vector2(0.4, 0.4), metalness: 0.5, roughness: 0.62 }),
    stone: lit({ map: M.stoneWall.map, normalMap: M.stoneWall.normalMap, roughness: 0.92 }),
    iron: lit({ map: t.tin.map, normalMap: TEX.hammerN, normalScale: new THREE.Vector2(0.5, 0.5), metalness: 0.6, roughness: 0.55 }),
    blanket: lit({ map: t.blanket.map, normalMap: t.blanket.nrm, roughness: 0.96 }),
    wool: lit({ map: t.wool.map, normalMap: t.wool.nrm, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1 }),
    burlap: lit({ map: t.burlap.map, normalMap: t.burlap.nrm, roughness: 1 }),
    logs: lit({ map: t.logs.map, normalMap: t.logs.nrm, roughness: 0.92 }),
    prop: lit({ roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9aa8a4, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.26, depthWrite: false }),
    lampGlass: new THREE.MeshStandardMaterial({ color: 0xfff4e6, emissive: 0xffa448, emissiveIntensity: 0, roughness: 0.05, transparent: true, opacity: 0.32, depthWrite: false }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffc46a }),
    fire: new THREE.MeshStandardMaterial({ color: 0x150804, emissive: 0xff5a14, emissiveIntensity: 0, roughness: 0.9 }),
  };
  for (const k of ['glass', 'lampGlass', 'fire', 'flame']) MT[k].userData.noWet = true;
  // the guns' and the spares' materials: copies of their own, lit as the shed's (and dry: they hang indoors)
  for (const [k, m] of Object.entries(armsMaterials())) { const c = m.clone(); c.vertexColors = true; c.userData.noWet = true; c.defines = { ...(c.defines || {}), SHED_ARMS: '' }; MT['A:' + k] = shade(c); }
  return MT;
}

// ------------------------------------------------------------------ geometry helpers (the shed's frame)
// a part's vertex colours from its tint (a colour, a grey, or fn(u, y, v, nu, ny, nv) of where each vertex is and which
// way it faces), now: in the frame it is in
function bake(g0, t) {
  const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = typeof t === 'function' ? t(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)) : typeof t === 'number' ? [t, t, t] : t;
    c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// UVs in metres from where a face is and which way it faces; `grain`: the axis the texture's x runs along ('y' up a
// board, 'u' or 'v' along a beam), ou / ov an offset (each board its own piece of the tile)
function planarUV(g, tile = 1, grain = 'y', ou = 0, ov = 0) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let along, across;
    if (grain === 'y') { along = y; across = ax > az ? z : x; }
    else if (grain === 'u') { along = x; across = ay > az ? z : y; }
    else { along = z; across = ay > ax ? x : y; }
    uv.setXY(i, along / tile + ou, across / tile + ov);
  }
  return g;
}
// a prism: the polygon pts [[v, y], ...] (in the plane across the shed) extruded along u from u0 to u1
function prismU(pts, u0, u1) {
  const sh = new THREE.Shape(pts.map(([v, y]) => new THREE.Vector2(v, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: u1 - u0, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);                       // (shape x -> +v, the extrusion -> -u)
  g.translate(u1, 0, 0);
  return g;
}

// ------------------------------------------------------------------ the shed
export function buildMagazie(B, world) {
  if (FL === null) return null;
  const Mt = mats(), R = rng(11756);
  const G = new Map();                                     // material -> [geometries, in the shed's frame]
  const put = (k, g, tint = 1) => { g.userData.tint = tint; (G.get(k) ?? G.set(k, []).get(k)).push(g); return g; };
  const box = (k, u0, u1, y0, y1, v0, v1, tint = 1, grain = 'y', tile = 1) => {
    const g = new THREE.BoxGeometry(u1 - u0, y1 - y0, v1 - v0);
    g.translate((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2);
    return put(k, planarUV(g, tile, grain, R() * 7, R() * 7), tint);
  };
  const cyl = (k, u, v, y0, y1, r0, r1 = r0, seg = 12, tint = 1, open = false) => {
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, open); g.translate(u, (y0 + y1) / 2, v); return put(k, g, tint);
  };
  // a round rod from a to b ([u, y, v])
  const rod = (k, a, b, r, seg = 8, tint = 1) => {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
    const g = new THREE.CylinderGeometry(r, r, L, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return put(k, g, tint);
  };
  // a turned part (lathe: [[r, y], ...]) standing at (u, v), its foot at y0
  const lathe = (k, prof, u, v, y0, seg = 16, tint = 1) => {
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.translate(u, y0, v); return put(k, g, tint);
  };
  const jit = (a) => (R() - 0.5) * a;

  // ---- colours (vertex colours over the textures' own): the wood's
  const tone = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const GREY = [0.42, 0.41, 0.39], GREY_B = [0.44, 0.38, 0.31], INB = [0.62, 0.46, 0.33], FRAME = [0.58, 0.42, 0.29];
  const FLOOR = [0.5, 0.37, 0.26], RACK = [0.3, 0.22, 0.16], BARK = [0.3, 0.23, 0.17], END = [0.86, 0.72, 0.52];
  // a wall's board: silver-grey outside (darker at its foot where the rain splashes), brown on the room's side
  const boardTint = (out, wk) => (u, y, v, nu, ny, nv) => {
    const o = nu * out[0] + nv * out[1];
    if (o < -0.5) return tone(INB, 0.85 + 0.3 * wk);
    return tone(wk > 0.72 ? GREY_B : GREY, (0.72 + 0.5 * wk) * (0.7 + 0.3 * clamp01((y + 0.2) / 0.7)));
  };

  // ---- the footing: dry stones under the walls, ~12 cm of them showing over the terrace
  for (const [a0, a1, side] of [[-W2, W2, 'f'], [-W2, W2, 'b'], [-D2, D2, 'w'], [-D2, D2, 'e']]) {
    for (let a = a0; a < a1 - 0.05;) {
      const l = Math.min(a1 - a, 0.26 + R() * 0.2), h = 0.2 + R() * 0.08, d = 0.22 + R() * 0.08, m = a + l / 2;
      const g = new THREE.BoxGeometry(l, h, d);
      g.rotateY(jit(0.18)); g.rotateX(jit(0.1));
      const off = 0.03 + jit(0.03) - d / 2;
      if (side === 'f') g.translate(m, -0.42 + h / 2, D2 + off); else if (side === 'b') g.translate(m, -0.42 + h / 2, -D2 - off);
      else { g.rotateY(Math.PI / 2); g.translate(side === 'e' ? W2 + off : -W2 - off, -0.42 + h / 2, m); }
      put('stone', planarUV(g, 1.2, 'y', R() * 5, R() * 5), tone([1, 0.96, 0.9], 0.75 + 0.3 * R()));
      a += l + 0.01;
    }
  }

  // ---- the floor: planks along the shed, worn paler from the door to the stove and the rack
  for (let v = -HV; v < HV - 1e-6;) {
    const w = Math.min(HV - v, 0.14 + jit(0.02)), pk = 0.82 + 0.25 * R();
    box('wood', -HU, HU, -0.03, 0, v + 0.002, v + w - 0.002, (u, y, vv) => tone(FLOOR, pk * (0.86 + 0.18 * Math.exp(-Math.hypot(u + 0.9, vv - 0.5) / 1.6))), 'u');
    v += w;
  }

  // ---- the walls: their openings, the boards (each its width, the openings' edges at board edges), the battens
  // over the joints outside; the frame inside: corner posts, studs, plates, the girt at mid-height, the gables' studs
  const WALLS = [
    // name, along: the axis the wall runs on, fixed coordinate, outward [nu, nv], its span, openings [a0, a1, y0, y1]
    { k: 'front', along: 'u', at: D2 - T, out: [0, 1], a0: -W2, a1: W2, open: [[DOOR.u0, DOOR.u1, -1, DOOR.h], [WIN_F.u0, WIN_F.u1, WIN_F.y0, WIN_F.y1]] },
    { k: 'back', along: 'u', at: -D2, out: [0, -1], a0: -W2, a1: W2, open: [] },
    { k: 'east', along: 'v', at: W2 - T, out: [1, 0], a0: -HV, a1: HV, open: [[WIN_E.v0, WIN_E.v1, WIN_E.y0, WIN_E.y1]] },
    { k: 'west', along: 'v', at: -W2, out: [-1, 0], a0: -HV, a1: HV, open: [] },
  ];
  const topAt = (w, a) => w.along === 'u' ? WALL + 0.055 : roofY(a) + 0.055;   // (up to the sheet: the gables' slope)
  for (const w of WALLS) {
    const cuts = new Set([w.a0, w.a1]);
    for (const o of w.open) { cuts.add(o[0]); cuts.add(o[1]); }
    const edges = [w.a0];
    const sorted = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      const s0 = sorted[i], s1 = sorted[i + 1], n = Math.max(1, Math.round((s1 - s0) / 0.21));
      for (let j = 1; j <= n; j++) edges.push(j === n ? s1 : s0 + (s1 - s0) * j / n + jit(0.03));
    }
    for (let i = 0; i < edges.length - 1; i++) {
      const b0 = edges[i] + 0.0006, b1 = edges[i + 1] - 0.0006, mid = (b0 + b1) / 2, wk = R();
      const op = w.open.find(o => mid > o[0] && mid < o[1]);
      const spans = op ? [[-0.2, op[2]], [op[3], null]] : [[-0.2, null]];
      for (const [y0, y1r] of spans) {
        if (y0 < -0.19 && op && op[2] < 0) continue;                   // (the door: nothing under it)
        const tint = boardTint(w.out, wk);
        if (w.along === 'u') box('wood', b0, b1, y0, y1r ?? topAt(w, 0), w.at, w.at + T, tint);
        else {
          // (a gable board: its top cut along the roof's slope)
          const y1a = y1r ?? topAt(w, b0), y1b = y1r ?? topAt(w, b1);
          if (y0 >= Math.max(y1a, y1b) - 0.01) continue;
          const g = prismU([[b0, y0], [b1, y0], [b1, y1b], [b0, y1a]], w.at, w.at + T);
          put('wood', planarUV(g, 1, 'y', R() * 7, R() * 7), tint);
        }
      }
    }
    // the battens over the joints (not at an opening's edge: its casing covers that)
    const isEdge = (a) => w.open.some(o => Math.abs(a - o[0]) < 0.01 || Math.abs(a - o[1]) < 0.01);
    for (let i = 1; i < edges.length - 1; i++) {
      const a = edges[i];
      if (isEdge(a)) continue;
      const op = w.open.find(o => a > o[0] && a < o[1]), oo = w.at + (w.out[0] + w.out[1] > 0 ? T : 0), o1 = oo + (w.out[0] + w.out[1] > 0 ? 0.02 : -0.02);
      const spans = op ? [[-0.18, op[2]], [op[3], null]] : [[-0.18, null]];
      for (const [y0, y1r] of spans) {
        if (op && op[2] < 0 && y0 < 0) continue;
        const tint = boardTint(w.out, R() * 0.6 + 0.2);
        if (w.along === 'u') box('wood', a - 0.025, a + 0.025, y0, y1r ?? WALL + 0.03, Math.min(oo, o1), Math.max(oo, o1), tint);
        else {
          const ya = y1r ?? roofY(a - 0.025) + 0.03, yb = y1r ?? roofY(a + 0.025) + 0.03;
          put('wood', planarUV(prismU([[a - 0.025, y0], [a + 0.025, y0], [a + 0.025, yb], [a - 0.025, ya]], Math.min(oo, o1), Math.max(oo, o1)), 1, 'y', R() * 7, R() * 7), tint);
        }
      }
    }
  }
  // the corner boards outside (two at each corner, over the boards' ends)
  for (const su of [-1, 1]) for (const sv of [-1, 1]) {
    const t = boardTint([su, 0], 0.4), t2 = boardTint([0, sv], 0.4);
    box('wood', su > 0 ? W2 : -W2 - 0.022, su > 0 ? W2 + 0.022 : -W2, -0.2, WALL + 0.03, sv > 0 ? D2 - 0.12 : -D2, sv > 0 ? D2 + 0.022 : -D2 + 0.12, t);
    box('wood', su > 0 ? W2 - 0.12 : -W2 - 0.022, su > 0 ? W2 + 0.022 : -W2 + 0.12, -0.2, WALL + 0.03, sv > 0 ? D2 : -D2 - 0.022, sv > 0 ? D2 + 0.022 : -D2, t2);
  }
  // the frame inside
  const inT = (k) => tone(FRAME, 0.85 + 0.3 * k);
  for (const su of [-1, 1]) for (const sv of [-1, 1]) box('wood', su * HU - (su > 0 ? 0.1 : 0), su * HU + (su > 0 ? 0 : 0.1), 0, WALL, sv * HV - (sv > 0 ? 0.1 : 0), sv * HV + (sv > 0 ? 0 : 0.1), inT(R()));
  const studs = (w, list) => {
    for (const a of list) {
      const op = w.open.find(o => a + 0.03 > o[0] - 0.06 && a - 0.03 < o[1] + 0.06);
      if (op) continue;
      if (w.along === 'u') box('wood', a - 0.025, a + 0.025, 0, WALL, w.out[1] > 0 ? HV - 0.1 : -HV, w.out[1] > 0 ? HV : -HV + 0.1, inT(R()));
      else box('wood', w.out[0] > 0 ? HU - 0.1 : -HU, w.out[0] > 0 ? HU : -HU + 0.1, 0, roofY(a) - 0.03, a - 0.025, a + 0.025, inT(R()));
    }
  };
  for (const w of WALLS) {
    const list = [];
    for (let a = w.a0 + 0.62; a < w.a1 - 0.3; a += 0.6) list.push(a);
    studs(w, list);
    // the openings' trimmers, headers and sills; the plates and the girt (interrupted by the openings)
    const inner = (a0, a1, y0, y1) => w.along === 'u'
      ? box('wood', a0, a1, y0, y1, w.out[1] > 0 ? HV - 0.1 : -HV, w.out[1] > 0 ? HV : -HV + 0.1, inT(R()), 'u')
      : box('wood', w.out[0] > 0 ? HU - 0.1 : -HU, w.out[0] > 0 ? HU : -HU + 0.1, y0, y1, a0, a1, inT(R()), 'v');
    for (const o of w.open) {
      for (const a of [o[0] - 0.05, o[1]]) w.along === 'u'
        ? box('wood', a, a + 0.05, 0, WALL, w.out[1] > 0 ? HV - 0.1 : -HV, w.out[1] > 0 ? HV : -HV + 0.1, inT(R()))
        : box('wood', w.out[0] > 0 ? HU - 0.1 : -HU, w.out[0] > 0 ? HU : -HU + 0.1, 0, roofY(a) - 0.03, a, a + 0.05, inT(R()));
      inner(o[0] - 0.05, o[1] + 0.05, o[3], o[3] + 0.1);
      if (o[2] > 0) inner(o[0] - 0.05, o[1] + 0.05, o[2] - 0.08, o[2]);
    }
    const segs = [[w.a0 + 0.1, w.a1 - 0.1]];
    for (const o of w.open) {
      for (let i = segs.length - 1; i >= 0; i--) {
        const [s0, s1] = segs[i];
        if (o[1] + 0.05 <= s0 || o[0] - 0.05 >= s1) continue;
        segs.splice(i, 1, ...[[s0, o[0] - 0.05], [o[1] + 0.05, s1]].filter(([a, b]) => b - a > 0.05));
      }
    }
    for (const [s0, s1] of segs) { inner(s0, s1, 0, 0.05); inner(s0, s1, 1.0, 1.1); }
    inner(w.a0 + 0.1, w.a1 - 0.1, WALL - 0.1, WALL);                     // (the top plate runs over the openings)
  }

  // ---- the roof: rafters in pairs, their tails out over the eaves; the ridge board, three tie beams, the purlins; the
  // corrugated sheets (76 mm waves, 18 mm deep, down the slope) with the ridge cap; the barge boards at the gables, the
  // fascia at the eaves
  const RAF = 11, raf = [];
  for (let i = 0; i < RAF; i++) raf.push(-HU + 0.025 + i * (2 * HU - 0.05) / (RAF - 1));
  const vE = D2 + OV_E;
  for (const u of raf) for (const sd of [-1, 1]) {
    const ve = sd * vE, ye = roofY(ve), dv = 0.12 / COS;
    put('wood', planarUV(prismU(sd > 0 ? [[0, RIDGE], [ve, ye], [ve, ye - dv], [0, RIDGE - dv]] : [[ve, ye], [0, RIDGE], [0, RIDGE - dv], [ve, ye - dv]], u - 0.025, u + 0.025), 1, 'v', R() * 7, R() * 7), inT(R()));
  }
  box('wood', -W2 - OV_G + 0.03, W2 + OV_G - 0.03, RIDGE - 0.17, RIDGE + 0.005, -0.015, 0.015, inT(0.5), 'u');
  for (const u of [-1.55, 0, 1.6]) box('wood', u - 0.03, u + 0.03, WALL - 0.12, WALL, -HV + 0.1, HV - 0.1, inT(R()), 'v');
  for (const sd of [-1, 1]) for (const vc of [0.17, 0.72, 1.27, 1.82, 2.32]) {
    const v = sd * vc, q = [v, roofY(v)], t = [sd * COS, -SIN], n = [sd * SIN, COS], h = 0.025;
    const P = [[q[0] - t[0] * h, q[1] - t[1] * h], [q[0] + t[0] * h, q[1] + t[1] * h], [q[0] + t[0] * h + n[0] * 0.05, q[1] + t[1] * h + n[1] * 0.05], [q[0] - t[0] * h + n[0] * 0.05, q[1] - t[1] * h + n[1] * 0.05]];
    put('wood', planarUV(prismU(sd > 0 ? P : P.slice().reverse(), -W2 - OV_G, W2 + OV_G), 1, 'u', R() * 7, R() * 7), inT(R()));
  }
  // (the sheets)
  const WAVE = 0.0762, AMP = 0.009, SEG = 6, UL = -W2 - OV_G, UR = W2 + OV_G, NW = Math.round((UR - UL) / WAVE), N = NW * SEG;
  for (const sd of [-1, 1]) {
    const pos = [], nrm = [], uvs = [], col = [], ve = sd * (vE + 0.05);
    const tn = [sd * SIN, COS];                                         // (the slope's normal in (v, y))
    const sheetK = [...Array(12)].map(() => 0.78 + R() * 0.32);
    // (a point of the sheet: on the purlins, the rafter line raised along the slope's normal, the wave along it too)
    const pt = (i, j, top) => {
      const u = UL + (UR - UL) * i / N, ph = (u - UL) / WAVE * Math.PI * 2, lift = 0.059 + AMP * Math.sin(ph) + (top ? 0.0008 : -0.0008);
      const pv = j ? ve : sd * 0.004, py = roofY(pv);
      const dh = AMP * Math.cos(ph) * Math.PI * 2 / WAVE, nl = Math.hypot(dh, 1);
      const n = [-dh / nl, tn[1] / nl, tn[0] / nl];                         // (u, y, v)
      return { p: [u, py + tn[1] * lift, pv + tn[0] * lift], n: top ? n : [-n[0], -n[1], -n[2]], k: sheetK[Math.min(11, Math.floor((u - UL) / 0.92))] };
    };
    for (const top of [true, false]) {
      for (let i = 0; i < N; i++) {
        const a = pt(i, 0, top), b = pt(i + 1, 0, top), c = pt(i + 1, 1, top), d = pt(i, 1, top);
        // (wound to face up for the top, down for the underside; the front and the back mirror each other)
        const up = (sd > 0) === top;
        const tri = up ? [a, d, c, a, c, b] : [a, c, d, a, b, c];
        for (const q of tri) {
          pos.push(...q.p); nrm.push(...q.n);
          uvs.push((q.p[0] - UL) / 2, Math.abs(q.p[2]) / COS / 2);
          const kk = top ? q.k : 0.72 * q.k;
          col.push(kk, kk * (top ? 1 : 1.02), kk * (top ? 1 : 1.05));
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    put('tin', g, null);
  }
  // (the ridge cap: a flat bent sheet over the top, 16 cm down each side)
  for (const sd of [-1, 1]) {
    const tn = [sd * SIN, COS], l = 0.075, P = [];
    for (const [v, yy] of [[0, RIDGE], [sd * 0.16 * COS, roofY(sd * 0.16 * COS)]]) P.push([v + tn[0] * l, yy + tn[1] * l]);
    const th = 0.002, Q = [P[0], P[1], [P[1][0] + tn[0] * th, P[1][1] + tn[1] * th], [P[0][0] + tn[0] * th, P[0][1] + tn[1] * th]];
    put('tin', planarUV(prismU(sd > 0 ? Q : Q.slice().reverse(), UL - 0.01, UR + 0.01), 2, 'u'), [0.9, 0.86, 0.82]);
  }
  // (the barge boards and the fascias)
  for (const su of [-1, 1]) for (const sd of [-1, 1]) {
    const ve = sd * vE, y0 = RIDGE + 0.06, y1 = roofY(ve) + 0.06;
    const P = sd > 0 ? [[0, y0], [ve, y1], [ve, y1 - 0.2], [0, y0 - 0.2]] : [[ve, y1], [0, y0], [0, y0 - 0.2], [ve, y1 - 0.2]];
    const u0 = su > 0 ? UR - 0.025 : UL, g = prismU(P, u0, u0 + 0.025);
    put('wood', planarUV(g, 1, 'v', R() * 7, R() * 7), boardTint([su, 0], 0.3));
  }
  for (const sd of [-1, 1]) {
    const ve = sd * vE, y = roofY(ve);
    box('wood', UL, UR, y - 0.15, y + 0.055, sd > 0 ? ve : ve - 0.022, sd > 0 ? ve + 0.022 : ve, boardTint([0, sd], 0.3), 'u');
  }

  // ---- the door (planks, ledges and a brace inside, strap hinges, the hasp and its open padlock), open outward; its
  // frame, the threshold; the windows (a casing, the sash's four panes)
  for (const a of [DOOR.u0 - 0.07, DOOR.u1]) box('wood', a, a + 0.07, -0.2, DOOR.h, D2, D2 + 0.024, boardTint([0, 1], 0.5));
  box('wood', DOOR.u0 - 0.07, DOOR.u1 + 0.07, DOOR.h, DOOR.h + 0.08, D2, D2 + 0.024, boardTint([0, 1], 0.5), 'u');
  box('wood', DOOR.u0, DOOR.u1, -0.03, 0.012, HV - 0.1, D2 + 0.04, tone(FLOOR, 0.9), 'u');
  {
    const L = [], add = (k, g, tint) => L.push([k, bake(g, tint)]);
    const bx = (k, x0, x1, y0, y1, z0, z1, tint, grain = 'y') => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); add(k, planarUV(g, 1, grain, R() * 7, R() * 7), tint); };
    const wd = DOOR.u1 - DOOR.u0 - 0.01, dt = (o, k) => (u, y, v, nu, ny, nv) => nv * o > 0.5 ? tone(GREY, 0.8 + 0.3 * k) : tone(INB, 0.8 + 0.3 * k);
    for (let i = 0; i < 5; i++) bx('wood', i * wd / 5 + 0.002, (i + 1) * wd / 5 - 0.002, 0.02, DOOR.h - 0.01, 0, 0.022, dt(1, R()));
    for (const y of [0.18, 1.6]) bx('wood', 0.03, wd - 0.03, y, y + 0.12, -0.022, 0, tone(INB, 0.95), 'u');
    {
      const a = [0.07, 0.3], b = [wd - 0.07, 1.6], l = Math.hypot(b[0] - a[0], b[1] - a[1]), g = new THREE.BoxGeometry(l, 0.1, 0.022);
      planarUV(g, 1, 'u'); g.rotateZ(Math.atan2(b[1] - a[1], b[0] - a[0])); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -0.011); add('wood', g, tone(INB, 0.9));
    }
    const BLK = [0.12, 0.11, 0.1];
    for (const y of [0.24, 1.66]) { bx('iron', -0.02, 0.42, y - 0.018, y + 0.018, 0.022, 0.026, BLK); const k = new THREE.CylinderGeometry(0.011, 0.011, 0.07, 8); k.translate(-0.012, y, 0.01); add('iron', k, BLK); }
    bx('iron', wd - 0.12, wd - 0.04, 0.98, 1.01, 0.022, 0.027, BLK);
    bx('iron', wd - 0.1, wd - 0.06, 0.9, 0.95, 0.024, 0.04, [0.5, 0.45, 0.38]);
    const sh = new THREE.TorusGeometry(0.014, 0.003, 6, 10, Math.PI); sh.translate(wd - 0.08, 0.95, 0.032); add('iron', sh, [0.6, 0.6, 0.6]);
    const th = -DOOR.open * Math.PI / 180, Md = new THREE.Matrix4().makeRotationY(th).setPosition(DOOR.u0, 0, D2 + 0.026);
    for (const [k, g] of L) { g.applyMatrix4(Md); put(k, g, null); }
  }
  const casing = (k, horiz, a0, a1, y0, y1, fixed, out) => {
    const o0 = fixed + (out > 0 ? 0 : -0.024), o1 = fixed + (out > 0 ? 0.024 : 0);
    if (horiz === 'u') {
      for (const a of [a0 - 0.06, a1]) box('wood', a, a + 0.06, y0, y1, o0, o1, boardTint([0, out], 0.5));
      box('wood', a0 - 0.06, a1 + 0.06, y1, y1 + 0.06, o0, o1, boardTint([0, out], 0.5), 'u');
      box('wood', a0 - 0.08, a1 + 0.08, y0 - 0.05, y0, o0, o1 + 0.04 * out, boardTint([0, out], 0.5), 'u');
    } else {
      for (const a of [a0 - 0.06, a1]) box('wood', o0, o1, y0, y1, a, a + 0.06, boardTint([out, 0], 0.5));
      box('wood', o0, o1, y1, y1 + 0.06, a0 - 0.06, a1 + 0.06, boardTint([out, 0], 0.5), 'v');
      box('wood', o0, o1 + 0.04 * out, y0 - 0.05, y0, a0 - 0.08, a1 + 0.08, boardTint([out, 0], 0.5), 'v');
    }
  };
  casing('wood', 'u', WIN_F.u0, WIN_F.u1, WIN_F.y0, WIN_F.y1, D2, 1);
  casing('wood', 'v', WIN_E.v0, WIN_E.v1, WIN_E.y0, WIN_E.y1, W2, 1);
  const sash = (horiz, a0, a1, y0, y1, fixed) => {
    const am = (a0 + a1) / 2, ym = (y0 + y1) / 2, tw = [0.5, 0.45, 0.4];
    const bar = (b0, b1, c0, c1) => horiz === 'u' ? box('wood', b0, b1, c0, c1, fixed - 0.02, fixed - 0.005, tw) : box('wood', fixed - 0.02, fixed - 0.005, c0, c1, b0, b1, tw);
    bar(a0, a0 + 0.035, y0, y1); bar(a1 - 0.035, a1, y0, y1); bar(a0, a1, y0, y0 + 0.035); bar(a0, a1, y1 - 0.035, y1);
    bar(am - 0.012, am + 0.012, y0, y1); bar(a0, a1, ym - 0.012, ym + 0.012);
    const g = horiz === 'u' ? new THREE.BoxGeometry(a1 - a0, y1 - y0, 0.004) : new THREE.BoxGeometry(0.004, y1 - y0, a1 - a0);
    g.translate(horiz === 'u' ? am : fixed - 0.013, ym, horiz === 'u' ? fixed - 0.013 : am);
    put('glass', g, 1);
  };
  sash('u', WIN_F.u0, WIN_F.u1, WIN_F.y0, WIN_F.y1, D2);
  sash('v', WIN_E.v0, WIN_E.v1, WIN_E.y0, WIN_E.y1, W2);

  // ---- the stove (a round sheet-iron stove on legs, its door with the fire's glow in the draught slots, the pot on
  // it) and its pipe up through the roof, the collar round it, the rain cap; the firewood by it
  const [su0, sv0] = STOVE, IRON = [0.17, 0.16, 0.15];
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.5; cyl('iron', su0 + Math.cos(a) * 0.16, sv0 + Math.sin(a) * 0.16, 0, 0.13, 0.018, 0.018, 6, IRON); }
  cyl('iron', su0, sv0, 0.12, 0.16, 0.215, 0.215, 24, IRON);
  cyl('iron', su0, sv0, 0.16, 0.66, 0.2, 0.2, 24, IRON);
  for (const y of [0.3, 0.46, 0.6]) cyl('iron', su0, sv0, y, y + 0.012, 0.206, 0.206, 24, IRON);
  cyl('iron', su0, sv0, 0.66, 0.69, 0.228, 0.228, 24, IRON);
  cyl('iron', su0, sv0, 0.69, 0.7, 0.1, 0.1, 18, [0.24, 0.22, 0.2]);
  box('iron', su0 - 0.09, su0 + 0.09, 0.27, 0.44, sv0 + 0.19, sv0 + 0.215, IRON);
  box('iron', su0 + 0.05, su0 + 0.085, 0.35, 0.37, sv0 + 0.215, sv0 + 0.235, [0.5, 0.48, 0.46]);
  for (let i = 0; i < 4; i++) box('fire', su0 - 0.06 + i * 0.033, su0 - 0.04 + i * 0.033, 0.29, 0.32, sv0 + 0.214, sv0 + 0.217, 1);
  const PV = sv0 - 0.08, pipeTop = RIDGE + LIFT + 0.62;
  cyl('iron', su0, PV, 0.69, 0.78, 0.072, 0.072, 16, IRON);
  cyl('iron', su0, PV, 0.78, pipeTop, 0.062, 0.062, 16, IRON);
  lathe('iron', [[0.13, 0], [0.066, 0.07], [0.066, 0.075]], su0, PV, roofY(PV) + LIFT - 0.02, 16, [0.62, 0.5, 0.42]);
  lathe('iron', [[0.0, 0.07], [0.13, 0.0], [0.125, -0.005], [0.0, 0.06]], su0, PV, pipeTop + 0.06, 16, [0.6, 0.45, 0.36]);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; rod('iron', [su0 + Math.cos(a) * 0.06, pipeTop - 0.01, PV + Math.sin(a) * 0.06], [su0 + Math.cos(a) * 0.1, pipeTop + 0.065, PV + Math.sin(a) * 0.1], 0.004, 4, [0.5, 0.4, 0.33]); }
  lathe('iron', [[0, 0], [0.07, 0.008], [0.12, 0.05], [0.135, 0.1], [0.13, 0.13], [0.125, 0.13], [0.128, 0.1], [0.115, 0.055], [0.068, 0.016], [0, 0.012]], su0 + 0.02, sv0 + 0.02, 0.7, 18, [0.1, 0.095, 0.09]);
  { const g = new THREE.TorusGeometry(0.13, 0.004, 4, 16, Math.PI); g.rotateY(0.6); g.translate(su0 + 0.02, 0.83, sv0 + 0.02); put('iron', g, [0.2, 0.19, 0.18]); }
  const billet = (u, y, v, len, r, along) => {
    const g = new THREE.CylinderGeometry(r, r * 1.04, len, 7); if (along === 'v') g.rotateX(Math.PI / 2); else g.rotateZ(Math.PI / 2);
    g.rotateY(jit(0.15)); g.translate(u, y, v);
    put('wood', planarUV(g, 1, along, R() * 7, R() * 7), (uu, yy, vv, nu, ny, nv) => (along === 'v' ? Math.abs(nv) : Math.abs(nu)) > 0.8 ? END : tone(BARK, 0.8 + 0.4 * R()));
  };
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) billet(-2.62 + i * 0.12 + row * 0.06, 0.055 + row * 0.095, -1.62, 0.34, 0.052 + jit(0.012), 'v');

  // ---- the plank bed: posts, rails, the planks; a straw mattress on it, a sheepskin, the striped blanket folded at its
  // foot and a rolled one for a pillow
  const BED = { u0: -2.95, u1: -2.17, v0: -0.48, v1: 1.4, y: 0.45 };
  for (const u of [BED.u0 + 0.035, BED.u1 - 0.035]) for (const v of [BED.v0 + 0.035, BED.v1 - 0.035]) box('wood', u - 0.035, u + 0.035, 0, BED.y, v - 0.035, v + 0.035, inT(R()));
  for (const u of [BED.u0, BED.u1 - 0.04]) box('wood', u, u + 0.04, BED.y - 0.12, BED.y, BED.v0, BED.v1, inT(R()), 'v');
  for (const v of [BED.v0, BED.v1 - 0.04]) box('wood', BED.u0, BED.u1, BED.y - 0.12, BED.y, v, v + 0.04, inT(R()), 'u');
  for (let i = 0; i < 6; i++) box('wood', BED.u0 + i * 0.13 + 0.003, BED.u0 + (i + 1) * 0.13 - 0.003, BED.y, BED.y + 0.025, BED.v0, BED.v1, tone(INB, 0.8 + 0.3 * R()), 'v');
  {
    const g = new RoundedBoxGeometry(0.72, 0.085, 1.84, 2, 0.03); g.translate((BED.u0 + BED.u1) / 2, BED.y + 0.025 + 0.042, (BED.v0 + BED.v1) / 2 - 0.01);
    put('burlap', planarUV(g, 0.25, 'v'), 1);
    // (the sheepskin: an uneven pelt, its edge soft)
    const sh = new THREE.Shape();
    for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = 1 + 0.12 * Math.sin(a * 5 + 1) + 0.06 * Math.sin(a * 11), x = Math.cos(a) * 0.31 * r, y = Math.sin(a) * 0.5 * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    const pg = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 });
    pg.rotateX(-Math.PI / 2); pg.rotateY(0.08); pg.translate((BED.u0 + BED.u1) / 2 + 0.02, BED.y + 0.13, 0.32);
    put('wool', planarUV(pg, 0.4, 'v'), 1);
    const fb = new RoundedBoxGeometry(0.66, 0.075, 0.32, 2, 0.025); fb.rotateY(0.05); fb.translate((BED.u0 + BED.u1) / 2, BED.y + 0.15, BED.v1 - 0.25);
    put('blanket', planarUV(fb, 0.5, 'u'), 1);
    const pl = new THREE.CylinderGeometry(0.075, 0.075, 0.6, 14); pl.rotateZ(Math.PI / 2); pl.translate((BED.u0 + BED.u1) / 2, BED.y + 0.18, BED.v0 + 0.16);
    put('blanket', planarUV(pl, 0.5, 'u'), [0.9, 0.9, 0.9]);
  }

  // ---- the table and the bench under the gable's window; on the table a loaf, a wheel of cheese, an enamel mug, a knife
  const TB = { u0: 2.27, u1: 2.95, v0: -0.55, v1: 0.65, y: 0.77 };
  for (const u of [TB.u0 + 0.05, TB.u1 - 0.05]) for (const v of [TB.v0 + 0.06, TB.v1 - 0.06]) box('wood', u - 0.03, u + 0.03, 0, TB.y - 0.04, v - 0.03, v + 0.03, inT(R()));
  box('wood', TB.u0 + 0.05, TB.u1 - 0.05, TB.y - 0.12, TB.y - 0.04, TB.v0 + 0.06, TB.v0 + 0.085, inT(R()), 'u');
  box('wood', TB.u0 + 0.05, TB.u1 - 0.05, TB.y - 0.12, TB.y - 0.04, TB.v1 - 0.085, TB.v1 - 0.06, inT(R()), 'u');
  for (let i = 0; i < 4; i++) box('wood', TB.u0 + i * 0.17 + 0.002, TB.u0 + (i + 1) * 0.17 - 0.002, TB.y - 0.04, TB.y, TB.v0, TB.v1, tone(INB, 0.95 + 0.2 * R()), 'v');
  for (const v of [-0.4, 0.5]) box('wood', 1.8, 2.04, 0, 0.42, v - 0.02, v + 0.02, inT(R()));
  box('wood', 1.77, 2.07, 0.42, 0.46, -0.5, 0.6, tone(INB, 1.0), 'v');
  { const g = new THREE.SphereGeometry(0.1, 14, 10); g.scale(1.15, 0.62, 0.85); g.translate(2.6, TB.y + 0.055, 0.12); put('prop', g, [0.52, 0.31, 0.14]); }
  cyl('prop', 2.72, 0.42, TB.y, TB.y + 0.07, 0.09, 0.09, 20, [0.9, 0.84, 0.6]);
  cyl('prop', 2.45, -0.28, TB.y, TB.y + 0.085, 0.04, 0.042, 16, [0.88, 0.88, 0.86]);
  cyl('prop', 2.45, -0.28, TB.y + 0.083, TB.y + 0.09, 0.0425, 0.0425, 16, [0.08, 0.11, 0.26]);
  { const g = new THREE.TorusGeometry(0.025, 0.005, 6, 10, Math.PI); g.rotateZ(-Math.PI / 2); g.translate(2.49, TB.y + 0.045, -0.28); put('prop', g, [0.88, 0.88, 0.86]); }
  box('iron', 2.47, 2.59, TB.y, TB.y + 0.003, 0.3, 0.318, [0.75, 0.75, 0.76], 'u');
  box('wood', 2.59, 2.69, TB.y, TB.y + 0.02, 0.3, 0.32, tone(BARK, 1.2), 'u');

  // ---- the shepherd's crook in the corner by the door, a bucket
  rod('wood', [2.86, 0, 1.88], [2.8, 1.42, 1.84], 0.017, 8, [0.42, 0.28, 0.16]);
  { const g = new THREE.TorusGeometry(0.045, 0.016, 6, 10, Math.PI * 1.2); g.rotateY(Math.PI / 2); g.translate(2.8, 1.46, 1.84 - 0.045); put('wood', g, [0.42, 0.28, 0.16]); }
  lathe('iron', [[0, 0], [0.125, 0], [0.15, 0.26], [0.146, 0.26], [0.121, 0.006], [0, 0.006]], -0.08, 1.55, 0, 18, [0.62, 0.63, 0.64]);

  // ---- the hurricane lantern from the middle tie beam: its tank, the globe, the guard wires, the cap, the bail
  const [lu, ly, lv] = LAMP;
  lathe('iron', [[0, 0], [0.066, 0], [0.074, 0.02], [0.066, 0.048], [0.02, 0.055], [0, 0.055]], lu, lv, ly - 0.1, 16, [0.5, 0.12, 0.1]);
  lathe('lampGlass', [[0.03, 0], [0.054, 0.04], [0.057, 0.07], [0.05, 0.11], [0.03, 0.14]], lu, lv, ly - 0.05, 16, 1);
  // (inside the glass: the burner and its wick, the flame - a small teardrop, ~4 cm)
  cyl('iron', lu, lv, ly - 0.05, ly - 0.03, 0.022, 0.018, 12, [0.5, 0.42, 0.3]);
  { const g = new THREE.SphereGeometry(0.009, 10, 8); g.scale(1, 2.4, 1); g.translate(lu, ly - 0.005, lv); put('flame', g, 1); }
  for (const s of [-1, 1]) rod('iron', [lu + s * 0.068, ly - 0.05, lv], [lu + s * 0.068, ly + 0.1, lv], 0.003, 4, [0.5, 0.12, 0.1]);
  lathe('iron', [[0.05, 0], [0.032, 0.04], [0.012, 0.06], [0, 0.06]], lu, lv, ly + 0.09, 12, [0.5, 0.12, 0.1]);
  { const g = new THREE.TorusGeometry(0.06, 0.0025, 4, 12, Math.PI); g.translate(lu, ly + 0.15, lv); put('iron', g, [0.3, 0.3, 0.3]); }
  rod('iron', [lu, ly + 0.21, lv], [lu, WALL - 0.12, lv], 0.002, 4, [0.3, 0.3, 0.3]);

  // ---- the rack on the back wall: four stained planks on the studs, the guns on iron hooks (their right sides to the
  // room, their muzzles to the east), the shelf on its brackets with the spares, a crate under it
  const RACK_V = -HV + 0.1 + 0.022, GUN_V = RACK_V + 0.058;
  for (let i = 0; i < 4; i++) box('wood', -1.05, 1.75, 0.95 + i * 0.2625 + 0.002, 0.95 + (i + 1) * 0.2625 - 0.002, RACK_V - 0.022, RACK_V, tone(RACK, 0.85 + 0.3 * R()), 'u');
  const MM = 0.001, A = [];
  const GUNS = [
    { fn: pslGeometry, uc: 0.62, y: 1.86, hooks: [[150, -118], [700, -30]], name: 'PSL (Cugir), luneta LPS-4', cal: '7,62×54R',
      info: 'PSL, pușca semiautomată de lunetist făcută la Cugir: 7,62×54R, 1150 mm, țeava de 620 mm, 4,31 kg cu luneta LPS-4, încărcător de 10, 830 m/s, bate eficace 800–1000 m' },
    { fn: akmGeometry, uc: -0.2, y: 1.5, hooks: [[200, -46.5], [580, -18]], name: 'AKM (AK-47 modernizat)', cal: '7,62×39 mm',
      info: 'AKM: 7,62×39 mm, 880 mm, țeava de 415 mm, 3,3 kg gol, încărcător de 30 (0,33 kg), 600 de lovituri pe minut, 715 m/s, bătaia eficace 300 m' },
    { fn: m4Geometry, uc: 0.82, y: 1.5, hooks: [[220, -12.5], [500, -31]], name: 'M4A1 (M4A4 în jocuri)', cal: '5,56×45 mm NATO',
      info: 'M4: 5,56×45 mm NATO, 838 mm cu patul tras (756 strâns), țeava de 368 mm, 2,92 kg gol, încărcător STANAG de 30, 700–970 de lovituri pe minut, 905 m/s, 500 m la țintă punctuală' },
    { fn: shotgunGeometry, uc: 0.33, y: 1.1, hooks: [[470, -36], [700, -54]], name: 'Remington 870', cal: 'calibrul 12',
      info: 'Remington 870: calibrul 12, cu pompă, țeava de 18,5 țoli (470 mm), 3,2–3,6 kg, tubul de 4 cartușe + 1 pe țeavă' },
  ];
  const HOOK = [0.13, 0.12, 0.11];
  // (V119: each gun its own meshes, not merged into the shed: it can be taken off the wall - longgun.js)
  const RACKG = [];
  for (const gun of GUNS) {
    const { P, L } = gun.fn(), Mg = new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(gun.uc, gun.y, GUN_V), own = new Map();
    for (const [k, list] of Object.entries(P)) for (const g0 of list) { const g = g0.clone(); g.applyMatrix4(Mg); g.userData.tint = 1; (own.get('A:' + k) ?? own.set('A:' + k, []).get('A:' + k)).push(g); }
    RACKG.push(own);
    for (const [s, yb] of gun.hooks) {
      const u = gun.uc - (L / 2 - s) * MM, y = gun.y + yb * MM - 0.005;
      rod('iron', [u, y, RACK_V], [u, y, GUN_V + 0.035], 0.0045, 8, HOOK);
      rod('iron', [u, y - 0.004, GUN_V + 0.035], [u, y + 0.035, GUN_V + 0.035], 0.0045, 8, HOOK);
      box('iron', u - 0.012, u + 0.012, y - 0.03, y + 0.02, RACK_V, RACK_V + 0.004, HOOK);
    }
    const c = at(gun.uc, GUN_V);
    A.push({ name: gun.name, cal: gun.cal, info: gun.info, x: c[0], y: FL + gun.y, z: c[1], half: L / 2 * MM, dir: [U[0], U[1]] });
  }
  // (the shelf, its brackets, the spares on it: two AK and two M4 magazines lying flat, an ammunition can, the box of
  // shells and three loose ones; a second can and a wooden crate on the floor under it)
  box('wood', -1.05, 1.75, 0.78, 0.81, RACK_V, RACK_V + 0.24, tone(RACK, 1.1), 'u');
  for (const u of [-0.85, 0.35, 1.55]) {
    box('iron', u - 0.015, u + 0.015, 0.6, 0.78, RACK_V, RACK_V + 0.006, HOOK);
    const g = new THREE.BoxGeometry(0.02, 0.006, 0.25); g.rotateX(-0.72); g.translate(u, 0.69, RACK_V + 0.1); put('iron', g, HOOK);
  }
  const SP = spares();
  const place = (P, u, y, v, rot) => { const Ms = new THREE.Matrix4().makeRotationY(rot).setPosition(u, y, v); for (const [k, list] of Object.entries(P)) for (const g0 of list) { const g = g0.clone(); g.applyMatrix4(Ms); put('A:' + k, g, 1); } };
  const SY = 0.81, SV = RACK_V + 0.125;
  place(SP.akMag, -0.82, SY + 0.0145, SV, 0.06); place(SP.akMag, -0.56, SY + 0.0145, SV - 0.01, -0.08);
  place(SP.m4Mag, -0.26, SY + 0.0125, SV, 0.1); place(SP.m4Mag, -0.04, SY + 0.0125, SV + 0.01, -0.05);
  place(SP.can, 0.4, SY, SV, 0.04);
  place(SP.shellBox, 0.84, SY, SV, 0.3);
  for (let i = 0; i < 3; i++) place(SP.shell, 1.02 + i * 0.03, SY + 0.0106, SV + jit(0.05), 1.4 + jit(0.6));
  place(SP.can, -0.55, 0, RACK_V + 0.16, 0.1);
  {
    const OL = [0.36, 0.4, 0.22], c0 = 0.62, c1 = 1.26, w0 = RACK_V + 0.02, w1 = w0 + 0.33;
    for (let i = 0; i < 3; i++) box('wood', c0, c1, i * 0.1 + 0.002, (i + 1) * 0.1 - 0.002, w0, w1, tone(OL, 0.85 + 0.3 * R()), 'u');
    box('wood', c0 - 0.004, c1 + 0.004, 0.3, 0.33, w0 - 0.004, w1 + 0.004, tone(OL, 0.95), 'u');
    for (const u of [c0 + 0.03, c1 - 0.05]) box('wood', u, u + 0.02, 0, 0.33, w1, w1 + 0.012, tone(OL, 0.8), 'y');
    for (const u of [c0, c1]) { const g = new THREE.TorusGeometry(0.045, 0.008, 6, 10, Math.PI); g.rotateY(Math.PI / 2); g.translate(u + (u < 1 ? -0.012 : 0.012), 0.2, (w0 + w1) / 2); put('prop', g, [0.55, 0.48, 0.34]); }
  }

  // ---- outside: the firewood along the west gable (its log ends to the west, a rusty sheet on top with stones), the
  // chopping block with the axe in it, the steel drum under the eave catching the rain, the step at the door
  const WP = { u0: -3.64, u1: -3.04, v0: -1.72, v1: 1.32, y1: 1.06 };
  box('wood', WP.u0 + 0.06, WP.u1, GROUND, WP.y1, WP.v0, WP.v1, (u, y, v, nu) => nu > 0.5 ? tone(BARK, 0.6) : tone(BARK, 0.9 + 0.2 * R()), 'u');
  {
    const g = new THREE.PlaneGeometry(WP.v1 - WP.v0, WP.y1 - GROUND, 4, 3); g.rotateY(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, jit(0.024));
    g.computeVertexNormals(); g.translate(WP.u0 + 0.025, (WP.y1 + GROUND) / 2, (WP.v0 + WP.v1) / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getZ(i) / 0.8, p.getY(i) / 0.8);
    put('logs', g, 1);
    for (let i = 0; i < 9; i++) billet(WP.u0 + 0.05 + R() * 0.5, WP.y1 + 0.06, WP.v0 + 0.15 + i * 0.33, 0.6, 0.06 + jit(0.015), 'u');
    const tg = new THREE.BoxGeometry(0.78, 0.004, 3.2); tg.rotateZ(-0.12); tg.translate((WP.u0 + WP.u1) / 2, WP.y1 + 0.16, (WP.v0 + WP.v1) / 2);
    put('tin', planarUV(tg, 2, 'v'), [0.75, 0.7, 0.66]);
    for (const v of [-1.2, 0.1, 1.0]) { const s = new THREE.DodecahedronGeometry(0.11 + R() * 0.04, 0); s.scale(1.2, 0.6, 1); s.translate((WP.u0 + WP.u1) / 2 + jit(0.15), WP.y1 + 0.22, v); put('stone', planarUV(s, 1.2, 'y'), [0.8, 0.78, 0.74]); }
  }
  {
    const cu = -3.2, cv = 2.3;
    const g = new THREE.CylinderGeometry(0.24, 0.26, 0.52, 14); g.translate(cu, GROUND + 0.26, cv);
    put('wood', planarUV(g, 1, 'y'), (u, y, v, nu, ny) => ny > 0.8 ? END : tone(BARK, 0.9));
    rod('wood', [cu + 0.02, GROUND + 0.57, cv - 0.02], [cu - 0.28, GROUND + 1.02, cv + 0.2], 0.017, 8, [0.62, 0.45, 0.28]);
    const h = new THREE.BoxGeometry(0.17, 0.09, 0.025); h.rotateY(0.6); h.rotateZ(-0.35); h.translate(cu + 0.03, GROUND + 0.55, cv - 0.03); put('iron', h, [0.4, 0.38, 0.36]);
  }
  {
    const bu = 3.42, bv = 2.28, RUST = [0.72, 0.5, 0.38];
    cyl('iron', bu, bv, GROUND, GROUND + 0.88, 0.29, 0.29, 24, RUST, true);
    for (const y of [0.29, 0.59]) cyl('iron', bu, bv, GROUND + y, GROUND + y + 0.02, 0.298, 0.298, 24, RUST);
    cyl('iron', bu, bv, GROUND, GROUND + 0.02, 0.29, 0.29, 24, RUST);
    cyl('prop', bu, bv, GROUND + 0.7, GROUND + 0.705, 0.285, 0.285, 24, [0.04, 0.05, 0.06]);
  }
  box('stone', -1.55, -0.25, GROUND - 0.05, GROUND + 0.16, D2 + 0.02, D2 + 0.5, [0.85, 0.82, 0.78], 'u', 1.2);

  // ---- into the world: each material's parts merged, their vertex colours from their tints, turned to the site
  const Wm = new THREE.Matrix4().makeBasis(new THREE.Vector3(U[0], 0, U[1]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(V[0], 0, V[1])).setPosition(P0[0], FL, P0[1]);
  const INDOOR = new Set(['blanket', 'wool', 'burlap', 'prop', 'fire', 'lampGlass', 'flame', 'glass']);
  for (const [k, list] of G) {
    const geos = list.map((g0) => {
      const t = g0.userData.tint, g = t === null ? (g0.index ? g0.toNonIndexed() : g0) : bake(g0, t);
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a);
      return g;
    });
    const m = mergeGeometries(geos);
    m.applyMatrix4(Wm);
    const mat = Mt[k], inside = INDOOR.has(k) || k.startsWith('A:');
    if (inside) B.cullFor.set(mat, 160);
    B.geo(mat, m, null, null, { vcol: true, noCast: inside });
  }
  // (V119) the guns on the rack: a group each, in the shed's frame; hidden when taken, shown when put back; drawn within
  // ~160 m as the rest of the inside
  const rack = RACKG.map((own) => {
    const grp = new THREE.Group();
    for (const [k, list] of own) {
      const m = new THREE.Mesh(mergeGeometries(list.map(g0 => { const g = bake(g0, 1); for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a); return g; })), Mt[k]);
      m.castShadow = false; m.receiveShadow = true;
      grp.add(m);
    }
    grp.matrixAutoUpdate = false; grp.matrix.copy(Wm); grp.matrixWorldNeedsUpdate = true;
    return grp;
  });

  // ---- the snow on its roof and the icicles at its eaves (snowroofs.js): a gable roof; a rusty corrugated sheet keeps
  // some of what falls on it
  const eY = FL + roofY(vE + 0.05) + LIFT, rY = FL + RIDGE + LIFT + 0.01;
  ROOF_FRAMES.push(P0[0], P0[1], U[0], U[1], V[0], V[1], UR, vE + 0.05, UR, eY, rY, 1, 0.6, -1);

  // ---- what one bumps into, what one walks on
  const rot = Math.atan2(-U[1], U[0]);
  const solid = (u0, u1, v0, v1, y0, y1, tag = 'magazie') => { const [x, z] = at((u0 + u1) / 2, (v0 + v1) / 2); world.addStatic(new world.Box(x, z, (u1 - u0) / 2, (v1 - v0) / 2, rot, FL + y0, FL + y1, tag)); };
  solid(-W2, W2, -D2, -D2 + 0.12, -1.2, 3.6);
  solid(-W2, DOOR.u0, D2 - 0.12, D2, -1.2, 3.6);
  solid(DOOR.u1, W2, D2 - 0.12, D2, -1.2, 3.6);
  solid(DOOR.u0, DOOR.u1, D2 - 0.12, D2, DOOR.h, 3.6);
  for (const s of [-1, 1]) solid(s > 0 ? W2 - 0.12 : -W2, s > 0 ? W2 : -W2 + 0.12, -D2, D2, -1.2, 3.6);
  {
    const th = -DOOR.open * Math.PI / 180, du = Math.cos(th), dv = -Math.sin(th), w = DOOR.u1 - DOOR.u0;
    const [x, z] = at(DOOR.u0 + du * w / 2, D2 + 0.03 + dv * w / 2), wx = U[0] * du + V[0] * dv, wz = U[1] * du + V[1] * dv;
    world.addStatic(new world.Box(x, z, w / 2, 0.03, Math.atan2(-wz, wx), FL - 0.2, FL + DOOR.h, 'magazie'));
  }
  solid(su0 - 0.24, su0 + 0.24, sv0 - 0.24, sv0 + 0.24, 0, 0.75);
  solid(BED.u0, BED.u1, BED.v0, BED.v1, 0, BED.y + 0.12);
  solid(TB.u0, TB.u1, TB.v0, TB.v1, 0, TB.y);
  solid(1.77, 2.07, -0.5, 0.6, 0, 0.46);
  solid(0.6, 1.28, RACK_V, RACK_V + 0.36, 0, 0.33);
  solid(-2.7, -2.2, -1.85, -1.38, 0, 0.32);
  solid(WP.u0, WP.u1, WP.v0, WP.v1, GROUND - 0.3, WP.y1 + 0.25);
  solid(-3.46, -2.94, 2.04, 2.56, GROUND - 0.3, GROUND + 0.52);
  solid(3.12, 3.72, 1.98, 2.58, GROUND - 0.3, GROUND + 0.88);
  const ext = [at(-W2 - 0.2, -D2 - 0.2), at(W2 + 0.2, -D2 - 0.2), at(W2 + 0.2, D2 + 0.6), at(-W2 - 0.2, D2 + 0.6)];
  const bx0 = Math.min(...ext.map(p => p[0])), bx1 = Math.max(...ext.map(p => p[0])), bz0 = Math.min(...ext.map(p => p[1])), bz1 = Math.max(...ext.map(p => p[1]));
  // (a region answers for its whole box: outside the shed, the ground - not its third argument, the home street's level)
  world.addRegion(bx0, bx1, bz0, bz1, 0, (x, z) => {
    const [u, v] = uvOf(x, z);
    if (Math.abs(u) < HU && Math.abs(v) < HV) return FL;                                       // (the floor)
    if (u > DOOR.u0 && u < DOOR.u1 && v >= HV - 0.01 && v <= D2 + 0.04) return FL;            // (the threshold)
    if (u > -1.55 && u < -0.25 && v > D2 && v < D2 + 0.5) return FL + GROUND + 0.16;          // (the step)
    return world.terrainFn(x, z);
  });

  // the lamps' places (world): the lantern's flame, the fire behind the stove's door
  const lp = at(lu, lv), fp = at(su0, sv0 + 0.1);
  SHED_LAMPS.uLampW.value[0].set(lp[0], FL + ly + 0.02, lp[1]);
  SHED_LAMPS.uLampW.value[1].set(fp[0], FL + 0.36, fp[1]);
  const c = at(0, 0);
  return {
    type: 'magazie', name: 'Magazia ciobanilor', x: c[0], z: c[1], y: FL, arms: A, rack, groups: rack,
    // (its guns' meshes added to the scene with the moving parts: geo/index.js; only near enough are they drawn)
    animate(t, cam) { const near = Math.hypot(cam.x - c[0], cam.z - c[1]) < 160; for (const g of rack) g.parent && (g.userData.near = near, g.visible = near && !g.userData.taken); },
    lamp: SHED_LAMPS.uLampW.value[0].clone(), glow: { lamp: Mt.lampGlass, fire: Mt.fire, flame: Mt.flame },
    bbox: { x0: bx0, x1: bx1, z0: bz0, z1: bz1 },
    // inside it (main.js: the wind's shelter, the guns' prompt)
    inside: (x, z) => { const [u, v] = uvOf(x, z); return Math.abs(u) < HU && Math.abs(v) < HV; },
  };
}
