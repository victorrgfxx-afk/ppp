/**
 * Generator de texturi PBR 100% procedurale (albedo + normal + roughness).
 * Nimic nu se descarca: totul e desenat in <canvas> la pornire.
 */
import * as THREE from '../vendor/three.module.min.js';
import { fbm, ridged, vnoise, heightToNormal, makeRng, clamp, lerp, smoothstep } from './noise.js';

let ANISO = 8;
export function setAnisotropy(v) { ANISO = Math.max(1, v | 0); }

const yieldFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(r) : setTimeout(r, 0)));

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTex(cnv, { srgb = false, repeat = 1, repeatY = null } = {}) {
  const t = new THREE.CanvasTexture(cnv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeatY == null ? repeat : repeatY);
  t.anisotropy = ANISO;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function dataTex(arr, size, { srgb = false, repeat = 1 } = {}) {
  const t = new THREE.DataTexture(arr, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = ANISO;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function grayTex(arr, size, repeat = 1) {
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = arr[i];
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return dataTex(rgba, size, { repeat });
}

/* ================================ ASFALT ================================ */

export function asphalt(size = 1024) {
  const N = size;
  const albedo = new Uint8Array(N * N * 4);
  const rough = new Uint8Array(N * N);
  const height = new Float32Array(N * N);
  const P = 64;                               // perioada de tiling in celule
  const rnd = makeRng(7);

  // pietricele izolate (agregat expus). Se "imprastie" in buffer (scatter),
  // nu se cauta per pixel (gather): altfel ar fi 2600 x N^2 operatii.
  const gritField = new Float32Array(N * N);
  for (let i = 0; i < 2600; i++) {
    const gx = rnd() * N, gy = rnd() * N;
    const r = 0.7 + rnd() * 1.9, amp = 0.45 + rnd() * 0.55;
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        const px = (((Math.round(gx) + dx) % N) + N) % N;
        const py = (((Math.round(gy) + dy) % N) + N) % N;
        const v = amp * (1 - d / r);
        const idx = py * N + px;
        if (v > gritField[idx]) gritField[idx] = v;
      }
    }
  }

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * P, v = (y / N) * P;
      const fine = fbm(u * 3.1, v * 3.1, { octaves: 4, period: P * 3, seed: 11 });
      const med = fbm(u * 0.8, v * 0.8, { octaves: 4, period: Math.round(P * 0.8), seed: 23 });
      const patch = fbm(u * 0.17, v * 0.17, { octaves: 3, period: Math.max(2, Math.round(P * 0.17)), seed: 41 });
      const crack = ridged(u * 0.55, v * 0.55, { octaves: 4, period: Math.max(2, Math.round(P * 0.55)), seed: 67 });
      const crackMask = smoothstep(0.80, 0.99, crack);

      let h = fine * 0.55 + med * 0.35 + patch * 0.10;
      h -= crackMask * 0.55;

      const i = y * N + x;
      const g = gritField[i];
      h += g * 0.25;
      height[i] = h;

      // culoare: asfalt uzat, gri-neutru usor rece
      let base = 44 + med * 26 + patch * 14 - crackMask * 16 + g * 78;
      base += (rnd() - 0.5) * 5;
      const warm = patch * 6;
      albedo[i * 4 + 0] = clamp(base + warm, 0, 255);
      albedo[i * 4 + 1] = clamp(base + warm * 0.8, 0, 255);
      albedo[i * 4 + 2] = clamp(base + 3, 0, 255);
      albedo[i * 4 + 3] = 255;

      // rugozitate: mai neted pe portiunile lustruite, mai aspru pe agregat
      rough[i] = clamp(232 - med * 40 - patch * 30 + g * 26 - crackMask * 20, 90, 255);
    }
  }
  const nrm = heightToNormal(height, N, N, 2.6);
  return {
    map: dataTex(albedo, N, { srgb: true }),
    normalMap: dataTex(new Uint8Array(nrm.buffer), N),
    roughnessMap: grayTex(rough, N),
  };
}

/* ============================== BETON / DALE ============================= */

export function concrete(size = 512, tint = [176, 174, 168], pitted = 0.6) {
  const N = size, P = 32;
  const albedo = new Uint8Array(N * N * 4);
  const rough = new Uint8Array(N * N);
  const height = new Float32Array(N * N);
  const rnd = makeRng(19);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const u = (x / N) * P, v = (y / N) * P;
      const n1 = fbm(u * 2.4, v * 2.4, { octaves: 4, period: Math.round(P * 2.4), seed: 5 });
      const n2 = fbm(u * 0.35, v * 0.35, { octaves: 3, period: Math.max(2, Math.round(P * 0.35)), seed: 91 });
      const pit = smoothstep(0.78, 0.95, vnoise(u * 6, v * 6, P * 6, 3)) * pitted;
      const s = (n1 - 0.5) * 22 + (n2 - 0.5) * 26 - pit * 30 + (rnd() - 0.5) * 6;
      albedo[i * 4 + 0] = clamp(tint[0] + s, 0, 255);
      albedo[i * 4 + 1] = clamp(tint[1] + s, 0, 255);
      albedo[i * 4 + 2] = clamp(tint[2] + s * 0.95, 0, 255);
      albedo[i * 4 + 3] = 255;
      rough[i] = clamp(215 + n1 * 30 - pit * 40, 120, 255);
      height[i] = n1 * 0.4 + n2 * 0.4 - pit * 0.5;
    }
  }
  const nrm = heightToNormal(height, N, N, 1.6);
  return {
    map: dataTex(albedo, N, { srgb: true }),
    normalMap: dataTex(new Uint8Array(nrm.buffer), N),
    roughnessMap: grayTex(rough, N),
  };
}

/** Trotuar din dale de beton, cu rosturi. */
export function pavers(size = 512, cells = 4) {
  const N = size;
  const c = canvas(N), ctx = c.getContext('2d');
  const rnd = makeRng(31);
  ctx.fillStyle = '#4c4b47';
  ctx.fillRect(0, 0, N, N);
  const s = N / cells;
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const tone = 150 + rnd() * 26;
      ctx.fillStyle = `rgb(${tone | 0},${(tone - 2) | 0},${(tone - 8) | 0})`;
      ctx.fillRect(gx * s + 1.5, gy * s + 1.5, s - 3, s - 3);
    }
  }
  // murdarie + granulatie
  const img = ctx.getImageData(0, 0, N, N);
  const d = img.data;
  const P = 32;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const n = fbm((x / N) * P * 3, (y / N) * P * 3, { octaves: 4, period: P * 3, seed: 13 });
      const dirt = fbm((x / N) * P * 0.3, (y / N) * P * 0.3, { octaves: 3, period: Math.max(2, (P * 0.3) | 0), seed: 77 });
      const k = (n - 0.5) * 26 - dirt * 22 + 8;
      d[i] = clamp(d[i] + k, 0, 255);
      d[i + 1] = clamp(d[i + 1] + k, 0, 255);
      d[i + 2] = clamp(d[i + 2] + k - 3, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x % s) / s, fy = (y % s) / s;
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    height[y * N + x] = smoothstep(0, 0.035, edge) * 0.8
      + fbm((x / N) * 96, (y / N) * 96, { octaves: 3, period: 96, seed: 3 }) * 0.2;
  }
  const nrm = heightToNormal(height, N, N, 2.2);
  return { map: toTex(c, { srgb: true }), normalMap: dataTex(new Uint8Array(nrm.buffer), N), roughness: 0.88 };
}

/* ============================ LEMN (GARD) =============================== */

export function woodFence(size = 512, planks = 8) {
  const N = size;
  const c = canvas(N), ctx = c.getContext('2d');
  const rnd = makeRng(53);
  ctx.fillStyle = '#0b0a09';
  ctx.fillRect(0, 0, N, N);
  const w = N / planks;
  const tones = [];
  for (let p = 0; p < planks; p++) {
    const base = [118 + rnd() * 34, 62 + rnd() * 22, 32 + rnd() * 16];
    tones.push(base);
    ctx.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
    ctx.fillRect(p * w + 1, 0, w - 2, N);
  }
  const img = ctx.getImageData(0, 0, N, N), d = img.data;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      if (d[i + 0] < 20) continue;                     // rostul dintre scanduri
      const p = Math.floor(x / w);
      const lx = (x - p * w) / w;
      // fibra lemnului: alungita pe verticala
      const grain = fbm(lx * 26 + p * 17, (y / N) * 10, { octaves: 4, period: 64, seed: 7 + p });
      const streak = Math.sin((lx * 9 + grain * 6) * Math.PI) * 0.5 + 0.5;
      const k = (grain - 0.5) * 46 + (streak - 0.5) * 16;
      const edge = smoothstep(0, 0.09, Math.min(lx, 1 - lx));
      d[i] = clamp(d[i] + k, 0, 255) * (0.55 + 0.45 * edge);
      d[i + 1] = clamp(d[i + 1] + k * 0.8, 0, 255) * (0.55 + 0.45 * edge);
      d[i + 2] = clamp(d[i + 2] + k * 0.6, 0, 255) * (0.55 + 0.45 * edge);
    }
  }
  ctx.putImageData(img, 0, 0);

  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = Math.floor(x / w), lx = (x - p * w) / w;
    const edge = smoothstep(0, 0.08, Math.min(lx, 1 - lx));
    height[y * N + x] = edge * 0.85 + fbm(lx * 24 + p * 5, (y / N) * 12, { octaves: 3, period: 48, seed: 9 }) * 0.15;
  }
  const nrm = heightToNormal(height, N, N, 2.4);
  return { map: toTex(c, { srgb: true }), normalMap: dataTex(new Uint8Array(nrm.buffer), N), roughness: 0.92 };
}

/* ============================== CARAMIDA ================================ */

export function brick(size = 512, rows = 8, tint = [128, 60, 44]) {
  const N = size;
  const c = canvas(N), ctx = c.getContext('2d');
  const rnd = makeRng(71);
  ctx.fillStyle = '#8e8a80';
  ctx.fillRect(0, 0, N, N);
  const h = N / rows, w = h * 2.3;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (w / 2);
    for (let b = -1; b < N / w + 1; b++) {
      const x = b * w + off, y = r * h;
      const j = (rnd() - 0.5) * 22;
      ctx.fillStyle = `rgb(${clamp(tint[0] + j, 0, 255) | 0},${clamp(tint[1] + j * 0.7, 0, 255) | 0},${clamp(tint[2] + j * 0.6, 0, 255) | 0})`;
      ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }
  }
  const img = ctx.getImageData(0, 0, N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const n = fbm((x / N) * 80, (y / N) * 80, { octaves: 4, period: 80, seed: 17 });
    const k = (n - 0.5) * 34;
    d[i] = clamp(d[i] + k, 0, 255); d[i + 1] = clamp(d[i + 1] + k, 0, 255); d[i + 2] = clamp(d[i + 2] + k, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.floor(y / h), off = (r % 2) * (w / 2);
    const fy = (y - r * h) / h;
    const bx = ((x - off) % w + w) % w / w;
    const e = Math.min(smoothstep(0, 0.06, fy) * smoothstep(0, 0.06, 1 - fy), smoothstep(0, 0.03, bx) * smoothstep(0, 0.03, 1 - bx));
    height[y * N + x] = e * 0.9 + fbm((x / N) * 60, (y / N) * 60, { octaves: 3, period: 60, seed: 21 }) * 0.1;
  }
  const nrm = heightToNormal(height, N, N, 2.6);
  return { map: toTex(c, { srgb: true }), normalMap: dataTex(new Uint8Array(nrm.buffer), N), roughness: 0.93 };
}

/* ======================= PIATRA APARENTA (SOCLU) ======================== */

export function stoneCladding(size = 512, cells = 5) {
  const N = size;
  const c = canvas(N), ctx = c.getContext('2d');
  const rnd = makeRng(97);
  ctx.fillStyle = '#403c37';
  ctx.fillRect(0, 0, N, N);
  const pts = [];
  for (let gy = 0; gy < cells; gy++) for (let gx = 0; gx < cells; gx++) {
    pts.push([(gx + 0.25 + rnd() * 0.5) * (N / cells), (gy + 0.25 + rnd() * 0.5) * (N / cells), 110 + rnd() * 60]);
  }
  const img = ctx.getImageData(0, 0, N, N), d = img.data;
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let best = 1e9, second = 1e9, bi = 0;
      for (let k = 0; k < pts.length; k++) {
        let dx = x - pts[k][0], dy = y - pts[k][1];
        if (dx > N / 2) dx -= N; if (dx < -N / 2) dx += N;
        if (dy > N / 2) dy -= N; if (dy < -N / 2) dy += N;
        const dd = dx * dx + dy * dy;
        if (dd < best) { second = best; best = dd; bi = k; }
        else if (dd < second) second = dd;
      }
      const edge = Math.sqrt(second) - Math.sqrt(best);
      const joint = smoothstep(2.0, 7.0, edge);
      const n = fbm((x / N) * 70, (y / N) * 70, { octaves: 4, period: 70, seed: 33 });
      const tone = pts[bi][2] + (n - 0.5) * 48;
      const i = (y * N + x) * 4;
      const col = lerp(58, tone, joint);
      d[i] = clamp(col * 1.02, 0, 255);
      d[i + 1] = clamp(col * 0.97, 0, 255);
      d[i + 2] = clamp(col * 0.9, 0, 255);
      d[i + 3] = 255;
      height[y * N + x] = smoothstep(1.5, 8, edge) * 0.9
        + fbm((x / N) * 64, (y / N) * 64, { octaves: 3, period: 64, seed: 5 }) * 0.1;
    }
  }
  ctx.putImageData(img, 0, 0);
  const nrm = heightToNormal(height, N, N, 3.2);
  return { map: toTex(c, { srgb: true }), normalMap: dataTex(new Uint8Array(nrm.buffer), N), roughness: 0.95 };
}

/* ============================== TENCUIALA =============================== */

export function stucco(size = 512, tint = [206, 200, 188]) {
  const N = size;
  const albedo = new Uint8Array(N * N * 4);
  const height = new Float32Array(N * N);
  const rnd = makeRng(113);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const n = fbm((x / N) * 140, (y / N) * 140, { octaves: 4, period: 140, seed: 3 });
    const big = fbm((x / N) * 9, (y / N) * 9, { octaves: 3, period: 9, seed: 61 });
    const stain = smoothstep(0.55, 0.95, fbm((x / N) * 4, (y / N) * 12, { octaves: 3, period: 12, seed: 29 })) * 26;
    const k = (n - 0.5) * 20 + (big - 0.5) * 16 - stain + (rnd() - 0.5) * 4;
    albedo[i * 4] = clamp(tint[0] + k, 0, 255);
    albedo[i * 4 + 1] = clamp(tint[1] + k, 0, 255);
    albedo[i * 4 + 2] = clamp(tint[2] + k * 1.05, 0, 255);
    albedo[i * 4 + 3] = 255;
    height[i] = n;
  }
  const nrm = heightToNormal(height, N, N, 1.2);
  return { map: dataTex(albedo, N, { srgb: true }), normalMap: dataTex(new Uint8Array(nrm.buffer), N), roughness: 0.94 };
}

/* ============================= TIGLA ACOPERIS =========================== */

export function roofTiles(size = 512, rows = 9, tint = [116, 52, 38]) {
  const N = size;
  const c = canvas(N), ctx = c.getContext('2d');
  const rnd = makeRng(131);
  ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  ctx.fillRect(0, 0, N, N);
  const h = N / rows, w = h * 1.15;
  for (let r = 0; r < rows; r++) {
    for (let b = -1; b < N / w + 1; b++) {
      const x = b * w + (r % 2) * (w * 0.5), y = r * h;
      const j = (rnd() - 0.5) * 26;
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, `rgb(${clamp(tint[0] + j - 30, 0, 255) | 0},${clamp(tint[1] + j - 18, 0, 255) | 0},${clamp(tint[2] + j - 14, 0, 255) | 0})`);
      g.addColorStop(0.45, `rgb(${clamp(tint[0] + j + 26, 0, 255) | 0},${clamp(tint[1] + j + 14, 0, 255) | 0},${clamp(tint[2] + j + 10, 0, 255) | 0})`);
      g.addColorStop(1, `rgb(${clamp(tint[0] + j - 38, 0, 255) | 0},${clamp(tint[1] + j - 24, 0, 255) | 0},${clamp(tint[2] + j - 18, 0, 255) | 0})`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y + 1, w - 1, h - 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y + h - 2.5, w, 2.5);
    }
  }
  const img = ctx.getImageData(0, 0, N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const moss = smoothstep(0.62, 0.9, fbm((x / N) * 14, (y / N) * 14, { octaves: 3, period: 14, seed: 47 }));
    d[i] = clamp(d[i] * (1 - moss * 0.45), 0, 255);
    d[i + 1] = clamp(d[i + 1] * (1 - moss * 0.15) + moss * 16, 0, 255);
    d[i + 2] = clamp(d[i + 2] * (1 - moss * 0.35) + moss * 8, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.floor(y / h), fy = (y - r * h) / h;
    const bx = (((x - (r % 2) * w * 0.5) % w) + w) % w / w;
    height[y * N + x] = Math.sin(bx * Math.PI) * 0.7 + (1 - fy) * 0.3;
  }
  const nrm = heightToNormal(height, N, N, 2.0);
  return { map: toTex(c, { srgb: true }), normalMap: dataTex(new Uint8Array(nrm.buffer), N), roughness: 0.9 };
}

/* ================================ IARBA ================================= */

export function groundGrass(size = 512) {
  const N = size;
  const albedo = new Uint8Array(N * N * 4);
  const height = new Float32Array(N * N);
  const rnd = makeRng(149);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const blade = fbm((x / N) * 180, (y / N) * 180, { octaves: 3, period: 180, seed: 2 });
    const clump = fbm((x / N) * 16, (y / N) * 16, { octaves: 4, period: 16, seed: 19 });
    const dirt = smoothstep(0.58, 0.85, fbm((x / N) * 7, (y / N) * 7, { octaves: 3, period: 7, seed: 83 }));
    const g = 44 + clump * 42 + blade * 26;
    albedo[i * 4] = clamp(lerp(g * 0.55, 96, dirt) + (rnd() - 0.5) * 10, 0, 255);
    albedo[i * 4 + 1] = clamp(lerp(g, 84, dirt) + (rnd() - 0.5) * 10, 0, 255);
    albedo[i * 4 + 2] = clamp(lerp(g * 0.42, 66, dirt), 0, 255);
    albedo[i * 4 + 3] = 255;
    height[i] = blade * 0.6 + clump * 0.4;
  }
  const nrm = heightToNormal(height, N, N, 1.8);
  return { map: dataTex(albedo, N, { srgb: true }), normalMap: dataTex(new Uint8Array(nrm.buffer), N), roughness: 0.97 };
}

/* ====================== ALPHA: FRUNZE / FIRE DE IARBA =================== */

export function leafCluster(size = 256, tint = [46, 74, 34]) {
  const N = size;
  const c = canvas(N), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, N, N);
  const rnd = makeRng(167);
  // multe frunze MICI: asa nu se mai vede placa dreptunghiulara
  for (let i = 0; i < 900; i++) {
    const a0 = rnd() * Math.PI * 2;
    const rr = Math.pow(rnd(), 0.62) * N * 0.46;
    const cx = N * 0.5 + Math.cos(a0) * rr;
    const cy = N * 0.5 + Math.sin(a0) * rr;
    const r = N * (0.012 + rnd() * 0.026);
    const shade = 0.42 + rnd() * 0.52;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rnd() * Math.PI);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (0.42 + rnd() * 0.35), r * 1.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${(tint[0] * shade) | 0},${(tint[1] * shade) | 0},${(tint[2] * shade) | 0},1)`;
    ctx.fill();
    ctx.restore();
  }
  // goluri: coroana trebuie sa lase cerul sa treaca printre frunze
  const img = ctx.getImageData(0, 0, N, N), d = img.data;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const dx = (x / N - 0.5) * 2, dy = (y / N - 0.5) * 2;
      const fall = smoothstep(1.02, 0.24, Math.hypot(dx, dy));
      const holes = fbm((x / N) * 13, (y / N) * 13, { octaves: 3, period: 13, seed: 151 });
      const k = fall * smoothstep(0.20, 0.52, holes);
      d[i + 3] = d[i + 3] * (k > 0.38 ? 1 : 0);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}

export function grassBlades(size = 128) {
  const N = size;
  const c = canvas(N), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, N, N);
  const rnd = makeRng(181);
  for (let i = 0; i < 22; i++) {
    const x0 = rnd() * N;
    const w = 1.4 + rnd() * 2.6;
    const hgt = N * (0.45 + rnd() * 0.5);
    const bend = (rnd() - 0.5) * N * 0.3;
    const g = 40 + rnd() * 50;
    ctx.beginPath();
    ctx.moveTo(x0 - w / 2, N);
    ctx.quadraticCurveTo(x0 + bend * 0.5, N - hgt * 0.6, x0 + bend, N - hgt);
    ctx.quadraticCurveTo(x0 + bend * 0.5 + w, N - hgt * 0.6, x0 + w / 2, N);
    ctx.closePath();
    ctx.fillStyle = `rgba(${(g * 0.6) | 0},${g | 0},${(g * 0.42) | 0},1)`;
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ====================== SPRITE-URI: FLARE / HALO / POOL ================= */

export function flare(size = 512) {
  const N = size;
  const c = canvas(N), ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, N, N);
  ctx.globalCompositeOperation = 'lighter';
  const cx = N / 2, cy = N / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, N * 0.5);
  g.addColorStop(0, 'rgba(255,248,226,1)');
  g.addColorStop(0.05, 'rgba(255,238,198,0.85)');
  g.addColorStop(0.16, 'rgba(255,226,168,0.33)');
  g.addColorStop(0.42, 'rgba(255,214,150,0.09)');
  g.addColorStop(1, 'rgba(255,200,130,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, N, N);
  // raze de difractie (ca la camerele de telefon din poze)
  const rays = [0, 90, 32, 148, 62, 118];
  for (let i = 0; i < rays.length; i++) {
    const ang = (rays[i] * Math.PI) / 180;
    const len = N * (i < 2 ? 0.48 : 0.33);
    const wid = i < 2 ? N * 0.012 : N * 0.006;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const lg = ctx.createLinearGradient(-len, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,230,180,0)');
    lg.addColorStop(0.5, 'rgba(255,240,206,0.55)');
    lg.addColorStop(1, 'rgba(255,230,180,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(-len, 0); ctx.lineTo(0, -wid); ctx.lineTo(len, 0); ctx.lineTo(0, wid);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function radialGlow(size = 256, power = 2.2) {
  const N = size;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1;
    const r = Math.min(1, Math.hypot(dx, dy));
    const v = Math.pow(1 - r, power);
    data[i] = 255; data[i + 1] = 245; data[i + 2] = 225;
    data[i + 3] = clamp(v * 255, 0, 255);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Balta de lumina proiectata pe carosabil pentru lampile indepartate. */
export function lightPool(size = 256) {
  const N = size;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const dx = ((x + 0.5) / N * 2 - 1) * 1.35;   // eliptic: intins pe lungimea strazii
    const dy = (y + 0.5) / N * 2 - 1;
    const r = Math.min(1, Math.hypot(dx, dy));
    let v = Math.pow(Math.max(0, 1 - r), 2.4);
    v += Math.pow(Math.max(0, 1 - r * 2.4), 5) * 0.55;
    const n = fbm((x / N) * 20, (y / N) * 20, { octaves: 3, period: 20, seed: 4 });
    v *= 0.85 + n * 0.3;
    data[i] = 255; data[i + 1] = 236; data[i + 2] = 206;
    data[i + 3] = clamp(v * 255, 0, 255);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}

/* ============================ GEAM / FERESTRE =========================== */

export function windowGlass(size = 256, lit = false) {
  const N = size;
  const c = canvas(N), ctx = c.getContext('2d');
  if (lit) {
    const g = ctx.createLinearGradient(0, 0, 0, N);
    g.addColorStop(0, '#ffd9a0');
    g.addColorStop(0.55, '#f7c489');
    g.addColorStop(1, '#c98c4e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, N, N);
    // silueta de perdea/mobilier
    ctx.fillStyle = 'rgba(60,34,12,0.45)';
    ctx.fillRect(0, N * 0.62, N, N * 0.38);
    ctx.fillStyle = 'rgba(255,240,210,0.35)';
    ctx.fillRect(N * 0.06, N * 0.08, N * 0.3, N * 0.5);
  } else {
    const g = ctx.createLinearGradient(0, 0, N * 0.3, N);
    g.addColorStop(0, '#11151c');
    g.addColorStop(0.5, '#0a0d12');
    g.addColorStop(1, '#151a22');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, N, N);
    ctx.strokeStyle = 'rgba(120,140,170,0.13)';
    ctx.lineWidth = N * 0.02;
    for (let i = -2; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * N * 0.4, 0);
      ctx.lineTo(i * N * 0.4 + N * 0.5, N);
      ctx.stroke();
    }
  }
  // cercevele
  ctx.strokeStyle = lit ? 'rgba(40,24,10,0.85)' : 'rgba(28,30,34,0.95)';
  ctx.lineWidth = N * 0.05;
  ctx.strokeRect(0, 0, N, N);
  ctx.beginPath();
  ctx.moveTo(N / 2, 0); ctx.lineTo(N / 2, N);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}

/* ============================ MARCAJ RUTIER ============================= */

export function roadPaint(size = 256) {
  const N = size;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const wear = fbm((x / N) * 26, (y / N) * 26, { octaves: 4, period: 26, seed: 57 });
    const scuff = smoothstep(0.45, 0.8, fbm((x / N) * 8, (y / N) * 60, { octaves: 3, period: 60, seed: 71 }));
    const v = clamp(198 + (wear - 0.5) * 70 - scuff * 60, 60, 255);
    data[i] = v; data[i + 1] = v * 0.99; data[i + 2] = v * 0.94; data[i + 3] = 255;
  }
  return dataTex(data, N, { srgb: true });
}

/* =============================== CER ==================================== */

/** Gradient de cer + stele, ca textura echirectangulara pentru fundal. */
export function nightSky(w = 1024, h = 512) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.0, '#01020a');
  g.addColorStop(0.42, '#04060f');
  g.addColorStop(0.62, '#0a0d1a');
  g.addColorStop(0.78, '#141425');   // poluare luminoasa spre orizont
  g.addColorStop(1.0, '#1d1a24');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rnd = makeRng(211);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w;
    const y = Math.pow(rnd(), 1.5) * h * 0.72;
    const r = rnd() * 1.1 + 0.25;
    const a = (1 - y / (h * 0.72)) * (0.25 + rnd() * 0.75) * 0.8;
    const tint = rnd();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${200 + tint * 55 | 0},${210 + tint * 45 | 0},255,${a.toFixed(3)})`;
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ============================== ORCHESTRARE ============================= */

export async function buildAll(onProgress = () => {}, quality = 'high') {
  const S = quality === 'mobil' ? 224 : quality === 'low' ? 256 : quality === 'medium' ? 384 : 512;
  const ROAD = quality === 'mobil' ? 448 : quality === 'low' ? 512 : quality === 'medium' ? 768 : 1024;
  const T = {};
  const steps = [
    ['asfalt', () => { T.asphalt = asphalt(ROAD); }],
    ['beton', () => { T.concrete = concrete(S); T.kerb = concrete(S, [150, 148, 142], 0.9); }],
    ['trotuar', () => { T.pavers = pavers(S, 4); }],
    ['lemn', () => { T.wood = woodFence(S, 9); T.woodDark = woodFence(S, 7); }],
    ['caramida', () => { T.brick = brick(S, 9); T.brickPillar = brick(S, 7, [142, 72, 52]); }],
    ['piatra', () => { T.stone = stoneCladding(S, 7); }],
    ['tencuiala', () => { T.stucco = stucco(S); T.stuccoWarm = stucco(S, [196, 176, 150]); T.stuccoWhite = stucco(S, [222, 220, 214]); }],
    ['tigla', () => { T.roof = roofTiles(S, 10); T.roofDark = roofTiles(S, 10, [60, 58, 62]); }],
    ['iarba', () => { T.grass = groundGrass(S); T.leaf = leafCluster(256); T.leafDark = leafCluster(256, [26, 46, 28]); T.leafLight = leafCluster(256, [74, 96, 52]); T.blades = grassBlades(128); }],
    ['lumini', () => { T.flare = flare(512); T.glow = radialGlow(256); T.pool = lightPool(256); }],
    ['detalii', () => { T.windowOff = windowGlass(256, false); T.windowOn = windowGlass(256, true); T.paint = roadPaint(256); T.sky = nightSky(); }],
  ];
  for (let i = 0; i < steps.length; i++) {
    onProgress(i / steps.length, steps[i][0]);
    await yieldFrame();
    steps[i][1]();
  }
  onProgress(1, 'gata');
  return T;
}
