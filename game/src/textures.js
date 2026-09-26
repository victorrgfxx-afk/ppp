import * as THREE from 'three';
import { fbm, valueNoise, rng, clamp } from './util.js';

// Real photo-derived textures (see tools/extract_textures.py) + procedural ones.
export const TEX = {};
let ANISO = 8;

const PHOTOS = {
  asphalt:        { file: 'asphalt.jpg',        normal: 1.6, rough: true },
  concrete:       { file: 'concrete.jpg',       normal: 1.2 },
  stone_cladding: { file: 'stone_cladding.jpg', normal: 3.0 },
  stone_wall:     { file: 'stone_wall.jpg',     normal: 3.0 },
  facade_porch:   { file: 'facade_porch.jpg',   normal: 0.6, clamp: true },
  facade_veranda: { file: 'facade_veranda.jpg', normal: 0.6, clamp: true },
  knee_wall:      { file: 'knee_wall.jpg',      normal: 0.8, clamp: true },
  roof_panels:    { file: 'roof_panels.jpg',    normal: 1.5 },
  ivy:            { file: 'ivy.jpg',            normal: 2.0 },
  rust_strip:     { file: 'rust_strip.jpg',     normal: 1.0 },
  wall_plaster:   { file: 'wall_plaster.jpg',   normal: 3.0 },
};

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Nu pot încărca ' + url));
    img.src = url;
  });
}

function imageToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

// Height (luminance) -> tangent-space normal map.
export function normalFromCanvas(src, strength = 1, maxSize = 1024) {
  const s = Math.min(1, maxSize / Math.max(src.width, src.height));
  const w = Math.max(4, Math.round(src.width * s)), h = Math.max(4, Math.round(src.height * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = (0.3 * d.data[i * 4] + 0.59 * d.data[i * 4 + 1] + 0.11 * d.data[i * 4 + 2]) / 255;
  return heightToNormalCanvas(H, w, h, strength);
}

export function heightToNormalCanvas(H, w, h, strength) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = (y - 1 + h) % h, yd = (y + 1) % h;
      const dx = (H[y * w + xr] - H[y * w + xl]) * strength;
      const dy = (H[yd * w + x] - H[yu * w + x]) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      out.data[i] = (nx * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function tex(canvasOrImg, { srgb = true, repeat = true, mirror = false } = {}) {
  const t = canvasOrImg instanceof HTMLCanvasElement ? new THREE.CanvasTexture(canvasOrImg) : new THREE.Texture(canvasOrImg);
  t.needsUpdate = true;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const wrap = mirror ? THREE.MirroredRepeatWrapping : repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapS = t.wrapT = wrap;
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Build a canvas from a per-pixel function returning [r,g,b,a] in 0..255.
function paint(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const px = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    px[3] = 255;
    fn(x, y, px);
    const i = (y * w + x) * 4;
    img.data[i] = px[0]; img.data[i + 1] = px[1]; img.data[i + 2] = px[2]; img.data[i + 3] = px[3];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function heightField(w, h, fn) {
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = fn(x, y);
  return H;
}

function gray(H, w, h, lo, hi) {
  return paint(w, h, (x, y, p) => { const v = (lo + (hi - lo) * H[y * w + x]) * 255; p[0] = p[1] = p[2] = v; });
}

// ---------------- procedural generators ----------------
function genStucco() {
  const n = 512;
  const H = heightField(n, n, (x, y) => {
    const f = fbm(x / 6, y / 6, 3, n / 6, 3) * 0.6 + valueNoise(x / 1.5, y / 1.5, n / 1.5, 9) * 0.4;
    return f;
  });
  const Hm = heightField(n, n, (x, y) => fbm(x / 90, y / 90, 4, n / 90, 21));
  const map = paint(n, n, (x, y, p) => {
    const v = 0.86 + 0.1 * H[y * n + x] + 0.1 * (Hm[y * n + x] - 0.5);
    p[0] = p[1] = p[2] = clamp(v, 0, 1) * 255;
  });
  TEX.stucco = tex(map);
  TEX.stuccoN = tex(heightToNormalCanvas(H, n, n, 2.2), { srgb: false });
}

function genWood() {
  const w = 256, h = 1024; // boards run along V
  const r = rng(5);
  const boardW = 32;
  const shade = Array.from({ length: w / boardW }, () => 0.8 + r() * 0.35);
  const H = heightField(w, h, (x, y) => {
    const b = Math.floor(x / boardW);
    const gx = x % boardW;
    const seam = gx < 1 || gx > boardW - 2 ? 0 : 1;
    const grain = fbm(x / 1.2 + b * 50, y / 40, 3, 1e9, 7);
    return seam * (0.7 + 0.3 * grain);
  });
  const map = paint(w, h, (x, y, p) => {
    const b = Math.floor(x / boardW);
    const v = H[y * w + x] * shade[b];
    const streak = fbm(x / 2 + b * 30, y / 90, 3, 1e9, 11);
    const k = v * (0.8 + 0.4 * streak);
    p[0] = clamp(k * 0.95, 0, 1) * 255; p[1] = clamp(k * 0.8, 0, 1) * 255; p[2] = clamp(k * 0.72, 0, 1) * 255;
  });
  TEX.wood = tex(map);
  TEX.woodN = tex(heightToNormalCanvas(H, w, h, 1.5), { srgb: false });
}

function genPicket() {
  // dark maroon stained fence board (single board texture, V along height)
  const w = 128, h = 512;
  const H = heightField(w, h, (x, y) => fbm(x / 1.5, y / 30, 4, 1e9, 31));
  const map = paint(w, h, (x, y, p) => {
    const g = H[y * w + x];
    const k = 0.75 + 0.45 * g;
    p[0] = 92 * k; p[1] = 34 * k; p[2] = 30 * k;
  });
  TEX.picket = tex(map);
  TEX.picketN = tex(heightToNormalCanvas(H, w, h, 1.2), { srgb: false });
}

function genGrass() {
  const n = 512;
  const r = rng(77);
  const map = paint(n, n, (x, y, p) => {
    const m = fbm(x / 60, y / 60, 4, n / 60, 5);
    const d = fbm(x / 18, y / 18, 3, n / 18, 6);
    const fine = valueNoise(x / 1.3, y / 1.3, n / 1.3, 8);
    const dry = clamp((m - 0.52) * 2.5, 0, 1) * 0.7;
    const dirt = clamp((d - 0.7) * 5, 0, 1) * 0.8;
    let R = 56 + 48 * dry, G = 96 + 22 * dry - 4 * fine * 10, B = 34 + 10 * dry;
    R = R * (0.75 + 0.5 * fine); G = G * (0.75 + 0.5 * fine); B = B * (0.8 + 0.4 * fine);
    R = R * (1 - dirt) + 98 * dirt; G = G * (1 - dirt) + 84 * dirt; B = B * (1 - dirt) + 66 * dirt;
    p[0] = R; p[1] = G; p[2] = B;
  });
  TEX.grass = tex(map);
  const H = heightField(n, n, (x, y) => valueNoise(x / 1.2, y / 1.2, n / 1.2, 12));
  TEX.grassN = tex(heightToNormalCanvas(H, n, n, 2), { srgb: false });
  void r;
}

function genGravel() {
  const n = 512;
  const r = rng(9);
  const c = document.createElement('canvas'); c.width = c.height = n;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7d766b'; ctx.fillRect(0, 0, n, n);
  const H = new Float32Array(n * n);
  for (let i = 0; i < 5200; i++) {
    const x = r() * n, y = r() * n, s = 1.5 + r() * 5.5;
    const g = 95 + r() * 110;
    const tint = r() < 0.3 ? [g, g * 0.93, g * 0.85] : [g, g, g * 0.97];
    for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
      ctx.fillStyle = `rgb(${tint[0] | 0},${tint[1] | 0},${tint[2] | 0})`;
      ctx.beginPath(); ctx.ellipse(x + ox, y + oy, s, s * (0.6 + r() * 0.4), r() * 3, 0, 7); ctx.fill();
    }
  }
  // dust overlay
  const img = ctx.getImageData(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4;
    const d = fbm(x / 40, y / 40, 3, n / 40, 4);
    const k = 0.8 + 0.35 * d;
    img.data[i] *= k; img.data[i + 1] *= k * 0.98; img.data[i + 2] *= k * 0.95;
    H[y * n + x] = (img.data[i] + img.data[i + 1]) / 510;
  }
  ctx.putImageData(img, 0, 0);
  TEX.gravel = tex(c);
  TEX.gravelN = tex(heightToNormalCanvas(H, n, n, 3), { srgb: false });
}

function genPavers() {
  // Concrete slabs, 0.5 m across the gutter, 0.4 m along the road; texture = 1 m x 1 m
  const n = 512;
  const r = rng(3);
  const tone = Array.from({ length: 16 }, () => 0.88 + r() * 0.2);
  const H = heightField(n, n, (x, y) => {
    const gx = x % 256, gy = y % 205;
    const edge = Math.min(gx, 256 - gx, gy, 205 - gy);
    return clamp(edge / 5, 0, 1) * (0.85 + 0.15 * valueNoise(x / 2, y / 2, n / 2, 4));
  });
  const map = paint(n, n, (x, y, p) => {
    const id = (Math.floor(x / 256) + Math.floor(y / 205) * 3) % 16;
    const h = H[y * n + x];
    const stain = fbm(x / 50, y / 50, 3, n / 50, 17);
    const v = (100 + 60 * h) * tone[id] * (0.85 + 0.3 * stain);
    p[0] = v; p[1] = v * 0.98; p[2] = v * 0.95;
  });
  TEX.pavers = tex(map);
  TEX.paversN = tex(heightToNormalCanvas(H, n, n, 4), { srgb: false });
}

function genTiles() {
  // Terracotta-beige porch tiles (small mosaic ~10cm), texture = 0.8 m
  const n = 512, cell = 64;
  const r = rng(41);
  const tones = Array.from({ length: 64 }, () => 0.85 + r() * 0.25);
  const H = heightField(n, n, (x, y) => {
    const gx = x % cell, gy = y % cell;
    const e = Math.min(gx, cell - gx, gy, cell - gy);
    return clamp(e / 3, 0, 1);
  });
  const map = paint(n, n, (x, y, p) => {
    const id = (Math.floor(x / cell) * 7 + Math.floor(y / cell) * 13) % 64;
    const h = H[y * n + x];
    const k = tones[id] * (0.9 + 0.1 * valueNoise(x / 3, y / 3, n / 3, 2));
    const grout = 1 - h;
    p[0] = (196 * k) * (1 - grout) + 150 * grout;
    p[1] = (138 * k) * (1 - grout) + 140 * grout;
    p[2] = (98 * k) * (1 - grout) + 128 * grout;
  });
  TEX.tiles = tex(map);
  TEX.tilesN = tex(heightToNormalCanvas(H, n, n, 2), { srgb: false });
}

function genCeramicPlinth() {
  // gray-brown ceramic plinth tiles (fence base), 30x30 cm, texture = 0.6 m
  const n = 256, cell = 128;
  const H = heightField(n, n, (x, y) => {
    const gx = x % cell, gy = y % cell;
    return clamp(Math.min(gx, cell - gx, gy, cell - gy) / 3, 0, 1);
  });
  const map = paint(n, n, (x, y, p) => {
    const h = H[y * n + x];
    const k = 0.9 + 0.12 * fbm(x / 20, y / 20, 3, n / 20, 3);
    p[0] = (128 * k) * h + 90 * (1 - h); p[1] = (118 * k) * h + 86 * (1 - h); p[2] = (110 * k) * h + 82 * (1 - h);
  });
  TEX.plinth = tex(map);
  TEX.plinthN = tex(heightToNormalCanvas(H, n, n, 2), { srgb: false });
}

function genBrickCladding() {
  // beige brick-look cladding tiles (as on the porch wall), 25x6.5 cm
  const w = 512, h = 512;
  const bw = 128, bh = 34;
  const r = rng(12);
  const tones = Array.from({ length: 128 }, () => 0.85 + r() * 0.2);
  const H = heightField(w, h, (x, y) => {
    const row = Math.floor(y / bh);
    const off = (row % 2) * bw / 2;
    const gx = (x + off) % bw, gy = y % bh;
    const e = Math.min(gx, bw - gx, gy, bh - gy);
    return clamp(e / 2.5, 0, 1) * (0.8 + 0.2 * valueNoise(x / 3, y / 3, w / 3, 5));
  });
  const map = paint(w, h, (x, y, p) => {
    const row = Math.floor(y / bh);
    const off = (row % 2) * bw / 2;
    const id = (Math.floor((x + off) / bw) + row * 5) % 128;
    const hh = H[y * w + x];
    const k = tones[id];
    p[0] = (190 * k) * hh + 170 * (1 - hh); p[1] = (160 * k) * hh + 160 * (1 - hh); p[2] = (118 * k) * hh + 140 * (1 - hh);
  });
  TEX.brick = tex(map);
  TEX.brickN = tex(heightToNormalCanvas(H, w, h, 2.5), { srgb: false });
}

function genRoofMetal() {
  // Standing-seam metal sheet, ribs every 0.5 m (texture = 1 m across, V = along slope)
  const w = 256, h = 256;
  const H = heightField(w, h, (x, y) => {
    const gx = x % 128;
    const rib = Math.exp(-Math.pow((gx - 3) / 2.2, 2)) + Math.exp(-Math.pow((gx - 125) / 2.2, 2));
    return rib * 0.9 + 0.05 * valueNoise(x / 4, y / 30, 1e9, 3);
  });
  const map = paint(w, h, (x, y, p) => {
    const s = fbm(x / 8, y / 60, 3, 1e9, 44);
    const v = 0.8 + 0.25 * s;
    p[0] = p[1] = p[2] = clamp(v, 0, 1) * 255;
  });
  TEX.roofMetal = tex(map);
  TEX.roofMetalN = tex(heightToNormalCanvas(H, w, h, 6), { srgb: false });
}

function genRoofTiles() {
  // Ceramic "tigla" rows (texture = 1 m x 1 m, 4 rows, 5 tiles)
  const n = 512;
  const r = rng(71);
  const tones = Array.from({ length: 40 }, () => 0.82 + r() * 0.3);
  const H = heightField(n, n, (x, y) => {
    const row = Math.floor(y / 128);
    const off = (row % 2) * 51;
    const gx = ((x + off) % 102) / 102, gy = (y % 128) / 128;
    const bump = Math.sin(gx * Math.PI) * 0.7 + 0.3;
    const lip = gy > 0.88 ? (1 - (gy - 0.88) / 0.12) * 0.5 : 1;
    return bump * (0.4 + 0.6 * gy) * lip;
  });
  const map = paint(n, n, (x, y, p) => {
    const row = Math.floor(y / 128);
    const off = (row % 2) * 51;
    const id = (Math.floor((x + off) / 102) + row * 5) % 40;
    const h = H[y * n + x];
    const k = tones[id] * (0.55 + 0.5 * h) * (0.9 + 0.2 * fbm(x / 30, y / 30, 3, n / 30, 8));
    p[0] = 168 * k; p[1] = 78 * k; p[2] = 54 * k;
  });
  TEX.roofTiles = tex(map);
  TEX.roofTilesN = tex(heightToNormalCanvas(H, n, n, 5), { srgb: false });
}

function genChainLink() {
  // diamond wire mesh with alpha; texture = 0.25 m
  const n = 256;
  const c = paint(n, n, (x, y, p) => {
    const u = x / n * 4, v = y / n * 4; // 4 diamonds per tile (6 cm mesh)
    const a = Math.abs(((u + v) % 1) - 0.5), b = Math.abs(((u - v + 8) % 1) - 0.5);
    const d = Math.min(a, b);
    const wire = clamp(1 - (0.5 - d) / 0.035, 0, 1);
    const shade = 150 + 60 * (1 - Math.abs(0.5 - d) * 2);
    p[0] = shade * 0.92; p[1] = shade * 0.95; p[2] = shade * 0.9;
    p[3] = wire > 0.5 ? 255 : 0;
  });
  TEX.chain = tex(c);
}

function genLeaves(kind = 'broad') {
  // Leaf-cluster card with alpha (drawn leaves)
  const n = 512;
  const r = rng(kind === 'broad' ? 101 : 202);
  const c = document.createElement('canvas'); c.width = c.height = n;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, n, n);
  // twigs
  ctx.strokeStyle = 'rgba(60,52,34,0.55)'; ctx.lineWidth = 1.6;
  const cx = n / 2, cy = n / 2;
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 110, cy + Math.sin(a) * 110); ctx.stroke();
  }
  const count = kind === 'broad' ? 170 : 260;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * n * 0.42;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.9;
    const L = kind === 'broad' ? 26 + r() * 22 : 16 + r() * 12;
    const Wd = L * (kind === 'broad' ? 0.45 : 0.35);
    const ang = a + (r() - 0.5) * 1.4;
    const light = r();
    const g = 70 + light * 90;
    const yellow = r() < 0.18 ? 40 : 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const grd = ctx.createLinearGradient(-L / 2, 0, L / 2, 0);
    grd.addColorStop(0, `rgb(${(g * 0.45 + yellow) | 0},${(g * 0.9 + yellow * 0.6) | 0},${(g * 0.3) | 0})`);
    grd.addColorStop(1, `rgb(${(g * 0.6 + yellow) | 0},${(g * 1.05 + yellow * 0.6) | 0},${(g * 0.38) | 0})`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-L / 2, 0);
    ctx.quadraticCurveTo(0, -Wd, L / 2, 0);
    ctx.quadraticCurveTo(0, Wd, -L / 2, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,60,20,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
    ctx.restore();
  }
  const t = tex(c, { repeat: false });
  t.premultiplyAlpha = false;
  TEX[kind === 'broad' ? 'leaves' : 'leavesSmall'] = t;
}

function genFirBranch() {
  const w = 256, h = 512;
  const r = rng(303);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // branch goes from bottom (trunk) to top (tip)
  const drawTwig = (x0, y0, x1, y1, width, depth) => {
    ctx.strokeStyle = '#3c2e22'; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = (x1 - x0) / len, ny = (y1 - y0) / len;
    const steps = Math.floor(len / 2.2);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      for (const side of [-1, 1]) {
        const nl = (7 + r() * 6) * (1 - t * 0.5) * (depth ? 0.8 : 1);
        const ax = nx * 0.55 + (-ny) * side, ay = ny * 0.55 + nx * side;
        const al = Math.hypot(ax, ay);
        const g = 45 + r() * 45;
        ctx.strokeStyle = `rgb(${(g * 0.35) | 0},${(g * 0.95) | 0},${(g * 0.55) | 0})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + ax / al * nl, py + ay / al * nl); ctx.stroke();
      }
    }
  };
  drawTwig(w / 2, h, w / 2, 8, 4, 0);
  for (let i = 0; i < 16; i++) {
    const t = 0.08 + i / 17 * 0.85;
    const y = h - t * (h - 8);
    const L = (1 - t) * 110 + 25;
    for (const side of [-1, 1]) {
      const ex = w / 2 + side * L * (0.8 + r() * 0.25), ey = y - L * 0.55;
      drawTwig(w / 2, y, Math.max(4, Math.min(w - 4, ex)), ey, 2, 1);
    }
  }
  const t = tex(c, { repeat: false });
  TEX.fir = t;
}

function genBark() {
  const w = 256, h = 512;
  const H = heightField(w, h, (x, y) => {
    const v = fbm(x / 6, y / 40, 5, w / 6, 61);
    return Math.pow(v, 1.5);
  });
  const map = paint(w, h, (x, y, p) => {
    const v = 0.35 + 0.65 * H[y * w + x];
    p[0] = 92 * v; p[1] = 80 * v; p[2] = 70 * v;
  });
  TEX.bark = tex(map);
  TEX.barkN = tex(heightToNormalCanvas(H, w, h, 5), { srgb: false });
}

function genCurtain() {
  // Window interior seen from outside: dim room + sheer curtain folds + zebra blind variant
  const w = 256, h = 256;
  const r = rng(8);
  const c1 = paint(w, h, (x, y, p) => {
    const fold = 0.5 + 0.5 * Math.sin(x / w * Math.PI * 14 + Math.sin(y / 60));
    const room = 0.18 + 0.1 * fbm(x / 40, y / 40, 2, 1e9, 3);
    const sheer = 0.55 + 0.25 * fold;
    const k = room * 0.45 + sheer * 0.55;
    p[0] = 225 * k; p[1] = 222 * k; p[2] = 214 * k;
  });
  TEX.curtain = tex(c1);
  const c2 = paint(w, h, (x, y, p) => {
    const band = Math.floor(y / 16) % 2;
    const k = band ? 0.78 : 0.42;
    const n = 0.95 + 0.05 * valueNoise(x / 2, y / 2, 1e9, 1);
    p[0] = 210 * k * n; p[1] = 214 * k * n; p[2] = 212 * k * n;
  });
  TEX.blinds = tex(c2);
  void r;
}

function genPaintWear() {
  const w = 128, h = 512;
  const c = paint(w, h, (x, y, p) => {
    const n = fbm(x / 10, y / 10, 4, 1e9, 91);
    const f = valueNoise(x / 1.5, y / 1.5, 1e9, 92);
    const a = clamp((n * 0.8 + f * 0.3 - 0.28) * 3.5, 0, 1);
    p[0] = 232; p[1] = 232; p[2] = 226; p[3] = a * 255;
  });
  TEX.paint = tex(c, { repeat: false });
}

function genSoil() {
  const n = 512;
  const H = heightField(n, n, (x, y) => fbm(x / 8, y / 8, 5, n / 8, 55));
  const map = paint(n, n, (x, y, p) => {
    const v = 0.6 + 0.5 * H[y * n + x];
    const g = fbm(x / 40, y / 40, 3, n / 40, 56);
    const grass = clamp((g - 0.5) * 4, 0, 1);
    p[0] = (96 * v) * (1 - grass) + 70 * grass * v;
    p[1] = (80 * v) * (1 - grass) + 92 * grass * v;
    p[2] = (62 * v) * (1 - grass) + 44 * grass * v;
  });
  TEX.soil = tex(map);
  TEX.soilN = tex(heightToNormalCanvas(H, n, n, 3), { srgb: false });
}

function genForest() {
  // For distant hills: clumpy canopy
  const n = 512;
  const map = paint(n, n, (x, y, p) => {
    const a = fbm(x / 7, y / 7, 4, n / 7, 71);
    const b = fbm(x / 60, y / 60, 3, n / 60, 72);
    const k = 0.45 + 0.7 * a;
    const autumn = clamp((b - 0.55) * 3, 0, 1) * 0.5;
    p[0] = (46 + 40 * autumn) * k; p[1] = (68 + 10 * autumn) * k; p[2] = 38 * k;
  });
  TEX.forest = tex(map);
}

function genManhole() {
  const n = 256;
  const c = paint(n, n, (x, y, p) => {
    const dx = x - n / 2 + 0.5, dy = y - n / 2 + 0.5;
    const r = Math.hypot(dx, dy) / (n / 2);
    let v = 58;
    if (r > 0.96) { p[3] = 0; return; }
    if (r > 0.84) v = 70 + 10 * valueNoise(x, y, 1e9, 2);
    else {
      const ring = Math.abs(Math.sin(r * 40)) > 0.85 ? 1 : 0;
      const grid = (Math.abs(Math.sin(dx / 3)) > 0.93 || Math.abs(Math.sin(dy / 3)) > 0.93) ? 1 : 0;
      v = 48 + 18 * (ring | grid) + 8 * valueNoise(x / 2, y / 2, 1e9, 3);
    }
    const rust = fbm(x / 20, y / 20, 3, 1e9, 4);
    p[0] = v * (1 + rust * 0.25); p[1] = v * (0.95 + rust * 0.05); p[2] = v * 0.9; p[3] = 255;
  });
  TEX.manhole = tex(c, { repeat: false });
}

function genPlate(text, key) {
  const c = document.createElement('canvas'); c.width = 520; c.height = 112;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f4f0'; ctx.fillRect(0, 0, 520, 112);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 514, 106);
  ctx.fillStyle = '#1f3fa0'; ctx.fillRect(6, 6, 58, 100);
  ctx.fillStyle = '#ffd400';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.arc(35 + Math.cos(a) * 16, 38 + Math.sin(a) * 16, 2.6, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.fillText('RO', 35, 94);
  ctx.fillStyle = '#111'; ctx.font = 'bold 84px "Arial Narrow", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 292, 60);
  TEX[key] = tex(c, { repeat: false });
}

function genHouseNo(text, key) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2ee'; g.beginPath(); g.ellipse(64, 48, 60, 44, 0, 0, 7); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#111'; g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 52);
  TEX[key] = tex(c, { repeat: false });
}

// Coir door mat with "HELLO" and a cat & dog line drawing (photo 12)
function genDoorMat() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  const img = g.createImageData(512, 320);
  for (let i = 0; i < 512 * 320; i++) {
    const n = Math.random();
    img.data[i * 4] = 128 + n * 40; img.data[i * 4 + 1] = 92 + n * 30; img.data[i * 4 + 2] = 55 + n * 20; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = '#1b1510'; g.fillStyle = '#1b1510'; g.lineWidth = 7;
  g.beginPath(); g.ellipse(150, 170, 95, 110, 0, 0, 7); g.stroke();
  g.beginPath(); g.arc(150, 125, 32, 0, 7); g.stroke();                 // dog head
  g.beginPath(); g.moveTo(120, 110); g.quadraticCurveTo(100, 150, 125, 160); g.stroke();
  g.beginPath(); g.arc(150, 215, 34, Math.PI * 1.1, Math.PI * 2.1); g.stroke();   // cat head
  g.beginPath(); g.moveTo(125, 200); g.lineTo(122, 178); g.lineTo(138, 190); g.moveTo(175, 200); g.lineTo(178, 178); g.lineTo(162, 190); g.stroke();
  g.lineWidth = 3; for (const s of [-1, 1]) for (const d of [-6, 6]) { g.beginPath(); g.moveTo(150 + s * 12, 225 + d * 0.5); g.lineTo(150 + s * 45, 222 + d); g.stroke(); }
  g.font = 'bold 74px Arial'; g.textBaseline = 'middle'; g.fillText('HELLO', 255, 230);
  TEX.doorMat = tex(c, { repeat: false });
}

// Horezu-style glazed ceramic vase: cream with brown/ochre ornamental bands (photo 12)
function genHorezu() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#efe3cf'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#9a5a33'; g.fillStyle = '#9a5a33';
  for (const y of [40, 60, 440, 470]) { g.lineWidth = 6; g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const x = i * 64 + 32;
    g.beginPath(); g.moveTo(x, 90); g.bezierCurveTo(x - 30, 170, x + 30, 250, x, 330); g.bezierCurveTo(x - 25, 380, x + 25, 400, x, 420); g.stroke();
    for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + (k % 2 ? 14 : -14), 120 + k * 50, 10, 5, (k % 2 ? 0.6 : -0.6), 0, 7); g.fill(); }
  }
  g.fillStyle = '#c28a3c';
  for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(i * 32 + 16, 50, 6, 0, 7); g.fill(); }
  TEX.horezu = tex(c);
}

// Small balcony flowers (petunia/lobelia purple, geranium red, marigold orange, white) with leaves, alpha
function genFlowers() {
  const n = 256;
  const r = rng(505);
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const x = 20 + r() * 216, y = 20 + r() * 216, a = r() * 6.28;
    g.fillStyle = `rgb(${40 + r() * 30 | 0},${95 + r() * 50 | 0},${35 + r() * 20 | 0})`;
    g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 11, 5, 0, 0, 7); g.fill(); g.restore();
  }
  const cols = ['#7b4fc4', '#8d5fd6', '#f2f0f4', '#c9222f', '#e8791c', '#6a3db0', '#d84a8a'];
  for (let i = 0; i < 26; i++) {
    const x = 26 + r() * 204, y = 26 + r() * 204, col = cols[Math.floor(r() * cols.length)], s = 5 + r() * 5;
    g.fillStyle = col;
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; g.beginPath(); g.arc(x + Math.cos(a) * s * 0.7, y + Math.sin(a) * s * 0.7, s * 0.6, 0, 7); g.fill(); }
    g.fillStyle = '#f5d33a'; g.beginPath(); g.arc(x, y, s * 0.3, 0, 7); g.fill();
  }
  TEX.flowers = tex(c, { repeat: false });
}

// Red-brown garden trellis lattice with alpha (photo 14)
function genLattice() {
  const n = 256;
  const c = paint(n, n, (x, y, p) => {
    const a = ((x + y) % 64), b = ((x - y + 1024) % 64);
    const on = a < 9 || b < 9;
    const k = 0.85 + 0.15 * valueNoise(x / 3, y / 3, 1e9, 4);
    p[0] = 150 * k; p[1] = 62 * k; p[2] = 46 * k; p[3] = on ? 255 : 0;
  });
  TEX.lattice = tex(c);
}

function genWheel(key, spokes = 5, color = '#b9bcc0', twin = true, bmw = false) {
  const n = 256;
  const c = document.createElement('canvas'); c.width = c.height = n;
  const ctx = c.getContext('2d');
  const cx = n / 2;
  ctx.fillStyle = '#16171a'; ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = '#2a2b2e'; ctx.beginPath(); ctx.arc(cx, cx, cx * 0.98, 0, 7); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cx, cx * 0.9, 0, 7); ctx.fill();
  ctx.fillStyle = '#0c0c0e'; ctx.beginPath(); ctx.arc(cx, cx, cx * 0.8, 0, 7); ctx.fill();
  ctx.fillStyle = color;
  for (let i = 0; i < spokes; i++) {
    const a = i / spokes * Math.PI * 2;
    const draw = (off) => {
      ctx.save(); ctx.translate(cx, cx); ctx.rotate(a + off);
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-15, -cx * 0.82); ctx.lineTo(15, -cx * 0.82); ctx.lineTo(9, 0); ctx.fill();
      ctx.restore();
    };
    if (twin) { draw(-0.11); draw(0.11); } else draw(0);
  }
  ctx.beginPath(); ctx.arc(cx, cx, cx * 0.25, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.arc(cx, cx, cx * 0.1, 0, 7); ctx.fill();
  if (bmw) {
    ctx.fillStyle = '#2863b8';
    for (let q = 0; q < 2; q++) { ctx.beginPath(); ctx.moveTo(cx, cx); ctx.arc(cx, cx, cx * 0.085, q * Math.PI, q * Math.PI + Math.PI / 2); ctx.fill(); }
  } else { ctx.fillStyle = '#8d9196'; ctx.beginPath(); ctx.arc(cx, cx, cx * 0.07, 0, 7); ctx.fill(); }
  // lug nuts
  ctx.fillStyle = '#777';
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.3; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * cx * 0.17, cx + Math.sin(a) * cx * 0.17, 4, 0, 7); ctx.fill(); }
  TEX[key] = tex(c, { repeat: false });
}

function genCloudNoise() {
  // tileable RGB noise for the sky shader (3 octave bands)
  const n = 256;
  const c = paint(n, n, (x, y, p) => {
    p[0] = fbm(x / 32, y / 32, 5, n / 32, 1) * 255;
    p[1] = fbm(x / 16, y / 16, 5, n / 16, 2) * 255;
    p[2] = fbm(x / 64, y / 64, 4, n / 64, 3) * 255;
  });
  TEX.noise = tex(c, { srgb: false });
}

function genFacadeTop() {
  // Detail for the roof mast / gutters etc: plain galvanized
  const n = 128;
  const c = paint(n, n, (x, y, p) => {
    const v = 0.75 + 0.25 * fbm(x / 10, y / 40, 3, 1e9, 5);
    p[0] = p[1] = p[2] = v * 255;
  });
  TEX.galv = tex(c);
}

function genBlackMetal() {
  const n = 128;
  const H = heightField(n, n, (x, y) => valueNoise(x / 2, y / 2, n / 2, 7));
  TEX.hammerN = tex(heightToNormalCanvas(H, n, n, 0.8), { srgb: false });
}

export async function loadTextures(base, onProgress, maxAniso = 8) {
  ANISO = maxAniso;
  const names = Object.keys(PHOTOS);
  const steps = names.length + 18;
  let done = 0;
  const tick = (label) => { done++; onProgress?.(done / steps, label); };
  const yieldUI = () => new Promise(r => setTimeout(r, 0));

  await Promise.all(names.map(async (k) => {
    const p = PHOTOS[k];
    const img = await loadImage(base + p.file);
    const t = tex(img, { repeat: !p.clamp, mirror: k === 'ivy' ? false : false });
    if (p.clamp) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    TEX[k] = t;
    if (p.normal) {
      const nt = tex(normalFromCanvas(imageToCanvas(img), p.normal), { srgb: false, repeat: !p.clamp });
      if (p.clamp) nt.wrapS = nt.wrapT = THREE.ClampToEdgeWrapping;
      TEX[k + 'N'] = nt;
    }
    tick('Fotografii: ' + k);
  }));

  const gens = [
    ['tencuială', genStucco], ['lemn', genWood], ['gard lemn', genPicket], ['iarbă', genGrass],
    ['pietriș', genGravel], ['pavele', genPavers], ['gresie', genTiles], ['soclu', genCeramicPlinth],
    ['placaj cărămidă', genBrickCladding], ['tablă', genRoofMetal], ['țiglă', genRoofTiles], ['plasă sârmă', genChainLink],
    ['frunze', () => { genLeaves('broad'); genLeaves('small'); }], ['brad', genFirBranch], ['scoarță', genBark],
    ['ferestre', genCurtain], ['marcaje', () => { genPaintWear(); genManhole(); genSoil(); genForest(); genFacadeTop(); genBlackMetal(); }],
    ['nori', genCloudNoise],
  ];
  for (const [label, fn] of gens) { fn(); tick(label); await yieldUI(); }
  genPlate('PH 13 KLI', 'plateOpel');
  genPlate('PH 07 ALX', 'plateBMW');
  genPlate('PH 77 XXS', 'plate508');
  genDoorMat(); genHorezu(); genLattice(); genFlowers();
  genHouseNo('10', 'houseNo10');
  genPlate('B 162 DDC', 'plateSUV');
  genPlate('PH 22 VIC', 'plateA');
  genPlate('PH 05 RMN', 'plateB');
  genPlate('B 93 MHD', 'plateC');
  genWheel('wheelBMW', 5, '#b7babe', true, true);
  genWheel('wheel508', 5, '#aeb2b7', true);
  genWheel('wheelOpel', 6, '#a9adb2', false);
  genWheel('wheelSUV', 5, '#2d2f33', true);
  genWheel('wheelGen', 7, '#c3c6ca', false);
  return TEX;
}

// Clone a texture with its own repeat/offset (shares the image).
export function tiled(t, rx, ry = rx) {
  const c = t.clone();
  c.needsUpdate = true;
  c.repeat.set(rx, ry);
  return c;
}
