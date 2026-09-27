import * as THREE from 'three';
import { TEX, heightToNormalCanvas } from '../textures.js';
import { rng, fbm, valueNoise, clamp } from '../util.js';

// Procedural textures for the map-built world: facades with windows (tintable wall mask in alpha),
// roofs, rail track, fences, water ripples.

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.premultiplyAlpha = false;
  return t;
}
function toData(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height); }

// A wall bay (one window per bay and floor). Alpha = 1 where the wall may be tinted by the building colour.
function facade(key, { W = 3.2, Hf = 2.8, win = [1.25, 1.35, 0.55], ppm = 150, wall = 'stucco', band = false, shutter = true, windows = true, seed = 1 }) {
  const w = Math.round(W * ppm), h = Math.round(Hf * ppm);
  const c = canvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const Hh = new Float32Array(w * h), R = new Float32Array(w * h), Mk = new Uint8Array(w * h);
  const [ww, wh, sill] = win;
  const x0 = (W - ww) / 2 * ppm, x1 = x0 + ww * ppm;
  const yb = h - sill * ppm, yt = yb - wh * ppm;               // canvas y (top-down)
  const fr = 0.075 * ppm;
  const r = rng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let col, a = 255, hgt = 0.5, rough = 0.95;
    // wall surface
    if (wall === 'wood') {
      const plank = (x / ppm) % 0.14;
      const seam = plank < 0.008 ? 0.55 : 1;
      const g = 0.82 + 0.25 * fbm(x / 2, y / 40, 3, 1e9, 9) + 0.05 * valueNoise(Math.floor(x / (0.14 * ppm)) * 7.1, 0, 1e9, 3);
      col = [215 * g * seam, 205 * g * seam, 195 * g * seam]; hgt = seam < 1 ? 0.3 : 0.5 + 0.1 * g;
    } else if (wall === 'shingle') {
      // weathered wooden shingles (photos 19, 20): staggered courses with rounded butts
      const rowH = h / 24, sw = w / 30;                           // whole courses per tile: seamless
      const row = Math.floor(y / rowH), fy = (y % rowH) / rowH;
      const xx = x + (row % 2) * sw * 0.5, k = Math.floor(xx / sw) % 30, fx = (xx % sw) / sw;
      const d = Math.abs(fx - 0.5) * 2;
      const gap = fx < 0.07 || (fy > 0.72 && d > Math.sqrt(Math.max(0, (1 - fy) / 0.28)));
      const g = 0.72 + 0.3 * valueNoise(k * 3.1, row * 7.7, 1e9, 11) + 0.12 * fbm(x / 1.5, y / 18, 3, 1e9, 13);
      const sh = gap ? 0.42 : 0.8 + 0.2 * fy;
      col = [200 * g * sh, 192 * g * sh, 184 * g * sh]; hgt = gap ? 0.25 : 0.4 + 0.35 * fy;
    } else {
      const g = 0.9 + 0.1 * fbm(x / 6, y / 6, 4, 1e9, seed) - 0.05 * fbm(x / 60, y / 40, 3, 1e9, seed + 5);
      col = [236 * g, 234 * g, 230 * g]; hgt = 0.5 + 0.15 * fbm(x / 3, y / 3, 3, 1e9, 4);
    }
    if (band && y > h - 0.18 * ppm) { col = [150, 150, 146]; a = 0; hgt = 0.62; rough = 0.9; }
    const inX = windows && x >= x0 - 3 && x <= x1 + 3, inY = y >= yt - 3 && y <= yb + 3;
    if (windows && shutter && x >= x0 - 2 && x <= x1 + 2 && y >= yt - 0.2 * ppm && y < yt - 2) { col = [232, 232, 228]; a = 0; hgt = 0.7; rough = 0.45; }
    if (inX && y > yb + 3 && y < yb + 0.06 * ppm) { col = [205, 205, 200]; a = 0; hgt = 0.8; rough = 0.5; }     // sill
    if (inX && inY) {
      const inner = x > x0 + fr && x < x1 - fr && y > yt + fr && y < yb - fr;
      const mull = Math.abs(x - (x0 + x1) / 2) < fr * 0.45;
      const reveal = x < x0 + 1 || x > x1 - 1 || y < yt + 1 || y > yb - 1;
      if (reveal) { col = [120, 118, 112]; hgt = 0.2; }
      else if (!inner || mull) { col = [238, 238, 234]; hgt = 0.35; rough = 0.35; }
      else {
        // glass: dim interior + sky reflection gradient + net curtain on the lower 2/3
        const t = (y - yt) / (yb - yt);
        const refl = 95 + 85 * (1 - t) + 20 * valueNoise(x / 25, y / 25, 1e9, 2);
        const cur = t > 0.22 ? 0.55 + 0.15 * Math.sin(x * 0.9) : 0.1;
        col = [refl * (1 - cur) + 225 * cur, refl * (1 - cur) + 222 * cur, (refl + 12) * (1 - cur) + 214 * cur];
        hgt = 0.1; rough = 0.06;
      }
      a = 0;
    }
    // colour canvas stays opaque (canvas alpha is premultiplied: RGB under alpha 0 would be lost)
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    Hh[i] = hgt; R[i] = rough; Mk[i] = a;
  }
  void r;
  ctx.putImageData(img, 0, 0);
  const rc = canvas(w, h), rctx = rc.getContext('2d'), rimg = rctx.createImageData(w, h);
  // G = roughness (three.js convention), B = wall mask for the per-building tint
  for (let i = 0; i < w * h; i++) { rimg.data[i * 4] = 0; rimg.data[i * 4 + 1] = R[i] * 255; rimg.data[i * 4 + 2] = Mk[i]; rimg.data[i * 4 + 3] = 255; }
  rctx.putImageData(rimg, 0, 0);
  TEX[key] = tex(c);
  TEX[key + 'N'] = tex(heightToNormalCanvas(Hh, w, h, 3.0), { srgb: false });
  TEX[key + 'R'] = tex(rc, { srgb: false });
  TEX[key].userData = { W, Hf };
}

function industrial() {
  const w = 512, h = 512;   // 6 m x 6 m: vertical ribs + high ribbon window
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const rib = Math.abs(((x / w * 6 / 0.25) % 1) - 0.5) < 0.12 ? 1 : 0;
    const win = y > h * 0.12 && y < h * 0.24;
    const g = 0.85 + 0.15 * fbm(x / 20, y / 80, 3, 1e9, 12);
    let col = [225 * g, 225 * g, 222 * g], a = 255;
    if (win) { const f = (x % 85) < 5 || y < h * 0.125 || y > h * 0.235; col = f ? [90, 92, 95] : [80, 96, 110]; a = 0; }
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    H[i] = win ? 0.2 : rib * 0.6; void a;
  }
  ctx.putImageData(img, 0, 0);
  TEX.facadeInd = tex(c); TEX.facadeIndN = tex(heightToNormalCanvas(H, w, h, 4), { srgb: false });
  TEX.facadeInd.userData = { W: 6, Hf: 6 };
}

function track() {
  // 2.8 m wide x 1.2 m long: ballast with two concrete sleepers (0.6 m spacing)
  const w = 256, h = 128;
  const r = rng(77);
  const c = canvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const n = valueNoise(x / 2.2, y / 2.2, 1e9, 8), n2 = valueNoise(x / 5, y / 5, 1e9, 9);
    let g = 0.45 + 0.4 * n * n2 + 0.15 * n;
    let col = [150 * g + 30, 140 * g + 26, 128 * g + 22], hgt = n * 0.6;
    const yy = y % 64;
    const sl = yy > 20 && yy < 44 && x > 18 && x < w - 18;
    if (sl) { const k = 0.85 + 0.1 * valueNoise(x / 4, y / 4, 1e9, 3); col = [168 * k, 164 * k, 156 * k]; hgt = 0.9; }
    const rust = (Math.abs(x - 64) < 6 || Math.abs(x - 192) < 6) && !sl;
    if (rust) col = [col[0] * 0.8 + 30, col[1] * 0.65 + 10, col[2] * 0.5];
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    H[i] = hgt;
  }
  void r;
  ctx.putImageData(img, 0, 0);
  TEX.track = tex(c); TEX.trackN = tex(heightToNormalCanvas(H, w, h, 3), { srgb: false });
}

function fenceBars(key, { boardW, gap, color, h = 256, top = true, rails = true, pointed = false }) {
  // 1 m wide tile, vertical members with alpha gaps
  const w = 256;
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  const H = new Float32Array(w * h);
  const per = (boardW + gap) * w;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const px = x % per;
    const board = px < boardW * w;
    const tipY = pointed ? Math.abs(px - boardW * w / 2) * 1.2 : 0;
    const rail = rails && (Math.abs(y - h * 0.18) < 5 || Math.abs(y - h * 0.82) < 5);
    const on = (board && y >= tipY) || rail;
    const g = 0.8 + 0.3 * fbm(x / 1.5, y / 25, 3, 1e9, 5);
    img.data[i * 4] = color[0] * g; img.data[i * 4 + 1] = color[1] * g; img.data[i * 4 + 2] = color[2] * g;
    img.data[i * 4 + 3] = on ? 255 : 0;
    H[i] = on ? 0.5 + 0.2 * g : 0;
  }
  void top;
  ctx.putImageData(img, 0, 0);
  TEX[key] = tex(c); TEX[key + 'N'] = tex(heightToNormalCanvas(H, w, h, 2), { srgb: false });
}

function water() {
  const n = 256;
  const H = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    H[y * n + x] = fbm(x / 16, y / 32, 5, n / 16, 21) * 0.7 + fbm(x / 6, y / 10, 3, n / 6, 22) * 0.3;
  }
  TEX.waterN = tex(heightToNormalCanvas(H, n, n, 3.0), { srgb: false });
}

export function genGeoTextures() {
  facade('facadeHouse', { seed: 3 });
  facade('facadeBlock', { W: 3.0, Hf: 2.75, win: [1.5, 1.4, 0.85], band: true, shutter: false, seed: 5 });
  facade('facadeWood', { wall: 'wood', seed: 7 });
  facade('facadeShingle', { wall: 'shingle', shutter: false, seed: 9 });
  facade('facadeShingleP', { wall: 'shingle', windows: false, seed: 9 });
  industrial();
  track();
  fenceBars('fencePicket', { boardW: 0.1, gap: 0.035, color: [96, 36, 32], pointed: false });
  fenceBars('fenceIron', { boardW: 0.018, gap: 0.1, color: [30, 30, 32], pointed: true });
  fenceBars('fenceWoodOld', { boardW: 0.13, gap: 0.02, color: [128, 118, 104] });
  water();
  return TEX;
}

// average linear colour of a texture image (for tinting the terrain detail with the satellite colour)
export function avgColor(t) {
  const img = t.image;
  const c = canvas(32, 32), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 32, 32);
  const d = toData(c).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  const lin = (v) => Math.pow(v / n / 255, 2.2);
  return new THREE.Vector3(lin(r), lin(g), lin(b));
}
export { clamp };
