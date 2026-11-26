import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HOLE } from './geo/terrain.js';

// (V126) Postul 7: a civil-defence command post of the 1980s dug into the hill of the cross, a few metres from where
// the Maybach stands - sealed in 1990, found again by someone who calls himself CORB. Its emergency exit is the way in:
// a steel hatch in a concrete frame flush with the meadow (E opens it), a shaft with a steel ladder (rungs ~28 cm
// apart) down to the airlock (the "sas"), a sealed steel door with lever latches, then the room: the post's desk, its
// field telephone and radio, the hand-cranked filter-ventilation unit with its ducts and hermetic flaps, the bunks, the
// shelves of the old stores - and what CORB brought: batteries and an inverter, a rack of network gear, a board of
// photos and red string, the laptop (laptop.js).
// Built to the civil-protection shelter rules (as ISU Calarasi sums them up: an access airlock, a buffer room of
// 2-2.5 m2 at least, its openings 90 deg doorways for sealed metal doors; passages 0.80 x 1.80 m; an emergency exit of
// reinforced concrete 1.00 x 1.00 m, a vertical shaft with a rung ladder, a drivable lid and a sealed shutter opening
// outwards, that is also the air intake of the ventilation; filter-ventilation, battery lamps, telecoms, a water
// reserve, the rules posted), the place and its story invented.
//
// Its light is its own: two fluorescent tubes (36 W, ~3000 lm each, an old starter: they blink before they catch,
// one of them flickers), the laptop's screen, the rack's LEDs, a red battery lamp over the door when the mains is off
// (it is fed from the commune's transformer station in the wood: cut the commune's power and the tubes die). The sky
// comes in only down the shaft, as much as its opening is seen from each point (its form factor); the sun only where
// it shines straight down it (the slab's shadow does the rest). The street lamps and the sky's light map are kept out.

// ---------------------------------------------------------------- dimensions (m; local frame: the hatch's centre on
// the ground at 0, +z into the post, y up from the ground at the hatch)
const SH = { x: 0.5, z: 0.5 };                  // the shaft's inside: half width (x) and half depth (z) - 1.00 x 1.00 m
const SAS = { x0: -0.8, x1: 0.8, z0: -SH.z, z1: 1.65, h: 2.2 };   // (2.4 m2 beside the shaft's foot; its far wall the shaft's)
const WALL = 0.4;                               // (the door wall)
const ROOM = { x0: -2.6, x1: 2.6, z0: SAS.z1 + WALL, z1: SAS.z1 + WALL + 4.0, h: 2.4 };
const DOOR = { w: 0.8, h: 1.8 };
const RUNG = 0.28;
const angTo = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };   // (the short way round)

// ---------------------------------------------------------------- procedural textures (sRGB canvases)
const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const pm = (a, p) => ((a % p) + p) % p;
// tiling value noise: period px, py lattice cells
function vn(x, y, s, px, py) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(pm(i, px), pm(j, py), s), b = hash(pm(i + 1, px), pm(j, py), s), c = hash(pm(i, px), pm(j + 1, py), s), d = hash(pm(i + 1, px), pm(j + 1, py), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// fbm over a tile w x h (m), base frequency f (cycles per m, rounded to tile), octaves
function fbm(x, y, w, h, f, s, oct = 4) {
  let sum = 0, amp = 0.5, n = 0;
  for (let k = 0; k < oct; k++) { const fx = Math.max(1, Math.round(f * w)), fy = Math.max(1, Math.round(f * h)); sum += amp * vn(x / w * fx, y / h * fy, s + k * 31, fx, fy); n += amp; amp *= 0.5; f *= 2; }
  return sum / n;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// a texture from a per-pixel function: (u, v in metres) -> [r, g, b] (0-1, sRGB) and a height (m, for the normals)
function bake(W, H, wm, hm, fn, normalK = 1) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, ht = new Float32Array(W * H);
  const out = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    fn((x + 0.5) / W * wm, (1 - (y + 0.5) / H) * hm, out);
    const k = (y * W + x) * 4;
    d[k] = clamp01(out[0]) * 255; d[k + 1] = clamp01(out[1]) * 255; d[k + 2] = clamp01(out[2]) * 255; d[k + 3] = 255;
    ht[y * W + x] = out[3];
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  // the normals from the heights (central differences, tiling)
  const nc = document.createElement('canvas'); nc.width = W; nc.height = H;
  const ng = nc.getContext('2d'), nimg = ng.createImageData(W, H), nd = nimg.data;
  const sx = W / wm, sy = H / hm;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hx = (ht[y * W + pm(x + 1, W)] - ht[y * W + pm(x - 1, W)]) * sx / 2, hy = (ht[pm(y - 1, H) * W + x] - ht[pm(y + 1, H) * W + x]) * sy / 2;
    let nx = -hx * normalK, ny = -hy * normalK, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const k = (y * W + x) * 4; nd[k] = (nx * 0.5 + 0.5) * 255; nd[k + 1] = (ny * 0.5 + 0.5) * 255; nd[k + 2] = (nz * 0.5 + 0.5) * 255; nd[k + 3] = 255;
  }
  ng.putImageData(nimg, 0, 0);
  const nmap = new THREE.CanvasTexture(nc); nmap.wrapS = nmap.wrapT = THREE.RepeatWrapping; nmap.anisotropy = 8;
  return { map, nmap };
}

// the walls: cast against boards (~12 cm, their grain and joints printed in the concrete, the form ties' plugged holes
// every 60 cm), the lower 1.5 m in the institutional oil paint (pale grey-green) with a dark band at its top, peeling
// where the damp gets behind it, grime along the floor; above, whitewash (lime), flaking; streaks where water has run
// down, salts blooming white low on the walls
function wallTex(seed, paint = true) {
  const WM = 2, HM = 2.4;
  return bake(512, 614, WM, HM, (u, v, o) => {
    const board = Math.floor(v / 0.12), bv = v - board * 0.12;
    const grain = vn(u * 38, (v + board * 3.1) * 1.6, seed + 3, 76, Math.round(HM * 1.6)) - 0.5;
    let c = 0.5 + 0.09 * (fbm(u, v, WM, HM, 1.5, seed, 4) - 0.5) + 0.03 * (hash(board, 7, seed) - 0.5) + 0.025 * grain;
    let h = 0.0004 * grain - (bv < 0.004 ? 0.0012 : 0);
    // pores (bug holes) and the form ties
    const pore = vn(u * 160, v * 160, seed + 9, 320, Math.round(HM * 160));
    if (pore > 0.86) { c -= 0.16 * (pore - 0.86) / 0.14; h -= 0.002 * (pore - 0.86) / 0.14; }
    const tu = pm(u, 0.6) - 0.3, tv = pm(v - 0.25, 0.6) - 0.3, tr = Math.hypot(tu, tv);
    if (tr < 0.016) { c = c * 0.82 + 0.06; h -= tr < 0.011 ? 0.002 : 0.0005; }
    // water run down from the ceiling's cracks
    const sx = fbm(u, 0, WM, HM, 3, seed + 21, 2), streak = sstep(0.62, 0.8, sx) * sstep(0.2, 2.3, v) * (0.6 + 0.4 * vn(u * 50, v * 2, seed + 23, 100, 5));
    let r = c, gg = c, b = c * 0.97;
    const lower = paint && v < 1.5, band = paint && v >= 1.5 && v < 1.53;
    const peel = sstep(0.6, 0.66, fbm(u, v, WM, HM, 2.2, seed + 41, 4) + 0.18 * (1 - sstep(0, 0.4, v)) + 0.12 * streak);
    if (band) { r = 0.33; gg = 0.22; b = 0.17; h += 0.0003; }
    else if (lower && peel < 0.5) {
      const p = 0.62 + 0.04 * (fbm(u, v, WM, HM, 4, seed + 51, 3) - 0.5);
      r = p * 0.86; gg = p * 0.95; b = p * 0.86; h += 0.0003;
      if (peel > 0.35) { const e = (peel - 0.35) / 0.15; r = r * (1 - 0.35 * e) + 0.05 * e; gg *= 1 - 0.3 * e; b *= 1 - 0.3 * e; }   // (the lifting edge, dirty)
    } else if (!lower && paint) {
      const flake = sstep(0.66, 0.7, fbm(u, v, WM, HM, 3.4, seed + 61, 4));
      const wash = 0.8 + 0.06 * (vn(u * 9, v * 30, seed + 63, 18, 72) - 0.5);
      if (flake < 0.5) { r = wash; gg = wash * 0.985; b = wash * 0.95; h += 0.0002; }
    }
    // grime near the floor, the run-down streaks (brown), salts low on the walls
    const grime = paint ? 1 - sstep(0, 0.35, v) : 0.3 * fbm(u, v, WM, HM, 0.8, seed + 81, 3);
    r *= 1 - 0.25 * grime; gg *= 1 - 0.27 * grime; b *= 1 - 0.3 * grime;
    r *= 1 - 0.28 * streak; gg *= 1 - 0.31 * streak; b *= 1 - 0.36 * streak;
    const salt = sstep(0.55, 0.75, fbm(u, v, WM, HM, 2.6, seed + 71, 3)) * (1 - sstep(0.1, 0.6, v));
    r += (0.86 - r) * 0.55 * salt; gg += (0.85 - gg) * 0.55 * salt; b += (0.82 - b) * 0.55 * salt;
    o[0] = r; o[1] = gg; o[2] = b; o[3] = h;
  }, 1.4);
}
// the ceilings: cast on plywood panels (1.25 x 2.5 m: their joints and the grain of the faces printed), whitewashed long
// ago, grey with damp around a crack, rust-brown where water has stood
function ceilTex(seed) {
  const WM = 2.5, HM = 2.5;
  return bake(512, 512, WM, HM, (u, v, o) => {
    let c = 0.72 + 0.06 * (fbm(u, v, WM, HM, 1.2, seed, 4) - 0.5) + 0.02 * (vn(u * 4, v * 40, seed + 5, 10, 100) - 0.5);
    let h = 0;
    if (pm(u, 1.25) < 0.004 || pm(v, 2.5) < 0.004) { c -= 0.08; h += 0.0015; }
    // a crack: a level line of a warped noise, open - only some stretches of it have cracked (a closed level line
    // alone draws rings), the damp spreading from those
    const crack = Math.abs(fbm(u + 0.15 * fbm(u, v, WM, HM, 3, seed + 31, 2), v, WM, HM, 0.8, seed + 13, 3) - 0.5);
    const along = sstep(0.5, 0.62, fbm(u, v, WM, HM, 1.6, seed + 37, 2));
    const damp = sstep(0.1, 0.0, crack) * 0.7 * along + 0.25 * sstep(0.55, 0.7, fbm(u, v, WM, HM, 1.6, seed + 17, 3));
    if (crack < 0.0035 * (0.4 + along) && along > 0.3) { c -= 0.25; h -= 0.001; }
    let r = c, g = c * 0.985, b = c * 0.95;
    r *= 1 - 0.3 * damp; g *= 1 - 0.34 * damp; b *= 1 - 0.42 * damp;
    const flake = sstep(0.72, 0.76, fbm(u, v, WM, HM, 3, seed + 23, 4));
    if (flake > 0.5) { r = 0.58; g = 0.57; b = 0.55; h -= 0.0004; }     // (the bare concrete where the lime has fallen)
    o[0] = r; o[1] = g; o[2] = b; o[3] = h;
  }, 1.2);
}
// the floor: a trowelled screed, darker, worn smooth where people walked, dust and grit in the corners, a crack, oil
function floorTex(seed) {
  const WM = 2, HM = 2;
  return bake(512, 512, WM, HM, (u, v, o) => {
    let c = 0.4 + 0.07 * (fbm(u, v, WM, HM, 1.4, seed, 5) - 0.5) + 0.03 * (vn(u * 90, v * 90, seed + 2, 180, 180) - 0.5);
    let h = 0.0002 * (vn(u * 60, v * 60, seed + 3, 120, 120) - 0.5);
    const crack = Math.abs(fbm(u + 0.12 * fbm(u, v, WM, HM, 3, seed + 33, 2), v, WM, HM, 0.6, seed + 7, 4) - 0.5);   // (open, as the ceiling's)
    const along = sstep(0.5, 0.62, fbm(u, v, WM, HM, 1.4, seed + 39, 2));
    if (crack < 0.006 * (0.4 + along) && along > 0.3) { c -= 0.15; h -= 0.0015; }
    const oil = sstep(0.72, 0.8, fbm(u, v, WM, HM, 1.0, seed + 11, 3));
    c *= 1 - 0.25 * oil;
    const dust = sstep(0.45, 0.7, fbm(u, v, WM, HM, 2.2, seed + 13, 3));
    o[0] = c + 0.12 * dust; o[1] = c * 0.98 + 0.11 * dust; o[2] = c * 0.95 + 0.09 * dust; o[3] = h;
  }, 1.0);
}
// painted steel: an army grey-green, chipped to grey primer and to rust at the edges and where hands and feet go
// (wear: 1 out in the weather - chipped, rusting; less indoors)
function steelTex(seed, base = [0.36, 0.4, 0.33], wear = 1) {
  const WM = 1, HM = 1, k = 1 - wear;
  return bake(256, 256, WM, HM, (u, v, o) => {
    const n = fbm(u, v, WM, HM, 3, seed, 4), chip = sstep(0.64 + 0.1 * k, 0.7 + 0.1 * k, fbm(u, v, WM, HM, 7, seed + 5, 4) + 0.1 * n);
    const rust = sstep(0.6 + 0.12 * k, 0.75 + 0.12 * k, fbm(u, v, WM, HM, 4, seed + 9, 4));
    let r = base[0] * (0.9 + 0.2 * n), g = base[1] * (0.9 + 0.2 * n), b = base[2] * (0.9 + 0.2 * n), h = 0;
    if (chip > 0.5) { const k = rust; r = 0.42 * (1 - k) + 0.36 * k; g = 0.42 * (1 - k) + 0.2 * k; b = 0.4 * (1 - k) + 0.12 * k; h = -0.0003; }
    else { const s = 0.12 * rust; r += s; g += s * 0.3; b -= s * 0.4; }
    o[0] = r; o[1] = g; o[2] = b; o[3] = h;
  }, 1.0);
}
// printed things: a sign, a page, a label (canvas text)
function paperTex(W, H, draw) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  draw(c.getContext('2d'), W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const stencil = (g, text, x, y, size, col = '#e8e2d0', font = '700') => { g.fillStyle = col; g.font = `${font} ${size}px "Arial Narrow", Arial, sans-serif`; g.fillText(text, x, y); };

// ---------------------------------------------------------------- the light model of the post's materials
// (three's standard shading, the sky's share scaled by how much of the shaft's opening a point sees, the street lamps'
// loop and the sky light map left out, the post's own lamps added: three points along each tube)
export const BK = {
  uL: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },     // world position, strength (0: off)
  uC: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
  uAmb: { value: new THREE.Color(0, 0, 0) },                               // (what the lamps' light bounces round the rooms)
  uSky: { value: new THREE.Vector4(0, 0, 0, 0) },                          // the shaft's opening (world centre), how far open
  uInv: { value: new THREE.Matrix4() },                                    // world -> the post's frame
};
const BK_PARS = /* glsl */`
uniform vec4 bkL[8];
uniform vec3 bkC[8];
uniform vec3 bkAmb;
uniform vec4 bkSky;
uniform mat4 bkInv;
varying vec3 vBkW;
`;
const BK_LIGHT = /* glsl */`
{
  vec3 bkP = (bkInv * vec4(vBkW, 1.0)).xyz;
  vec3 bkN = inverseTransformDirection(geometryNormal, viewMatrix);
  // the sky down the shaft: the opening's form factor from here (its ${(2 * SH.x).toFixed(2)} x ${(2 * SH.z).toFixed(2)} m: A cos cos / (pi d^2)), seen
  // only from the shaft and the airlock under it
  float bkS = 0.0;
  if (bkSky.w > 0.0 && bkP.z < ${(SAS.z1 - 0.05).toFixed(2)} && abs(bkP.x) < ${(-SAS.x0 + 0.05).toFixed(2)}) {
    vec3 d = bkSky.xyz - vBkW; float dl = max(length(d), 0.05); vec3 dn = d / dl;
    bkS = bkSky.w * min(1.0, ${(4 * SH.x * SH.z).toFixed(3)} * max(dot(bkN, dn), 0.0) * max(dn.y, 0.0) / (3.14159 * dl * dl) + 0.25 * smoothstep(-0.6, 0.0, bkP.y) * step(abs(bkP.x), ${SH.x.toFixed(2)}) * step(abs(bkP.z), ${SH.z.toFixed(2)}));
  }
  irradiance *= bkS; iblIrradiance *= bkS; radiance *= bkS;
  irradiance += bkAmb;
  for (int i = 0; i < 8; i++) {
    vec4 L = bkL[i];
    if (L.w <= 0.0) continue;
    vec3 lw = L.xyz - vBkW; float d2 = max(dot(lw, lw), 0.01);
    IncidentLight bkI;
    bkI.direction = normalize(mat3(viewMatrix) * lw);
    bkI.color = bkC[i] * (L.w / d2);
    bkI.visible = true;
    RE_Direct(bkI, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  }
}
`;
// the scene's lights_fragment_end without the street lamps' loop (lamps.js prepends it)
const BASE_END = () => { const s = THREE.ShaderChunk.lights_fragment_end; const i = s.indexOf('#if defined( RE_IndirectDiffuse )'); return i >= 0 ? s.slice(i) : s; };
function bkMat(o) {
  const m = new THREE.MeshStandardMaterial({ envMapIntensity: 1, ...o });
  m.userData.noWet = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.bkL = BK.uL; sh.uniforms.bkC = BK.uC; sh.uniforms.bkAmb = BK.uAmb; sh.uniforms.bkSky = BK.uSky; sh.uniforms.bkInv = BK.uInv;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBkW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBkW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + BK_PARS)
      .replace('#include <lights_fragment_end>', BK_LIGHT + BASE_END());
  };
  m.customProgramCacheKey = () => 'bunker-v1';
  return m;
}

// ---------------------------------------------------------------- geometry helpers (UVs in metres)
const G = {
  // an axis-aligned box's faces: which ones (+x -x +y -y +z -z), facing out (or in: the rooms)
  box(x0, x1, y0, y1, z0, z1, faces = 'pxnxpynypznz', inward = false) {
    const out = [];
    const quad = (a, b, c, d, n, uvs) => {
      const g = new THREE.BufferGeometry();
      const p = inward ? [...a, ...c, ...b, ...a, ...d, ...c] : [...a, ...b, ...c, ...a, ...c, ...d];
      const uv = inward ? [uvs[0], uvs[1], uvs[4], uvs[5], uvs[2], uvs[3], uvs[0], uvs[1], uvs[6], uvs[7], uvs[4], uvs[5]] : [uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5], uvs[0], uvs[1], uvs[4], uvs[5], uvs[6], uvs[7]];
      const nn = inward ? n.map(x => -x) : n;
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([...nn, ...nn, ...nn, ...nn, ...nn, ...nn], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      out.push(g);
    };
    const f = (k) => faces.includes(k);
    if (f('px')) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [-z1, y0, -z0, y0, -z0, y1, -z1, y1]);
    if (f('nx')) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [z0, y0, z1, y0, z1, y1, z0, y1]);
    if (f('py')) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0, -z1, x1, -z1, x1, -z0, x0, -z0]);
    if (f('ny')) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [x0, z0, x1, z0, x1, z1, x0, z1]);
    if (f('pz')) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [x0, y0, x1, y0, x1, y1, x0, y1]);
    if (f('nz')) quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-x1, y0, -x0, y0, -x0, y1, -x1, y1]);
    return out;
  },
  // a solid box (all faces out), its UVs in metres
  solid(x0, x1, y0, y1, z0, z1) { return G.box(x0, x1, y0, y1, z0, z1); },
  cyl(r, h, x, y, z, axis = 'y', seg = 14) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z); return g;
  },
};
const merge = (list) => mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)).map(g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));

// ---------------------------------------------------------------- the post
export class Bunker {
  // at: { x, z, y (the hatch's level: the collar's top less 3 cm), base (how far the ground round the collar falls below
  // that), rot (the post's +z, as an angle about y), depth (floor below the hatch's level) }
  // world: the collision world; audio: audio.js
  constructor(scene, world, audio, at) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.x = at.x; this.z = at.z; this.gy = at.y; this.base = at.base ?? 0; this.rot = at.rot; this.depth = at.depth;
    this.yF = this.gy - this.depth;                       // (the floor, world)
    this.group = new THREE.Group();
    this.group.position.set(this.x, this.gy, this.z); this.group.rotation.y = this.rot;
    this.group.updateMatrixWorld(true);
    this.inv = this.group.matrixWorld.clone().invert();
    BK.uInv.value.copy(this.inv);
    this.built = false; this.inside = false;
    this.lid = 0; this.lidTo = 0;                         // (the hatch: 0 shut .. 1 open)
    this.door = 1; this.doorTo = 1;                       // (the steel door: open, as CORB left it)
    this.lights = false; this.lightT = 0; this.flick = 0; // (the tubes: off - the switch by the door)
    this.mains = true;                                    // (the commune's power: main.js)
    this.battery = 100;                                   // (CORB's battery bank, % of its charge)
    this.climb = null;                                    // (on the ladder: the move under way)
    this.boxes = [];
    this.hatchMesh();
    scene.add(this.group);
    // the terrain shows the shaft's opening (geo/terrain.js HOLE)
    HOLE.uHole.value.set(this.x, this.z, SH.x + 0.02, SH.z + 0.02); HOLE.uHoleRot.value.set(Math.cos(this.rot), Math.sin(this.rot));
  }
  // local <-> world
  toW(lx, ly, lz) { const c = Math.cos(this.rot), s = Math.sin(this.rot); return new THREE.Vector3(this.x + c * lx + s * lz, this.gy + ly, this.z - s * lx + c * lz); }
  toL(wx, wz) { const c = Math.cos(this.rot), s = Math.sin(this.rot), dx = wx - this.x, dz = wz - this.z; return { x: c * dx - s * dz, z: s * dx + c * dz }; }
  yawOut(dir) { return this.rot + (dir > 0 ? Math.PI : 0); }     // (a camera's yaw looking along local +z (dir 1) or -z)

  // the hatch, its frame and the shaft (always built: they show from the meadow)
  hatchMesh() {
    // (out in the open: the scene's own light, the rain's wet; below, the post's light model: bkMat)
    const conc = new THREE.MeshStandardMaterial({ color: 0x8f8d87, roughness: 0.95 });
    const sTex = steelTex(5).map;
    const steel = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.5, map: sTex });
    this.steelM = bkMat({ color: 0xffffff, roughness: 0.6, metalness: 0.5, map: steelTex(6, undefined, 0.35).map });   // (indoors: dry-ish)
    const fx = SH.x + 0.16, fz = SH.z + 0.16;
    // the frame: a concrete collar 16 cm wide, flush with the meadow where it is highest (on the low side it stands out)
    const y0 = -0.25 - this.base;
    const frame = [...G.box(-fx, fx, y0, 0.03, -fz, -SH.z, 'pynypznz'), ...G.box(-fx, fx, y0, 0.03, SH.z, fz, 'pynypznz'),
      ...G.box(-fx, -SH.x, y0, 0.03, -SH.z, SH.z, 'pynypxnx'), ...G.box(SH.x, fx, y0, 0.03, -SH.z, SH.z, 'pynypxnx')];
    const fm = new THREE.Mesh(merge(frame), conc); fm.receiveShadow = true; fm.castShadow = true; this.group.add(fm);
    // the lid: a 6 mm plate on a welded frame of flat bars and two stiffeners, a pull handle and the lever latch's
    // spindle, hinged along its far edge (+z); a rubber gasket under it
    const lid = new THREE.Group();
    const lw = SH.x + 0.06, ld = SH.z + 0.06;
    const lg = [...G.solid(-lw, lw, 0, 0.012, -2 * ld, 0), ...G.solid(-lw, lw, -0.05, 0, -0.03, 0), ...G.solid(-lw, lw, -0.05, 0, -2 * ld, -2 * ld + 0.03),
      ...G.solid(-lw, -lw + 0.03, -0.05, 0, -2 * ld, 0), ...G.solid(lw - 0.03, lw, -0.05, 0, -2 * ld, 0), ...G.solid(-lw, lw, -0.04, 0, -ld - 0.02, -ld + 0.02), ...G.solid(-0.02, 0.02, -0.04, 0, -2 * ld, 0)];
    lg.push(G.cyl(0.012, 0.26, 0, 0.05, -2 * ld + 0.12, 'x'), G.cyl(0.01, 0.05, -0.13, 0.03, -2 * ld + 0.12), G.cyl(0.01, 0.05, 0.13, 0.03, -2 * ld + 0.12));
    lg.push(G.cyl(0.03, 0.05, 0.25, 0.035, -ld, 'y'), G.cyl(0.008, 0.14, 0.25, 0.07, -ld, 'x'));
    for (const hx of [-lw + 0.1, lw - 0.1]) lg.push(G.cyl(0.022, 0.12, hx, 0.0, 0, 'x'));
    const lm = new THREE.Mesh(merge(lg), steel); lm.castShadow = lm.receiveShadow = true; lid.add(lm);
    lid.position.set(0, 0.03, ld); this.group.add(lid);
    this.lidG = lid;
  }

  // the rooms, their things and the lamps: once you are near
  build() {
    if (this.built) return;
    this.built = true;
    this.tex = { wall: wallTex(11), bare: wallTex(29, false), ceil: ceilTex(13), floor: floorTex(17) };
    // (the walls' paint from the floor up: their pattern starts at the floor's height)
    for (const t of [this.tex.wall, this.tex.bare]) for (const m of [t.map, t.nmap]) { m.repeat.set(0.5, 1 / 2.4); m.offset.set(0, ((this.depth / 2.4) % 1 + 1) % 1); }
    this.rooms = new THREE.Group(); this.group.add(this.rooms);
    this.galvM = bkMat({ color: 0x8c9196, roughness: 0.55, metalness: 0.7 });
    // the shaft: its walls (inside faces) down to the airlock's ceiling, cast against boards; a steel ladder on its
    // near wall; a coax and a power cable CORB ran up it to the surface
    const shaftM = this.shaftM = bkMat({ color: 0xffffff, map: this.tex.bare.map, normalMap: this.tex.bare.nmap, roughness: 0.93 });
    const sm = new THREE.Mesh(merge(G.box(-SH.x, SH.x, -this.depth + SAS.h - 0.02, 0.03, -SH.z, SH.z, 'pxnxpznz', true)), shaftM);   // (2 cm past its edges: no crack)
    sm.receiveShadow = sm.castShadow = true; this.rooms.add(sm);
    const ladder = [];
    const lz = -SH.z + 0.17, top = 0.9, bot = -this.depth;
    const ladOut = [];                                                // (the rails' tops, out of the shaft: grab handles)
    for (const sx of [-0.22, 0.22]) { ladder.push(...G.solid(sx - 0.03, sx + 0.03, bot, 0.03, lz - 0.006, lz + 0.006)); ladOut.push(...G.solid(sx - 0.03, sx + 0.03, 0.03, top, lz - 0.006, lz + 0.006)); for (let y = bot + 0.3; y < 0.05; y += 0.75) ladder.push(...G.solid(sx - 0.02, sx + 0.02, y, y + 0.05, -SH.z, lz)); }
    for (let y = bot + RUNG; y < 0.02; y += RUNG) ladder.push(G.cyl(0.013, 0.44, 0, y, lz, 'x', 8));
    const lad = new THREE.Mesh(merge(ladder), this.galvM);
    lad.castShadow = lad.receiveShadow = true; this.rooms.add(lad);
    const lo = new THREE.Mesh(merge(ladOut), new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.55, metalness: 0.7 }));
    lo.castShadow = lo.receiveShadow = true; this.rooms.add(lo);
    const cab = new THREE.Mesh(merge([G.cyl(0.006, -bot + 0.02, SH.x - 0.05, (bot + 0.02) / 2, SH.z - 0.06), G.cyl(0.009, -bot + 0.02, SH.x - 0.08, (bot + 0.02) / 2, SH.z - 0.05)]), bkMat({ color: 0x111214, roughness: 0.7 }));
    this.rooms.add(cab);
    const T = this.tex, yF = -this.depth, yS = yF + SAS.h, yR = yF + ROOM.h;
    const wallM = bkMat({ color: 0xffffff, map: T.wall.map, normalMap: T.wall.nmap, roughness: 0.92 });
    const ceilM = bkMat({ color: 0xffffff, map: T.ceil.map, normalMap: T.ceil.nmap, roughness: 0.95 });
    const floorM = bkMat({ color: 0xffffff, map: T.floor.map, normalMap: T.floor.nmap, roughness: 0.82 });
    for (const t of [T.ceil, T.floor]) for (const m of [t.map, t.nmap]) m.repeat.set(1 / (t === T.ceil ? 2.5 : 2), 1 / (t === T.ceil ? 2.5 : 2));
    const add = (geos, m, cast = true) => { const o = new THREE.Mesh(merge(geos), m); o.castShadow = cast; o.receiveShadow = true; this.rooms.add(o); return o; };
    // the airlock: walls, its ceiling (the shaft's opening left), floor
    // (every face runs 2 cm past the edges it meets, out of sight: no hairline cracks where they join)
    const e = 0.02;
    const sasW = [...G.box(SAS.x0, SAS.x1, yF - e, yS + e, SAS.z0, SAS.z1, 'pxnxnz', true)];
    // its far wall with the doorway
    sasW.push(...G.box(SAS.x0 - e, -DOOR.w / 2, yF - e, yS + e, SAS.z1, SAS.z1 + 0.001, 'nz'), ...G.box(DOOR.w / 2, SAS.x1 + e, yF - e, yS + e, SAS.z1, SAS.z1 + 0.001, 'nz'), ...G.box(-DOOR.w / 2 - e, DOOR.w / 2 + e, yF + DOOR.h, yS + e, SAS.z1, SAS.z1 + 0.001, 'nz'));
    // the doorway's reveals through the 40 cm wall
    sasW.push(...G.box(-DOOR.w / 2, DOOR.w / 2, yF - e, yF + DOOR.h, SAS.z1 - 0.002, ROOM.z0 + 0.002, 'pxnxpy', true));   // (2 mm: no fins)
    add(sasW, wallM);
    add([...G.box(SAS.x0 - e, SAS.x1 + e, yS - 0.001, yS, SH.z, SAS.z1 + e, 'ny'), ...G.box(SAS.x0 - e, -SH.x, yS - 0.001, yS, -SH.z - e, SH.z, 'ny'), ...G.box(SH.x, SAS.x1 + e, yS - 0.001, yS, -SH.z - e, SH.z, 'ny'),
      // (the slab's top, for the sun's shadows: round the shaft too)
      ...G.box(SAS.x0, SAS.x1, yS, yS + 0.3, SH.z, SAS.z1, 'py'), ...G.box(SAS.x0, -SH.x, yS, yS + 0.3, SAS.z0, SH.z, 'py'), ...G.box(SH.x, SAS.x1, yS, yS + 0.3, SAS.z0, SH.z, 'py')], ceilM);
    add([...G.box(SAS.x0 - e, SAS.x1 + e, yF, yF + 0.001, SAS.z0 - e, SAS.z1, 'py'), ...G.box(-DOOR.w / 2 - e, DOOR.w / 2 + e, yF, yF + 0.001, SAS.z1, ROOM.z0, 'py')], floorM, false);   // (and the doorway's sill)
    // the room
    const roomW = G.box(ROOM.x0, ROOM.x1, yF - e, yR + e, ROOM.z0, ROOM.z1, 'pxnxpz', true);
    roomW.push(...G.box(ROOM.x0 - e, -DOOR.w / 2, yF - e, yR + e, ROOM.z0 - 0.001, ROOM.z0, 'pz'), ...G.box(DOOR.w / 2, ROOM.x1 + e, yF - e, yR + e, ROOM.z0 - 0.001, ROOM.z0, 'pz'), ...G.box(-DOOR.w / 2 - e, DOOR.w / 2 + e, yF + DOOR.h, yR + e, ROOM.z0 - 0.001, ROOM.z0, 'pz'));
    add(roomW, wallM);
    add([...G.box(ROOM.x0 - e, ROOM.x1 + e, yR - 0.001, yR, ROOM.z0 - e, ROOM.z1 + e, 'ny'), ...G.box(ROOM.x0 - 0.3, ROOM.x1 + 0.3, yR, yR + 0.3, ROOM.z0 - 0.3, ROOM.z1 + 0.3, 'py')], ceilM);
    add(G.box(ROOM.x0 - e, ROOM.x1 + e, yF, yF + 0.001, ROOM.z0 - e, ROOM.z1 + e, 'py'), floorM, false);
    this.props(yF, yR);
    this.colliders(yF, yR);
    this.sounds();
  }

  // the things in it
  props(yF, yR) {
    const steelM = this.steelM, galvM = this.galvM;
    const dark = bkMat({ color: 0x1b1d20, roughness: 0.6, metalness: 0.2 });
    const rubber = bkMat({ color: 0x0d0d0e, roughness: 0.9 });
    const wood = bkMat({ color: 0x6d5236, roughness: 0.75 });
    const cream = bkMat({ color: 0xd9d2bf, roughness: 0.7, metalness: 0.1 });
    const red = bkMat({ color: 0x8e1d16, roughness: 0.5, metalness: 0.2 });
    const add = (geos, m, cast = true) => { const o = new THREE.Mesh(merge(geos), m); o.castShadow = cast; o.receiveShadow = true; this.rooms.add(o); return o; };
    const plane = (w, h, x, y, z, ry, m) => { const g = new THREE.PlaneGeometry(w, h); g.rotateY(ry); g.translate(x, y, z); const o = new THREE.Mesh(g, m); o.receiveShadow = true; this.rooms.add(o); return o; };
    const R = ROOM, cx = 0;
    // ---- the steel door: 80 x 185 cm, 12 cm thick, a gasket, two lever latches; opened into the airlock
    const door = this.doorG = new THREE.Group();
    const dg = [...G.solid(0, DOOR.w, 0, DOOR.h, -0.12, 0)];
    for (const y of [0.45, 1.4]) dg.push(...G.solid(DOOR.w - 0.2, DOOR.w - 0.06, y - 0.02, y + 0.02, -0.17, -0.12), G.cyl(0.025, 0.06, DOOR.w - 0.08, y, -0.14, 'z'));
    for (const y of [0.25, DOOR.h - 0.25]) dg.push(G.cyl(0.04, 0.22, -0.02, y, -0.06));
    door.add(Object.assign(new THREE.Mesh(merge(dg), steelM), { castShadow: true, receiveShadow: true }));
    door.add(Object.assign(new THREE.Mesh(merge(G.solid(0.02, DOOR.w - 0.02, 0.02, DOOR.h - 0.02, 0, 0.012)), rubber), { receiveShadow: true }));
    const sign = paperTex(256, 128, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); stencil(g, 'UȘĂ ETANȘĂ', 14, 52, 40); stencil(g, 'A SE ȚINE ÎNCHISĂ', 16, 98, 26); });
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), bkMat({ map: sign, transparent: true, roughness: 0.7 })); sp.rotation.y = Math.PI; sp.position.set(DOOR.w / 2, 1.25, -0.121); door.add(sp);
    door.position.set(-DOOR.w / 2, yF, SAS.z1); this.rooms.add(door);
    // ---- the lamps: two fittings across the room, a 36 W tube in each (1.2 m), a white steel channel
    this.tubes = [];
    const tubeM = [0, 1].map(() => bkMat({ color: 0xf4f6f2, emissive: 0xf2f5ff, emissiveIntensity: 0, roughness: 0.3 }));
    for (const [k, tz] of [[0, R.z0 + 1.2], [1, R.z1 - 1.3]]) {
      add([...G.solid(-0.65, 0.65, yR - 0.06, yR, tz - 0.06, tz + 0.06)], cream);
      const tm = new THREE.Mesh(G.cyl(0.013, 1.2, 0, yR - 0.075, tz, 'x', 10), tubeM[k]); this.rooms.add(tm);
      this.tubes.push({ z: tz, m: tubeM[k], on: 0 });
    }
    // the switch: a bakelite box by the doorway, room side
    add([...G.solid(DOOR.w / 2 + 0.25, DOOR.w / 2 + 0.33, yF + 1.3, yF + 1.42, R.z0, R.z0 + 0.05)], dark);
    this.switchAt = { x: DOOR.w / 2 + 0.29, y: yF + 1.36, z: R.z0 + 0.05 };
    // the battery lamp over the door (red, on when the mains is off)
    this.redM = bkMat({ color: 0x401010, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.4 });
    const rl = new THREE.Mesh(G.cyl(0.05, 0.06, 0, yF + DOOR.h + 0.2, R.z0 + 0.03, 'z', 16), this.redM); this.rooms.add(rl);
    // ---- the desk: a steel desk against the far wall, the laptop on it (laptop.js puts its screen), a chair
    const dx = -0.9, dz = R.z1 - 0.38;
    add([...G.solid(dx - 0.7, dx + 0.7, yF + 0.72, yF + 0.75, dz - 0.36, dz + 0.36), ...G.solid(dx - 0.7, dx - 0.66, yF, yF + 0.72, dz - 0.34, dz + 0.34), ...G.solid(dx + 0.25, dx + 0.7, yF + 0.05, yF + 0.72, dz - 0.34, dz + 0.34)], steelM);
    for (let k = 0; k < 3; k++) add([...G.solid(dx + 0.27, dx + 0.68, yF + 0.1 + k * 0.2, yF + 0.27 + k * 0.2, dz - 0.365, dz - 0.34), G.cyl(0.008, 0.12, dx + 0.475, yF + 0.2 + k * 0.2, dz - 0.375, 'x')], galvM);
    this.deskAt = { x: dx, y: yF + 0.75, z: dz };
    // the laptop: a black rugged one, open at the hinge along its back, its screen the laptop's own picture
    // (laptop.js drawScreen, refreshed while you can see it)
    const sc = document.createElement('canvas'); sc.width = 512; sc.height = 320;
    const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace; stex.anisotropy = 4;
    this.screen = { canvas: sc, g: sc.getContext('2d'), tex: stex, t: 1 };
    const lp = new THREE.Group(), lean = 0.26, LW = 0.34, LD = 0.24, LH = 0.23;
    const base = G.solid(-LW / 2, LW / 2, 0, 0.022, -LD / 2, LD / 2);
    const lidG = G.solid(-LW / 2, LW / 2, 0, LH, -0.009, 0).map(g => { g.rotateX(lean); g.translate(0, 0.022, LD / 2); return g; });
    const hinge = G.cyl(0.007, LW - 0.04, 0, 0.022, LD / 2, 'x', 10);
    lp.add(Object.assign(new THREE.Mesh(merge([...base, ...lidG, hinge]), bkMat({ color: 0x17181a, roughness: 0.55, metalness: 0.2 })), { castShadow: true, receiveShadow: true }));
    const keys = paperTex(512, 256, (g, w, h) => { g.fillStyle = '#1a1b1d'; g.fillRect(0, 0, w, h); g.fillStyle = '#0c0c0d'; for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) g.fillRect(12 + k * 35 + (r % 2) * 8, 10 + r * 34, 30, 28); g.fillRect(140, 182, 220, 28); g.fillStyle = '#26282b'; g.fillRect(186, 222, 140, 30); });
    const kb = new THREE.PlaneGeometry(LW - 0.03, LD - 0.04); kb.rotateX(-Math.PI / 2); kb.translate(0, 0.0225, 0);
    lp.add(Object.assign(new THREE.Mesh(kb, bkMat({ map: keys, roughness: 0.7 })), { receiveShadow: true }));
    const scr = new THREE.PlaneGeometry(LW - 0.035, LH - 0.045); scr.rotateY(Math.PI); scr.translate(0, LH / 2 + 0.004, -0.0095); scr.rotateX(lean); scr.translate(0, 0.022, LD / 2);
    lp.add(new THREE.Mesh(scr, bkMat({ color: 0x050607, emissive: 0xffffff, emissiveMap: stex, emissiveIntensity: 0.9, roughness: 0.22 })));
    lp.position.set(dx + 0.15, yF + 0.75, dz - 0.04); lp.rotation.y = 0.12;
    this.rooms.add(lp);
    // the chair: a steel frame, a worn seat
    const chx = dx - 0.05, chz = dz - 0.75;
    add([...G.solid(chx - 0.22, chx + 0.22, yF + 0.44, yF + 0.48, chz - 0.22, chz + 0.22), ...G.solid(chx - 0.22, chx + 0.22, yF + 0.5, yF + 0.92, chz + 0.2, chz + 0.23)], wood);
    for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) add([G.cyl(0.011, 0.44, chx + a, yF + 0.22, chz + b, 'y', 8)], galvM);
    // the field telephone (a box with its crank) and the radio on the desk's left end
    add([...G.solid(dx - 0.62, dx - 0.36, yF + 0.75, yF + 0.88, dz - 0.02, dz + 0.18), G.cyl(0.006, 0.08, dx - 0.34, yF + 0.82, dz + 0.08, 'x', 8)], bkMat({ color: 0x2e3528, roughness: 0.6 }));
    add([...G.solid(dx - 0.62, dx - 0.3, yF + 0.75, yF + 0.97, dz + 0.2, dz + 0.34)], bkMat({ color: 0x4b513f, roughness: 0.55, metalness: 0.3 }));
    // ---- the filter-ventilation unit in the far right corner: the fan's housing with its hand crank, the filter
    // canister, the duct up to the ceiling and along it to the intake, a hermetic flap
    const fx = 1.95, fz = R.z1 - 0.55;
    add([G.cyl(0.26, 0.3, fx - 0.3, yF + 0.55, fz, 'z', 20), ...G.solid(fx - 0.62, fx + 0.05, yF, yF + 0.3, fz - 0.25, fz + 0.25), G.cyl(0.22, 0.85, fx + 0.32, yF + 0.43, fz, 'y', 20), G.cyl(0.08, yR - 0.65 - yF, fx + 0.32, (yF + 0.85 + yR) / 2, fz, 'y', 14),
      G.cyl(0.08, 2.2, fx + 0.32, yR - 0.14, fz - 1.1, 'z', 14), G.cyl(0.11, 0.06, fx + 0.32, yR - 0.14, fz - 1.8, 'z', 16)], steelM);
    add([G.cyl(0.012, 0.25, fx - 0.3, yF + 0.55, fz - 0.27, 'z', 8), ...G.solid(fx - 0.31, fx - 0.29, yF + 0.55, yF + 0.75, fz - 0.4, fz - 0.38), G.cyl(0.015, 0.1, fx - 0.3, yF + 0.75, fz - 0.44, 'z', 8)], galvM);
    const fvu = paperTex(512, 360, (g, w, h) => {
      g.fillStyle = '#e9e2cc'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.font = '700 24px Arial'; g.fillText('INSTALAȚIA DE FILTROVENTILAȚIE', 18, 38);
      g.font = '17px Arial'; ['1. Regim de ventilație simplă: clapeta 1 deschisă, filtrul ocolit.', '2. Regim de filtroventilație: clapetele 1 închise, 2 deschise,', '    aerul trece prin filtrul absorbant.', '3. Fără curent: se învârte manivela, 40 - 60 rot/min.', '4. Se verifică suprapresiunea la manometru.', '5. Nu se fumează. Nu se deschide ieșirea de salvare', '    în regim de filtroventilație.'].forEach((l, i) => g.fillText(l, 18, 80 + i * 34));
      g.fillStyle = 'rgba(120,80,40,0.25)'; g.fillRect(0, h - 40, w, 40);
    });
    plane(0.5, 0.35, fx - 0.3, yF + 1.35, R.z1 - 0.001, Math.PI, bkMat({ map: fvu, roughness: 0.8 }));
    // ---- the bunks: a two-tier steel frame along the left wall, the mattresses, an army blanket, CORB's sleeping bag
    const bx = R.x0 + 0.45, bz = R.z0 + 1.5;
    const bed = [];
    for (const [a, b] of [[-0.4, -0.95], [0.4, -0.95], [-0.4, 0.95], [0.4, 0.95]]) bed.push(G.cyl(0.02, 1.75, bx + a, yF + 0.875, bz + b, 'y', 8));
    for (const y of [0.42, 1.25]) bed.push(...G.solid(bx - 0.42, bx + 0.42, yF + y, yF + y + 0.04, bz - 0.97, bz + 0.97));
    add(bed, steelM);
    add([...G.solid(bx - 0.38, bx + 0.38, yF + 0.46, yF + 0.58, bz - 0.92, bz + 0.92), ...G.solid(bx - 0.38, bx + 0.38, yF + 1.29, yF + 1.41, bz - 0.92, bz + 0.92)], bkMat({ color: 0x5e5a4c, roughness: 0.95 }));
    add([...G.solid(bx - 0.36, bx + 0.39, yF + 0.58, yF + 0.64, bz - 0.5, bz + 0.88)], bkMat({ color: 0x3a4430, roughness: 0.98 }));
    add([...G.solid(bx - 0.3, bx + 0.3, yF + 1.41, yF + 1.55, bz - 0.85, bz + 0.6)], bkMat({ color: 0x24333f, roughness: 0.8 }));
    // ---- the shelves of the post's stores along the right wall: jerrycans, tins, a crate of candles, gas masks' bags
    const sx = R.x1 - 0.25, sz = R.z0 + 1.2;
    const sh = [];
    for (const [a, b] of [[-0.2, -0.5], [0.2, -0.5], [-0.2, 0.5], [0.2, 0.5]]) sh.push(...G.solid(sx + a - 0.02, sx + a + 0.02, yF, yF + 1.9, sz + b - 0.02, sz + b + 0.02));
    for (const y of [0.15, 0.6, 1.05, 1.5, 1.88]) sh.push(...G.solid(sx - 0.22, sx + 0.22, yF + y, yF + y + 0.02, sz - 0.52, sz + 0.52));
    add(sh, galvM);
    const cans = [], jerry = [];
    for (let k = 0; k < 9; k++) cans.push(G.cyl(0.042, 0.11, sx - 0.12 + (k % 3) * 0.1, yF + 1.07 + 0.055, sz - 0.4 + Math.floor(k / 3) * 0.1, 'y', 12));
    for (let k = 0; k < 6; k++) cans.push(G.cyl(0.042, 0.11, sx - 0.1 + (k % 2) * 0.12, yF + 1.52 + 0.055, sz + 0.1 + Math.floor(k / 2) * 0.12, 'y', 12));
    add(cans, bkMat({ color: 0x8b8e86, roughness: 0.35, metalness: 0.8 }));
    for (let k = 0; k < 3; k++) jerry.push(...G.solid(sx - 0.17, sx + 0.17, yF + 0.17, yF + 0.6, sz - 0.48 + k * 0.33, sz - 0.48 + k * 0.33 + 0.16));
    add(jerry, bkMat({ color: 0x485535, roughness: 0.55, metalness: 0.2 }));
    add([...G.solid(sx - 0.2, sx + 0.2, yF + 0.62, yF + 0.9, sz - 0.45, sz + 0.1)], wood);
    // ---- CORB's things: the battery bank (six 12 V lead batteries) and the inverter, the rack of network gear
    const rx = 0.55, rz = R.z1 - 0.32;
    const bat = [];
    for (let k = 0; k < 6; k++) bat.push(...G.solid(rx - 0.4 + (k % 3) * 0.27, rx - 0.4 + (k % 3) * 0.27 + 0.24, yF + Math.floor(k / 3) * 0.24, yF + Math.floor(k / 3) * 0.24 + 0.22, rz - 0.1, rz + 0.08));
    add(bat, bkMat({ color: 0x151719, roughness: 0.6 }));
    add([...G.solid(rx - 0.42, rx + 0.42, yF + 0.48, yF + 0.6, rz - 0.12, rz + 0.1)], bkMat({ color: 0x2b4a8a, roughness: 0.5, metalness: 0.4 }));
    // the rack: 12U, open frame, a router, a switch with its port LEDs, a little server
    const kx = 1.2, kz = R.z1 - 0.32;
    add([...G.solid(kx - 0.27, kx - 0.24, yF, yF + 0.75, kz - 0.3, kz - 0.27), ...G.solid(kx + 0.24, kx + 0.27, yF, yF + 0.75, kz - 0.3, kz - 0.27), ...G.solid(kx - 0.27, kx + 0.27, yF + 0.72, yF + 0.75, kz - 0.3, kz + 0.25)], dark);
    add([...G.solid(kx - 0.24, kx + 0.24, yF + 0.08, yF + 0.17, kz - 0.27, kz + 0.2), ...G.solid(kx - 0.24, kx + 0.24, yF + 0.25, yF + 0.3, kz - 0.27, kz + 0.2), ...G.solid(kx - 0.24, kx + 0.24, yF + 0.4, yF + 0.53, kz - 0.27, kz + 0.2)], bkMat({ color: 0x2a2d31, roughness: 0.4, metalness: 0.6 }));
    this.leds = [];
    const ledG = new THREE.SphereGeometry(0.004, 6, 4);
    for (let k = 0; k < 16; k++) {
      const m = new THREE.MeshBasicMaterial({ color: k % 5 === 0 ? 0xffa020 : 0x30ff70 });
      const o = new THREE.Mesh(ledG, m); o.position.set(kx - 0.2 + (k % 8) * 0.05, yF + 0.27 + (k > 7 ? 0.02 : 0), kz - 0.275); this.rooms.add(o);
      this.leds.push({ o, m, ph: Math.random() * 10, rate: 2 + Math.random() * 9 });
    }
    // ---- the board: cork on the left of the desk, photos (the Maybach, the transformer station, the launcher on the
    // hill over Câmpina, the cross), notes, red string between them
    const board = paperTex(1024, 640, (g, w, h) => {
      g.fillStyle = '#9b7a52'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 2600; k++) { g.fillStyle = `rgba(${60 + Math.random() * 40},${40 + Math.random() * 30},20,0.35)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      const pin = (x, y, ang, label, sub, kind) => {
        g.save(); g.translate(x, y); g.rotate(ang);
        g.fillStyle = '#f4f1ea'; g.fillRect(-90, -70, 180, 150);
        const gr = g.createLinearGradient(0, -60, 0, 50);
        const pal = { car: ['#20262e', '#5c6670'], pta: ['#6d7a62', '#c9c4b0'], rocket: ['#8fa6c0', '#e6e0d0'], cross: ['#3a4a5e', '#9aa8b8'] }[kind];
        gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[1]); g.fillStyle = gr; g.fillRect(-80, -60, 160, 105);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        if (kind === 'car') { g.fillRect(-60, -10, 120, 30); g.fillRect(-35, -30, 70, 22); g.beginPath(); g.arc(-35, 22, 12, 0, 7); g.arc(35, 22, 12, 0, 7); g.fill(); }
        if (kind === 'pta') { g.fillRect(-4, -60, 8, 105); g.fillRect(-30, -20, 60, 30); g.fillRect(-45, -50, 90, 5); }
        if (kind === 'rocket') { g.fillRect(-50, 20, 100, 20); g.save(); g.rotate(-0.5); g.fillRect(-6, -55, 12, 70); g.restore(); }
        if (kind === 'cross') { g.fillRect(-4, -55, 8, 95); g.fillRect(-26, -35, 52, 8); }
        g.fillStyle = '#222'; g.font = '700 15px Arial'; g.fillText(label, -80, 64); g.font = '12px Arial'; g.fillStyle = '#444'; g.fillText(sub, -80, 78);
        g.fillStyle = '#c4161c'; g.beginPath(); g.arc(0, -66, 7, 0, 7); g.fill(); g.restore();
      };
      const P = [[190, 170, -0.05, 'PH 60 MBH', 'cheie: releu 125 kHz?', 'car'], [520, 140, 0.04, 'PTA 20/0,4 kV', 'pădurea crucii - SCADA', 'pta'], [840, 190, -0.03, 'LG-12 CÂMPINA', 'lansator antigrindină', 'rocket'], [360, 440, 0.06, 'CRUCEA', 'furtuna din 14 iulie', 'cross']];
      g.strokeStyle = '#c4161c'; g.lineWidth = 3; g.beginPath(); g.moveTo(190, 104); g.lineTo(520, 74); g.lineTo(840, 124); g.lineTo(360, 374); g.lineTo(190, 104); g.stroke();
      for (const p of P) pin(...p);
      const note = (x, y, ang, lines) => { g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = '#f2e36b'; g.fillRect(0, 0, 150, 120); g.fillStyle = '#1b2a7a'; g.font = '19px "Comic Sans MS", cursive'; lines.forEach((l, i) => g.fillText(l, 10, 30 + i * 26)); g.restore(); };
      note(700, 400, 0.05, ['NOR =', 'grindina1983', '(nu uita!!)']);
      note(860, 470, -0.08, ['fereastra:', '14-18 iul', 'cumulonimbus']);
    });
    plane(1.4, 0.875, -1.85, yF + 1.62, R.z1 - 0.002, Math.PI, bkMat({ map: board, roughness: 0.85 }));
    // ---- the signs: the post's name, the emergency exit (in the airlock, an arrow up the shaft), a 1987 calendar
    // (painted through a stencil, black on the lime; the blue triangle on orange that marks Romania's shelters now was
    // set by HG 630/2005, long after the post was sealed)
    const ink = '#262520';
    const s1 = paperTex(512, 160, (g, w, h) => { g.clearRect(0, 0, w, h); stencil(g, 'POSTUL 7', 20, 70, 64, ink); stencil(g, 'PROTECȚIA CIVILĂ · ADĂPOST', 22, 128, 32, ink); });
    plane(1.1, 0.34, 0.9, yF + 1.95, R.z0 + 0.002, 0, bkMat({ map: s1, transparent: true, roughness: 0.9 }));
    const s2 = paperTex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); stencil(g, 'IEȘIRE', 36, 70, 56, ink); stencil(g, 'DE SALVARE', 18, 126, 42, ink); g.strokeStyle = ink; g.lineWidth = 14; g.beginPath(); g.moveTo(128, 240); g.lineTo(128, 150); g.moveTo(92, 186); g.lineTo(128, 146); g.lineTo(164, 186); g.stroke(); });
    plane(0.45, 0.45, 0.4, yF + 1.55, SAS.z0 + 0.002, 0, bkMat({ map: s2, transparent: true, roughness: 0.9 }));
    const cal = paperTex(256, 360, (g, w, h) => {
      g.fillStyle = '#efe9d8'; g.fillRect(0, 0, w, h); g.fillStyle = '#a3241c'; g.fillRect(0, 0, w, 70); g.fillStyle = '#fff'; g.font = '700 34px Arial'; g.fillText('1987', 80, 48);
      g.fillStyle = '#333'; g.font = '700 20px Arial'; g.fillText('NOIEMBRIE', 64, 104); g.font = '15px Arial';
      for (let d = 1; d <= 30; d++) { const c = (d + 5) % 7, r = Math.floor((d + 5) / 7); g.fillStyle = c === 6 ? '#a3241c' : '#333'; g.fillText(String(d), 20 + c * 33, 140 + r * 40); }
    });
    plane(0.28, 0.4, R.x0 + 0.002, yF + 1.6, R.z1 - 0.9, Math.PI / 2, bkMat({ map: cal, roughness: 0.85 }));
    // the rules, posted as the shelters' rules want them (the text of the civil-protection leaflets: keep order and
    // don't smoke, don't open the sealed doors or leave without leave, keep your mask ready, help with first aid, do
    // what the shelter's chief says, bring nothing that burns)
    const rules = paperTex(512, 724, (g, w, h) => {
      g.fillStyle = '#ece6d3'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3b3a36'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = '#26251f'; g.textAlign = 'center'; g.font = '700 34px Arial'; g.fillText('REGULI DE COMPORTARE', w / 2, 80); g.fillText('ÎN ADĂPOST', w / 2, 122);
      g.textAlign = 'left'; g.font = '23px Arial';
      const L = ['Păstrați ordinea și curățenia.', 'Nu circulați inutil. Nu fumați.', 'Nu deschideți ușile și obloanele', 'etanșe. Nu părăsiți adăpostul', 'fără aprobare.', 'Țineți masca pregătită și', 'folosiți-o la ordin.', 'Ajutați la primul ajutor.', 'Executați dispozițiile', 'șefului de adăpost.', 'Nu aduceți materiale', 'inflamabile.'];
      const lead = [0, 1, 2, 5, 7, 8, 10];
      L.forEach((s, i) => { const y = 190 + i * 40; if (lead.includes(i)) g.fillText('•', 40, y); g.fillText(s, 64, y); });
      g.font = 'italic 18px Arial'; g.fillText('Șeful adăpostului: ....................', 40, h - 60);
    });
    plane(0.3, 0.424, R.x1 - 0.002, yF + 1.5, R.z0 + 2.45, -Math.PI / 2, bkMat({ map: rules, roughness: 0.85 }));
    // ---- a fire extinguisher by the door, a bucket, a crate
    add([G.cyl(0.075, 0.5, -DOOR.w / 2 - 0.35, yF + 0.25, R.z0 + 0.12, 'y', 16), G.cyl(0.02, 0.08, -DOOR.w / 2 - 0.35, yF + 0.54, R.z0 + 0.12, 'y', 8)], red);
    add([G.cyl(0.14, 0.28, R.x1 - 0.4, yF + 0.14, R.z1 - 1.5, 'y', 16)], galvM);
  }

  // the walls and the things you bump into, below ground only (their heights keep them from the meadow above)
  colliders(yF, yR) {
    const y0 = this.gy - this.depth - 0.5, y1 = this.gy - this.depth + ROOM.h + 0.2;
    const W = 3.0;
    const box = (x0, x1, z0, z1, a = y0, b = y1) => {
      const c = this.toW((x0 + x1) / 2, 0, (z0 + z1) / 2);
      const bx = this.world.addStatic(new this.world.Box(c.x, c.z, (x1 - x0) / 2, (z1 - z0) / 2, this.rot, a, b, 'bunker'));
      this.boxes.push(bx); return bx;
    };
    // the airlock's walls
    box(SAS.x0 - W, SAS.x0, SAS.z0 - W, SAS.z1); box(SAS.x1, SAS.x1 + W, SAS.z0 - W, SAS.z1); box(SAS.x0 - W, SAS.x1 + W, SAS.z0 - W, SAS.z0);
    // the door wall, the doorway left
    box(SAS.x0 - W, -DOOR.w / 2, SAS.z1, ROOM.z0); box(DOOR.w / 2, SAS.x1 + W, SAS.z1, ROOM.z0);
    // the room's walls
    box(ROOM.x0 - W, ROOM.x0, ROOM.z0, ROOM.z1 + W); box(ROOM.x1, ROOM.x1 + W, ROOM.z0, ROOM.z1 + W); box(ROOM.x0 - W, ROOM.x1 + W, ROOM.z1, ROOM.z1 + W);
    box(ROOM.x0 - W, -DOOR.w / 2, SAS.z1, ROOM.z0); box(DOOR.w / 2, ROOM.x1 + W, SAS.z1, ROOM.z0);
    // the things: the desk, the FVU, the bunks, the shelves, the rack and the batteries
    const R = ROOM;
    box(-1.6, -0.2, R.z1 - 0.74, R.z1); box(1.35, R.x1, R.z1 - 0.85, R.z1); box(R.x0, R.x0 + 0.9, R.z0 + 0.5, R.z0 + 2.5);
    box(R.x1 - 0.5, R.x1, R.z0 + 0.65, R.z0 + 1.75); box(0.1, 1.5, R.z1 - 0.62, R.z1);
    // the steel door when it is shut (moved in and out: update)
    this.doorBox = box(-DOOR.w / 2, DOOR.w / 2, SAS.z1 - 0.12, SAS.z1);
    this.doorBox.ghost = true;
    // the open hatch on the meadow: you go down by the ladder (E), not by falling in
    const c = this.toW(0, 0, 0);
    this.hatchBox = this.world.addStatic(new this.world.Box(c.x, c.z, SH.x + 0.05, SH.z + 0.05, this.rot, this.gy - 0.3, this.gy + 1.2, 'hatch'));
    this.hatchBox.ghost = true;
  }

  // the ground under you: the post's floor while you are down in it
  groundAt(x, z, ref) {
    if (ref === undefined || ref > this.gy - 1.0) return null;
    const p = this.toL(x, z);
    const inSas = p.x > SAS.x0 && p.x < SAS.x1 && p.z > SAS.z0 && p.z < SAS.z1 + WALL;
    const inRoom = p.x > ROOM.x0 && p.x < ROOM.x1 && p.z > ROOM.z0 - 0.01 && p.z < ROOM.z1;
    return inSas || inRoom ? this.yF : null;
  }
  // are you in it (below the meadow, inside its rooms or the shaft)
  isInside(pos) {
    if (pos.y > this.gy - 1.2) return false;
    const p = this.toL(pos.x, pos.z);
    return p.x > ROOM.x0 - 0.5 && p.x < ROOM.x1 + 0.5 && p.z > SAS.z0 - 0.5 && p.z < ROOM.z1 + 0.5;
  }

  // ---- sounds: the tubes' hum (their ballasts at 100 Hz), the fan's rush, drips; the hatch's creak and slam, the
  // door, the switch, the ladder's rungs
  sounds() {
    const a = this.audio; if (!a?.ctx) return;
    const ctx = a.ctx;
    const hum = ctx.createGain(); hum.gain.value = 0; hum.connect(a.master);
    for (const [f, g] of [[100, 0.5], [200, 0.25], [300, 0.12], [1200, 0.02]]) { const o = ctx.createOscillator(); o.frequency.value = f; const gg = ctx.createGain(); gg.gain.value = g; o.connect(gg).connect(hum); o.start(); }
    const fan = ctx.createGain(); fan.gain.value = 0; fan.connect(a.master);
    const ns = ctx.createBufferSource(); ns.buffer = a.noise; ns.loop = true; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; ns.connect(lp).connect(fan); ns.start();
    this.snd = { hum, fan, nextDrip: 2 };
  }
  creak(open) {
    const a = this.audio; if (!a?.ctx) return;
    a.scrape({ f: open ? 620 : 520, q: 6, gain: 0.12, a: 0.05, hold: 0.5, rel: 0.4, rate: 0.6 });
    a.scrape({ f: 1700, q: 9, gain: 0.05, a: 0.1, hold: 0.3, rel: 0.3, delay: 0.15, rate: 0.5 });
    a.ring([180, 233, 410, 690], [0.35, 0.22, 0.15, 0.1], [0.25, 0.2, 0.15, 0.1], open ? 1.05 : 1.15);
    a.burst({ f: 260, q: 0.7, dur: 0.2, gain: 0.4, type: 'lowpass', delay: open ? 1.05 : 1.15 });
  }
  clank(k = 1) { const a = this.audio; if (!a?.ctx) return; a.ring([520 + Math.random() * 60, 1340, 2100], [0.12 * k, 0.06 * k, 0.03 * k], [0.08, 0.05, 0.03], 0); }
  thump() { const a = this.audio; if (!a?.ctx) return; a.burst({ f: 160, q: 0.8, dur: 0.35, gain: 0.55, type: 'lowpass' }); a.ring([95, 140, 310], [0.3, 0.2, 0.08], [0.3, 0.25, 0.1], 0.01); }
  click() { const a = this.audio; if (!a?.ctx) return; a.burst({ f: 2400, q: 2, dur: 0.03, gain: 0.25 }); a.burst({ f: 900, q: 1, dur: 0.05, gain: 0.15, delay: 0.02 }); }

  // ---- what E and F do here: returns the prompt (or null); acts on the keys
  interact(cam, input, player, onLaptop) {
    if (this.climb) return '';
    const p = this.toL(player.pos.x, player.pos.z), below = player.pos.y < this.gy - 1.2;
    if (!below) {
      const d = Math.hypot(p.x, p.z);
      if (d > 1.7) return null;
      if (this.lid < 0.98 && this.lidTo === 0) {
        if (input.hit('KeyE')) { this.lidTo = 1; this.creak(true); }
        return 'E — deschide trapa (ieșirea de salvare a unui adăpost vechi)';
      }
      if (this.lidTo === 1 && this.lid > 0.98) {
        if (input.hit('KeyE')) { this.startClimb(player, -1); return ''; }
        if (input.hit('KeyF')) { this.lidTo = 0; this.creak(false); }
        return 'E — coboară pe scară · F — închide trapa';
      }
      return '';
    }
    if (!this.built) return null;
    // at the ladder's foot
    if (Math.abs(p.x) < 0.7 && p.z > SAS.z0 && p.z < 0.75) {
      if (input.hit('KeyE')) { this.startClimb(player, 1); return ''; }
      return 'E — urcă pe scară, afară';
    }
    // the switch, the laptop, the door: what you look at, within reach
    const f = cam.getWorldDirection(this._f ??= new THREE.Vector3());
    const look = (lx, ly, lz, r = 0.35, reach = 1.9) => {
      const w = this.toW(lx, 0, lz); w.y = this.gy + ly;
      const dx = w.x - cam.position.x, dy = w.y - cam.position.y, dz = w.z - cam.position.z, dd = Math.hypot(dx, dy, dz);
      return dd < reach && (f.x * dx + f.y * dy + f.z * dz) / dd > Math.cos(Math.atan2(r, dd) + 0.12);
    };
    const yF = -this.depth;
    if (look(this.deskAt.x + 0.25, yF + 0.95, this.deskAt.z, 0.35, 2.1)) {
      if (!this.mains && this.battery <= 0) return 'Laptopul nu pornește: bateriile postului s-au descărcat (dă drumul la curent la postul de transformare)';
      if (input.hit('KeyE')) onLaptop();
      return 'E — deschide laptopul';
    }
    if (look(this.switchAt.x, this.switchAt.y, this.switchAt.z, 0.12, 1.6)) {
      if (input.hit('KeyE')) { this.lights = !this.lights; this.lightT = 0; this.click(); }
      return this.lights ? 'E — stinge lumina' : 'E — aprinde lumina (comutatorul de lângă ușă)';
    }
    if (look(0, yF + 1.0, SAS.z1 - 0.3, 0.45, 1.8) && Math.abs(p.x) < 1.2) {
      if (input.hit('KeyE')) { this.doorTo = this.doorTo ? 0 : 1; this.thump(); }
      return this.doorTo ? 'E — închide ușa etanșă' : 'E — deschide ușa etanșă';
    }
    return null;
  }

  // the way down and up the ladder (dir -1 down, 1 up): stepped to the rungs, facing the ladder
  startClimb(player, dir) {
    const from = { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch };
    this.climb = { dir, t: 0, from, rungs: 0 };
    player.vel.set(0, 0, 0);
  }
  // (main.js calls this instead of the player's own update while on the ladder; returns true while it lasts)
  climbUpdate(dt, player, camera) {
    const c = this.climb; if (!c) return false;
    c.t += dt;
    const yF = -this.depth, top = 0, eye = player.eye ?? 1.6;
    const T0 = 0.7, TL = this.depth / 1.25, T1 = 0.7;            // (to the ladder, the climb at ~1.25 m/s, off it)
    const ladZ = -SH.z + 0.5;                                       // (where your eyes are on it: ~33 cm off the rungs)
    const yawLad = this.rot;                                        // (facing the ladder: local -z)
    let lx, ly, lz, yaw, pitch;
    const ease = (u) => u * u * (3 - 2 * u);
    const fromL = this.toL(c.from.x, c.from.z);
    if (c.dir < 0) {
      if (c.t < T0) { const u = ease(c.t / T0); lx = fromL.x * (1 - u); lz = fromL.z + (ladZ - fromL.z) * u; ly = top; yaw = c.from.yaw + angTo(c.from.yaw, yawLad) * u; pitch = c.from.pitch * (1 - u) - 0.5 * u; }
      else if (c.t < T0 + TL) { const u = (c.t - T0) / TL; lx = 0; lz = ladZ; ly = top + (yF - top) * u; yaw = yawLad; pitch = -0.15 + 0.12 * Math.sin(u * 20); }
      else { const u = ease(Math.min(1, (c.t - T0 - TL) / T1)); lx = 0; lz = ladZ + (0.55 - ladZ) * u; ly = yF; yaw = yawLad + Math.PI * u; pitch = 0; }
    } else {
      if (c.t < T1) { const u = ease(c.t / T1); lx = fromL.x * (1 - u); lz = fromL.z + (ladZ - fromL.z) * u; ly = yF; yaw = c.from.yaw + angTo(c.from.yaw, yawLad) * u; pitch = c.from.pitch * (1 - u) + 0.3 * u; }
      else if (c.t < T1 + TL) { const u = (c.t - T1) / TL; lx = 0; lz = ladZ; ly = yF + (top - yF) * u; yaw = yawLad; pitch = 0.25 - 0.12 * Math.sin(u * 20); }
      else { const u = ease(Math.min(1, (c.t - T1 - TL) / T0)); lx = 0; lz = ladZ - (ladZ + 1.15) * u; ly = top; yaw = yawLad; pitch = 0.25 * (1 - u); }
    }
    // the rungs under the hands: a bob and a clank at each
    const onLad = ly < top - 0.05 && ly > yF + 0.05;
    const rr = Math.floor(-ly / RUNG);
    if (onLad && rr !== c.rungs) { c.rungs = rr; this.clank(0.8); }
    const bob = onLad ? 0.03 * Math.abs(Math.sin((-ly / RUNG) * Math.PI)) : 0;
    const w = this.toW(lx, ly, lz);
    player.pos.set(w.x, w.y, w.z);
    player.yaw = yaw; player.pitch = pitch;
    camera.position.set(w.x, w.y + eye - bob, w.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    const done = c.dir < 0 ? c.t >= T0 + TL + T1 : c.t >= T1 + TL + T0;
    if (done) { this.climb = null; player.vel.set(0, 0, 0); player.onGround = true; }
    return true;
  }

  // ---- every frame: what is near and lit, the lid and the door moving, the lamps, the sounds
  update(dt, ctx) {
    const { camera, player, mains, laptopGlow } = ctx;
    const dx = camera.position.x - this.x, dz = camera.position.z - this.z, dist = Math.hypot(dx, dz);
    if (!this.built && dist < 70) this.build();
    this.mains = mains;
    // the battery bank (% of what it can give): six old 12 V, 60 Ah car batteries side by side, 4.3 kWh on their labels.
    // Aged (two of them going), they hold ~40% of that, and lead is not drawn below half its charge: ~0.9 kWh to use -
    // the ~9 hours of CORB's diary at ~100 W (the laptop ~45 W, the rack ~35 W, the red lamp ~5 W, through a ~85%
    // inverter). On the mains a 20 A charger (~235 W into them) fills it again in ~4 hours.
    this.battery = mains ? Math.min(100, this.battery + dt * 100 / (4 * 3600)) : Math.max(0, this.battery - dt * 100 / (9 * 3600));
    const fed = mains || this.battery > 0;
    // the lid: ~1.1 s to swing up on its hinges (110 deg), the same down
    this.lid += Math.sign(this.lidTo - this.lid) * Math.min(Math.abs(this.lidTo - this.lid), dt / 1.1);
    const u = this.lid * this.lid * (3 - 2 * this.lid);
    this.lidG.rotation.x = u * 1.92;
    if (this.hatchBox) this.hatchBox.ghost = this.lid < 0.05;
    this.inside = this.isInside(camera.position) || !!this.climb;
    if (!this.built) { BK.uSky.value.w = 0; return; }
    // the door: ~1.4 s, heavy
    this.door += Math.sign(this.doorTo - this.door) * Math.min(Math.abs(this.doorTo - this.door), dt / 1.4);
    this.doorG.rotation.y = (this.door * this.door * (3 - 2 * this.door)) * 1.62;   // (into the airlock)
    this.doorBox.ghost = this.door > 0.1;
    // the rooms drawn only when they can be seen: from within, or the hatch open and you near it
    this.rooms.visible = this.inside || (this.lid > 0.02 && dist < 25);
    // the lamps: the tubes on the switch and the mains (an old starter: a few blinks, then lit; one of them flickers
    // now and then), the laptop's glow, the red battery lamp when the mains is off
    this.lightT += dt;
    const live = this.lights && this.mains;
    let k = 0;
    const L = BK.uL.value, C = BK.uC.value;
    for (let i = 0; i < this.tubes.length; i++) {
      const t = this.tubes[i];
      let on = 0;
      if (live) {
        const st = this.lightT - i * 0.35;
        on = st < 0 ? 0 : st < 1.4 ? (Math.sin(st * 23 + i) > 0.55 ? 1 : 0.08) : 1;
        if (i === 1 && st > 1.4) { this.flick -= dt; if (this.flick < -6 - Math.random() * 10) this.flick = 0.4; if (this.flick > 0) on = Math.sin(this.lightT * 70) > 0 ? 0.25 : 1; }
      }
      t.on = on;
      t.m.emissiveIntensity = on * 2.2;
      for (const off of [-0.45, 0, 0.45]) {
        const w = this.toW(off, -this.depth + ROOM.h - 0.1, t.z);
        L[k].set(w.x, w.y, w.z, on * 2.6); C[k].setRGB(1, 0.97, 0.92); k++;
      }
    }
    // the laptop's screen and the rack's LEDs
    const sw = this.toW(this.deskAt.x + 0.3, -this.depth + 0.95, this.deskAt.z - 0.35);
    L[k].set(sw.x, sw.y, sw.z, fed ? (laptopGlow ?? 0.25) * 0.35 : 0); C[k].setRGB(0.55, 0.7, 1); k++;
    const red = !mains && fed ? 0.6 + 0.4 * Math.sin(this.lightT * 2.2) : 0;
    this.redM.emissiveIntensity = red * 3;
    const rw = this.toW(0, -this.depth + DOOR.h + 0.2, ROOM.z0 + 0.2);
    L[k].set(rw.x, rw.y, rw.z, red * 0.5); C[k].setRGB(1, 0.12, 0.05); k++;
    for (; k < 8; k++) L[k].w = 0;
    const lit = (this.tubes[0].on + this.tubes[1].on) / 2;
    BK.uAmb.value.setRGB(0.95, 0.92, 0.86).multiplyScalar(0.55 * lit + 0.02 + 0.04 * red);
    for (const l of this.leds) { const b = !fed ? 0 : Math.sin(this.lightT * l.rate + l.ph) > 0.3 ? 1 : 0.15; l.m.color.copy(l.m.userData.c ??= l.m.color.clone()).multiplyScalar(b); }
    // the laptop's screen, twice a second while the rooms are drawn
    if (this.screen && this.rooms.visible && (this.screen.t += dt) > 0.5) {
      this.screen.t = 0;
      if (fed && ctx.drawScreen) ctx.drawScreen(this.screen.g, 512, 320); else { this.screen.g.fillStyle = '#000'; this.screen.g.fillRect(0, 0, 512, 320); }
      this.screen.tex.needsUpdate = true;
    }
    // the sky down the shaft
    const top = this.toW(0, 0, 0);
    BK.uSky.value.set(top.x, top.y, top.z, u);
    // the sounds, when you are in it
    if (this.snd) {
      const now = this.audio.ctx.currentTime, near = this.inside ? 1 : Math.max(0, 1 - dist / 6) * u * 0.3;
      this.snd.hum.gain.setTargetAtTime(0.006 * lit * near, now, 0.1);
      this.snd.fan.gain.setTargetAtTime((this.mains ? 0.05 : 0.0) * near, now, 0.3);
      if (this.inside && (this.snd.nextDrip -= dt) < 0) { this.snd.nextDrip = 1.5 + Math.random() * 5; this.audio.ring([1400 + Math.random() * 500, 2600], [0.05, 0.02], [0.04, 0.02], 0); }
    }
  }
}
