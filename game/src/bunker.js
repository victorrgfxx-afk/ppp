import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HOLE } from './geo/terrain.js';

// (V128) Postul 7: an operations centre under the meadow of the hill of the cross, a few metres from the Maybach. The way
// in is its emergency exit, as V126 had it: a steel hatch in a concrete collar flush with the grass (E opens it), a
// shaft with a rung ladder (rungs ~28 cm apart) down to the airlock, a sealed steel door. Behind it, a server room and
// operations post as such rooms are built now:
//  * a raised floor of 600 x 600 mm tiles, perforated in front of the racks (the cold aisle: the coolers' air comes up
//    through them); painted walls, a black ceiling with the services showing, linear LED lights (4000 K);
//  * two rows of 19-inch racks, 42U (600 x 1070 x 2000 mm), their fronts to the middle aisle and their backs 30 cm off the
//    walls (the hot aisle): 1U and 2U servers with their drive bays, storage shelves, GPU servers, switches and patch
//    panels with their cables - every drive's and port's LED live; an in-row cooler in each row; a UPS with its lithium
//    battery cabinet (and a diesel generator behind the wall: when the commune's power is cut the UPS holds the load for
//    the ~9 s the generator takes to start, the lights drop to the emergency ones meanwhile); ladder cable trays over the
//    racks, the cables in them (blue copper, yellow fibre);
//  * a gas fire-suppression system (two inert-gas cylinders, the nozzles in the ceiling);
//  * the console at the far end: a three-part desk, three monitors (the system: system.js), and over it a video wall of
//    eight 49" screens showing the cameras live (cctv.js), with their names and the time;
//  * a situation table in the middle of the aisle: the commune's map on a screen laid flat.
// The room, its name and the system are invented. Measures as real ones go (racks, tiles, screens, the UPS's minutes).
//
// Its light is its own (the shaft's sky aside): the LED lines over the aisle and the console (they come on as you come
// down), the screens, the racks' LEDs, the emergency lights and an amber beacon while the UPS carries the load. The sky
// comes in only down the shaft, as much as its opening is seen from each point (its form factor); the sun only where it
// shines straight down it. The street lamps and the sky's light map are kept out.

// ---------------------------------------------------------------- dimensions (m; local frame: the hatch's centre on
// the ground at 0, +z into the post, y up from the ground at the hatch)
const SH = { x: 0.5, z: 0.5 };                  // the shaft's inside: half width (x) and half depth (z) - 1.00 x 1.00 m
const SAS = { x0: -0.8, x1: 0.8, z0: -SH.z, z1: 1.65, h: 2.4 };   // (the airlock, beside the shaft's foot)
const WALL = 0.4;                               // (the door wall)
const ROOM = { x0: -3.4, x1: 3.4, z0: SAS.z1 + WALL, z1: SAS.z1 + WALL + 7.0, h: 2.9 };
const DOOR = { w: 0.9, h: 2.0 };
const RUNG = 0.28;
const RACK = { w: 0.6, d: 1.07, h: 2.0 };
const FRONT = ROOM.x1 - 0.3 - RACK.d;           // (the racks' fronts, either side of the aisle: |x| = 2.03)
const ROW_Z0 = ROOM.z0 + 0.9;
// the rows, from the door: racks (their fitting-out: LAYOUT), the in-row coolers (300 mm), the UPS and its batteries
const ROWS = [
  { side: -1, tag: 'A', units: ['c1', 'c2', 'n1', 'cool', 's1', 'g1', 'c1'] },
  { side: 1, tag: 'B', units: ['ups', 'bat', 'c2', 'cool', 'n1', 's1', 'c1'] },
];
const UW = (u) => (u === 'cool' ? 0.3 : 0.6);
const ROW_END = ROW_Z0 + ROWS[0].units.reduce((a, u) => a + UW(u), 0);
const DESK = { z: ROOM.z1 - 1.25, h: 0.74, d: 0.75 };                 // (the console's centre line, its top, its depth)
const TABLE = { z: ROOM.z0 + 3.0, w: 1.6, d: 1.0, h: 0.95 };          // (the situation table)
const VW = { cols: 4, rows: 2, w: 1.076, h: 0.608, y0: 1.42 };        // (the video wall: 49" screens, 1.8 mm bezels)
// what main.js needs to place it: the ground it spans (for the earth over it) and its height
export const FOOT = { x0: ROOM.x0 - 0.4, x1: ROOM.x1 + 0.4, z0: SAS.z0 - 0.4, z1: ROOM.z1 + 0.4, h: ROOM.h };
export const BK_LAYER = 5;                      // (the interior cameras see only the post: cctv.js)
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

// architectural concrete (the shaft, the airlock): cast against film-faced panels (1.2 x 2.4 m: their joints faint),
// the form ties' holes plugged every 60 cm, a few blowholes, a light mottling - sealed, clean
function concTex(seed) {
  const WM = 2.4, HM = 2.4;
  return bake(512, 512, WM, HM, (u, v, o) => {
    let c = 0.6 + 0.06 * (fbm(u, v, WM, HM, 1.3, seed, 5) - 0.5) + 0.018 * (vn(u * 70, v * 70, seed + 2, 168, 168) - 0.5);
    let h = 0.00015 * (vn(u * 60, v * 60, seed + 4, 144, 144) - 0.5);
    if (pm(u, 1.2) < 0.004 || pm(v, 2.4) < 0.004) { c -= 0.035; h += 0.0005; }
    const tu = pm(u - 0.3, 0.6) - 0.3, tv = pm(v - 0.3, 0.6) - 0.3, tr = Math.hypot(tu, tv);
    if (tr < 0.013) { c = c * 0.62 + 0.03; h -= tr < 0.01 ? 0.003 : 0.0006; }
    const pore = vn(u * 150, v * 150, seed + 9, 360, 360);
    if (pore > 0.9) { c -= 0.12 * (pore - 0.9) / 0.1; h -= 0.0015 * (pore - 0.9) / 0.1; }
    o[0] = c; o[1] = c * 0.995; o[2] = c * 0.98; o[3] = h;
  }, 1.2);
}
// the room's walls: painted (a light grey, eggshell), the roller's fine stipple, a hint of the blockwork under it
function paintTex(seed) {
  const WM = 2.4, HM = 2.4;
  return bake(256, 256, WM, HM, (u, v, o) => {
    const n = fbm(u, v, WM, HM, 1.1, seed, 4), f = vn(u * 110, v * 110, seed + 3, 264, 264);
    let c = 0.79 + 0.022 * (n - 0.5) + 0.01 * (f - 0.5), h = 0.00012 * (f - 0.5);
    if (pm(v, 0.2) < 0.004 || pm(u + (Math.floor(v / 0.2) % 2) * 0.2, 0.4) < 0.004) { c -= 0.006; h -= 0.00008; }   // (the blocks, barely)
    o[0] = c * 0.985; o[1] = c; o[2] = c * 0.99; o[3] = h;
  }, 1.0);
}
// the raised floor's tiles: 600 x 600 mm, a speckled anti-static vinyl face, the dark edge trims; the perforated ones
// (holes ~13 mm on a 25 mm grid: ~22% open) in front of the racks
function tileTex(seed, perf) {
  const WM = 1.2, HM = 1.2, N = perf ? 768 : 384;
  return bake(N, N, WM, HM, (u, v, o) => {
    const tu = pm(u, 0.6), tv = pm(v, 0.6), ti = Math.floor(u / 0.6), tj = Math.floor(v / 0.6);
    const edge = Math.min(tu, tv, 0.6 - tu, 0.6 - tv);
    let c = 0.72 + 0.025 * (hash(ti, tj, seed) - 0.5) + 0.02 * (fbm(u, v, WM, HM, 3, seed + 1, 3) - 0.5);
    const sp = vn(u * 420, v * 420, seed + 5, 504, 504);
    if (sp > 0.8) c -= 0.1 * (sp - 0.8) / 0.2; else if (sp < 0.15) c += 0.05 * (0.15 - sp) / 0.15;
    let h = 0;
    if (edge < 0.0035) { c = 0.2; h = -0.0008; }
    if (perf && edge > 0.03) {
      const hu = pm(u, 0.025) - 0.0125, hv = pm(v, 0.025) - 0.0125, r = Math.hypot(hu, hv);
      if (r < 0.0066) { c = 0.035; h = -0.004; } else if (r < 0.0078) { c -= 0.05; h = -0.0006; }
    }
    o[0] = c * 0.99; o[1] = c; o[2] = c * 1.01; o[3] = h;
  }, 1.0);
}
// the airlock's floor: power-floated concrete, sealed (a soft sheen, a darker mottling)
function polishTex(seed) {
  const WM = 2, HM = 2;
  return bake(256, 256, WM, HM, (u, v, o) => {
    const c = 0.47 + 0.07 * (fbm(u, v, WM, HM, 1.2, seed, 5) - 0.5) + 0.02 * (vn(u * 90, v * 90, seed + 2, 180, 180) - 0.5);
    o[0] = c; o[1] = c * 0.99; o[2] = c * 0.97; o[3] = 0.0001 * (vn(u * 40, v * 40, seed + 3, 80, 80) - 0.5);
  }, 1.0);
}
// painted steel: chipped to grey primer and to rust at the edges and where hands and feet go (wear: 1 out in the
// weather; less indoors)
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
// printed things: a sign, a label, a screen's picture (canvas)
function paperTex(W, H, draw) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  draw(c.getContext('2d'), W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

// ---- the racks' fronts: what is in each (from the top, in U of 44.45 mm), drawn at 320 px a metre; the LEDs that blink
// (drives, ports: the ones lit by the racks' InstancedMesh) given back with their places, the steady ones in the glow map
const LAYOUT = {
  c1: [['patch', 1], ['mgr', 1], ['switch', 1], ['mgr', 1], ['blank', 1], ...Array(12).fill(['s1u', 1]), ['blank', 2], ...Array(9).fill(['s2u', 2]), ['blank', 5]],
  c2: [['patch', 1], ['mgr', 1], ['switch', 1], ['mgr', 1], ...Array(10).fill(['s2u', 2]), ['blank', 1], ...Array(8).fill(['s1u', 1]), ['blank', 9]],
  n1: [...[0, 1, 2, 3, 4, 5].flatMap(() => [['patch', 1], ['mgr', 1], ['switch', 1], ['mgr', 1]]), ['blank', 2], ['router', 4], ['router', 4], ['blank', 8]],
  s1: [['switch', 1], ['mgr', 1], ...Array(8).fill(['jbod', 4]), ['s2u', 2], ['s2u', 2], ['blank', 4]],
  g1: [['switch', 1], ['mgr', 1], ...Array(8).fill(['gpu', 4]), ['blank', 8]],
};
const CABLE = ['#2a63d6', '#2a63d6', '#2a63d6', '#e1c21c', '#9aa0a6', '#d14b3b', '#3cae5a', '#22b8c8'];
function rackFace(kind, seed) {
  const W = 192, H = 640, PX = W / RACK.w, U = 0.04445 * PX, TOP = (RACK.h - 42 * 0.04445) / 2 * PX;
  const X0 = Math.round((W - 0.4826 * PX) / 2), X1 = W - X0, IW = X1 - X0;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = W; e.height = H; const ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  let s = seed * 7919 + 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#0a0b0d'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1b1d21'; g.fillRect(0, 0, W, TOP); g.fillRect(0, H - TOP, W, TOP);
  g.fillStyle = '#23262b'; g.fillRect(X0 - 7, 0, 7, H); g.fillRect(X1, 0, 7, H);
  g.fillStyle = '#050506';
  for (let u = 0; u < 42; u++) for (const k of [0.2, 0.5, 0.8]) { const y = TOP + (u + k) * U; g.fillRect(X0 - 5, y - 1, 3, 2); g.fillRect(X1 + 2, y - 1, 3, 2); }
  const leds = [];
  const glow = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); ge.fillStyle = col; ge.fillRect(x, y, w, h); };
  const led = (x, y, col, mode = 'act') => { leds.push({ x, y, col, mode, ph: rnd() * 100, rate: 0.5 + rnd() * 2.5 }); g.fillStyle = '#101210'; g.fillRect(x - 1, y - 1, 2, 2); };
  const body = (y, h, a, b) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(X0, y + 0.5, IW, h - 1); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(X0, y + 0.5, IW, 1); };
  const draw = {
    s1u(y, h) {
      body(y, h, '#343840', '#262a30');
      const bw = IW * 0.56 / 8;
      for (let k = 0; k < 8; k++) { const x = X0 + 3 + k * bw; g.fillStyle = '#16181b'; g.fillRect(x, y + 2, bw - 1.5, h - 4); g.fillStyle = '#41464e'; g.fillRect(x + 1, y + 3, 1, h - 6); led(x + bw - 3.5, y + h - 3.5, 'g'); }
      g.fillStyle = '#1d2025'; for (let k = 0; k < 5; k++) g.fillRect(X0 + IW * 0.6, y + 3 + k * 2, IW * 0.28, 1);
      glow(X1 - 9, y + 4, 2, 2, '#3d7dff'); glow(X1 - 5, y + 4, 2, 2, rnd() < 0.15 ? '#ffb020' : '#30ff70');
      g.fillStyle = '#c6c9cd'; g.fillRect(X1 - 14, y + h - 5, 8, 2);
    },
    s2u(y, h) {
      body(y, h, '#30343b', '#23262c');
      const tw = IW * 0.8 / 4, th = (h - 4) / 3;
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
        const x = X0 + 3 + k * tw, yy = y + 2 + r * th;
        g.fillStyle = '#3c4149'; g.fillRect(x, yy, tw - 1.5, th - 1); g.fillStyle = '#22262b'; g.fillRect(x + 2, yy + th * 0.35, tw - 9, th * 0.3);
        led(x + tw - 4.5, yy + th / 2, rnd() < 0.85 ? 'g' : 'b');
      }
      glow(X1 - 10, y + 5, 3, 3, '#3d7dff'); glow(X1 - 10, y + 11, 3, 2, '#30ff70');
    },
    switch(y, h) {
      body(y, h, '#22262b', '#1a1d21');
      for (let k = 0; k < 24; k++) for (let r = 0; r < 2; r++) {
        const x = X0 + 5 + k * 4.6 + Math.floor(k / 6) * 2, yy = y + 3 + r * 5.5;
        g.fillStyle = '#030303'; g.fillRect(x, yy, 3.8, 4);
        if (rnd() < 0.8) { g.fillStyle = CABLE[Math.floor(rnd() * CABLE.length)]; g.fillRect(x + 0.4, yy + 0.6, 3, 3); if (rnd() < 0.5) led(x + 1.9, yy + (r ? 4.6 : -0.6), rnd() < 0.8 ? 'g' : 'a'); else glow(x + 1.4, yy + (r ? 4.3 : -0.9), 1, 1, '#2bd05a'); }
      }
      for (let k = 0; k < 4; k++) { const x = X1 - 30 + k * 6; g.fillStyle = '#0c0c0c'; g.fillRect(x, y + 4, 5, 5); g.fillStyle = '#22b8c8'; g.fillRect(x + 1, y + 5, 3, 3); led(x + 2.5, y + 11, 'g'); }
      glow(X1 - 6, y + 3, 2, 2, '#30ff70');
    },
    patch(y, h) {
      body(y, h, '#16181b', '#111316');
      for (let k = 0; k < 24; k++) {
        const x = X0 + 6 + k * 5.9 + Math.floor(k / 6) * 1.6;
        g.fillStyle = '#020202'; g.fillRect(x, y + 4, 4.4, 5.5);
        if (rnd() < 0.85) { g.fillStyle = CABLE[Math.floor(rnd() * CABLE.length)]; g.fillRect(x + 0.5, y + 4.5, 3.4, 4.4); }
        g.fillStyle = '#d8dadd'; g.fillRect(x + 1, y + 11, 2.4, 1.2);
      }
    },
    mgr(y, h) {
      g.fillStyle = '#0b0c0e'; g.fillRect(X0, y + 0.5, IW, h - 1);
      for (let k = 0; k < 22; k++) {
        const x = X0 + 4 + rnd() * (IW - 8), side = x < W / 2 ? X0 - 2 : X1 + 2, yy = y + 2 + rnd() * (h - 4);
        g.strokeStyle = CABLE[Math.floor(rnd() * CABLE.length)]; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x, yy, side, yy + 1); g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X0, y + h * 0.45, IW, 1.5);
    },
    router(y, h) {
      body(y, h, '#2a2e34', '#1f2226');
      for (let r = 0; r < 3; r++) {
        const yy = y + 3 + r * (h - 10) / 3; g.fillStyle = '#16181b'; g.fillRect(X0 + 4, yy, IW - 8, (h - 10) / 3 - 2);
        for (let k = 0; k < 12; k++) { const x = X0 + 8 + k * 11; g.fillStyle = '#050505'; g.fillRect(x, yy + 4, 7, 6); if (rnd() < 0.7) { g.fillStyle = rnd() < 0.5 ? '#e1c21c' : '#22b8c8'; g.fillRect(x + 2, yy + 5, 3, 4); led(x + 3.5, yy + 12, 'g'); } }
      }
      g.fillStyle = '#0d0e10'; for (let k = 0; k < 30; k++) g.fillRect(X0 + 6 + k * 5, y + h - 6, 3, 4);
      glow(X1 - 8, y + 4, 3, 3, '#30ff70');
    },
    jbod(y, h) {
      body(y, h, '#2c3036', '#202328');
      const tw = (IW - 6) / 12, th = (h - 6) / 2;
      for (let r = 0; r < 2; r++) for (let k = 0; k < 12; k++) {
        const x = X0 + 3 + k * tw, yy = y + 3 + r * th;
        g.fillStyle = '#3a3f47'; g.fillRect(x, yy, tw - 1.2, th - 1.2); g.fillStyle = '#1b1e22'; g.fillRect(x + 2, yy + 5, tw - 5, th - 9);
        led(x + tw / 2, yy + 2.5, rnd() < 0.9 ? 'g' : 'b');
      }
    },
    gpu(y, h) {
      body(y, h, '#25292e', '#1b1e22');
      g.fillStyle = '#0c0d0f';
      for (let r = 0; r < Math.floor(h / 4.2); r++) for (let k = 0; k < 30; k++) { g.beginPath(); g.arc(X0 + 8 + k * 4.6 + (r % 2) * 2.3, y + 4 + r * 4, 1.6, 0, 7); g.fill(); }
      glow(X1 - 12, y + 5, 8, 2, '#30ff70'); led(X1 - 8, y + 10, 'g'); led(X1 - 8, y + 14, 'b');
    },
    blank(y, h) { g.fillStyle = '#141518'; g.fillRect(X0, y + 0.5, IW, h - 1); g.fillStyle = '#1c1e22'; for (let k = 0; k * U < h - 2; k++) g.fillRect(X0, y + k * U + U * 0.45, IW, 1); },
  };
  let u = 0;
  for (const [type, n] of LAYOUT[kind]) { draw[type](TOP + u * U, n * U); u += n; }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const emi = new THREE.CanvasTexture(e); emi.colorSpace = THREE.SRGBColorSpace;
  return { map, emi, leds: leds.map(l => ({ ...l, x: l.x / W, y: l.y / H })) };
}
// the fronts of the rest: the UPS, the battery cabinet, the in-row cooler (light grey sheet steel)
function panelFace(kind) {
  const W = kind === 'cool' ? 96 : 192, H = 640;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = W; e.height = H; const ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#bfc3c5'); gr.addColorStop(0.5, '#cdd1d3'); gr.addColorStop(1, '#bcc0c2');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = '#9fa4a7'; g.fillRect(0, 0, W, 3); g.fillRect(0, H - 22, W, 22); g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H);
  const glow = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); ge.fillStyle = col; ge.fillRect(x, y, w, h); };
  g.fillStyle = '#2a2d31'; g.font = `600 9px ${FONT}`;
  if (kind === 'cool') {
    for (let y = 120; y < H - 40; y += 6) for (let x = 10; x < W - 10; x += 6) { g.fillStyle = '#565b60'; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
    g.fillStyle = '#0d1014'; g.fillRect(18, 40, W - 36, 30); glow(22, 44, W - 44, 22, '#123a5a');
    glow(W / 2 - 3, 82, 6, 3, '#30ff70');
    g.fillStyle = '#2a2d31'; g.fillText('RĂCIRE', 22, 100);
  } else if (kind === 'ups') {
    g.fillStyle = '#0d1014'; g.fillRect(40, 70, 112, 54);
    for (let k = 0; k < 3; k++) glow(48 + k * 34, 140, 22, 4, ['#30ff70', '#3a2a10', '#2a0e0e'][k]);
    g.fillStyle = '#2a2d31'; g.font = `700 13px ${FONT}`; g.fillText('UPS · 60 kVA', 44, 56); g.font = `9px ${FONT}`; g.fillText('3 × 400 V · online dublă conversie', 30, 168);
    for (let y = 420; y < H - 40; y += 7) { g.fillStyle = '#8f9497'; g.fillRect(24, y, W - 48, 3); }
    g.fillStyle = '#3c4045'; g.fillRect(W - 40, 250, 6, 70);
  } else {
    g.fillStyle = '#2a2d31'; g.font = `700 13px ${FONT}`; g.fillText('BATERII Li-ion', 40, 56); g.font = `9px ${FONT}`; g.fillText('512 V c.c. · 40 kWh', 54, 70);
    g.fillStyle = '#f2c200'; g.beginPath(); g.moveTo(96, 86); g.lineTo(122, 130); g.lineTo(70, 130); g.closePath(); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#111'; g.font = `900 26px ${FONT}`; g.fillText('!', 91, 126);
    g.fillStyle = '#0d1014'; g.fillRect(56, 150, 80, 34);
    for (let k = 0; k < 8; k++) for (let y = 220; y < H - 40; y += 8) { g.fillStyle = '#9a9fa2'; g.fillRect(20 + k * 20, y, 12, 3); }
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const emi = new THREE.CanvasTexture(e); emi.colorSpace = THREE.SRGBColorSpace;
  return { map, emi };
}

// ---------------------------------------------------------------- the light model of the post's materials
// (three's standard shading, the sky's share scaled by how much of the shaft's opening a point sees, the street lamps'
// loop and the sky light map left out, the post's own lamps added: points along each LED line, the screens' glow)
const NL = 12;
export const BK = {
  uL: { value: Array.from({ length: NL }, () => new THREE.Vector4()) },    // world position, strength (0: off)
  uC: { value: Array.from({ length: NL }, () => new THREE.Color()) },
  uAmb: { value: new THREE.Color(0, 0, 0) },                               // (what the lamps' light bounces round the rooms)
  uSky: { value: new THREE.Vector4(0, 0, 0, 0) },                          // the shaft's opening (world centre), how far open
  uInv: { value: new THREE.Matrix4() },                                    // world -> the post's frame
};
const BK_PARS = /* glsl */`
uniform vec4 bkL[${NL}];
uniform vec3 bkC[${NL}];
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
  for (int i = 0; i < ${NL}; i++) {
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
  m.customProgramCacheKey = () => 'bunker-v2';
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
  // a flat picture w x h, its UVs 0-1, turned about y (ry) then x (rx), at (x, y, z)
  plane(w, h, x, y, z, ry = 0, rx = 0) { const g = new THREE.PlaneGeometry(w, h); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; },
  // a box turned about y round its own centre
  turned(x0, x1, y0, y1, z0, z1, ry, cx, cz) { return G.solid(x0, x1, y0, y1, z0, z1).map(g => { g.translate(-cx, 0, -cz); g.rotateY(ry); g.translate(cx, 0, cz); return g; }); },
};
const merge = (list) => mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)).map(g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
const canvasTex = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { canvas: c, g: c.getContext('2d'), tex: t, w, h, t: 9 }; };

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
    this.door = 1; this.doorTo = 1;                       // (the steel door: open)
    this.lights = true; this.lightK = 0; this.lightT = 0; // (the LED lines: on as you come down - E on the panel turns them off)
    this.mains = true;                                    // (the commune's power: main.js)
    this.source = 'retea'; this.srcT = 0;                 // (what feeds the post: the mains, the UPS, the generator)
    this.ups = 100; this.fuel = 97;                       // (the UPS's charge and the generator's tank, %)
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
  // a camera's yaw and pitch looking from local a to local b (three's: a camera looks down its -z)
  aim(a, b) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot), dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const wx = c * dx + s * dz, wz = -s * dx + c * dz;
    return { yaw: Math.atan2(-wx, -wz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }
  // the post's own cameras (the room, the airlock): world places for cctv.js
  cams() {
    const yF = -this.depth, R = ROOM;
    const at = (name, ip, a, b, fov) => { const w = this.toW(a[0], a[1], a[2]); return { name, ip, x: w.x, y: w.y, z: w.z, ...this.aim(a, b), fov, inside: true }; };
    return [
      at('Postul 7 · sala serverelor', '10.7.0.21', [R.x1 - 0.18, yF + 2.65, R.z0 + 0.18], [-0.9, yF + 1.0, R.z1 - 1.6], 88),
      at('Postul 7 · consola', '10.7.0.22', [R.x0 + 0.2, yF + 2.65, R.z1 - 0.2], [0.6, yF + 0.9, R.z1 - 2.4], 84),
      at('Postul 7 · sas', '10.7.0.23', [SAS.x1 - 0.12, yF + 2.25, SAS.z1 - 0.12], [-0.1, yF + 0.9, SAS.z0 + 0.2], 92),
    ];
  }

  // the hatch, its frame and the shaft (always built: they show from the meadow)
  hatchMesh() {
    // (out in the open: the scene's own light, the rain's wet; below, the post's light model: bkMat)
    const conc = new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.9 });
    const sTex = steelTex(5, [0.2, 0.21, 0.22], 0.35).map;
    const steel = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.55, map: sTex });
    this.steelM = bkMat({ color: 0xffffff, roughness: 0.45, metalness: 0.5, map: steelTex(6, [0.2, 0.21, 0.22], 0.1).map });   // (indoors)
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
    this.tex = { conc: concTex(11), paint: paintTex(13), tile: tileTex(17, false), perf: tileTex(19, true), polish: polishTex(23) };
    this.rooms = new THREE.Group(); this.group.add(this.rooms);
    this.galvM = bkMat({ color: 0x9aa0a6, roughness: 0.45, metalness: 0.75 });
    const T = this.tex, yF = -this.depth, yS = yF + SAS.h, yR = yF + ROOM.h;
    // (the walls' patterns start at the floor's height)
    const atFloor = (t, rep) => { for (const m of [t.map, t.nmap]) { m.repeat.set(1 / rep, 1 / rep); m.offset.set(0, pm(-yF / rep, 1)); } };
    atFloor(T.conc, 2.4); atFloor(T.paint, 2.4);
    for (const t of [T.polish]) for (const m of [t.map, t.nmap]) m.repeat.set(0.5, 0.5);
    // (the tiles' grid on the room's: its joints at x = +-0.3 + 0.6 k, z = z0 + 0.6 k)
    for (const t of [T.tile, T.perf]) for (const m of [t.map, t.nmap]) { m.repeat.set(1 / 1.2, 1 / 1.2); m.offset.set(pm(-0.3 / 1.2, 1), pm(ROOM.z0 / 1.2, 1)); }
    // the shaft: its walls (inside faces) down to the airlock's ceiling; a galvanised ladder on its near wall; an LED
    // strip down its corner; the cables up to the surface (power, a fibre)
    const concM = this.concM = bkMat({ color: 0xffffff, map: T.conc.map, normalMap: T.conc.nmap, roughness: 0.82 });
    const add = (geos, m, cast = true) => { const o = new THREE.Mesh(merge(geos), m); o.castShadow = cast; o.receiveShadow = true; this.rooms.add(o); return o; };
    add(G.box(-SH.x, SH.x, yS - 0.02, 0.03, -SH.z, SH.z, 'pxnxpznz', true), concM);   // (2 cm past its edges: no crack)
    const ladder = [], ladOut = [];
    const lz = -SH.z + 0.17, top = 0.9, bot = yF;
    for (const sx of [-0.22, 0.22]) {
      ladder.push(...G.solid(sx - 0.03, sx + 0.03, bot, 0.03, lz - 0.006, lz + 0.006));
      ladOut.push(...G.solid(sx - 0.03, sx + 0.03, 0.03, top, lz - 0.006, lz + 0.006));
      for (let y = bot + 0.3; y < 0.05; y += 0.75) ladder.push(...G.solid(sx - 0.02, sx + 0.02, y, y + 0.04, -SH.z, lz));
    }
    for (let y = bot + RUNG; y < 0.02; y += RUNG) ladder.push(G.cyl(0.013, 0.44, 0, y, lz, 'x', 8));
    add(ladder, this.galvM);
    const lo = new THREE.Mesh(merge(ladOut), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.45, metalness: 0.75 }));
    lo.castShadow = lo.receiveShadow = true; this.rooms.add(lo);
    add([G.cyl(0.007, -bot + 0.02, SH.x - 0.05, (bot + 0.02) / 2, SH.z - 0.06), G.cyl(0.01, -bot + 0.02, SH.x - 0.08, (bot + 0.02) / 2, SH.z - 0.05)], bkMat({ color: 0x111214, roughness: 0.6 }), false);
    add([G.cyl(0.004, -bot + 0.02, SH.x - 0.11, (bot + 0.02) / 2, SH.z - 0.05)], bkMat({ color: 0xe1c21c, roughness: 0.5 }), false);
    this.stripM = bkMat({ color: 0xffffff, emissive: 0xfff4e8, emissiveIntensity: 0, roughness: 0.4 });
    add(G.solid(-SH.x + 0.005, -SH.x + 0.02, yS, -0.15, SH.z - 0.03, SH.z - 0.005), this.stripM, false);
    // the airlock: architectural concrete; its far wall with the doorway; a sealed, power-floated floor
    const e = 0.02;
    const sasW = [...G.box(SAS.x0, SAS.x1, yF - e, yS + e, SAS.z0, SAS.z1, 'pxnxnz', true)];
    sasW.push(...G.box(SAS.x0 - e, -DOOR.w / 2, yF - e, yS + e, SAS.z1, SAS.z1 + 0.001, 'nz'), ...G.box(DOOR.w / 2, SAS.x1 + e, yF - e, yS + e, SAS.z1, SAS.z1 + 0.001, 'nz'), ...G.box(-DOOR.w / 2 - e, DOOR.w / 2 + e, yF + DOOR.h, yS + e, SAS.z1, SAS.z1 + 0.001, 'nz'));
    sasW.push(...G.box(-DOOR.w / 2, DOOR.w / 2, yF - e, yF + DOOR.h, SAS.z1 - 0.002, ROOM.z0 + 0.002, 'pxnxpy', true));   // (the reveals through the 40 cm wall)
    add(sasW, concM);
    add([...G.box(SAS.x0 - e, SAS.x1 + e, yS - 0.001, yS, SH.z, SAS.z1 + e, 'ny'), ...G.box(SAS.x0 - e, -SH.x, yS - 0.001, yS, -SH.z - e, SH.z, 'ny'), ...G.box(SH.x, SAS.x1 + e, yS - 0.001, yS, -SH.z - e, SH.z, 'ny'),
      ...G.box(SAS.x0, SAS.x1, yS, yS + 0.3, SH.z, SAS.z1, 'py'), ...G.box(SAS.x0, -SH.x, yS, yS + 0.3, SAS.z0, SH.z, 'py'), ...G.box(SH.x, SAS.x1, yS, yS + 0.3, SAS.z0, SH.z, 'py')], concM);
    add([...G.box(SAS.x0 - e, SAS.x1 + e, yF, yF + 0.001, SAS.z0 - e, SAS.z1, 'py'), ...G.box(-DOOR.w / 2 - e, DOOR.w / 2 + e, yF, yF + 0.001, SAS.z1, ROOM.z0, 'py')], bkMat({ color: 0xffffff, map: T.polish.map, normalMap: T.polish.nmap, roughness: 0.38 }), false);
    // the room: painted walls (the far one, behind the video wall, in dark acoustic panels), a black ceiling, the tiles
    const paintM = bkMat({ color: 0xffffff, map: T.paint.map, normalMap: T.paint.nmap, roughness: 0.75 });
    const roomW = G.box(ROOM.x0, ROOM.x1, yF - e, yR + e, ROOM.z0, ROOM.z1, 'pxnx', true);
    roomW.push(...G.box(ROOM.x0 - e, -DOOR.w / 2, yF - e, yR + e, ROOM.z0 - 0.001, ROOM.z0, 'pz'), ...G.box(DOOR.w / 2, ROOM.x1 + e, yF - e, yR + e, ROOM.z0 - 0.001, ROOM.z0, 'pz'), ...G.box(-DOOR.w / 2 - e, DOOR.w / 2 + e, yF + DOOR.h, yR + e, ROOM.z0 - 0.001, ROOM.z0, 'pz'));
    add(roomW, paintM);
    const acoustic = paperTex(512, 256, (g, w, h) => {
      g.fillStyle = '#2b2e33'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#2f3237' : '#292c30'; g.fillRect(k * 64, 0, 63, h); g.fillStyle = '#1d1f23'; g.fillRect(k * 64 + 63, 0, 1, h); }
      for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
    });
    acoustic.wrapS = acoustic.wrapT = THREE.RepeatWrapping; acoustic.repeat.set(1 / 4.8, 1 / 2.4);
    add(G.box(ROOM.x0 - e, ROOM.x1 + e, yF - e, yR + e, ROOM.z1 - 0.001, ROOM.z1, 'nz'), bkMat({ color: 0xffffff, map: acoustic, roughness: 0.95 }));
    add([...G.box(ROOM.x0 - e, ROOM.x1 + e, yR - 0.001, yR, ROOM.z0 - e, ROOM.z1 + e, 'ny'), ...G.box(ROOM.x0 - 0.3, ROOM.x1 + 0.3, yR, yR + 0.3, ROOM.z0 - 0.3, ROOM.z1 + 0.3, 'py')], bkMat({ color: 0x141518, roughness: 0.92 }));
    add(G.box(ROOM.x0 - e, ROOM.x1 + e, yF, yF + 0.001, ROOM.z0 - e, ROOM.z1 + e, 'py'), bkMat({ color: 0xffffff, map: T.tile.map, normalMap: T.tile.nmap, roughness: 0.55 }), false);
    // the skirting: dark grey, 10 cm
    add([...G.solid(ROOM.x0, ROOM.x0 + 0.012, yF, yF + 0.1, ROOM.z0, ROOM.z1), ...G.solid(ROOM.x1 - 0.012, ROOM.x1, yF, yF + 0.1, ROOM.z0, ROOM.z1), ...G.solid(ROOM.x0, -DOOR.w / 2, yF, yF + 0.1, ROOM.z0, ROOM.z0 + 0.012), ...G.solid(DOOR.w / 2, ROOM.x1, yF, yF + 0.1, ROOM.z0, ROOM.z0 + 0.012)], bkMat({ color: 0x3a3d42, roughness: 0.7 }), false);
    this.props(yF, yR);
    this.colliders(yF, yR);
    this.sounds();
    // (the interior cameras see the post alone: cctv.js renders its layer)
    this.rooms.traverse(o => o.layers.enable(BK_LAYER));
  }

  // the things in it
  props(yF, yR) {
    const T = this.tex, R = ROOM, yS = yF + SAS.h;
    const add = (geos, m, cast = true) => { const o = new THREE.Mesh(merge(geos), m); o.castShadow = cast; o.receiveShadow = true; this.rooms.add(o); return o; };
    const black = bkMat({ color: 0x15171a, roughness: 0.5, metalness: 0.35 });
    const greyM = bkMat({ color: 0xc9cdcf, roughness: 0.55, metalness: 0.2 });
    const alu = bkMat({ color: 0xa8adb3, roughness: 0.35, metalness: 0.8 });
    const red = bkMat({ color: 0xb01a14, roughness: 0.4, metalness: 0.3 });
    // ---- the perforated tiles in front of the racks (the cold aisle)
    const perfG = [];
    for (const sd of [-1, 1]) { const xa = sd * 1.5, xb = sd * 2.1; perfG.push(...G.box(Math.min(xa, xb), Math.max(xa, xb), yF + 0.0015, yF + 0.0016, ROW_Z0 - 0.15, ROW_END + 0.33, 'py')); }
    add(perfG, bkMat({ color: 0xffffff, map: T.perf.map, normalMap: T.perf.nmap, roughness: 0.5 }), false);
    // ---- the steel door: 90 x 200 cm, 14 cm thick, painted dark grey, two lever handles, its gasket; opened into the
    // airlock; a card reader beside it, its status light over it
    const door = this.doorG = new THREE.Group();
    const dM = bkMat({ color: 0x3a4045, roughness: 0.42, metalness: 0.45 });
    const dg = [...G.solid(0, DOOR.w, 0, DOOR.h, -0.14, 0)];
    for (let k = 0; k < 4; k++) dg.push(...G.solid(0.06, DOOR.w - 0.06, 0.12 + k * 0.48, 0.13 + k * 0.48, -0.146, -0.14));
    door.add(Object.assign(new THREE.Mesh(merge(dg), dM), { castShadow: true, receiveShadow: true }));
    const hd = [];
    for (const y of [0.55, 1.45]) for (const zz of [-0.14, 0]) { const sg = zz < 0 ? -1 : 1; hd.push(G.cyl(0.03, 0.05, DOOR.w - 0.11, y, zz + sg * 0.025, 'z', 16), ...G.solid(DOOR.w - 0.34, DOOR.w - 0.1, y - 0.016, y + 0.016, zz + sg * 0.05 - 0.016, zz + sg * 0.05 + 0.016)); }
    for (const y of [0.25, DOOR.h - 0.25]) hd.push(G.cyl(0.045, 0.24, -0.02, y, -0.07));
    door.add(Object.assign(new THREE.Mesh(merge(hd), alu), { castShadow: true }));
    door.add(Object.assign(new THREE.Mesh(merge(G.solid(0.02, DOOR.w - 0.02, 0.02, DOOR.h - 0.02, 0, 0.012)), bkMat({ color: 0x0d0d0e, roughness: 0.9 })), { receiveShadow: true }));
    door.position.set(-DOOR.w / 2, yF, SAS.z1); this.rooms.add(door);
    add([...G.solid(-DOOR.w / 2 - 0.06, -DOOR.w / 2, yF, yF + DOOR.h + 0.06, SAS.z1 - 0.03, SAS.z1), ...G.solid(DOOR.w / 2, DOOR.w / 2 + 0.06, yF, yF + DOOR.h + 0.06, SAS.z1 - 0.03, SAS.z1), ...G.solid(-DOOR.w / 2 - 0.06, DOOR.w / 2 + 0.06, yF + DOOR.h, yF + DOOR.h + 0.06, SAS.z1 - 0.03, SAS.z1)], alu);
    add(G.solid(DOOR.w / 2 + 0.14, DOOR.w / 2 + 0.22, yF + 1.12, yF + 1.26, SAS.z1 - 0.025, SAS.z1), black);
    this.statusM = bkMat({ color: 0x0a200e, emissive: 0x30ff70, emissiveIntensity: 2, roughness: 0.3 });
    add([...G.solid(DOOR.w / 2 + 0.165, DOOR.w / 2 + 0.195, yF + 1.22, yF + 1.235, SAS.z1 - 0.03, SAS.z1 - 0.024), ...G.solid(-0.06, 0.06, yF + DOOR.h + 0.1, yF + DOOR.h + 0.13, ROOM.z0, ROOM.z0 + 0.02)], this.statusM, false);
    // ---- the lights: LED lines over the aisle (two runs of three 1.5 m fittings), one across over the console, a round
    // fitting in the airlock; their diffusers glow (emissive), their light is the BK points (update)
    this.lineM = bkMat({ color: 0xffffff, emissive: 0xfff6ec, emissiveIntensity: 0, roughness: 0.3 });
    const housing = [], diff = [];
    const ly = yR - 0.32;                                         // (hung 32 cm down, under the cable trays' level)
    for (const sx of [-1.05, 1.05]) { housing.push(...G.solid(sx - 0.035, sx + 0.035, ly, ly + 0.06, ROW_Z0 - 0.2, ROW_Z0 + 4.3)); diff.push(...G.solid(sx - 0.028, sx + 0.028, ly - 0.004, ly, ROW_Z0 - 0.19, ROW_Z0 + 4.29)); for (const z of [ROW_Z0, ROW_Z0 + 2, ROW_Z0 + 4]) housing.push(G.cyl(0.0015, 0.26, sx, ly + 0.19, z, 'y', 4)); }
    housing.push(...G.solid(-1.3, 1.3, ly + 0.05, ly + 0.11, R.z1 - 2.05, R.z1 - 1.98)); diff.push(...G.solid(-1.29, 1.29, ly + 0.046, ly + 0.05, R.z1 - 2.045, R.z1 - 1.985));
    housing.push(G.cyl(0.16, 0.05, 0, yF + SAS.h - 0.025, 1.05, 'y', 24)); diff.push(G.cyl(0.14, 0.006, 0, yF + SAS.h - 0.053, 1.05, 'y', 24));
    add(housing, alu, false); add(diff, this.lineM, false);
    // the lights' panel by the door (room side)
    add(G.solid(-DOOR.w / 2 - 0.42, -DOOR.w / 2 - 0.26, yF + 1.2, yF + 1.32, R.z0, R.z0 + 0.012), black);
    this.panelM = bkMat({ color: 0x0b1420, emissive: 0x7ab8ff, emissiveIntensity: 0.6, roughness: 0.3 });
    add(G.solid(-DOOR.w / 2 - 0.41, -DOOR.w / 2 - 0.27, yF + 1.21, yF + 1.31, R.z0 + 0.012, R.z0 + 0.0125), this.panelM, false);
    this.switchAt = { x: -DOOR.w / 2 - 0.34, y: yF + 1.26, z: R.z0 + 0.02 };
    // the amber beacon over the door (the UPS carrying the load), the emergency lights' green sign over it
    this.beaconM = bkMat({ color: 0x3a2405, emissive: 0xffa21c, emissiveIntensity: 0, roughness: 0.35, transparent: true, opacity: 0.92 });
    add([G.cyl(0.05, 0.09, 0.55, yR - 0.08, R.z0 + 0.12, 'y', 18)], this.beaconM, false);
    const exitT = paperTex(256, 96, (g, w, h) => { g.fillStyle = '#0d8a3c'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `800 44px ${FONT}`; g.fillText('IEȘIRE', 66, 64); g.lineWidth = 7; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(34, 76); g.lineTo(34, 24); g.moveTo(18, 40); g.lineTo(34, 22); g.lineTo(50, 40); g.stroke(); });
    const exitM = bkMat({ color: 0x000000, emissive: 0xffffff, emissiveMap: exitT, emissiveIntensity: 1.4, roughness: 0.4 });
    add([G.plane(0.36, 0.135, 0, yF + DOOR.h + 0.3, R.z0 + 0.025), G.plane(0.36, 0.135, 0, yS - 0.2, SAS.z0 + 0.005)], exitM, false);
    // ---- the racks: their frames (black), their fronts (one material for each fitting-out), the LEDs
    const faces = {};
    for (const k of Object.keys(LAYOUT)) faces[k] = rackFace(k, k.charCodeAt(0) + k.charCodeAt(1) * 7);
    for (const k of ['ups', 'bat', 'cool']) faces[k] = panelFace(k);
    const frontG = {}, frame = [], greyBody = [], labels = [];
    const leds = [];
    for (const row of ROWS) {
      let z = ROW_Z0, n = 0;
      const sd = row.side, fx = sd * FRONT, bx = sd * (FRONT + RACK.d), x0 = Math.min(fx, bx), x1 = Math.max(fx, bx);
      for (const u of row.units) {
        const w = UW(u), rack = !!LAYOUT[u];
        // the body: a rack's black frame and doors' edges (its front open: the kit seen), a cabinet's grey steel
        (rack ? frame : greyBody).push(...G.box(x0, x1, yF, yF + RACK.h, z + 0.002, z + w - 0.002, sd > 0 ? 'pxpypznz' : 'nxpypznz'));
        if (rack) for (const zz of [z + 0.002, z + w - 0.022]) frame.push(...G.solid(fx - (sd > 0 ? 0.005 : -0.005) - 0.01, fx + 0.01, yF, yF + RACK.h, zz, zz + 0.02));
        // the front: 1 cm in from the frame (the racks), flush (the cabinets)
        const fxx = fx + sd * (rack ? 0.01 : 0.002);
        (frontG[u] ??= []).push(G.plane(w - (rack ? 0.04 : 0.004), RACK.h - 0.004, fxx, yF + RACK.h / 2, z + w / 2, sd > 0 ? -Math.PI / 2 : Math.PI / 2));
        if (rack) {
          n++;
          labels.push({ text: `${row.tag}${String(n).padStart(2, '0')}`, x: fx - sd * 0.006, y: yF + RACK.h - 0.035, z: z + w / 2, ry: sd > 0 ? -Math.PI / 2 : Math.PI / 2 });
          for (const l of faces[u].leds) {
            const along = sd > 0 ? l.x : 1 - l.x;
            leds.push({ x: fxx - sd * 0.0025, y: yF + RACK.h * (1 - l.y), z: z + 0.02 + along * (w - 0.04), col: l.col, ph: l.ph, rate: l.rate });
          }
        }
        z += w;
      }
      // the row's end panels (the side of the first and the last)
      greyBody.push(...G.solid(x0, x1, yF, yF + RACK.h, ROW_Z0 - 0.02, ROW_Z0), ...G.solid(x0, x1, yF, yF + RACK.h, z, z + 0.02));
    }
    add(frame, black);
    add(greyBody, greyM);
    for (const [u, list] of Object.entries(frontG)) add(list, bkMat({ color: 0xffffff, map: faces[u].map, emissive: 0xffffff, emissiveMap: faces[u].emi, emissiveIntensity: 1.6, roughness: 0.45, metalness: 0.25 }), false);
    // the racks' names: one atlas of labels (white on dark plates)
    const labT = paperTex(512, 64, (g, w, h) => { g.fillStyle = '#20242a'; g.fillRect(0, 0, w, h); labels.forEach((l, i) => { g.fillStyle = '#e9ecef'; g.font = `700 22px ${FONT}`; g.textAlign = 'center'; g.fillText(l.text, (i + 0.5) * w / labels.length, 42); }); });
    const labG = labels.map((l, i) => { const g = G.plane(0.16, 0.05, 0, 0, 0); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / labels.length); g.rotateY(l.ry); g.translate(l.x, l.y, l.z); return g; });
    add(labG, bkMat({ color: 0xffffff, map: labT, emissive: 0xffffff, emissiveMap: labT, emissiveIntensity: 0.25, roughness: 0.6 }), false);
    // the LEDs: one instanced mesh (their colours each frame: update)
    const ledM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.004, 0.003, 0.004), ledM, leds.length);
    const mm = new THREE.Matrix4();
    leds.forEach((l, i) => { mm.makeTranslation(l.x, l.y, l.z); this.leds.setMatrixAt(i, mm); this.leds.setColorAt(i, new THREE.Color(0, 0, 0)); });
    this.leds.frustumCulled = false;
    this.ledList = leds.map(l => ({ ...l, c: { g: [0.2, 1.0, 0.35], a: [1.0, 0.55, 0.08], b: [0.25, 0.5, 1.0] }[l.col] }));
    this.rooms.add(this.leds);
    // the UPS's screen and the batteries' (their own small canvases: update writes them)
    this.upsLcd = canvasTex(160, 80); this.batLcd = canvasTex(160, 70);
    const ups = ROWS[1], uz = ROW_Z0;
    add([G.plane(0.35, 0.168, FRONT - 0.003, yF + RACK.h * (1 - 97 / 640), uz + 0.3, -Math.PI / 2)], bkMat({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.upsLcd.tex, emissiveIntensity: 1.1, roughness: 0.2 }), false);
    add([G.plane(0.25, 0.106, FRONT - 0.003, yF + RACK.h * (1 - 167 / 640), uz + 0.9, -Math.PI / 2)], bkMat({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.batLcd.tex, emissiveIntensity: 1.1, roughness: 0.2 }), false);
    void ups;
    // ---- the cable trays: ladder trays over each row and across to the console, the cables in them, the drops
    const trayY = yF + 2.48, trays = [], cables = { blue: [], yellow: [], grey: [] };
    for (const sd of [-1, 1]) {
      const cx = sd * (FRONT + RACK.d / 2), za = ROW_Z0 - 0.3, zb = R.z1 - 0.9;
      for (const ox of [-0.15, 0.15]) trays.push(...G.solid(cx + ox - 0.002, cx + ox + 0.002, trayY, trayY + 0.06, za, zb));
      for (let z = za; z < zb; z += 0.3) trays.push(...G.solid(cx - 0.15, cx + 0.15, trayY, trayY + 0.012, z, z + 0.02));
      cables.blue.push(G.cyl(0.035, zb - za, cx - 0.06, trayY + 0.045, (za + zb) / 2, 'z', 10));
      cables.yellow.push(G.cyl(0.018, zb - za, cx + 0.07, trayY + 0.03, (za + zb) / 2, 'z', 8));
      cables.grey.push(G.cyl(0.022, zb - za, cx + 0.02, trayY + 0.035, (za + zb) / 2, 'z', 8));
      for (let z = ROW_Z0 + 0.3; z < ROW_END; z += 0.6) cables.blue.push(G.cyl(0.02, trayY - yF - RACK.h, cx - sd * 0.25, (trayY + yF + RACK.h) / 2, z, 'y', 8));
      for (const zz of [za, zb]) trays.push(...G.solid(cx - 0.005, cx + 0.005, trayY + 0.06, yR, zz, zz + 0.01));
    }
    const cz = R.z1 - 1.05;
    for (const oz of [-0.15, 0.15]) trays.push(...G.solid(-FRONT - RACK.d / 2, FRONT + RACK.d / 2, trayY, trayY + 0.06, cz + oz - 0.002, cz + oz + 0.002));
    for (let x = -FRONT; x < FRONT; x += 0.3) trays.push(...G.solid(x, x + 0.02, trayY, trayY + 0.012, cz - 0.15, cz + 0.15));
    cables.blue.push(G.cyl(0.03, 2 * FRONT, 0, trayY + 0.04, cz - 0.05, 'x', 10)); cables.yellow.push(G.cyl(0.016, 2 * FRONT, 0, trayY + 0.028, cz + 0.07, 'x', 8));
    cables.blue.push(G.cyl(0.03, trayY - yF, FRONT + 0.3, (trayY + yF) / 2, cz, 'y', 10));   // (down beside the video wall, under the floor to the desk)
    add(trays, bkMat({ color: 0x2a2d31, roughness: 0.5, metalness: 0.6 }), false);
    add(cables.blue, bkMat({ color: 0x2552c4, roughness: 0.55 }), false);
    add(cables.yellow, bkMat({ color: 0xd9b51a, roughness: 0.5 }), false);
    add(cables.grey, bkMat({ color: 0x8a8f96, roughness: 0.6 }), false);
    // ---- fire suppression: two inert-gas cylinders by the door (80 l, 300 bar), their manifold, the nozzles; the sign
    const fxs = R.x0 + 0.22;
    add([G.cyl(0.13, 1.45, fxs, yF + 0.725, R.z0 + 0.22, 'y', 20), G.cyl(0.13, 1.45, fxs, yF + 0.725, R.z0 + 0.52, 'y', 20)], red);
    add([G.cyl(0.03, 0.2, fxs, yF + 1.55, R.z0 + 0.22), G.cyl(0.03, 0.2, fxs, yF + 1.55, R.z0 + 0.52), G.cyl(0.018, 0.5, fxs, yF + 1.7, R.z0 + 0.37, 'z'), G.cyl(0.018, yR - yF - 1.7, fxs, (yR + yF + 1.7) / 2, R.z0 + 0.37),
      G.cyl(0.016, R.x1 - R.x0 - 0.5, (R.x0 + R.x1) / 2 + 0.03, yR - 0.06, R.z0 + 0.37, 'x'), G.cyl(0.016, R.z1 - R.z0 - 1.0, 0, yR - 0.06, (R.z0 + R.z1) / 2 + 0.3, 'z'),
      ...[R.z0 + 1.8, R.z0 + 4.2].map(z => G.cyl(0.03, 0.05, 0, yR - 0.1, z)), G.cyl(0.03, 0.05, -1.5, yR - 0.1, R.z0 + 0.37), G.cyl(0.03, 0.05, 1.5, yR - 0.1, R.z0 + 0.37)], alu, false);
    const gasT = paperTex(256, 160, (g, w, h) => { g.fillStyle = '#b01a14'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `800 30px ${FONT}`; g.fillText('STINGERE', 22, 46); g.fillText('CU GAZ', 22, 82); g.font = `600 18px ${FONT}`; g.fillText('IG-541 · nu intrați', 22, 116); g.fillText('când sună alarma', 22, 140); });
    add([G.plane(0.32, 0.2, R.x0 + 0.003, yF + 1.75, R.z0 + 0.85, Math.PI / 2)], bkMat({ color: 0xffffff, map: gasT, roughness: 0.6 }), false);
    // ---- the room's name over the door
    const nameT = paperTex(1024, 192, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#20242a'; g.font = `800 104px ${FONT}`; g.fillText('VEGHE', 20, 112); g.fillStyle = '#5b636c'; g.font = `500 38px ${FONT}`; g.fillText('POSTUL 7 · CENTRU DE OPERAȚIUNI', 24, 170); g.fillStyle = '#2f7cf6'; g.fillRect(400, 40, 14, 74); });
    add([G.plane(1.4, 0.26, 1.55, yF + 2.4, R.z0 + 0.004)], bkMat({ color: 0xffffff, map: nameT, transparent: true, roughness: 0.7 }), false);
    // ---- the situation table: a cabinet, a frame, a 65" screen laid flat (the map: system.js draws it), read the right
    // way up from the door
    const tz = TABLE.z, tw = TABLE.w / 2, td = TABLE.d / 2;
    add([...G.solid(-tw + 0.15, tw - 0.15, yF, yF + TABLE.h - 0.06, tz - td + 0.15, tz + td - 0.15)], black);
    add([...G.solid(-tw, tw, yF + TABLE.h - 0.06, yF + TABLE.h, tz - td, tz + td)], alu);
    this.table = canvasTex(768, 432);
    add([G.plane(TABLE.w - 0.1, TABLE.d - 0.1, 0, yF + TABLE.h + 0.001, tz, Math.PI, -Math.PI / 2)], bkMat({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.table.tex, emissiveIntensity: 1.0, roughness: 0.45 }), false);
    // ---- the console: a desk in three parts (the side ones turned in), three 27" monitors on their arms, keyboard and
    // mouse, the operator's chair
    const dz = DESK.z, dd = DESK.d / 2, dh = yF + DESK.h, topM = bkMat({ color: 0xd4d6d8, roughness: 0.6 }), deskB = bkMat({ color: 0x24272b, roughness: 0.55, metalness: 0.2 });
    const sideA = 0.42, cw = 0.95;
    const tops = [...G.solid(-cw, cw, dh - 0.035, dh, dz - dd, dz + dd)], bodies = [...G.solid(-cw + 0.02, cw - 0.02, yF, dh - 0.035, dz + dd - 0.06, dz + dd - 0.03), ...G.solid(-cw, -cw + 0.04, yF, dh - 0.035, dz - dd + 0.05, dz + dd - 0.03), ...G.solid(cw - 0.04, cw, yF, dh - 0.035, dz - dd + 0.05, dz + dd - 0.03)];
    for (const sd of [-1, 1]) {
      const px = sd * cw, ry = -sd * sideA, L = 0.95;
      const cx = px + sd * Math.cos(sideA) * L / 2, czz = dz - Math.sin(sideA) * L / 2;
      tops.push(...G.turned(cx - L / 2, cx + L / 2, dh - 0.035, dh, czz - dd, czz + dd, ry, cx, czz));
      bodies.push(...G.turned(cx - L / 2 + 0.02, cx + L / 2 - 0.02, yF, dh - 0.035, czz + dd - 0.06, czz + dd - 0.03, ry, cx, czz), ...G.turned(cx + sd * (L / 2 - 0.04) - 0.02, cx + sd * (L / 2 - 0.04) + 0.02, yF, dh - 0.035, czz - dd + 0.05, czz + dd - 0.03, ry, cx, czz));
    }
    add(tops, topM); add(bodies, deskB);
    // the monitors: 27" (0.597 x 0.336 m picture), 8 mm bezels, on a bar on a post at the desk's back
    this.mons = [];
    const mw = 0.613, mh = 0.352, my = dh + 0.33, mz = dz + dd - 0.16;
    const monB = [G.cyl(0.02, 0.36, 0, dh + 0.18, dz + dd - 0.08, 'y', 10), ...G.solid(-0.95, 0.95, my - 0.02, my + 0.02, dz + dd - 0.1, dz + dd - 0.07), ...G.solid(-0.12, 0.12, dh, dh + 0.01, dz + dd - 0.16, dz + dd - 0.02)];
    const monScr = [];
    [['left', -0.66, 0.42], ['main', 0, 0], ['right', 0.66, -0.42]].forEach(([name, x, ry]) => {
      const zz = mz - Math.abs(x) * 0.28;
      monB.push(...G.turned(x - mw / 2, x + mw / 2, my - mh / 2, my + mh / 2, zz, zz + 0.022, ry, x, zz + 0.011));
      const s = canvasTex(800, 450); s.name = name; this.mons.push(s);
      const g = G.plane(mw - 0.016, mh - 0.016, 0, 0, 0, Math.PI); g.rotateY(ry); g.translate(x, my, zz - 0.001); monScr.push([g, s]);
    });
    add(monB, black);
    for (const [g, s] of monScr) add([g], bkMat({ color: 0x000000, emissive: 0xffffff, emissiveMap: s.tex, emissiveIntensity: 1.0, roughness: 0.5 }), false);
    this.deskAt = { x: 0, y: my, z: mz };
    add([...G.solid(-0.23, 0.23, dh, dh + 0.018, dz - 0.18, dz - 0.03), ...G.solid(0.32, 0.38, dh, dh + 0.02, dz - 0.15, dz - 0.05)], black, false);
    // the chair: a mesh back, a seat, the gas column, five legs on castors
    const chz = dz - dd - 0.5, chair = [...G.solid(-0.25, 0.25, yF + 0.46, yF + 0.53, chz - 0.24, chz + 0.24), ...G.turned(-0.23, 0.23, yF + 0.58, yF + 1.12, chz - 0.31, chz - 0.27, 0.1, 0, chz - 0.29), G.cyl(0.025, 0.36, 0, yF + 0.26, chz, 'y', 10)];
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; chair.push(...G.turned(-0.02, 0.02, yF + 0.06, yF + 0.09, chz, chz + 0.32, a, 0, chz)); chair.push(G.cyl(0.025, 0.04, Math.sin(a) * 0.3, yF + 0.03, chz + Math.cos(a) * 0.3, 'x', 8)); }
    add(chair, bkMat({ color: 0x1a1b1e, roughness: 0.7 }));
    // ---- the video wall: eight 49" screens (1.076 x 0.608 m, 1.8 mm bezels) on a black frame on the far wall; their
    // pictures the cameras' own targets (main.js gives them: setWall), the names and the time over them (one canvas)
    const vw = VW.cols * VW.w, vh = VW.rows * VW.h, vy = yF + VW.y0, vz = R.z1 - 0.07;
    add(G.solid(-vw / 2 - 0.03, vw / 2 + 0.03, vy - 0.03, vy + vh + 0.03, vz - 0.005, R.z1 - 0.001), black);
    const none = new THREE.DataTexture(new Uint8Array([6, 8, 12, 255]), 1, 1); none.colorSpace = THREE.SRGBColorSpace; none.needsUpdate = true;
    this.wallNone = none;
    this.wall = [];
    for (let r = 0; r < VW.rows; r++) for (let c = 0; c < VW.cols; c++) {
      const m = bkMat({ color: 0x000000, emissive: 0xffffff, emissiveMap: none, emissiveIntensity: 1.0, roughness: 0.55 });
      add([G.plane(VW.w - 0.004, VW.h - 0.004, vw / 2 - (c + 0.5) * VW.w, vy + vh - (r + 0.5) * VW.h, vz - 0.006, Math.PI)], m, false);   // (the first on the operator's left: +x)
      this.wall.push({ m, tex: null });
    }
    this.wallTxt = canvasTex(2048, 580);
    add([G.plane(vw, vh, 0, vy + vh / 2, vz - 0.009, Math.PI)], bkMat({ color: 0x000000, map: this.wallTxt.tex, emissive: 0xffffff, emissiveMap: this.wallTxt.tex, emissiveIntensity: 1.0, transparent: true, depthWrite: false, roughness: 0.3 }), false);
    this.wallLabels = [];
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
    // the rows (with the hot aisle behind them), the gas cylinders, the table, the console
    box(ROOM.x0, -FRONT, ROW_Z0 - 0.02, ROW_END + 0.02); box(FRONT, ROOM.x1, ROW_Z0 - 0.02, ROW_END + 0.02);
    box(ROOM.x0, ROOM.x0 + 0.38, ROOM.z0, ROOM.z0 + 0.7);
    box(-TABLE.w / 2, TABLE.w / 2, TABLE.z - TABLE.d / 2, TABLE.z + TABLE.d / 2);
    box(-0.95, 0.95, DESK.z - DESK.d / 2, DESK.z + DESK.d / 2);
    for (const sd of [-1, 1]) box(Math.min(sd * 0.95, sd * 1.85), Math.max(sd * 0.95, sd * 1.85), DESK.z - 0.55, DESK.z + DESK.d / 2);
    // the steel door when it is shut (moved in and out: update)
    this.doorBox = box(-DOOR.w / 2, DOOR.w / 2, SAS.z1 - 0.14, SAS.z1);
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

  // ---- sounds: the servers' fans (a broad rush), the coolers' hum, the generator's diesel when it runs, the UPS's
  // beeps; the hatch's creak and slam, the door, the panel, the ladder's rungs
  sounds() {
    const a = this.audio; if (!a?.ctx) return;
    const ctx = a.ctx;
    const fans = ctx.createGain(); fans.gain.value = 0; fans.connect(a.master);
    const ns = ctx.createBufferSource(); ns.buffer = a.noise; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.45;
    ns.connect(bp).connect(fans); ns.start();
    const hum = ctx.createGain(); hum.gain.value = 0; hum.connect(a.master);
    for (const [f, g] of [[118, 0.5], [236, 0.22], [472, 0.08]]) { const o = ctx.createOscillator(); o.frequency.value = f; const gg = ctx.createGain(); gg.gain.value = g; o.connect(gg).connect(hum); o.start(); }
    const gen = ctx.createGain(); gen.gain.value = 0; gen.connect(a.master);
    const gn = ctx.createBufferSource(); gn.buffer = a.noise; gn.loop = true; gn.playbackRate.value = 0.5;
    const glp = ctx.createBiquadFilter(); glp.type = 'lowpass'; glp.frequency.value = 160; gn.connect(glp).connect(gen); gn.start();
    for (const [f, g] of [[50, 0.6], [100, 0.3], [25, 0.4]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const gg = ctx.createGain(); gg.gain.value = g * 0.15; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; o.connect(lp).connect(gg).connect(gen); o.start(); }
    this.snd = { fans, hum, gen, beep: 0 };
  }
  creak(open) {
    const a = this.audio; if (!a?.ctx) return;
    a.scrape({ f: open ? 620 : 520, q: 6, gain: 0.12, a: 0.05, hold: 0.5, rel: 0.4, rate: 0.6 });
    a.scrape({ f: 1700, q: 9, gain: 0.05, a: 0.1, hold: 0.3, rel: 0.3, delay: 0.15, rate: 0.5 });
    a.ring([180, 233, 410, 690], [0.35, 0.22, 0.15, 0.1], [0.25, 0.2, 0.15, 0.1], open ? 1.05 : 1.15);
    a.burst({ f: 260, q: 0.7, dur: 0.2, gain: 0.4, type: 'lowpass', delay: open ? 1.05 : 1.15 });
  }
  clank(k = 1) { const a = this.audio; if (!a?.ctx) return; a.ring([520 + Math.random() * 60, 1340, 2100], [0.12 * k, 0.06 * k, 0.03 * k], [0.08, 0.05, 0.03], 0); }
  thump() { const a = this.audio; if (!a?.ctx) return; a.burst({ f: 900, q: 0.6, dur: 0.6, gain: 0.08 }); a.burst({ f: 160, q: 0.8, dur: 0.35, gain: 0.55, type: 'lowpass', delay: 0.9 }); a.ring([95, 140, 310], [0.3, 0.2, 0.08], [0.3, 0.25, 0.1], 0.91); }
  click() { const a = this.audio; if (!a?.ctx) return; a.ring([1800], [0.04], [0.03], 0); }

  // ---- what E and F do here: returns the prompt (or null); acts on the keys. onSystem(app): sit at the console
  interact(cam, input, player, onSystem) {
    if (this.climb) return '';
    const p = this.toL(player.pos.x, player.pos.z), below = player.pos.y < this.gy - 1.2;
    if (!below) {
      const d = Math.hypot(p.x, p.z);
      if (d > 1.7) return null;
      if (this.lid < 0.98 && this.lidTo === 0) {
        if (input.hit('KeyE')) { this.lidTo = 1; this.creak(true); }
        return 'E — deschide trapa';
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
    // the console, the table, the panel, the door: what you look at, within reach
    const f = cam.getWorldDirection(this._f ??= new THREE.Vector3());
    const look = (lx, ly, lz, r = 0.35, reach = 1.9) => {
      const w = this.toW(lx, 0, lz); w.y = this.gy + ly;
      const dx = w.x - cam.position.x, dy = w.y - cam.position.y, dz = w.z - cam.position.z, dd = Math.hypot(dx, dy, dz);
      return dd < reach && (f.x * dx + f.y * dy + f.z * dz) / dd > Math.cos(Math.atan2(r, dd) + 0.12);
    };
    const yF = -this.depth;
    if (look(this.deskAt.x, this.deskAt.y, this.deskAt.z, 0.9, 2.6) || look(0, yF + VW.y0 + 0.6, ROOM.z1, 2.0, 3.2) && p.z > DESK.z - 2.2) {
      if (input.hit('KeyE')) onSystem();
      return 'E — VEGHE: deschide sistemul';
    }
    if (look(0, yF + TABLE.h, TABLE.z, 0.75, 2.0)) {
      if (input.hit('KeyE')) onSystem('harta');
      return 'E — masa de situație: harta';
    }
    if (look(this.switchAt.x, this.switchAt.y, this.switchAt.z, 0.14, 1.7)) {
      if (input.hit('KeyE')) { this.lights = !this.lights; this.click(); }
      return this.lights ? 'E — stinge luminile' : 'E — aprinde luminile';
    }
    if (look(0, yF + 1.0, SAS.z1 - 0.3, 0.5, 1.8) && Math.abs(p.x) < 1.2) {
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

  // the video wall's screens: [{ tex, name, ip }] (the cameras' pictures: main.js), drawn on the wall in order
  setWall(list) {
    if (!this.built) return;
    list.forEach((s, i) => { const w = this.wall[i]; if (!w) return; const t = s?.tex ?? this.wallNone; if (w.m.emissiveMap !== t) { w.m.emissiveMap = t; } });
    const key = list.map(s => (s ? s.name + (s.ir ? '1' : '0') : '-')).join('|');
    if (key === this.wallKey) return;
    this.wallKey = key;
    this.wallLabels = list.map(s => (s ? { name: s.name, ip: s.ip, ir: !!s.ir } : null));
    this.wallTxt.t = 9;
  }
  // the names and the time over the wall's pictures
  drawWallText(clock) {
    const { g, w, h } = this.wallTxt, cw = w / VW.cols, ch = h / VW.rows;
    g.clearRect(0, 0, w, h);
    this.wallLabels.forEach((l, i) => {
      const x = (i % VW.cols) * cw, y = Math.floor(i / VW.cols) * ch;
      if (!l) { g.fillStyle = 'rgba(120,130,145,0.6)'; g.font = `600 26px ${FONT}`; g.fillText('FĂRĂ SEMNAL', x + cw / 2 - 90, y + ch / 2); return; }
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x + 10, y + 10, Math.min(cw - 20, 22 + l.name.length * 13.5), 34);
      g.fillStyle = '#f1f4f8'; g.font = `600 22px ${FONT}`; g.fillText(`CAM ${String(i + 1).padStart(2, '0')} · ${l.name}`, x + 20, y + 34);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 10, y + ch - 44, 268, 32);
      g.fillStyle = '#e6eaef'; g.font = `500 20px "Consolas", monospace`; g.fillText(clock, x + 20, y + ch - 21);
      g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(x + cw - 64, y + 28, 7, 0, 7); g.fill();
      g.fillStyle = '#f1f4f8'; g.font = `700 18px ${FONT}`; g.fillText(l.ir ? 'IR' : 'REC', x + cw - 50, y + 34);
    });
    this.wallTxt.tex.needsUpdate = true;
  }

  // ---- every frame: what is near and lit, the lid and the door moving, the power, the lamps, the screens, the sounds
  // ctx: { camera, player, mains, draw(name, g, w, h) (the system's screens), clock (the wall's time) }
  update(dt, ctx) {
    const { camera, mains } = ctx;
    const dx = camera.position.x - this.x, dz = camera.position.z - this.z, dist = Math.hypot(dx, dz);
    if (!this.built && dist < 70) this.build();
    // the power: the mains (the commune's transformer station), else the UPS (its batteries: 40 kWh, ~10 minutes at the
    // ~4 kW the room draws with its cooling... the generator starts in ~9 s and takes the load; back on the mains ~4 s
    // after it returns)
    this.mains = mains;
    if (this.source === 'retea' && !mains) { this.source = 'ups'; this.srcT = 0; }
    else if (this.source === 'ups') { this.srcT += dt; if (mains) { this.source = 'retea'; this.srcT = 0; } else if (this.srcT > 9) { this.source = 'generator'; this.srcT = 0; } }
    else if (this.source === 'generator') { if (mains) { this.srcT += dt; if (this.srcT > 4) { this.source = 'retea'; this.srcT = 0; } } else this.srcT = 0; this.fuel = Math.max(0, this.fuel - dt * 100 / (180 * 3600)); }
    this.ups = this.source === 'ups' ? Math.max(0, this.ups - dt * 100 / 600) : Math.min(100, this.ups + dt * 100 / 1800);
    // the lid: ~1.1 s to swing up on its hinges (110 deg), the same down
    this.lid += Math.sign(this.lidTo - this.lid) * Math.min(Math.abs(this.lidTo - this.lid), dt / 1.1);
    const u = this.lid * this.lid * (3 - 2 * this.lid);
    this.lidG.rotation.x = u * 1.92;
    if (this.hatchBox) this.hatchBox.ghost = this.lid < 0.05;
    this.inside = this.isInside(camera.position) || !!this.climb;
    if (!this.built) { BK.uSky.value.w = 0; return; }
    // the door: ~1.6 s, on its hydraulic closer
    this.door += Math.sign(this.doorTo - this.door) * Math.min(Math.abs(this.doorTo - this.door), dt / 1.6);
    this.doorG.rotation.y = (this.door * this.door * (3 - 2 * this.door)) * 1.62;   // (into the airlock)
    this.doorBox.ghost = this.door > 0.1;
    // the rooms drawn only when they can be seen: from within, or the hatch open and you near it
    this.rooms.visible = this.inside || (this.lid > 0.02 && dist < 25);
    this.lightT += dt;
    // the LED lines: on (a soft 0.4 s ramp) once you are inside and they are switched on; on the UPS only the emergency
    // ones (a third of the fittings at ~15%), the amber beacon turning
    const ups = this.source === 'ups';
    const want = this.lights && this.inside ? (ups ? 0.15 : 1) : 0;
    this.lightK += Math.sign(want - this.lightK) * Math.min(Math.abs(want - this.lightK), dt / 0.4);
    const lk = this.lightK;
    this.lineM.emissiveIntensity = 2.6 * lk;
    this.stripM.emissiveIntensity = 1.5 * Math.max(lk, this.inside ? 0.2 : 0);
    const L = BK.uL.value, C = BK.uC.value;
    let k = 0;
    const yF = -this.depth, ly = ROOM.h - 0.36;
    const put = (lx, lyy, lz, s, r, g, b) => { const w = this.toW(lx, lyy, lz); L[k].set(w.x, w.y, w.z, s); C[k].setRGB(r, g, b); k++; };
    for (const sx of [-1.05, 1.05]) for (const z of [ROW_Z0 + 0.6, ROW_Z0 + 2.05, ROW_Z0 + 3.5]) put(sx, yF + ly, z, 3.4 * lk, 1, 0.97, 0.93);
    put(0, yF + ly + 0.05, ROOM.z1 - 2.0, 2.6 * lk, 1, 0.97, 0.93);
    put(0, yF + SAS.h - 0.1, 1.05, 1.6 * lk, 1, 0.97, 0.93);
    // the screens' glow: the video wall's (its pictures' brightness is not read: a fair mean), the monitors', the table's
    put(0, yF + 1.6, ROOM.z1 - 2.2, 1.6, 0.62, 0.72, 0.95);
    put(0, this.deskAt.y - 0.15, this.deskAt.z - 1.0, 0.4, 0.6, 0.75, 1);
    put(0, yF + TABLE.h + 0.5, TABLE.z, 0.3, 0.5, 0.75, 1);
    const beacon = ups ? Math.max(0, Math.sin(this.lightT * 6.3)) ** 2 : 0;
    this.beaconM.emissiveIntensity = 0.4 + 6 * beacon * (ups ? 1 : 0);
    if (!ups) this.beaconM.emissiveIntensity = 0;
    put(0.55, yF + ROOM.h - 0.2, ROOM.z0 + 0.3, 1.2 * beacon, 1, 0.55, 0.08);
    for (; k < NL; k++) L[k].w = 0;
    BK.uAmb.value.setRGB(0.93, 0.95, 1).multiplyScalar(0.42 * lk + 0.035);
    // the status light over the door: green; amber on the UPS
    this.statusM.emissive.setHex(ups ? 0xffa21c : 0x30ff70);
    // the racks' LEDs: each drive's and port's activity - bursts, as I/O comes (a hash of its phase and the time)
    if (this.rooms.visible && this.leds) {
      const t = this.lightT, col = this._col ??= new THREE.Color();
      for (let i = 0; i < this.ledList.length; i++) {
        const l = this.ledList[i], ph = Math.floor(t * l.rate * 6 + l.ph), hs = hash(i, ph, 3);
        const on = hs < 0.55 ? (hash(i, Math.floor(t * 30), 5) > 0.35 ? 1 : 0.15) : 0.12;
        col.setRGB(l.c[0] * on * 3, l.c[1] * on * 3, l.c[2] * on * 3);
        this.leds.setColorAt(i, col);
      }
      this.leds.instanceColor.needsUpdate = true;
    }
    // the screens: the system's (system.js draws them), twice a second while they can be seen; the wall's names and time
    if (this.rooms.visible) {
      const near = this.inside ? 0.5 : 2;
      for (const s of [...this.mons, this.table]) {
        if ((s.t += dt) < near) continue;
        s.t = 0;
        ctx.draw?.(s === this.table ? 'table' : s.name, s.g, s.w, s.h);
        s.tex.needsUpdate = true;
      }
      if ((this.wallTxt.t += dt) > 1) { this.wallTxt.t = 0; this.drawWallText(ctx.clock ?? ''); }
      for (const [s, draw] of [[this.upsLcd, (g, w, h) => {
        g.fillStyle = '#06121c'; g.fillRect(0, 0, w, h); g.fillStyle = ups ? '#ffb020' : '#7fd4ff'; g.font = `700 17px ${FONT}`;
        g.fillText(ups ? 'PE BATERII' : this.source === 'generator' ? 'GENERATOR' : 'ONLINE', 10, 26);
        g.font = `13px ${FONT}`; g.fillStyle = '#cfe6f5'; g.fillText(`sarcină 4,1 kW · ${Math.round(this.ups)}%`, 10, 50); g.fillText(ups ? `autonomie ${Math.max(0, Math.round(this.ups / 10))} min` : 'intrare 400 V 50 Hz', 10, 70);
      }], [this.batLcd, (g, w, h) => {
        g.fillStyle = '#06121c'; g.fillRect(0, 0, w, h); g.fillStyle = '#5dff8f'; g.font = `700 18px ${FONT}`; g.fillText(`SOC ${Math.round(this.ups)}%`, 12, 28);
        g.font = `13px ${FONT}`; g.fillStyle = '#cfe6f5'; g.fillText(ups ? 'descărcare 4,1 kW' : 'încărcare', 12, 52);
      }]]) {
        if ((s.t += dt) < 1) continue;
        s.t = 0; draw(s.g, s.w, s.h); s.tex.needsUpdate = true;
      }
    }
    // the sky down the shaft
    const top = this.toW(0, 0, 0);
    BK.uSky.value.set(top.x, top.y, top.z, u);
    // the sounds, when you are in it
    if (this.snd) {
      const now = this.audio.ctx.currentTime, near = this.inside ? 1 : Math.max(0, 1 - dist / 6) * u * 0.3;
      this.snd.fans.gain.setTargetAtTime(0.05 * near, now, 0.3);
      this.snd.hum.gain.setTargetAtTime(0.004 * near, now, 0.3);
      this.snd.gen.gain.setTargetAtTime((this.source === 'generator' ? 0.05 : 0) * (this.inside ? 1 : 0.4 * near), now, this.source === 'generator' ? 1.2 : 0.6);
      if (ups && this.inside && (this.snd.beep -= dt) < 0) { this.snd.beep = 4; this.audio.ring([2050], [0.035], [0.25], 0); }
    }
  }
}
